// ============================================================
// 数据层：通过 storageAdapter 统一管理本地数据。
// 当前 browser adapter 仍然使用 localforage + IndexedDB；
// 后续桌面版可以在 adapter 层切到 SQLite / 文件系统。
// ============================================================
import { storageAdapter } from "./storageAdapter.js";
import { normalizeAiBudgetSettings } from "./aiBudgetSettings.js";
import { normalizeAiProfiles } from "./aiProfiles.js";

// ------------------------------------------------------------
// key 命名规范（集中管理，避免到处写字符串拼错）
//   - 见需求文档的「数据模型」一节
// ------------------------------------------------------------
export const KEYS = {
  settings: "settings", // 全局设置：{ apiKey, model }
  books: "books", // 书籍数组（每本书的元数据）
  bookFile: (id) => `book:${id}:file`, // 某本书的原始文件 Blob
  bookPages: (id) => `book:${id}:pages`, // 某本书按页/文本页提取后的文本数组
  bookCover: (id) => `book:${id}:cover`, // 某本书的封面缩略图 dataURL
  bookChat: (id) => `book:${id}:chat`, // 某本书的自由问答消息数组
  bookReflection: (id) => `book:${id}:reflection`, // 某本书的读后交流消息，内部按阅读项分组
  bookNotes: (id) => `book:${id}:notes`, // 某本书的高亮和笔记，内部按阅读项分组
  bookQuestions: (id, chapterId) => `book:${id}:questions:${chapterId}`, // 某章导读问题
  bookFormattedText: (id, itemKey) => `book:${id}:formatted-text:${itemKey}`, // 某阅读项的 AI 排版文本
  bookQuiz: (id, chapterId) => `book:${id}:quiz:${chapterId}`, // 某章小测题目与作答
  progress: (id) => `progress:${id}`, // 某本书的每日阅读进度
  aiBudgetUsage: (date) => `__duban:ai-budget:${date}`, // AI 预算日用量，仅保存脱敏统计
  aiDiagnostics: "__duban:ai-diagnostics", // 最近 AI 调用诊断，仅保存脱敏摘要
};

// ------------------------------------------------------------
// 通用读写：带默认值的 get，以及 set / remove
// ------------------------------------------------------------

/** 读取任意 key，不存在时返回 fallback（默认 null） */
export async function getItem(key, fallback = null) {
  const value = await storageAdapter.getItem(key);
  return value === null || value === undefined ? fallback : value;
}

/** 写入任意 key，返回写入后的值 */
export async function setItem(key, value) {
  return storageAdapter.setItem(key, value);
}

/** 删除某个 key */
export async function removeItem(key) {
  return storageAdapter.removeItem(key);
}

// ------------------------------------------------------------
// 设置相关的便捷方法
// ------------------------------------------------------------

export const PROVIDERS = {
  anthropic: "anthropic",
  openaiCompatible: "openai-compatible",
};

// 默认模型：可在设置页修改
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_ANTHROPIC_MODEL = DEFAULT_MODEL;
export const DEFAULT_OPENAI_COMPATIBLE_MODEL = "gpt-5.4-mini";
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.openai.com/v1";

/** 读取设置（apiKey、model），并补上默认值 */
export async function getSettings() {
  const saved = await getItem(KEYS.settings, {});
  return normalizeSettings(saved);
}

/** 保存设置 */
export async function saveSettings(settings) {
  return setItem(KEYS.settings, normalizeSettings(settings));
}

export function normalizeSettings(saved = {}) {
  const anthropic = saved.anthropic || {};
  const openaiCompatible = saved.openaiCompatible || {};

  return {
    provider: saved.provider || PROVIDERS.anthropic,
    anthropic: {
      apiKey: anthropic.apiKey || saved.apiKey || "",
      hasApiKey: Boolean(anthropic.apiKey || saved.apiKey || anthropic.hasApiKey),
      model: anthropic.model || saved.model || DEFAULT_ANTHROPIC_MODEL,
    },
    openaiCompatible: {
      apiKey: openaiCompatible.apiKey || "",
      hasApiKey: Boolean(openaiCompatible.apiKey || openaiCompatible.hasApiKey),
      baseUrl: openaiCompatible.baseUrl || DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      model: openaiCompatible.model || DEFAULT_OPENAI_COMPATIBLE_MODEL,
      inputPricePerMTok: openaiCompatible.inputPricePerMTok || "",
      outputPricePerMTok: openaiCompatible.outputPricePerMTok || "",
    },
    aiBudget: normalizeAiBudgetSettings(saved.aiBudget),
    aiProfiles: normalizeAiProfiles(saved.aiProfiles),
  };
}

// ------------------------------------------------------------
// 清空全部数据（设置页的「清空全部数据」按钮会用到）
// ------------------------------------------------------------
export async function clearAll() {
  return storageAdapter.clear();
}

// 兼容旧调用：books.js 目前会用 store.keys() 做书籍级清理。
export { storageAdapter, storageAdapter as store };
