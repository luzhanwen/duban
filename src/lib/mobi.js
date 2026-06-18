import { BOOK_FORMATS } from "./bookFormats.js";
import {
  assertImportNotCancelled,
  normalizeParseOptions,
  reportImportProgress,
  validateBookFileForImport,
  validateExtractedTextBudget,
  validateExtractedTextPresence,
  validateMobiSpineCount,
} from "./bookImportGuards.js";
import { guessChapterRole } from "./pdf.js";
import { cleanText, toText } from "./text.js";

const TEXT_PAGE_CHAR_LIMIT = 2200;

export async function parseMobi(file, optionsOrProgress) {
  const { onProgress, signal } = normalizeParseOptions(optionsOrProgress);
  validateBookFileForImport(file, BOOK_FORMATS.mobi);
  assertImportNotCancelled(signal);

  reportImportProgress(onProgress, {
    phase: "open-document",
    detail: "打开 MOBI 文件",
    current: 0,
    total: 1,
  });
  const { reader, parser } = await initMobiReader(file);
  assertImportNotCancelled(signal);

  try {
    const metadata = safeCall(() => reader.getMetadata()) || {};
    const spine = safeCall(() => reader.getSpine()) || [];
    if (spine.length === 0) {
      throw new Error("MOBI 文件没有可读取的正文章节。");
    }
    validateMobiSpineCount(spine.length);

    const tocTitleByChapterId = buildTocTitleByChapterId(reader);
    const pages = [];
    const chapters = [];
    let pageNumber = 1;
    let extractedChars = 0;

    for (let index = 0; index < spine.length; index += 1) {
      assertImportNotCancelled(signal);
      const spineItem = spine[index];
      const spineId = String(spineItem.id ?? index);
      const loaded = safeCall(() => reader.loadChapter(spineId));
      assertImportNotCancelled(signal);
      const html = toText(loaded?.html || spineItem.text);
      const text = htmlToReadableText(html);

      if (text) {
        const startPage = pageNumber;
        const chunks = splitTextIntoPages(text);

        chunks.forEach((chunk) => {
          pages.push({
            pageNumber,
            text: chunk,
            sourceChapterId: spineId,
          });
          extractedChars += chunk.length;
          pageNumber += 1;
        });
        validateExtractedTextBudget(BOOK_FORMATS.mobi, {
          extractedChars,
          textPages: pages.length,
        });

        const tocTitle = tocTitleByChapterId.get(spineId);
        const title =
          tocTitle || extractHeadingTitle(html) || `章节 ${chapters.length + 1}`;

        chapters.push({
          id: makeId("chapter"),
          title,
          startPage,
          endPage: pageNumber - 1,
          source: tocTitle ? "toc" : "spine",
          role: guessChapterRole(title),
        });
      }

      reportImportProgress(onProgress, {
        phase: "extract-text",
        detail: `提取第 ${index + 1} / ${spine.length} 个内容片段`,
        current: index + 1,
        total: spine.length,
      });
    }

    if (pages.length === 0) {
      throw new Error("MOBI 文件没有提取到可阅读文本。");
    }
    validateExtractedTextPresence(BOOK_FORMATS.mobi, extractedChars);

    return {
      title: cleanTitle(metadata.title) || guessTitleFromFile(file.name),
      author: toText(metadata.author),
      totalPages: pages.length,
      pages,
      chapters: chapters.length > 0 ? chapters : buildFallbackChapter(pages.length),
      detectionSource: tocTitleByChapterId.size > 0 ? "toc" : "spine",
      format: BOOK_FORMATS.mobi,
      parser,
      language: toText(metadata.language),
    };
  } finally {
    reader?.destroy?.();
  }
}

async function initMobiReader(file) {
  const { initKf8File, initMobiFile } = await import("@lingo-reader/mobi-parser");

  try {
    return {
      reader: await initMobiFile(file),
      parser: "mobi",
    };
  } catch (mobiError) {
    try {
      return {
        reader: await initKf8File(file),
        parser: "kf8",
      };
    } catch (kf8Error) {
      throw new Error(
        mobiError?.message || kf8Error?.message || "MOBI 解析失败，请换一本书重试。"
      );
    }
  }
}

function buildTocTitleByChapterId(reader) {
  const toc = safeCall(() => reader.getToc()) || [];
  const items = flattenToc(toc);
  const titleById = new Map();

  items.forEach((item) => {
    const title = cleanTitle(item.label);
    if (!title || !item.href) return;

    const resolved = safeCall(() => reader.resolveHref(item.href));
    const id = resolved?.id === undefined || resolved?.id === null ? "" : String(resolved.id);
    if (id && !titleById.has(id)) titleById.set(id, title);
  });

  return titleById;
}

function flattenToc(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => [item, ...flattenToc(item.children)]);
}

function htmlToReadableText(html) {
  const prepared = prepareHtmlForText(html);
  const text =
    typeof DOMParser === "undefined"
      ? stripTags(prepared)
      : parseTextWithDomParser(prepared);

  return normalizeReadableText(text);
}

function parseTextWithDomParser(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
  return doc.body?.textContent || "";
}

function prepareHtmlForText(html) {
  return toText(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*hr\b[^>]*>/gi, "\n\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(
      /<\s*\/\s*(p|div|section|article|header|footer|main|aside|blockquote|h[1-6]|li|ul|ol|tr|table)\s*>/gi,
      "\n"
    )
    .replace(
      /<\s*(p|div|section|article|header|footer|main|aside|blockquote|h[1-6]|ul|ol|tr|table)\b[^>]*>/gi,
      "\n"
    );
}

function normalizeReadableText(text) {
  return decodeHtmlEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitTextIntoPages(text) {
  const paragraphs = normalizeReadableText(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const pages = [];
  let current = "";

  function flush() {
    if (!current.trim()) return;
    pages.push(current.trim());
    current = "";
  }

  paragraphs.forEach((paragraph) => {
    if (paragraph.length > TEXT_PAGE_CHAR_LIMIT) {
      flush();
      splitLongParagraph(paragraph).forEach((chunk) => pages.push(chunk));
      return;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > TEXT_PAGE_CHAR_LIMIT) {
      flush();
      current = paragraph;
    } else {
      current = next;
    }
  });

  flush();
  return pages.length > 0 ? pages : [text.trim()];
}

function splitLongParagraph(paragraph) {
  const chunks = [];
  let cursor = 0;

  while (cursor < paragraph.length) {
    chunks.push(paragraph.slice(cursor, cursor + TEXT_PAGE_CHAR_LIMIT).trim());
    cursor += TEXT_PAGE_CHAR_LIMIT;
  }

  return chunks.filter(Boolean);
}

function extractHeadingTitle(html) {
  const match = toText(html).match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (!match) return "";
  return cleanTitle(stripTags(match[1]));
}

function stripTags(html) {
  return toText(html).replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(text) {
  if (!toText(text).includes("&")) return toText(text);

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  return toText(text)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanTitle(value) {
  const title = cleanText(value);
  if (!title || title.toLowerCase() === "untitled") return "";
  return title;
}

function guessTitleFromFile(fileName) {
  return toText(fileName).replace(/\.mobi$/i, "").replace(/[_-]+/g, " ").trim() || "未命名书籍";
}

function buildFallbackChapter(totalPages) {
  return [
    {
      id: makeId("chapter"),
      title: "全文",
      startPage: 1,
      endPage: totalPages,
      source: "fallback",
      role: "main",
    },
  ];
}

function safeCall(callback) {
  try {
    return callback();
  } catch {
    return null;
  }
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
