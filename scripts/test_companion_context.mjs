import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCompanionContext,
  clearCompanionContextCache,
  getCompanionContextCacheSize,
} from "../src/lib/companionContext.js";
import { resolveAiProfileRequest } from "../src/lib/aiProfiles.js";

const currentText = "CURRENT_PAGE_MARKER 当前页正在解释县级行政如何运作。";
const priorText = "CONFIRMED_READ_MARKER 这是用户此前认真读过的内容。";
const unreadText = "UNREAD_SECRET_MARKER 后文发生了不应提前透露的关键转折。";
const assistantLeak = "ASSISTANT_LEAK_MARKER 后面你会看到结局。";
const guideLeak = "GUIDE_LEAK_MARKER 导读里可能含后文线索。";

const settings = {
  provider: "anthropic",
  anthropic: { model: "claude-test", hasApiKey: true },
  openaiCompatible: {},
  aiProfiles: { enabled: true, tasks: {} },
};
const item = {
  id: "item-1",
  day: 1,
  title: "第一章",
  startPage: 1,
  endPage: 3,
};
const chapterSections = [
  {
    chapter: { id: "chapter-1", title: "第一章", startPage: 1, endPage: 3 },
    text: `${currentText}\n${priorText}\n${unreadText}`,
  },
];
const readingContext = {
  currentBlocks: [
    {
      id: "block-current",
      text: currentText,
      textFingerprint: "fnv1a:current",
      pageNumber: 2,
      quality: "good",
    },
    {
      id: "block-unusable",
      text: "UNUSABLE_MARKER",
      textFingerprint: "fnv1a:unusable",
      pageNumber: 2,
      quality: "unusable",
    },
  ],
  priorBlocks: [
    {
      id: "block-prior",
      text: priorText,
      textFingerprint: "fnv1a:prior",
      pageNumber: 1,
      quality: "good",
    },
  ],
};
const guide = { overview: guideLeak, goals: [], questions: [] };
const history = [
  { id: "history-user", role: "user", content: "我刚才问过制度背景。" },
  { id: "history-assistant", role: "assistant", content: assistantLeak },
];
const quote = {
  text: "县级行政",
  pageNumber: 2,
  contentBlockId: "block-current",
  contentFingerprint: "fnv1a:quote",
};

function createBook(policy = {}) {
  return {
    id: "book-1",
    title: "测试书",
    author: "测试作者",
    readingProfile: {
      companionPolicy: {
        spoiler: "avoid",
        answerDepth: "balanced",
        followUp: "helpful",
        knowledgeBoundary: "text_first",
        ...policy,
      },
      companionMemory: {
        initialized: true,
        items: [
          { id: "memory-related", text: "解释行政制度时先用白话", source: "user" },
          { id: "memory-other", text: "我也关心文学修辞", source: "user" },
        ],
      },
    },
  };
}

function buildChat(overrides = {}) {
  return buildCompanionContext({
    scene: "readingChat",
    book: createBook(),
    item,
    itemKey: item.id,
    chapterSections,
    currentPageContext: { pageNumber: 2, text: currentText, quality: "usable" },
    readingContext,
    guide,
    history,
    userMessage: "这里的行政制度是什么意思？",
    quote,
    settings,
    ...overrides,
  });
}

clearCompanionContextCache();
const strict = buildChat();
const strictRequestMaterial = JSON.stringify({
  sections: strict.sections,
  contract: strict.contractPromptValues,
});
assert.match(strictRequestMaterial, /CURRENT_PAGE_MARKER/);
assert.match(strictRequestMaterial, /CONFIRMED_READ_MARKER/);
assert.match(strictRequestMaterial, /县级行政/);
assert.doesNotMatch(strictRequestMaterial, /UNREAD_SECRET_MARKER/);
assert.doesNotMatch(strictRequestMaterial, /ASSISTANT_LEAK_MARKER/);
assert.doesNotMatch(strictRequestMaterial, /GUIDE_LEAK_MARKER/);
assert.doesNotMatch(strictRequestMaterial, /UNUSABLE_MARKER/);
assert.ok(
  strict.trace.sourceRefs.some(
    (source) => source.contentBlockId === "block-current" && source.pageNumber === 2
  ),
  "当前页材料必须可追溯到正文块"
);
assert.ok(
  strict.trace.sourceRefs.some((source) => source.contentBlockId === "block-prior"),
  "确认已读材料必须可追溯到正文块"
);
assert.ok(
  strict.trace.excluded.some(
    (entry) => entry.kind === "unread_item" && entry.reason === "spoiler-policy"
  )
);
assert.doesNotMatch(JSON.stringify(strict.trace), /CURRENT_PAGE_MARKER|CONFIRMED_READ_MARKER/);
assert.equal(strict.maxOutputTokens, 1500);
assert.equal(strict.trace.maxContextChars, 7200);
assert.match(strict.contextBudgetInstruction, /3-5 个短段落/);

