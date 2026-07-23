import {
  CONTENT_BLOCK_QUALITY,
  getContentBlockItemOrder,
  getContentBlocksForItem,
  getContentBlocksForPage,
} from "./contentMap.js";

export const READING_FRONTIER_SCHEMA_VERSION = 1;

export function normalizeReadStateByItemKey(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([itemKey, state]) => [itemKey, normalizeItemReadState(state)])
      .filter(([itemKey]) => itemKey)
  );
}

export function updateProgressReadState(
  progress,
  { contentMap, itemKey, pageNumber, level = "reached", timestamp = new Date().toISOString() } = {}
) {
  if (!itemKey) return progress;
  const currentStates = normalizeReadStateByItemKey(progress?.readStateByItemKey);
  const current = normalizeItemReadState(currentStates[itemKey]);
  const pageBlocks = getContentBlocksForPage(contentMap, pageNumber, itemKey);
  const orders = pageBlocks
    .map((block) => getContentBlockItemOrder(block, itemKey))
    .filter(Number.isInteger);
  const range = orders.length > 0 ? [Math.min(...orders), Math.max(...orders)] : null;
  const next = {
    ...current,
    schemaVersion: READING_FRONTIER_SCHEMA_VERSION,
    mapFingerprint: contentMap?.sourceFingerprint || current.mapFingerprint || null,
    lastPageNumber: positiveInteger(pageNumber) || current.lastPageNumber,
    updatedAt: timestamp,
  };

  if (range) next.reachedRanges = addRange(current.reachedRanges, range);
  if (range && level === "engaged") {
    next.engagedRanges = addRange(current.engagedRanges, range);
  }
  if (level === "completed") {
    const itemBlocks = getContentBlocksForItem(contentMap, itemKey);
    const itemOrders = itemBlocks
      .map((block) => getContentBlockItemOrder(block, itemKey))
      .filter(Number.isInteger);
    if (itemOrders.length > 0) {
      const fullRange = [Math.min(...itemOrders), Math.max(...itemOrders)];
      next.reachedRanges = addRange(next.reachedRanges, fullRange);
      next.engagedRanges = addRange(next.engagedRanges, fullRange);
    }
    next.completedAt = current.completedAt || timestamp;
  }
  if (level === "unfinished") next.completedAt = null;

  return {
    ...progress,
    readStateByItemKey: {
      ...currentStates,
      [itemKey]: next,
    },
  };
}

export function buildAllowedReadingContext({
  contentMap,
  progress,
  itemKey,
  currentPageNumber,
  maxChars = 5200,
} = {}) {
  const state = normalizeItemReadState(progress?.readStateByItemKey?.[itemKey]);
  const mapMatches = !state.mapFingerprint || state.mapFingerprint === contentMap?.sourceFingerprint;
  const currentBlocks = getContentBlocksForPage(contentMap, currentPageNumber, itemKey).filter(
    (block) => block.quality !== CONTENT_BLOCK_QUALITY.unusable
  );
  const engagedBlocks = mapMatches
    ? getContentBlocksForItem(contentMap, itemKey).filter(
        (block) =>
          block.quality === CONTENT_BLOCK_QUALITY.good &&
          rangeContains(state.engagedRanges, getContentBlockItemOrder(block, itemKey))
      )
    : [];
  const currentIds = new Set(currentBlocks.map((block) => block.id));
  const currentOrder = currentBlocks.length > 0
    ? getContentBlockItemOrder(currentBlocks[0], itemKey)
    : Number.POSITIVE_INFINITY;
  const candidates = [
    ...currentBlocks,
    ...engagedBlocks
      .filter((block) => !currentIds.has(block.id))
      .sort((left, right) => {
        const leftOrder = getContentBlockItemOrder(left, itemKey);
        const rightOrder = getContentBlockItemOrder(right, itemKey);
        const distance = Math.abs(leftOrder - currentOrder) - Math.abs(rightOrder - currentOrder);
        return distance || rightOrder - leftOrder;
      }),
  ];
  const selected = [];
  let usedChars = 0;
  for (const block of candidates) {
    if (!block.text || usedChars + block.text.length > maxChars) continue;
    selected.push(block);
    usedChars += block.text.length;
  }
  selected.sort((left, right) => left.order - right.order);
  const priorBlocks = selected.filter((block) => !currentIds.has(block.id));

  return {
    schemaVersion: READING_FRONTIER_SCHEMA_VERSION,
    mapMatches,
    currentBlocks,
    readableBlocks: selected,
    priorBlocks,
    currentText: currentBlocks.map((block) => block.text).join("\n\n"),
    text: priorBlocks
      .map((block) => `【第 ${block.pageNumber} 页】${block.text}`)
      .join("\n\n"),
    usedChars,
  };
}

export function isBlockEngaged(progress, itemKey, block, contentMap) {
  const state = normalizeItemReadState(progress?.readStateByItemKey?.[itemKey]);
  if (state.mapFingerprint && state.mapFingerprint !== contentMap?.sourceFingerprint) return false;
  return rangeContains(state.engagedRanges, getContentBlockItemOrder(block, itemKey));
}

function normalizeItemReadState(value = {}) {
  return {
    schemaVersion: READING_FRONTIER_SCHEMA_VERSION,
    mapFingerprint: typeof value?.mapFingerprint === "string" ? value.mapFingerprint : null,
    reachedRanges: normalizeRanges(value?.reachedRanges),
    engagedRanges: normalizeRanges(value?.engagedRanges),
    lastPageNumber: positiveInteger(value?.lastPageNumber),
    completedAt: typeof value?.completedAt === "string" ? value.completedAt : null,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}

function addRange(ranges, range) {
  return normalizeRanges([...(Array.isArray(ranges) ? ranges : []), range]);
}

function normalizeRanges(value) {
  return (Array.isArray(value) ? value : [])
    .map((range) => [Number(range?.[0]), Number(range?.[1])])
    .filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start)
    .sort((left, right) => left[0] - right[0])
    .reduce((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1]);
      else merged.push([...range]);
      return merged;
    }, []);
}

function rangeContains(ranges, order) {
  return Number.isInteger(order) && normalizeRanges(ranges).some(([start, end]) => order >= start && order <= end);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
