import { resolveAiProfileRequest } from "./aiProfiles.js";
import {
  buildCompanionMemoryInstruction,
  getCompanionOutputTokenLimit,
  shouldIncludeCurrentItemText,
} from "./companionPolicy.js";
import { fingerprintText } from "./companionEvents.js";
import { buildReadingContractContext } from "./readingContract.js";
import { toText } from "./text.js";

export const COMPANION_CONTEXT_SCHEMA_VERSION = 2;
export const COMPANION_CONTEXT_PROMPT_VERSIONS = Object.freeze({
  readingGuide: "reading-guide:p7.9.2-v6",
  readingChat: "reading-chat:p7.7-v2",
  readingReflection: "reading-reflection:p7.7-v2",
});

const CONTEXT_CACHE_LIMIT = 48;
const contextCache = new Map();

const SCENE_BUDGETS = Object.freeze({
  readingGuide: Object.freeze({ concise: 7000, balanced: 10000, deep: 12000 }),
  readingChat: Object.freeze({ concise: 4200, balanced: 7200, deep: 10000 }),
  readingReflection: Object.freeze({ concise: 5200, balanced: 7600, deep: 9800 }),
});

const SCENE_OUTPUT_INSTRUCTIONS = Object.freeze({
  readingGuide: Object.freeze({
    concise: "导读正文控制在 180-260 字，用 2 个短标题；承接上一项只用 1 句话，目标与问题仍各 3 条。",
    balanced: "导读正文控制在 220-360 字，用 2 个短标题和 2-3 个短段落；优先使用人物、地点、事件和制度原名，目标与问题各 3 条。",
    deep: "导读正文控制在 320-480 字，用 2-3 个短标题；可以增加必要背景，但每个判断都要落回具体事实，目标与问题各 3 条。",
  }),
  readingChat: Object.freeze({
    concise: "先直接回答，通常不超过 2 个短段落；除非材料不足，不展开旁支。",
    balanced: "先直接回答，再用必要的解释或例子展开，通常控制在 3-5 个短段落。",
    deep: "可以分层拆解背景、概念或论证，通常控制在 5-8 个短段落，并在结尾回到当前文本。",
  }),
  readingReflection: Object.freeze({
    concise: "用 1 个短段落接住用户，只在规则允许时追问 1 个短问题。",
    balanced: "用 1-2 个短段落回应，再按规则决定是否追问 1 个具体问题。",
    deep: "可以用 2-4 个短段落拆解用户的判断，但只追问 1 个问题，并把思考权留给用户。",
  }),
});

const READING_GUIDE_COMPACT_OUTPUT_INSTRUCTIONS = Object.freeze({
  concise: "恢复时将 overview 压缩到 180-240 字，目标与问题各 3 条且每条不超过 22 字。",
  balanced: "恢复时将 overview 压缩到 240-320 字，目标与问题各 3 条且每条不超过 26 字。",
  deep: "恢复时将 overview 压缩到 320-420 字，目标与问题各 3 条且每条不超过 30 字。",
});

