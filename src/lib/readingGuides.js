import { callModelDetailed } from "./ai.js";
import { buildReadingGuidePrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { getItem, getSettings, KEYS, setItem } from "./storage.js";
import { toText } from "./text.js";

const MAX_CONTEXT_CHARS = 12000;
const JUNK_FRAGMENTS = new Set(["与", "和", "及", "或", "留意", "注意", "思考", "理解"]);

export function getPlanItemKey(item, index = 0) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

export async function getReadingGuide(bookId, itemKey) {
  if (!itemKey) return null;
  const saved = await getItem(KEYS.bookQuestions(bookId, itemKey), null);
  return normalizeGuide(saved);
}

export async function saveReadingGuide(bookId, itemKey, guide) {
  return setItem(KEYS.bookQuestions(bookId, itemKey), guide);
}

export async function generateReadingGuide({
  book,
  item,
  itemKey,
  chapterSections,
  currentIndex = 0,
  planItems = [],
}) {
  const settings = await getSettings();
  const chapterText = chapterSections
    .map(
      (section) =>
        `【${section.chapter.title}】\n页码：${section.chapter.startPage}-${section.chapter.endPage}\n${section.text}`
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_CONTEXT_CHARS);
  const prompts = buildPrompt({ book, item, chapterText, currentIndex, planItems });

  const result = await callModelDetailed({
    settings,
    maxTokens: 1800,
    system: prompts.system,
    messages: [
      {
        role: "user",
        content: prompts.user,
      },
    ],
  });

  const parsed = parseGuide(result.text);
  const guide = {
    ...parsed,
    raw: result.text,
    itemKey,
    provider: settings.provider,
    model: result.model || getActiveModel(settings),
    usage: result.usage,
    cost: estimateGuideCost(settings, result),
    generatedAt: new Date().toISOString(),
  };

  await saveReadingGuide(book.id, itemKey, guide);
  return guide;
}

function getActiveModel(settings) {
  if (settings.provider === "openai-compatible") {
    return settings.openaiCompatible?.model || "";
  }
  return settings.anthropic?.model || "";
}

function estimateGuideCost(settings, result) {
  if (settings.provider === "openai-compatible") {
    return estimateCustomCost(settings.openaiCompatible || {}, result.usage);
  }
  return estimateClaudeCost(result.model || settings.anthropic?.model, result.usage);
}

function buildPrompt({ book, item, chapterText, currentIndex, planItems }) {
  const purpose =
    book.readingProfile?.purpose ||
    book.readingProfile?.companionFocus?.label ||
    "study";
  const pace = formatReadingPace(book.readingProfile?.pace);
  const continuity = buildGuideContinuity({ item, currentIndex, planItems });
  return buildReadingGuidePrompts({
    bookTitle: toText(book.title),
    bookAuthor: toText(book.author) || "未知",
    purpose,
    pace,
    day: item.day,
    itemTitle: item.title,
    itemType: item.type === "guide" ? "开始前准备/导读" : "正文章节",
    startPage: item.startPage,
    endPage: item.endPage,
    readingPosition: continuity.position,
    previousItemTitle: continuity.previousTitle,
    nextItemTitle: continuity.nextTitle,
    continuityStrategy: continuity.strategy,
    chapterText,
  });
}

function formatReadingPace(pace) {
  if (!pace) return "standard";
  if (typeof pace === "string") return pace;
  if (typeof pace === "object") {
    const mode = pace.mode || "standard";
    const minutes = pace.minutesPerSession ? `，每次约 ${pace.minutesPerSession} 分钟` : "";
    const days = pace.sessionsPerWeek ? `，每周 ${pace.sessionsPerWeek} 天` : "";
    const split = pace.splitLongChapters ? "，长章节可拆分" : "";
    return `${mode}${minutes}${days}${split}`;
  }
  return "standard";
}

function buildGuideContinuity({ item, currentIndex, planItems }) {
  const items = Array.isArray(planItems) ? planItems : [];
  const safeIndex = Number.isFinite(currentIndex) ? currentIndex : Math.max(0, (item?.day || 1) - 1);
  const total = items.length || Math.max(item?.day || 1, safeIndex + 1);
  const previous = safeIndex > 0 ? items[safeIndex - 1] : null;
  const next = safeIndex < items.length - 1 ? items[safeIndex + 1] : null;
  const position = `第 ${safeIndex + 1} / ${total} 个阅读项`;
  const previousTitle = previous ? toText(previous.title) : "无，这是本轮阅读的第一项";
  const nextTitle = next ? toText(next.title) : "无，当前项可能是最后一项";
  const firstItem = safeIndex === 0;

  return {
    position,
    previousTitle,
    nextTitle,
    strategy: firstItem
      ? "这是第一项导读：可以先建立整本书坐标，再进入当前阅读项。overview 建议使用“先看整本书”和“今天这章的位置”两个主体标题，中间用一行 --- 分隔。"
      : `这是连续阅读中的后续导读：必须承上启下，先接住上一项「${previousTitle}」留下的问题、概念或叙事推进，再说明今天这一项如何继续推进。overview 不要再使用“先看整本书”这类像重新开书的标题，建议使用“接上一次阅读”和“今天往哪里推进”两个主体标题，中间用一行 --- 分隔。不要在 overview 里写“带着什么问题读”小节。`,
  };
}

function parseGuide(raw) {
  const jsonText = extractJson(raw);
  try {
    const parsed = JSON.parse(jsonText);
    return normalizeGuide(parsed);
  } catch {
    const repaired = parseGuideFields(jsonText);
    if (hasGuideContent(repaired)) return repaired;

    return {
      overview: "",
      goals: [],
      concepts: [],
      questions: [],
      focus: [],
      notes: raw,
    };
  }
}

function normalizeGuide(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return parseGuide(value);
  }

  const repairedFromRaw =
    value.raw && looksLikeJson(value.raw) ? parseGuideFields(extractJson(value.raw)) : null;
  const repairedFromNotes =
    value.notes && looksLikeJson(value.notes) ? parseGuideFields(extractJson(value.notes)) : null;
  const repaired = hasGuideContent(repairedFromRaw) ? repairedFromRaw : repairedFromNotes;

  return {
    ...value,
    overview: toText(repaired?.overview || value.overview),
    goals: chooseGuideList(value.goals, repaired?.goals),
    concepts: chooseGuideList(value.concepts, repaired?.concepts),
    questions: chooseGuideList(value.questions, repaired?.questions),
    focus: chooseGuideList(value.focus, repaired?.focus),
    notes: hasGuideContent(repaired) ? "" : value.notes,
  };
}

