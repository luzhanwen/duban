import {
  COMPANION_EVENT_STATUSES,
  COMPANION_EVENT_TYPES,
  buildCompanionEventFromJourneyEntry,
  companionEventIdForPayloadRef,
  createCompanionStateEvent,
  mergeCompanionEvents,
  normalizeCompanionEvent,
  normalizeCompanionEvents,
} from "./companionEvents.js";
import { COMPANION_JOURNEY_SCENES } from "./companionJourney.js";
import {
  companionSectionRecordFromEvent,
  hasMeaningfulCompanionSectionRecord,
  normalizeCompanionSectionRecord,
  withoutConfirmedCompanionSectionMemory,
  withConfirmedCompanionSectionMemory,
} from "./companionSectionRecord.js";
import { getItem, KEYS, setItem } from "./storage.js";

export async function getCompanionEvents(bookId) {
  if (!bookId) return [];
  return normalizeCompanionEvents(await getItem(KEYS.bookCompanionEvents(bookId), []), { bookId });
}

export async function mergeAndSaveCompanionEvents(bookId, incomingEvents) {
  if (!bookId) return [];
  const current = await getCompanionEvents(bookId);
  const merged = mergeCompanionEvents(current, incomingEvents, { bookId });
  if (JSON.stringify(current) !== JSON.stringify(merged)) {
    await setItem(KEYS.bookCompanionEvents(bookId), merged);
  }
  return merged;
}

export async function syncCompanionJourneyEvents(bookId, journeyEntries) {
  const events = (Array.isArray(journeyEntries) ? journeyEntries : [])
    .map(buildCompanionEventFromJourneyEntry)
    .filter(Boolean);
  return mergeAndSaveCompanionEvents(bookId, events);
}

export async function recordCompanionPolicyChange({
  bookId,
  itemKey,
  policy,
  memory,
  identity,
  timestamp,
  source = "user",
}) {
  const now = normalizeTimestamp(timestamp);
  const event = createCompanionStateEvent({
    bookId,
    itemKey,
    scene: COMPANION_JOURNEY_SCENES.book,
    type: COMPANION_EVENT_TYPES.policyChanged,
    identity: identity || now,
    createdAt: now,
    metadata: {
      policy,
      memory,
      source,
    },
    policyRef: {
      policySchemaVersion: policy?.schemaVersion,
      memorySchemaVersion: memory?.schemaVersion,
      scope: "book",
    },
  });
  return mergeAndSaveCompanionEvents(bookId, [event]);
}

export async function recordCompanionSessionOverride({
  bookId,
  itemKey,
  sessionOverride,
  relatedEventIds = [],
}) {
  if (!sessionOverride || sessionOverride === "default") return getCompanionEvents(bookId);
  const now = new Date().toISOString();
  const event = createCompanionStateEvent({
    bookId,
    itemKey,
    scene: COMPANION_JOURNEY_SCENES.reading,
    type: COMPANION_EVENT_TYPES.sessionOverride,
    identity: `${now}:${sessionOverride}`,
    relatedEventIds,
    createdAt: now,
    policyRef: {
      sessionOverride,
      scope: "next_request",
    },
    metadata: { consumed: true },
  });
  return mergeAndSaveCompanionEvents(bookId, [event]);
}

function normalizeTimestamp(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
}

export async function getCompanionSessionRecord(bookId, itemKey) {
  const event = await getCompanionSessionRecordEvent(bookId, itemKey);
  return companionSectionRecordFromEvent(event);
}

export function getCompanionSessionRecordEventId(bookId, itemKey) {
  return createCompanionStateEvent({
    bookId,
    itemKey,
    scene: COMPANION_JOURNEY_SCENES.reflection,
    type: COMPANION_EVENT_TYPES.sessionRecord,
    identity: itemKey,
    createdAt: "1970-01-01T00:00:00.000Z",
  })?.id || "";
}

