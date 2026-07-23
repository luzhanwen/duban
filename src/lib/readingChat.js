import { streamModelDetailed } from "./ai.js";
import { isAiOutputTruncated } from "./aiCompletion.js";
import { buildReadingChatPrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { buildCompanionContext } from "./companionContext.js";
import {
  sanitizeCompanionAnswerForPolicy,
  shouldStreamCompanionAnswer,
} from "./companionPolicy.js";
import { getItem, getSettings, KEYS, PROVIDERS, setItem } from "./storage.js";
import { toText } from "./text.js";

const MAX_HISTORY_MESSAGES = 8;

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
  readingContext,
  guide,
  messages,
  content,
  quote,
  sessionOverride,
  onDelta,
  signal,
}) {
  const text = toText(content).trim();
  if (!text) return { messages: normalizeMessages(messages), assistant: null };

  const settings = await getSettings();
  const userMessage = {
    id: makeId("chat-user"),
    role: "user",
    content: text,
    quote: normalizeQuote(quote),
    createdAt: new Date().toISOString(),
  };

  const existingMessages = normalizeMessages(messages);
  const history = existingMessages.slice(-MAX_HISTORY_MESSAGES);
  const context = buildCompanionContext({
    scene: "readingChat",
    book,
    item,
    itemKey,
    chapterSections,
    currentPageContext,
    readingContext,
    guide,
    history,
    userMessage: text,
    quote,
    sessionOverride,
    settings,
  });
  const prompts = buildPrompt({ book, item, context, userMessage: text });
  const streamAnswer = shouldStreamCompanionAnswer(context.policy);
  const result = await streamModelDetailed({
    settings,
    maxTokens: context.maxOutputTokens,
    hardMaxTokens: context.maxOutputTokens,
    system: prompts.system,
    messages: [
      {
        role: "user",
        content: prompts.user,
      },
    ],
    onText: streamAnswer ? onDelta : undefined,
    signal,
    taskType: "readingChat",
    diagnosticContext: {
      scene: context.scene,
      policy: context.policy,
      trace: context.trace,
    },
  });

  const assistantContent = sanitizeCompanionAnswerForPolicy(
    toText(result.text).trim(),
    context.policy
  ) || "这次回答生成失败。可以换个问法再试一次。";
  if (!streamAnswer) onDelta?.(assistantContent);

  const assistantMessage = {
    id: makeId("chat-assistant"),
    role: "assistant",
    content: assistantContent,
    model: result.model || getActiveModel(settings),
    usage: result.usage,
    cost: estimateChatCost(settings, result),
    finishReason: result.finishReason,
    truncated: isAiOutputTruncated(result),
    maxOutputTokens: context.maxOutputTokens,
    contextTrace: context.trace,
    createdAt: new Date().toISOString(),
  };

  const nextMessages = [...existingMessages, userMessage, assistantMessage];
  await saveReadingChat(book.id, itemKey, nextMessages);
  return { messages: nextMessages, user: userMessage, assistant: assistantMessage };
}

function buildPrompt({ book, item, context, userMessage }) {
  return {
    ...buildReadingChatPrompts({
    bookTitle: toText(book.title),
    bookAuthor: toText(book.author) || "未知",
    day: item.day,
    itemTitle: item.title,
    startPage: item.startPage,
    endPage: item.endPage,
    currentPage:
      context.trace.sourceRefs.find((source) => source.pageNumber)?.pageNumber || "未知",
    ...context.sections,
    ...context.contractPromptValues,
    contextBudgetInstruction: context.contextBudgetInstruction,
    userMessage,
    }),
    companionPolicy: context.policy,
  };
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((message) => ({
      ...message,
      id: toText(message.id) || makeId("chat"),
      role: message.role === "assistant" ? "assistant" : "user",
      content: toText(message.content).trim(),
      quote: normalizeQuote(message.quote),
      createdAt: message.createdAt || new Date().toISOString(),
    }))
    .filter((message) => message.content);
}

function normalizeQuote(quote) {
  if (!quote?.text) return null;
  return {
    pageNumber: Number(quote.pageNumber) || null,
    text: toText(quote.text).trim(),
    rects: normalizeRects(quote.rects),
    anchorSchemaVersion: Number(quote.anchorSchemaVersion) || null,
    contentBlockId: toText(quote.contentBlockId).trim() || null,
    blockCharRange: normalizeCharRange(quote.blockCharRange),
    contentFingerprint: toText(quote.contentFingerprint).trim() || null,
    anchorStatus: toText(quote.anchorStatus).trim() || null,
  };
}

function normalizeCharRange(value) {
  const start = Number(value?.start);
  const end = Number(value?.end);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start
    ? { start, end }
    : null;
}

function normalizeRects(rects) {
  if (!Array.isArray(rects)) return [];
  return rects
    .map((rect) => ({
      x: clampRatio(rect.x),
      y: clampRatio(rect.y),
      width: clampRatio(rect.width),
      height: clampRatio(rect.height),
    }))
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function estimateChatCost(settings, result) {
  const costSettings = result.settingsUsed || settings;
  if (costSettings.provider === PROVIDERS.openaiCompatible) {
    return estimateCustomCost(costSettings.openaiCompatible || {}, result.usage);
  }
  return estimateClaudeCost(result.model || costSettings.anthropic?.model, result.usage);
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
