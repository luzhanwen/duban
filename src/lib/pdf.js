import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { BOOK_FORMATS } from "./bookFormats.js";
import {
  assertImportNotCancelled,
  normalizeParseOptions,
  reportImportProgress,
  validateBookFileForImport,
  validateExtractedTextBudget,
  validateExtractedTextPresence,
  validatePdfPageCount,
} from "./bookImportGuards.js";
import { readFileAsArrayBuffer } from "./fileAdapter.js";
import { cleanText } from "./text.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const CHAPTER_PATTERNS = [
  /^第[一二三四五六七八九十百千万\d]+[章节篇部卷]\s*.+/,
  /^第[一二三四五六七八九十百千万\d]+[章节篇部卷]$/,
  /^chapter\s+[ivxlcdm\d]+[:.\s-]*.+/i,
  /^chapter\s+[ivxlcdm\d]+$/i,
  /^part\s+[ivxlcdm\d]+[:.\s-]*.+/i,
  /^\d{1,2}\s+[^\d\s].{2,50}$/,
  /^\d{1,2}[.、]\s*.{2,50}$/,
  /^\d{1,2}\.\d{1,2}\s*.{2,50}$/,
];

export async function parsePdf(file, optionsOrProgress) {
  const { onProgress, signal } = normalizeParseOptions(optionsOrProgress);
  validateBookFileForImport(file, BOOK_FORMATS.pdf);
  assertImportNotCancelled(signal);

  reportImportProgress(onProgress, {
    phase: "read-file",
    detail: "读取 PDF 文件",
    current: 0,
    total: 1,
  });
  const data = await readFileAsArrayBuffer(file, { signal });
  assertImportNotCancelled(signal);

  reportImportProgress(onProgress, {
    phase: "open-document",
    detail: "打开 PDF 文档",
    current: 0,
    total: 1,
  });
  const loadingTask = pdfjsLib.getDocument({ data });
  const cancelLoading = () => loadingTask.destroy();
  signal?.addEventListener("abort", cancelLoading, { once: true });

  let pdf = null;
  try {
    try {
      pdf = await loadingTask.promise;
    } catch (error) {
      assertImportNotCancelled(signal);
      throw error;
    }
    assertImportNotCancelled(signal);

    const totalPages = pdf.numPages;
    validatePdfPageCount(totalPages);

    reportImportProgress(onProgress, {
      phase: "read-metadata",
      detail: "读取目录和元数据",
      current: 0,
      total: totalPages,
    });
    const metadata = await readMetadata(pdf);
    assertImportNotCancelled(signal);
    const outlineChapters = await readOutlineChapters(pdf, totalPages, signal);
    assertImportNotCancelled(signal);

    const pages = [];
    let extractedChars = 0;

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      assertImportNotCancelled(signal);
      const page = await pdf.getPage(pageNumber);
      assertImportNotCancelled(signal);
      const textContent = await page.getTextContent();
      assertImportNotCancelled(signal);
      const text = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+\n/g, "\n")
        .trim();

      pages.push({ pageNumber, text });
      extractedChars += text.length;
      validateExtractedTextBudget(BOOK_FORMATS.pdf, { extractedChars });
      reportImportProgress(onProgress, {
        phase: "extract-text",
        detail: `提取第 ${pageNumber} / ${totalPages} 页文本`,
        current: pageNumber,
        total: totalPages,
      });
    }

    validateExtractedTextPresence(BOOK_FORMATS.pdf, extractedChars);

    const chapters =
      outlineChapters.length > 0
        ? outlineChapters
        : guessChaptersFromText(pages, totalPages);

    return {
      title: cleanTitle(metadata.title) || guessTitleFromFile(file.name),
      author: stringifyMetadataValue(metadata.author),
      totalPages,
      pages,
      chapters: buildChapterRanges(chapters, totalPages),
      detectionSource: outlineChapters.length > 0 ? "outline" : "text",
      format: BOOK_FORMATS.pdf,
    };
  } finally {
    signal?.removeEventListener("abort", cancelLoading);
    pdf?.destroy?.();
  }
}

async function readMetadata(pdf) {
  try {
    const { info, metadata } = await pdf.getMetadata();
    return {
      title: metadata?.get("dc:title") || info?.Title || "",
      author: metadata?.get("dc:creator") || info?.Author || "",
    };
  } catch {
    return { title: "", author: "" };
  }
}

