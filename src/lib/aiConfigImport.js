import { AI_PROFILE_TASKS } from "./aiProfiles.js";
import { normalizeSettings, PROVIDERS } from "./storage.js";
import { toText } from "./text.js";

const SECTION_ALIASES = new Map([
  ["anthropic", "anthropic"],
  ["claude", "anthropic"],
  ["openai", "openai"],
  ["gpt", "openai"],
  ["openaicompatible", "openaiCompatible"],
  ["openai兼容", "openaiCompatible"],
  ["deepseek", "deepseek"],
  ["kimi", "kimi"],
  ["moonshot", "kimi"],
  ["settings", ""],
  ["general", ""],
  ["global", ""],
  ["budget", "aiBudget"],
  ["aibudget", "aiBudget"],
  ["预算", "aiBudget"],
  ["profiles", "aiProfiles"],
  ["aiprofiles", "aiProfiles"],
  ["profile", "aiProfiles"],
]);

const OPENAI_VENDOR_ORDER = ["openai", "deepseek", "kimi"];

const OPENAI_VENDOR_PRESETS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4-mini",
    inputPricePerMTok: "0.75",
    outputPricePerMTok: "4.5",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    inputPricePerMTok: "0.14",
    outputPricePerMTok: "0.28",
  },
  kimi: {
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.6",
    inputPricePerMTok: "",
    outputPricePerMTok: "",
  },
};

const GLOBAL_KEY_ALIASES = new Map([
  ["provider", "provider"],
  ["defaultprovider", "provider"],
  ["currentprovider", "provider"],
  ["anthropicapikey", "anthropic.apiKey"],
  ["anthropickey", "anthropic.apiKey"],
  ["anthropicmodel", "anthropic.model"],
  ["claudeapikey", "anthropic.apiKey"],
  ["claudekey", "anthropic.apiKey"],
  ["claudemodel", "anthropic.model"],
  ["openaicompatibleapikey", "openaiCompatible.apiKey"],
  ["openaicompatiblekey", "openaiCompatible.apiKey"],
  ["openaicompatiblebaseurl", "openaiCompatible.baseUrl"],
  ["openaicompatiblemodel", "openaiCompatible.model"],
  ["openaicompatibleinputpricepermtok", "openaiCompatible.inputPricePerMTok"],
  ["openaicompatibleoutputpricepermtok", "openaiCompatible.outputPricePerMTok"],
  ["openaiapikey", "openaiCompatible.apiKey"],
  ["openaikey", "openaiCompatible.apiKey"],
  ["openaibaseurl", "openaiCompatible.baseUrl"],
  ["openaimodel", "openaiCompatible.model"],
  ["inputpricepermtok", "openaiCompatible.inputPricePerMTok"],
  ["outputpricepermtok", "openaiCompatible.outputPricePerMTok"],
  ["aibudgetenabled", "aiBudget.enabled"],
  ["budgetenabled", "aiBudget.enabled"],
  ["maxinputtokensperrequest", "aiBudget.maxInputTokensPerRequest"],
  ["maxoutputtokensperrequest", "aiBudget.maxOutputTokensPerRequest"],
  ["maxestimatedcostperrequest", "aiBudget.maxEstimatedCostPerRequest"],
  ["maxestimatedcostperday", "aiBudget.maxEstimatedCostPerDay"],
  ["aiprofilesenabled", "aiProfiles.enabled"],
  ["profilesenabled", "aiProfiles.enabled"],
]);

const SECTION_KEY_ALIASES = {
  anthropic: new Map([
    ["apikey", "anthropic.apiKey"],
    ["key", "anthropic.apiKey"],
    ["model", "anthropic.model"],
  ]),
  openaiCompatible: new Map([
    ["apikey", "openaiCompatible.apiKey"],
    ["key", "openaiCompatible.apiKey"],
    ["baseurl", "openaiCompatible.baseUrl"],
    ["url", "openaiCompatible.baseUrl"],
    ["model", "openaiCompatible.model"],
    ["inputpricepermtok", "openaiCompatible.inputPricePerMTok"],
    ["inputprice", "openaiCompatible.inputPricePerMTok"],
    ["outputpricepermtok", "openaiCompatible.outputPricePerMTok"],
    ["outputprice", "openaiCompatible.outputPricePerMTok"],
  ]),
  aiBudget: new Map([
    ["enabled", "aiBudget.enabled"],
    ["on", "aiBudget.enabled"],
    ["maxinputtokensperrequest", "aiBudget.maxInputTokensPerRequest"],
    ["inputtokens", "aiBudget.maxInputTokensPerRequest"],
    ["maxinputtokens", "aiBudget.maxInputTokensPerRequest"],
    ["maxoutputtokensperrequest", "aiBudget.maxOutputTokensPerRequest"],
    ["outputtokens", "aiBudget.maxOutputTokensPerRequest"],
    ["maxoutputtokens", "aiBudget.maxOutputTokensPerRequest"],
    ["maxestimatedcostperrequest", "aiBudget.maxEstimatedCostPerRequest"],
    ["requestcost", "aiBudget.maxEstimatedCostPerRequest"],
    ["maxrequestcost", "aiBudget.maxEstimatedCostPerRequest"],
    ["maxestimatedcostperday", "aiBudget.maxEstimatedCostPerDay"],
    ["daycost", "aiBudget.maxEstimatedCostPerDay"],
    ["dailycost", "aiBudget.maxEstimatedCostPerDay"],
    ["maxdailycost", "aiBudget.maxEstimatedCostPerDay"],
  ]),
};