export async function saveCompanionSessionRecord({
  bookId,
  itemKey,
  record,
  summary = null,
  eventIds = [],
}) {
  const now = new Date().toISOString();
  const normalizedRecord = normalizeCompanionSectionRecord(
    {
      ...record,
      itemKey,
      updatedAt: now,
    },
    { itemKey }
  );
  if (!bookId || !itemKey || !hasMeaningfulCompanionSectionRecord(normalizedRecord)) {
    return null;
  }

  const existing = await getCompanionSessionRecordEvent(bookId, itemKey);
  const createdAt = existing?.createdAt || normalizedRecord.createdAt || now;
  const event = createCompanionStateEvent({
    bookId,
    itemKey,
    scene: COMPANION_JOURNEY_SCENES.reflection,
    type: COMPANION_EVENT_TYPES.sessionRecord,
    status: COMPANION_EVENT_STATUSES.completed,
    identity: itemKey || now,
    relatedEventIds: eventIds.length > 0 ? eventIds : normalizedRecord.sourceEventIds,
    createdAt,
    updatedAt: now,
    metadata: {
      counts: summary?.counts || {},
      total: Number(summary?.total) || 0,
      takeaway: normalizedRecord.understanding,
      record: {
        ...normalizedRecord,
        createdAt,
        updatedAt: now,
      },
    },
  });
  await mergeAndSaveCompanionEvents(bookId, [event]);
  return companionSectionRecordFromEvent(event);
}

export async function deleteCompanionSessionRecord({ bookId, itemKey }) {
  if (!bookId || !itemKey) return null;
  const existing = await getCompanionSessionRecordEvent(bookId, itemKey);
  if (!existing) return null;
  const now = new Date().toISOString();
  const tombstone = normalizeCompanionEvent({
    ...existing,
    status: COMPANION_EVENT_STATUSES.deleted,
    metadata: {
      ...(existing.metadata || {}),
      deletedAt: now,
    },
    updatedAt: now,
  });
  await mergeAndSaveCompanionEvents(bookId, [tombstone]);
  return null;
}

export async function syncCompanionMemoryRecordLink({ bookId, itemId, text = "" }) {
  if (!bookId || !itemId) return getCompanionEvents(bookId);
  const current = await getCompanionEvents(bookId);
  const now = new Date().toISOString();
  const updates = current
    .filter(
      (event) =>
        event.type === COMPANION_EVENT_TYPES.sessionRecord &&
        event.status !== COMPANION_EVENT_STATUSES.deleted
    )
    .map((event) => {
      const record = companionSectionRecordFromEvent(event);
      if (!record || record.memoryLink?.itemId !== itemId) return null;
      const nextRecord = text
        ? withConfirmedCompanionSectionMemory(record, {
            itemId,
            text,
            confirmedAt: now,
          })
        : withoutConfirmedCompanionSectionMemory(record, now);
      return normalizeCompanionEvent({
        ...event,
        metadata: {
          ...(event.metadata || {}),
          takeaway: nextRecord.understanding,
          record: nextRecord,
        },
        updatedAt: now,
      });
    })
    .filter(Boolean);
  return updates.length > 0 ? mergeAndSaveCompanionEvents(bookId, updates) : current;
}

export async function recordCompanionSessionRecord({
  bookId,
  itemKey,
  record,
  summary,
  eventIds = [],
}) {
  const sourceRecord =
    record ||
    normalizeCompanionSectionRecord(
      {
        itemKey,
        understanding: summary?.takeaway || "",
        sourceEventIds: eventIds,
      },
      { itemKey }
    );
  return saveCompanionSessionRecord({
    bookId,
    itemKey,
    record: sourceRecord,
    summary,
    eventIds,
  });
}

export async function markCompanionPayloadEventDeleted({
  bookId,
  itemKey,
  store,
  sourceId,
  type,
}) {
  if (!bookId || !store || !sourceId || !type) return getCompanionEvents(bookId);
  const current = await getCompanionEvents(bookId);
  const id = companionEventIdForPayloadRef({ store, itemKey, sourceId, type });
  const existing = current.find((event) => event.id === id);
  const now = new Date().toISOString();
  const tombstone = normalizeCompanionEvent({
    ...(existing || {}),
    schemaVersion: 1,
    id,
    bookId,
    itemKey,
    scene: existing?.scene || COMPANION_JOURNEY_SCENES.reading,
    type,
    status: COMPANION_EVENT_STATUSES.deleted,
    payloadRef: { store, itemKey, sourceId },
    metadata: {
      ...(existing?.metadata || {}),
      deletedAt: now,
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  return mergeAndSaveCompanionEvents(bookId, [tombstone]);
}

async function getCompanionSessionRecordEvent(bookId, itemKey) {
  if (!bookId || !itemKey) return null;
  const events = await getCompanionEvents(bookId);
  return (
    [...events]
      .reverse()
      .find(
        (event) =>
          event.type === COMPANION_EVENT_TYPES.sessionRecord && event.itemKey === itemKey
      ) || null
  );
}
