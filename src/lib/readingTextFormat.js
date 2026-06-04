import { callModelDetailed } from "./ai.js";
import { buildReadingTextFormatPrompts } from "./promptTemplates.js";
import { estimateClaudeCost, estimateCustomCost } from "./pricing.js";
import { getItem, getSettings, KEYS, PROVIDERS, setItem } from "./storage.js";
import { toText } from "./text.js";

const MAX_FORMAT_CHARS = 14000;

export async function getFormattedReadingText(bookId, itemKey) {
  if (!bookId || !itemKey) return null;
  return getItem(KEYS.bookFormattedText(bookId, itemKey), null);
}

export async function saveFormattedReadingText(bookId, itemKey, formatted) {
  return setItem(KEYS.bookFormattedText(bookId, itemKey), formatted);
}

export async function generateFormattedReadingText({ book, item, itemKey, chapterSections }) {
  const settings = await getSettings();
  const chapterText = chapterSections
    .map(
      (section) =>
        `【${section.chapter.title}】\n页码：${section.chapter.startPage}-${section.chapter.endPage}\n${section.text}`
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_FORMAT_CHARS);
  const prompts = buildReadingTextFormatPrompts({
    bookTitle: toText(book.title),
    bookAuthor: toText(book.author) || "未知",
    day: item.day,
    itemTitle: item.title,
    startPage: item.startPage,
    endPage: item.endPage,
    chapterText,
  });

  const result = await callModelDetailed({
    settings,
    maxTokens: 4200,
    system: prompts.system,
    messages: [
      {
        role: "user",
        content: prompts.user,
      },
    ],
  });

  const formatted = {
    markdown: cleanupMarkdown(result.text),
    raw: result.text,
    itemKey,
    provider: settings.provider,
    model: result.model || getActiveModel(settings),
    usage: result.usage,
    cost: estimateFormatCost(settings, result),
    generatedAt: new Date().toISOString(),
  };

  await saveFormattedReadingText(book.id, itemKey, formatted);
  return formatted;
}

function cleanupMarkdown(value) {
  return toText(value)
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function estimateFormatCost(settings, result) {
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
