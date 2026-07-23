import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COMPANION_POLICY_OPTIONS,
  buildCompanionMemoryInstruction,
  buildCompanionPolicyInstruction,
  getCompanionOutputTokenLimit,
  getCompanionSettings,
  getDefaultCompanionPolicy,
  normalizeCompanionMemory,
  normalizeCompanionPolicy,
  resolveCompanionPolicy,
  sanitizeCompanionAnswerForPolicy,
  shouldIncludeCurrentItemText,
  shouldStreamCompanionAnswer,
} from "../src/lib/companionPolicy.js";

assert.equal(
  COMPANION_POLICY_OPTIONS.spoiler.find((option) => option.value === "hint")?.label,
  "提示关注方向，不透露后文"
);
for (const options of Object.values(COMPANION_POLICY_OPTIONS)) {
  assert.ok(options.every((option) => option.description?.trim()));
}

assert.deepEqual(getDefaultCompanionPolicy(), {
  schemaVersion: 1,
  spoiler: "avoid",
  answerDepth: "balanced",
  followUp: "helpful",
  proactivity: "quiet",
  knowledgeBoundary: "text_first",
});

assert.deepEqual(normalizeCompanionPolicy({ spoiler: "invalid", answerDepth: "deep" }), {
  schemaVersion: 1,
  spoiler: "avoid",
  answerDepth: "deep",
  followUp: "helpful",
  proactivity: "quiet",
  knowledgeBoundary: "text_first",
});

const legacyProfile = {
  companionFocus: {
    openingMessage: "我想先看懂制度背景",
    customFocus: "概念请先用白话解释",
    userText: "概念请先用白话解释",
    updatedAt: "2026-07-14T00:00:00.000Z",
  },
};
const legacyMemory = normalizeCompanionMemory(null, legacyProfile);
assert.equal(legacyMemory.initialized, false);
assert.deepEqual(legacyMemory.items.map((item) => item.text), [
  "我想先看懂制度背景",
  "概念请先用白话解释",
]);
assert.ok(legacyMemory.items.every((item) => item.source === "legacy"));

const explicitEmptyMemory = normalizeCompanionMemory(
  { initialized: true, items: [] },
  legacyProfile
);
assert.equal(explicitEmptyMemory.initialized, true);
assert.deepEqual(explicitEmptyMemory.items, [], "用户删空后不应再次静默导入旧记忆");

const base = getDefaultCompanionPolicy();
const oneShot = resolveCompanionPolicy(base, "allow-spoiler");
assert.equal(oneShot.spoiler, "allow");
assert.equal(base.spoiler, "avoid", "单次覆盖不能修改本书默认策略");
assert.equal(resolveCompanionPolicy(base, "default").spoiler, "avoid");

assert.equal(getCompanionOutputTokenLimit({ answerDepth: "concise" }, "readingChat"), 700);
assert.equal(getCompanionOutputTokenLimit({ answerDepth: "balanced" }, "readingChat"), 1500);
assert.equal(getCompanionOutputTokenLimit({ answerDepth: "deep" }, "readingChat"), 2600);
assert.equal(getCompanionOutputTokenLimit({ answerDepth: "concise" }, "readingGuide"), 2200);
assert.equal(getCompanionOutputTokenLimit({ answerDepth: "balanced" }, "readingGuide"), 3200);
assert.equal(getCompanionOutputTokenLimit({ answerDepth: "deep" }, "readingGuide"), 4600);
assert.equal(shouldIncludeCurrentItemText(base), false);
assert.equal(shouldIncludeCurrentItemText(oneShot), true);
assert.equal(shouldStreamCompanionAnswer(base), false);
assert.equal(shouldStreamCompanionAnswer(oneShot), true);
const policyInstruction = buildCompanionPolicyInstruction({
  spoiler: "avoid",
  answerDepth: "concise",
  followUp: "never",
  proactivity: "quiet",
  knowledgeBoundary: "book",
});
assert.match(policyInstruction, /不得引用、概括、暗示或预告用户尚未读到的内容/);
assert.match(policyInstruction, /不得凭你对本书的已有知识补写后续/);
assert.match(policyInstruction, /系统明确提供的已读正文/);
assert.match(policyInstruction, /不超过 2 个短段落/);
assert.match(policyInstruction, /不要向用户追问/);
assert.match(policyInstruction, /只依据本次提供的书中内容/);
assert.match(policyInstruction, /不主动发起阅读问题、提醒或新的阅读任务/);