export function buildCompanionContext({
  scene,
  book,
  item,
  itemKey,
  chapterSections = [],
  currentPageContext = null,
  readingContext = null,
  guide = null,
  history = [],
  readingChatMessages = [],
  readingNotes = [],
  userMessage = "",
  quote = null,
  sessionOverride = null,
  settings = {},
  itemCompleted = false,
  cacheIdentity = null,
  memoryScope = null,
  contextCompression = "normal",
  promptVersion: promptVersionOverride = "",
} = {}) {
  const taskType = normalizeScene(scene);
  const contractContext = buildReadingContractContext({ book, item, sessionOverride });
  const policy = contractContext.companionPolicy;
  const answerDepth = policy.answerDepth || "balanced";
  const maxOutputTokens = getCompanionOutputTokenLimit(policy, taskType);
  const baseMaxContextChars =
    SCENE_BUDGETS[taskType]?.[answerDepth] || SCENE_BUDGETS[taskType]?.balanced || 7200;
  const compressionMode = contextCompression === "compact" ? "compact" : "normal";
  const maxContextChars =
    compressionMode === "compact"
      ? Math.max(2600, Math.floor(baseMaxContextChars * 0.55))
      : baseMaxContextChars;
  const promptVersion =
    toText(promptVersionOverride).trim() || COMPANION_CONTEXT_PROMPT_VERSIONS[taskType];
  const modelSignature = buildModelSignature(settings, taskType, maxOutputTokens);
  const allowUnread = shouldIncludeCurrentItemText(policy);
  const contractAccess = resolveContractAccess({ taskType, allowUnread, itemCompleted });
  const candidates = [];
  const excluded = [];

  addSelectionSource(candidates, quote, itemKey);
  addMemorySources(candidates, contractContext.companionMemory?.items, {
    scene: taskType,
    query: buildMemoryQuery({
      taskType,
      book,
      item,
      chapterSections,
      contractContext,
      userMessage,
      quote,
    }),
    itemKey,
    memoryScope,
    excluded,
  });

  if (taskType === "readingGuide") {
    addChapterSources(candidates, chapterSections, {
      kind: "target_item",
      purpose: "生成不剧透的读前导读",
      priority: 110,
      itemKey,
    });
    if (!contractAccess.keyTurns) {
      excluded.push(
        exclusion("contract_key_turn", "spoiler-policy", "整本书导读中的关键转折未进入请求"),
        exclusion("contract_reading_path", "spoiler-policy", "整本书阅读路径可能指向后文，未进入请求")
      );
    }
  }

  if (taskType === "readingChat") {
    addCurrentPageSources(candidates, readingContext, currentPageContext, itemKey);
    addPriorReadingSources(candidates, readingContext, itemKey);
    if (allowUnread) {
      addChapterSources(candidates, chapterSections, {
        kind: "open_item",
        purpose: "用户本次允许讨论当前阅读项后文",
        priority: 76,
        itemKey,
      });
      addGuideSource(candidates, guide, itemKey, 62);
    } else {
      excluded.push(
        exclusion("unread_item", "spoiler-policy", "当前阅读项未读正文未进入请求"),
        exclusion("guide", "spoiler-policy", "导读可能含后文线索，严格模式不带入"),
        exclusion("assistant_history", "spoiler-policy", "旧模型回答可能含未读信息，严格模式不带入")
      );
    }
    addHistorySources(candidates, history, {
      itemKey,
      includeAssistant: allowUnread,
      priority: 58,
      purpose: "保持本次伴读对话连续",
    });
  }

  if (taskType === "readingReflection") {
    if (itemCompleted) {
      addChapterSources(candidates, chapterSections, {
        kind: "completed_item",
        purpose: "当前阅读项已完成，可用于读后回想",
        priority: 86,
        itemKey,
      });
    } else {
      addCurrentPageSources(candidates, readingContext, currentPageContext, itemKey);
      addPriorReadingSources(candidates, readingContext, itemKey);
      excluded.push(
        exclusion("unread_item", "reading-frontier", "阅读项未确认完成，不带入整项正文")
      );
    }
    addReflectionArtifactSources(candidates, readingChatMessages, readingNotes, itemKey);
    addHistorySources(candidates, history, {
      itemKey,
      includeAssistant: true,
      priority: 116,
      purpose: "延续当前读后回想",
    });
    addGuideSource(candidates, guide, itemKey, 64);
  }

  const { selected, budgetExcluded } = selectSources(candidates, maxContextChars);
  excluded.push(...budgetExcluded);
  const selectedMemoryItems = selected
    .filter((source) => source.kind === "memory")
    .map((source) => source.memoryItem)
    .filter(Boolean);
  const contractPromptValues = buildContractPromptValues(contractContext, {
    contractAccess,
    selectedMemoryItems,
    scene: taskType,
  });
  const sections = buildSections(taskType, selected);
  const contextBudgetInstruction = buildContextBudgetInstruction(
    taskType,
    answerDepth,
    maxContextChars,
    maxOutputTokens
  );
  const identity = {
    schemaVersion: COMPANION_CONTEXT_SCHEMA_VERSION,
    taskType,
    bookId: toText(book?.id).trim(),
    itemKey: toText(itemKey).trim(),
    promptVersion,
    modelSignature,
    policy,
    sourceFingerprints: selected.map((source) => [
      source.id,
      fingerprintText(source.text),
      source.text.length,
    ]),
    contractFingerprint: fingerprintText(stableStringify(contractPromptValues)),
    excluded: excluded.map((entry) => [entry.kind, entry.reason]),
    userMessage: toText(userMessage).trim(),
    cacheIdentity,
    compressionMode,
  };
  const cacheKey = `companion-context:${fingerprintText(stableStringify(identity)) || "empty"}`;
  const cached = contextCache.get(cacheKey);
  if (cached) {
    touchCache(cacheKey, cached);
    return withCacheState(cached, true);
  }

  const estimatedContextTokens = estimateTokens([
    ...Object.values(sections),
    ...Object.values(contractPromptValues),
  ].join("\n\n"));
  const bundle = {
    schemaVersion: COMPANION_CONTEXT_SCHEMA_VERSION,
    scene: taskType,
    promptVersion,
    policy,
    contractPromptValues,
    sections,
    contextBudgetInstruction,
    guideOverviewRequirement:
      SCENE_OUTPUT_INSTRUCTIONS.readingGuide[answerDepth] ||
      SCENE_OUTPUT_INSTRUCTIONS.readingGuide.balanced,
    guideCompactOutputRequirement:
      READING_GUIDE_COMPACT_OUTPUT_INSTRUCTIONS[answerDepth] ||
      READING_GUIDE_COMPACT_OUTPUT_INSTRUCTIONS.balanced,
    maxOutputTokens,
    trace: {
      schemaVersion: COMPANION_CONTEXT_SCHEMA_VERSION,
      cacheKey,
      cache: { hit: false, kind: "context-lru" },
      promptVersion,
      modelSignature,
      policyFingerprint: fingerprintText(stableStringify(policy)),
      contractFingerprint: fingerprintText(stableStringify(contractPromptValues)),
      sourceRefs: selected.map(toSourceRef),
      excluded: dedupeExclusions(excluded),
      maxContextChars,
      baseMaxContextChars,
      usedContextChars: selected.reduce((total, source) => total + source.text.length, 0),
      estimatedContextTokens,
      maxOutputTokens,
      inputCompression: {
        mode: compressionMode,
        compactedSourceCount: selected.filter((source) => source.compacted).length,
      },
      assembledAt: new Date().toISOString(),
    },
  };
  setCachedContext(cacheKey, bundle);
  return clone(bundle);
}

