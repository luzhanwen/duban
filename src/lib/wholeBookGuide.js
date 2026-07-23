import { callModelDetailed } from "./ai.js";
import { isAiOutputTruncated } from "./aiCompletion.js";
import { updateBook } from "./books.js";
import { isChapterIncluded } from "./chapterRoles.js";
import { buildWholeBookGuidePrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { getSettings } from "./storage.js";
import { toText } from "./text.js";

const MAX_GUIDE_CHAPTER_CHARS = 7000;
const MAX_SAMPLE_TEXT_CHARS = 16000;
const SAMPLE_CHARS_PER_CHAPTER = 1800;
const WHOLE_BOOK_GUIDE_MAX_TOKENS = 6500;
const WHOLE_BOOK_GUIDE_STYLE_VERSION = 2;

export async function generateWholeBookGuide({ book, pages, userIntent = "", signal }) {
  const settings = await getSettings();
  const prompts = buildWholeBookGuidePrompts({
    bookTitle: toText(book.title),
    bookAuthor: toText(book.author) || "未知",
    totalPages: book.totalPages || "未知",
    chapterList: buildChapterList(book.chapters || []),
    guideChapterText: buildGuideChapterText(book.chapters || [], pages || []),
    sampleText: buildSampleText(book.chapters || [], pages || []),
    userIntent: toText(userIntent).trim() || "用户还没有明确补充阅读意图。",
  });

  const result = await callModelDetailed({
    settings,
    maxTokens: WHOLE_BOOK_GUIDE_MAX_TOKENS,
    system: prompts.system,
    messages: [
      {
        role: "user",
        content: prompts.user,
      },
    ],
    signal,
    taskType: "wholeBookGuide",
  });

  let parsed;
  try {
    if (isAiOutputTruncated(result)) {
      throw new Error("模型输出达到上限后被截断，JSON 没有完整返回。");
    }
    parsed = parseWholeBookGuide(result.text);
  } catch (error) {
    const failedGuide = buildFailedWholeBookGuide({ book, settings, result, error });
    await updateBook(book.id, { wholeBookGuide: failedGuide });
    throw new Error(failedGuide.errorMessage);
  }

  const guide = {
    ...parsed,
    raw: result.text,
    schemaVersion: 1,
    styleVersion: WHOLE_BOOK_GUIDE_STYLE_VERSION,
    status: "ready",
    provider: settings.provider,
    model: result.model || getActiveModel(settings),
    finishReason: result.finishReason || "",
    truncated: false,
    usage: result.usage,
    cost: estimateWholeBookGuideCost(settings, result),
    generatedAt: new Date().toISOString(),
    source: {
      strategy: "chapters_and_samples",
      chapterCount: Array.isArray(book.chapters) ? book.chapters.length : 0,
      note: "用章节列表、导读章节和正文抽样生成，不默认塞入整本书全文。",
    },
  };

  await updateBook(book.id, { wholeBookGuide: guide });
  return guide;
}

export function normalizeWholeBookGuide(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return parseWholeBookGuide(value);
    } catch (error) {
      return buildStoredFailedGuide(value, error);
    }
  }

  const rawOverview = toText(value.overview);
  const rawFullOverview = toText(value.fullOverview);
  const fullOverview = rawFullOverview || (isLongOverview(rawOverview) ? rawOverview : "");
  const overview = rawFullOverview ? rawOverview : makeOverviewPreview(rawOverview);

  const normalized = {
    ...value,
    status: value.status || "ready",
    overview,
    fullOverview,
    bookProblem: toText(value.bookProblem),
    coreQuestion: toText(value.coreQuestion),
    structureMap: normalizeObjectList(value.structureMap),
    keyTurns: normalizeObjectList(value.keyTurns),
    difficultyMap: normalizeObjectList(value.difficultyMap),
    suggestedReadingPaths: normalizeObjectList(value.suggestedReadingPaths),
    companionFocusOptions: normalizeFocusOptions(value.companionFocusOptions),
    planAdvice: normalizePlanAdvice(value.planAdvice),
    sourceLimitations: toText(value.sourceLimitations),
    errorMessage: toText(value.errorMessage),
  };

  if (looksLikeLegacyParseFailure(normalized)) {
    return {
      ...normalized,
      status: "failed",
      errorMessage:
        normalized.errorMessage || "上次整本书导读解析失败，请重新分析这本书。",
    };
  }

  return normalized;
}

