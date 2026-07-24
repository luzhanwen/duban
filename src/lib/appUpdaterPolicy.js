export function normalizeUpdaterError(
  error,
  fallbackMessage,
  { networkHint = false } = {}
) {
  const detail = String(error?.message || error || "").trim();
  const readableDetail = networkHint
    ? "无法连接更新服务，请检查网络后重试"
    : detail;
  const message = readableDetail
    ? `${fallbackMessage}：${readableDetail}`
    : fallbackMessage;
  const normalized = new Error(message);
  normalized.cause = error;
  return normalized;
}

export function isRetryableUpdaterError(error) {
  const detail = String(error?.message || error || "").toLowerCase();
  return [
    "error sending request",
    "timed out",
    "timeout",
    "connection",
    "connect error",
    "dns",
  ].some((token) => detail.includes(token));
}
