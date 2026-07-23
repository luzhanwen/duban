import {
  COMPANION_JOURNEY_SCENES,
  COMPANION_JOURNEY_STATUSES,
  COMPANION_JOURNEY_TYPES,
} from "./companionJourney.js";

export const COMPANION_EVENT_SCHEMA_VERSION = 1;

export const COMPANION_EVENT_TYPES = Object.freeze({
  ...COMPANION_JOURNEY_TYPES,
  policyChanged: "policy_changed",
  sessionOverride: "session_override",
  interventionState: "intervention_state",
});

export const COMPANION_EVENT_STATUSES = Object.freeze({
  active: "active",
  available: "available",
  open: "open",
  dismissed: "dismissed",
  completed: "completed",
  orphaned: "orphaned",
  deleted: "deleted",
});

const VALID_SCENES = new Set(Object.values(COMPANION_JOURNEY_SCENES));
const VALID_STATUSES = new Set(Object.values(COMPANION_EVENT_STATUSES));

export function buildCompanionEventFromJourneyEntry(entry) {
  if (!entry?.id || !entry?.bookId || !entry?.type) return null;
  return normalizeCompanionEvent({
    id: entry.id.replace(/^journey:/, "event:"),
    bookId: entry.bookId,
    readingItemId: entry.readingItemId,
    itemKey: entry.itemKey,
    scene: entry.scene,
    type: entry.type,
    status:
      entry.status === COMPANION_JOURNEY_STATUSES.orphaned
        ? COMPANION_EVENT_STATUSES.orphaned
        : COMPANION_EVENT_STATUSES.active,
    sourceAnchor: sourceAnchorFromJourneyEntry(entry),
    payloadRef: entry.payloadRef,
    relatedEventIds: [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    metadata: {
      migratedFrom: entry.payloadRef?.store || "legacy",
    },
  });
}

export function createCompanionStateEvent({
  bookId,
  itemKey = null,
  readingItemId = null,
  scene = COMPANION_JOURNEY_SCENES.book,
  type,
  status = COMPANION_EVENT_STATUSES.active,
  sourceAnchor = null,
  payloadRef = null,
  relatedEventIds = [],
  policyRef = null,
  metadata = {},
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  identity = "",
}) {
  const normalizedIdentity = [
    bookId,
    itemKey || "",
    type,
    identity || createdAt,
  ].join("\u001f");
  return normalizeCompanionEvent({
    id: `event:${type}:${hashString(normalizedIdentity)}`,
    bookId,
    readingItemId,
    itemKey,
    scene,
    type,
    status,
    sourceAnchor,
    payloadRef,
    relatedEventIds,
    policyRef,
    metadata,
    createdAt,
    updatedAt,
  });
}

export function normalizeCompanionEvents(value, { bookId = "" } = {}) {
  return Array.isArray(value)
    ? value
        .map((event) => normalizeCompanionEvent({ ...event, bookId: event?.bookId || bookId }))
        .filter(Boolean)
    : [];
}

export function normalizeCompanionEvent(event) {
  const id = text(event?.id);
  const bookId = text(event?.bookId);
  const type = text(event?.type);
  if (!id || !bookId || !type) return null;
  const createdAt = normalizeDate(event.createdAt) || new Date().toISOString();

  return {
    schemaVersion: COMPANION_EVENT_SCHEMA_VERSION,
    id,
    bookId,
    readingItemId: nullableText(event.readingItemId),
    itemKey: nullableText(event.itemKey),
    scene: VALID_SCENES.has(event.scene) ? event.scene : COMPANION_JOURNEY_SCENES.book,
    type,
    status: VALID_STATUSES.has(event.status)
      ? event.status
      : COMPANION_EVENT_STATUSES.active,
    sourceAnchor: normalizeSourceAnchor(event.sourceAnchor),
    payloadRef: normalizePayloadRef(event.payloadRef),
    relatedEventIds: uniqueTextList(event.relatedEventIds),
    policyRef: normalizePolicyRef(event.policyRef),
    metadata: normalizeMetadata(event.metadata),
    createdAt,
    updatedAt: normalizeDate(event.updatedAt) || createdAt,
  };
}

export function mergeCompanionEvents(current, incoming, { bookId = "" } = {}) {
  const merged = new Map();
  for (const event of normalizeCompanionEvents(current, { bookId })) merged.set(event.id, event);
  for (const event of normalizeCompanionEvents(incoming, { bookId })) {
    const existing = merged.get(event.id);
    if (!existing || compareEventFreshness(event, existing) >= 0) merged.set(event.id, event);
  }
  return [...merged.values()].sort(compareEvents);
}

export function sourceAnchorFromJourneyEntry(entry) {
  const source = entry?.sourceRef;
  if (!source) return null;
  const pageNumber = positiveInteger(source.pageNumber);
  const textValue = text(source.text);
  const hasSelection = Boolean(textValue || source.rects?.length);
  return normalizeSourceAnchor({
    kind: hasSelection ? "selection" : source.kind || "reading_item",
    readingItemId: entry.readingItemId,
    itemKey: entry.itemKey,
    pageNumber,
    originalPageNumber: positiveInteger(source.originalPageNumber),
    textPageNumber: positiveInteger(source.textPageNumber || pageNumber),
    charRange: source.charRange,
    rects: source.rects,
    contentBlockId: source.contentBlockId,
    blockCharRange: source.blockCharRange,
    contentFingerprint: textValue ? fingerprintText(textValue) : source.contentFingerprint,
    anchorStatus: source.anchorStatus,
  });
}

export function normalizeSourceAnchor(anchor) {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return null;
  const kind = text(anchor.kind) || "reading_item";
  const normalized = {
    schemaVersion: anchor.contentBlockId ? 2 : 1,
    kind,
    readingItemId: nullableText(anchor.readingItemId),
    itemKey: nullableText(anchor.itemKey),
    pageNumber: positiveInteger(anchor.pageNumber),
    originalPageNumber: positiveInteger(anchor.originalPageNumber),
    textPageNumber: positiveInteger(anchor.textPageNumber),
    charRange: normalizeCharRange(anchor.charRange),
    rects: normalizeRects(anchor.rects),
    contentBlockId: nullableText(anchor.contentBlockId),
    blockCharRange: normalizeCharRange(anchor.blockCharRange),
    contentFingerprint: nullableText(anchor.contentFingerprint),
    anchorStatus: nullableText(anchor.anchorStatus),
  };
  return Object.entries(normalized).some(
    ([key, value]) => key !== "schemaVersion" && value !== null && value !== ""
  )
    ? normalized
    : null;
}

export function fingerprintText(value) {
  const normalized = text(value).replace(/\s+/g, " ");
  return normalized ? `fnv1a:${hashString(normalized)}` : null;
}

export function eventPayloadIdentity(event) {
  const ref = event?.payloadRef;
  if (!ref?.store) return "";
  return [ref.store, ref.itemKey || "", ref.sourceId || ""].join("\u001f");
}

export function companionEventIdForPayloadRef({ store, itemKey, sourceId, type }) {
  const identity = [store || "", itemKey || "", sourceId || ""].join("\u001f");
  return `event:${type}:${hashString(identity)}`;
}

function normalizePayloadRef(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const store = text(value.store);
  if (!store) return null;
  return {
    store,
    itemKey: nullableText(value.itemKey),
    sourceId: nullableText(value.sourceId),
  };
}

function normalizePolicyRef(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    policySchemaVersion: positiveInteger(value.policySchemaVersion),
    memorySchemaVersion: positiveInteger(value.memorySchemaVersion),
    sessionOverride: nullableText(value.sessionOverride),
    scope: nullableText(value.scope),
  };
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function normalizeCharRange(value) {
  if (!value || typeof value !== "object") return null;
  const start = nonNegativeInteger(value.start);
  const end = nonNegativeInteger(value.end);
  if (start === null || end === null || end < start) return null;
  return { start, end };
}

function normalizeRects(value) {
  return Array.isArray(value)
    ? value
        .map((rect) => ({
          x: clampRatio(rect?.x),
          y: clampRatio(rect?.y),
          width: clampRatio(rect?.width),
          height: clampRatio(rect?.height),
        }))
        .filter((rect) => rect.width > 0 && rect.height > 0)
    : [];
}

function compareEventFreshness(left, right) {
  const timeDifference = dateTime(left.updatedAt) - dateTime(right.updatedAt);
  if (timeDifference !== 0) return timeDifference;
  if (left.status === COMPANION_EVENT_STATUSES.deleted) return 1;
  if (right.status === COMPANION_EVENT_STATUSES.deleted) return -1;
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function compareEvents(left, right) {
  const timeDifference = dateTime(left.createdAt) - dateTime(right.createdAt);
  return timeDifference || left.id.localeCompare(right.id);
}

function dateTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeDate(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function uniqueTextList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))];
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function nullableText(value) {
  return text(value) || null;
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