const clarificationPolicyInstruction = buildCompanionPolicyInstruction({
  spoiler: "avoid",
  answerDepth: "balanced",
  followUp: "helpful",
  proactivity: "quiet",
  knowledgeBoundary: "text_first",
});
assert.match(clarificationPolicyInstruction, /不要为了延续对话而追问/);
assert.match(
  clarificationPolicyInstruction,
  /问题含义不明确或缺少回答所需信息/
);
assert.match(clarificationPolicyInstruction, /信息足够时直接结束回答/);

assert.equal(
  normalizeCompanionPolicy({ proactivity: "active" }).proactivity,
  "quiet",
  "旧书保存的主动模式必须在新版固定降级为安静"
);

const memoryInstruction = buildCompanionMemoryInstruction(legacyMemory);
assert.match(memoryInstruction, /用户明确保存或从旧设置迁入/);
assert.match(memoryInstruction, /概念请先用白话解释/);

const safeAnswer = "这句话是在说明经筵是一种制度安排。";
const leakedAnswer = `${safeAnswer}\n\n读到后面你会看到，皇帝最终拒绝了这套仪式。\n\n接着往下翻，你会看到讲官站出来。`;
assert.equal(sanitizeCompanionAnswerForPolicy(leakedAnswer, base), safeAnswer);
assert.match(
  sanitizeCompanionAnswerForPolicy("后面你会看到真正的结局。", base),
  /我先按住不说/
);
assert.equal(sanitizeCompanionAnswerForPolicy(leakedAnswer, oneShot), leakedAnswer);

const saved = getCompanionSettings({
  companionPolicy: { answerDepth: "deep", followUp: "always" },
  companionMemory: {
    initialized: true,
    items: [{ id: "one", text: "回答时联系我的工作经验", source: "user" }],
  },
  ...legacyProfile,
});
assert.equal(saved.policy.answerDepth, "deep");
assert.equal(saved.policy.followUp, "always");
assert.deepEqual(saved.memory.items.map((item) => item.text), ["回答时联系我的工作经验"]);

const [
  chatSource,
  reflectionSource,
  guideSource,
  guideReliabilitySource,
  contextSource,
  contractSource,
  readerSource,
  guidePromptSource,
] = await Promise.all([
  readFile(new URL("../src/lib/readingChat.js", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/readingReflection.js", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/readingGuides.js", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/readingGuideReliability.js", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/companionContext.js", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/readingContract.js", import.meta.url), "utf8"),
  readFile(new URL("../src/components/Reader.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/prompts/readingGuide.md", import.meta.url), "utf8"),
]);
for (const source of [chatSource, reflectionSource]) {
  assert.match(source, /buildCompanionContext/);
  assert.match(source, /hardMaxTokens: context\.maxOutputTokens/);
  assert.match(source, /contextTrace: context\.trace/);
}
assert.match(guideSource, /buildCompanionContext/);
assert.match(guideSource, /maxOutputTokens: context\.maxOutputTokens/);
assert.match(guideSource, /sourceContextCacheKey/);
assert.match(guideSource, /recoveredFromInputLimit/);
assert.match(guideReliabilitySource, /hardMaxTokens: primaryLimit/);
assert.match(guideReliabilitySource, /hardMaxTokens: retryLimit/);
assert.match(guideReliabilitySource, /isAiInputTooLong/);
assert.match(chatSource, /readingContext/);
assert.match(chatSource, /sanitizeCompanionAnswerForPolicy/);
assert.match(contextSource, /getCompanionOutputTokenLimit/);
assert.match(contextSource, /shouldIncludeCurrentItemText/);
assert.match(contextSource, /contractCompanionPolicyInstruction/);
assert.match(contextSource, /contractCompanionMemoryInstruction/);
assert.match(contextSource, /confirmed_read/);
assert.match(contextSource, /includeAssistant: allowUnread/);
assert.match(contractSource, /resolveCompanionPolicy/);
assert.match(contractSource, /companionMemoryInstruction/);
assert.match(contractSource, /sessionOverride/);
assert.match(readerSource, /本次回答/);
assert.match(readerSource, /回答参考范围/);
assert.match(readerSource, /setSessionOverride\("default"\)/);
assert.match(readerSource, /updateBookCompanionSettings/);
assert.match(guidePromptSource, /谁做了什么、为什么、结果怎样/);
assert.match(guidePromptSource, /不设置词语黑名单/);
assert.match(guidePromptSource, /今天为什么值得读/);
assert.match(guidePromptSource, /兴趣来自事实本身的张力/);
assert.doesNotMatch(guidePromptSource, /上帝视角/);

console.log("Companion policy tests passed.");
