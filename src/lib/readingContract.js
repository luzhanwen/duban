import { cleanText, toText } from "./text.js";

const FOCUS_TYPES = new Set([
  "mainline",
  "background",
  "argument",
  "application",
  "output",
  "custom",
]);

const PURPOSE_TO_FOCUS = {
  overview: "mainline",
  study: "background",
  deep: "argument",
  research: "output",
};

const DEFAULT_FOCUS_BY_TYPE = {
  mainline: {
    type: "mainline",
    label: "帮我抓主线",
    userText: "",
    aiSummary: "减少被细节带走，持续提醒这段和全书问题的关系。",
    promptInstruction: "后续导读、问答和读后追问都要优先帮助用户抓住全书主线，避免只堆细节。",
  },
  background: {
    type: "background",
    label: "帮我补背景",
    userText: "",
    aiSummary: "在必要时解释人物、制度、概念和时代背景。",
    promptInstruction: "后续导读、问答和读后追问都要用克制的背景补充帮助用户读懂当前文本。",
  },
  argument: {
    type: "argument",
    label: "帮我拆论证",
    userText: "",
    aiSummary: "追问作者的判断、证据和推理是否站得住。",
    promptInstruction: "后续导读、问答和读后追问都要帮助用户看见概念、证据和论证链。",
  },
  application: {
    type: "application",
    label: "帮我联系现实",
    userText: "",
    aiSummary: "把书中的问题和现实经验、工作生活或其他知识连接起来。",
    promptInstruction: "后续导读、问答和读后追问都要帮助用户把当前文本和现实经验建立连接。",
  },
  output: {
    type: "output",
    label: "帮我沉淀输出",
    userText: "",
    aiSummary: "把阅读转成笔记、文章、讲稿或可复用表达。",
    promptInstruction: "后续导读、问答和读后追问都要主动提示可沉淀的观点、结构和表达。",
  },
  custom: {
    type: "custom",
    label: "我自己指定",
    userText: "",
    aiSummary: "",
    promptInstruction: "后续导读、问答和读后追问都要围绕用户自定义的阅读目标收束。",
  },
};

const VALID_PACES = new Set(["light", "standard", "deep"]);

export function buildReadingContractContext({ book, item } = {}) {
  const guide = getUsableWholeBookGuide(book?.wholeBookGuide);
  const companionFocusResult = buildCompanionFocus(book?.readingProfile);
  const itemChapterIds = normalizeIdList(item?.chapterIds ?? item?.chapterId);
  const structureMatches = guide
    ? findChapterMatches(guide.structureMap, itemChapterIds)
    : [];
  const difficultyMatches = guide
    ? findChapterMatches(guide.difficultyMap, itemChapterIds)
    : [];
  const keyTurnMatches = guide
    ? findChapterMatches(guide.keyTurns, itemChapterIds)
    : [];

  return {
    bookProblem: guide ? clean(guide.bookProblem) : "",
    coreQuestion: guide ? clean(guide.coreQuestion) : "",
    companionFocus: companionFocusResult.value,
    currentStructureRole: buildCurrentStructureRole(structureMatches),
    currentDifficultyHints: difficultyMatches.map(toDifficultyHint).filter(hasUsefulValue),
    currentKeyTurns: keyTurnMatches.map(toKeyTurn).filter(hasUsefulValue),
    suggestedReadingPath: guide
      ? buildSuggestedReadingPath(guide.suggestedReadingPaths, companionFocusResult.value.type)
      : "",
    planAdvice: guide ? normalizePlanAdvice(guide.planAdvice) : emptyPlanAdvice(),
    sourceLimitations: guide ? clean(guide.sourceLimitations) : "",
    available: {
      wholeBookGuide: Boolean(guide),
      companionFocus: companionFocusResult.available,
      structureMatch: structureMatches.length > 0,
      difficultyMatch: difficultyMatches.length > 0,
    },
  };
}

