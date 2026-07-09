import { getItem, removeItem, setItem, KEYS, store } from "./storage.js";
import { BOOK_FORMATS, getBookFormat } from "./bookFormats.js";
import { toText } from "./text.js";

const COMPANION_FOCUS_TYPES = new Set([
  "mainline",
  "background",
  "argument",
  "application",
  "output",
  "custom",
]);

const PURPOSE_TO_FOCUS = {
  overview: "mainline",
  study: "background",
  deep: "argument",
  research: "output",
};

const COMPANION_FOCUS_DEFAULTS = {
  mainline: {
    label: "帮我抓主线",
    aiSummary: "减少被细节带走，持续提醒这段和全书问题的关系。",
    promptInstruction: "后续导读、问答和读后追问都要优先帮助用户抓住全书主线，避免只堆细节。",
  },
  background: {
    label: "帮我补背景",
    aiSummary: "在必要时解释人物、制度、概念和时代背景。",
    promptInstruction: "后续导读、问答和读后追问都要用克制的背景补充帮助用户读懂当前文本。",
  },
  argument: {
    label: "帮我拆论证",
    aiSummary: "追问作者的判断、证据和推理是否站得住。",
    promptInstruction: "后续导读、问答和读后追问都要帮助用户看见概念、证据和论证链。",
  },
  application: {
    label: "帮我联系现实",
    aiSummary: "把书中的问题和现实经验、工作生活或其他知识连接起来。",
    promptInstruction: "后续导读、问答和读后追问都要帮助用户把当前文本和现实经验建立连接。",
  },
  output: {
    label: "帮我沉淀输出",
    aiSummary: "把阅读转成笔记、文章、讲稿或可复用表达。",
    promptInstruction: "后续导读、问答和读后追问都要主动提示可沉淀的观点、结构和表达。",
  },
  custom: {
    label: "我自己指定",
    aiSummary: "",
    promptInstruction: "后续导读、问答和读后追问都要围绕用户自定义的阅读目标收束。",
  },
};

const COMPANION_FOCUS_KNOWN_FIELDS = new Set([
  "schemaVersion",
  "type",
  "label",
  "userText",
  "aiSummary",
  "promptInstruction",
  "selectedFromWholeBookGuide",
  "updatedAt",
]);

export async function listBooks() {
  return getItem(KEYS.books, []);
}

export async function getBook(id) {
  const books = await listBooks();
  return books.find((book) => book.id === id) || null;
}

export async function getBookPages(id) {
  return getItem(KEYS.bookPages(id), []);
}

export async function getBookFile(id) {
  return getItem(KEYS.bookFile(id), null);
}

export async function getBookCover(id) {
  return getItem(KEYS.bookCover(id), null);
}

export async function saveBookCover(id, coverDataUrl) {
  return setItem(KEYS.bookCover(id), coverDataUrl);
}

export async function getReadingProgress(id) {
  const saved = await getItem(KEYS.progress(id), {});
  return {
    currentItemIndex: 0,
    completedItemKeys: [],
    completedAtByItemKey: {},
    currentPageByItemKey: {},
    readingDays: [],
    lastReadAt: null,
    ...saved,
  };
}

export async function saveReadingProgress(id, progress) {
  return setItem(KEYS.progress(id), {
    currentItemIndex: 0,
    completedItemKeys: [],
    completedAtByItemKey: {},
    currentPageByItemKey: {},
    readingDays: [],
    lastReadAt: null,
    ...progress,
    updatedAt: new Date().toISOString(),
  });
}

