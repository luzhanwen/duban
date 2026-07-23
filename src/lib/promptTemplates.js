import mentorPersona from "../prompts/mentorPersona.md?raw";
import bookCompanionChatPrompt from "../prompts/bookCompanionChat.md?raw";
import readingChatPrompt from "../prompts/readingChat.md?raw";
import readingGuidePrompt from "../prompts/readingGuide.md?raw";
import readingReflectionPrompt from "../prompts/readingReflection.md?raw";
import readingReflectionSummaryPrompt from "../prompts/readingReflectionSummary.md?raw";
import readingTextFormatPrompt from "../prompts/readingTextFormat.md?raw";
import wholeBookGuidePrompt from "../prompts/wholeBookGuide.md?raw";
import { getWordSubstitutionPreferencesPrompt } from "./generatedTextPreferences.js";

export function buildReadingGuidePrompts(values) {
  return splitPromptSections(renderPrompt(readingGuidePrompt, values));
}

export function buildReadingChatPrompts(values) {
  return splitPromptSections(renderPrompt(readingChatPrompt, values));
}

export function buildBookCompanionChatPrompts(values) {
  return splitPromptSections(renderPrompt(bookCompanionChatPrompt, values));
}

export function buildReadingReflectionPrompts(values) {
  return splitPromptSections(renderPrompt(readingReflectionPrompt, values));
}

export function buildReadingReflectionSummaryPrompts(values) {
  return splitPromptSections(renderPrompt(readingReflectionSummaryPrompt, values));
}

export function buildReadingTextFormatPrompts(values) {
  return splitPromptSections(
    renderPrompt(readingTextFormatPrompt, values, { includeWordSubstitutions: false })
  );
}

export function buildWholeBookGuidePrompts(values) {
  return splitPromptSections(renderPrompt(wholeBookGuidePrompt, values));
}

function renderPrompt(template, values = {}, { includeWordSubstitutions = true } = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === "mentorPersona") {
      return [
        mentorPersona.trim(),
        includeWordSubstitutions ? getWordSubstitutionPreferencesPrompt() : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    return values[key] ?? "";
  });
}

function splitPromptSections(prompt) {
  const system = extractSection(prompt, "## 系统提示", "## 用户提示模板");
  const user = extractSection(prompt, "## 用户提示模板");
  return { system, user };
}

function extractSection(text, startLabel, endLabel) {
  const start = text.indexOf(startLabel);
  if (start < 0) return "";

  const contentStart = start + startLabel.length;
  const end = endLabel ? text.indexOf(endLabel, contentStart) : -1;
  return text.slice(contentStart, end < 0 ? undefined : end).trim();
}
