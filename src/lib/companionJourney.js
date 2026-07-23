export const COMPANION_JOURNEY_SCENES = Object.freeze({
  guide: "guide",
  reading: "reading",
  reflection: "reflection",
  book: "book",
});

export const COMPANION_JOURNEY_TYPES = Object.freeze({
  guideClue: "guide_clue",
  userQuestion: "user_question",
  selectionQuestion: "selection_question",
  companionAnswer: "companion_answer",
  intervention: "intervention",
  note: "note",
  reflection: "reflection",
  sessionRecord: "session_record",
  bookChat: "book_chat",
});

export const COMPANION_JOURNEY_STATUSES = Object.freeze({
  available: "available",
  orphaned: "orphaned",
});

export const BOOK_COMPANION_JOURNEY_ITEM_KEY = "__book_companion__";

const STORE_NAMES = Object.freeze({
  guide: "bookQuestions",
  chat: "bookChat",
  reflection: "bookReflection",
  note: "bookNotes",
});

const SCENE_ORDER = Object.freeze({
  [COMPANION_JOURNEY_SCENES.guide]: 0,
  [COMPANION_JOURNEY_SCENES.reading]: 1,
  [COMPANION_JOURNEY_SCENES.reflection]: 2,
  [COMPANION_JOURNEY_SCENES.book]: 3,
});

export function getCompanionJourneyItemKey(item, index = 0) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

export function buildCompanionJourney({
  bookId,
  planItems = [],
  guidesByItemKey = {},
  chatStore = {},
  reflectionStore = {},
  notesStore = {},
} = {}) {
  if (!bookId) return [];

  const itemLookup = buildItemLookup(planItems);
  const entries = [];
  let sequence = 0;
  const push = (entry) => {
    if (!entry) return;
    entries.push({ ...entry, _sequence: sequence });
    sequence += 1;
  };

  for (const [itemKey, guide] of Object.entries(asObject(guidesByItemKey))) {
    push(buildGuideEntry({ bookId, itemKey, guide, itemLookup }));
  }

  for (const group of groupedRecords(chatStore)) {
    for (const message of group.records) {
      push(
        buildChatEntry({
          bookId,
          itemKey: group.itemKey,
          message,
          itemLookup,
        })
      );
    }
  }

  for (const group of groupedRecords(reflectionStore)) {
    for (const message of group.records) {
      push(
        buildReflectionEntry({
          bookId,
          itemKey: group.itemKey,
          message,
          itemLookup,
        })
      );
    }
  }

  for (const group of groupedRecords(notesStore)) {
    for (const note of group.records) {
      push(
        buildNoteEntry({
          bookId,
          itemKey: text(note?.itemKey) || group.itemKey,
          note,
          itemLookup,
        })
      );
    }
  }

  const uniqueEntries = new Map();
  for (const entry of entries) {
    if (!uniqueEntries.has(entry._identity)) uniqueEntries.set(entry._identity, entry);
  }

  return [...uniqueEntries.values()]
    .sort(compareJourneyEntries)
    .map(({ _identity, _sequence, ...entry }) => entry);
}

export function filterCompanionJourney(
  entries,
  { itemKey = null, scenes = [], types = [], includeOrphaned = true } = {}
) {
  const sceneSet = new Set(asArray(scenes));
  const typeSet = new Set(asArray(types));

  return asArray(entries).filter((entry) => {
    if (itemKey !== null && entry.itemKey !== itemKey) return false;
    if (sceneSet.size > 0 && !sceneSet.has(entry.scene)) return false;
    if (typeSet.size > 0 && !typeSet.has(entry.type)) return false;
    if (!includeOrphaned && entry.status === COMPANION_JOURNEY_STATUSES.orphaned) {
      return false;
    }
    return true;
  });
}