const strictAgain = buildChat();
assert.equal(strictAgain.trace.cache.hit, true);
assert.equal(strictAgain.trace.cacheKey, strict.trace.cacheKey);
assert.equal(getCompanionContextCacheSize(), 1);

const changedContent = buildChat({
  readingContext: {
    ...readingContext,
    currentBlocks: [
      {
        ...readingContext.currentBlocks[0],
        id: "block-current-v2",
        text: `${currentText} 内容有更新。`,
        textFingerprint: "fnv1a:current-v2",
      },
    ],
  },
});
assert.notEqual(changedContent.trace.cacheKey, strict.trace.cacheKey);

const changedPolicy = buildChat({
  book: createBook({ answerDepth: "deep" }),
});
assert.notEqual(changedPolicy.trace.cacheKey, strict.trace.cacheKey);
assert.equal(changedPolicy.maxOutputTokens, 2600);
assert.equal(changedPolicy.trace.maxContextChars, 10000);
assert.match(changedPolicy.contextBudgetInstruction, /5-8 个短段落/);

const concise = buildChat({
  book: createBook({ answerDepth: "concise" }),
});
assert.equal(concise.maxOutputTokens, 700);
assert.equal(concise.trace.maxContextChars, 4200);
assert.match(concise.contextBudgetInstruction, /不超过 2 个短段落/);

const changedContractBook = createBook();
changedContractBook.readingProfile.companionFocus = {
  type: "background",
  label: "帮我补背景",
  userText: "优先解释制度背景",
};
const changedContract = buildChat({ book: changedContractBook });
assert.notEqual(changedContract.trace.cacheKey, strict.trace.cacheKey);

const changedModel = buildChat({
  settings: {
    ...settings,
    anthropic: { ...settings.anthropic, model: "claude-other" },
  },
});
assert.notEqual(changedModel.trace.cacheKey, strict.trace.cacheKey);

const openAiSettings = {
  provider: "openai-compatible",
  anthropic: {},
  openaiCompatible: {
    model: "same-model",
    baseUrl: "https://one.example.com/v1",
    hasApiKey: true,
  },
  aiProfiles: { enabled: true, tasks: {} },
};
const firstEndpoint = buildChat({ settings: openAiSettings });
const secondEndpoint = buildChat({
  settings: {
    ...openAiSettings,
    openaiCompatible: {
      ...openAiSettings.openaiCompatible,
      baseUrl: "https://two.example.com/v1",
    },
  },
});
assert.notEqual(firstEndpoint.trace.cacheKey, secondEndpoint.trace.cacheKey);

const changedPrompt = buildChat({ promptVersion: "reading-chat:p7.7-v2-test" });
assert.notEqual(changedPrompt.trace.cacheKey, strict.trace.cacheKey);

const hint = buildChat({ book: createBook({ spoiler: "hint" }) });
assert.doesNotMatch(JSON.stringify(hint.sections), /UNREAD_SECRET_MARKER/);

const open = buildChat({ book: createBook({ spoiler: "allow" }) });
assert.match(JSON.stringify(open.sections), /UNREAD_SECRET_MARKER/);
assert.match(JSON.stringify(open.sections), /ASSISTANT_LEAK_MARKER/);
assert.match(JSON.stringify(open.sections), /GUIDE_LEAK_MARKER/);

const incompleteReflection = buildCompanionContext({
  scene: "readingReflection",
  book: createBook(),
  item,
  itemKey: item.id,
  chapterSections,
  readingContext,
  guide,
  history,
  readingChatMessages: history,
  readingNotes: [{ id: "note-1", text: "用户笔记原文", note: "我的判断" }],
  userMessage: "我觉得制度很复杂。",
  settings,
  itemCompleted: false,
});
assert.doesNotMatch(JSON.stringify(incompleteReflection.sections), /UNREAD_SECRET_MARKER/);

