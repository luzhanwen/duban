import { getItem, KEYS, setItem } from "./storage.js";
import { toText } from "./text.js";
import { markCompanionPayloadEventDeleted } from "./companionEventStore.js";
import { COMPANION_JOURNEY_TYPES } from "./companionJourney.js";

export async function getReadingNotes(bookId, itemKey) {
  if (!bookId || !itemKey) return [];
  const saved = await getItem(KEYS.bookNotes(bookId), {});
  if (Array.isArray(saved)) return normalizeNotes(saved);
  return normalizeNotes(saved?.[itemKey] || []);
}

export async function getAllReadingNotes(bookId) {
  if (!bookId) return [];
  const saved = await getItem(KEYS.bookNotes(bookId), {});
  if (Array.isArray(saved)) return normalizeNotes(saved);

  return Object.entries(saved || {}).flatMap(([itemKey, notes]) =>
    normalizeNotes(notes).map((note) => ({
      ...note,
      itemKey: note.itemKey || itemKey,
    }))
  );
}

export async function addReadingNote(bookId, itemKey, note) {
  if (!bookId || !itemKey) return [];
  const saved = await getItem(KEYS.bookNotes(bookId), {});
  const next = Array.isArray(saved) ? {} : { ...saved };
  const notes = normalizeNotes(next[itemKey] || []);
  const now = new Date().toISOString();
  const created = normalizeNote({
    ...note,
    id: note.id || makeId("note"),
    itemKey,
    createdAt: note.createdAt || now,
    updatedAt: now,
  });

  next[itemKey] = [created, ...notes];
  await setItem(KEYS.bookNotes(bookId), next);
  return normalizeNotes(next[itemKey]);
}

export async function updateReadingNote(bookId, itemKey, noteId, patch) {
  if (!bookId || !itemKey || !noteId) return [];
  const saved = await getItem(KEYS.bookNotes(bookId), {});
  const next = Array.isArray(saved) ? {} : { ...saved };
  const notes = normalizeNotes(next[itemKey] || []);
  const now = new Date().toISOString();

  next[itemKey] = notes.map((note) =>
    note.id === noteId
      ? normalizeNote({
          ...note,
          ...patch,
          id: note.id,
          itemKey,
          createdAt: note.createdAt,
          updatedAt: now,
        })
      : note
  );

  await setItem(KEYS.bookNotes(bookId), next);
  return normalizeNotes(next[itemKey]);
}

export async function deleteReadingNote(bookId, itemKey, noteId) {
  if (!bookId || !itemKey || !noteId) return [];
  const saved = await getItem(KEYS.bookNotes(bookId), {});
  const next = Array.isArray(saved) ? {} : { ...saved };
  const notes = normalizeNotes(next[itemKey] || []);

  next[itemKey] = notes.filter((note) => note.id !== noteId);
  await setItem(KEYS.bookNotes(bookId), next);
  await markCompanionPayloadEventDeleted({
    bookId,
    itemKey,
    store: "bookNotes",
    sourceId: noteId,
    type: COMPANION_JOURNEY_TYPES.note,
  }).catch(() => {});
  return normalizeNotes(next[itemKey]);
}

function normalizeNotes(notes) {
  return Array.isArray(notes)
    ? notes.map(normalizeNote).filter((note) => note.text || note.note || note.assistantContent)
    : [];
}

function normalizeNote(note = {}) {
  return {
    id: note.id || makeId("note"),
    itemKey: note.itemKey || "",
    pageNumber: Number(note.pageNumber) || null,
    text: toText(note.text).trim(),
    rects: normalizeRects(note.rects),
    anchorSchemaVersion: Number(note.anchorSchemaVersion) || null,
    contentBlockId: toText(note.contentBlockId).trim() || null,
    blockCharRange: normalizeCharRange(note.blockCharRange),
    contentFingerprint: toText(note.contentFingerprint).trim() || null,
    anchorStatus: toText(note.anchorStatus).trim() || null,
    highlightDisabled: Boolean(note.highlightDisabled),
    note: toText(note.note).trim(),
    assistantContent: toText(note.assistantContent).trim(),
    sourceMessageId: toText(note.sourceMessageId).trim(),
    source: note.source || "selection",
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
  };
}

function normalizeCharRange(value) {
  const start = Number(value?.start);
  const end = Number(value?.end);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start
    ? { start, end }
    : null;
}

function normalizeRects(rects) {
  if (!Array.isArray(rects)) return [];
  return rects
    .map((rect) => ({
      x: clampRatio(rect.x),
      y: clampRatio(rect.y),
      width: clampRatio(rect.width),
      height: clampRatio(rect.height),
    }))
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