async function readOutlineChapters(pdf, totalPages, signal) {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline || outline.length === 0) return [];

  const topLevel = [];
  for (const item of outline) {
    assertImportNotCancelled(signal);
    const page = await getOutlinePage(pdf, item.dest);
    if (page && page <= totalPages) {
      topLevel.push({
        title: normalizeLine(item.title),
        startPage: page,
        source: "outline",
      });
    }
  }

  return dedupeChapters(topLevel).slice(0, 80);
}

async function getOutlinePage(pdf, dest) {
  if (!dest) return null;
  const explicitDest =
    typeof dest === "string" ? await pdf.getDestination(dest).catch(() => null) : dest;
  const pageRef = Array.isArray(explicitDest) ? explicitDest[0] : null;
  if (!pageRef) return null;
  const index = await pdf.getPageIndex(pageRef).catch(() => null);
  return typeof index === "number" ? index + 1 : null;
}

function guessChaptersFromText(pages, totalPages) {
  const candidates = [];

  for (const page of pages) {
    const lines = page.text
      .split(/(?<=[。！？.!?])\s+|\n/)
      .map(normalizeLine)
      .filter(Boolean)
      .slice(0, 12);

    for (const line of lines) {
      if (isLikelyChapterTitle(line)) {
        candidates.push({
          title: line,
          startPage: page.pageNumber,
          source: "text",
        });
        break;
      }
    }
  }

  const chapters = dedupeChapters(candidates).slice(0, 80);
  if (chapters.length > 0) return chapters;

  return [
    {
      title: "全文",
      startPage: 1,
      endPage: totalPages,
      source: "fallback",
    },
  ];
}

function isLikelyChapterTitle(line) {
  if (line.length < 2 || line.length > 70) return false;
  if (/^\d+$/.test(line)) return false;
  return CHAPTER_PATTERNS.some((pattern) => pattern.test(line));
}

function buildChapterRanges(chapters, totalPages) {
  const sorted = dedupeChapters(chapters)
    .filter((chapter) => chapter.startPage >= 1 && chapter.startPage <= totalPages)
    .sort((a, b) => a.startPage - b.startPage);

  if (sorted.length === 0) {
    sorted.push({ title: "全文", startPage: 1, source: "fallback" });
  }

  return sorted.map((chapter, index) => {
    const next = sorted[index + 1];
    const endPage = chapter.endPage || (next ? next.startPage - 1 : totalPages);
    return {
      id: makeId("chapter"),
      title: chapter.title || `章节 ${index + 1}`,
      startPage: chapter.startPage,
      endPage: Math.max(chapter.startPage, Math.min(endPage, totalPages)),
      source: chapter.source || "text",
      role: chapter.role || guessChapterRole(chapter.title),
    };
  });
}

export function guessChapterRole(title) {
  const normalized = normalizeLine(title).toLowerCase();

  if (
    /^(copyright|copyright page|contents|table of contents|目录|版权|版权页)$/.test(
      normalized
    )
  ) {
    return "ignore";
  }

  if (
    /^(preface|foreword|prologue|welcome|about this publication|about this book|introduction to|导读|前言|序言|序|引言|出版说明|内容简介)/.test(
      normalized
    )
  ) {
    return "guide";
  }

  if (
    /^(appendix|appendices|glossary|references|bibliography|index|acknowledg(e)?ments|附录|术语表|参考文献|索引|致谢)/.test(
      normalized
    )
  ) {
    return "appendix";
  }

  return "main";
}

function dedupeChapters(chapters) {
  const seen = new Set();
  return chapters.filter((chapter) => {
    const key = `${chapter.startPage}:${chapter.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(chapter.title);
  });
}

function normalizeLine(value) {
  return cleanText(value)
    .replace(/\s+/g, " ")
    .replace(/[·•●]+/g, "")
    .trim();
}

function cleanTitle(value) {
  const title = normalizeLine(stringifyMetadataValue(value));
  if (!title || title.toLowerCase() === "untitled") return "";
  return title;
}

function stringifyMetadataValue(value) {
  return normalizeLine(value);
}

function guessTitleFromFile(fileName) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "未命名书籍";
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