const PROFILE_FIELD_ALIASES = new Map([
  ["enabled", "enabled"],
  ["on", "enabled"],
  ["provider", "provider"],
  ["anthropicmodel", "anthropicModel"],
  ["claudemodel", "anthropicModel"],
  ["openaibaseurl", "openaiBaseUrl"],
  ["baseurl", "openaiBaseUrl"],
  ["url", "openaiBaseUrl"],
  ["openaimodel", "openaiModel"],
  ["model", "openaiModel"],
  ["inputpricepermtok", "inputPricePerMTok"],
  ["inputprice", "inputPricePerMTok"],
  ["outputpricepermtok", "outputPricePerMTok"],
  ["outputprice", "outputPricePerMTok"],
  ["maxtokens", "maxTokens"],
  ["maxoutputtokens", "maxTokens"],
  ["temperature", "temperature"],
  ["temp", "temperature"],
]);

const OPENAI_VENDOR_KEY_ALIASES = new Map([
  ["apikey", "apiKey"],
  ["key", "apiKey"],
  ["baseurl", "baseUrl"],
  ["url", "baseUrl"],
  ["model", "model"],
  ["inputpricepermtok", "inputPricePerMTok"],
  ["inputprice", "inputPricePerMTok"],
  ["outputpricepermtok", "outputPricePerMTok"],
  ["outputprice", "outputPricePerMTok"],
]);

export function parseAiConfigText(rawText) {
  const text = toText(rawText);
  if (!text.trim()) throw new Error("配置文档是空的，请使用 TXT 模板填写后再导入。");

  const settings = {
    anthropic: {},
    openaiCompatible: {},
    aiBudget: {},
    aiProfiles: {
      tasks: {},
    },
  };
  const appliedKeys = [];
  const vendorKeys = [];
  const vendorConfigs = {};
  const warnings = [];
  let section = "";
  let providerChoice = null;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) return;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = normalizeSection(sectionMatch[1]);
      if (section === null) {
        warnings.push(`第 ${lineNumber} 行的分组暂未支持，已跳过：${sectionMatch[1]}`);
        section = "";
      }
      return;
    }

    const entry = parseEntry(line);
    if (!entry) {
      warnings.push(`第 ${lineNumber} 行请使用 key = value 格式，已跳过。`);
      return;
    }

    const canonicalKey = canonicalizeKey(entry.key, section);
    if (!canonicalKey) {
      warnings.push(`第 ${lineNumber} 行的配置项暂未支持，已跳过：${entry.key}`);
      return;
    }

    const value = stripOuterQuotes(entry.value).trim();
    if (!value) {
      return;
    }

    if (canonicalKey === "provider") {
      providerChoice = normalizeProviderChoice(value);
      settings.provider = providerChoice.provider;
      appliedKeys.push(canonicalKey);
      return;
    }

    if (isOpenAIVendorKey(canonicalKey)) {
      const [vendor, key] = canonicalKey.split(".");
      vendorConfigs[vendor] = {
        ...(vendorConfigs[vendor] || {}),
        [key]: value,
      };
      vendorKeys.push(canonicalKey);
      return;
    }

    applyConfigValue(settings, canonicalKey, value);
    appliedKeys.push(canonicalKey);
  });

  const finalizedVendorKeys = applySelectedVendorConfig({
    settings,
    vendorConfigs,
    providerChoice,
    warnings,
  });
  const finalAppliedKeys = [...appliedKeys, ...finalizedVendorKeys];

  if (finalAppliedKeys.length === 0 && vendorKeys.length === 0) {
    throw new Error("请确认 TXT 中使用 key = value 格式，并至少填写一项可用配置。");
  }

  if (finalAppliedKeys.length === 0) {
    throw new Error("请至少填写一个供应商的 API Key，再导入配置。");
  }

  return {
    settings,
    appliedKeys: [...new Set(finalAppliedKeys)],
    warnings,
  };
}

