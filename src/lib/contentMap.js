import { fingerprintText } from "./companionEvents.js";
import { toText } from "./text.js";

export const CONTENT_MAP_SCHEMA_VERSION = 1;
export const CONTENT_BLOCK_QUALITY = Object.freeze({
  good: "good",
  limited: "limited",
  unusable: "unusable",
});

const TARGET_BLOCK_CHARS = 420;
const MAX_BLOCK_CHARS = 680;
const MIN_ACTIVE_BLOCK_CHARS = 70;

export function buildBookContentMap({ book, pages = [], planItems = [] } = {}) {
  const normalizedPages = [...(Array.isArray(pages) ? pages : [])]
    .map((page) => ({
      pageNumber: positiveInteger(page?.pageNumber),
      text: normalizePageText(page?.text),
    }))
    .filter((page) => page.pageNumber)
    .sort((left, right) => left.pageNumber - right.pageNumber);
  const chapters = Array.isArray(book?.chapters) ? book.chapters : [];
  const items = Array.isArray(planItems) ? planItems : [];
  const sourceFingerprint = fingerprintText(
    normalizedPages.map((page) => `${page.pageNumber}:${page.text}`).join("\n\f\n")
  ) || "fnv1a:empty";
  const blocks = [];
  const pageSummaries = [];
  const itemOrder = new Map();

  for (const page of normalizedPages) {
    const pageQuality = evaluatePageTextQuality(page.text);
    const itemContexts = findReadingItems(items, page.pageNumber);
    const chapter = findChapter(chapters, page.pageNumber);
    const chunks = splitPageIntoBlocks(page.text);
    const pageBlocks = chunks.map((chunk, pageBlockIndex) => {
      const itemOrderByKey = {};
      for (const itemContext of itemContexts) {
        const nextItemOrder = itemOrder.get(itemContext.itemKey) || 0;
        itemOrderByKey[itemContext.itemKey] = nextItemOrder;
        itemOrder.set(itemContext.itemKey, nextItemOrder + 1);
      }
      const itemKeys = itemContexts.map((itemContext) => itemContext.itemKey);
      const itemKey = itemKeys[0] || null;
      const textFingerprint = fingerprintText(chunk.text) || "fnv1a:empty";
      const blockQuality = evaluateBlockQuality(chunk.text, pageQuality);
      const id = [
        "block",
        book?.format || "text",
        page.pageNumber,
        pageBlockIndex,
        textFingerprint.replace(/^fnv1a:/, ""),
      ].join(":");
      const block = {
        schemaVersion: CONTENT_MAP_SCHEMA_VERSION,
        id,
        bookId: toText(book?.id).trim() || null,
        chapterId: toText(chapter?.id).trim() || null,
        itemKey,
        itemKeys,
        pageNumber: page.pageNumber,
        originalPageNumber: book?.format === "pdf" ? page.pageNumber : null,
        textPageNumber: book?.format === "pdf" ? null : page.pageNumber,
        pageBlockIndex,
        itemOrder: itemKey ? itemOrderByKey[itemKey] : null,
        itemOrderByKey,
        order: blocks.length,
        charRange: { start: chunk.start, end: chunk.end },
        text: chunk.text,
        textFingerprint,
        quality: blockQuality.quality,
        qualityReasons: blockQuality.reasons,
        activeEligible:
          blockQuality.quality === CONTENT_BLOCK_QUALITY.good &&
          chunk.text.length >= MIN_ACTIVE_BLOCK_CHARS,
      };
      blocks.push(block);
      return block;
    });
    pageSummaries.push({
      pageNumber: page.pageNumber,
      quality: pageQuality.quality,
      qualityReasons: pageQuality.reasons,
      blockIds: pageBlocks.map((block) => block.id),
    });
  }

  return {
    schemaVersion: CONTENT_MAP_SCHEMA_VERSION,
    bookId: toText(book?.id).trim() || null,
    format: book?.format || "unknown",
    sourceFingerprint,
    generatedAt: new Date().toISOString(),
    blocks,
    pages: pageSummaries,
  };
}

