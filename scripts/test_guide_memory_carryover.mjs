import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCompanionContext,
  clearCompanionContextCache,
} from "../src/lib/companionContext.js";

const settings = {
  provider: "anthropic",
  anthropic: { model: "claude-test", hasApiKey: true },
  openaiCompatible: {},
  aiProfiles: { enabled: true, tasks: {} },
};

const item = {
  id: "item-2",
  day: 3,
  title: "县制与地方官僚",
  startPage: 21,
  endPage: 30,
};
const chapterSections = [
  {
    chapter: {
      id: "chapter-3",
      title: "第三章 县制与地方官僚",
      startPage: 21,
      endPage: 30,
    },
    text: "本章从县制入手讨论地方官僚如何处理赋税与行政事务。",
  },
];

function createBook(unrelatedText = "我还关心文学修辞") {
  return {
    id: "book-1",
    title: "制度史测试书",
    author: "测试作者",
    readingProfile: {
      companionPolicy: {
        spoiler: "avoid",
        answerDepth: "balanced",
        followUp: "helpful",
        knowledgeBoundary: "text_first",
      },
      companionMemory: {
        initialized: true,
        items: [
          {
            id: "memory-previous",
            text: "上一节我仍没想通中央命令怎样落到地方。",
            source: "session_record",
            sourceItemKey: "item-1",
            sourceEventId: "event-previous",
          },
          {
            id: "memory-older-related",
            text: "我想继续追踪县制和赋税之间的关系。",
            source: "session_record",
            sourceItemKey: "item-0",
            sourceEventId: "event-older",
          },
          {
            id: "memory-global-related",
            text: "解释地方官僚时请先讲清行政层级。",
            source: "user",
          },
          {
            id: "memory-unrelated",
            text: unrelatedText,
            source: "user",
          },
          {
            id: "memory-current",
            text: "县制当前项的记录不能提前进入自己的导读。",
            source: "session_record",
            sourceItemKey: "item-2",
          },
          {
            id: "memory-future",
            text: "未来章节也会继续讨论县制和地方官僚。",
            source: "session_record",
            sourceItemKey: "item-3",
          },
          {
            id: "memory-missing-source",
            text: "来源不明的县制记录。",
            source: "session_record",
          },
          {
            id: "memory-legacy",
            text: "旧设置迁入的县制偏好。",
            source: "legacy",
          },
        ],
      },
    },
  };
}

function buildGuide(book) {
  return buildCompanionContext({
    scene: "readingGuide",
    book,
    item,
    itemKey: item.id,
    chapterSections,
    settings,
    cacheIdentity: { position: "第 3 / 4 个阅读项" },
    memoryScope: {
      previousItemKey: "item-1",
      priorItemKeys: ["item-0", "item-1"],
    },
  });
}

clearCompanionContextCache();
const guide = buildGuide(createBook());
const instruction = guide.contractPromptValues.contractCompanionMemoryInstruction;
assert.match(instruction, /上一节我仍没想通中央命令怎样落到地方/);
assert.match(instruction, /我想继续追踪县制和赋税之间的关系/);
assert.match(instruction, /解释地方官僚时请先讲清行政层级/);
assert.doesNotMatch(instruction, /文学修辞/);
assert.doesNotMatch(instruction, /当前项的记录/);
assert.doesNotMatch(instruction, /未来章节/);
assert.doesNotMatch(instruction, /来源不明/);
assert.doesNotMatch(instruction, /旧设置迁入/);

const memoryRefs = guide.trace.sourceRefs.filter((source) => source.kind === "memory");
assert.equal(memoryRefs.length, 3);
assert.deepEqual(
  memoryRefs.map((source) => source.id).sort(),
  ["memory:memory-global-related", "memory:memory-older-related", "memory:memory-previous"]
);
assert.ok(
  memoryRefs.some(
    (source) =>
      source.sourceItemKey === "item-1" &&
      source.sourceEventId === "event-previous" &&
      source.relevance === "previous-item" &&
      source.quality === "user-confirmed"
  )
);
assert.ok(
  guide.trace.excluded.some(
    (entry) => entry.kind === "memory" && entry.reason === "reading-frontier"
  )
);
assert.ok(
  guide.trace.excluded.some(
    (entry) => entry.kind === "memory" && entry.reason === "not-explicitly-retained"
  )
);
assert.doesNotMatch(
  JSON.stringify(guide.trace),
  /中央命令|县制和赋税|地方官僚时请先讲清|文学修辞|未来章节/
);

const changedUnrelated = buildGuide(createBook("我还关心诗歌格律和叙述节奏"));
assert.equal(
  changedUnrelated.trace.cacheKey,
  guide.trace.cacheKey,
  "未被选中的无关记忆不应让导读缓存失效"
);
assert.equal(changedUnrelated.trace.cache.hit, true);

const changedSelectedBook = createBook();
changedSelectedBook.readingProfile.companionMemory.items[0].text =
  "上一节我已经理解中央命令如何传到地方。";
const changedSelected = buildGuide(changedSelectedBook);
assert.notEqual(
  changedSelected.trace.cacheKey,
  guide.trace.cacheKey,
  "实际承接的记录发生变化时必须重新生成导读"
);

const firstItem = buildCompanionContext({
  scene: "readingGuide",
  book: createBook(),
  item: { ...item, id: "item-0", day: 1 },
  itemKey: "item-0",
  chapterSections,
  settings,
  memoryScope: { previousItemKey: "", priorItemKeys: [] },
});
assert.doesNotMatch(
  firstItem.contractPromptValues.contractCompanionMemoryInstruction,
  /上一节我仍没想通中央命令怎样落到地方/,
  "第一项导读不能承接未来阅读项的记录"
);

const [guidePrompt, guideSource] = await Promise.all([
  readFile(new URL("../src/prompts/readingGuide.md", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/readingGuides.js", import.meta.url), "utf8"),
]);
assert.match(guidePrompt, /本次允许承接的用户记录/);
assert.match(guidePrompt, /按阅读顺序、相关性和用户确认状态筛选/);
assert.match(guideSource, /priorItemKeys/);
assert.match(guideSource, /previousItemKey/);

console.log("Controlled reading-guide memory carryover tests passed.");
