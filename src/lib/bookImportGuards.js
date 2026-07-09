import { BOOK_FORMATS, getBookFormatLabel } from "./bookFormats.js";

const MB = 1024 * 1024;

export const BOOK_IMPORT_LIMITS = {
  [BOOK_FORMATS.pdf]: {
    maxFileBytes: 150 * MB,
    maxPages: 2000,
    maxExtractedChars: 3_500_000,
  },
  [BOOK_FORMATS.mobi]: {
    maxFileBytes: 80 * MB,
    maxSpineItems: 1200,
    maxTextPages: 5000,
    maxExtractedChars: 3_500_000,
  },
};

export class BookImportError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "BookImportError";
    this.code = code;
    this.detail = detail;
  }
}

export function createBookImportError(code, message, detail) {
  return new BookImportError(code, message, detail);
}

export function createBookImportAbortError() {
  return createBookImportError("import-cancelled", "已取消导入。");
}

export function isBookImportAbortError(error) {
  return error?.code === "import-cancelled" || error?.name === "AbortError";
}

export function assertImportNotCancelled(signal) {
  if (signal?.aborted) throw createBookImportAbortError();
}

export function validateBookFileForImport(file, format) {
  const limits = BOOK_IMPORT_LIMITS[format];
  if (!limits) return;

  const size = Number(file?.size || 0);
  if (limits.maxFileBytes && size > limits.maxFileBytes) {
    throw createBookImportError(
      "file-too-large",
      `${getBookFormatLabel(format)} 文件过大：当前 ${formatFileSize(size)}，读伴当前最多支持 ${formatFileSize(
        limits.maxFileBytes
      )}。请先拆分、压缩或换一个较小版本。`,
      { size, maxFileBytes: limits.maxFileBytes, format }
    );
  }
}

export function validatePdfPageCount(totalPages) {
  const maxPages = BOOK_IMPORT_LIMITS[BOOK_FORMATS.pdf].maxPages;
  if (totalPages > maxPages) {
    throw createBookImportError(
      "pdf-too-many-pages",
      `这本 PDF 有 ${totalPages} 页，超过当前 ${maxPages} 页的导入上限。请先拆分成更小的文件后再导入。`,
      { totalPages, maxPages }
    );
  }
}

export function validateMobiSpineCount(totalItems) {
  const maxItems = BOOK_IMPORT_LIMITS[BOOK_FORMATS.mobi].maxSpineItems;
  if (totalItems > maxItems) {
    throw createBookImportError(
      "mobi-too-many-sections",
      `这本 MOBI 包含 ${totalItems} 个内容片段，超过当前 ${maxItems} 个片段的导入上限。请换一个结构更规整的文件。`,
      { totalItems, maxItems }
    );
  }
}

export function validateExtractedTextBudget(format, stats) {
  const limits = BOOK_IMPORT_LIMITS[format] || {};
  const extractedChars = Number(stats?.extractedChars || 0);
  const textPages = Number(stats?.textPages || 0);

  if (limits.maxExtractedChars && extractedChars > limits.maxExtractedChars) {
    throw createBookImportError(
      "extracted-text-too-large",
      `这本书提取出的文本过多，当前约 ${formatNumber(
        extractedChars
      )} 字，超过读伴当前处理上限。请先拆分文件后再导入。`,
      { extractedChars, maxExtractedChars: limits.maxExtractedChars, format }
    );
  }

  if (limits.maxTextPages && textPages > limits.maxTextPages) {
    throw createBookImportError(
      "too-many-text-pages",
      `这本书会生成 ${textPages} 个文本页，超过当前 ${limits.maxTextPages} 个文本页的导入上限。请先拆分文件后再导入。`,
      { textPages, maxTextPages: limits.maxTextPages, format }
    );
  }
}

export function validateExtractedTextPresence(format, extractedChars) {
  if (extractedChars >= 20) return;

  const label = getBookFormatLabel(format);
  const hint =
    format === BOOK_FORMATS.pdf
      ? "它可能是扫描版或图片版 PDF，需要先 OCR 成可复制文本。"
      : "文件里可能缺少可读取正文，或文件结构不兼容当前解析器。";

  throw createBookImportError(
    "empty-extracted-text",
    `${label} 没有提取到可阅读文本。${hint}`,
    { format, extractedChars }
  );
}

export function normalizeParseOptions(optionsOrProgress) {
  if (typeof optionsOrProgress === "function") {
    return { onProgress: optionsOrProgress, signal: null };
  }

  return {
    onProgress:
      typeof optionsOrProgress?.onProgress === "function"
        ? optionsOrProgress.onProgress
        : null,
    signal: optionsOrProgress?.signal || null,
  };
}

export function reportImportProgress(onProgress, progress) {
  if (!onProgress) return;
  onProgress({
    current: 0,
    total: 0,
    phase: "working",
    detail: "",
    ...progress,
  });
}

export function humanizeBookImportError(error, format) {
  if (isBookImportAbortError(error)) return "已取消导入，未保存任何内容。";
  if (error instanceof BookImportError) return error.message;

  const message = String(error?.message || "");
  const label = format ? getBookFormatLabel(format) : "书籍";

  if (/password|encrypted/i.test(message)) {
    return "这本 PDF 需要密码或受加密保护。请先解除密码后再导入。";
  }

  if (/InvalidPDF|invalid pdf|bad xref|corrupt|damaged/i.test(message)) {
    return "PDF 文件可能已损坏或格式不完整。请重新下载文件，或换一个版本再试。";
  }

  if (/network|fetch|读取本地/i.test(message)) {
    return "读取本地书籍文件失败，请确认文件仍在原位置，然后重新导入。";
  }

  return message || `${label} 解析失败，请换一本书或稍后重试。`;
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value >= MB) return `${trimNumber(value / MB)} MB`;
  if (value >= 1024) return `${trimNumber(value / 1024)} KB`;
  return `${value} B`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(Number(value || 0)));
}

function trimNumber(value) {
  return Number(value).toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}