export function evaluatePageTextQuality(value) {
  const text = normalizePageText(value);
  const reasons = [];
  if (!text || text.length < 20) reasons.push("sparse-text");

  const visible = Array.from(text).filter((character) => !/\s/.test(character));
  const useful = visible.filter((character) => /[\p{L}\p{N}\p{Script=Han}]/u.test(character));
  const replacements = visible.filter((character) => character === "�").length;
  const digits = visible.filter((character) => /\d/.test(character)).length;
  const usefulRatio = visible.length > 0 ? useful.length / visible.length : 0;
  const replacementRatio = visible.length > 0 ? replacements / visible.length : 0;
  const digitRatio = visible.length > 0 ? digits / visible.length : 0;

  if (replacementRatio > 0.04 || usefulRatio < 0.35) reasons.push("garbled-text");
  if (digitRatio > 0.48 && text.length > 80) reasons.push("numeric-dense");
  if (looksLikeContentsPage(text)) reasons.push("contents-like");

  const unusable = reasons.includes("sparse-text") || reasons.includes("garbled-text");
  return {
    quality: unusable
      ? CONTENT_BLOCK_QUALITY.unusable
      : reasons.length > 0
        ? CONTENT_BLOCK_QUALITY.limited
        : CONTENT_BLOCK_QUALITY.good,
    reasons,
  };
}

export function findContentBlockForSelection(contentMap, selection = {}, itemKey = null) {
  const pageNumber = positiveInteger(selection?.pageNumber);
  const quote = normalizeInlineText(selection?.text);
  const pageBlocks = getContentBlocksForPage(contentMap, pageNumber, itemKey);
  if (pageBlocks.length === 0) return null;

  for (const block of pageBlocks) {
    const normalizedBlockText = normalizeInlineText(block.text);
    const start = quote ? normalizedBlockText.indexOf(quote) : -1;
    if (start >= 0) {
      return {
        block,
        blockCharRange: { start, end: start + quote.length },
        status: "exact",
      };
    }
  }

  return { block: pageBlocks[0], blockCharRange: null, status: "page" };
}

export function buildSelectionAnchor(contentMap, selection = {}, itemKey = null) {
  const match = findContentBlockForSelection(contentMap, selection, itemKey);
  const text = normalizeInlineText(selection?.text);
  return {
    anchorSchemaVersion: 2,
    contentBlockId: match?.block?.id || null,
    blockCharRange: match?.blockCharRange || null,
    contentFingerprint: text ? fingerprintText(text) : null,
    anchorStatus: match?.status || "page",
  };
}

export function resolveContentAnchor(contentMap, anchor = {}, sourceText = "") {
  const blocks = Array.isArray(contentMap?.blocks) ? contentMap.blocks : [];
  const quote = normalizeInlineText(sourceText);
  const direct = blocks.find((block) => block.id === anchor?.contentBlockId);
  if (direct && (!anchor?.contentFingerprint || !quote || fingerprintText(quote) === anchor.contentFingerprint)) {
    return { block: direct, status: "exact" };
  }

  const pageBlocks = getContentBlocksForPage(contentMap, anchor?.pageNumber, anchor?.itemKey);
  if (quote) {
    const relocated = pageBlocks.find((block) => normalizeInlineText(block.text).includes(quote));
    if (relocated) return { block: relocated, status: "relocated" };
  }

  const fingerprint = anchor?.contentFingerprint;
  const fingerprintMatch = fingerprint
    ? blocks.find((block) => block.textFingerprint === fingerprint)
    : null;
  if (fingerprintMatch) return { block: fingerprintMatch, status: "relocated" };
  if (pageBlocks[0]) return { block: pageBlocks[0], status: "page" };
  return { block: null, status: "missing" };
}

export function getContentBlocksForPage(contentMap, pageNumber, itemKey = null) {
  const normalizedPage = positiveInteger(pageNumber);
  return (Array.isArray(contentMap?.blocks) ? contentMap.blocks : []).filter(
    (block) =>
      block.pageNumber === normalizedPage &&
      (!itemKey || getContentBlockItemKeys(block).length === 0 || getContentBlockItemKeys(block).includes(itemKey))
  );
}

export function getContentBlocksForItem(contentMap, itemKey) {
  return (Array.isArray(contentMap?.blocks) ? contentMap.blocks : []).filter(
    (block) => getContentBlockItemKeys(block).includes(itemKey)
  );
}

export function getContentBlockItemOrder(block, itemKey) {
  const keyedOrder = block?.itemOrderByKey?.[itemKey];
  if (Number.isInteger(keyedOrder)) return keyedOrder;
  return block?.itemKey === itemKey && Number.isInteger(block?.itemOrder) ? block.itemOrder : null;
}

