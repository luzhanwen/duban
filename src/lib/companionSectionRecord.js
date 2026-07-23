import { COMPANION_JOURNEY_TYPES } from "./companionJourney.js";
import { toText } from "./text.js";

export const COMPANION_SECTION_RECORD_SCHEMA_VERSION = 1;

const LEGACY_EMPTY_TAKEAWAY = "这一节的线索和问题已经留在陪读脉络里。";
const INVALID_GENERATED_UNDERSTANDINGS = new Set(["AI 回答", "读伴回答", "读伴回应"]);

export function normalizeCompanionSectionRecord(value = {}, { itemKey = "" } = {}) {
  const source = isPlainObject(value) ? value : {};
  const createdAt = normalizeDate(source.createdAt);
  const updatedAt = normalizeDate(source.updatedAt) || createdAt;

  return {
    schemaVersion: COMPANION_SECTION_RECORD_SCHEMA_VERSION,
    itemKey: clean(source.itemKey || itemKey),
    understanding: cleanMultiline(source.understanding).slice(0, 1200),
    openQuestions: normalizeOpenQuestions(source.openQuestions),
    sourceEventIds: uniqueTextList(source.sourceEventIds).slice(0, 24),
    memoryLink: normalizeMemoryLink(source.memoryLink),
    createdAt,
    updatedAt,
  };
}

export function buildCompanionSectionRecordDraft(entries, { itemKey = "" } = {}) {
  const candidates = (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry?.itemKey === itemKey
  );
  const userReflection = [...candidates].reverse().find(
    (entry) =>
      entry?.type === COMPANION_JOURNEY_TYPES.reflection &&
      entry?.payload?.role === "user" &&
      cleanMultiline(entry?.payload?.content)
  );
  const note = [...candidates].reverse().find(
    (entry) =>
      entry?.type === COMPANION_JOURNEY_TYPES.note && meaningfulNoteText(entry?.payload)
  );
  const reflectionText = cleanMultiline(userReflection?.payload?.content);
  const noteText = meaningfulNoteText(note?.payload);
  const questionLike = isQuestionLike(reflectionText);
  const sourceEntry = userReflection || note;

  return normalizeCompanionSectionRecord(
    {
      itemKey,
      understanding: questionLike ? noteText : reflectionText || noteText,
      openQuestions: questionLike ? [reflectionText] : [],
      sourceEventIds: sourceEntry?.id ? [journeyIdToEventId(sourceEntry.id)] : [],
    },
    { itemKey }
  );
}

export function companionSectionRecordFromEvent(event) {
  if (!event || event.status === "deleted") return null;
  const record = event?.metadata?.record;
  if (record) {
    const normalized = normalizeCompanionSectionRecord(
      {
        ...record,
        createdAt: record.createdAt || event.createdAt,
        updatedAt: record.updatedAt || event.updatedAt,
      },
      { itemKey: event.itemKey }
    );
    if (
      INVALID_GENERATED_UNDERSTANDINGS.has(normalized.understanding) &&
      normalized.openQuestions.length === 0
    ) {
      return null;
    }
    return hasMeaningfulCompanionSectionRecord(normalized) ? normalized : null;
  }

  const legacyTakeaway = cleanMultiline(event?.metadata?.takeaway);
  if (
    !legacyTakeaway ||
    legacyTakeaway === LEGACY_EMPTY_TAKEAWAY ||
    INVALID_GENERATED_UNDERSTANDINGS.has(legacyTakeaway)
  ) {
    return null;
  }
  return normalizeCompanionSectionRecord(
    {
      itemKey: event.itemKey,
      understanding: legacyTakeaway,
      sourceEventIds: event.relatedEventIds,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    },
    { itemKey: event.itemKey }
  );
}

export function hasMeaningfulCompanionSectionRecord(value) {
  const record = normalizeCompanionSectionRecord(value, { itemKey: value?.itemKey });
  return Boolean(record.understanding || record.openQuestions.length > 0);
}

export function buildCompanionSectionMemoryText(value) {
  const record = normalizeCompanionSectionRecord(value, { itemKey: value?.itemKey });
  const parts = [];
  if (record.understanding) parts.push(`本节理解：${singleLine(record.understanding)}`);
  if (record.openQuestions[0]) parts.push(`仍在思考：${singleLine(record.openQuestions[0])}`);
  return truncate(parts.join("；"), 240);
}

export function isCompanionSectionMemoryCurrent(value) {
  const record = normalizeCompanionSectionRecord(value, { itemKey: value?.itemKey });
  const memoryText = buildCompanionSectionMemoryText(record);
  return Boolean(
    memoryText && record.memoryLink?.itemId && record.memoryLink?.text === memoryText
  );
}

export function withConfirmedCompanionSectionMemory(
  value,
  { itemId, text, confirmedAt = new Date().toISOString() }
) {
  return normalizeCompanionSectionRecord(
    {
      ...value,
      memoryLink: {
        itemId,
        text,
        confirmedAt,
      },
      updatedAt: confirmedAt,
    },
    { itemKey: value?.itemKey }
  );
}

export function withoutConfirmedCompanionSectionMemory(
  value,
  updatedAt = new Date().toISOString()
) {
  return normalizeCompanionSectionRecord(
    {
      ...value,
      memoryLink: null,
      updatedAt,
    },
    { itemKey: value?.itemKey }
  );
}

function normalizeOpenQuestions(value) {
  const source = Array.isArray(value)
    ? value
    : toText(value)
        .split(/\r?\n/)
        .map((item) => item.trim());
  return [...new Set(source.map(clean).filter(Boolean))].slice(0, 8);
}

function normalizeMemoryLink(value) {
  if (!isPlainObject(value)) return null;
  const itemId = clean(value.itemId);
  const text = clean(value.text).slice(0, 240);
  if (!itemId || !text) return null;
  return {
    itemId,
    text,
    confirmedAt: normalizeDate(value.confirmedAt),
  };
}

function isQuestionLike(value) {
  const text = clean(value);
  return Boolean(text && /[?？]$/.test(text));
}

function meaningfulNoteText(payload) {
  const note = cleanMultiline(payload?.note);
  const text = cleanMultiline(payload?.text);
  if (note && !["AI 回答", "读伴回答", "读伴回应"].includes(note)) return note;
  return text;
}

function journeyIdToEventId(value) {
  return clean(value).replace(/^journey:/, "event:");
}

function normalizeDate(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function uniqueTextList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean))];
}

function clean(value) {
  return toText(value).trim().replace(/\s+/g, " ");
}

function cleanMultiline(value) {
  return toText(value)
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function singleLine(value) {
  return cleanMultiline(value).replace(/\s*\n\s*/g, " ");
}

function truncate(value, length) {
  const text = clean(value);
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1))}…` : text;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
