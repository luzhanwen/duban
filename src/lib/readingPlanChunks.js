const DEFAULT_OVERFLOW_RATIO = 0.2;
export const READING_PLAN_CHUNKING_VERSION = 3;

export function splitChapterIntoPlanChunks(
  chapter,
  {
    splitLongChapters,
    maxPagesPerSession,
    overflowRatio = DEFAULT_OVERFLOW_RATIO,
  }
) {
  const startPage = toPageNumber(chapter?.startPage, 1);
  const endPage = Math.max(startPage, toPageNumber(chapter?.endPage, startPage));
  const pageCount = endPage - startPage + 1;
  const pageLimit = Math.max(1, toPageNumber(maxPagesPerSession, pageCount));
  const overflowAllowance = Math.max(2, Math.floor(pageLimit * overflowRatio));

  if (
    !splitLongChapters ||
    pageCount <= pageLimit ||
    pageCount <= pageLimit + overflowAllowance
  ) {
    return [createChunk(chapter?.title, startPage, endPage)];
  }

  const chunkCount = Math.ceil(pageCount / pageLimit);
  const baseChunkSize = Math.floor(pageCount / chunkCount);
  const remainder = pageCount % chunkCount;
  const chunks = [];
  let cursor = startPage;

  for (let index = 0; index < chunkCount; index += 1) {
    const chunkSize = baseChunkSize + (index < remainder ? 1 : 0);
    const chunkEnd = cursor + chunkSize - 1;
    chunks.push(
      createChunk(`${chapter?.title || "未命名章节"}（第 ${index + 1} 段）`, cursor, chunkEnd)
    );
    cursor = chunkEnd + 1;
  }

  return chunks;
}

export function repairLegacyReadingPlan(book, progress = {}) {
  const readingPlan = book?.readingPlan;
  const items = Array.isArray(readingPlan?.items) ? readingPlan.items : [];

  if (
    items.length === 0 ||
    Number(readingPlan?.chunkingVersion) >= READING_PLAN_CHUNKING_VERSION
  ) {
    return { book, progress, changed: false };
  }

  const chapters = Array.isArray(book?.chapters) ? book.chapters : [];
  const chapterById = new Map(chapters.map((chapter) => [chapter?.id, chapter]));
  const pageLimit = Math.max(
    1,
    toPageNumber(book?.readingProfile?.pace?.maxPagesPerSession, 45)
  );
  const overflowAllowance = Math.max(2, Math.floor(pageLimit * DEFAULT_OVERFLOW_RATIO));
  const currentItemIndex = Math.max(0, Number(progress?.currentItemIndex) || 0);
  const repairedItems = [];
  const groups = [];
  const oldIndexToNewIndex = new Map();

  for (let index = 0; index < items.length; ) {
    const firstPart = parsePartTitle(items[index]?.title);
    if (!firstPart || firstPart.partNumber !== 1) {
      oldIndexToNewIndex.set(index, repairedItems.length);
      repairedItems.push(items[index]);
      index += 1;
      continue;
    }

    const group = [items[index]];
    let cursor = index + 1;
    while (cursor < items.length) {
      const part = parsePartTitle(items[cursor]?.title);
      if (
        !part ||
        part.baseTitle !== firstPart.baseTitle ||
        part.partNumber !== group.length + 1 ||
        !hasSameChapter(items[index], items[cursor]) ||
        Number(items[cursor - 1]?.endPage) + 1 !== Number(items[cursor]?.startPage)
      ) {
        break;
      }
      group.push(items[cursor]);
      cursor += 1;
    }

    const chapterId = group[0]?.chapterIds?.[0];
    const chapter = chapterById.get(chapterId);
    const startPage = Number(group[0]?.startPage);
    const endPage = Number(group.at(-1)?.endPage);
    const pageCount = endPage - startPage + 1;
    const spansWholeChapter =
      chapter &&
      Number(chapter.startPage) === startPage &&
      Number(chapter.endPage) === endPage;
    const isLegacyTailSplit =
      group.length > 1 &&
      spansWholeChapter &&
      pageCount <= pageLimit + overflowAllowance;

    if (!isLegacyTailSplit) {
      group.forEach((item, groupIndex) => {
        oldIndexToNewIndex.set(index + groupIndex, repairedItems.length);
        repairedItems.push(item);
      });
      index = cursor;
      continue;
    }

    const retainedOffset =
      currentItemIndex >= index && currentItemIndex < cursor
        ? currentItemIndex - index
        : findFirstIncompleteOffset(group, progress, index);
    const retainedItem = group[retainedOffset] || group[0];
    const mergedItem = {
      ...retainedItem,
      title: firstPart.baseTitle,
      startPage,
      endPage,
    };
    const nextIndex = repairedItems.length;
    group.forEach((_, groupIndex) => oldIndexToNewIndex.set(index + groupIndex, nextIndex));
    repairedItems.push(mergedItem);
    groups.push({
      items: group,
      startIndex: index,
      retainedItem,
      retainedKey: getItemKey(retainedItem, index + retainedOffset),
    });
    index = cursor;
  }

  const normalizedItems = repairedItems.map((item, index) => ({
    ...item,
    day: index + 1,
  }));
  const repairedProgress = repairProgress(progress, groups, oldIndexToNewIndex);
  const repairedBook = {
    ...book,
    readingPlan: {
      ...readingPlan,
      chunkingVersion: READING_PLAN_CHUNKING_VERSION,
      summary: repairPlanSummary(readingPlan?.summary, normalizedItems.length),
      items: normalizedItems,
      updatedAt: new Date().toISOString(),
    },
  };

  return {
    book: repairedBook,
    progress: repairedProgress,
    changed:
      groups.length > 0 ||
      Number(readingPlan?.chunkingVersion) !== READING_PLAN_CHUNKING_VERSION,
  };
}