function buildChapterList(chapters) {
  const lines = chapters.map((chapter, index) => {
    const role = chapter.role || "main";
    const pageRange = `${chapter.startPage || "?"}-${chapter.endPage || "?"}`;
    return `${index + 1}. 【${role}】${toText(chapter.title) || "未命名章节"}（第 ${pageRange} 页）`;
  });
  return lines.length > 0 ? lines.join("\n") : "未识别到章节结构。";
}

function buildGuideChapterText(chapters, pages) {
  const includedChapters = chapters.filter(isChapterIncluded);
  const guideChapters = includedChapters.filter((chapter) => chapter.role === "guide");
  const selected =
    guideChapters.length > 0 ? guideChapters : includedChapters.slice(0, 2);

  return selected
    .map((chapter) => buildChapterTextBlock(chapter, pages, MAX_GUIDE_CHAPTER_CHARS))
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, MAX_GUIDE_CHAPTER_CHARS);
}

function buildSampleText(chapters, pages) {
  const includedChapters = chapters.filter(isChapterIncluded);
  const mainChapters = includedChapters.filter((chapter) => chapter.role !== "guide");
  const sourceChapters = mainChapters.length > 0 ? mainChapters : includedChapters;
  if (sourceChapters.length === 0) return "暂无正文抽样文本。";

  const selected = pickSampleChapters(sourceChapters);
  return selected
    .map((chapter) => buildChapterTextBlock(chapter, pages, SAMPLE_CHARS_PER_CHAPTER))
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, MAX_SAMPLE_TEXT_CHARS);
}

function pickSampleChapters(chapters) {
  if (chapters.length <= 6) return chapters;

  const indexes = new Set([
    0,
    1,
    Math.floor(chapters.length / 2) - 1,
    Math.floor(chapters.length / 2),
    chapters.length - 2,
    chapters.length - 1,
  ]);

  return [...indexes]
    .filter((index) => index >= 0 && index < chapters.length)
    .sort((a, b) => a - b)
    .map((index) => chapters[index]);
}

function buildChapterTextBlock(chapter, pages, maxChars) {
  const text = pages
    .filter(
      (page) =>
        Number(page.pageNumber) >= Number(chapter.startPage) &&
        Number(page.pageNumber) <= Number(chapter.endPage)
    )
    .map((page) => toText(page.text).trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars);

  if (!text) return "";
  return `【${toText(chapter.title) || "未命名章节"}】\n页码：${chapter.startPage}-${chapter.endPage}\n${text}`;
}

function parseWholeBookGuide(raw) {
  const jsonText = extractJson(raw);
  return normalizeWholeBookGuide(
    {
      ...parseJsonWithRepair(jsonText),
      styleVersion: WHOLE_BOOK_GUIDE_STYLE_VERSION,
    }
  );
}

function extractJson(text) {
  const value = toText(text).trim();
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) return value.slice(start, end + 1);
  return value;
}

function normalizeObjectList(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function parseJsonWithRepair(jsonText) {
  const candidates = [jsonText, escapeLiteralNewlinesInStrings(jsonText)];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "模型返回内容格式异常。");
}

function escapeLiteralNewlinesInStrings(text) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (!inString) {
      if (char === "\"") inString = true;
      output += char;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = false;
      output += char;
      continue;
    }

    if (char === "\n") {
      output += "\\n";
      continue;
    }

    if (char === "\r") {
      output += "\\r";
      continue;
    }

    if (char === "\t") {
      output += "\\t";
      continue;
    }

    output += char;
  }

  return output;
}

function buildFailedWholeBookGuide({ book, settings, result, error }) {
  const truncated = isAiOutputTruncated(result);
  const errorMessage = truncated
    ? "这次整本书导读写得太长，被模型输出上限截断了。已经保留诊断信息，请重新分析这本书。"
    : "模型返回的整本书导读格式异常，已经保留诊断信息，请重新分析这本书。";

  return {
    ...emptyWholeBookGuideFields(),
    raw: result.text,
    schemaVersion: 1,
    styleVersion: WHOLE_BOOK_GUIDE_STYLE_VERSION,
    status: "failed",
    provider: settings.provider,
    model: result.model || getActiveModel(settings),
    finishReason: result.finishReason || "",
    truncated,
    usage: result.usage,
    cost: estimateWholeBookGuideCost(settings, result),
    generatedAt: new Date().toISOString(),
    errorMessage,
    errorDetail: toText(error?.message),
    sourceLimitations: errorMessage,
    source: {
      strategy: "chapters_and_samples",
      chapterCount: Array.isArray(book.chapters) ? book.chapters.length : 0,
      note: "用章节列表、导读章节和正文抽样生成，不默认塞入整本书全文。",
    },
  };
}

