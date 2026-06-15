import { streamModelDetailed } from "./ai.js";
import { buildReadingChatPrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { buildReadingContractContext } from "./readingContract.js";
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
  quote,
  onDelta,
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
  const contractContext = buildReadingContractContext({ book, item });
  const contractPromptValues = buildContractPromptValues(contractContext);
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
          .map((message) => `${message.role === "user" ? "用户" : "读伴"}：${message.content}`)
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
    ...contractPromptValues,
    userMessage,
  });
}

function buildContractPromptValues(context) {
  const hasCompanionFocus = Boolean(context.available?.companionFocus);
  return {
    contractBookProblem: toText(context.bookProblem).trim(),
    contractCoreQuestion: toText(context.coreQuestion).trim(),
    contractCompanionFocusLabel: hasCompanionFocus
      ? formatCompanionFocusLabel(context.companionFocus)
      : "",
    contractCompanionFocusInstruction: hasCompanionFocus
      ? toText(context.companionFocus?.promptInstruction).trim()
      : "",
    contractCurrentStructureRole: toText(context.currentStructureRole).trim(),
    contractCurrentDifficultyHints: formatContractDifficultyHints(context.currentDifficultyHints),
    contractCurrentKeyTurns: formatContractKeyTurns(context.currentKeyTurns),
    contractSuggestedReadingPath: toText(context.suggestedReadingPath).trim(),
    contractSourceLimitations: toText(context.sourceLimitations).trim(),
    contractAvailableSummary: formatContractAvailableSummary(context.available),
  };
}

function formatCompanionFocusLabel(focus) {
  const label = toText(focus?.label).trim();
  const userText = toText(focus?.userText).trim();
  const aiSummary = toText(focus?.aiSummary).trim();
  return [label, userText || aiSummary].filter(Boolean).join("：");
}

function formatContractDifficultyHints(items) {
  return asArray(items)
    .map((item) => {
      const topic = toText(item?.topic).trim();
      const where = toText(item?.where).trim();
      const whyHard = toText(item?.whyHard).trim();
      const supportStrategy = toText(item?.supportStrategy).trim();
      const title = [topic, where ? `位置：${where}` : ""].filter(Boolean).join("，");
      const detail = [whyHard, supportStrategy ? `读伴可这样帮：${supportStrategy}` : ""]
        .filter(Boolean)
        .join("；");
      return [title, detail].filter(Boolean).join("：");
    })
    .filter(Boolean)
    .join("；");
}

function formatContractKeyTurns(items) {
  return asArray(items)
    .map((item) =>
      [toText(item?.title).trim(), toText(item?.whyItMatters).trim()]
        .filter(Boolean)
        .join("：")
    )
    .filter(Boolean)
    .join("；");
}

function formatContractAvailableSummary(available = {}) {
  const parts = [];
  if (available.wholeBookGuide) parts.push("已有整本书导读");
  if (available.companionFocus) parts.push("已有用户选择的读伴侧重点");
  if (available.structureMatch) parts.push("当前阅读项匹配到全书结构位置");
  if (available.difficultyMatch) parts.push("当前阅读项匹配到阅读难点");
  return parts.length > 0
    ? parts.join("；")
    : "没有可用的开书契约加成，按原有伴读问答逻辑回答，不要提及缺少上下文。";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
  };
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
