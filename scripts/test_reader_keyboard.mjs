import assert from "node:assert/strict";
import { getReaderPageKeyDirection } from "../src/lib/readerKeyboard.js";

const event = (key, overrides = {}) => ({
  key,
  defaultPrevented: false,
  isComposing: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  target: null,
  ...overrides,
});

assert.equal(getReaderPageKeyDirection(event("ArrowLeft"), { pageMode: true }), -1);
assert.equal(getReaderPageKeyDirection(event("ArrowRight"), { pageMode: true }), 1);
assert.equal(getReaderPageKeyDirection(event("PageUp"), { pageMode: true }), -1);
assert.equal(getReaderPageKeyDirection(event("PageDown"), { pageMode: true }), 1);
assert.equal(getReaderPageKeyDirection(event("ArrowRight"), { pageMode: false }), 0);
assert.equal(getReaderPageKeyDirection(event("ArrowRight", { isComposing: true }), { pageMode: true }), 0);
assert.equal(getReaderPageKeyDirection(event("ArrowRight", { metaKey: true }), { pageMode: true }), 0);
assert.equal(
  getReaderPageKeyDirection(
    event("ArrowRight", { target: { closest: () => ({ tagName: "TEXTAREA" }) } }),
    { pageMode: true }
  ),
  0
);

console.log("Reader keyboard paging tests passed.");
