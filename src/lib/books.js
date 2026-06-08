import { getItem, removeItem, setItem, KEYS, store } from "./storage.js";
import { BOOK_FORMATS, getBookFormat } from "./bookFormats.js";

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

export async function getReadingProgress(id) {
  const saved = await getItem(KEYS.progress(id), {});
  return {
    currentItemIndex: 0,
    completedItemKeys: [],
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

  const books = await listBooks();
  await setItem(KEYS.books, [book, ...books]);
  await setItem(KEYS.bookFile(id), file);
  await setItem(KEYS.bookPages(id), parsed.pages);

  return book;
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

export async function deleteBook(id) {
  if (!id) return false;

  const books = await listBooks();
  const book = books.find((item) => item.id === id);
  const nextBooks = books.filter((item) => item.id !== id);

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

  await Promise.all([...new Set(keysToRemove)].map((key) => removeItem(key)));
  await setItem(KEYS.books, nextBooks);
  return true;
}

function getPlanItemKey(item, index = 0) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
