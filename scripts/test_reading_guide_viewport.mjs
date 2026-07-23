import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [readerSource, cssSource] = await Promise.all([
  readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
]);

assert.match(readerSource, /className="reader-intro-page px-6 py-8"/);
assert.doesNotMatch(readerSource, /reader-intro-page min-h-screen/);
assert.match(readerSource, /reader-companion-guide-scroll is-\$\{guideDisplayState\}/);
assert.match(readerSource, /aria-label="导读内容"/);
assert.match(readerSource, /<GuideClueStrip guide=\{guide\} \/>/);

assert.match(
  cssSource,
  /\.companion-shell\[data-companion-scene="intro"\]\s*\{[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/
);
assert.match(
  cssSource,
  /\.reader-intro-page\s*\{[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/
);
assert.match(
  cssSource,
  /\.reader-intro-main\s*\{[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/
);
assert.match(
  cssSource,
  /\.reader-companion-guide-scroll\s*\{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/
);
assert.match(cssSource, /\.reader-intro-actions\s*\{[\s\S]*?flex: 0 0 auto;/);
assert.match(cssSource, /@media \(max-width: 639px\)[\s\S]*?\.reader-intro-actions[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
assert.match(cssSource, /@media \(max-height: 700px\)[\s\S]*?\.reader-intro-card\.reader-companion-guide-card/);

console.log("Reading guide viewport tests passed.");
