import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCompanionMemoryLedger,
  memorySourcesChanged,
  reconcileCompanionMemorySources,
} from "../src/lib/companionMemoryLedger.js";
import {
  COMPANION_EVENT_STATUSES,
  COMPANION_EVENT_TYPES,
  createCompanionStateEvent,
} from "../src/lib/companionEvents.js";

const book = {
  id: "book-1",
  readingPlan: {
    items: [
      { id: "item-1", title: "第一节 制度起点" },
      { id: "item-2", title: "第二节 利益结构" },
    ],
  },
};

const linkedEvent = createCompanionStateEvent({
  bookId: book.id,
  itemKey: "item-2",
  type: COMPANION_EVENT_TYPES.sessionRecord,
  status: COMPANION_EVENT_STATUSES.completed,
  identity: "item-2",
  createdAt: "2026-07-20T02:00:00.000Z",
  metadata: {
    record: {
      schemaVersion: 1,
      itemKey: "item-2",
      understanding: "制度变化受到既有利益结构影响。",
      openQuestions: [],
      sourceEventIds: ["event:note:2"],
      memoryLink: {
        itemId: "memory-session-2",
        text: "本节理解：制度变化受到既有利益结构影响。",
        confirmedAt: "2026-07-20T02:10:00.000Z",
      },
    },
  },
});

const memory = {
  schemaVersion: 1,
  initialized: true,
  items: [
    {
      id: "memory-user",
      text: "阅读时优先留意制度变化。",
      source: "user",
      sourceItemKey: "",
      sourceEventId: "",
      createdAt: "2026-07-18T01:00:00.000Z",
      updatedAt: "2026-07-18T01:00:00.000Z",
    },
    {
      id: "memory-session-2",
      text: "本节理解：制度变化受到既有利益结构影响。",
      source: "user",
      sourceItemKey: "",
      sourceEventId: "",
      createdAt: "2026-07-20T02:10:00.000Z",
      updatedAt: "2026-07-20T02:10:00.000Z",
    },
    {
      id: "legacy-focus-1",
      text: "旧书设置里留下的话。",
      source: "legacy",
      sourceItemKey: "",
      sourceEventId: "",
      createdAt: "",
      updatedAt: "",
    },
  ],
};

const reconciled = reconcileCompanionMemorySources(memory, [linkedEvent]);
const migrated = reconciled.items.find((item) => item.id === "memory-session-2");
assert.equal(migrated.source, "session_record");
assert.equal(migrated.sourceItemKey, "item-2");
assert.equal(migrated.sourceEventId, linkedEvent.id);
assert.equal(
  reconciled.items.find((item) => item.id === "legacy-focus-1").source,
  "legacy",
  "旧设置迁入内容不得被自动升级为用户确认的章节记忆"
);
assert.equal(memorySourcesChanged(memory, reconciled), true);
assert.equal(memorySourcesChanged(reconciled, reconciled), false);

const ledger = buildCompanionMemoryLedger({ book, memory: reconciled, events: [linkedEvent] });
const ledgerItem = ledger.find((item) => item.id === "memory-session-2");
assert.equal(ledgerItem.sourceLabel, "本节记录");
assert.equal(ledgerItem.sourceTitle, "第二节 利益结构");
assert.equal(ledgerItem.sourceAvailable, true);
assert.match(ledgerItem.sourceDetail, /回溯/);
assert.match(
  ledger.find((item) => item.id === "legacy-focus-1").sourceDetail,
  /不会自动承接/
);

const deletedEvent = {
  ...linkedEvent,
  status: COMPANION_EVENT_STATUSES.deleted,
  updatedAt: "2026-07-20T03:00:00.000Z",
};
const missingSource = buildCompanionMemoryLedger({
  book,
  memory: reconciled,
  events: [deletedEvent],
}).find((item) => item.id === "memory-session-2");
assert.equal(missingSource.sourceAvailable, false);
assert.match(missingSource.sourceDetail, /仍保留/);

const managerSource = readFileSync(
  new URL("../src/components/BookMemoryManager.jsx", import.meta.url),
  "utf8"
);
assert.match(managerSource, /按阅读顺序/);
assert.match(managerSource, /撤销记忆/);
assert.match(managerSource, /syncCompanionMemoryRecordLink/);
assert.doesNotMatch(managerSource, /新增记忆/);

const salonSource = readFileSync(new URL("../src/components/BookSalon.jsx", import.meta.url), "utf8");
assert.match(salonSource, /id: "memories"/);
assert.match(salonSource, /memory_source_migration/);
assert.match(salonSource, /<BookMemoryManager/);

console.log("Companion memory source, migration, and cross-section management tests passed.");