function buildGuideEntry({ bookId, itemKey, guide, itemLookup }) {
  const normalizedGuide = normalizeGuideInput(guide);
  if (!normalizedGuide) return null;
  const payload = {
    overview: text(normalizedGuide.overview),
    goals: textList(normalizedGuide.goals),
    concepts: textList(normalizedGuide.concepts),
    questions: textList(normalizedGuide.questions),
    focus: textList(normalizedGuide.focus),
    notes: text(normalizedGuide.notes),
  };
  if (!hasGuideContent(payload) && normalizedGuide.raw) {
    payload.notes = text(normalizedGuide.raw);
  }
  if (!hasGuideContent(payload)) return null;

  const context = resolveItemContext(itemKey, itemLookup);
  const sourceId = text(normalizedGuide.id) || null;
  const createdAt = normalizeDate(normalizedGuide.generatedAt || normalizedGuide.createdAt);
  const identity = buildIdentity({
    store: STORE_NAMES.guide,
    itemKey,
    sourceId,
    createdAt,
    content: [payload.overview, ...payload.goals, ...payload.questions].join("\n"),
  });

  return buildBaseEntry({
    identity,
    bookId,
    context,
    scene: COMPANION_JOURNEY_SCENES.guide,
    type: COMPANION_JOURNEY_TYPES.guideClue,
    createdAt,
    updatedAt: normalizeDate(normalizedGuide.updatedAt),
    sourceRef: context.itemKey
      ? { kind: "reading_item", itemKey: context.itemKey }
      : null,
    payloadRef: {
      store: STORE_NAMES.guide,
      itemKey: context.itemKey,
      sourceId,
    },
    payload: {
      ...payload,
      model: text(normalizedGuide.model),
      provider: text(normalizedGuide.provider),
      usage: normalizedGuide.usage || null,
      cost: normalizedGuide.cost ?? null,
    },
  });
}

function buildChatEntry({ bookId, itemKey, message, itemLookup }) {
  const content = text(message?.content);
  if (!content) return null;

  const isBookChat = itemKey === BOOK_COMPANION_JOURNEY_ITEM_KEY;
  const role = message?.role === "assistant" ? "assistant" : "user";
  const quote = normalizeQuote(message?.quote);
  const context = isBookChat
    ? emptyItemContext(BOOK_COMPANION_JOURNEY_ITEM_KEY)
    : resolveItemContext(itemKey, itemLookup);
  const type = isBookChat
    ? COMPANION_JOURNEY_TYPES.bookChat
    : role === "assistant"
    ? COMPANION_JOURNEY_TYPES.companionAnswer
    : quote
    ? COMPANION_JOURNEY_TYPES.selectionQuestion
    : COMPANION_JOURNEY_TYPES.userQuestion;
  const scene = isBookChat
    ? COMPANION_JOURNEY_SCENES.book
    : COMPANION_JOURNEY_SCENES.reading;
  const sourceId = text(message?.id) || null;
  const createdAt = normalizeDate(message?.createdAt);
  const identity = buildIdentity({
    store: STORE_NAMES.chat,
    itemKey,
    sourceId,
    createdAt,
    content: `${role}:${content}`,
  });

  return buildBaseEntry({
    identity,
    bookId,
    context,
    scene,
    type,
    createdAt,
    updatedAt: normalizeDate(message?.updatedAt),
    sourceRef: quote
      ? {
          kind: "selection",
          pageNumber: quote.pageNumber,
          text: quote.text,
          rects: quote.rects,
          contentBlockId: quote.contentBlockId,
          blockCharRange: quote.blockCharRange,
          contentFingerprint: quote.contentFingerprint,
          anchorStatus: quote.anchorStatus,
        }
      : context.itemKey && !isBookChat
      ? { kind: "reading_item", itemKey: context.itemKey }
      : null,
    payloadRef: {
      store: STORE_NAMES.chat,
      itemKey: context.itemKey,
      sourceId,
    },
    payload: {
      role,
      content,
      quote,
      model: text(message?.model),
      usage: message?.usage || null,
      cost: message?.cost ?? null,
      finishReason: text(message?.finishReason),
      truncated: Boolean(message?.truncated),
    },
  });
}

