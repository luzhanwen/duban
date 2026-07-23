import { callModelDetailed } from "./ai.js";
import { buildReadingGuidePrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { buildCompanionContext } from "./companionContext.js";
import {
  callReadingGuideWithRecovery,
  isAiInputTooLong,
} from "./readingGuideReliability.js";
import { getItem, getSettings, KEYS, setItem } from "./storage.js";
import { toText } from "./text.js";
import { applyGeneratedTextPreferences } from "./generatedTextPreferences.js";
import { recordAiCacheDiagnostic } from "./aiDiagnostics.js";

const JUNK_FRAGMENTS = new Set(["与", "和", "及", "或", "留意", "注意", "思考", "理解"]);
const READING_GUIDE_STYLE_VERSION = 3;

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
  force = false,
  signal,
}) {
  const settings = await getSettings();
  const continuity = buildGuideContinuity({ item, currentIndex, planItems });
  const contextArgs = {
    book,
    item,
    itemKey,
    chapterSections,
    settings,
    cacheIdentity: continuity,
    memoryScope: {
      previousItemKey: continuity.previousItemKey,
      priorItemKeys: continuity.priorItemKeys,
    },
  };
  const context = buildCompanionContext({
    scene: "readingGuide",
    ...contextArgs,
  });
  const cachedGuide = force ? null : await getReadingGuide(book.id, itemKey);
  const cachedSourceKey =
    cachedGuide?.contextTrace?.sourceContextCacheKey || cachedGuide?.contextTrace?.cacheKey;
  if (cachedSourceKey === context.trace.cacheKey) {
    const cachedResult = {
      ...cachedGuide,
      contextTrace: {
        ...cachedGuide.contextTrace,
        cache: { hit: true, kind: "guide-artifact" },
      },
    };
    await recordAiCacheDiagnostic({
      taskType: "readingGuide",
      settings,
      diagnosticContext: {
        scene: context.scene,
        policy: context.policy,
        trace: cachedResult.contextTrace,
      },
    }).catch(() => null);
    return cachedResult;
  }
  const prompts = buildPrompt({ book, item, context, continuity });

  try {
    const generation = await callReadingGuideWithRecovery({
      settings,
      prompts,
      maxOutputTokens: context.maxOutputTokens,
      compactOutputInstruction: context.guideCompactOutputRequirement,
      signal,
      callModel: callModelDetailed,
      parseGuide,
      hasGuideContent,
      diagnosticContext: {
        scene: context.scene,
        policy: context.policy,
        trace: context.trace,
      },
    });
    return saveGeneratedGuide({
      book,
      itemKey,
      settings,
      generation,
      context,
      sourceContextCacheKey: context.trace.cacheKey,
    });
  } catch (error) {
    if (!isAiInputTooLong(error)) throw error;
  }

  const compactContext = buildCompanionContext({
    scene: "readingGuide",
    ...contextArgs,
    contextCompression: "compact",
  });
  const compactPrompts = buildPrompt({ book, item, context: compactContext, continuity });
  const generation = await callReadingGuideWithRecovery({
    settings,
    prompts: compactPrompts,
    maxOutputTokens: compactContext.maxOutputTokens,
    compactOutputInstruction: compactContext.guideCompactOutputRequirement,
    signal,
    callModel: callModelDetailed,
    parseGuide,
    hasGuideContent,
    diagnosticContext: {
      scene: compactContext.scene,
      policy: compactContext.policy,
      trace: compactContext.trace,
    },
  });
  return saveGeneratedGuide({
    book,
    itemKey,
    settings,
    generation,
    context: compactContext,
    sourceContextCacheKey: context.trace.cacheKey,
    inputRecoveryAttempts: 1,
  });
}

