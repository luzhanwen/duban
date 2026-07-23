import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [readerSource, shellSource, timelineSource, reflectionSource, promptSource, cssSource] =
  await Promise.all([
    readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CompanionShell.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CompanionJourneyTimeline.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/readingReflection.js", import.meta.url), "utf8"),
    readFile(new URL("../src/prompts/readingReflectionSummary.md", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);

assert.doesNotMatch(readerSource, /读完后，留一个判断/);
assert.match(readerSource, /data-companion-shared="timeline"/);
assert.match(readerSource, /initialPosition: "bottom"/);
assert.match(readerSource, /还有什么想聊的，可以接着聊。/);
assert.match(readerSource, /整理本节总结/);
assert.match(readerSource, /generateReadingReflectionSummary/);
assert.match(readerSource, /filter\(\(message\) => message\.kind !== "summary"\)/);
assert.match(readerSource, /className="reader-complete-page"/);
assert.match(readerSource, /className="reader-complete-directory"/);

assert.match(shellSource, /new ResizeObserver/);
assert.match(shellSource, /nearBottomRef\.current/);
assert.match(timelineSource, /data-companion-card-kind/);

assert.match(reflectionSource, /kind: "summary"/);
assert.match(reflectionSource, /itemCompleted: true/);
assert.match(reflectionSource, /saveReadingReflection/);
assert.match(promptSource, /本节要点/);
assert.match(promptSource, /我的理解/);
assert.match(promptSource, /留下的问题/);

assert.match(cssSource, /\.reader-reflection-page\s*\{[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/);
assert.match(cssSource, /\.reader-reflection-timeline\s*\{[\s\S]*?overflow-y: auto;/);
assert.match(cssSource, /\.companion-shell\[data-companion-scene="completed"\][\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/);
assert.match(cssSource, /\.reader-complete-main\s*\{[\s\S]*?grid-template-columns:/);
assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*?\.reader-complete-main[\s\S]*?overflow-y: auto;/);
assert.match(cssSource, /Notes are paper records, not a third kind of chat bubble/);
assert.match(cssSource, /\.companion-journey-card\.is-note[\s\S]*?#fbf2cf/);

console.log("Reading reflection experience tests passed.");
