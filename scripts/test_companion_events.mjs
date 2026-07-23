import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPANION_EVENT_STATUSES,
  COMPANION_EVENT_TYPES,
  buildCompanionEventFromJourneyEntry,
  createCompanionStateEvent,
  mergeCompanionEvents,
  normalizeSourceAnchor,
} from "../src/lib/companionEvents.js";
import { buildCompanionJourney } from "../src/lib/companionJourney.js";

const [entry] = buildCompanionJourney({
  bookId: "book-1",
  planItems: [{ id: "item-1", title: "第一节" }],
  chatStore: {
    "item-1": [
      {
        id: "message-1",
        role: "user",
        content: "歙县是什么意思？",
        quote: {
          pageNumber: 6,
          text: "歙县",
          rects: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.04 }],
          contentBlockId: "block:pdf:6:0:abc",
          blockCharRange: { start: 4, end: 6 },
          contentFingerprint: "fnv1a:abc",
          anchorStatus: "exact",
        },
        createdAt: "2026-07-16T01:00:00.000Z",
      },
    ],
  },
});

const event = buildCompanionEventFromJourneyEntry(entry);
assert.equal(event.schemaVersion, 1);
assert.equal(event.bookId, "book-1");
assert.equal(event.itemKey, "item-1");
assert.equal(event.sourceAnchor.kind, "selection");
assert.equal(event.sourceAnchor.pageNumber, 6);
assert.equal(event.sourceAnchor.schemaVersion, 2);
assert.equal(event.sourceAnchor.contentBlockId, "block:pdf:6:0:abc");
assert.deepEqual(event.sourceAnchor.blockCharRange, { start: 4, end: 6 });
assert.match(event.sourceAnchor.contentFingerprint, /^fnv1a:/);
assert.equal("text" in event.sourceAnchor, false, "统一事件不得复制所选正文");
assert.deepEqual(event.payloadRef, {
  store: "bookChat",
  itemKey: "item-1",
  sourceId: "message-1",
});
assert.equal(
  buildCompanionEventFromJourneyEntry(entry).id,
  event.id,
  "相同旧来源必须生成稳定事件 id"
);

const legacyAnchor = normalizeSourceAnchor({
  kind: "page",
  pageNumber: 3,
  charRange: { start: 2, end: 8 },
  contentFingerprint: "fnv1a:legacy",
});
assert.equal(legacyAnchor.schemaVersion, 1, "没有正文块 id 的旧来源定位必须继续保持 v1");
assert.equal(legacyAnchor.contentBlockId, null);

const older = { ...event, updatedAt: "2026-07-16T01:00:00.000Z" };
const newer = {
  ...event,
  status: COMPANION_EVENT_STATUSES.deleted,
  updatedAt: "2026-07-16T02:00:00.000Z",
};
const merged = mergeCompanionEvents([newer], [older], { bookId: "book-1" });
assert.equal(merged.length, 1);
assert.equal(merged[0].status, COMPANION_EVENT_STATUSES.deleted, "较旧导入不得覆盖本地删除状态");

const policyEvent = createCompanionStateEvent({
  bookId: "book-1",
  itemKey: "item-1",
  type: COMPANION_EVENT_TYPES.policyChanged,
  identity: "policy-v1",
  policyRef: { policySchemaVersion: 1, memorySchemaVersion: 1, scope: "book" },
  metadata: { memory: { items: [{ id: "m1", text: "先用白话解释" }] } },
  createdAt: "2026-07-16T03:00:00.000Z",
});
assert.equal(policyEvent.policyRef.scope, "book");
assert.equal(policyEvent.metadata.memory.items[0].id, "m1");

const rustSource = readFileSync(new URL("../src-tauri/src/storage.rs", import.meta.url), "utf8");
assert.match(rustSource, /const CURRENT_SCHEMA_VERSION: &str = "10";/);
assert.match(rustSource, /CREATE TABLE IF NOT EXISTS companion_events/);
assert.match(rustSource, /merge_companion_events/);
assert.match(rustSource, /companion-event-copies-source-text/);

const readerSource = readFileSync(new URL("../src/components/Reader.jsx", import.meta.url), "utf8");
for (const functionName of [
  "syncCompanionJourneyEvents",
  "recordCompanionPolicyChange",
  "recordCompanionSessionOverride",
  "recordCompanionSessionRecord",
]) {
  assert.match(readerSource, new RegExp(functionName));
}
assert.doesNotMatch(
  readerSource,
  /recordCompanionInterventionState/,
  "新版阅读器不得再写入主动介入状态"
);
assert.equal(
  COMPANION_EVENT_TYPES.interventionState,
  "intervention_state",
  "旧介入事件类型继续保留读取与备份兼容"
);

console.log("Companion event contract, migration, and persistence wiring tests passed.");
