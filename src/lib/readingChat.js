import { streamModelDetailed } from "./ai.js";
import { buildReadingChatPrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { getItem, getSettings, KEYS, PROVIDERS, setItem } from "./storage.js";
import { toText } from "./text.js";

const MAX_CONTEXT_CHARS = 10000;
const MAX_PAGE_CONTEXT_CHARS = 3500;
const MAX_HISTORY_MESSAGES = 8;
const CHAT_MAX_OUTPUT_TOKENS = 2600;

export async function getReadingChat(bookId, itemKey) {
  if (!bookId || !itemKey) return [];
  const saved = await getItem(KEYS.bookChat(bookId), {});
  if (Array.isArray(saved)) return normalizeMessages(saved);
  return normalizeMessages(saved?.[itemKey] || []);
}

export async function saveReadingChat(bookId, itemKey, messages) {
  if (!bookId || !itemKey) return null;
  const saved = await getItem(KEYS.bookChat(bookId), {});
  const next = Array.isArray(saved) ? {} : { ...saved };
  next[itemKey] = normalizeMessages(messages);
  return setItem(KEYS.bookChat(bookId), next);
}

export async function sendReadingChatMessage({
  book,
  item,
  itemKey,
  chapterSections,
  currentPageContext,
  guide,
  messages,
  content,
  onDelta,
}) {
  const text = toText(content).trim();
  if (!text) return { messages: normalizeMessages(messages), assistant: null };

  const settings = await getSettings();
  const userMessage = {
    id: makeId("chat-user"),
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
  };

  const existingMessages = normalizeMessages(messages);
  const history = existingMessages.slice(-MAX_HISTORY_MESSAGES);
  const prompts = buildPrompt({
    book,
    item,
    chapterSections,
    currentPageContext,
    guide,
    history,
    userMessage: text,
  });
  const result = await streamModelDetailed({
    settings,
    maxTokens: CHAT_MAX_OUTPUT_TOKENS,
    system: prompts.system,
    messages: [
      {
        role: "user",
        content: prompts.user,
      },
    ],
    onText: onDelta,
  });

  const assistantMessage = {
    id: makeId("chat-assistant"),
    role: "assistant",
    content: toText(result.text).trim() || "我这次没有生成有效回答，可以换个问法再试一次。",
    model: result.model || getActiveModel(settings),
    usage: result.usage,
    cost: estimateChatCost(settings, result),
    finishReason: result.finishReason,
    maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
    createdAt: new Date().toISOString(),
  };

  const nextMessages = [...existingMessages, userMessage, assistantMessage];
  await saveReadingChat(book.id, itemKey, nextMessages);
  return { messages: nextMessages, user: userMessage, assistant: assistantMessage };
}

function buildPrompt({
  book,
  item,
  chapterSections,
  currentPageContext,
  guide,
  history,
  userMessage,
}) {
  const chapterText = chapterSections
    .map(
      (section) =>
        `【${section.chapter.title}】\n页码：${section.chapter.startPage}-${section.chapter.endPage}\n${section.text}`
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_CONTEXT_CHARS);

  const guideText = guide
    ? [
        guide.overview ? `导读开场：${guide.overview}` : "",
        guide.goals?.length ? `阅读目标：${guide.goals.join("；")}` : "",
        guide.questions?.length ? `读前问题：${guide.questions.join("；")}` : "",
        guide.focus?.length ? `阅读提醒：${guide.focus.join("；")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "暂无导读。";

  const pageNumber = Number(currentPageContext?.pageNumber) || "";
  const currentPageText = toText(currentPageContext?.text).trim().slice(0, MAX_PAGE_CONTEXT_CHARS);
  const pageText = pageNumber
    ? currentPageText || "这一页暂时没有提取到可用文本。"
    : "当前还没有识别到用户正在看的页码。";

  const historyText =
    history.length > 0
      ? history
          .map((message) => `${message.role === "user" ? "用户" : "导师"}：${message.content}`)
          .join("\n")
      : "暂无历史对话。";

  return buildReadingChatPrompts({
    bookTitle: toText(book.title),
    bookAuthor: toText(book.author) || "未知",
    day: item.day,
    itemTitle: item.title,
    startPage: item.startPage,
    endPage: item.endPage,
    currentPage: pageNumber || "未知",
    currentPageText: pageText,
    guideText,
    chapterText,
    historyText,
    userMessage,
  });
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((message) => ({
      ...message,
      id: toText(message.id) || makeId("chat"),
      role: message.role === "assistant" ? "assistant" : "user",
      content: toText(message.content).trim(),
      createdAt: message.createdAt || new Date().toISOString(),
    }))
    .filter((message) => message.content);
}

function estimateChatCost(settings, result) {
  if (settings.provider === PROVIDERS.openaiCompatible) {
    return estimateCustomCost(settings.openaiCompatible || {}, result.usage);
  }
  return estimateClaudeCost(result.model || settings.anthropic?.model, result.usage);
}

function getActiveModel(settings) {
  if (settings.provider === PROVIDERS.openaiCompatible) {
    return settings.openaiCompatible?.model || "";
  }
  return settings.anthropic?.model || "";
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
