import { streamModelDetailed } from "./ai.js";
import { isAiOutputTruncated } from "./aiCompletion.js";
import {
  buildReadingReflectionPrompts,
  buildReadingReflectionSummaryPrompts,
} from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { buildCompanionContext } from "./companionContext.js";
import { sanitizeCompanionAnswerForPolicy } from "./companionPolicy.js";
import { getItem, getSettings, KEYS, setItem } from "./storage.js";
import { toText } from "./text.js";

const MAX_HISTORY_MESSAGES = 10;

export async function getReadingReflection(bookId, itemKey) {
  if (!bookId || !itemKey) return [];
  const saved = await getItem(KEYS.bookReflection(bookId), {});
  if (Array.isArray(saved)) return normalizeReflectionMessages(saved);
  return normalizeReflectionMessages(saved?.[itemKey] || []);
}

export async function saveReadingReflection(bookId, itemKey, messages) {
  if (!bookId || !itemKey) return null;
  const saved = await getItem(KEYS.bookReflection(bookId), {});
  const next = Array.isArray(saved) ? {} : { ...saved };
  next[itemKey] = normalizeReflectionMessages(messages);
  return setItem(KEYS.bookReflection(bookId), next);
}

export function buildInitialReflectionMessage({ item, guide }) {
  const guideQuestion = toText(guide?.questions?.[0]).trim();
  const itemTitle = toText(item?.title) || "这一章";
  const content = guideQuestion
    ? `读完「${itemTitle}」后，可以回看读前那个问题：“${guideQuestion}”。现在你的答案有什么变化？从一个细节或一个判断说起就好。`
    : `读完「${itemTitle}」后，先留下一点自己的判断：这一部分让你看见了什么？从一个细节、一句话或一个疑问开始都可以。`;

  return {
    id: makeId("reflection-assistant"),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    kind: "opening",
  };
}

export async function sendReadingReflectionMessage({
  book,
  item,
  itemKey,
  chapterSections,
  guide,
  readingChatMessages = [],
  readingNotes = [],
  itemCompleted = false,
  messages,
  content,
  sessionOverride,
  onDelta,
  signal,
}) {
  const text = toText(content).trim();
  if (!text) return { messages: normalizeReflectionMessages(messages), assistant: null };

  const settings = await getSettings();
  const userMessage = {
    id: makeId("reflection-user"),
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
  };

  const existingMessages = normalizeReflectionMessages(messages);
  const history = existingMessages.slice(-MAX_HISTORY_MESSAGES);
  const context = buildCompanionContext({
    scene: "readingReflection",
    book,
    item,
    itemKey,
    chapterSections,
    guide,
    readingChatMessages,
    readingNotes,
    history,
    userMessage: text,
    sessionOverride,
    settings,
    itemCompleted,
  });
  const prompts = buildPrompt({ book, item, context, userMessage: text });

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
    onText: onDelta,
    signal,
    taskType: "readingReflection",
    diagnosticContext: {
      scene: context.scene,
      policy: context.policy,
      trace: context.trace,
    },
  });

  const assistantMessage = {
    id: makeId("reflection-assistant"),
    role: "assistant",
    content:
      sanitizeCompanionAnswerForPolicy(toText(result.text).trim(), context.policy) ||
      "这次追问生成失败。你可以再补一句理解，我们继续聊。",
    model: result.model || getActiveModel(settings),
    usage: result.usage,
    cost: estimateReflectionCost(settings, result),
    finishReason: result.finishReason,
    truncated: isAiOutputTruncated(result),
    maxOutputTokens: context.maxOutputTokens,
    contextTrace: context.trace,
    createdAt: new Date().toISOString(),
  };

  const nextMessages = [...existingMessages, userMessage, assistantMessage];
  await saveReadingReflection(book.id, itemKey, nextMessages);
  return { messages: nextMessages, user: userMessage, assistant: assistantMessage };
}

export async function generateReadingReflectionSummary({
  book,
  item,
  itemKey,
  chapterSections,
  guide,
  readingChatMessages = [],
  readingNotes = [],
  messages,
  onDelta,
  signal,
}) {
  const settings = await getSettings();
  const existingMessages = normalizeReflectionMessages(messages).filter(
    (message) => message.kind !== "summary"
  );
  const history = existingMessages.slice(-MAX_HISTORY_MESSAGES);
  const context = buildCompanionContext({
    scene: "readingReflection",
    book,
    item,
    itemKey,
    chapterSections,
    guide,
    readingChatMessages,
    readingNotes,
    history,
    userMessage: "整理本节总结",
    settings,
    itemCompleted: true,
  });
  const prompts = buildSummaryPrompt({ book, item, context });
  const result = await streamModelDetailed({
    settings,
    maxTokens: context.maxOutputTokens,
    hardMaxTokens: context.maxOutputTokens,
    system: prompts.system,
    messages: [{ role: "user", content: prompts.user }],
    onText: onDelta,
    signal,
    taskType: "readingReflection",
    diagnosticContext: {
      scene: context.scene,
      policy: context.policy,
      trace: context.trace,
    },
  });
  const summary = {
    id: makeId("reflection-summary"),
    role: "assistant",
    kind: "summary",
    content:
      sanitizeCompanionAnswerForPolicy(toText(result.text).trim(), context.policy) ||
      "这次没有整理出可靠的本节总结，请稍后重试。",
    model: result.model || getActiveModel(settings),
    usage: result.usage,
    cost: estimateReflectionCost(settings, result),
    finishReason: result.finishReason,
    truncated: isAiOutputTruncated(result),
    maxOutputTokens: context.maxOutputTokens,
    contextTrace: context.trace,
    createdAt: new Date().toISOString(),
  };
  const nextMessages = [...existingMessages, summary];
  await saveReadingReflection(book.id, itemKey, nextMessages);
  return { messages: nextMessages, summary };
}

function buildPrompt({ book, item, context, userMessage }) {
  return {
    ...buildReadingReflectionPrompts({
    bookTitle: toText(book.title),
    bookAuthor: toText(book.author) || "未知",
    day: item.day,
    itemTitle: item.title,
    startPage: item.startPage,
    endPage: item.endPage,
    ...context.sections,
    ...context.contractPromptValues,
    contextBudgetInstruction: context.contextBudgetInstruction,
    userMessage,
    }),
    companionPolicy: context.policy,
  };
}

function buildSummaryPrompt({ book, item, context }) {
  return {
    ...buildReadingReflectionSummaryPrompts({
      bookTitle: toText(book.title),
      bookAuthor: toText(book.author) || "未知",
      day: item.day,
      itemTitle: item.title,
      startPage: item.startPage,
      endPage: item.endPage,
      ...context.sections,
      ...context.contractPromptValues,
      contextBudgetInstruction: context.contextBudgetInstruction,
    }),
    companionPolicy: context.policy,
  };
}

function normalizeReflectionMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((message) => ({
      ...message,
      id: toText(message.id) || makeId("reflection"),
      role: message.role === "user" ? "user" : "assistant",
      content: toText(message.content).trim(),
      createdAt: message.createdAt || new Date().toISOString(),
    }))
    .filter((message) => message.content);
}

function getActiveModel(settings) {
  if (settings.provider === "openai-compatible") {
    return settings.openaiCompatible?.model || "";
  }
  return settings.anthropic?.model || "";
}

function estimateReflectionCost(settings, result) {
  const costSettings = result.settingsUsed || settings;
  if (costSettings.provider === "openai-compatible") {
    return estimateCustomCost(costSettings.openaiCompatible || {}, result.usage);
  }
  return estimateClaudeCost(result.model || costSettings.anthropic?.model, result.usage);
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
