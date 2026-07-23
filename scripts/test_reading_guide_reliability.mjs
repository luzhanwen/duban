import assert from "node:assert/strict";
import {
  callReadingGuideWithRecovery,
  getReadingGuideRetryTokenLimit,
  isAiInputTooLong,
} from "../src/lib/readingGuideReliability.js";

const settings = {
  provider: "openai-compatible",
  openaiCompatible: {
    baseUrl: "https://api.example.com/v1",
    model: "reasoning-model",
  },
};
const prompts = {
  system: "请生成章节导读。",
  user: "只返回 JSON。",
};
const validText = JSON.stringify({
  overview: "### 接上一次阅读\n先接住上一节，再进入今天的内容。",
  goals: ["看清主线", "理解概念", "辨认论证"],
  questions: ["作者为何这样安排？", "证据如何连接？", "这段改变了什么？"],
});

function parseGuide(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { overview: "", goals: [], questions: [] };
  }
}

function hasGuideContent(guide) {
  return Boolean(guide?.overview || guide?.goals?.length || guide?.questions?.length);
}

const dependencies = { parseGuide, hasGuideContent };

function response(overrides = {}) {
  return {
    text: validText,
    finishReason: "stop",
    truncated: false,
    usage: { prompt_tokens: 1000, completion_tokens: 800 },
    model: "reasoning-model",
    ...overrides,
  };
}

const directCalls = [];
const direct = await callReadingGuideWithRecovery({
  settings,
  prompts,
  maxOutputTokens: 3200,
  ...dependencies,
  callModel: async (request) => {
    directCalls.push(request);
    return response();
  },
});
assert.equal(direct.attempts, 1);
assert.equal(direct.recoveredFrom, "");
assert.equal(direct.results.length, 1);
assert.equal(directCalls.length, 1);
assert.equal(directCalls[0].maxTokens, 3200);
assert.equal(directCalls[0].hardMaxTokens, 3200);

const truncatedCalls = [];
const recoveredFromTruncation = await callReadingGuideWithRecovery({
  settings,
  prompts,
  maxOutputTokens: 3200,
  compactOutputInstruction: "overview 压缩到 240-320 字。",
  ...dependencies,
  callModel: async (request) => {
    truncatedCalls.push(request);
    return truncatedCalls.length === 1
      ? response({ text: '{"overview":"未完成', finishReason: "length", truncated: true })
      : response();
  },
});
assert.equal(recoveredFromTruncation.attempts, 2);
assert.equal(recoveredFromTruncation.recoveredFrom, "output_truncated");
assert.equal(recoveredFromTruncation.results.length, 2);
assert.deepEqual(truncatedCalls.map((request) => request.maxTokens), [3200, 4800]);
assert.match(truncatedCalls[1].system, /上一次回答在输出上限处被截断/);
assert.match(truncatedCalls[1].system, /直接从 \{ 开始返回最终 JSON/);
assert.match(truncatedCalls[1].system, /压缩措辞而不是省略字段/);
assert.match(truncatedCalls[1].system, /overview 压缩到 240-320 字/);

const invalidCalls = [];
const recoveredFromInvalid = await callReadingGuideWithRecovery({
  settings,
  prompts,
  maxOutputTokens: 3200,
  ...dependencies,
  callModel: async (request) => {
    invalidCalls.push(request);
    return invalidCalls.length === 1 ? response({ text: "我来分析一下。" }) : response();
  },
});
assert.equal(recoveredFromInvalid.attempts, 2);
assert.equal(recoveredFromInvalid.recoveredFrom, "response_format");
assert.match(invalidCalls[1].system, /没有形成可用的导读 JSON/);

await assert.rejects(
  () =>
    callReadingGuideWithRecovery({
      settings,
      prompts,
      maxOutputTokens: 3200,
      ...dependencies,
      callModel: async () =>
        response({ text: '{"overview":"未完成', finishReason: "length", truncated: true }),
    }),
  (error) =>
    error.code === "AI_OUTPUT_TRUNCATED" &&
    error.retryable === true &&
    error.attempts === 2 &&
    /连续两次/.test(error.message)
);

assert.equal(getReadingGuideRetryTokenLimit(2200), 3400);
assert.equal(getReadingGuideRetryTokenLimit(3200), 4800);
assert.equal(getReadingGuideRetryTokenLimit(4600), 6500);
assert.equal(isAiInputTooLong({ code: "AI_CONTENT_TOO_LONG" }), true);
assert.equal(isAiInputTooLong({ kind: "content" }), true);
assert.equal(isAiInputTooLong({ status: 413 }), true);
assert.equal(
  isAiInputTooLong({ message: "maximum context length exceeded for this model" }),
  true
);
assert.equal(isAiInputTooLong({ code: "AI_NETWORK_FAILED", kind: "network" }), false);

console.log("Reading-guide reliability and automatic recovery tests passed.");
