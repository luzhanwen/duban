import { createAiOutputTruncatedError, isAiOutputTruncated } from "./aiCompletion.js";

export async function callReadingGuideWithRecovery({
  settings,
  prompts,
  maxOutputTokens,
  compactOutputInstruction = "",
  signal,
  callModel,
  parseGuide,
  hasGuideContent,
  diagnosticContext = null,
}) {
  const primaryLimit = Math.max(1, Math.ceil(Number(maxOutputTokens) || 3200));
  const primary = await callModel({
    settings,
    maxTokens: primaryLimit,
    hardMaxTokens: primaryLimit,
    system: prompts.system,
    messages: [{ role: "user", content: prompts.user }],
    signal,
    taskType: "readingGuide",
    diagnosticContext,
  });
  const primaryParsed = parseGuide(primary.text);
  const recoveryReason = getGuideRecoveryReason(primary, primaryParsed, hasGuideContent);
  if (!recoveryReason) {
    return {
      result: primary,
      results: [primary],
      parsed: primaryParsed,
      attempts: 1,
      recoveredFrom: "",
    };
  }

  const retryLimit = getReadingGuideRetryTokenLimit(primaryLimit);
  const recoveryPrompts = buildGuideRecoveryPrompts(
    prompts,
    recoveryReason,
    compactOutputInstruction
  );
  const retry = await callModel({
    settings,
    maxTokens: retryLimit,
    hardMaxTokens: retryLimit,
    system: recoveryPrompts.system,
    messages: [{ role: "user", content: recoveryPrompts.user }],
    signal,
    taskType: "readingGuide",
    diagnosticContext,
  });
  const retryParsed = parseGuide(retry.text);
  if (isAiOutputTruncated(retry)) {
    const error = createAiOutputTruncatedError(
      "导读连续两次达到模型输出上限，已停止保存不完整内容。请在「设置 → 模型配置 → 章节导读」中提高输出 token 上限后再试。",
      retry
    );
    error.retryable = true;
    error.attempts = 2;
    throw error;
  }
  if (!hasGuideContent(retryParsed)) {
    const error = new Error(
      "模型连续两次没有返回可用的导读结构。请稍后重试，或在模型配置中更换章节导读模型。"
    );
    error.code = "AI_GUIDE_FORMAT_INVALID";
    error.kind = "response_format";
    error.retryable = true;
    error.attempts = 2;
    throw error;
  }
  return {
    result: retry,
    results: [primary, retry],
    parsed: retryParsed,
    attempts: 2,
    recoveredFrom: recoveryReason,
  };
}

export function getReadingGuideRetryTokenLimit(primaryLimit) {
  const limit = Math.max(1, Math.ceil(Number(primaryLimit) || 3200));
  return Math.min(6500, Math.max(limit + 1200, Math.ceil(limit * 1.5)));
}

export function isAiInputTooLong(error) {
  const code = String(error?.code || "").toUpperCase();
  const kind = String(error?.kind || "").toLowerCase();
  const status = Number(error?.status);
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "AI_CONTENT_TOO_LONG" ||
    kind === "content" ||
    status === 413 ||
    /context length|context_length|maximum context|input.{0,12}too long|too many tokens|上下文太长/.test(
      message
    )
  );
}

function getGuideRecoveryReason(result, parsed, hasGuideContent) {
  if (isAiOutputTruncated(result)) return "output_truncated";
  if (!hasGuideContent(parsed)) return "response_format";
  return "";
}

function buildGuideRecoveryPrompts(prompts, reason, compactOutputInstruction) {
  const reasonText =
    reason === "output_truncated"
      ? "上一次回答在输出上限处被截断。"
      : "上一次回答没有形成可用的导读 JSON。";
  return {
    system: `${prompts.system}\n\n${reasonText} 这次不要输出分析过程，直接从 { 开始返回最终 JSON。请压缩措辞而不是省略字段，不增加额外小节；${
      compactOutputInstruction ||
      "overview 控制在 240-320 字，goals 和 questions 各 3 条且每条不超过 26 字。"
    }完整合法、具体易懂的 JSON 比展开细节更重要。`,
    user: prompts.user,
  };
}