function createChunk(title, startPage, endPage) {
  return {
    title: title || "未命名章节",
    startPage,
    endPage,
  };
}

function toPageNumber(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parsePartTitle(title) {
  const match = String(title || "").match(/^(.*?)（第\s*(\d+)\s*段）$/);
  if (!match) return null;
  return {
    baseTitle: match[1].trim(),
    partNumber: Number(match[2]),
  };
}

function hasSameChapter(left, right) {
  const leftIds = Array.isArray(left?.chapterIds) ? left.chapterIds : [];
  const rightIds = Array.isArray(right?.chapterIds) ? right.chapterIds : [];
  return (
    leftIds.length === 1 &&
    rightIds.length === 1 &&
    leftIds[0] &&
    leftIds[0] === rightIds[0]
  );
}

function findFirstIncompleteOffset(items, progress, startIndex = 0) {
  const completedKeys = new Set(
    Array.isArray(progress?.completedItemKeys) ? progress.completedItemKeys : []
  );
  const offset = items.findIndex(
    (item, index) => !completedKeys.has(getItemKey(item, startIndex + index))
  );
  return offset >= 0 ? offset : 0;
}

function repairProgress(progress, groups, oldIndexToNewIndex) {
  if (groups.length === 0) {
    return {
      ...progress,
      currentItemIndex:
        oldIndexToNewIndex.get(Math.max(0, Number(progress?.currentItemIndex) || 0)) || 0,
    };
  }

  const completedKeys = new Set(
    Array.isArray(progress?.completedItemKeys) ? progress.completedItemKeys : []
  );
  const completedAtByItemKey = { ...(progress?.completedAtByItemKey || {}) };
  const currentPageByItemKey = { ...(progress?.currentPageByItemKey || {}) };
  const readStateByItemKey = { ...(progress?.readStateByItemKey || {}) };

  groups.forEach(({ items, startIndex = 0, retainedKey }) => {
    const keys = items.map((item, index) => getItemKey(item, startIndex + index));
    const allCompleted = keys.every((key) => completedKeys.has(key));
    const bestLocation = pickLatestPageLocation(keys, currentPageByItemKey);
    const bestReadState = pickLatestReadState(keys, readStateByItemKey);
    const completedAt = keys
      .map((key) => completedAtByItemKey[key])
      .filter(Boolean)
      .sort()
      .at(-1);

    keys.forEach((key) => {
      completedKeys.delete(key);
      delete completedAtByItemKey[key];
      if (key !== retainedKey) {
        delete currentPageByItemKey[key];
        delete readStateByItemKey[key];
      }
    });

    if (allCompleted) {
      completedKeys.add(retainedKey);
      if (completedAt) completedAtByItemKey[retainedKey] = completedAt;
    }
    if (bestLocation) currentPageByItemKey[retainedKey] = bestLocation;
    if (bestReadState) readStateByItemKey[retainedKey] = bestReadState;
  });

  const oldCurrentIndex = Math.max(0, Number(progress?.currentItemIndex) || 0);
  return {
    ...progress,
    currentItemIndex: oldIndexToNewIndex.get(oldCurrentIndex) || 0,
    completedItemKeys: [...completedKeys],
    completedAtByItemKey,
    currentPageByItemKey,
    readStateByItemKey,
  };
}

function pickLatestPageLocation(keys, locations) {
  return keys
    .map((key) => locations[key])
    .filter(Boolean)
    .sort((left, right) => {
      const timeDelta =
        Date.parse(right?.updatedAt || "") - Date.parse(left?.updatedAt || "");
      if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
      return Number(right?.pageNumber || 0) - Number(left?.pageNumber || 0);
    })[0];
}

function pickLatestReadState(keys, states) {
  return keys
    .map((key) => states[key])
    .filter(Boolean)
    .sort(
      (left, right) =>
        Date.parse(right?.updatedAt || "") - Date.parse(left?.updatedAt || "")
    )[0];
}

function getItemKey(item, index = 0) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

function repairPlanSummary(summary, itemCount) {
  const text = String(summary || "");
  if (!text) return text;
  return text.replace(/预计\s*\d+\s*个阅读日完成/, `预计 ${itemCount} 个阅读日完成`);
}
