import { toText } from "./text.js";

export const AI_PROFILE_TASKS = [
  {
    id: "wholeBookGuide",
    label: "整本书导读",
    defaultMaxTokens: "6500",
    defaultTemperature: "0.4",
  },
  {
    id: "readingGuide",
    label: "章节导读",
    defaultMaxTokens: "1800",
    defaultTemperature: "0.45",
  },
  {
    id: "readingChat",
    label: "伴读问答",
    defaultMaxTokens: "2600",
    defaultTemperature: "0.55",
  },
  {
    id: "bookCompanionChat",
    label: "本书读伴聊天",
    defaultMaxTokens: "2600",
    defaultTemperature: "0.55",
  },
  {
    id: "readingReflection",
    label: "读后追问",
    defaultMaxTokens: "900",
    defaultTemperature: "0.55",
  },
  {
    id: "readingTextFormat",
    label: "正文整理",
    defaultMaxTokens: "4200",
    defaultTemperature: "0.2",
  },
];

export const DEFAULT_AI_PROFILES = {
  enabled: true,
  tasks: Object.fromEntries(
    AI_PROFILE_TASKS.map((task) => [
      task.id,
      {
        enabled: false,
        provider: "",
        anthropicModel: "",
        openaiBaseUrl: "",
        openaiModel: "",
        inputPricePerMTok: "",
        outputPricePerMTok: "",
        maxTokens: "",
        temperature: "",
      },
    ])
  ),
};

export function normalizeAiProfiles(value = {}) {
  const tasks = value.tasks || {};
  return {
    enabled: value.enabled === undefined ? true : normalizeBoolean(value.enabled),
    tasks: Object.fromEntries(
      AI_PROFILE_TASKS.map((task) => [
        task.id,
        normalizeTaskProfile(tasks[task.id], DEFAULT_AI_PROFILES.tasks[task.id]),
      ])
    ),
  };
}

export function resolveAiProfileRequest({ settings, taskType, maxTokens }) {
  const profiles = normalizeAiProfiles(settings?.aiProfiles);
  const profile = profiles.tasks?.[taskType];
  if (!profiles.enabled || !profile?.enabled) {
    return {
      settings,
      maxTokens,
      temperature: null,
      resultSettings: sanitizeAiSettings(settings),
      profile: null,
    };
  }

  const profileProvider = normalizeProvider(profile.provider);
  const provider = profileProvider || settings.provider;
  const nextSettings = {
    ...settings,
    provider,
    anthropic: { ...(settings.anthropic || {}) },
    openaiCompatible: { ...(settings.openaiCompatible || {}) },
  };

  if (profileProvider === "openai-compatible") {
    if (profile.openaiBaseUrl) nextSettings.openaiCompatible.baseUrl = profile.openaiBaseUrl;
    if (profile.openaiModel) nextSettings.openaiCompatible.model = profile.openaiModel;
    if (profile.inputPricePerMTok) {
      nextSettings.openaiCompatible.inputPricePerMTok = profile.inputPricePerMTok;
    }
    if (profile.outputPricePerMTok) {
      nextSettings.openaiCompatible.outputPricePerMTok = profile.outputPricePerMTok;
    }
  } else if (profileProvider === "anthropic" && profile.anthropicModel) {
    nextSettings.anthropic.model = profile.anthropicModel;
  }

  return {
    settings: nextSettings,
    maxTokens: readPositiveNumber(profile.maxTokens) || maxTokens,
    temperature: readTemperature(profile.temperature),
    resultSettings: sanitizeAiSettings(nextSettings),
    profile: {
      taskType,
      provider,
      maxTokens: readPositiveNumber(profile.maxTokens) || maxTokens,
      temperature: readTemperature(profile.temperature),
    },
  };
}

export function sanitizeAiSettings(settings = {}) {
  return {
    provider: settings.provider || "anthropic",
    anthropic: {
      model: settings.anthropic?.model || "",
      hasApiKey: Boolean(settings.anthropic?.hasApiKey),
    },
    openaiCompatible: {
      hasApiKey: Boolean(settings.openaiCompatible?.hasApiKey),
      baseUrl: settings.openaiCompatible?.baseUrl || "",
      model: settings.openaiCompatible?.model || "",
      inputPricePerMTok: settings.openaiCompatible?.inputPricePerMTok || "",
      outputPricePerMTok: settings.openaiCompatible?.outputPricePerMTok || "",
    },
  };
}

export function readPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function readTemperature(value) {
  if (value === "" || value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(2, Math.max(0, number));
}

function normalizeTaskProfile(value = {}, fallback) {
  return {
    enabled: value.enabled === undefined ? fallback.enabled : normalizeBoolean(value.enabled),
    provider: normalizeProvider(value.provider),
    anthropicModel: toText(value.anthropicModel).trim(),
    openaiBaseUrl: toText(value.openaiBaseUrl).trim(),
    openaiModel: toText(value.openaiModel).trim(),
    inputPricePerMTok: normalizeNumberText(value.inputPricePerMTok),
    outputPricePerMTok: normalizeNumberText(value.outputPricePerMTok),
    maxTokens: normalizeNumberText(value.maxTokens),
    temperature: normalizeTemperatureText(value.temperature),
  };
}

function normalizeProvider(value) {
  const text = toText(value).trim();
  if (text === "anthropic" || text === "openai-compatible") return text;
  return "";
}

function normalizeNumberText(value) {
  const text = toText(value).trim();
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? text : "";
}

function normalizeTemperatureText(value) {
  const text = toText(value).trim();
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 2 ? text : "";
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = toText(value).trim().toLowerCase();
  if (["false", "0", "off", "no", "否", "关闭"].includes(text)) return false;
  if (["true", "1", "on", "yes", "是", "开启"].includes(text)) return true;
  return Boolean(value);
}
