import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  guessChapterRole,
  isChapterIncluded,
  normalizeChapterReadingChoice,
  normalizeChapterReadingChoices,
} from "../src/lib/chapterRoles.js";

const expectedRoles = new Map([
  ["书名页", "ignore"],
  ["增订纪念本出版说明", "guide"],
  ["自序", "guide"],
  ["自 序", "guide"],
  ["经典版出版缘起", "guide"],
  ["目录", "ignore"],
  ["第一章 万历皇帝", "main"],
  ["参考书目", "appendix"],
]);

for (const [title, role] of expectedRoles) {
  assert.equal(guessChapterRole(title), role, `${title} 应识别为 ${role}`);
}

const repairedTitlePage = normalizeChapterReadingChoice({
  id: "title-page",
  title: "书名页",
  role: "main",
  source: "outline",
});
assert.equal(repairedTitlePage.role, "ignore");
assert.equal(isChapterIncluded(repairedTitlePage), false);

const repairedLegacySelection = normalizeChapterReadingChoice({
  id: "references",
  title: "参考书目",
  role: "main",
  source: "outline",
  includeInReading: true,
});
assert.equal(repairedLegacySelection.role, "appendix");
assert.equal(isChapterIncluded(repairedLegacySelection), false);

const manualChoice = normalizeChapterReadingChoice({
  id: "manual-title-page",
  title: "书名页",
  role: "main",
  roleConfirmed: true,
  source: "manual",
  includeInReading: true,
  includeInReadingConfirmed: true,
});
assert.equal(manualChoice.role, "main");
assert.equal(isChapterIncluded(manualChoice), true);

const selectedAppendix = normalizeChapterReadingChoice({
  id: "selected-appendix",
  title: "参考书目",
  role: "appendix",
  source: "outline",
  includeInReading: true,
  includeInReadingConfirmed: true,
});
assert.equal(isChapterIncluded(selectedAppendix), true);

const normalizedBackMatter = normalizeChapterReadingChoices([
  {
    id: "appendix-one",
    title: "附录一",
    role: "appendix",
    source: "outline",
  },
  {
    id: "publication-history",
    title: "经典的历程——中文版出版纪事",
    role: "main",
    source: "outline",
  },
]);
assert.equal(normalizedBackMatter[1].role, "appendix");
assert.equal(isChapterIncluded(normalizedBackMatter[1]), false);

const [bookSetup, planSetup, wholeBookGuide, reader, shelf, css] = await Promise.all([
  readFile(new URL("../src/components/BookSetup.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ReadingPlanSetup.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/wholeBookGuide.js", import.meta.url), "utf8"),
  readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/Shelf.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
]);

assert.match(bookSetup, /includeInReading/);
assert.match(bookSetup, /是否阅读/);
assert.match(bookSetup, /book-setup-reading-switch/);
assert.match(planSetup, /book\.chapters\.filter\(isChapterIncluded\)/);
assert.match(wholeBookGuide, /chapters\.filter\(isChapterIncluded\)/);

assert.match(css, /\.app-root\.is-book-setup\s*\{[\s\S]*?overflow: hidden;/);
assert.match(css, /\.book-setup-chapter-rows\s*\{[\s\S]*?overflow-y: auto;/);
assert.match(reader, /className="guide-speech-bubble-action"/);
assert.match(css, /\.guide-speech-bubble-action\s*\{[\s\S]*?justify-content: center;[\s\S]*?border-left: 0;/);
assert.match(shelf, /book-ticket-paper.*is-menu-open/s);
assert.match(css, /\.book-ticket-paper\.is-menu-open\s*\{\s*overflow: visible;/);

for (const staleCopy of ["告诉你了，下一轮", "好奇心也给你了", "新读伴正在生成"]) {
  assert.doesNotMatch(planSetup, new RegExp(staleCopy));
}

console.log("Book setup and related experience tests passed.");
