import { estimateSettingsCost } from "./pricing.js";
import { getItem, KEYS, setItem } from "./storage.js";
import { toText } from "./text.js";

export const AI_DIAGNOSTICS_MAX_ENTRIES = 20;

const TASK_LABELS = {
  wholeBookGuide: "整本书导读",
  readingGuide: "章节导读",
  readingChat: "伴读问答",
  bookCompanionChat: "本书读伴聊天",
  readingReflection: "读后追问",
  readingTextFormat: "正文整理",
  default: "AI 请求",
};

export async function getAiDiagnostics() {
  return normalizeAiDiagnostics(await getItem(KEYS.aiDiagnostics, null));
}

export async function clearAiDiagnostics() {
  const next = createEmptyDiagnostics();
  await setItem(KEYS.aiDiagnostics, next);
  return next;
}

export async function recordAiDiagnostic(input) {
  const saved = await getAiDiagnostics();
  const entry = buildAiDiagnosticEntry(input);
  const next = {
    version: 1,
    updatedAt: entry.endedAt,
    entries: [entry, ...saved.entries].slice(0, AI_DIAGNOSTICS_MAX_ENTRIES),
  };
  await setItem(KEYS.aiDiagnostics, next);
  return next;
}

export function buildAiDiagnosticEntry({
  mode = "call",
  taskType = "default",
  startedAt,
  endedAt,
  settings,
  profile,
  budgetCheck,
  result,
  error,
}) {
  const start = normalizeIsoDate(startedAt) || new Date().toISOString();
  const end = normalizeIsoDate(endedAt) || new Date().toISOString();
  const estimate = budgetCheck?.estimate || error?.budget || null;
  const usage = normalizeUsage(result?.usage);
  const inputTokens = usage.inputTokens || Number(estimate?.inputTokens) || 0;
  const outputTokens = usage.outputTokens || Number(estimate?.maxOutputTokens) || 0;
  const usageForCost = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
  const actualCost = inputTokens || outputTokens ? estimateSettingsCost(settings, usageForCost) : null;
  const estimatedCost = estimate?.cost || null;

  return {
    id: makeDiagnosticId(),
    mode: mode === "stream" ? "stream" : "call",
    status: getDiagnosticStatus(error),
    taskType,
    taskLabel: TASK_LABELS[taskType] || TASK_LABELS.default,
    provider: settings?.provider || "",
    model: resolveModelName(settings),
    baseUrlOrigin: resolveBaseUrlOrigin(settings),
    profileApplied: Boolean(profile),
    maxTokens: Number(profile?.maxTokens ?? estimate?.maxOutputTokens) || 0,
    temperature: typeof profile?.temperature === "number" ? profile.temperature : null,
    inputTokens,
    outputTokens,
    estimatedCost: roundCost(Number(estimatedCost?.totalCost) || 0),
    actualCost: roundCost(Number(actualCost?.totalCost) || 0),
    attempts: error ? null : Number(result?.attempts) || 1,
    finishReason: sanitizeDiagnosticText(result?.finishReason || ""),
    truncated: Boolean(result?.truncated),
    errorCode: sanitizeDiagnosticText(error?.code || ""),
    errorKind: sanitizeDiagnosticText(error?.kind || ""),
    retryable: Boolean(error?.retryable),
    httpStatus: Number(error?.status) || null,
    errorMessage: error ? sanitizeDiagnosticText(error.message || "") : "",
    startedAt: start,
    endedAt: end,
    durationMs: Math.max(0, new Date(end).getTime() - new Date(start).getTime()) || 0,
  };
}

export function normalizeAiDiagnostics(value) {
  if (!value || typeof value !== "object") return createEmptyDiagnostics();
  const entries = Array.isArray(value.entries) ? value.entries : [];
  return {
    version: 1,
    updatedAt: normalizeIsoDate(value.updatedAt) || "",
    entries: entries
      .map(normalizeDiagnosticEntry)
      .filter(Boolean)
      .slice(0, AI_DIAGNOSTICS_MAX_ENTRIES),
  };
}

export function sanitizeDiagnosticText(value, maxLength = 180) {
  const text = toText(value)
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***")
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g, "***")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function normalizeDiagnosticEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id: sanitizeDiagnosticText(entry.id, 80) || makeDiagnosticId(),
    mode: entry.mode === "stream" ? "stream" : "call",
    status: ["success", "error", "cancelled", "blocked"].includes(entry.status)
      ? entry.status
      : "error",
    taskType: sanitizeDiagnosticText(entry.taskType, 80) || "default",
    taskLabel: sanitizeDiagnosticText(entry.taskLabel, 80) || TASK_LABELS.default,
    provider: sanitizeDiagnosticText(entry.provider, 80),
    model: sanitizeDiagnosticText(entry.model, 120),
    baseUrlOrigin: sanitizeDiagnosticText(entry.baseUrlOrigin, 180),
    profileApplied: Boolean(entry.profileApplied),
    maxTokens: Number(entry.maxTokens) || 0,
    temperature: readNullableNumber(entry.temperature),
    inputTokens: Number(entry.inputTokens) || 0,
    outputTokens: Number(entry.outputTokens) || 0,
    estimatedCost: roundCost(Number(entry.estimatedCost) || 0),
    actualCost: roundCost(Number(entry.actualCost) || 0),
    attempts: Number(entry.attempts) || null,
    finishReason: sanitizeDiagnosticText(entry.finishReason, 80),
    truncated: Boolean(entry.truncated),
    errorCode: sanitizeDiagnosticText(entry.errorCode, 80),
    errorKind: sanitizeDiagnosticText(entry.errorKind, 80),
    retryable: Boolean(entry.retryable),
    httpStatus: Number(entry.httpStatus) || null,
    errorMessage: sanitizeDiagnosticText(entry.errorMessage),
    startedAt: normalizeIsoDate(entry.startedAt) || "",
    endedAt: normalizeIsoDate(entry.endedAt) || "",
    durationMs: Number(entry.durationMs) || 0,
  };
}

function createEmptyDiagnostics() {
  return {
    version: 1,
    updatedAt: "",
    entries: [],
  };
}

function getDiagnosticStatus(error) {
  if (!error) return "success";
  if (error?.kind === "budget" || toText(error?.code).startsWith("AI_BUDGET_")) return "blocked";
  if (error?.name === "AbortError" || error?.code === "AI_REQUEST_CANCELLED") return "cancelled";
  return "error";
}

function normalizeUsage(usage) {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: Number(usage.input_tokens ?? usage.prompt_tokens) || 0,
    outputTokens: Number(usage.output_tokens ?? usage.completion_tokens) || 0,
  };
}

function resolveModelName(settings) {
  if (settings?.provider === "openai-compatible") {
    return sanitizeDiagnosticText(settings.openaiCompatible?.model || "", 120);
  }
  return sanitizeDiagnosticText(settings?.anthropic?.model || "", 120);
}

function resolveBaseUrlOrigin(settings) {
  if (settings?.provider !== "openai-compatible") return "";
  const baseUrl = settings.openaiCompatible?.baseUrl || "";
  try {
    return new URL(baseUrl).origin;
  } catch {
    return sanitizeDiagnosticText(baseUrl, 180);
  }
}

function normalizeIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function makeDiagnosticId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `diag-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function roundCost(value) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(8));
}

function readNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
