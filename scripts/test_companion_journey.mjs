import assert from "node:assert/strict";
import {
  BOOK_COMPANION_JOURNEY_ITEM_KEY,
  COMPANION_JOURNEY_SCENES,
  COMPANION_JOURNEY_STATUSES,
  COMPANION_JOURNEY_TYPES,
  buildCompanionJourney,
  filterCompanionJourney,
} from "../src/lib/companionJourney.js";
import {
  loadBookCompanionJourney,
  loadCompanionJourney,
} from "../src/lib/companionJourneyStore.js";

assert.equal(typeof loadCompanionJourney, "function");
assert.equal(typeof loadBookCompanionJourney, "function");

const fixture = {
  bookId: "book-1",
  planItems: [
    { id: "item-a", title: "第一节", type: "chapter" },
    { id: "item-b", title: "第二节", type: "chapter" },
  ],
  guidesByItemKey: {
    "item-a": {
      overview: "先留意作者如何提出问题。",
      questions: ["作者为什么从这个例子开始？"],
      generatedAt: "2026-07-14T01:00:00.000Z",
    },
  },
  chatStore: {
    "item-a": [
      {
        id: "question-1",
        role: "user",
        content: "这里的歙县指什么？",
        quote: {
          pageNumber: 6,
          text: "歙县",
          rects: [{ x: -0.2, y: 0.2, width: 1.4, height: 0.1 }],
        },
        createdAt: "2026-07-14T02:00:00.000Z",
      },
      {
        id: "question-1",
        role: "user",
        content: "同一个来源 id 的重复记录不应再次出现。",
        createdAt: "2026-07-14T02:00:01.000Z",
      },
      {
        id: "answer-1",
        role: "assistant",
        content: "这里指徽州府下辖的歙县。",
        createdAt: "2026-07-14T03:00:00.000Z",
      },
    ],
    [BOOK_COMPANION_JOURNEY_ITEM_KEY]: [
      {
        id: "book-chat-1",
        role: "user",
        content: "我们聊聊这本书的主线。",
        createdAt: "2026-07-14T06:00:00.000Z",
      },
    ],
    "missing-item": [
      {
        id: "orphan-1",
        role: "assistant",
        content: "这是一条来自旧阅读项的记录。",
        createdAt: "2026-07-14T07:00:00.000Z",
      },
    ],
  },
  reflectionStore: {
    "item-a": [
      {
        id: "reflection-1",
        role: "user",
        content: "这一节让我看到地方治理的复杂性。",
        createdAt: "2026-07-14T05:00:00.000Z",
      },
    ],
  },
  notesStore: {
    "item-a": [
      {
        id: "note-1",
        text: "歙县",
        note: "后续继续观察县与府的关系。",
        pageNumber: 6,
        createdAt: "2026-07-14T04:00:00.000Z",
      },
    ],
  },
};

const journey = buildCompanionJourney(fixture);

assert.equal(journey.length, 7, "应聚合导读、问答、笔记、读后、闲聊和旧记录");
assert.deepEqual(
  journey.map((entry) => entry.type),
  [
    COMPANION_JOURNEY_TYPES.guideClue,
    COMPANION_JOURNEY_TYPES.selectionQuestion,
    COMPANION_JOURNEY_TYPES.companionAnswer,
    COMPANION_JOURNEY_TYPES.note,
    COMPANION_JOURNEY_TYPES.reflection,
    COMPANION_JOURNEY_TYPES.bookChat,
    COMPANION_JOURNEY_TYPES.companionAnswer,
  ],
  "有时间的记录应按时间升序排列"
);

const selection = journey.find(
  (entry) => entry.type === COMPANION_JOURNEY_TYPES.selectionQuestion
);
assert.equal(selection.scene, COMPANION_JOURNEY_SCENES.reading);
assert.equal(selection.readingItemId, "item-a");
assert.equal(selection.sourceRef.pageNumber, 6);
assert.deepEqual(selection.sourceRef.rects[0], {
  x: 0,
  y: 0.2,
  width: 1,
  height: 0.1,
});
assert.equal(
  selection.payload.content,
  "这里的歙县指什么？",
  "同 source id 的重复记录应保留首次出现项"
);

const bookChat = journey.find((entry) => entry.type === COMPANION_JOURNEY_TYPES.bookChat);
assert.equal(bookChat.scene, COMPANION_JOURNEY_SCENES.book);
assert.equal(bookChat.itemKey, BOOK_COMPANION_JOURNEY_ITEM_KEY);
assert.equal(bookChat.status, COMPANION_JOURNEY_STATUSES.available);

const orphan = journey.find((entry) => entry.itemKey === "missing-item");
assert.equal(orphan.readingItemId, null);
assert.equal(orphan.status, COMPANION_JOURNEY_STATUSES.orphaned);

const currentItemJourney = filterCompanionJourney(journey, {
  itemKey: "item-a",
  includeOrphaned: false,
});
assert.equal(currentItemJourney.length, 5);

const secondBuild = buildCompanionJourney(fixture);
assert.deepEqual(
  secondBuild.map((entry) => entry.id),
  journey.map((entry) => entry.id),
  "相同旧数据必须生成稳定 journey id"
);

const legacyJourney = buildCompanionJourney({
  bookId: "legacy-book",
  planItems: fixture.planItems,
  guidesByItemKey: {
    "item-a": "旧版本保存的纯文本导读",
  },
  chatStore: [
    {
      role: "user",
      content: "没有阅读项分组的旧消息",
    },
  ],
});
assert.equal(legacyJourney.length, 2);
assert.equal(legacyJourney[0].payload.notes, "旧版本保存的纯文本导读");
assert.equal(legacyJourney[1].itemKey, null);
assert.equal(legacyJourney[1].status, COMPANION_JOURNEY_STATUSES.orphaned);

const noDateJourney = buildCompanionJourney({
  bookId: "no-date-book",
  planItems: [{ id: "item-a", title: "第一节" }],
  guidesByItemKey: {
    "item-a": { overview: "无日期导读" },
  },
  chatStore: {
    "item-a": [{ id: "message-no-date", role: "user", content: "无日期问题" }],
  },
});
assert.deepEqual(
  noDateJourney.map((entry) => entry.type),
  [COMPANION_JOURNEY_TYPES.guideClue, COMPANION_JOURNEY_TYPES.userQuestion],
  "缺少时间时应使用阅读项和场景顺序稳定降级"
);

console.log(`Companion journey tests passed (${journey.length + legacyJourney.length + noDateJourney.length} entries checked).`);
