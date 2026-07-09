import { streamModelDetailed } from "./ai.js";
import { isAiOutputTruncated } from "./aiCompletion.js";
import { getBookPageUnitLabel } from "./bookFormats.js";
import { getBookPages } from "./books.js";
import { buildBookCompanionChatPrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { getItem, getSettings, KEYS, setItem } from "./storage.js";
import { cleanText, toText } from "./text.js";
import { normalizeWholeBookGuide } from "./wholeBookGuide.js";

export const BOOK_COMPANION_CHAT_ITEM_KEY = "__book_companion__";

const MAX_HISTORY_MESSAGES = 10;
const BOOK_COMPANION_MAX_OUTPUT_TOKENS = 2600;
const MAX_CURRENT_ITEM_CHARS = 5200;
const MAX_CURRENT_PAGE_CHARS = 1800;
const MAX_CONTEXT_LINE_CHARS = 520;

export async function getBookCompanionChat(bookId) {
  if (!bookId) return [];
  const saved = await getItem(KEYS.bookChat(bookId), {});
  if (Array.isArray(saved)) return normalizeMessages(saved);
  return normalizeMessages(saved?.[BOOK_COMPANION_CHAT_ITEM_KEY] || []);
}

export async function saveBookCompanionChat(bookId, messages) {
  if (!bookId) return null;
  const saved = await getItem(KEYS.bookChat(bookId), {});
  const next = Array.isArray(saved) ? {} : { ...saved };
  next[BOOK_COMPANION_CHAT_ITEM_KEY] = normalizeMessages(messages);
  return setItem(KEYS.bookChat(bookId), next);
}

export async function sendBookCompanionChatMessage({
  book,
  progress,
  messages,
  content,
  onDelta,
  signal,
}) {
  const text = toText(content).trim();
  if (!book?.id || !text) {
    return { messages: normalizeMessages(messages), assistant: null };
  }

  const settings = await getSettings();
  const existingMessages = normalizeMessages(messages);
  const userMessage = {
    id: makeId("book-chat-user"),
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
  };
  const promptContext = await buildPromptContext({ book, progress });
  const prompts = buildBookCompanionChatPrompts({
    ...promptContext,
    historyText: formatHistory(existingMessages.slice(-MAX_HISTORY_MESSAGES)),
    userMessage: text,
  });

  const result = await streamModelDetailed({
    settings,
    maxTokens: BOOK_COMPANION_MAX_OUTPUT_TOKENS,
    system: prompts.system,
    messages: [
      {
        role: "user",
        content: prompts.user,
      },
    ],
    onText: onDelta,
    signal,
    taskType: "bookCompanionChat",
  });

  const assistantMessage = {
    id: makeId("book-chat-assistant"),
    role: "assistant",
    content: toText(result.text).trim() || "这次回答生成失败。可以换个问法再试一次。",
    model: result.model || getActiveModel(settings),
    usage: result.usage,
    cost: estimateBookCompanionCost(settings, result),
    finishReason: result.finishReason,
    truncated: isAiOutputTruncated(result),
    maxOutputTokens: BOOK_COMPANION_MAX_OUTPUT_TOKENS,
    createdAt: new Date().toISOString(),
  };

  const nextMessages = [...existingMessages, userMessage, assistantMessage];
  await saveBookCompanionChat(book.id, nextMessages);
  return { messages: nextMessages, user: userMessage, assistant: assistantMessage };
}

async function buildPromptContext({ book, progress }) {
  const pages = await getBookPages(book.id).catch(() => []);
  const [chatStore, notesStore, reflectionStore] = await Promise.all([
    getItem(KEYS.bookChat(book.id), {}).catch(() => ({})),
    getItem(KEYS.bookNotes(book.id), {}).catch(() => ({})),
    getItem(KEYS.bookReflection(book.id), {}).catch(() => ({})),
  ]);
  const readingState = buildReadingState(book, progress);

  return {
    bookTitle: toText(book.title) || "未命名书籍",
    bookAuthor: toText(book.author) || "未知",
    bookFormat: getBookPageUnitLabel(book) === "文本页" ? "MOBI / 文本页" : "PDF / 原版页",
    companionMemory: formatCompanionMemory(book),
    wholeBookContext: formatWholeBookContext(book),
    readingProgressContext: formatReadingProgressContext(book, progress, readingState),
    currentReadingExcerpt: formatCurrentReadingExcerpt({
      book,
      pages,
      state: readingState,
    }),
    readerArtifactsContext: formatReaderArtifacts({
      chatStore,
      notesStore,
      reflectionStore,
    }),
  };
}

function buildReadingState(book, progress = {}) {
  const planItems = Array.isArray(book?.readingPlan?.items) ? book.readingPlan.items : [];
  const totalCount = planItems.length;
  const currentIndex = clampIndex(progress?.currentItemIndex || 0, totalCount);
  const currentItem = planItems[currentIndex] || null;
  const currentKey = getPlanItemKey(currentItem, currentIndex);
  const currentLocation = currentKey ? progress?.currentPageByItemKey?.[currentKey] || null : null;

  return {
    planItems,
    totalCount,
    currentIndex,
    currentItem,
    currentKey,
    currentLocation,
    completedKeys: Array.isArray(progress?.completedItemKeys) ? progress.completedItemKeys : [],
  };
}

function formatCompanionMemory(book) {
  const focus = book?.readingProfile?.companionFocus || {};
  const profile = focus.companionProfile || {};
  const openingAnswers = focus.openingAnswers || {};
  const lines = [
    `读伴名字：${toText(profile.name) || "读伴"}`,
    `侧重点：${toText(focus.label) || "帮我抓主线"}`,
    focus.userText ? `用户捎话：${limitLine(focus.userText)}` : "",
    focus.aiSummary ? `读伴理解：${limitLine(focus.aiSummary)}` : "",
    focus.promptInstruction ? `陪读指令：${limitLine(focus.promptInstruction)}` : "",
    openingAnswers.context ? `来处：${limitLine(openingAnswers.context)}` : "",
    openingAnswers.curiosity ? `好奇心：${limitLine(openingAnswers.curiosity)}` : "",
    openingAnswers.companion ? `希望读伴怎么陪：${limitLine(openingAnswers.companion)}` : "",
  ].filter(Boolean);

  return lines.length ? lines.join("\n") : "尚未形成明确的本书读伴记忆。";
}

function formatWholeBookContext(book) {
  const guide = normalizeWholeBookGuide(book?.wholeBookGuide);
  if (!guide || ["failed", "generating", "idle"].includes(toText(guide.status))) {
    return "尚未生成可用的整本书地图。";
  }

  const structure = asArray(guide.structureMap)
    .slice(0, 5)
    .map((item, index) =>
      `${index + 1}. ${compactParts([
        item.title,
        item.role || item.summary,
        item.readingHint ? `读法：${item.readingHint}` : "",
      ])}`
    )
    .filter(Boolean)
    .join("\n");
  const difficulty = asArray(guide.difficultyMap)
    .slice(0, 5)
    .map((item, index) =>
      `${index + 1}. ${compactParts([
        item.topic,
        item.where ? `位置：${item.where}` : "",
        item.whyHard,
        item.supportStrategy ? `支援：${item.supportStrategy}` : "",
      ])}`
    )
    .filter(Boolean)
    .join("\n");
  const turns = asArray(guide.keyTurns)
    .slice(0, 4)
    .map((item, index) => `${index + 1}. ${compactParts([item.title, item.whyItMatters])}`)
    .filter(Boolean)
    .join("\n");

  return [
    guide.bookProblem ? `这本书的问题意识：${limitLine(guide.bookProblem)}` : "",
    guide.coreQuestion ? `贯穿全书的问题：${limitLine(guide.coreQuestion)}` : "",
    structure ? `结构地图：\n${structure}` : "",
    difficulty ? `可能难点：\n${difficulty}` : "",
    turns ? `关键转折：\n${turns}` : "",
    guide.sourceLimitations ? `依据限制：${limitLine(guide.sourceLimitations)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n") || "整本书地图为空。";
}

function formatReadingProgressContext(book, progress, state) {
  const { planItems, totalCount, currentIndex, currentItem, currentKey, currentLocation, completedKeys } = state;
  const completedCount = completedKeys.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pageUnitLabel = getBookPageUnitLabel(book);
  const currentPage = currentLocation?.pageNumber || currentItem?.startPage || null;
  const planSummary = planItems.length
    ? planItems
        .slice(0, 18)
        .map((item, index) => {
          const key = getPlanItemKey(item, index);
          const status =
            index === currentIndex
              ? "当前"
              : completedKeys.includes(key)
              ? "已读"
              : "未读";
          return `${index + 1}. [${status}] ${toText(item.title) || "未命名阅读项"}（${formatPageRange(item, pageUnitLabel)}）`;
        })
        .join("\n")
    : "尚未生成阅读计划。";

  return [
    `阅读状态：${book.status === "planned" ? "已设定读伴和阅读计划" : "尚未完成读伴设定或阅读计划"}`,
    `完成进度：${completedCount}/${totalCount || 0}，约 ${percent}%`,
    currentItem
      ? `当前位置：第 ${currentIndex + 1}/${totalCount} 个阅读项「${toText(currentItem.title)}」，${currentPage ? formatPageLabel(currentPage, pageUnitLabel) : "暂无保存页码"}`
      : "当前位置：暂无",
    progress?.lastReadAt ? `最近阅读：${formatDateTime(progress.lastReadAt)}` : "最近阅读：暂无",
    `计划摘要：\n${planSummary}`,
    currentKey ? `当前阅读项 key：${currentKey}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCurrentReadingExcerpt({ book, pages, state }) {
  const { currentItem, currentLocation } = state;
  if (!currentItem) return "暂无当前阅读项摘录。";
  const pageUnitLabel = getBookPageUnitLabel(book);
  const entries = normalizePages(pages);
  const currentPageNumber = currentLocation?.pageNumber || currentItem.startPage || null;
  const currentPageText = currentPageNumber
    ? entries.find((page) => page.pageNumber === Number(currentPageNumber))?.text || ""
    : "";
  const itemText = entries
    .filter((page) => isPageInRange(page.pageNumber, currentItem.startPage, currentItem.endPage))
    .map((page) => `【${formatPageLabel(page.pageNumber, pageUnitLabel)}】\n${page.text}`)
    .join("\n\n")
    .slice(0, MAX_CURRENT_ITEM_CHARS);

  return [
    `当前阅读项：${toText(currentItem.title) || "未命名阅读项"}（${formatPageRange(currentItem, pageUnitLabel)}）`,
    currentPageText
      ? `最近页摘录（${formatPageLabel(currentPageNumber, pageUnitLabel)}）：\n${currentPageText.slice(0, MAX_CURRENT_PAGE_CHARS)}`
      : "",
    itemText ? `当前阅读项摘录：\n${itemText}` : "没有提取到当前阅读项文本。请不要伪造原文。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatReaderArtifacts({ chatStore, notesStore, reflectionStore }) {
  const notes = flattenGroupedItems(notesStore)
    .sort(byCreatedAtDesc)
    .slice(0, 8)
    .map((note, index) =>
      `${index + 1}. ${compactParts([
        note.itemKey ? `阅读项：${note.itemKey}` : "",
        note.note ? `笔记：${note.note}` : "",
        note.text ? `摘录：${note.text}` : "",
        note.assistantContent ? `读伴回答：${note.assistantContent}` : "",
      ])}`
    )
    .filter(Boolean)
    .join("\n");
  const readingChats = flattenGroupedMessages(chatStore, { excludeBookCompanion: true })
    .sort(byCreatedAtDesc)
    .slice(0, 8)
    .map((message, index) => `${index + 1}. ${message.role === "user" ? "用户" : "读伴"}：${limitLine(message.content)}`)
    .filter(Boolean)
    .join("\n");
  const reflections = flattenGroupedMessages(reflectionStore)
    .sort(byCreatedAtDesc)
    .slice(0, 6)
    .map((message, index) => `${index + 1}. ${message.role === "user" ? "用户" : "读伴"}：${limitLine(message.content)}`)
    .filter(Boolean)
    .join("\n");

  return [
    notes ? `最近笔记和高亮：\n${notes}` : "最近笔记和高亮：暂无",
    readingChats ? `最近阅读中问答：\n${readingChats}` : "最近阅读中问答：暂无",
    reflections ? `最近读后交流：\n${reflections}` : "最近读后交流：暂无",
  ].join("\n\n");
}

function normalizePages(pages) {
  return Array.isArray(pages)
    ? pages
        .map((page, index) => ({
          pageNumber: Number(page?.pageNumber ?? page?.number ?? index + 1) || index + 1,
          text: toText(page?.text ?? page?.content).trim(),
        }))
        .filter((page) => page.text)
    : [];
}

function flattenGroupedItems(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([itemKey, items]) =>
    Array.isArray(items) ? items.map((item) => ({ ...item, itemKey: item.itemKey || itemKey })) : []
  );
}

function flattenGroupedMessages(value, options = {}) {
  if (Array.isArray(value)) return normalizeMessages(value);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([itemKey, messages]) => {
    if (options.excludeBookCompanion && itemKey === BOOK_COMPANION_CHAT_ITEM_KEY) return [];
    return normalizeMessages(messages).map((message) => ({
      ...message,
      itemKey,
    }));
  });
}

function formatHistory(messages) {
  if (!messages.length) return "暂无本书级聊天历史。";
  return messages
    .map((message) => `${message.role === "user" ? "用户" : "读伴"}：${message.content}`)
    .join("\n");
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((message) => ({
      ...message,
      id: toText(message?.id) || makeId("book-chat"),
      role: message?.role === "assistant" ? "assistant" : "user",
      content: toText(message?.content).trim(),
      createdAt: message?.createdAt || new Date().toISOString(),
    }))
    .filter((message) => message.content);
}

function estimateBookCompanionCost(settings, result) {
  const costSettings = result.settingsUsed || settings;
  if (costSettings.provider === "openai-compatible") {
    return estimateCustomCost(costSettings.openaiCompatible || {}, result.usage);
  }
  return estimateClaudeCost(result.model || costSettings.anthropic?.model, result.usage);
}

function getActiveModel(settings) {
  if (settings.provider === "openai-compatible") {
    return settings.openaiCompatible?.model || "";
  }
  return settings.anthropic?.model || "";
}

function getPlanItemKey(item, index = 0) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

function formatPageRange(item, pageUnitLabel) {
  const start = Number(item?.startPage) || null;
  const end = Number(item?.endPage) || null;
  if (start && end && start !== end) return `${formatPageLabel(start, pageUnitLabel)}-${formatPageLabel(end, pageUnitLabel)}`;
  if (start) return formatPageLabel(start, pageUnitLabel);
  return "页码未知";
}

function formatPageLabel(pageNumber, pageUnitLabel) {
  if (pageUnitLabel === "文本页") return `文本页 ${pageNumber}`;
  return `第 ${pageNumber} 页`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "暂无";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isPageInRange(pageNumber, startPage, endPage) {
  const page = Number(pageNumber);
  const start = Number(startPage) || page;
  const end = Number(endPage) || start;
  return page >= Math.min(start, end) && page <= Math.max(start, end);
}

function compactParts(parts) {
  return parts.map(limitLine).filter(Boolean).join("；");
}

function limitLine(value, maxLength = MAX_CONTEXT_LINE_CHARS) {
  const text = cleanText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function byCreatedAtDesc(a, b) {
  return new Date(b?.createdAt || b?.updatedAt || 0) - new Date(a?.createdAt || a?.updatedAt || 0);
}

function clampIndex(index, length) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(Number(index) || 0, length - 1));
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
