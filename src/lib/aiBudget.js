import { estimateSettingsCost, formatUsd } from "./pricing.js";
import { getItem, KEYS, setItem } from "./storage.js";
import { toText } from "./text.js";
import { normalizeAiBudgetSettings, readAiBudgetLimit } from "./aiBudgetSettings.js";

export const AI_BUDGET_USAGE_KEY_PREFIX = "__duban:ai-budget:";

const AI_BUDGET_TASK_LABELS = {
  wholeBookGuide: "整本书导读",
  readingGuide: "章节导读",
  readingChat: "伴读问答",
  bookCompanionChat: "本书读伴聊天",
  readingReflection: "读后追问",
  readingTextFormat: "正文整理",
  default: "AI 请求",
};

export async function enforceAiBudgetBeforeRequest({
  settings,
  system = "",
  messages = [],
  maxTokens = 0,
  taskType = "default",
}) {
  const budget = normalizeAiBudgetSettings(settings?.aiBudget);
  const estimate = buildAiBudgetEstimate({ settings, system, messages, maxTokens, taskType });

  if (!budget.enabled) {
    return { budget, estimate, enabled: false };
  }

  const inputLimit = readAiBudgetLimit(budget.maxInputTokensPerRequest);
  if (inputLimit && estimate.inputTokens > inputLimit) {
    throw createAiBudgetError({
      code: "AI_BUDGET_INPUT_LIMIT",
      message: `${estimate.taskLabel}预计需要约 ${estimate.inputTokens} 个输入 token，超过当前单次输入上限 ${inputLimit}。请缩小阅读范围，或在设置里调高预算。`,
      estimate,
    });
  }

  const outputLimit = readAiBudgetLimit(budget.maxOutputTokensPerRequest);
  if (outputLimit && estimate.maxOutputTokens > outputLimit) {
    throw createAiBudgetError({
      code: "AI_BUDGET_OUTPUT_LIMIT",
      message: `${estimate.taskLabel}最多会生成 ${estimate.maxOutputTokens} 个输出 token，超过当前单次输出上限 ${outputLimit}。请在设置里调高预算后再试。`,
      estimate,
    });
  }

  const requestCostLimit = readAiBudgetLimit(budget.maxEstimatedCostPerRequest);
  const dayCostLimit = readAiBudgetLimit(budget.maxEstimatedCostPerDay);
  if (requestCostLimit || dayCostLimit) {
    if (!estimate.cost) {
      throw createAiBudgetError({
        code: "AI_BUDGET_PRICE_MISSING",
        message:
          "当前模型缺少可用的价格信息，无法执行费用预算。请在设置里补充输入/输出价格，或先清空费用上限。",
        estimate,
      });
    }

    if (requestCostLimit && estimate.cost.totalCost > requestCostLimit) {
      throw createAiBudgetError({
        code: "AI_BUDGET_REQUEST_COST_LIMIT",
        message: `${estimate.taskLabel}本次预计最高花费 ${formatUsd(estimate.cost.totalCost)}，超过单次费用上限 ${formatUsd(requestCostLimit)}。请缩小范围或调高预算。`,
        estimate,
      });
    }

    if (dayCostLimit) {
      const usage = await getAiBudgetUsage();
      const used = Number(usage.totalEstimatedCost) || 0;
      if (used + estimate.cost.totalCost > dayCostLimit) {
        throw createAiBudgetError({
          code: "AI_BUDGET_DAILY_COST_LIMIT",
          message: `今日已估算使用 ${formatUsd(used)}，${estimate.taskLabel}预计最高还需 ${formatUsd(estimate.cost.totalCost)}，会超过每日上限 ${formatUsd(dayCostLimit)}。`,
          estimate,
        });
      }
    }
  }

  return { budget, estimate, enabled: true };
}

