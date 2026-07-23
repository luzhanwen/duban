import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fixture = JSON.parse(
  await readFile(new URL("../qa-fixtures/p7/companion-context-cases.json", import.meta.url), "utf8")
);
const required = [
  "normal-text-pdf",
  "pdf-without-outline",
  "scanned-page",
  "long-chapter",
  "legacy-book",
  "mobi-book",
  "narrow-window",
];
assert.equal(fixture.format, "duban.p7-context-cases");
assert.deepEqual(
  fixture.cases.map((item) => item.id),
  required
);
assert.ok(fixture.cases.every((item) => item.expected?.length > 0));
const serialized = JSON.stringify(fixture);
assert.doesNotMatch(serialized, /sk-[A-Za-z0-9_-]{12,}|\/Users\/|private note|copyrighted/i);
console.log("P7 fixed QA cases verified.");