export function buildAiConfigText(settings) {
  const normalized = normalizeSettings(settings);
  const openaiSection = inferOpenAIVendorSection(normalized.openaiCompatible);

  return [
    "# 读伴 AI 当前配置导出",
    "# 注意：此文件包含 API Key，请妥善保管，避免提交到代码仓库或发给他人。",
    "# 这个文件可以在「设置 -> AI 批量配置」里重新导入。",
    "",
    `provider = ${formatProvider(normalized.provider, openaiSection)}`,
    "",
    "[anthropic]",
    `apiKey = ${normalized.anthropic.apiKey}`,
    `model = ${normalized.anthropic.model}`,
    "",
    `[${openaiSection}]`,
    `apiKey = ${normalized.openaiCompatible.apiKey}`,
    `baseUrl = ${normalized.openaiCompatible.baseUrl}`,
    `model = ${normalized.openaiCompatible.model}`,
    `inputPricePerMTok = ${normalized.openaiCompatible.inputPricePerMTok}`,
    `outputPricePerMTok = ${normalized.openaiCompatible.outputPricePerMTok}`,
    "",
    "[budget]",
    `enabled = ${normalized.aiBudget.enabled}`,
    `maxInputTokensPerRequest = ${normalized.aiBudget.maxInputTokensPerRequest}`,
    `maxOutputTokensPerRequest = ${normalized.aiBudget.maxOutputTokensPerRequest}`,
    `maxEstimatedCostPerRequest = ${normalized.aiBudget.maxEstimatedCostPerRequest}`,
    `maxEstimatedCostPerDay = ${normalized.aiBudget.maxEstimatedCostPerDay}`,
    "",
    "[profiles]",
    `enabled = ${normalized.aiProfiles.enabled}`,
    ...AI_PROFILE_TASKS.flatMap((task) => {
      const profile = normalized.aiProfiles.tasks[task.id] || {};
      return [
        `${task.id}.enabled = ${profile.enabled}`,
        `${task.id}.provider = ${profile.provider}`,
        `${task.id}.anthropicModel = ${profile.anthropicModel}`,
        `${task.id}.openaiBaseUrl = ${profile.openaiBaseUrl}`,
        `${task.id}.openaiModel = ${profile.openaiModel}`,
        `${task.id}.inputPricePerMTok = ${profile.inputPricePerMTok}`,
        `${task.id}.outputPricePerMTok = ${profile.outputPricePerMTok}`,
        `${task.id}.maxTokens = ${profile.maxTokens}`,
        `${task.id}.temperature = ${profile.temperature}`,
      ];
    }),
    "",
  ].join("\n");
}

function parseEntry(line) {
  const separatorIndex = findSeparatorIndex(line);
  if (separatorIndex < 0) return null;

  return {
    key: line.slice(0, separatorIndex).trim(),
    value: line.slice(separatorIndex + 1).trim(),
  };
}

function findSeparatorIndex(line) {
  const equalsIndex = line.indexOf("=");
  const colonIndex = line.indexOf(":");
  if (equalsIndex < 0) return colonIndex;
  if (colonIndex < 0) return equalsIndex;
  return Math.min(equalsIndex, colonIndex);
}

function canonicalizeKey(rawKey, section) {
  if (section === "aiProfiles") {
    return canonicalizeProfileKey(rawKey);
  }

  const normalizedKey = normalizeToken(rawKey);
  if (OPENAI_VENDOR_PRESETS[section]) {
    const vendorKey = OPENAI_VENDOR_KEY_ALIASES.get(normalizedKey);
    return vendorKey ? `${section}.${vendorKey}` : "";
  }

  const scopedAliases = section ? SECTION_KEY_ALIASES[section] : null;
  if (scopedAliases?.has(normalizedKey)) return scopedAliases.get(normalizedKey);
  return GLOBAL_KEY_ALIASES.get(normalizedKey) || "";
}

function normalizeSection(rawSection) {
  const normalized = normalizeToken(rawSection);
  return SECTION_ALIASES.has(normalized) ? SECTION_ALIASES.get(normalized) : null;
}