function buildReflectionEntry({ bookId, itemKey, message, itemLookup }) {
  const content = text(message?.content);
  if (!content) return null;

  const context = resolveItemContext(itemKey, itemLookup);
  const role = message?.role === "user" ? "user" : "assistant";
  const sourceId = text(message?.id) || null;
  const createdAt = normalizeDate(message?.createdAt);
  const identity = buildIdentity({
    store: STORE_NAMES.reflection,
    itemKey,
    sourceId,
    createdAt,
    content: `${role}:${content}`,
  });

  return buildBaseEntry({
    identity,
    bookId,
    context,
    scene: COMPANION_JOURNEY_SCENES.reflection,
    type: COMPANION_JOURNEY_TYPES.reflection,
    createdAt,
    updatedAt: normalizeDate(message?.updatedAt),
    sourceRef: context.itemKey
      ? { kind: "reading_item", itemKey: context.itemKey }
      : null,
    payloadRef: {
      store: STORE_NAMES.reflection,
      itemKey: context.itemKey,
      sourceId,
    },
    payload: {
      role,
      content,
      kind: text(message?.kind),
      model: text(message?.model),
      usage: message?.usage || null,
      cost: message?.cost ?? null,
      finishReason: text(message?.finishReason),
      truncated: Boolean(message?.truncated),
    },
  });
}

function buildNoteEntry({ bookId, itemKey, note, itemLookup }) {
  const payload = {
    text: text(note?.text),
    note: text(note?.note),
    assistantContent: text(note?.assistantContent),
  };
  if (!payload.text && !payload.note && !payload.assistantContent) return null;

  const context = resolveItemContext(itemKey, itemLookup);
  const sourceId = text(note?.id) || null;
  const createdAt = normalizeDate(note?.createdAt);
  const updatedAt = normalizeDate(note?.updatedAt);
  const rects = normalizeRects(note?.rects);
  const pageNumber = positiveNumber(note?.pageNumber);
  const identity = buildIdentity({
    store: STORE_NAMES.note,
    itemKey,
    sourceId,
    createdAt,
    content: [payload.text, payload.note, payload.assistantContent].join("\n"),
  });

  return buildBaseEntry({
    identity,
    bookId,
    context,
    scene: COMPANION_JOURNEY_SCENES.reading,
    type: COMPANION_JOURNEY_TYPES.note,
    createdAt,
    updatedAt,
    sourceRef:
      pageNumber || payload.text
        ? {
            kind: "selection",
            pageNumber,
            text: payload.text,
            rects,
            contentBlockId: text(note?.contentBlockId),
            blockCharRange: normalizeCharRange(note?.blockCharRange),
            contentFingerprint: text(note?.contentFingerprint),
            anchorStatus: text(note?.anchorStatus),
          }
        : context.itemKey
        ? { kind: "reading_item", itemKey: context.itemKey }
        : null,
    payloadRef: {
      store: STORE_NAMES.note,
      itemKey: context.itemKey,
      sourceId,
    },
    payload: {
      ...payload,
      pageNumber,
      rects,
      source: text(note?.source) || "selection",
      sourceMessageId: text(note?.sourceMessageId),
      highlightDisabled: Boolean(note?.highlightDisabled),
    },
  });
}

function buildBaseEntry({
  identity,
  bookId,
  context,
  scene,
  type,
  createdAt,
  updatedAt,
  sourceRef,
  payloadRef,
  payload,
}) {
  return {
    _identity: identity,
    id: `journey:${type}:${hashString(identity)}`,
    bookId: text(bookId),
    readingItemId: context.readingItemId,
    itemKey: context.itemKey,
    itemIndex: context.itemIndex,
    itemTitle: context.itemTitle,
    scene,
    type,
    status: context.orphaned
      ? COMPANION_JOURNEY_STATUSES.orphaned
      : COMPANION_JOURNEY_STATUSES.available,
    createdAt,
    updatedAt,
    sourceRef,
    payloadRef,
    payload,
  };
}