function splitPageIntoBlocks(value) {
  const text = normalizePageText(value);
  if (!text) return [];
  const units = splitNaturalUnits(text);
  const chunks = [];
  let current = "";
  let currentStart = 0;
  let cursor = 0;

  for (const unit of units) {
    const start = text.indexOf(unit, cursor);
    const safeStart = start >= 0 ? start : cursor;
    cursor = safeStart + unit.length;
    if (!current) currentStart = safeStart;

    if (current && current.length + unit.length + 1 > TARGET_BLOCK_CHARS) {
      chunks.push({ text: current.trim(), start: currentStart, end: currentStart + current.length });
      current = "";
      currentStart = safeStart;
    }

    if (unit.length > MAX_BLOCK_CHARS) {
      if (current) {
        chunks.push({ text: current.trim(), start: currentStart, end: currentStart + current.length });
        current = "";
      }
      for (let offset = 0; offset < unit.length; offset += MAX_BLOCK_CHARS) {
        const slice = unit.slice(offset, offset + MAX_BLOCK_CHARS).trim();
        if (slice) chunks.push({ text: slice, start: safeStart + offset, end: safeStart + offset + slice.length });
      }
      continue;
    }

    current = current ? `${current} ${unit}` : unit;
  }

  if (current.trim()) {
    chunks.push({ text: current.trim(), start: currentStart, end: currentStart + current.length });
  }
  return chunks;
}

function splitNaturalUnits(text) {
  const paragraphs = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const sources = paragraphs.length > 1 ? paragraphs : [text];
  return sources.flatMap((paragraph) => {
    const sentences = paragraph.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || [];
    return sentences.map((sentence) => sentence.trim()).filter(Boolean);
  });
}

function evaluateBlockQuality(text, pageQuality) {
  const reasons = [...pageQuality.reasons];
  if (text.length < 28 && !reasons.includes("sparse-text")) reasons.push("short-block");
  return {
    quality:
      pageQuality.quality === CONTENT_BLOCK_QUALITY.unusable
        ? CONTENT_BLOCK_QUALITY.unusable
        : reasons.length > 0
          ? CONTENT_BLOCK_QUALITY.limited
          : CONTENT_BLOCK_QUALITY.good,
    reasons,
  };
}

function findReadingItems(items, pageNumber) {
  return items
    .map((item, index) => ({
      item,
      index,
      itemKey: item?.id || `${item?.type || "item"}:${index}`,
    }))
    .filter(
      ({ item }) =>
        pageNumber >= Number(item?.startPage || 1) && pageNumber <= Number(item?.endPage || 0)
    )
    .sort((left, right) => {
      const typeDifference = readingItemTypeRank(left.item?.type) - readingItemTypeRank(right.item?.type);
      if (typeDifference) return typeDifference;
      const leftSpan = Number(left.item?.endPage || 0) - Number(left.item?.startPage || 1);
      const rightSpan = Number(right.item?.endPage || 0) - Number(right.item?.startPage || 1);
      return leftSpan - rightSpan || left.index - right.index;
    })
    .filter(
      (context, index, contexts) =>
        contexts.findIndex((candidate) => candidate.itemKey === context.itemKey) === index
    );
}

function getContentBlockItemKeys(block) {
  if (Array.isArray(block?.itemKeys)) return block.itemKeys.filter(Boolean);
  return block?.itemKey ? [block.itemKey] : [];
}

function readingItemTypeRank(value) {
  const type = toText(value).trim().toLowerCase();
  if (type === "main" || type === "body") return 0;
  if (type === "guide" || type === "intro") return 2;
  return 1;
}

function findChapter(chapters, pageNumber) {
  return chapters.find(
    (chapter) =>
      pageNumber >= Number(chapter?.startPage || 1) && pageNumber <= Number(chapter?.endPage || 0)
  ) || null;
}

function looksLikeContentsPage(text) {
  const compact = text.replace(/\s+/g, " ");
  const heading = /(^|\s)(目录|目次|contents)(\s|$)/i.test(compact.slice(0, 160));
  const dottedLines = (text.match(/[.·…]{2,}/g) || []).length;
  return heading && (dottedLines >= 2 || /\d\s+\d\s+\d/.test(compact));
}

function normalizePageText(value) {
  return toText(value).replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim();
}

function normalizeInlineText(value) {
  return toText(value).replace(/\s+/g, " ").trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
