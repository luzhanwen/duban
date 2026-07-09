import { toText } from "./text.js";

export const DEFAULT_AI_BUDGET = {
  enabled: true,
  maxInputTokensPerRequest: "120000",
  maxOutputTokensPerRequest: "12000",
  maxEstimatedCostPerRequest: "",
  maxEstimatedCostPerDay: "",
};

export function normalizeAiBudgetSettings(value = {}) {
  return {
    enabled: value.enabled === undefined ? true : normalizeBoolean(value.enabled),
    maxInputTokensPerRequest: normalizeLimitValue(
      value.maxInputTokensPerRequest,
      DEFAULT_AI_BUDGET.maxInputTokensPerRequest
    ),
    maxOutputTokensPerRequest: normalizeLimitValue(
      value.maxOutputTokensPerRequest,
      DEFAULT_AI_BUDGET.maxOutputTokensPerRequest
    ),
    maxEstimatedCostPerRequest: normalizeLimitValue(value.maxEstimatedCostPerRequest, ""),
    maxEstimatedCostPerDay: normalizeLimitValue(value.maxEstimatedCostPerDay, ""),
  };
}

export function readAiBudgetLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeLimitValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const text = toText(value).trim();
  if (!text) return "";

  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return text;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = toText(value).trim().toLowerCase();
  if (["false", "0", "off", "no", "否", "关闭"].includes(text)) return false;
  if (["true", "1", "on", "yes", "是", "开启"].includes(text)) return true;
  return Boolean(value);
}
