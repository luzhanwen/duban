export const BOOK_FORMATS = {
  pdf: "pdf",
  mobi: "mobi",
};

export const BOOK_FILE_ACCEPT =
  "application/pdf,.pdf,application/x-mobipocket-ebook,application/vnd.amazon.ebook,.mobi";

const PDF_MIME_TYPES = new Set(["application/pdf"]);
const MOBI_MIME_TYPES = new Set([
  "application/x-mobipocket-ebook",
  "application/vnd.amazon.ebook",
]);

export function getBookFormat(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();

  if (PDF_MIME_TYPES.has(type) || name.endsWith(".pdf")) return BOOK_FORMATS.pdf;
  if (MOBI_MIME_TYPES.has(type) || name.endsWith(".mobi")) return BOOK_FORMATS.mobi;
  return null;
}

export function getStoredBookFormat(book) {
  if (book?.format) return book.format;
  return getBookFormat({ name: book?.fileName, type: book?.fileType }) || BOOK_FORMATS.pdf;
}

export function isPdfBook(book) {
  return getStoredBookFormat(book) === BOOK_FORMATS.pdf;
}

export function getBookFormatLabel(formatOrBook) {
  const format =
    typeof formatOrBook === "string" ? formatOrBook : getStoredBookFormat(formatOrBook);
  if (format === BOOK_FORMATS.mobi) return "MOBI";
  return "PDF";
}

export function getBookPageUnitLabel(book) {
  return isPdfBook(book) ? "页" : "文本页";
}
