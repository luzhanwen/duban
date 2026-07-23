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
import { defaultChapterIncluded, guessChapterRole } from "./chapterRoles.js";
import { readFileAsArrayBuffer } from "./fileAdapter.js";
import { cleanText } from "./text.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const CHAPTER_PATTERNS = [
  /^第[一二三四五六七八九十百千万\d]+[章节篇编部卷]\s*.+/,
  /^第[一二三四五六七八九十百千万\d]+[章节篇编部卷]$/,
  /^chapter\s+[ivxlcdm\d]+[:.\s-]*.+/i,
  /^chapter\s+[ivxlcdm\d]+$/i,
  /^part\s+[ivxlcdm\d]+[:.\s-]*.+/i,
  /^\d{1,2}\s+[^\d\s].{2,50}$/,
  /^\d{1,2}[.、]\s*.{2,50}$/,
  /^\d{1,2}\.\d{1,2}\s*.{2,50}$/,
];
const REJECT_CHAPTER_PATTERNS = [
  /^第[一二三四五六七八九十百千万\d]+章\s*引语引自/i,
  /^\d{1,2}\s*(年|世纪|月|日|岁|支|个|世纪[，,])/,
  /^\d{1,2}\s*[、.]\s*\d{1,2}\s*世纪/,
];
const MAX_CHAPTER_CANDIDATES = 120;
const LAYOUT_HEADING_SCAN_LINES = 8;
const LAYOUT_HEADING_CONTINUATION_LINES = 2;
const LAYOUT_HEADING_MIN_SIZE = 18;
const LAYOUT_LINE_Y_TOLERANCE = 2;

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
    const layoutChapters = [];
    let extractedChars = 0;

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      assertImportNotCancelled(signal);
      const page = await pdf.getPage(pageNumber);
      assertImportNotCancelled(signal);
      const textContent = await page.getTextContent();
      assertImportNotCancelled(signal);
      const layoutChapter = guessChapterFromTextContent(textContent, pageNumber);
      if (layoutChapter) layoutChapters.push(layoutChapter);
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

    const textChapters = guessChaptersFromText(pages, totalPages);
    const detected = chooseChapterCandidates(
      [
        { source: "outline", chapters: outlineChapters },
        { source: "layout", chapters: layoutChapters },
        { source: "text", chapters: textChapters },
      ],
      totalPages
    );

    return {
      title: cleanTitle(metadata.title) || guessTitleFromFile(file.name),
      author: stringifyMetadataValue(metadata.author),
      totalPages,
      pages,
      chapters: buildChapterRanges(detected.chapters, totalPages),
      detectionSource: detected.source,
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

  const entries = [];
  await collectOutlineEntries({
    pdf,
    items: outline,
    totalPages,
    signal,
    level: 0,
    entries,
  });

  return pickBestOutlineLevel(entries, totalPages);
}

async function collectOutlineEntries({ pdf, items, totalPages, signal, level, entries }) {
  for (const item of items || []) {
    assertImportNotCancelled(signal);
    const page = await getOutlinePage(pdf, item.dest);
    const title = normalizeLine(item.title);
    if (title && page && page <= totalPages) {
      entries.push({
        level,
        title: normalizeLine(item.title),
        startPage: page,
        source: "outline",
      });
    }
    if (item.items?.length) {
      await collectOutlineEntries({
        pdf,
        items: item.items,
        totalPages,
        signal,
        level: level + 1,
        entries,
      });
    }
  }
}

function pickBestOutlineLevel(entries, totalPages) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.level)) groups.set(entry.level, []);
    groups.get(entry.level).push(entry);
  }

  let best = [];
  let bestScore = -Infinity;
  for (const chapters of groups.values()) {
    const normalized = normalizeChapterCandidates(chapters, totalPages).slice(
      0,
      MAX_CHAPTER_CANDIDATES
    );
    const score = scoreChapterCandidates(normalized, totalPages, "outline");
    if (score > bestScore) {
      best = normalized;
      bestScore = score;
    }
  }

  return best;
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

  const chapters = dedupeChapters(candidates).slice(0, MAX_CHAPTER_CANDIDATES);
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

function guessChapterFromTextContent(textContent, pageNumber) {
  const lines = extractTextContentLines(textContent).slice(0, LAYOUT_HEADING_SCAN_LINES);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.fontSize < LAYOUT_HEADING_MIN_SIZE) continue;
    if (!isLikelyChapterTitle(line.text)) continue;

    const titleParts = [line.text];
    for (
      let offset = 1;
      offset <= LAYOUT_HEADING_CONTINUATION_LINES && index + offset < lines.length;
      offset += 1
    ) {
      const next = lines[index + offset];
      const sizeDelta = Math.abs(next.fontSize - line.fontSize);
      if (next.fontSize < LAYOUT_HEADING_MIN_SIZE) break;
      if (sizeDelta > line.fontSize * 0.35) break;
      if (isLikelyChapterTitle(next.text)) break;
      if (next.text.length > 80) break;
      titleParts.push(next.text);
    }

    const title = normalizeDetectedChapterTitle(titleParts.join(" "));
    if (title) {
      return {
        title,
        startPage: pageNumber,
        source: "layout",
      };
    }
  }

  return null;
}