export async function createBookFromParsedFile(file, parsed) {
  const now = new Date().toISOString();
  const id = makeId("book");
  const format = parsed.format || getBookFormat(file) || BOOK_FORMATS.pdf;
  const book = {
    id,
    title: parsed.title,
    author: parsed.author,
    format,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    totalPages: parsed.totalPages,
    chapters: parsed.chapters,
    detectionSource: parsed.detectionSource,
    parser: parsed.parser,
    language: parsed.language,
    status: "parsed",
    createdAt: now,
    updatedAt: now,
  };

  const writtenKeys = [];
  let savedBooks = [];
  let bookAdded = false;

  try {
    savedBooks = await listBooks();
    await setItem(KEYS.books, [book, ...savedBooks]);
    bookAdded = true;

    await setItem(KEYS.bookFile(id), file);
    writtenKeys.push(KEYS.bookFile(id));
    await setItem(KEYS.bookPages(id), parsed.pages);
    writtenKeys.push(KEYS.bookPages(id));

    return book;
  } catch (error) {
    await Promise.allSettled(writtenKeys.map((key) => removeItem(key)));
    if (bookAdded) {
      try {
        await deleteBook(id);
      } catch {
        await setItem(KEYS.books, savedBooks).catch(() => {});
      }
    }
    throw error;
  }
}

export async function createBookFromPdf(file, parsed) {
  return createBookFromParsedFile(file, { ...parsed, format: BOOK_FORMATS.pdf });
}

export async function updateBook(id, updates) {
  const books = await listBooks();
  const now = new Date().toISOString();
  const nextBooks = books.map((book) =>
    book.id === id ? { ...book, ...updates, updatedAt: now } : book
  );
  await setItem(KEYS.books, nextBooks);
  return nextBooks.find((book) => book.id === id) || null;
}

export async function updateBookCompanionFocus(id, companionFocusPatch = {}) {
  const books = await listBooks();
  const bookIndex = books.findIndex((book) => book.id === id);
  if (bookIndex < 0) return null;

  const now = new Date().toISOString();
  const book = books[bookIndex];
  const existingProfile = isPlainObject(book.readingProfile) ? book.readingProfile : {};
  const existingFocus = isPlainObject(existingProfile.companionFocus)
    ? existingProfile.companionFocus
    : null;
  const patch = isPlainObject(companionFocusPatch) ? companionFocusPatch : {};
  const baseFocus = existingFocus
    ? normalizeCompanionFocus(existingFocus)
    : getDefaultCompanionFocus(
        normalizeCompanionFocusType(patch.type) || focusTypeFromPurpose(existingProfile.purpose)
      );
  const companionFocus = normalizeCompanionFocus({
    ...mergeCompanionFocusPatch(baseFocus, patch),
    updatedAt: now,
  });
  const readingProfile = {
    ...existingProfile,
    schemaVersion: existingProfile.schemaVersion || 2,
    companionFocus,
    updatedAt: now,
  };
  const updatedBook = {
    ...book,
    readingProfile,
    updatedAt: now,
  };
  const nextBooks = [...books];
  nextBooks[bookIndex] = updatedBook;

  await setItem(KEYS.books, nextBooks);
  return updatedBook;
}

export async function deleteBook(id) {
  if (!id) return false;

  const books = await listBooks();
  const book = books.find((item) => item.id === id);
  const nextBooks = books.filter((item) => item.id !== id);

  if (typeof store.deleteBook === "function") {
    const deleted = await store.deleteBook(id);
    return Boolean(book || deleted);
  }

  if (!book) {
    await setItem(KEYS.books, nextBooks);
    return false;
  }

  const itemKeys = new Set(
    (book.readingPlan?.items || []).map((item, index) => getPlanItemKey(item, index))
  );
  const chapterKeys = new Set(
    (book.chapters || []).map((chapter, index) => chapter.id || `chapter:${index}`)
  );
  const storedKeys = await store.keys();
  const storedBookKeys = storedKeys.filter(
    (key) => key === KEYS.progress(id) || key.startsWith(`book:${id}:`)
  );

  const keysToRemove = [
    ...storedBookKeys,
    KEYS.bookFile(id),
    KEYS.bookPages(id),
    KEYS.bookCover(id),
    KEYS.bookChat(id),
    KEYS.bookReflection(id),
    KEYS.bookNotes(id),
    KEYS.progress(id),
    ...[...itemKeys].flatMap((itemKey) => [
      KEYS.bookQuestions(id, itemKey),
      KEYS.bookFormattedText(id, itemKey),
    ]),
    ...[...chapterKeys].flatMap((chapterKey) => [
      KEYS.bookQuestions(id, chapterKey),
      KEYS.bookQuiz(id, chapterKey),
    ]),
  ];

  await Promise.allSettled([...new Set(keysToRemove)].map((key) => removeItem(key)));
  await setItem(KEYS.books, nextBooks);
  return true;
}

