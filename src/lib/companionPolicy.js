import { toText } from "./text.js";

export const COMPANION_POLICY_SCHEMA_VERSION = 1;
export const COMPANION_MEMORY_SCHEMA_VERSION = 1;

export const COMPANION_POLICY_OPTIONS = Object.freeze({
  spoiler: Object.freeze([
    {
      value: "avoid",
      label: "仅使用已读内容",
      description: "只根据当前页和确认读过的内容回答，不涉及后文情节或结论。",
    },
    {
      value: "hint",
      label: "提示关注方向，不透露后文",
      description: "可以提示值得关注的线索，但不说明后续事件、关键转折或结局。",
    },
    {
      value: "allow",
      label: "允许讨论后文与结局",
      description: "可以引用后文、关键转折和结局，回答可能包含剧透。",
    },
  ]),
  answerDepth: Object.freeze([
    {
      value: "concise",
      label: "简要",
      description: "直接回答核心问题，通常不超过两个短段落。",
    },
    {
      value: "balanced",
      label: "标准",
      description: "先回答问题，再补充必要的解释或示例。",
    },
    {
      value: "deep",
      label: "详细",
      description: "进一步展开相关背景、概念和论证过程。",
    },
  ]),
  followUp: Object.freeze([
    {
      value: "never",
      label: "不追问",
      description: "回答结束后不再提出问题。",
    },
    {
      value: "helpful",
      label: "信息不足时追问",
      description: "仅在问题含义不明确或缺少必要信息时，提出一个澄清问题。",
    },
    {
      value: "always",
      label: "每次回答后追问",
      description: "每次回答后提出一个与当前阅读相关的问题。",
    },
  ]),
  knowledgeBoundary: Object.freeze([
    {
      value: "book",
      label: "仅限书中内容",
      description: "只使用书中内容和你的记录；材料不足时会直接说明。",
    },
    {
      value: "text_first",
      label: "以书为主，补充必要背景",
      description: "优先依据书中内容，必要时补充常识，并标明额外背景。",
    },
    {
      value: "open",
      label: "可结合外部知识与实例",
      description: "可以联系相关知识、现实实例和背景，再回到当前内容。",
    },
  ]),
});

export const COMPANION_SESSION_OVERRIDE_OPTIONS = Object.freeze([
  { value: "default", label: "遵循本书设置", patch: null },
  { value: "concise", label: "本次简要回答", patch: { answerDepth: "concise" } },
  { value: "deep", label: "本次详细回答", patch: { answerDepth: "deep" } },
  { value: "no-follow-up", label: "本次不追问", patch: { followUp: "never" } },
  { value: "allow-spoiler", label: "本次允许讨论后文", patch: { spoiler: "allow" } },
  { value: "book-only", label: "本次仅使用书中内容", patch: { knowledgeBoundary: "book" } },
]);

const DEFAULT_POLICY = Object.freeze({
  schemaVersion: COMPANION_POLICY_SCHEMA_VERSION,
  spoiler: "avoid",
  answerDepth: "balanced",
  followUp: "helpful",
  // Kept as a fixed compatibility field for books saved before proactive prompts were removed.
  proactivity: "quiet",
  knowledgeBoundary: "text_first",
});

const VALID_VALUES = Object.freeze(
  Object.fromEntries(
    Object.entries(COMPANION_POLICY_OPTIONS).map(([key, options]) => [
      key,
      new Set(options.map((option) => option.value)),
    ])
  )
);

const OUTPUT_TOKEN_LIMITS = Object.freeze({
  readingGuide: Object.freeze({ concise: 2200, balanced: 3200, deep: 4600 }),
  readingChat: Object.freeze({ concise: 700, balanced: 1500, deep: 2600 }),
  readingReflection: Object.freeze({ concise: 450, balanced: 700, deep: 900 }),
});

export function getDefaultCompanionPolicy() {
  return { ...DEFAULT_POLICY };
}