export function clearCompanionContextCache() {
  contextCache.clear();
}

export function getCompanionContextCacheSize() {
  return contextCache.size;
}

function normalizeScene(value) {
  if (Object.hasOwn(COMPANION_CONTEXT_PROMPT_VERSIONS, value)) return value;
  throw new Error(`未知的读伴上下文场景：${toText(value) || "空"}`);
}

function resolveContractAccess({ taskType, allowUnread, itemCompleted }) {
  if (allowUnread) {
    return {
      overview: true,
      structure: true,
      difficulty: true,
      keyTurns: true,
      readingPath: true,
    };
  }
  if (taskType === "readingGuide") {
    return {
      overview: true,
      structure: true,
      difficulty: true,
      keyTurns: false,
      readingPath: false,
    };
  }
  if (taskType === "readingReflection" && itemCompleted) {
    return {
      overview: true,
      structure: true,
      difficulty: true,
      keyTurns: true,
      readingPath: false,
    };
  }
  return {
    overview: false,
    structure: false,
    difficulty: false,
    keyTurns: false,
    readingPath: false,
  };
}

function buildModelSignature(settings, taskType, maxTokens) {
  const request = resolveAiProfileRequest({
    settings,
    taskType,
    maxTokens,
    hardMaxTokens: maxTokens,
  });
  const provider = request.settings?.provider || "anthropic";
  const model =
    provider === "openai-compatible"
      ? request.settings?.openaiCompatible?.model
      : request.settings?.anthropic?.model;
  const endpoint =
    provider === "openai-compatible"
      ? safeEndpointOrigin(request.settings?.openaiCompatible?.baseUrl)
      : "anthropic-default";
  return [
    provider,
    endpoint,
    toText(model).trim() || "default",
    `max:${request.maxTokens || maxTokens}`,
    `temperature:${request.temperature ?? "default"}`,
  ].join("|");
}

function safeEndpointOrigin(value) {
  const text = toText(value).trim();
  if (!text) return "default-endpoint";
  try {
    return new URL(text).origin;
  } catch {
    return fingerprintText(text) || "custom-endpoint";
  }
}

function addSelectionSource(sources, quote, itemKey) {
  const text = toText(quote?.text).trim();
  if (!text) return;
  sources.push(
    createSource({
      id: `selection:${quote?.contentBlockId || fingerprintText(text) || "quote"}`,
      kind: "selection",
      purpose: "回答用户明确选中的原文",
      text,
      priority: 130,
      itemKey,
      pageNumber: positiveInteger(quote?.pageNumber),
      contentBlockId: toText(quote?.contentBlockId).trim() || null,
      contentFingerprint: toText(quote?.contentFingerprint).trim() || fingerprintText(text),
      quality: "user-selected",
    })
  );
}