function getPlanItemKey(item, index = 0) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

export function normalizeCompanionFocus(value = {}) {
  const raw = isPlainObject(value) ? value : {};
  const type = normalizeCompanionFocusType(raw.type) || "mainline";
  const defaults = COMPANION_FOCUS_DEFAULTS[type];

  return {
    ...compactExtraFields(raw, COMPANION_FOCUS_KNOWN_FIELDS),
    schemaVersion: 1,
    type,
    label: cleanField(raw.label) || defaults.label,
    userText: cleanField(raw.userText),
    aiSummary: cleanField(raw.aiSummary) || defaults.aiSummary,
    promptInstruction: cleanField(raw.promptInstruction) || defaults.promptInstruction,
    selectedFromWholeBookGuide: raw.selectedFromWholeBookGuide === true,
    updatedAt: cleanField(raw.updatedAt),
  };
}

export function getDefaultCompanionFocus(type = "mainline") {
  const normalizedType = normalizeCompanionFocusType(type) || "mainline";
  const defaults = COMPANION_FOCUS_DEFAULTS[normalizedType];

  return {
    schemaVersion: 1,
    type: normalizedType,
    label: defaults.label,
    userText: "",
    aiSummary: defaults.aiSummary,
    promptInstruction: defaults.promptInstruction,
    selectedFromWholeBookGuide: false,
    updatedAt: "",
  };
}

export function companionFocusLabelByType(type) {
  return getDefaultCompanionFocus(type).label;
}

export function companionFocusInstructionByType(type) {
  return getDefaultCompanionFocus(type).promptInstruction;
}

function mergeCompanionFocusPatch(baseFocus, patch) {
  const next = {
    ...baseFocus,
    ...patch,
  };
  const nextType = normalizeCompanionFocusType(patch.type);
  const hasTypePatch = hasOwn(patch, "type");

  if (hasTypePatch && (!nextType || nextType !== baseFocus.type)) {
    const previousDefaults = getDefaultCompanionFocus(baseFocus.type);
    const nextDefaults = getDefaultCompanionFocus(nextType || "mainline");

    next.type = nextDefaults.type;
    if (!hasOwn(patch, "label") && cleanField(baseFocus.label) === previousDefaults.label) {
      next.label = nextDefaults.label;
    }
    if (
      !hasOwn(patch, "aiSummary") &&
      cleanField(baseFocus.aiSummary) === previousDefaults.aiSummary
    ) {
      next.aiSummary = nextDefaults.aiSummary;
    }
    if (
      !hasOwn(patch, "promptInstruction") &&
      cleanField(baseFocus.promptInstruction) === previousDefaults.promptInstruction
    ) {
      next.promptInstruction = nextDefaults.promptInstruction;
    }
  }

  return next;
}

function normalizeCompanionFocusType(type) {
  const value = cleanField(type);
  return COMPANION_FOCUS_TYPES.has(value) ? value : "";
}

function focusTypeFromPurpose(purpose) {
  return PURPOSE_TO_FOCUS[cleanField(purpose)] || "mainline";
}

function compactExtraFields(value, knownFields) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, fieldValue]) =>
        !knownFields.has(key) && fieldValue !== null && fieldValue !== undefined
    )
  );
}

function cleanField(value) {
  return toText(value).trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