export function normalizeCompanionPolicy(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_POLICY).map(([key, fallback]) => [
      key,
      key === "schemaVersion" ? COMPANION_POLICY_SCHEMA_VERSION : validOr(key, source[key], fallback),
    ])
  );
}

export function normalizeCompanionMemory(value, readingProfile = {}) {
  if (isPlainObject(value) && value.initialized === true) {
    return {
      schemaVersion: COMPANION_MEMORY_SCHEMA_VERSION,
      initialized: true,
      items: normalizeMemoryItems(value.items),
    };
  }

  return {
    schemaVersion: COMPANION_MEMORY_SCHEMA_VERSION,
    initialized: false,
    items: buildLegacyMemoryItems(readingProfile),
  };
}

export function getCompanionSettings(readingProfile = {}) {
  const profile = isPlainObject(readingProfile) ? readingProfile : {};
  return {
    policy: normalizeCompanionPolicy(profile.companionPolicy),
    memory: normalizeCompanionMemory(profile.companionMemory, profile),
  };
}

export function createCompanionMemoryItem(
  text,
  now = new Date().toISOString(),
  { source = "user", sourceItemKey = "", sourceEventId = "" } = {}
) {
  const content = clean(text).slice(0, 240);
  if (!content) return null;
  return {
    id: `memory-${now.replace(/[^0-9]/g, "").slice(0, 17)}-${Math.random().toString(36).slice(2, 7)}`,
    text: content,
    source: normalizeMemorySource(source),
    sourceItemKey: clean(sourceItemKey),
    sourceEventId: clean(sourceEventId),
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveCompanionPolicy(policy, sessionOverride) {
  const base = normalizeCompanionPolicy(policy);
  const patch = normalizeSessionOverride(sessionOverride);
  return {
    ...base,
    ...patch,
    schemaVersion: COMPANION_POLICY_SCHEMA_VERSION,
  };
}

export function getCompanionSessionOverride(value) {
  return COMPANION_SESSION_OVERRIDE_OPTIONS.find((option) => option.value === value) ||
    COMPANION_SESSION_OVERRIDE_OPTIONS[0];
}

export function getCompanionOutputTokenLimit(policy, taskType) {
  const normalized = normalizeCompanionPolicy(policy);
  const limits = OUTPUT_TOKEN_LIMITS[taskType] || OUTPUT_TOKEN_LIMITS.readingChat;
  return limits[normalized.answerDepth] || limits.balanced;
}

export function shouldIncludeCurrentItemText(policy) {
  return normalizeCompanionPolicy(policy).spoiler === "allow";
}

export function shouldStreamCompanionAnswer(policy) {
  return normalizeCompanionPolicy(policy).spoiler === "allow";
}

export function sanitizeCompanionAnswerForPolicy(value, policy) {
  const content = toText(value).trim();
  if (!content || normalizeCompanionPolicy(policy).spoiler === "allow") return content;

  const safeParagraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => !containsUnreadDisclosureCue(paragraph));

  if (safeParagraphs.length > 0) return safeParagraphs.join("\n\n");
  return "这部分需要后文才能确认，我先按住不说。我们可以只根据你当前看到的内容继续讨论。";
}

export function buildCompanionPolicyInstruction(policy) {
  const normalized = normalizeCompanionPolicy(policy);
  const spoiler = {
    avoid: "不得引用、概括、暗示或预告用户尚未读到的内容；不得凭你对本书的已有知识补写后续人物、事件、观点、因果、转折或结局。只使用当前可见页、系统明确提供的已读正文和用户主动带入的材料；不要说‘后面你会看到’或任何包含具体后续信息的阅读预告。",
    hint: "不要说出未读内容的答案、人物行动、因果、关键转折或结局；可以给不含答案的抽象阅读方向，但仍只能使用当前可见页、系统明确提供的已读正文和用户主动带入的材料。",
    allow: "用户允许讨论当前阅读项后文；仍要明确区分书中信息、一般知识和推测。",
  }[normalized.spoiler];
  const answerDepth = {
    concise: "回答保持简短：先直接回答，通常不超过 2 个短段落。",
    balanced: "回答深度适中：先直接回答，再用必要的解释或例子展开，避免重复。",
    deep: "可以深入拆解背景、概念或论证，但要有层次并最终回到当前阅读。",
  }[normalized.answerDepth];
  const followUp = {
    never: "回答结束时不要向用户追问。",
    helpful: "不要为了延续对话而追问。仅当用户问题含义不明确或缺少回答所需信息时，提出且只提出 1 个澄清问题；信息足够时直接结束回答。",
    always: "回答结束时提出且只提出 1 个与当前阅读直接相关的问题。",
  }[normalized.followUp];
  const knowledge = {
    book: "只依据本次提供的书中内容和用户记录回答；材料不足时直接说明，不调用外部知识补足。",
    text_first: "优先依据书中内容；必要时可补充公共背景，并清楚标明那是外部补充。",
    open: "可以联系公共背景、现实例子和相关知识，但必须标明来源边界并回到当前文本。",
  }[normalized.knowledgeBoundary];
  const interactionBoundary =
    "只响应用户主动发起的导读、提问、笔记或读后回想，不主动发起阅读问题、提醒或新的阅读任务。";

  return [spoiler, answerDepth, followUp, knowledge, interactionBoundary].join("\n");
}

export function buildCompanionMemoryInstruction(memory) {
  const items = normalizeMemoryItems(memory?.items).slice(0, 8);
  if (items.length === 0) return "用户没有为本书保存额外记忆。";
  const lines = items.map((item, index) => `${index + 1}. ${item.text}`);
  return `以下是用户明确保存或从旧设置迁入的本书记忆，只在相关时使用，不要把它们当作书中事实：\n${lines.join("\n")}`.slice(0, 1400);
}

function normalizeSessionOverride(value) {
  if (!value) return {};
  if (typeof value === "string") return getCompanionSessionOverride(value).patch || {};
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.keys(DEFAULT_POLICY)
      .filter((key) => key !== "schemaVersion" && VALID_VALUES[key]?.has(value[key]))
      .map((key) => [key, value[key]])
  );
}