function buildStoredFailedGuide(raw, error) {
  return {
    ...emptyWholeBookGuideFields(),
    raw,
    styleVersion: WHOLE_BOOK_GUIDE_STYLE_VERSION,
    status: "failed",
    errorMessage: "上次整本书导读解析失败，请重新分析这本书。",
    errorDetail: toText(error?.message),
    sourceLimitations: "上次整本书导读解析失败，请重新分析这本书。",
  };
}

function emptyWholeBookGuideFields() {
  return {
    overview: "",
    fullOverview: "",
    bookProblem: "",
    coreQuestion: "",
    structureMap: [],
    keyTurns: [],
    difficultyMap: [],
    suggestedReadingPaths: [],
    companionFocusOptions: DEFAULT_FOCUS_OPTIONS,
    planAdvice: normalizePlanAdvice({}),
    sourceLimitations: "",
  };
}

function looksLikeLegacyParseFailure(value) {
  return !toText(value.overview) && toText(value.sourceLimitations).includes("解析失败");
}

function isLongOverview(value) {
  return toText(value).replace(/\s/g, "").length > 320;
}

function makeOverviewPreview(value) {
  const text = toText(value).trim();
  if (!isLongOverview(text)) return text;

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "---");
  const plainLines = lines.map((line) => line.replace(/^#{1,6}\s+/, ""));
  const preview = [];
  let length = 0;

  for (const line of plainLines) {
    if (preview.length >= 3 || length >= 260) break;
    const next = line.length > 140 ? `${line.slice(0, 140)}...` : line;
    preview.push(next);
    length += next.length;
  }

  return preview.length > 0 ? preview.join("\n\n") : `${text.slice(0, 260)}...`;
}

function normalizeFocusOptions(value) {
  const list = normalizeObjectList(value)
    .map((item) => ({
      type: normalizeFocusType(item.type),
      label: toText(item.label),
      description: toText(item.description),
      promptInstruction: toText(item.promptInstruction),
    }))
    .filter((item) => item.type && item.label);

  return list.length > 0 ? list : DEFAULT_FOCUS_OPTIONS;
}

function normalizePlanAdvice(value = {}) {
  const pace = ["light", "standard", "deep"].includes(value.recommendedPace)
    ? value.recommendedPace
    : "standard";
  const minutes = Number(value.recommendedMinutesPerSession);

  return {
    recommendedPace: pace,
    recommendedMinutesPerSession: Number.isFinite(minutes) ? minutes : 40,
    splitLongChapters: value.splitLongChapters !== false,
    riskNotes: Array.isArray(value.riskNotes) ? value.riskNotes.map(toText).filter(Boolean) : [],
  };
}

function normalizeFocusType(type) {
  const value = toText(type).trim();
  return ["mainline", "background", "argument", "application", "output", "custom"].includes(value)
    ? value
    : "";
}

function getActiveModel(settings) {
  if (settings.provider === "openai-compatible") {
    return settings.openaiCompatible?.model || "";
  }
  return settings.anthropic?.model || "";
}

function estimateWholeBookGuideCost(settings, result) {
  const costSettings = result.settingsUsed || settings;
  if (costSettings.provider === "openai-compatible") {
    return estimateCustomCost(costSettings.openaiCompatible || {}, result.usage);
  }
  return estimateClaudeCost(result.model || costSettings.anthropic?.model, result.usage);
}

export const DEFAULT_FOCUS_OPTIONS = [
  {
    type: "mainline",
    label: "帮我抓主线",
    description: "减少被细节带走，持续提醒这段和全书问题的关系。",
    promptInstruction: "后续回答要优先回到全书主线和当前章节位置。",
  },
  {
    type: "background",
    label: "帮我补背景",
    description: "在必要时解释人物、制度、概念和时代背景。",
    promptInstruction: "后续回答要用克制的背景补充帮助用户读懂当前文本。",
  },
  {
    type: "argument",
    label: "帮我拆论证",
    description: "追问作者的判断、证据和推理是否站得住。",
    promptInstruction: "后续回答要帮助用户看见概念、证据和论证链。",
  },
  {
    type: "output",
    label: "帮我沉淀输出",
    description: "把阅读转成笔记、文章、讲稿或可复用表达。",
    promptInstruction: "后续回答要主动提示可沉淀的观点、结构和表达。",
  },
];