function parseGuideFields(text) {
  return {
    overview: extractStringField(text, "overview"),
    goals: extractArrayField(text, "goals"),
    concepts: extractArrayField(text, "concepts"),
    questions: extractArrayField(text, "questions"),
    focus: extractArrayField(text, "focus"),
  };
}

function extractStringField(text, field) {
  const match = text.match(new RegExp(`["']${field}["']\\s*:\\s*["']([\\s\\S]*?)["']\\s*,?\\s*(?=["'](?:goals|concepts|questions|focus)["']|})`));
  return match ? cleanupJsonishText(match[1], { preserveLineBreaks: field === "overview" }) : "";
}

function extractArrayField(text, field) {
  const match = text.match(new RegExp(`["']${field}["']\\s*:\\s*\\[([\\s\\S]*?)\\]\\s*,?\\s*(?=["'](?:overview|goals|concepts|questions|focus)["']|})`));
  if (!match) return [];

  return sanitizeList(parseArrayItems(match[1]));
}

function parseArrayItems(body) {
  const lines = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines
      .map((line) => line.replace(/,$/, "").trim())
      .map((line) => stripOuterQuote(line))
      .map(cleanupJsonishText)
      .filter(Boolean);
  }

  return body
    .split(/["']\s*,\s*["']/)
    .map((item) => stripOuterQuote(item.replace(/,$/, "").trim()))
    .map(cleanupJsonishText)
    .filter(Boolean);
}

function stripOuterQuote(value) {
  let text = value.trim();
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  } else if (text.startsWith("\"") || text.startsWith("'")) {
    text = text.slice(1);
  } else if (text.endsWith("\"") || text.endsWith("'")) {
    text = text.slice(0, -1);
  }
  return text;
}

function cleanupJsonishText(value, { preserveLineBreaks = false } = {}) {
  const text = toText(value)
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n");

  if (preserveLineBreaks) {
    return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  return text.replace(/\s+/g, " ").trim();
}

function hasGuideContent(guide) {
  return Boolean(
    guide &&
      (guide.overview ||
        guide.goals?.length ||
        guide.concepts?.length ||
        guide.questions?.length ||
        guide.focus?.length)
  );
}

function looksLikeJson(value) {
  const text = toText(value).trim();
  return text.startsWith("{") || text.includes("\"overview\"") || text.includes("'overview'");
}

function chooseGuideList(existing, repaired) {
  const repairedList = sanitizeList(toList(repaired));
  const existingList = sanitizeList(toList(existing));

  if (repairedList.length > 0 && hasSuspiciousFragments(existingList)) {
    return repairedList;
  }

  return existingList.length > 0 ? existingList : repairedList;
}

function sanitizeList(items) {
  return toList(items).filter((item) => !isJunkFragment(item));
}

function hasSuspiciousFragments(items) {
  return items.some(isJunkFragment);
}

function isJunkFragment(item) {
  const text = cleanupJsonishText(item);
  return JUNK_FRAGMENTS.has(text);
}

function extractJson(raw) {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(toText).filter(Boolean);
  return [toText(value)].filter(Boolean);
}
