import assert from "node:assert/strict";
import {
  CONTENT_BLOCK_QUALITY,
  buildBookContentMap,
  buildSelectionAnchor,
  evaluatePageTextQuality,
  resolveContentAnchor,
} from "../src/lib/contentMap.js";

const book = {
  id: "book-1",
  format: "pdf",
  chapters: [{ id: "chapter-1", title: "第一章", startPage: 2, endPage: 4 }],
};
const planItems = [{ id: "item-1", title: "第一节", startPage: 2, endPage: 4 }];
const pages = [
  { pageNumber: 1, text: "版权" },
  {
    pageNumber: 2,
    text: "第一段解释当前制度为什么形成。它包含足够的正文，用来验证稳定切分和原文定位。\n\n第二段继续讨论制度如何执行，以及地方官员分别承担什么职责。这里仍然只属于用户已经看到的页面。",
  },
  { pageNumber: 3, text: "目录 第一章 …… 1 第二章 …… 12 第三章 …… 28 第四章 …… 46" },
  { pageNumber: 4, text: "后面的未读正文包含一个不应提前进入严格上下文的结论。" },
];

const map = buildBookContentMap({ book, pages, planItems });
assert.equal(map.schemaVersion, 1);
assert.ok(map.sourceFingerprint.startsWith("fnv1a:"));
assert.ok(map.blocks.length >= 3);
assert.ok(map.blocks.filter((block) => block.pageNumber === 2).every((block) => block.itemKey === "item-1"));
assert.equal(evaluatePageTextQuality("版权").quality, CONTENT_BLOCK_QUALITY.unusable);
assert.equal(
  evaluatePageTextQuality("目录 第一章 …… 1 第二章 …… 12 第三章 …… 28 第四章 …… 46").quality,
  CONTENT_BLOCK_QUALITY.limited
);

const selection = { pageNumber: 2, text: "地方官员分别承担什么职责" };
const anchor = buildSelectionAnchor(map, selection, "item-1");
assert.equal(anchor.anchorSchemaVersion, 2);
assert.ok(anchor.contentBlockId);
assert.deepEqual(resolveContentAnchor(map, { ...anchor, pageNumber: 2 }, selection.text).status, "exact");

const relocated = resolveContentAnchor(
  map,
  { ...anchor, contentBlockId: "missing", pageNumber: 2, itemKey: "item-1" },
  selection.text
);
assert.equal(relocated.status, "relocated");
assert.equal(relocated.block.pageNumber, 2);

const rebuilt = buildBookContentMap({ book, pages, planItems });
assert.deepEqual(
  rebuilt.blocks.map((block) => block.id),
  map.blocks.map((block) => block.id),
  "相同正文重新生成后必须得到相同正文段 id"
);

const overlappingMap = buildBookContentMap({
  book,
  pages,
  planItems: [
    { id: "guide-item", type: "guide", startPage: 1, endPage: 4 },
    { id: "main-item", type: "main", startPage: 2, endPage: 4 },
  ],
});
const overlappingBlock = overlappingMap.blocks.find((block) => block.pageNumber === 2);
assert.equal(overlappingBlock.itemKey, "main-item", "重叠范围应优先使用正文项作为主归属");
assert.deepEqual(overlappingBlock.itemKeys, ["main-item", "guide-item"]);
assert.equal(overlappingBlock.itemOrderByKey["main-item"], 0);
assert.ok(Number.isInteger(overlappingBlock.itemOrderByKey["guide-item"]));

console.log("Content map tests passed.");
