import { toText } from "./text.js";

export const AI_OUTPUT_TRUNCATED_CODE = "AI_OUTPUT_TRUNCATED";

const TRUNCATED_FINISH_REASONS = new Set([
  "length",
  "max_tokens",
  "max_output_tokens",
  "output_token_limit",
]);

export function normalizeAiFinishReason(value) {
  return toText(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isAiOutputTruncated(resultOrReason) {
  if (resultOrReason?.truncated === true) return true;
  const finishReason =
    typeof resultOrReason === "string" ? resultOrReason : resultOrReason?.finishReason;
  return TRUNCATED_FINISH_REASONS.has(normalizeAiFinishReason(finishReason));
}

export function createAiOutputTruncatedError(
  message = "这次生成被模型输出上限截断了，请减少内容范围后重试。",
  result = null
) {
  const error = new Error(message);
  error.code = AI_OUTPUT_TRUNCATED_CODE;
  error.kind = "output_truncated";
  error.retryable = false;
  error.truncated = true;
  error.finishReason = result?.finishReason || "";
  return error;
}