function buildLegacyMemoryItems(readingProfile) {
  const focus = isPlainObject(readingProfile?.companionFocus)
    ? readingProfile.companionFocus
    : {};
  const candidates = [focus.openingMessage, focus.customFocus, focus.userText]
    .map(clean)
    .filter(Boolean);
  return [...new Set(candidates)].slice(0, 4).map((text, index) => ({
    id: `legacy-focus-${index + 1}`,
    text: text.slice(0, 240),
    source: "legacy",
    createdAt: clean(focus.updatedAt),
    updatedAt: clean(focus.updatedAt),
  }));
}

function normalizeMemoryItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((item, index) => {
      const source = isPlainObject(item) ? item : { text: item };
      const text = clean(source.text).slice(0, 240);
      if (!text || seen.has(text)) return null;
      seen.add(text);
      return {
        id: clean(source.id) || `memory-${index + 1}`,
        text,
        source: normalizeMemorySource(source.source),
        sourceItemKey: clean(source.sourceItemKey),
        sourceEventId: clean(source.sourceEventId),
        createdAt: clean(source.createdAt),
        updatedAt: clean(source.updatedAt),
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeMemorySource(value) {
  return value === "legacy" || value === "session_record" ? value : "user";
}

function validOr(key, value, fallback) {
  return VALID_VALUES[key]?.has(value) ? value : fallback;
}

function containsUnreadDisclosureCue(value) {
  return [
    /(?:读到|看到|翻到)(?:书中)?后面/,
    /(?:后面|后文|往后|再往后|接下来|随后).{0,16}(?:你会|会看到|会发现|将会|会出现|会讲到|会提到|会揭示)/,
    /(?:接着|继续)(?:往下)?(?:读|翻).{0,16}(?:你会|会看到|会发现|将会)/,
    /(?:结局|最终结果|后续情节|后续转折)/,
  ].some((pattern) => pattern.test(value));
}

function clean(value) {
  return toText(value).trim().replace(/\s+/g, " ");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
