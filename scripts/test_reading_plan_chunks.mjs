import assert from "node:assert/strict";
import {
  READING_PLAN_CHUNKING_VERSION,
  repairLegacyReadingPlan,
  splitChapterIntoPlanChunks,
} from "../src/lib/readingPlanChunks.js";

const chapter = {
  title: "第一章 万历皇帝",
  startPage: 15,
  endPage: 62,
};

assert.deepEqual(
  splitChapterIntoPlanChunks(chapter, {
    splitLongChapters: true,
    maxPagesPerSession: 45,
  }),
  [
    {
      title: "第一章 万历皇帝",
      startPage: 15,
      endPage: 62,
    },
  ],
  "只比单次上限多 3 页时不应产生纯注释尾段"
);

assert.deepEqual(
  splitChapterIntoPlanChunks(
    { title: "长章节", startPage: 1, endPage: 80 },
    {
      splitLongChapters: true,
      maxPagesPerSession: 45,
    }
  ),
  [
    { title: "长章节（第 1 段）", startPage: 1, endPage: 40 },
    { title: "长章节（第 2 段）", startPage: 41, endPage: 80 },
  ],
  "确实需要拆分时应均匀分配，不留下过短尾段"
);

const threeChunks = splitChapterIntoPlanChunks(
  { title: "更长章节", startPage: 11, endPage: 110 },
  {
    splitLongChapters: true,
    maxPagesPerSession: 45,
  }
);
assert.deepEqual(
  threeChunks.map((item) => item.endPage - item.startPage + 1),
  [34, 33, 33]
);
assert.equal(threeChunks.at(-1).endPage, 110);

assert.deepEqual(
  splitChapterIntoPlanChunks(chapter, {
    splitLongChapters: false,
    maxPagesPerSession: 25,
  }),
  [{ title: "第一章 万历皇帝", startPage: 15, endPage: 62 }]
);

const legacyBook = {
  id: "book-1",
  chapters: [{ id: "chapter-1", title: chapter.title, startPage: 15, endPage: 62 }],
  readingProfile: { pace: { maxPagesPerSession: 45 } },
  readingPlan: {
    items: [
      {
        id: "main:chapter-1:15-59",
        title: "第一章 万历皇帝（第 1 段）",
        type: "main",
        chapterIds: ["chapter-1"],
        startPage: 15,
        endPage: 59,
      },
      {
        id: "main:chapter-1:60-62",
        title: "第一章 万历皇帝（第 2 段）",
        type: "main",
        chapterIds: ["chapter-1"],
        startPage: 60,
        endPage: 62,
      },
    ],
  },
};
const legacyProgress = {
  currentItemIndex: 1,
  completedItemKeys: ["main:chapter-1:15-59"],
  completedAtByItemKey: { "main:chapter-1:15-59": "2026-07-22T09:00:00.000Z" },
  currentPageByItemKey: {
    "main:chapter-1:15-59": {
      pageNumber: 59,
      updatedAt: "2026-07-22T09:00:00.000Z",
    },
    "main:chapter-1:60-62": {
      pageNumber: 60,
      updatedAt: "2026-07-23T09:00:00.000Z",
    },
  },
};
const repairedLegacy = repairLegacyReadingPlan(legacyBook, legacyProgress);

assert.equal(repairedLegacy.changed, true);
assert.equal(
  repairedLegacy.book.readingPlan.chunkingVersion,
  READING_PLAN_CHUNKING_VERSION
);
assert.deepEqual(repairedLegacy.book.readingPlan.items, [
  {
    id: "main:chapter-1:60-62",
    title: "第一章 万历皇帝",
    type: "main",
    chapterIds: ["chapter-1"],
    startPage: 15,
    endPage: 62,
    day: 1,
  },
]);
assert.equal(repairedLegacy.progress.currentItemIndex, 0);
assert.deepEqual(repairedLegacy.progress.completedItemKeys, []);
assert.equal(
  repairedLegacy.progress.currentPageByItemKey["main:chapter-1:60-62"].pageNumber,
  60
);

const idlessLegacyBook = {
  ...legacyBook,
  readingPlan: {
    items: [
      {
        title: "序言",
        type: "guide",
        chapterIds: ["preface"],
        startPage: 2,
        endPage: 5,
      },
      ...legacyBook.readingPlan.items.map(({ id, ...item }) => item),
    ],
  },
};
const idlessProgress = {
  currentItemIndex: 2,
  completedItemKeys: ["main:1"],
  currentPageByItemKey: {
    "main:1": {
      pageNumber: 59,
      updatedAt: "2026-07-22T09:00:00.000Z",
    },
    "main:2": {
      pageNumber: 60,
      updatedAt: "2026-07-23T09:00:00.000Z",
    },
  },
};
const repairedIdlessLegacy = repairLegacyReadingPlan(idlessLegacyBook, idlessProgress);
assert.equal(repairedIdlessLegacy.book.readingPlan.items.length, 2);
assert.equal(repairedIdlessLegacy.progress.currentItemIndex, 1);
assert.equal(
  repairedIdlessLegacy.progress.currentPageByItemKey["main:2"].pageNumber,
  60,
  "没有稳定 ID 的旧计划也应保留原计划序号对应的阅读位置"
);
assert.equal(
  repairedIdlessLegacy.progress.currentPageByItemKey["main:1"],
  undefined
);

const realLongBook = {
  ...legacyBook,
  chapters: [{ id: "chapter-1", title: "长章节", startPage: 1, endPage: 80 }],
  readingPlan: {
    items: [
      {
        id: "long-1",
        title: "长章节（第 1 段）",
        chapterIds: ["chapter-1"],
        startPage: 1,
        endPage: 40,
      },
      {
        id: "long-2",
        title: "长章节（第 2 段）",
        chapterIds: ["chapter-1"],
        startPage: 41,
        endPage: 80,
      },
    ],
  },
};
assert.equal(
  repairLegacyReadingPlan(realLongBook, { currentItemIndex: 0 }).book.readingPlan.items.length,
  2,
  "真正的长章节仍应保留均匀分段"
);
assert.deepEqual(
  repairLegacyReadingPlan(realLongBook, { currentItemIndex: 0 }).book.readingPlan.items.map(
    (item) => item.day
  ),
  [1, 2]
);

console.log("Reading plan chunk tests passed.");
