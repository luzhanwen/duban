import {
  COMPANION_EVENT_STATUSES,
  COMPANION_EVENT_TYPES,
} from "./companionEvents.js";
import { normalizeCompanionMemory } from "./companionPolicy.js";
import { companionSectionRecordFromEvent } from "./companionSectionRecord.js";
import { toText } from "./text.js";

export function reconcileCompanionMemorySources(memoryValue, events = []) {
  const memory = normalizeMemoryValue(memoryValue);
  const records = getSessionRecordEntries(events);
  const items = memory.items.map((item) => {
    const linked = findLinkedSessionRecord(item, records);
    if (!linked) return item;
    return {
      ...item,
      source: "session_record",
      sourceItemKey: linked.event.itemKey || item.sourceItemKey,
      sourceEventId: linked.event.id || item.sourceEventId,
    };
  });

  return {
    ...memory,
    items,
  };
}

export function buildCompanionMemoryLedger({ book, memory, events = [] }) {
  const reconciled = reconcileCompanionMemorySources(memory, events);
  const itemLookup = buildItemLookup(book);
  const recordsByEventId = new Map(
    getSessionRecordEntries(events).map((entry) => [entry.event.id, entry])
  );

  return reconciled.items
    .map((item) => {
      const linked = recordsByEventId.get(item.sourceEventId) || null;
      const sourceItemKey = item.sourceItemKey || linked?.event?.itemKey || "";
      const sourceTitle = sourceItemKey
        ? itemLookup.get(sourceItemKey) || "已调整的阅读项"
        : item.source === "legacy"
          ? "旧版读伴设置"
          : "本书读伴设置";
      return {
        ...item,
        sourceItemKey,
        sourceTitle,
        sourceLabel: getMemorySourceLabel(item.source),
        sourceDetail: getMemorySourceDetail(item.source, Boolean(linked)),
        sourceAvailable: item.source !== "session_record" || Boolean(linked),
        sortIndex: itemLookup.has(sourceItemKey)
          ? [...itemLookup.keys()].indexOf(sourceItemKey)
          : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((left, right) => {
      if (left.sortIndex !== right.sortIndex) return left.sortIndex - right.sortIndex;
      return dateTime(right.updatedAt || right.createdAt) - dateTime(left.updatedAt || left.createdAt);
    });
}

export function memorySourcesChanged(beforeValue, afterValue) {
  const before = normalizeMemoryValue(beforeValue);
  const after = normalizeMemoryValue(afterValue);
  return JSON.stringify(before.items) !== JSON.stringify(after.items);
}

function normalizeMemoryValue(value) {
  if (value && typeof value === "object" && Array.isArray(value.items)) {
    const normalized = normalizeCompanionMemory({ ...value, initialized: true });
    return { ...normalized, initialized: value.initialized === true };
  }
  return normalizeCompanionMemory(value);
}

function getSessionRecordEntries(events) {
  return (Array.isArray(events) ? events : [])
    .filter(
      (event) =>
        event?.type === COMPANION_EVENT_TYPES.sessionRecord &&
        event?.status !== COMPANION_EVENT_STATUSES.deleted
    )
    .map((event) => ({ event, record: companionSectionRecordFromEvent(event) }))
    .filter((entry) => entry.record);
}

function findLinkedSessionRecord(item, records) {
  if (item.sourceEventId) {
    const exactEvent = records.find((entry) => entry.event.id === item.sourceEventId);
    if (exactEvent) return exactEvent;
  }

  const exactLink = records.find((entry) => entry.record.memoryLink?.itemId === item.id);
  if (exactLink) return exactLink;

  if (item.source !== "session_record") return null;
  const candidates = records.filter((entry) => {
    if (item.sourceItemKey && entry.event.itemKey !== item.sourceItemKey) return false;
    return !entry.record.memoryLink || entry.record.memoryLink.text === item.text;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function buildItemLookup(book) {
  const lookup = new Map();
  const items = Array.isArray(book?.readingPlan?.items) ? book.readingPlan.items : [];
  items.forEach((item, index) => {
    lookup.set(getPlanItemKey(item, index), toText(item?.title).trim() || `阅读项 ${index + 1}`);
  });
  return lookup;
}

function getPlanItemKey(item, index = 0) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

function getMemorySourceLabel(source) {
  if (source === "session_record") return "本节记录";
  if (source === "legacy") return "旧设置迁入";
  return "手动保存";
}

function getMemorySourceDetail(source, linked) {
  if (source === "session_record") {
    return linked ? "可回溯到原本节记录" : "原记录已调整，记忆仍保留";
  }
  if (source === "legacy") return "保留旧书设置，不会自动承接到后续导读";
  return "由你在本书读伴设置中保存";
}

function dateTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