function addCurrentPageSources(sources, readingContext, currentPageContext, itemKey) {
  const blocks = Array.isArray(readingContext?.currentBlocks) ? readingContext.currentBlocks : [];
  if (blocks.length > 0) {
    for (const block of blocks) {
      if (!block?.text || block.quality === "unusable") continue;
      sources.push(sourceFromBlock(block, "current_page", "回答当前可见页问题", 120, itemKey));
    }
    return;
  }
  const text = toText(currentPageContext?.text).trim();
  if (!text || currentPageContext?.quality === "unusable") return;
  sources.push(
    createSource({
      id: `current-page:${positiveInteger(currentPageContext?.pageNumber) || "unknown"}`,
      kind: "current_page",
      purpose: "回答当前可见页问题",
      text,
      priority: 120,
      itemKey,
      pageNumber: positiveInteger(currentPageContext?.pageNumber),
      quality: currentPageContext?.quality || "usable",
    })
  );
}

function addPriorReadingSources(sources, readingContext, itemKey) {
  const blocks = Array.isArray(readingContext?.priorBlocks) ? readingContext.priorBlocks : [];
  for (const block of blocks) {
    if (!block?.text || block.quality !== "good") continue;
    sources.push(sourceFromBlock(block, "confirmed_read", "补足已确认读过的上下文", 92, itemKey));
  }
}

function addChapterSources(sources, chapterSections, { kind, purpose, priority, itemKey }) {
  for (const [index, section] of asArray(chapterSections).entries()) {
    const text = toText(section?.text).trim();
    if (!text) continue;
    const chapter = section?.chapter || {};
    sources.push(
      createSource({
        id: `chapter:${toText(chapter.id).trim() || index}:${fingerprintText(text) || "empty"}`,
        kind,
        purpose,
        text,
        priority,
        itemKey,
        pageNumber: positiveInteger(chapter.startPage),
        pageEnd: positiveInteger(chapter.endPage),
        chapterId: toText(chapter.id).trim() || null,
        label: toText(chapter.title).trim() || `第 ${index + 1} 段`,
        quality: "parsed",
      })
    );
  }
}

