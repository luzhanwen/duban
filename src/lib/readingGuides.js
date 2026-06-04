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

export async function generateReadingGuide({ book, item, itemKey, chapterSections }) {
  const settings = await getSettings();
  const chapterText = chapterSections
    .map(
      (section) =>
        `【${section.chapter.title}】\n页码：${section.chapter.startPage}-${section.chapter.endPage}\n${section.text}`
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_CONTEXT_CHARS);
  const prompts = buildPrompt({ book, item, chapterText });

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

function buildPrompt({ book, item, chapterText }) {
  const purpose = book.readingProfile?.purpose || "study";
  const pace = book.readingProfile?.pace || "standard";
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
    chapterText,
  });
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
  return match ? cleanupJsonishText(match[1]) : "";
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

function cleanupJsonishText(value) {
  return toText(value)
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
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
