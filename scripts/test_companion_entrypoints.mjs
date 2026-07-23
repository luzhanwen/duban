import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appSource, shelfSource, readerSource, salonSource, timelineSource, avatarSource, cssSource] =
  await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Shelf.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/BookSalon.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/companionTimeline.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ReadingCompanionAvatar.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);

assert.doesNotMatch(appSource, /BookCompanionChat|bookCompanionChat/);

for (const source of [shelfSource, readerSource, salonSource]) {
  assert.doesNotMatch(source, /随书闲聊|随书聊|和读伴聊聊|继续和读伴聊/);
}

assert.match(readerSource, /问读伴/);
assert.match(readerSource, /function CompanionWakeButton/);
assert.match(readerSource, /aria-label="打开读伴"/);
assert.match(readerSource, /"companion-wake"/);
assert.match(readerSource, /"companion-rest"/);
assert.match(readerSource, /name: "companion-quote-wake"/);
assert.doesNotMatch(readerSource, /sidebarOpen \? "专注阅读" : "打开读伴"/);
assert.match(avatarSource, /mark: "\/companion-assets\/cinnabar-companion-mark-v2\.png"/);
assert.match(cssSource, /\.reader-companion-wake-button/);
assert.match(salonSource, /getBookCompanionChat/);
assert.match(timelineSource, /bookChat\]: \{ label: "历史对话"/);

console.log("Companion entrypoint tests passed.");