function normalizeToken(value) {
  return toText(value)
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

function stripOuterQuotes(value) {
  const text = toText(value);
  if (
    (text.startsWith("\"") && text.endsWith("\"")) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function applyConfigValue(settings, canonicalKey, value) {
  if (canonicalKey.startsWith("anthropic.")) {
    settings.anthropic[canonicalKey.slice("anthropic.".length)] = value;
    return;
  }

  if (canonicalKey.startsWith("openaiCompatible.")) {
    settings.openaiCompatible[canonicalKey.slice("openaiCompatible.".length)] = value;
    return;
  }

  if (canonicalKey.startsWith("aiBudget.")) {
    settings.aiBudget[canonicalKey.slice("aiBudget.".length)] = value;
    return;
  }

  if (canonicalKey === "aiProfiles.enabled") {
    settings.aiProfiles.enabled = value;
    return;
  }

  if (canonicalKey.startsWith("aiProfiles.tasks.")) {
    const [, , taskId, field] = canonicalKey.split(".");
    settings.aiProfiles.tasks[taskId] = {
      ...(settings.aiProfiles.tasks[taskId] || {}),
      [field]: value,
    };
  }
}

function canonicalizeProfileKey(rawKey) {
  const text = toText(rawKey).trim();
  if (normalizeToken(text) === "enabled") return "aiProfiles.enabled";

  const separatorIndex = text.indexOf(".");
  if (separatorIndex < 0) return "";

  const taskKey = normalizeToken(text.slice(0, separatorIndex));
  const fieldKey = normalizeToken(text.slice(separatorIndex + 1));
  const task = AI_PROFILE_TASKS.find((candidate) => normalizeToken(candidate.id) === taskKey);
  const field = PROFILE_FIELD_ALIASES.get(fieldKey);
  return task && field ? `aiProfiles.tasks.${task.id}.${field}` : "";
}

function applySelectedVendorConfig({ settings, vendorConfigs, providerChoice, warnings }) {
  if (providerChoice?.provider === PROVIDERS.anthropic) return [];

  const explicitVendor = providerChoice?.vendor || "";
  const autoVendor = explicitVendor || findAutoSelectedVendor(vendorConfigs, warnings);
  if (!autoVendor) return [];

  settings.provider = PROVIDERS.openaiCompatible;
  settings.openaiCompatible = {
    ...settings.openaiCompatible,
    ...OPENAI_VENDOR_PRESETS[autoVendor],
    ...(vendorConfigs[autoVendor] || {}),
  };

  return [
    providerChoice ? "" : "provider",
    ...Object.keys(settings.openaiCompatible).map((key) => `openaiCompatible.${key}`),
  ].filter(Boolean);
}

function findAutoSelectedVendor(vendorConfigs, warnings) {
  const vendorsWithKey = OPENAI_VENDOR_ORDER.filter((vendor) => vendorConfigs[vendor]?.apiKey);
  if (vendorsWithKey.length > 1) {
    warnings.push(
      `检测到多个 OpenAI-compatible 供应商填写了 API Key，已使用 ${vendorsWithKey[0]}。如需切换，请填写 provider。`
    );
  }
  return vendorsWithKey[0] || "";
}

function isOpenAIVendorKey(canonicalKey) {
  const [vendor] = canonicalKey.split(".");
  return Boolean(OPENAI_VENDOR_PRESETS[vendor]);
}

function normalizeProviderChoice(value) {
  const normalized = normalizeToken(value);
  if (["anthropic", "claude"].includes(normalized)) {
    return { provider: PROVIDERS.anthropic, vendor: "" };
  }
  if (["openaicompatible"].includes(normalized)) {
    return { provider: PROVIDERS.openaiCompatible, vendor: "" };
  }
  if (["openai", "gpt"].includes(normalized)) {
    return { provider: PROVIDERS.openaiCompatible, vendor: "openai" };
  }
  if (normalized === "deepseek") {
    return { provider: PROVIDERS.openaiCompatible, vendor: "deepseek" };
  }
  if (["kimi", "moonshot"].includes(normalized)) {
    return { provider: PROVIDERS.openaiCompatible, vendor: "kimi" };
  }
  throw new Error("provider 只能填写 anthropic、openai、deepseek、kimi 或 openai-compatible。");
}

function inferOpenAIVendorSection(config = {}) {
  const baseUrl = normalizeToken(config.baseUrl);
  if (baseUrl.includes("deepseekcom")) return "deepseek";
  if (baseUrl.includes("moonshotcn") || baseUrl.includes("kimicom")) return "kimi";
  if (baseUrl.includes("openaicom")) return "openai";
  return "openai-compatible";
}

function formatProvider(provider, openaiSection) {
  if (provider === PROVIDERS.anthropic) return "anthropic";
  return openaiSection === "openai-compatible" ? "openai-compatible" : openaiSection;
}
