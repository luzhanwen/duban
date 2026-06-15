import { streamModelDetailed } from "./ai.js";
import { buildReadingReflectionPrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { buildReadingContractContext } from "./readingContract.js";
import { getItem, getSettings, KEYS, setItem } from "./storage.js";
import { toText } from "./text.js";

const MAX_CONTEXT_CHARS = 9000;
const MAX_READING_CONTEXT_CHARS = 5000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_READING_CHAT_MESSAGES = 8;
const MAX_READING_NOTES = 8;
const REFLECTION_MAX_OUTPUT_TOKENS = 900;

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
    ? `你刚读完「${itemTitle}」。我们先不急着进入下一章：如果回到读前那个问题，“${guideQuestion}”，你现在会怎么回答？`
    : `你刚读完「${itemTitle}」。先用自己的话说一句：这一章最想让你看见什么？可以很粗糙，先说出来，我们再慢慢追问。`;

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
  messages,
  content,
  onDelta,
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
  const prompts = buildPrompt({
    book,
    item,
    chapterSections,
    guide,
    readingChatMessages,
    readingNotes,
    history,
    userMessage: text,
  });

  const result = await streamModelDetailed({
    settings,
    maxTokens: REFLECTION_MAX_OUTPUT_TOKENS,
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
    id: makeId("reflection-assistant"),
    role: "assistant",
    content: toText(result.text).trim() || "我这次没有追问出来。你可以再补一句你的理解，我们继续聊。",
    model: result.model || getActiveModel(settings),
    usage: result.usage,
    cost: estimateReflectionCost(settings, result),
    finishReason: result.finishReason,
    maxOutputTokens: REFLECTION_MAX_OUTPUT_TOKENS,
    createdAt: new Date().toISOString(),
  };

  const nextMessages = [...existingMessages, userMessage, assistantMessage];
  await saveReadingReflection(book.id, itemKey, nextMessages);
  return { messages: nextMessages, user: userMessage, assistant: assistantMessage };
}

function buildPrompt({
  book,
  item,
  chapterSections,
  guide,
  readingChatMessages,
  readingNotes,
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

  const historyText =
    history.length > 0
      ? history
          .map((message) => `${message.role === "user" ? "用户" : "读伴"}：${message.content}`)
          .join("\n")
      : "暂无读后交流历史。";
  const readingContextText = buildReadingContextText({
    chatMessages: readingChatMessages,
    notes: readingNotes,
  });

  return buildReadingReflectionPrompts({
    bookTitle: toText(book.title),
    bookAuthor: toText(book.author) || "未知",
    day: item.day,
    itemTitle: item.title,
    startPage: item.startPage,
    endPage: item.endPage,
    guideText,
    chapterText,
    ...contractPromptValues,
    readingContextText,
    historyText,
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
    : "没有可用的开书契约加成，按原有读后交流逻辑追问，不要提及缺少上下文。";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildReadingContextText({ chatMessages, notes }) {
  const chatText = normalizeReflectionMessages(chatMessages)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MAX_READING_CHAT_MESSAGES)
    .map((message) => {
      const role = message.role === "user" ? "用户伴读提问" : "读伴伴读回答";
      return `${role}：${message.content}`;
    });
  const noteText = normalizeReadingNotes(notes)
    .slice(0, MAX_READING_NOTES)
    .map((note, index) => {
      const page = note.pageNumber ? `第 ${note.pageNumber} 页，` : "";
      const quote = note.text ? `原文：“${note.text}”` : "";
      const userNote = note.note ? `笔记：${note.note}` : "";
      const assistant = note.assistantContent ? `读伴回答：${note.assistantContent}` : "";
      return `笔记 ${index + 1}：${page}${[quote, userNote, assistant].filter(Boolean).join("；")}`;
    });
  const sections = [
    chatText.length ? `伴读问答：\n${chatText.join("\n")}` : "",
    noteText.length ? `高亮和笔记：\n${noteText.join("\n")}` : "",
  ].filter(Boolean);

  return sections.length ? sections.join("\n\n").slice(0, MAX_READING_CONTEXT_CHARS) : "用户没有选择带入伴读问答或笔记，或当前阅读项暂无这些上下文。";
}

function normalizeReadingNotes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((note) => ({
      pageNumber: Number(note?.pageNumber) || null,
      text: toText(note?.text).trim(),
      note: toText(note?.note).trim(),
      assistantContent: toText(note?.assistantContent).trim(),
    }))
    .filter((note) => note.text || note.note || note.assistantContent);
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
  if (settings.provider === "openai-compatible") {
    return estimateCustomCost(settings.openaiCompatible || {}, result.usage);
  }
  return estimateClaudeCost(result.model || settings.anthropic?.model, result.usage);
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