function extractTextContentLines(textContent) {
  const groups = [];

  for (const item of textContent.items || []) {
    const str = "str" in item ? item.str : "";
    if (!str.trim()) continue;

    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4]) || 0;
    const y = Number(transform[5]) || 0;
    const fontSize =
      Math.hypot(Number(transform[2]) || 0, Number(transform[3]) || 0) ||
      Number(item.height) ||
      0;

    let group = groups.find(
      (candidate) => Math.abs(candidate.y - y) <= LAYOUT_LINE_Y_TOLERANCE
    );
    if (!group) {
      group = { y, items: [], fontSize: 0 };
      groups.push(group);
    }
    group.items.push({ x, str });
    group.fontSize = Math.max(group.fontSize, fontSize);
  }

  return groups
    .sort((a, b) => b.y - a.y)
    .map((group) => ({
      text: normalizeLine(
        group.items
          .sort((a, b) => a.x - b.x)
          .map((item) => item.str)
          .join("")
      ),
      fontSize: group.fontSize,
    }))
    .filter((line) => line.text);
}

function chooseChapterCandidates(options, totalPages) {
  let best = null;
  let bestScore = -Infinity;

  for (const option of options) {
    const chapters = normalizeChapterCandidates(option.chapters, totalPages).slice(
      0,
      MAX_CHAPTER_CANDIDATES
    );
    const score = scoreChapterCandidates(chapters, totalPages, option.source);
    if (score > bestScore) {
      best = {
        source: option.source,
        chapters,
      };
      bestScore = score;
    }
  }

  if (!best || best.chapters.length === 0) {
    return {
      source: "fallback",
      chapters: [{ title: "全文", startPage: 1, endPage: totalPages, source: "fallback" }],
    };
  }

  if (best.chapters.every((chapter) => chapter.source === "fallback")) {
    return { ...best, source: "fallback" };
  }

  return best;
}

function scoreChapterCandidates(chapters, totalPages, source) {
  if (!chapters.length) return -Infinity;
  if (chapters.every((chapter) => chapter.source === "fallback")) return -500;

  let score = Math.min(chapters.length, 80) * 3;
  const mainChapterCount = chapters.filter((chapter) =>
    isMainChapterHeading(chapter.title)
  ).length;
  score += mainChapterCount * 2;

  if (source === "outline") score += 24;
  if (source === "layout") score += 32;
  if (source === "text") {
    score -= 80;
    score -= (chapters.length - mainChapterCount) * 4;
  }

  if (chapters.length === 1) score -= 120;

  const maxSpan = chapters.reduce((currentMax, chapter, index) => {
    const next = chapters[index + 1];
    const endPage = next ? next.startPage - 1 : totalPages;
    return Math.max(currentMax, Math.max(1, endPage - chapter.startPage + 1));
  }, 1);
  const maxSpanRatio = maxSpan / Math.max(1, totalPages);
  if (maxSpanRatio > 0.9) score -= 80;
  else if (maxSpanRatio > 0.75) score -= 40;

  return score;
}

function normalizeChapterCandidates(chapters, totalPages) {
  const normalized = dedupeChapters(chapters)
    .map((chapter) => ({
      ...chapter,
      startPage: Number(chapter.startPage),
    }))
    .filter(
      (chapter) =>
        Number.isFinite(chapter.startPage) &&
        chapter.startPage >= 1 &&
        chapter.startPage <= totalPages
    )
    .sort((a, b) => a.startPage - b.startPage);

  return removeStructuralPartHeadings(normalized);
}

function isLikelyChapterTitle(line) {
  const normalized = normalizeLine(line);
  if (normalized.length < 2 || normalized.length > 70) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (REJECT_CHAPTER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return CHAPTER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function removeStructuralPartHeadings(chapters) {
  const chapterHeadingCount = chapters.filter((chapter) =>
    isMainChapterHeading(chapter.title)
  ).length;
  if (chapterHeadingCount < 3) return chapters;

  const kept = [];
  for (const chapter of chapters) {
    if (isStructuralPartHeading(chapter.title)) {
      const previous = kept[kept.length - 1];
      if (previous && previous.startPage < chapter.startPage) {
        previous.endPage = Math.min(
          previous.endPage || chapter.startPage - 1,
          chapter.startPage - 1
        );
      }
      continue;
    }
    kept.push(chapter);
  }

  return kept;
}

function isMainChapterHeading(title) {
  const normalized = normalizeLine(title);
  return (
    /^第[一二三四五六七八九十百千万\d]+章/.test(normalized) ||
    /^chapter\s+[ivxlcdm\d]+/i.test(normalized)
  );
}

function isStructuralPartHeading(title) {
  const normalized = normalizeLine(title);
  return (
    /^第[一二三四五六七八九十百千万\d]+编(?:\s|$)/.test(normalized) ||
    /^part\s+[ivxlcdm\d]+(?:\s|[:.\-—–]|$)/i.test(normalized)
  );
}

function normalizeDetectedChapterTitle(value) {
  return normalizeLine(value).replace(
    /^(第[一二三四五六七八九十百千万\d]+[章节篇编部卷])(?=\S)/,
    "$1 "
  );
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
    const role = chapter.role || guessChapterRole(chapter.title);
    return {
      id: makeId("chapter"),
      title: chapter.title || `章节 ${index + 1}`,
      startPage: chapter.startPage,
      endPage: Math.max(chapter.startPage, Math.min(endPage, totalPages)),
      source: chapter.source || "text",
      role,
      includeInReading:
        typeof chapter.includeInReading === "boolean"
          ? chapter.includeInReading
          : defaultChapterIncluded(role),
    };
  });
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