function buildCompanionFocus(readingProfile = {}) {
  const rawFocus = readingProfile?.companionFocus;
  const hasCompanionFocus = rawFocus && typeof rawFocus === "object" && !Array.isArray(rawFocus);

  if (hasCompanionFocus) {
    const type = normalizeFocusType(rawFocus.type) || purposeToFocus(readingProfile.purpose);
    const defaults = defaultFocus(type);
    const userText = clean(rawFocus.userText);
    return {
      available: true,
      value: {
        type: defaults.type,
        label: clean(rawFocus.label) || defaults.label,
        userText,
        aiSummary: clean(rawFocus.aiSummary || rawFocus.description) || userText || defaults.aiSummary,
        promptInstruction: clean(rawFocus.promptInstruction) || defaults.promptInstruction,
      },
    };
  }

  const fallback = defaultFocus(purposeToFocus(readingProfile?.purpose));
  return {
    available: false,
    value: { ...fallback },
  };
}

function getUsableWholeBookGuide(value) {
  const guide = parseWholeBookGuideValue(value);
  if (!guide) return null;

  const status = clean(guide.status);
  if (status === "failed" || status === "generating" || status === "idle") return null;
  return guide;
}

function parseWholeBookGuideValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(extractJson(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function extractJson(value) {
  const text = toText(value).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function findChapterMatches(items, itemChapterIds) {
  const itemIdSet = new Set(itemChapterIds);
  if (itemIdSet.size === 0) return [];

  return normalizeObjectList(items).filter((entry) =>
    normalizeIdList(entry.chapterIds ?? entry.chapterId).some((chapterId) =>
      itemIdSet.has(chapterId)
    )
  );
}

function buildCurrentStructureRole(matches) {
  return matches
    .map((entry) =>
      [
        clean(entry.title),
        clean(entry.role || entry.summary),
        clean(entry.readingHint),
      ]
        .filter(Boolean)
        .join("；")
    )
    .filter(Boolean)
    .join("\n");
}

function toDifficultyHint(entry) {
  return {
    topic: clean(entry.topic),
    where: clean(entry.where),
    whyHard: clean(entry.whyHard),
    supportStrategy: clean(entry.supportStrategy),
  };
}

function toKeyTurn(entry) {
  return {
    title: clean(entry.title),
    whyItMatters: clean(entry.whyItMatters),
  };
}

function buildSuggestedReadingPath(paths, focusType) {
  const candidates = normalizeObjectList(paths);
  if (candidates.length === 0) return "";

  const matched =
    candidates.find((path) => normalizeTextList(path.companionFocusSuggestions).includes(focusType)) ||
    candidates[0];

  return [
    clean(matched.title),
    clean(matched.bestFor),
    clean(matched.description),
    clean(matched.paceHint),
  ]
    .filter(Boolean)
    .join("；");
}

function normalizePlanAdvice(value = {}) {
  const advice = value && typeof value === "object" ? value : {};
  const recommendedPace = clean(advice.recommendedPace);
  const minutes = Number(advice.recommendedMinutesPerSession);

  return {
    recommendedPace: VALID_PACES.has(recommendedPace) ? recommendedPace : "",
    recommendedMinutesPerSession: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
    splitLongChapters:
      typeof advice.splitLongChapters === "boolean" ? advice.splitLongChapters : null,
    riskNotes: normalizeTextList(advice.riskNotes),
  };
}

function emptyPlanAdvice() {
  return {
    recommendedPace: "",
    recommendedMinutesPerSession: null,
    splitLongChapters: null,
    riskNotes: [],
  };
}

function defaultFocus(type) {
  return DEFAULT_FOCUS_BY_TYPE[normalizeFocusType(type) || "mainline"];
}

function purposeToFocus(purpose) {
  return PURPOSE_TO_FOCUS[clean(purpose)] || "mainline";
}

function normalizeFocusType(type) {
  const value = clean(type);
  return FOCUS_TYPES.has(value) ? value : "";
}

function normalizeObjectList(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function normalizeTextList(value) {
  if (!Array.isArray(value)) {
    const text = clean(value);
    return text ? [text] : [];
  }
  return value.map(clean).filter(Boolean);
}

function normalizeIdList(value) {
  if (Array.isArray(value)) return value.map(toId).filter(Boolean);
  const id = toId(value);
  return id ? [id] : [];
}

function toId(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value.id !== null && value.id !== undefined) {
    return String(value.id).trim();
  }
  return String(value).trim();
}

function hasUsefulValue(value) {
  return Object.values(value).some(Boolean);
}

function clean(value) {
  return cleanText(toText(value));
}
