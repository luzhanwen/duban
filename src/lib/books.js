import { getItem, setItem, KEYS } from "./storage.js";

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

export async function createBookFromPdf(file, parsed) {
  const now = new Date().toISOString();
  const id = makeId("book");
  const book = {
    id,
    title: parsed.title,
    author: parsed.author,
    fileName: file.name,
    fileSize: file.size,
    totalPages: parsed.totalPages,
    chapters: parsed.chapters,
    detectionSource: parsed.detectionSource,
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

export async function updateBook(id, updates) {
  const books = await listBooks();
  const now = new Date().toISOString();
  const nextBooks = books.map((book) =>
    book.id === id ? { ...book, ...updates, updatedAt: now } : book
  );
  await setItem(KEYS.books, nextBooks);
  return nextBooks.find((book) => book.id === id) || null;
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