async function saveGeneratedGuide({
  book,
  itemKey,
  settings,
  generation,
  context,
  sourceContextCacheKey,
  inputRecoveryAttempts = 0,
}) {
  const { result, parsed } = generation;
  const generationUsage = combineGuideUsage(generation.results);
  const guide = {
    ...parsed,
    raw: result.text,
    styleVersion: READING_GUIDE_STYLE_VERSION,
    itemKey,
    provider: settings.provider,
    model: result.model || getActiveModel(settings),
    finishReason: result.finishReason || "",
    truncated: false,
    usage: generationUsage,
    cost: estimateGuideCost(settings, { ...result, usage: generationUsage }),
    contextTrace: {
      ...context.trace,
      sourceContextCacheKey,
      inputCompression: {
        ...context.trace.inputCompression,
        recoveredFromInputLimit: inputRecoveryAttempts > 0,
      },
    },
    generationAttempts: generation.attempts + inputRecoveryAttempts,
    recoveredFrom:
      generation.recoveredFrom || (inputRecoveryAttempts > 0 ? "input_too_long" : ""),
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
  const costSettings = result.settingsUsed || settings;
  if (costSettings.provider === "openai-compatible") {
    return estimateCustomCost(costSettings.openaiCompatible || {}, result.usage);
  }
  return estimateClaudeCost(result.model || costSettings.anthropic?.model, result.usage);
}

function combineGuideUsage(results) {
  const combined = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let hasUsage = false;
  for (const result of Array.isArray(results) ? results : []) {
    const usage = result?.usage;
    if (!usage) continue;
    hasUsage = true;
    combined.input_tokens += Number(usage.input_tokens ?? usage.prompt_tokens) || 0;
    combined.output_tokens += Number(usage.output_tokens ?? usage.completion_tokens) || 0;
    combined.cache_creation_input_tokens += Number(usage.cache_creation_input_tokens) || 0;
    combined.cache_read_input_tokens += Number(usage.cache_read_input_tokens) || 0;
  }
  return hasUsage ? combined : null;
}

function buildPrompt({ book, item, context, continuity }) {
  const purpose =
    book.readingProfile?.purpose ||
    book.readingProfile?.companionFocus?.label ||
    "study";
  const pace = formatReadingPace(book.readingProfile?.pace);
  return {
    ...buildReadingGuidePrompts({
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
    ...context.contractPromptValues,
    contextBudgetInstruction: context.contextBudgetInstruction,
    guideOverviewRequirement: context.guideOverviewRequirement,
    chapterText: context.sections.chapterText,
    }),
    companionPolicy: context.policy,
  };
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
    previousItemKey: previous ? getPlanItemKey(previous, safeIndex - 1) : "",
    priorItemKeys: items
      .slice(0, safeIndex)
      .map((planItem, index) => getPlanItemKey(planItem, index)),
    strategy: firstItem
      ? "这是第一项导读：先用几句话说明这本书在讲什么，再用一个具体冲突、反常之处或现实后果说明当前内容为什么值得读。overview 使用“先看这本书”和“今天为什么值得读”两个主体标题，中间用一行 --- 分隔。"
      : `这是连续阅读中的后续导读：用 1 句话说明上一项「${previousTitle}」讲到的具体事件、观点或结果，再用一个具体冲突、反常之处或现实后果说明今天为什么值得继续读。overview 使用“接上一次阅读”和“今天为什么值得读”两个主体标题，中间用一行 --- 分隔；读前问题只放在 questions 数组里。`,
  };
}

function parseGuide(raw) {
  const jsonText = extractJson(raw);
  try {
    const parsed = JSON.parse(jsonText);
    return normalizeGuide({ ...parsed, styleVersion: READING_GUIDE_STYLE_VERSION });
  } catch {
    const repaired = parseGuideFields(jsonText);
    if (hasGuideContent(repaired)) {
      return normalizeGuide({ ...repaired, styleVersion: READING_GUIDE_STYLE_VERSION });
    }

    return normalizeGuide(buildEmptyGuide(raw));
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
    overview: applyGeneratedTextPreferences(toText(repaired?.overview || value.overview)),
    goals: chooseGuideList(value.goals, repaired?.goals),
    concepts: chooseGuideList(value.concepts, repaired?.concepts),
    questions: chooseGuideList(value.questions, repaired?.questions),
    focus: chooseGuideList(value.focus, repaired?.focus),
    notes: hasGuideContent(repaired) ? "" : value.notes,
  };
}

function buildEmptyGuide(raw) {
  return {
    overview: "",
    goals: [],
    concepts: [],
    questions: [],
    focus: [],
    notes: raw,
    styleVersion: READING_GUIDE_STYLE_VERSION,
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
  return toList(items)
    .map(applyGeneratedTextPreferences)
    .filter((item) => !isJunkFragment(item));
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