function buildItemLookup(planItems) {
  const lookup = new Map();
  asArray(planItems).forEach((item, index) => {
    const itemKey = getCompanionJourneyItemKey(item, index);
    lookup.set(itemKey, {
      readingItemId: text(item?.id) || null,
      itemKey,
      itemIndex: index,
      itemTitle: text(item?.title),
      orphaned: false,
    });
  });
  return lookup;
}

function resolveItemContext(itemKey, itemLookup) {
  const normalizedKey = text(itemKey) || null;
  if (normalizedKey && itemLookup.has(normalizedKey)) {
    return itemLookup.get(normalizedKey);
  }
  return {
    ...emptyItemContext(normalizedKey),
    orphaned: true,
  };
}

function emptyItemContext(itemKey) {
  return {
    readingItemId: null,
    itemKey: itemKey || null,
    itemIndex: null,
    itemTitle: "",
    orphaned: false,
  };
}

function groupedRecords(value) {
  if (Array.isArray(value)) {
    return [{ itemKey: null, records: value }];
  }
  return Object.entries(asObject(value)).map(([itemKey, records]) => ({
    itemKey,
    records: asArray(records),
  }));
}

function buildIdentity({ store, itemKey, sourceId, createdAt, content }) {
  if (sourceId) return [store, itemKey || "", sourceId].join("\u001f");
  return [store, itemKey || "", sourceId || "", createdAt || "", content || ""].join("\u001f");
}

function compareJourneyEntries(left, right) {
  const leftTime = dateTime(left.createdAt);
  const rightTime = dateTime(right.createdAt);
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (leftTime === null && rightTime !== null) return -1;
  if (leftTime !== null && rightTime === null) return 1;

  const leftItem = Number.isInteger(left.itemIndex) ? left.itemIndex : Number.MAX_SAFE_INTEGER;
  const rightItem = Number.isInteger(right.itemIndex) ? right.itemIndex : Number.MAX_SAFE_INTEGER;
  if (leftItem !== rightItem) return leftItem - rightItem;

  const sceneDifference = (SCENE_ORDER[left.scene] ?? 99) - (SCENE_ORDER[right.scene] ?? 99);
  if (sceneDifference !== 0) return sceneDifference;
  return left._sequence - right._sequence;
}

function hasGuideContent(guide) {
  return Boolean(
    guide.overview ||
      guide.notes ||
      guide.goals.length ||
      guide.concepts.length ||
      guide.questions.length ||
      guide.focus.length
  );
}

function normalizeGuideInput(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;

  const source = value.trim();
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Keep malformed legacy guides visible instead of dropping the record.
  }
  return { notes: source };
}

function normalizeQuote(value) {
  const quoteText = text(value?.text);
  if (!quoteText) return null;
  return {
    pageNumber: positiveNumber(value?.pageNumber),
    text: quoteText,
    rects: normalizeRects(value?.rects),
    contentBlockId: text(value?.contentBlockId) || null,
    blockCharRange: normalizeCharRange(value?.blockCharRange),
    contentFingerprint: text(value?.contentFingerprint) || null,
    anchorStatus: text(value?.anchorStatus) || null,
  };
}

function normalizeCharRange(value) {
  const start = Number(value?.start);
  const end = Number(value?.end);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start
    ? { start, end }
    : null;
}

function normalizeRects(value) {
  return asArray(value)
    .map((rect) => ({
      x: clampRatio(rect?.x),
      y: clampRatio(rect?.y),
      width: clampRatio(rect?.width),
      height: clampRatio(rect?.height),
    }))
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function dateTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function textList(value) {
  return asArray(value).map(text).filter(Boolean);
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hashString(value) {
  let hash = 2166136261;
  const input = String(value);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
