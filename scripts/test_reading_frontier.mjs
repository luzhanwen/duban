import assert from "node:assert/strict";
import { buildBookContentMap } from "../src/lib/contentMap.js";
import {
  buildAllowedReadingContext,
  isBlockEngaged,
  normalizeReadStateByItemKey,
  updateProgressReadState,
} from "../src/lib/readingFrontier.js";

const repeated = (label) => `${label}说明这一页的制度背景和实际运作方式。`.repeat(8);
const contentMap = buildBookContentMap({
  book: { id: "book-1", format: "pdf", chapters: [] },
  pages: [
    { pageNumber: 1, text: repeated("第一页") },
    { pageNumber: 2, text: repeated("第二页") },
    { pageNumber: 3, text: repeated("未读第三页") },
  ],
  planItems: [{ id: "item-1", startPage: 1, endPage: 3 }],
});

assert.deepEqual(normalizeReadStateByItemKey(null), {}, "旧进度缺少阅读状态时应按空对象兼容");

let progress = { readStateByItemKey: {} };
progress = updateProgressReadState(progress, {
  contentMap,
  itemKey: "item-1",
  pageNumber: 1,
  level: "reached",
  timestamp: "2026-07-17T01:00:00.000Z",
});
assert.equal(isBlockEngaged(progress, "item-1", contentMap.blocks[0], contentMap), false);

progress = updateProgressReadState(progress, {
  contentMap,
  itemKey: "item-1",
  pageNumber: 1,
  level: "engaged",
  timestamp: "2026-07-17T01:00:03.000Z",
});
assert.equal(isBlockEngaged(progress, "item-1", contentMap.blocks[0], contentMap), true);

progress = updateProgressReadState(progress, {
  contentMap,
  itemKey: "item-1",
  pageNumber: 3,
  level: "reached",
  timestamp: "2026-07-17T01:00:05.000Z",
});
const middleBlock = contentMap.blocks.find((block) => block.pageNumber === 2);
assert.equal(isBlockEngaged(progress, "item-1", middleBlock, contentMap), false, "跳页不能补齐中间已读状态");

const context = buildAllowedReadingContext({
  contentMap,
  progress,
  itemKey: "item-1",
  currentPageNumber: 2,
});
assert.match(context.text, /第一页/);
assert.doesNotMatch(context.text, /第二页/);
assert.doesNotMatch(context.text, /未读第三页/);

const overlappingMap = buildBookContentMap({
  book: { id: "book-1", format: "text", chapters: [] },
  pages: [
    { pageNumber: 1, text: repeated("重叠第一页") },
    { pageNumber: 2, text: repeated("重叠第二页") },
  ],
  planItems: [
    { id: "guide-item", type: "guide", startPage: 1, endPage: 2 },
    { id: "main-item", type: "main", startPage: 1, endPage: 2 },
  ],
});
const overlappingProgress = updateProgressReadState({}, {
  contentMap: overlappingMap,
  itemKey: "main-item",
  pageNumber: 1,
  level: "engaged",
  timestamp: "2026-07-17T01:00:30.000Z",
});
assert.deepEqual(overlappingProgress.readStateByItemKey["main-item"].engagedRanges, [[0, 0]]);

progress = updateProgressReadState(progress, {
  contentMap,
  itemKey: "item-1",
  pageNumber: 3,
  level: "completed",
  timestamp: "2026-07-17T01:01:00.000Z",
});
assert.ok(progress.readStateByItemKey["item-1"].completedAt);
assert.ok(contentMap.blocks.every((block) => isBlockEngaged(progress, "item-1", block, contentMap)));

console.log("Reading frontier tests passed.");
