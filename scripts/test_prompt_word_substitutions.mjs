import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const promptNames = [
  "bookCompanionChat",
  "readingChat",
  "readingGuide",
  "readingReflection",
  "readingReflectionSummary",
  "readingTextFormat",
  "wholeBookGuide",
];

const [preferences, persona, promptTemplates, generatedTextPreferences, readingGuides, ...prompts] = await Promise.all([
  readFile(new URL("../src/prompts/wordSubstitutions.md", import.meta.url), "utf8"),
  readFile(new URL("../src/prompts/mentorPersona.md", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/promptTemplates.js", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/generatedTextPreferences.js", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/readingGuides.js", import.meta.url), "utf8"),
  ...promptNames.map((name) =>
    readFile(new URL(`../src/prompts/${name}.md`, import.meta.url), "utf8")
  ),
]);

assert.match(preferences, /\| 收束 \| 结束 \| 完毕、总结、回到主题等 \|/);
assert.match(preferences, /不是敏感词或禁用词表/);
assert.match(preferences, /展示阶段还会使用“默认替代”作为兜底/);
assert.match(preferences, /不修改用户输入、书籍原文、引文、书名或专有名词/);
assert.doesNotMatch(persona, /收束/);

assert.match(promptTemplates, /getWordSubstitutionPreferencesPrompt/);
assert.match(generatedTextPreferences, /wordSubstitutions\.md\?raw/);
assert.match(generatedTextPreferences, /result\.replaceAll\(preference\.source, preference\.fallback\)/);
assert.match(generatedTextPreferences, /《\[\^》\]\*》/);
assert.match(generatedTextPreferences, /\^\\s\*\>/);
assert.match(readingGuides, /applyGeneratedTextPreferences\(toText\(repaired\?\.overview \|\| value\.overview\)\)/);
assert.match(readingGuides, /\.map\(applyGeneratedTextPreferences\)/);
assert.match(
  promptTemplates,
  /renderPrompt\(readingTextFormatPrompt, values, \{ includeWordSubstitutions: false \}\)/
);
assert.ok(
  prompts.every((prompt) => prompt.includes("{{mentorPersona}}")),
  "所有模型 prompt 都应通过统一人格入口接收生成规范"
);
assert.ok(
  prompts.every((prompt) => !prompt.includes("收束")),
  "业务 prompt 不应继续用偏好替代名单中的原词给模型做反向示范"
);

console.log("Prompt word-substitution preference tests passed.");