function addGuideSource(sources, guide, itemKey, priority) {
  if (!guide) return;
  const text = [
    guide.overview ? `导读开场：${guide.overview}` : "",
    guide.goals?.length ? `阅读目标：${guide.goals.join("；")}` : "",
    guide.questions?.length ? `读前问题：${guide.questions.join("；")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (!text) return;
  sources.push(
    createSource({
      id: `guide:${itemKey}:${fingerprintText(text) || "empty"}`,
      kind: "guide",
      purpose: "延续本节导读线索",
      text,
      priority,
      itemKey,
      quality: "generated",
    })
  );
}

function addHistorySources(sources, messages, { itemKey, includeAssistant, priority, purpose }) {
  const recent = asArray(messages).slice(-10);
  recent.forEach((message, index) => {
    const role = message?.role === "assistant" ? "assistant" : "user";
    const text = toText(message?.content).trim();
    if (!text || (role === "assistant" && !includeAssistant)) return;
    sources.push(
      createSource({
        id: `history:${toText(message?.id).trim() || `${role}-${index}`}`,
        kind: "history",
        purpose,
        text,
        priority: priority + index / 100,
        itemKey,
        role,
        quality: "conversation",
      })
    );
  });
}

function addReflectionArtifactSources(sources, chatMessages, notes, itemKey) {
  asArray(notes)
    .slice(-8)
    .forEach((note, index) => {
      const text = [
        note?.text ? `原文：“${toText(note.text).trim()}”` : "",
        note?.note ? `笔记：${toText(note.note).trim()}` : "",
        note?.assistantContent ? `读伴回答：${toText(note.assistantContent).trim()}` : "",
      ]
        .filter(Boolean)
        .join("；");
      if (!text) return;
      sources.push(
        createSource({
          id: `note:${toText(note?.id).trim() || index}:${fingerprintText(text) || "empty"}`,
          kind: "note",
          purpose: "引用用户选择带入的笔记",
          text,
          priority: 108 + index / 100,
          itemKey,
          pageNumber: positiveInteger(note?.pageNumber),
          contentBlockId: toText(note?.contentBlockId).trim() || null,
          contentFingerprint: toText(note?.contentFingerprint).trim() || fingerprintText(text),
          quality: "user-saved",
        })
      );
    });
  asArray(chatMessages)
    .slice(-8)
    .forEach((message, index) => {
      const text = toText(message?.content).trim();
      if (!text) return;
      sources.push(
        createSource({
          id: `reading-chat:${toText(message?.id).trim() || index}`,
          kind: "reading_chat",
          purpose: "引用用户选择带入的伴读问答",
          text,
          priority: 98 + index / 100,
          itemKey,
          role: message?.role === "assistant" ? "assistant" : "user",
          quality: "conversation",
        })
      );
    });
}

function addMemorySources(
  sources,
  items,
  { scene, query, itemKey, memoryScope, excluded = [] }
) {
  if (scene === "readingGuide") {
    addReadingGuideMemorySources(sources, items, {
      query,
      itemKey,
      memoryScope,
      excluded,
    });
    return;
  }
  const ranked = asArray(items)
    .map((item, index) => ({
      item,
      index,
      score: relevanceScore(toText(item?.text), query),
    }))
    .filter((entry) => toText(entry.item?.text).trim())
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .slice(0, 4);
  for (const entry of ranked) {
    const text = toText(entry.item.text).trim();
    sources.push(
      createSource({
        id: `memory:${toText(entry.item.id).trim() || fingerprintText(text) || entry.index}`,
        kind: "memory",
        purpose: entry.score > 0 ? "匹配当前问题的用户记忆" : "本书最近保存的用户记忆",
        text,
        priority: 122 + Math.min(6, entry.score),
        itemKey,
        contentFingerprint: fingerprintText(text),
        quality: "user-saved",
        memorySource: toText(entry.item.source).trim() || "user",
        sourceItemKey: toText(entry.item.sourceItemKey).trim() || null,
        sourceEventId: toText(entry.item.sourceEventId).trim() || null,
        relevance: entry.score > 0 ? "query-match" : "recent-memory",
        memoryItem: entry.item,
      })
    );
  }
}

function addReadingGuideMemorySources(
  sources,
  items,
  { query, itemKey, memoryScope, excluded }
) {
  const priorItemKeys = new Set(asArray(memoryScope?.priorItemKeys).map(cleanKey).filter(Boolean));
  const previousItemKey = cleanKey(memoryScope?.previousItemKey);
  const ranked = [];

  asArray(items).forEach((item, index) => {
    const text = toText(item?.text).trim();
    if (!text) return;
    const source = toText(item?.source).trim() || "user";
    const sourceItemKey = cleanKey(item?.sourceItemKey);
    const score = guideRelevanceScore(text, query);

    if (source === "legacy") {
      excluded.push(
        exclusion("memory", "not-explicitly-retained", "旧设置迁入内容未作为后续导读承接记录")
      );
      return;
    }

    if (source === "session_record") {
      if (!sourceItemKey) {
        excluded.push(
          exclusion("memory", "missing-source-item", "本节记录缺少来源阅读项，未进入后续导读")
        );
        return;
      }
      if (sourceItemKey === itemKey || !priorItemKeys.has(sourceItemKey)) {
        excluded.push(
          exclusion("memory", "reading-frontier", "仅承接当前阅读项之前确认保留的记录")
        );
        return;
      }
      const isPreviousItem = sourceItemKey === previousItemKey;
      if (!isPreviousItem && score <= 0) {
        excluded.push(
          exclusion("memory", "not-relevant", "较早记录与当前阅读项没有可验证的关联")
        );
        return;
      }
      ranked.push({
        item,
        index,
        score: score + (isPreviousItem ? 12 : 0),
        relevance: isPreviousItem ? "previous-item" : "query-match",
      });
      return;
    }

    if (score <= 0) {
      excluded.push(
        exclusion("memory", "not-relevant", "本书通用记忆与当前阅读项没有可验证的关联")
      );
      return;
    }
    ranked.push({ item, index, score, relevance: "query-match" });
  });

  ranked
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .slice(0, 3)
    .forEach((entry) => {
      const text = toText(entry.item.text).trim();
      sources.push(
        createSource({
          id: `memory:${toText(entry.item.id).trim() || fingerprintText(text) || entry.index}`,
          kind: "memory",
          purpose:
            entry.relevance === "previous-item"
              ? "承接上一阅读项中用户确认保留的记录"
              : "承接与当前阅读项直接相关的用户记忆",
          text,
          priority: 124 + Math.min(8, entry.score),
          itemKey,
          contentFingerprint: fingerprintText(text),
          quality: "user-confirmed",
          memorySource: toText(entry.item.source).trim() || "user",
          sourceItemKey: cleanKey(entry.item.sourceItemKey) || null,
          sourceEventId: cleanKey(entry.item.sourceEventId) || null,
          relevance: entry.relevance,
          memoryItem: entry.item,
        })
      );
    });
}

function buildMemoryQuery({
  taskType,
  book,
  item,
  chapterSections,
  contractContext,
  userMessage,
  quote,
}) {
  const common = [userMessage, quote?.text, item?.title];
  if (taskType !== "readingGuide") return common.filter(Boolean).join(" ");
  return [
    book?.title,
    item?.title,
    ...asArray(chapterSections).map((section) => section?.chapter?.title),
    contractContext?.bookProblem,
    contractContext?.coreQuestion,
    contractContext?.currentStructureRole,
    ...asArray(contractContext?.currentDifficultyHints).flatMap((hint) => [
      hint?.topic,
      hint?.where,
    ]),
  ]
    .filter(Boolean)
    .join(" ");
}

function sourceFromBlock(block, kind, purpose, priority, itemKey) {
  return createSource({
    id: toText(block.id).trim(),
    kind,
    purpose,
    text: block.text,
    priority,
    itemKey,
    pageNumber: positiveInteger(block.pageNumber),
    chapterId: toText(block.chapterId).trim() || null,
    contentBlockId: toText(block.id).trim() || null,
    contentFingerprint: toText(block.textFingerprint).trim() || fingerprintText(block.text),
    quality: block.quality,
  });
}

function createSource(source) {
  const text = toText(source.text).trim();
  return {
    ...source,
    id: toText(source.id).trim() || `source:${fingerprintText(text) || "empty"}`,
    text,
    contentFingerprint: source.contentFingerprint || fingerprintText(text),
  };
}

function selectSources(candidates, maxChars) {
  const unique = new Map();
  for (const source of candidates) {
    if (!source.text || source.quality === "unusable") continue;
    if (!unique.has(source.id)) unique.set(source.id, source);
  }
  const ordered = [...unique.values()].sort(
    (left, right) => right.priority - left.priority || left.id.localeCompare(right.id)
  );
  const selected = [];
  const excluded = [];
  let remaining = maxChars;
  for (const source of ordered) {
    if (remaining <= 0) {
      excluded.push(exclusion(source.kind, "context-budget", `${source.purpose}超出上下文预算`));
      continue;
    }
    if (source.text.length <= remaining) {
      selected.push(source);
      remaining -= source.text.length;
      continue;
    }
    if (remaining >= 160) {
      selected.push({
        ...source,
        text: compactContextText(source.text, remaining),
        originalCharCount: source.text.length,
        compacted: true,
        truncated: true,
      });
      remaining = 0;
    } else {
      excluded.push(exclusion(source.kind, "context-budget", `${source.purpose}超出上下文预算`));
    }
  }
  return { selected, budgetExcluded: excluded };
}

export function compactContextText(value, maxChars) {
  const text = toText(value).trim();
  const limit = Math.max(1, Math.floor(Number(maxChars) || 1));
  if (text.length <= limit) return text;

  const marker = "\n…（中间内容已按上下文预算压缩）…\n";
  if (limit <= marker.length + 80) return text.slice(0, limit);

  const available = limit - marker.length * 2;
  const headLength = Math.floor(available * 0.42);
  const middleLength = Math.floor(available * 0.23);
  const tailLength = available - headLength - middleLength;
  const middleStart = Math.max(
    headLength,
    Math.floor((text.length - middleLength) / 2)
  );
  return [
    text.slice(0, headLength),
    marker,
    text.slice(middleStart, middleStart + middleLength),
    marker,
    text.slice(-tailLength),
  ].join("");
}

function buildSections(scene, sources) {
  const byKind = (kinds) => sources.filter((source) => kinds.includes(source.kind));
  const format = (entries, formatter) => entries.map(formatter).filter(Boolean).join("\n\n");
  const selectionText = format(byKind(["selection"]), (source) =>
    `【用户选中的原文${source.pageNumber ? ` · 第 ${source.pageNumber} 页` : ""}】\n${source.text}`
  );
  const currentPageText = format(byKind(["current_page"]), (source) =>
    `【第 ${source.pageNumber || "?"} 页】\n${source.text}`
  );
  const targetText = format(
    byKind(["target_item", "open_item", "completed_item"]),
    (source) =>
      `【${source.label || "当前阅读项"}${formatPageRange(source)}】\n${source.text}`
  );
  const confirmedReadText = format(byKind(["confirmed_read"]), (source) =>
    `【已确认读过 · 第 ${source.pageNumber || "?"} 页】\n${source.text}`
  );
  const guideText = format(byKind(["guide"]), (source) => source.text);
  const historyText = format(byKind(["history"]), (source) =>
    `${source.role === "assistant" ? "读伴" : "用户"}：${source.text}`
  );
  const readingChatText = format(byKind(["reading_chat"]), (source) =>
    `${source.role === "assistant" ? "读伴伴读回答" : "用户伴读提问"}：${source.text}`
  );
  const noteText = format(byKind(["note"]), (source, index) => `笔记 ${index + 1}：${source.text}`);
  const readingArtifacts = [
    readingChatText ? `伴读问答：\n${readingChatText}` : "",
    noteText ? `高亮和笔记：\n${noteText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (scene === "readingGuide") {
    return { chapterText: targetText || "当前阅读项没有可用文本。" };
  }
  if (scene === "readingReflection") {
    return {
      chapterText: targetText || [selectionText, currentPageText, confirmedReadText].filter(Boolean).join("\n\n") || "当前没有可核验的正文。",
      guideText: guideText || "暂无导读。",
      readingContextText:
        readingArtifacts || "用户当前未选择带入伴读问答或笔记。",
      historyText: historyText || "暂无读后交流历史。",
    };
  }
  return {
    currentPageText:
      [selectionText, currentPageText].filter(Boolean).join("\n\n") ||
      "当前还没有识别到可用的当前页文本。",
    chapterText:
      targetText ||
      (confirmedReadText
        ? `以下内容来自已确认读过的正文：\n${confirmedReadText}`
        : "暂无其他已确认读过且可可靠提取的正文；只使用当前可见页。"),
    guideText: guideText || "未带入导读。",
    historyText: historyText || "暂无允许带入的历史对话。",
  };
}

function buildContractPromptValues(
  context,
  { contractAccess, selectedMemoryItems, scene }
) {
  const hasCompanionFocus = Boolean(context.available?.companionFocus);
  const available = {
    ...context.available,
    companionMemory: selectedMemoryItems.length > 0,
    wholeBookGuide: Boolean(contractAccess.overview && context.available?.wholeBookGuide),
    structureMatch: Boolean(contractAccess.structure && context.available?.structureMatch),
    difficultyMatch: Boolean(contractAccess.difficulty && context.available?.difficultyMatch),
  };
  return {
    contractBookProblem: contractAccess.overview ? toText(context.bookProblem).trim() : "",
    contractCoreQuestion: contractAccess.overview ? toText(context.coreQuestion).trim() : "",
    contractCompanionFocusLabel: hasCompanionFocus
      ? formatCompanionFocusLabel(context.companionFocus)
      : "",
    contractCompanionFocusInstruction: hasCompanionFocus
      ? toText(context.companionFocus?.promptInstruction).trim()
      : "",
    contractCompanionPolicyInstruction: toText(context.companionPolicyInstruction).trim(),
    contractCompanionMemoryInstruction:
      scene === "readingGuide"
        ? buildReadingGuideMemoryInstruction(selectedMemoryItems)
        : buildCompanionMemoryInstruction({ items: selectedMemoryItems }),
    contractCurrentStructureRole: contractAccess.structure
      ? toText(context.currentStructureRole).trim()
      : "",
    contractCurrentDifficultyHints: contractAccess.difficulty
      ? formatContractDifficultyHints(context.currentDifficultyHints)
      : "",
    contractCurrentKeyTurns: contractAccess.keyTurns
      ? formatContractKeyTurns(context.currentKeyTurns)
      : "",
    contractSuggestedReadingPath: contractAccess.readingPath
      ? toText(context.suggestedReadingPath).trim()
      : "",
    contractSourceLimitations: Object.values(contractAccess).every(Boolean)
      ? toText(context.sourceLimitations).trim()
      : "当前策略只带入本场景允许的整本书信息；未读关键转折、后续阅读路径或旧模型回答不会进入请求。",
    contractAvailableSummary: formatContractAvailableSummary(available),
  };
}

function buildReadingGuideMemoryInstruction(items) {
  const selected = asArray(items).slice(0, 3);
  if (selected.length === 0) {
    return "本次没有通过阅读顺序、相关性和确认状态筛选的过往记录。";
  }
  const lines = selected.map((item, index) => `${index + 1}. ${toText(item?.text).trim()}`);
  return `以下记录由用户明确保留，并已通过本次导读筛选；只用于承接用户的理解与关注点，不要把它们当作书中事实：\n${lines.join("\n")}`.slice(
    0,
    1100
  );
}

function buildContextBudgetInstruction(scene, depth, maxContextChars, maxOutputTokens) {
  const output =
    SCENE_OUTPUT_INSTRUCTIONS[scene]?.[depth] ||
    SCENE_OUTPUT_INSTRUCTIONS[scene]?.balanced ||
    "";
  return `${output} 本次最多带入 ${maxContextChars} 个上下文字符，模型输出上限 ${maxOutputTokens} token；材料不足时直接说明，不补写未提供内容。`;
}

function formatCompanionFocusLabel(focus) {
  const label = toText(focus?.label).trim();
  const userText = toText(focus?.userText).trim();
  const aiSummary = toText(focus?.aiSummary).trim();
  return [label, userText || aiSummary].filter(Boolean).join("：");
}

function formatContractDifficultyHints(items) {
  return asArray(items)
    .map((item) => {
      const title = [
        toText(item?.topic).trim(),
        item?.where ? `位置：${toText(item.where).trim()}` : "",
      ]
        .filter(Boolean)
        .join("，");
      const detail = [
        toText(item?.whyHard).trim(),
        item?.supportStrategy ? `读伴可这样帮：${toText(item.supportStrategy).trim()}` : "",
      ]
        .filter(Boolean)
        .join("；");
      return [title, detail].filter(Boolean).join("：");
    })
    .filter(Boolean)
    .join("；");
}

function formatContractKeyTurns(items) {
  return asArray(items)
    .map((item) =>
      [toText(item?.title).trim(), toText(item?.whyItMatters).trim()]
        .filter(Boolean)
        .join("：")
    )
    .filter(Boolean)
    .join("；");
}

function formatContractAvailableSummary(available = {}) {
  const parts = [];
  if (available.wholeBookGuide) parts.push("已有整本书导读");
  if (available.companionFocus) parts.push("已有用户选择的读伴侧重点");
  if (available.structureMatch) parts.push("当前阅读项匹配到全书结构位置");
  if (available.difficultyMatch) parts.push("当前阅读项匹配到阅读难点");
  if (available.companionMemory) parts.push("已按当前问题筛选用户记忆");
  return parts.length > 0 ? parts.join("；") : "仅使用本次可核验材料。";
}

function toSourceRef(source) {
  return {
    id: source.id,
    kind: source.kind,
    purpose: source.purpose,
    itemKey: toText(source.itemKey).trim() || null,
    pageNumber: positiveInteger(source.pageNumber),
    pageEnd: positiveInteger(source.pageEnd),
    chapterId: toText(source.chapterId).trim() || null,
    contentBlockId: toText(source.contentBlockId).trim() || null,
    contentFingerprint: source.contentFingerprint || null,
    quality: source.quality || null,
    memorySource: toText(source.memorySource).trim() || null,
    sourceItemKey: toText(source.sourceItemKey).trim() || null,
    sourceEventId: toText(source.sourceEventId).trim() || null,
    relevance: toText(source.relevance).trim() || null,
    charCount: source.text.length,
    originalCharCount: source.originalCharCount || source.text.length,
    compacted: Boolean(source.compacted),
    truncated: Boolean(source.truncated),
  };
}

function relevanceScore(value, query) {
  const textTokens = tokenSet(value);
  const queryTokens = tokenSet(query);
  if (textTokens.size === 0 || queryTokens.size === 0) return 0;
  let score = 0;
  for (const token of textTokens) {
    if (queryTokens.has(token)) score += token.length >= 2 ? 3 : 1;
  }
  return score;
}

function guideRelevanceScore(value, query) {
  const textTokens = tokenSet(value);
  const queryTokens = tokenSet(query);
  let score = 0;
  for (const token of textTokens) {
    if (token.length >= 2 && queryTokens.has(token)) score += 3;
  }
  return score;
}

function tokenSet(value) {
  const normalized = toText(value).toLowerCase().replace(/\s+/g, "");
  const tokens = new Set(normalized.match(/[a-z0-9_]{2,}|[\u3400-\u9fff]{1,2}/g) || []);
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const pair = normalized.slice(index, index + 2);
    if (/[\u3400-\u9fff]{2}/.test(pair)) tokens.add(pair);
  }
  return tokens;
}

function estimateTokens(value) {
  const text = toText(value);
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9_]+/g) || []).length;
  const other = Math.max(0, (text.match(/\S/g) || []).length - cjk);
  return Math.max(0, Math.ceil(cjk * 1.2 + words * 1.35 + other / 4));
}

function formatPageRange(source) {
  if (!source.pageNumber) return "";
  return source.pageEnd && source.pageEnd !== source.pageNumber
    ? ` · 第 ${source.pageNumber}-${source.pageEnd} 页`
    : ` · 第 ${source.pageNumber} 页`;
}

function exclusion(kind, reason, detail) {
  return { kind, reason, detail };
}

function dedupeExclusions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.kind}:${item.reason}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function setCachedContext(key, value) {
  if (contextCache.size >= CONTEXT_CACHE_LIMIT) {
    contextCache.delete(contextCache.keys().next().value);
  }
  contextCache.set(key, clone(value));
}

function touchCache(key, value) {
  contextCache.delete(key);
  contextCache.set(key, value);
}

function withCacheState(value, hit) {
  const next = clone(value);
  next.trace.cache = { ...next.trace.cache, hit };
  return next;
}

function clone(value) {
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanKey(value) {
  return toText(value).trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