const completedReflection = buildCompanionContext({
  scene: "readingReflection",
  book: createBook(),
  item,
  itemKey: item.id,
  chapterSections,
  guide,
  history,
  readingChatMessages: history,
  readingNotes: [{ id: "note-1", text: "用户笔记原文", note: "我的判断" }],
  userMessage: "我觉得制度很复杂。",
  settings,
  itemCompleted: true,
});
assert.match(JSON.stringify(completedReflection.sections), /UNREAD_SECRET_MARKER/);
assert.ok(completedReflection.trace.sourceRefs.some((source) => source.kind === "note"));

const guideContext = buildCompanionContext({
  scene: "readingGuide",
  book: createBook(),
  item,
  itemKey: item.id,
  chapterSections,
  settings,
  cacheIdentity: { position: "第 1 / 1 个阅读项" },
});
assert.match(guideContext.sections.chapterText, /UNREAD_SECRET_MARKER/);
assert.equal(guideContext.maxOutputTokens, 3200);
assert.match(guideContext.guideOverviewRequirement, /220-360 字/);
assert.match(guideContext.guideCompactOutputRequirement, /240-320 字/);

const longGuideContext = buildCompanionContext({
  scene: "readingGuide",
  book: createBook(),
  item,
  itemKey: item.id,
  chapterSections: [
    {
      chapter: { id: "long-chapter", title: "长章节", startPage: 1, endPage: 20 },
      text: `INPUT_HEAD_MARKER${"甲".repeat(9000)}INPUT_MIDDLE_MARKER${"乙".repeat(
        9000
      )}INPUT_TAIL_MARKER`,
    },
  ],
  settings,
  cacheIdentity: { position: "第 1 / 1 个阅读项", case: "compact-input" },
  contextCompression: "compact",
});
assert.equal(longGuideContext.trace.maxContextChars, 5500);
assert.equal(longGuideContext.trace.inputCompression.mode, "compact");
assert.equal(longGuideContext.trace.inputCompression.compactedSourceCount, 1);
assert.match(longGuideContext.sections.chapterText, /INPUT_HEAD_MARKER/);
assert.match(longGuideContext.sections.chapterText, /INPUT_MIDDLE_MARKER/);
assert.match(longGuideContext.sections.chapterText, /INPUT_TAIL_MARKER/);
assert.match(longGuideContext.sections.chapterText, /中间内容已按上下文预算压缩/);
assert.ok(
  longGuideContext.trace.sourceRefs.some(
    (source) => source.compacted && source.originalCharCount > source.charCount
  )
);

const profileWithHigherLimit = {
  ...settings,
  aiProfiles: {
    enabled: true,
    tasks: {
      readingChat: {
        enabled: true,
        maxTokens: "9000",
      },
    },
  },
};
assert.equal(
  resolveAiProfileRequest({
    settings: profileWithHigherLimit,
    taskType: "readingChat",
    maxTokens: 700,
    hardMaxTokens: 700,
  }).maxTokens,
  700,
  "模型 profile 不得突破简短回答的硬上限"
);
assert.equal(
  resolveAiProfileRequest({
    settings: {
      ...profileWithHigherLimit,
      aiProfiles: {
        enabled: true,
        tasks: { readingChat: { enabled: true, maxTokens: "400" } },
      },
    },
    taskType: "readingChat",
    maxTokens: 700,
    hardMaxTokens: 700,
  }).maxTokens,
  400,
  "模型 profile 仍可主动调低上限"
);

const [contextSource, guideSource, readerSource] = await Promise.all([
  readFile(new URL("../src/lib/companionContext.js", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/readingGuides.js", import.meta.url), "utf8"),
  readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8"),
]);
assert.doesNotMatch(contextSource, /callModelDetailed|streamModelDetailed/);
assert.ok(
  guideSource.indexOf("cachedGuide?.contextTrace?.cacheKey") <
    guideSource.indexOf("const generation = await callReadingGuideWithRecovery"),
  "章节导读必须先检查完整制品缓存，再调用模型"
);
const pageChangeHandler = readerSource.slice(
  readerSource.indexOf("function handleCurrentPageChange"),
  readerSource.indexOf("async function handleGenerateGuide")
);
assert.doesNotMatch(
  pageChangeHandler,
  /sendReadingChatMessage|sendReadingReflectionMessage|generateReadingGuide/,
  "翻页或停留不能自动触发模型"
);

console.log("Companion context orchestration tests passed.");