export async function recordAiBudgetUsage({ settings, result, budgetCheck }) {
  if (!budgetCheck?.enabled) return null;

  const estimate = budgetCheck.estimate;
  const usage = normalizeUsage(result?.usage);
  const inputTokens = usage.input_tokens || estimate.inputTokens;
  const outputTokens = usage.output_tokens || estimate.maxOutputTokens;
  const cost =
    estimateSettingsCost(settings, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    }) || estimate.cost;
  const costValue = Number(cost?.totalCost) || 0;
  const date = getLocalDateKey();
  const saved = await getAiBudgetUsage(date);
  const task = saved.tasks?.[estimate.taskType] || {};

  const nextTask = {
    requestCount: Number(task.requestCount) + 1 || 1,
    inputTokens: (Number(task.inputTokens) || 0) + inputTokens,
    outputTokens: (Number(task.outputTokens) || 0) + outputTokens,
    totalEstimatedCost: roundCost((Number(task.totalEstimatedCost) || 0) + costValue),
  };
  const next = {
    date,
    requestCount: (Number(saved.requestCount) || 0) + 1,
    inputTokens: (Number(saved.inputTokens) || 0) + inputTokens,
    outputTokens: (Number(saved.outputTokens) || 0) + outputTokens,
    totalEstimatedCost: roundCost((Number(saved.totalEstimatedCost) || 0) + costValue),
    updatedAt: new Date().toISOString(),
    tasks: {
      ...(saved.tasks || {}),
      [estimate.taskType]: nextTask,
    },
  };

  await setItem(KEYS.aiBudgetUsage(date), next);
  return next;
}

export function buildAiBudgetEstimate({
  settings,
  system = "",
  messages = [],
  maxTokens = 0,
  taskType = "default",
}) {
  const inputTokens = estimateAiInputTokens({ system, messages });
  const maxOutputTokens = Math.max(0, Math.ceil(Number(maxTokens) || 0));
  const usage = {
    input_tokens: inputTokens,
    output_tokens: maxOutputTokens,
  };

  return {
    taskType,
    taskLabel: AI_BUDGET_TASK_LABELS[taskType] || AI_BUDGET_TASK_LABELS.default,
    inputTokens,
    maxOutputTokens,
    totalTokens: inputTokens + maxOutputTokens,
    cost: estimateSettingsCost(settings, usage),
  };
}

export function estimateAiInputTokens({ system = "", messages = [] } = {}) {
  const parts = [system, ...messages.map((message) => messageContentToText(message?.content))];
  const text = parts.map(toText).filter(Boolean).join("\n\n");
  if (!text.trim()) return 0;

  const cjkCount = Array.from(text.matchAll(/[\u3400-\u9fff\uf900-\ufaff]/g)).length;
  const latinWordCount = (text.match(/[A-Za-z0-9_]+/g) || []).length;
  const nonWhitespaceCount = (text.match(/\S/g) || []).length;
  const otherCount = Math.max(0, nonWhitespaceCount - cjkCount);
  return Math.max(1, Math.ceil(cjkCount * 1.2 + latinWordCount * 1.35 + otherCount / 4));
}

export function isAiBudgetError(error) {
  return error?.kind === "budget" || toText(error?.code).startsWith("AI_BUDGET_");
}

async function getAiBudgetUsage(date = getLocalDateKey()) {
  const saved = await getItem(KEYS.aiBudgetUsage(date), null);
  if (!saved || typeof saved !== "object") {
    return {
      date,
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalEstimatedCost: 0,
      tasks: {},
    };
  }
  return {
    date,
    requestCount: Number(saved.requestCount) || 0,
    inputTokens: Number(saved.inputTokens) || 0,
    outputTokens: Number(saved.outputTokens) || 0,
    totalEstimatedCost: Number(saved.totalEstimatedCost) || 0,
    tasks: saved.tasks && typeof saved.tasks === "object" ? saved.tasks : {},
    updatedAt: saved.updatedAt || "",
  };
}

function normalizeUsage(usage) {
  if (!usage) return {};
  return {
    input_tokens: Number(usage.input_tokens ?? usage.prompt_tokens) || 0,
    output_tokens: Number(usage.output_tokens ?? usage.completion_tokens) || 0,
  };
}

function messageContentToText(content) {
  if (Array.isArray(content)) {
    return content.map(messageContentToText).join("\n");
  }
  if (content && typeof content === "object") {
    return toText(content.text || content.content || "");
  }
  return toText(content);
}

function createAiBudgetError({ code, message, estimate }) {
  const error = new Error(message);
  error.code = code;
  error.kind = "budget";
  error.retryable = false;
  error.budget = estimate;
  return error;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundCost(value) {
  return Number(value.toFixed(8));
}
