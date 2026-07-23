import { useEffect, useRef, useState } from "react";
import ChineseIcon from "./ChineseIcon.jsx";
import { testModelConnection } from "../lib/ai.js";
import { DEFAULT_AI_BUDGET } from "../lib/aiBudgetSettings.js";
import { clearAiDiagnostics, getAiDiagnostics } from "../lib/aiDiagnostics.js";
import { AI_PROFILE_TASKS, DEFAULT_AI_PROFILES } from "../lib/aiProfiles.js";
import { buildAiConfigText, parseAiConfigText } from "../lib/aiConfigImport.js";
import {
  buildDiagnosticEntryDetails,
  buildDiagnosticErrorDetails,
  copyDiagnosticText,
  exportDiagnosticPackage,
  findLatestDiagnosticIssueEntry,
  isDesktopDiagnosticsAvailable,
  isDiagnosticIssueEntry,
  runDiagnosticHealthCheck,
} from "../lib/diagnostics.js";
import {
  deleteLocalBackup,
  exportLocalBackup,
  importLocalBackupById,
  importLocalBackupPath,
  importLocalBackupText,
  isDesktopBackupAvailable,
  listLocalBackups,
  previewLocalBackup,
  previewLocalBackupPath,
  previewLocalBackupText,
  updateLocalBackupMetadata,
} from "../lib/backup.js";
import { downloadTextFile, readTextFile } from "../lib/fileAdapter.js";
import {
  clearAll,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  getSettings,
  normalizeSettings,
  PROVIDERS,
  saveSettings,
} from "../lib/storage.js";
import { formatUsd } from "../lib/pricing.js";
import {
  APP_VERSION_INFO,
  buildVersionSupportText,
  formatAppChannel,
  formatBuildCommit,
  formatRuntimeTarget,
} from "../lib/appVersion.js";
import {
  checkForAppUpdate,
  clearPendingAppUpdate,
  downloadAndInstallAppUpdate,
  isAppUpdaterAvailable,
  openAppReleasePage,
  relaunchUpdatedApp,
} from "../lib/appUpdater.js";

const ANTHROPIC_MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6（默认，均衡）" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8（更强，较贵）" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5（更快，便宜）" },
];

const PROVIDER_OPTIONS = [
  {
    value: PROVIDERS.anthropic,
    label: "Anthropic Claude",
    desc: "使用 Claude 官方接口，适合日常导读、问答和读后交流。",
  },
  {
    value: PROVIDERS.openaiCompatible,
    label: "OpenAI-compatible",
    desc: "用于 OpenAI、Kimi、DeepSeek 等支持兼容接口的服务。",
  },
];

const OPENAI_COMPATIBLE_MODEL_OPTIONS = [
  {
    provider: "OpenAI",
    label: "GPT-5.5（旗舰）",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    inputPricePerMTok: "5",
    outputPricePerMTok: "30",
  },
  {
    provider: "OpenAI",
    label: "GPT-5.4（高能力）",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4",
    inputPricePerMTok: "2.5",
    outputPricePerMTok: "15",
  },
  {
    provider: "OpenAI",
    label: "GPT-5.4 Mini（推荐均衡）",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4-mini",
    inputPricePerMTok: "0.75",
    outputPricePerMTok: "4.5",
  },
  {
    provider: "OpenAI",
    label: "GPT-5.4 Nano（低成本）",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4-nano",
    inputPricePerMTok: "0.2",
    outputPricePerMTok: "1.25",
  },
  {
    provider: "Kimi",
    label: "Kimi K2.6",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.6",
  },
  {
    provider: "Kimi",
    label: "Kimi K2.5",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.5",
  },
  {
    provider: "Kimi",
    label: "Moonshot 128K",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-128k",
  },
  {
    provider: "DeepSeek",
    label: "DeepSeek Flash",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    inputPricePerMTok: "0.14",
    outputPricePerMTok: "0.28",
  },
  {
    provider: "DeepSeek",
    label: "DeepSeek Pro",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    inputPricePerMTok: "0.435",
    outputPricePerMTok: "0.87",
  },
];

const MODEL_OPTION_GROUPS = ["OpenAI", "Kimi", "DeepSeek"];
const OFFICIAL_OPENAI_COMPATIBLE_ORIGINS = new Set([
  "https://api.openai.com",
  "https://api.deepseek.com",
  "https://api.moonshot.cn",
  "https://platform.moonshot.cn",
  "https://platform.kimi.com",
]);

const SETTINGS_PANELS = [
  {
    id: "ai",
    label: "AI 服务",
    desc: "选择模型，保存密钥",
    icon: "ink",
  },
  {
    id: "config",
    label: "批量配置",
    desc: "用 TXT 一次导入",
    icon: "config",
  },
  {
    id: "backup",
    label: "数据备份",
    desc: "导出和恢复书库",
    icon: "archive",
  },
  {
    id: "privacy",
    label: "隐私安全",
    desc: "本地保存与发送范围",
    icon: "shield",
  },
  {
    id: "diagnostics",
    label: "诊断",
    desc: "健康检查与错误详情",
    icon: "pulse",
  },
  {
    id: "updates",
    label: "软件更新",
    desc: "检查并安装新版本",
    icon: "update",
    formalDesktopOnly: true,
  },
  {
    id: "advanced",
    label: "清空数据",
    desc: "删除本机全部内容",
    icon: "clear",
  },
];

function getModelOptionValue(option) {
  return `${option.baseUrl}::${option.model}`;
}

function findModelOption(baseUrl, model) {
  return OPENAI_COMPATIBLE_MODEL_OPTIONS.find(
    (option) => option.baseUrl === baseUrl && option.model === model
  );
}

export default function Settings({ onOpenPrivacy }) {
  const configInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const confirmedBaseUrlsRef = useRef(new Set());
  const [provider, setProvider] = useState(PROVIDERS.anthropic);
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [anthropicHasApiKey, setAnthropicHasApiKey] = useState(false);
  const [anthropicModel, setAnthropicModel] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiHasApiKey, setOpenaiHasApiKey] = useState(false);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(DEFAULT_OPENAI_COMPATIBLE_BASE_URL);
  const [openaiModel, setOpenaiModel] = useState(DEFAULT_OPENAI_COMPATIBLE_MODEL);
  const [inputPricePerMTok, setInputPricePerMTok] = useState("");
  const [outputPricePerMTok, setOutputPricePerMTok] = useState("");
  const [aiBudgetEnabled, setAiBudgetEnabled] = useState(DEFAULT_AI_BUDGET.enabled);
  const [maxInputTokensPerRequest, setMaxInputTokensPerRequest] = useState(
    DEFAULT_AI_BUDGET.maxInputTokensPerRequest
  );
  const [maxOutputTokensPerRequest, setMaxOutputTokensPerRequest] = useState(
    DEFAULT_AI_BUDGET.maxOutputTokensPerRequest
  );
  const [maxEstimatedCostPerRequest, setMaxEstimatedCostPerRequest] = useState(
    DEFAULT_AI_BUDGET.maxEstimatedCostPerRequest
  );
  const [maxEstimatedCostPerDay, setMaxEstimatedCostPerDay] = useState(
    DEFAULT_AI_BUDGET.maxEstimatedCostPerDay
  );
  const [aiProfilesEnabled, setAiProfilesEnabled] = useState(DEFAULT_AI_PROFILES.enabled);
  const [aiProfileTasks, setAiProfileTasks] = useState(DEFAULT_AI_PROFILES.tasks);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [testMsg, setTestMsg] = useState(null);
  const [configMsg, setConfigMsg] = useState(null);
  const [backupMsg, setBackupMsg] = useState(null);
  const [diagnosticsMsg, setDiagnosticsMsg] = useState(null);
  const [buildInfoMsg, setBuildInfoMsg] = useState(null);
  const [appUpdate, setAppUpdate] = useState(null);
  const [updatePhase, setUpdatePhase] = useState("idle");
  const [updateMsg, setUpdateMsg] = useState(null);
  const [updateProgress, setUpdateProgress] = useState({ downloaded: 0, total: null });
  const [updateRecoveryPoint, setUpdateRecoveryPoint] = useState(null);
  const [updateInstallConfirmOpen, setUpdateInstallConfirmOpen] = useState(false);
  const [aiDiagnostics, setAiDiagnostics] = useState({ entries: [] });
  const [desktopHealthReport, setDesktopHealthReport] = useState(null);
  const [diagnosticPackageResult, setDiagnosticPackageResult] = useState(null);
  const [backupList, setBackupList] = useState([]);
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const [backupPreview, setBackupPreview] = useState(null);
  const [externalBackupPath, setExternalBackupPath] = useState("");
  const [externalBackupPreview, setExternalBackupPreview] = useState(null);
  const [backupImportMode, setBackupImportMode] = useState("merge");
  const [testing, setTesting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [activePanel, setActivePanel] = useState("ai");
  const desktopBackupAvailable = isDesktopBackupAvailable();
  const desktopDiagnosticsAvailable = isDesktopDiagnosticsAvailable();
  const appUpdaterAvailable = isAppUpdaterAvailable();
  const visibleSettingsPanels = SETTINGS_PANELS.filter(
    (panel) => !panel.formalDesktopOnly || appUpdaterAvailable
  );

  useEffect(() => {
    getSettings().then((settings) => {
      applySettingsToForm(settings);
    });
    refreshAiDiagnostics();
  }, []);

  useEffect(() => {
    if (desktopBackupAvailable) {
      refreshDesktopBackups();
    }
  }, [desktopBackupAvailable]);

  useEffect(() => () => {
    clearPendingAppUpdate();
  }, []);

  function applySettingsToForm(settings) {
    const normalized = normalizeSettings(settings);
    setProvider(normalized.provider);
    setAnthropicApiKey(normalized.anthropic.apiKey);
    setAnthropicHasApiKey(Boolean(normalized.anthropic.hasApiKey));
    setAnthropicModel(normalized.anthropic.model);
    setOpenaiApiKey(normalized.openaiCompatible.apiKey);
    setOpenaiHasApiKey(Boolean(normalized.openaiCompatible.hasApiKey));
    setOpenaiBaseUrl(normalized.openaiCompatible.baseUrl);
    setOpenaiModel(normalized.openaiCompatible.model);
    setInputPricePerMTok(normalized.openaiCompatible.inputPricePerMTok);
    setOutputPricePerMTok(normalized.openaiCompatible.outputPricePerMTok);
    setAiBudgetEnabled(normalized.aiBudget.enabled);
    setMaxInputTokensPerRequest(normalized.aiBudget.maxInputTokensPerRequest);
    setMaxOutputTokensPerRequest(normalized.aiBudget.maxOutputTokensPerRequest);
    setMaxEstimatedCostPerRequest(normalized.aiBudget.maxEstimatedCostPerRequest);
    setMaxEstimatedCostPerDay(normalized.aiBudget.maxEstimatedCostPerDay);
    setAiProfilesEnabled(normalized.aiProfiles.enabled);
    setAiProfileTasks(normalized.aiProfiles.tasks);
  }

  function buildSettings(overrides = {}) {
    const nextAnthropicApiKey = (overrides.anthropic?.apiKey ?? anthropicApiKey).trim();
    const nextOpenaiApiKey = (overrides.openaiCompatible?.apiKey ?? openaiApiKey).trim();
    return normalizeSettings({
      provider: overrides.provider || provider,
      anthropic: {
        apiKey: nextAnthropicApiKey,
        hasApiKey: desktopBackupAvailable
          ? Boolean(nextAnthropicApiKey || anthropicHasApiKey || overrides.anthropic?.hasApiKey)
          : Boolean(nextAnthropicApiKey),
        model: anthropicModel.trim(),
        ...(overrides.anthropic || {}),
      },
      openaiCompatible: {
        apiKey: nextOpenaiApiKey,
        hasApiKey: desktopBackupAvailable
          ? Boolean(nextOpenaiApiKey || openaiHasApiKey || overrides.openaiCompatible?.hasApiKey)
          : Boolean(nextOpenaiApiKey),
        baseUrl: openaiBaseUrl.trim(),
        model: openaiModel.trim(),
        inputPricePerMTok: inputPricePerMTok.trim(),
        outputPricePerMTok: outputPricePerMTok.trim(),
        ...(overrides.openaiCompatible || {}),
      },
      aiBudget: {
        enabled: aiBudgetEnabled,
        maxInputTokensPerRequest: maxInputTokensPerRequest.trim(),
        maxOutputTokensPerRequest: maxOutputTokensPerRequest.trim(),
        maxEstimatedCostPerRequest: maxEstimatedCostPerRequest.trim(),
        maxEstimatedCostPerDay: maxEstimatedCostPerDay.trim(),
        ...(overrides.aiBudget || {}),
      },
      aiProfiles: {
        enabled: aiProfilesEnabled,
        tasks: aiProfileTasks,
        ...(overrides.aiProfiles || {}),
      },
    });
  }

  async function handleSave() {
    const settings = buildSettings();
    if (
      !confirmOpenAICompatibleTarget(
        settings,
        setSaveMsg,
        "已取消保存，未使用这个 OpenAI-compatible Base URL。"
      )
    ) {
      return;
    }

    setSaving(true);
    setSaveMsg({ type: "info", text: "正在保存模型配置…" });
    setTestMsg(null);
    try {
      await saveSettings(settings);
      applySavedKeyState(settings);
      const savedNewKey =
        settings.provider === PROVIDERS.openaiCompatible
          ? Boolean(settings.openaiCompatible.apiKey)
          : Boolean(settings.anthropic.apiKey);
      setSaveMsg({
        type: "ok",
        text: desktopBackupAvailable
          ? savedNewKey
            ? "保存成功。API Key 已写入系统 Keychain，新的模型配置已经生效。"
            : "保存成功。模型配置已经生效，并继续使用系统 Keychain 中已有的 API Key。"
          : "保存成功。模型配置已保存到当前浏览器。",
      });
    } catch (error) {
      setSaveMsg({
        type: "error",
        text: `保存失败：${
          error?.message ||
          (desktopBackupAvailable
            ? "无法写入系统 Keychain。当前输入仍然保留，请解锁登录钥匙串后重试。"
            : "无法写入本地存储，请稍后重试。")
        }`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleConfigFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setConfigMsg(null);
    setSaveMsg(null);
    setTestMsg(null);

    try {
      const parsed = parseAiConfigText(await readTextFile(file));
      const nextSettings = buildSettings(parsed.settings);
      if (
        !confirmOpenAICompatibleTarget(
          nextSettings,
          setConfigMsg,
          "已取消导入，未保存这份 AI 配置。"
        )
      ) {
        return;
      }

      applySettingsToForm(nextSettings);
      await saveSettings(nextSettings);
      applySavedKeyState(nextSettings);

      const warningText = parsed.warnings.length
        ? `，另有 ${parsed.warnings.length} 行已跳过`
        : "";
      setConfigMsg({
        type: "ok",
        text: `已从 ${file.name} 导入并保存 ${parsed.appliedKeys.length} 项配置${warningText}。`,
      });
    } catch (e) {
      setConfigMsg({
        type: "error",
        text: e.message || "配置文档读取失败，请检查 TXT 格式。",
      });
    }
  }

  function applySavedKeyState(settings) {
    if (!desktopBackupAvailable) {
      setAnthropicHasApiKey(Boolean(settings.anthropic.apiKey));
      setOpenaiHasApiKey(Boolean(settings.openaiCompatible.apiKey));
      return;
    }

    if (settings.anthropic.apiKey) {
      setAnthropicHasApiKey(true);
      setAnthropicApiKey("");
    }
    if (settings.openaiCompatible.apiKey) {
      setOpenaiHasApiKey(true);
      setOpenaiApiKey("");
    }
  }

  function handleDownloadCurrentConfig() {
    const configText = buildAiConfigText(buildSettings());
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile({
      fileName: `duban-ai-config-${date}.txt`,
      text: configText,
    });
    setConfigMsg({
      type: "ok",
      text: "已生成当前 AI 配置 TXT。这个文件包含 API Key，请妥善保存。",
    });
  }

  async function handleExportBackup() {
    setBackupMsg(null);
    setBackupBusy(true);
    try {
      const result = await exportLocalBackup();
      const locationText =
        result.target === "tauri" && result.path
          ? `备份已保存到 ${result.path}`
          : `备份文件 ${result.fileName} 已生成`;
      setBackupMsg({
        type: "ok",
        text: `${locationText}。包含 ${result.itemCount} 组数据和 ${result.fileCount} 个文件；API Key 会单独保留在本机。`,
      });
      if (desktopBackupAvailable) {
        await refreshDesktopBackups(result.backupId);
      }
    } catch (e) {
      setBackupMsg({
        type: "error",
        text: e.message || "导出备份失败，请稍后重试。",
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function refreshDesktopBackups(preferredBackupId = selectedBackupId) {
    if (!desktopBackupAvailable) return;
    try {
      const backups = await listLocalBackups();
      setBackupList(backups);
      const nextBackupId =
        preferredBackupId && backups.some((backup) => backup.backupId === preferredBackupId)
          ? preferredBackupId
          : backups[0]?.backupId || "";
      setSelectedBackupId(nextBackupId);
      if (nextBackupId) {
        setBackupPreview(await previewLocalBackup(nextBackupId));
      } else {
        setBackupPreview(null);
      }
    } catch (e) {
      setBackupMsg({
        type: "error",
        text: e.message || "读取备份清单失败。",
      });
    }
  }

  async function refreshAiDiagnostics() {
    try {
      setAiDiagnostics(await getAiDiagnostics());
    } catch (e) {
      setDiagnosticsMsg({
        type: "error",
        text: e.message || "读取 AI 调用诊断失败。",
      });
    }
  }

  async function handleClearAiDiagnostics() {
    const ok = window.confirm("确定清空最近 AI 调用诊断吗？这不会删除书库、设置或预算用量。");
    if (!ok) return;
    try {
      setAiDiagnostics(await clearAiDiagnostics());
      setDiagnosticsMsg({ type: "ok", text: "已清空 AI 调用诊断。" });
    } catch (e) {
      setDiagnosticsMsg({
        type: "error",
        text: e.message || "清空 AI 调用诊断失败。",
      });
    }
  }

  async function handleRunHealthCheck() {
    if (!desktopDiagnosticsAvailable) {
      setDiagnosticsMsg({ type: "warn", text: "浏览器版没有桌面健康检查。" });
      return;
    }

    setDiagnosticBusy(true);
    setDiagnosticsMsg(null);
    try {
      const report = await runDiagnosticHealthCheck();
      setDesktopHealthReport(report);
      setDiagnosticsMsg({
        type: report.status === "ok" ? "ok" : report.status === "warn" ? "warn" : "error",
        text:
          report.status === "ok"
            ? "健康检查通过。"
            : `健康检查完成，发现 ${report.issueCount || 0} 项提示。`,
      });
    } catch (e) {
      setDiagnosticsMsg({
        type: "error",
        text: e.message || "运行健康检查失败。",
      });
    } finally {
      setDiagnosticBusy(false);
    }
  }

  async function handleExportDiagnosticPackage() {
    if (!desktopDiagnosticsAvailable) {
      setDiagnosticsMsg({ type: "warn", text: "浏览器版没有桌面诊断包。" });
      return;
    }

    setDiagnosticBusy(true);
    setDiagnosticsMsg(null);
    try {
      const result = await exportDiagnosticPackage();
      setDiagnosticPackageResult(result);
      setDiagnosticsMsg({
        type: result.healthStatus === "error" ? "warn" : "ok",
        text: `已导出诊断包：${result.path}`,
      });
      await refreshAiDiagnostics();
    } catch (e) {
      setDiagnosticsMsg({
        type: "error",
        text: e.message || "导出诊断包失败。",
      });
    } finally {
      setDiagnosticBusy(false);
    }
  }

  async function handleCopyLatestErrorDetails() {
    const entry = findLatestDiagnosticIssueEntry(aiDiagnostics);
    if (!entry) {
      setDiagnosticsMsg({ type: "warn", text: "没有可复制的错误详情。" });
      return;
    }
    await handleCopyErrorDetails(entry);
  }

  async function handleCopyErrorDetails(entry) {
    try {
      await copyDiagnosticText(
        isDiagnosticIssueEntry(entry)
          ? buildDiagnosticErrorDetails(entry)
          : buildDiagnosticEntryDetails(entry)
      );
      setDiagnosticsMsg({ type: "ok", text: "已复制脱敏诊断摘要。" });
    } catch (e) {
      setDiagnosticsMsg({
        type: "error",
        text: e.message || "复制错误详情失败。",
      });
    }
  }

  async function handleSelectBackup(backupId) {
    setSelectedBackupId(backupId);
    setBackupMsg(null);
    if (!backupId) {
      setBackupPreview(null);
      return;
    }
    setBackupBusy(true);
    try {
      setBackupPreview(await previewLocalBackup(backupId));
    } catch (e) {
      setBackupPreview(null);
      setBackupMsg({
        type: "error",
        text: e.message || "读取备份预览失败。",
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleImportSelectedBackup() {
    if (!selectedBackupId) {
      setBackupMsg({ type: "warn", text: "请先选择一个备份。" });
      return;
    }

    const modeText = backupImportMode === "merge" ? "合并导入" : "覆盖恢复";
    const ok = window.confirm(
      [
        `准备${modeText}这个备份。`,
        backupImportMode === "merge"
          ? "合并导入会保留现有书库；如果备份里有同一本书，会用备份版本更新。"
          : "覆盖恢复会清空当前书库、进度、笔记和聊天，再恢复备份内容。",
        "备份只恢复书库内容；当前已保存的密钥会保留。",
        "",
        "是否继续？",
      ].join("\n")
    );
    if (!ok) return;

    setBackupMsg(null);
    setBackupBusy(true);
    try {
      const result = await importLocalBackupById(selectedBackupId, backupImportMode);
      applySettingsToForm(await getSettings());
      setBackupMsg({
        type: "ok",
        text: `${modeText}完成：恢复 ${result.itemCount} 组数据和 ${result.fileCount} 个文件。回到书架即可查看结果。`,
      });
      await refreshDesktopBackups(selectedBackupId);
    } catch (e) {
      setBackupMsg({
        type: "error",
        text: e.message || "导入备份失败，请查看校验报告。",
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handlePreviewExternalBackup() {
    const path = externalBackupPath.trim();
    if (!path) {
      setBackupMsg({ type: "warn", text: "请先填写外部备份的文件夹路径或清单文件路径。" });
      return;
    }

    setBackupMsg(null);
    setBackupBusy(true);
    try {
      setExternalBackupPreview(await previewLocalBackupPath(path));
    } catch (e) {
      setExternalBackupPreview(null);
      setBackupMsg({
        type: "error",
        text: e.message || "读取外部备份失败。",
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleImportExternalBackup() {
    const path = externalBackupPath.trim();
    if (!path || !externalBackupPreview) {
      setBackupMsg({ type: "warn", text: "请先预览外部备份。" });
      return;
    }

    const modeText = backupImportMode === "merge" ? "合并导入" : "覆盖恢复";
    const ok = window.confirm(
      [
        `准备${modeText}这个外部备份。`,
        externalBackupPreview.issues.some((issue) => issue.severity === "error")
          ? "这个备份还有错误，请先换一份备份或重新导出后再导入。"
          : "导入前会再次检查备份完整性；如果导入失败，会尽量恢复到导入前状态。",
        "备份只恢复书库内容；当前已保存的密钥会保留。",
        "",
        "是否继续？",
      ].join("\n")
    );
    if (!ok) return;

    setBackupMsg(null);
    setBackupBusy(true);
    try {
      const result = await importLocalBackupPath(path, backupImportMode);
      applySettingsToForm(await getSettings());
      setBackupMsg({
        type: "ok",
        text: `${modeText}完成：恢复 ${result.itemCount} 组数据和 ${result.fileCount} 个文件。回到书架即可查看结果。`,
      });
      await refreshDesktopBackups(selectedBackupId);
    } catch (e) {
      setBackupMsg({
        type: "error",
        text: e.message || "导入外部备份失败，请查看校验报告。",
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleEditBackupMetadata() {
    if (!selectedBackupId || !backupPreview) {
      setBackupMsg({ type: "warn", text: "请先选择一个备份。" });
      return;
    }

    const label = window.prompt("给这个备份起一个短名称，可留空。", backupPreview.label || "");
    if (label === null) return;
    const notes = window.prompt("给这个备份加一条备注，可留空。", backupPreview.notes || "");
    if (notes === null) return;

    setBackupMsg(null);
    setBackupBusy(true);
    try {
      const preview = await updateLocalBackupMetadata(selectedBackupId, { label, notes });
      setBackupPreview(preview);
      await refreshDesktopBackups(selectedBackupId);
      setBackupMsg({ type: "ok", text: "已更新备份名称和备注。" });
    } catch (e) {
      setBackupMsg({
        type: "error",
        text: e.message || "更新备份信息失败。",
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleDeleteSelectedBackup() {
    if (!selectedBackupId) {
      setBackupMsg({ type: "warn", text: "请先选择一个备份。" });
      return;
    }

    const ok = window.confirm(`确定删除备份 ${selectedBackupId} 吗？这只会删除备份文件，当前书库会保留。`);
    if (!ok) return;

    setBackupMsg(null);
    setBackupBusy(true);
    try {
      await deleteLocalBackup(selectedBackupId);
      setBackupMsg({ type: "ok", text: "已删除这个备份；当前书库不受影响。" });
      await refreshDesktopBackups("");
    } catch (e) {
      setBackupMsg({
        type: "error",
        text: e.message || "删除备份失败。",
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleBackupFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    let text = "";
    let preview = null;
    try {
      text = await readTextFile(file);
      preview = previewLocalBackupText(text);
    } catch (e) {
      setBackupMsg({
        type: "error",
        text: e.message || "备份文件读取失败，请检查文件格式。",
      });
      return;
    }

    const ok = window.confirm(
      [
        `备份预览：${preview.bookCount} 本书，${preview.fileCount} 个文件，${preview.pageCount} 页文本，${preview.noteCount} 条笔记，${preview.chatCount} 条聊天。`,
        backupImportMode === "merge"
          ? "合并导入会保留现有书库；如果备份里有同一本书，会用备份版本更新。"
          : "覆盖恢复会清空当前书库、进度、笔记、聊天和本地设置。",
        "备份文件只恢复书库内容；当前已保存的密钥会尽量保留。",
        "",
        "是否继续导入？",
      ].join("\n")
    );
    if (!ok) return;

    setBackupMsg(null);
    setBackupBusy(true);
    try {
      const result = await importLocalBackupText(text, backupImportMode);
      applySettingsToForm(await getSettings());
      setBackupMsg({
        type: "ok",
        text: `已导入 ${file.name}：恢复 ${result.itemCount} 组数据和 ${result.fileCount} 个文件。回到书架即可查看恢复结果。`,
      });
    } catch (e) {
      setBackupMsg({
        type: "error",
        text: e.message || "导入备份失败，请检查文件格式。",
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleTest() {
    setTestMsg(null);
    const settings = buildSettings();
    const activeKey =
      provider === PROVIDERS.openaiCompatible
        ? settings.openaiCompatible.apiKey
        : settings.anthropic.apiKey;

    if (!activeKey) {
      const hasSavedActiveKey =
        provider === PROVIDERS.openaiCompatible ? openaiHasApiKey : anthropicHasApiKey;
      setTestMsg({
        type: "error",
        text: hasSavedActiveKey
          ? "本机已经保存过这个供应商的 API Key。测试连接需要你临时粘贴一次 Key，避免直接读取已保存密钥。"
          : "请先填写当前供应商的 API Key。桌面版打开设置页时会保留已保存密钥；测试连接需要你手动粘贴一次 Key。",
      });
      return;
    }

    if (
      !confirmOpenAICompatibleTarget(
        settings,
        setTestMsg,
        "已取消测试连接，请求已停止。"
      )
    ) {
      return;
    }

    setTesting(true);
    try {
      await testModelConnection(settings);
      setTestMsg({ type: "ok", text: "连接成功！当前输入的模型配置可正常使用，保存后生效。" });
    } catch (e) {
      setTestMsg({ type: "error", text: e.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleClearAll() {
    const ok = window.confirm(
      "确定要清空全部数据吗？清空后会永久删除所有书籍、进度、聊天记录和设置。"
    );
    if (!ok) return;
    await clearAll();
    setProvider(PROVIDERS.anthropic);
    setAnthropicApiKey("");
    setAnthropicModel(DEFAULT_ANTHROPIC_MODEL);
    setOpenaiApiKey("");
    setOpenaiBaseUrl(DEFAULT_OPENAI_COMPATIBLE_BASE_URL);
    setOpenaiModel(DEFAULT_OPENAI_COMPATIBLE_MODEL);
    setInputPricePerMTok("");
    setOutputPricePerMTok("");
    setAiBudgetEnabled(DEFAULT_AI_BUDGET.enabled);
    setMaxInputTokensPerRequest(DEFAULT_AI_BUDGET.maxInputTokensPerRequest);
    setMaxOutputTokensPerRequest(DEFAULT_AI_BUDGET.maxOutputTokensPerRequest);
    setMaxEstimatedCostPerRequest(DEFAULT_AI_BUDGET.maxEstimatedCostPerRequest);
    setMaxEstimatedCostPerDay(DEFAULT_AI_BUDGET.maxEstimatedCostPerDay);
    setAiProfilesEnabled(DEFAULT_AI_PROFILES.enabled);
    setAiProfileTasks(DEFAULT_AI_PROFILES.tasks);
    setSaveMsg({ type: "ok", text: "已清空全部本地数据。" });
  }

  function updateAiProfileTask(taskId, patch) {
    setAiProfileTasks((tasks) => ({
      ...tasks,
      [taskId]: {
        ...(tasks[taskId] || DEFAULT_AI_PROFILES.tasks[taskId]),
        ...patch,
      },
    }));
  }

  function applyModelOption(optionValue) {
    if (optionValue === "custom") {
      setOpenaiModel("");
      setInputPricePerMTok("");
      setOutputPricePerMTok("");
      return;
    }

    const option = OPENAI_COMPATIBLE_MODEL_OPTIONS.find(
      (candidate) => getModelOptionValue(candidate) === optionValue
    );
    if (!option) return;

    setOpenaiBaseUrl(option.baseUrl);
    setOpenaiModel(option.model);
    setInputPricePerMTok(option.inputPricePerMTok || "");
    setOutputPricePerMTok(option.outputPricePerMTok || "");
  }

  function confirmOpenAICompatibleTarget(settings, setMessage, cancelText) {
    const targets = collectOpenAICompatibleTargets(settings);
    if (!targets.length) return true;
    if (!settings.openaiCompatible.apiKey && !desktopBackupAvailable) return true;

    for (const target of targets) {
      const assessment = assessOpenAICompatibleBaseUrl(target.baseUrl);
      if (assessment.error) {
        setMessage({
          type: "error",
          text: `${target.label}：${assessment.error}`,
        });
        return false;
      }

      if (!assessment.needsConfirmation) continue;
      if (confirmedBaseUrlsRef.current.has(assessment.normalizedBaseUrl)) continue;

      const confirmed = window.confirm(
        [
          "你正在使用非官方或非 HTTPS 的 OpenAI-compatible Base URL。",
          "",
          `用途：${target.label}`,
          `目标地址：${assessment.normalizedBaseUrl}`,
          "",
          "测试连接和生成内容时，API Key 和必要的阅读文本会发送到这个地址。请确认它是你信任的服务或本地代理。",
          "",
          "确认继续使用吗？",
        ].join("\n")
      );

      if (!confirmed) {
        setMessage({
          type: "warn",
          text: cancelText || "已取消操作，未使用这个 OpenAI-compatible Base URL。",
        });
        return false;
      }

      confirmedBaseUrlsRef.current.add(assessment.normalizedBaseUrl);
    }

    return true;
  }

  const storageLabel = desktopBackupAvailable ? "系统钥匙串" : "浏览器本地存储";
  const activeProviderOption =
    PROVIDER_OPTIONS.find((option) => option.value === provider) || PROVIDER_OPTIONS[0];
  const activeModelName =
    provider === PROVIDERS.openaiCompatible ? openaiModel : anthropicModel;
  const activeHasSavedKey =
    provider === PROVIDERS.openaiCompatible ? openaiHasApiKey : anthropicHasApiKey;
  const backupStatusText = desktopBackupAvailable
    ? backupList.length
      ? `${backupList.length} 个桌面备份`
      : "暂无桌面备份"
    : "浏览器 JSON 备份";

  async function handleCopyBuildInfo() {
    try {
      await copyDiagnosticText(buildVersionSupportText());
      setBuildInfoMsg({ type: "success", text: "版本信息已复制。" });
    } catch (error) {
      setBuildInfoMsg({ type: "error", text: error?.message || "复制版本信息失败。" });
    }
  }

  async function handleCheckAppUpdate() {
    setUpdatePhase("checking");
    setUpdateMsg(null);
    setAppUpdate(null);
    setUpdateRecoveryPoint(null);
    setUpdateProgress({ downloaded: 0, total: null });
    try {
      const result = await checkForAppUpdate();
      if (!result.supported) {
        setUpdatePhase("error");
        setUpdateMsg({ type: "error", text: "当前环境不支持桌面自动更新。" });
        return;
      }
      if (!result.available) {
        setUpdatePhase("current");
        setUpdateMsg({ type: "ok", text: `当前已是最新版本 ${APP_VERSION_INFO.appVersion}。` });
        return;
      }
      setAppUpdate(result);
      setUpdatePhase("available");
      setUpdateMsg({ type: "ok", text: `发现新版本 ${result.version}。` });
    } catch (error) {
      setUpdatePhase("error");
      setUpdateMsg({ type: "error", text: error?.message || "检查更新失败，请稍后重试。" });
    }
  }

  async function handleInstallAppUpdate() {
    if (!appUpdate?.version) return;
    setUpdateInstallConfirmOpen(false);

    let recoveryPointCreated = false;
    setUpdateMsg(null);
    setUpdateRecoveryPoint(null);
    setUpdateProgress({ downloaded: 0, total: null });
    try {
      setUpdatePhase("backing-up");
      const backup = await exportLocalBackup();
      recoveryPointCreated = true;
      setUpdateRecoveryPoint(backup);
      if (backup.backupId) {
        await updateLocalBackupMetadata(backup.backupId, {
          label: `升级到 ${appUpdate.version} 前的恢复点`,
          notes: `由读伴 ${APP_VERSION_INFO.appVersion} 在自动更新前创建。`,
        }).catch(() => null);
        await refreshDesktopBackups(backup.backupId);
      }

      setUpdatePhase("downloading");
      let downloaded = 0;
      let total = null;
      await downloadAndInstallAppUpdate((progress) => {
        if (progress.phase === "started") {
          total = progress.contentLength;
          downloaded = 0;
        } else if (progress.phase === "progress") {
          downloaded += progress.chunkLength;
        } else if (progress.phase === "finished" && total) {
          downloaded = total;
        }
        setUpdateProgress({ downloaded, total });
      });

      setUpdatePhase("restarting");
      setUpdateMsg({ type: "ok", text: "更新已安装，正在重新打开读伴。" });
      await relaunchUpdatedApp();
    } catch (error) {
      setUpdatePhase("error");
      setUpdateMsg({
        type: "error",
        text: recoveryPointCreated
          ? `${error?.message || "安装更新失败。"} 已保留更新前恢复点，可以重试或手动下载。`
          : `${error?.message || "创建更新前恢复点失败。"} 自动安装已停止，尚未下载更新。`,
      });
    }
  }

  async function handleOpenAppReleasePage() {
    try {
      await openAppReleasePage(appUpdate?.version);
    } catch (error) {
      setUpdateMsg({ type: "error", text: error?.message || "打开下载页面失败。" });
    }
  }

  async function handleRelaunchUpdatedApp() {
    try {
      setUpdatePhase("restarting");
      await relaunchUpdatedApp();
    } catch (error) {
      setUpdatePhase("error");
      setUpdateMsg({ type: "error", text: error?.message || "重启读伴失败，请手动退出后重新打开。" });
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-hero">
          <div>
            <p className="settings-kicker">偏好设置</p>
            <h2 className="settings-title">设置</h2>
            <p className="settings-subtitle">
              在这里连接模型、保存密钥、备份书库，并确认哪些数据会离开本机。
            </p>
          </div>
          <div className="settings-status-grid" aria-label="当前设置状态">
            <StatusTile label="模型" value={activeProviderOption.label} detail={activeModelName || "未设置"} />
            <StatusTile
              label="密钥"
              value={activeHasSavedKey ? "已保存" : "待配置"}
              detail={activeHasSavedKey ? storageLabel : "需要填写"}
              tone={activeHasSavedKey ? "ok" : "warn"}
            />
            <StatusTile label="备份" value={backupStatusText} detail="API Key 单独保存" />
          </div>
        </header>

        <div className="settings-layout">
          <aside className="settings-sidebar" aria-label="设置分类">
            {visibleSettingsPanels.map((panel) => (
              <SettingsNavButton
                key={panel.id}
                panel={panel}
                active={activePanel === panel.id}
                onClick={() => setActivePanel(panel.id)}
              />
            ))}
            <div className="settings-version-summary" aria-label="当前应用版本">
              <span>读伴 {APP_VERSION_INFO.appVersion}</span>
              <small>
                {formatAppChannel()} · {formatRuntimeTarget()}
              </small>
            </div>
          </aside>

          <div className="settings-content" key={activePanel}>
            {activePanel === "ai" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="模型连接"
                  title="AI 服务"
                  desc="选择导读、问答和读后交流要使用的模型。"
                />

                <SettingsSection
                  title="默认模型供应商"
                  desc={activeProviderOption.desc}
                >
                  <label className="settings-field">
                    <span>供应商</span>
                    <select
                      value={provider}
                      onChange={(event) => setProvider(event.target.value)}
                      className="settings-input"
                    >
                      {PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </SettingsSection>

                <SettingsSection
                  title={
                    provider === PROVIDERS.anthropic
                      ? "Claude 配置"
                      : "OpenAI-compatible 配置"
                  }
                  desc="已保存的密钥会继续保留；填写新 Key 后再保存会替换它。"
                >
                  {provider === PROVIDERS.anthropic ? (
                    <AnthropicSettings
                      apiKey={anthropicApiKey}
                      hasSavedKey={anthropicHasApiKey}
                      keyStatusUnknown={desktopBackupAvailable && !anthropicHasApiKey}
                      storageLabel={storageLabel}
                      model={anthropicModel}
                      showKey={showKey}
                      onApiKeyChange={setAnthropicApiKey}
                      onModelChange={setAnthropicModel}
                      onToggleKey={() => setShowKey((value) => !value)}
                    />
                  ) : (
                    <OpenAICompatibleSettings
                      apiKey={openaiApiKey}
                      hasSavedKey={openaiHasApiKey}
                      keyStatusUnknown={desktopBackupAvailable && !openaiHasApiKey}
                      storageLabel={storageLabel}
                      baseUrl={openaiBaseUrl}
                      model={openaiModel}
                      inputPricePerMTok={inputPricePerMTok}
                      outputPricePerMTok={outputPricePerMTok}
                      showKey={showKey}
                      onApiKeyChange={setOpenaiApiKey}
                      onBaseUrlChange={setOpenaiBaseUrl}
                      onModelChange={setOpenaiModel}
                      onInputPriceChange={setInputPricePerMTok}
                      onOutputPriceChange={setOutputPricePerMTok}
                      onToggleKey={() => setShowKey((value) => !value)}
                      onApplyModelOption={applyModelOption}
                    />
                  )}
                </SettingsSection>

                <SettingsSection title="请求会发送到哪里" compact>
                  <p className="settings-note">
                    测试连接和生成内容时，API Key 与必要的阅读文本会发送给当前模型服务。
                    如果填写自定义 Base URL，请确认这个地址可信。
                  </p>
                </SettingsSection>

                <SettingsSection
                  title="任务模型 Profile"
                  desc="为整本书导读、章节导读、阅读中问答、本书聊天、追问和正文整理分别指定模型参数。"
                >
                  <AiProfileSettings
                    enabled={aiProfilesEnabled}
                    tasks={aiProfileTasks}
                    onEnabledChange={setAiProfilesEnabled}
                    onTaskChange={updateAiProfileTask}
                  />
                </SettingsSection>

                <SettingsSection
                  title="预算保护"
                  desc="生成前按输入、输出和费用估算做一次拦截。费用上限依赖模型价格。"
                >
                  <AiBudgetSettings
                    enabled={aiBudgetEnabled}
                    maxInputTokensPerRequest={maxInputTokensPerRequest}
                    maxOutputTokensPerRequest={maxOutputTokensPerRequest}
                    maxEstimatedCostPerRequest={maxEstimatedCostPerRequest}
                    maxEstimatedCostPerDay={maxEstimatedCostPerDay}
                    onEnabledChange={setAiBudgetEnabled}
                    onMaxInputTokensChange={setMaxInputTokensPerRequest}
                    onMaxOutputTokensChange={setMaxOutputTokensPerRequest}
                    onMaxRequestCostChange={setMaxEstimatedCostPerRequest}
                    onMaxDayCostChange={setMaxEstimatedCostPerDay}
                  />
                </SettingsSection>

                <div className="settings-save-bar">
                  <div>
                    <p className="settings-save-title">模型配置</p>
                    <p className="settings-save-subtitle">保存后，新的导读和问答会使用这套配置。</p>
                  </div>
                  <div className="settings-save-actions">
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={testing || saving}
                      className="settings-secondary-button"
                    >
                      {testing ? "测试中…" : "测试连接"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || testing}
                      className="settings-primary-button"
                    >
                      {saving ? "保存中…" : "保存设置"}
                    </button>
                  </div>
                </div>
                {(saveMsg || testMsg) && (
                  <div className="settings-message-stack">
                    {saveMsg && <Hint msg={saveMsg} />}
                    {testMsg && <Hint msg={testMsg} />}
                  </div>
                )}
              </SettingsPanel>
            )}

            {activePanel === "config" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="快速导入"
                  title="批量配置"
                  desc="用一份 TXT 文件填好模型服务、价格和 API Key。"
                />
                <SettingsSection
                  title="AI 批量配置"
                  desc="适合换设备或一次配置多个模型。导入后会直接保存到本机。"
                >
                  <input
                    ref={configInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={handleConfigFileChange}
                  />
                  <div className="settings-action-row">
                    <button
                      type="button"
                      onClick={() => configInputRef.current?.click()}
                      className="settings-primary-button"
                    >
                      导入 TXT 配置
                    </button>
                    <a
                      href="/ai-config-template.txt"
                      download
                      className="settings-secondary-button"
                    >
                      下载模板
                    </a>
                    <button
                      type="button"
                      onClick={handleDownloadCurrentConfig}
                      className="settings-secondary-button"
                    >
                      下载当前配置
                    </button>
                  </div>
                  <p className="settings-note">
                    下载当前配置会包含 API Key。请只保存在你信任的位置，避免发给别人。
                  </p>
                  {configMsg && <Hint msg={configMsg} />}
                </SettingsSection>
              </SettingsPanel>
            )}

            {activePanel === "backup" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="本地书库"
                  title="数据备份"
                  desc="导出或恢复书籍、进度、笔记、聊天和读后交流。API Key 会单独保存在本机。"
                />
                <input
                  ref={backupInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleBackupFileChange}
                />

                <SettingsSection
                  title="备份操作"
                  desc="导出一份可恢复的书库备份，或从已有备份恢复。"
                >
                  <div className="settings-action-row">
                    <button
                      type="button"
                      onClick={handleExportBackup}
                      disabled={backupBusy}
                      className="settings-primary-button"
                    >
                      {desktopBackupAvailable ? "导出目录备份" : "导出 JSON 备份"}
                    </button>
                    <button
                      type="button"
                      onClick={() => backupInputRef.current?.click()}
                      disabled={backupBusy}
                      className="settings-secondary-button"
                    >
                      导入 JSON
                    </button>
                    {desktopBackupAvailable && (
                      <button
                        type="button"
                        onClick={() => refreshDesktopBackups()}
                        disabled={backupBusy}
                        className="settings-secondary-button"
                      >
                        刷新清单
                      </button>
                    )}
                  </div>
                  <div className="settings-form-grid">
                    <label className="settings-field">
                      <span>导入模式</span>
                      <select
                        value={backupImportMode}
                        onChange={(event) => setBackupImportMode(event.target.value)}
                        className="settings-input"
                      >
                        <option value="merge">合并导入</option>
                        <option value="replace">覆盖恢复</option>
                      </select>
                    </label>
                    {desktopBackupAvailable && (
                      <label className="settings-field">
                        <span>桌面备份清单</span>
                        <select
                          value={selectedBackupId}
                          onChange={(event) => handleSelectBackup(event.target.value)}
                          className="settings-input"
                        >
                          <option value="">暂无可用备份</option>
                          {backupList.map((backup) => (
                            <option key={backup.backupId} value={backup.backupId}>
                              {backup.label ? `${backup.label}（${backup.backupId}）` : backup.backupId}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </SettingsSection>

                {desktopBackupAvailable && backupPreview && (
                  <SettingsSection
                    title={backupPreview.label || "备份预览"}
                    desc={backupPreview.path}
                  >
                    {backupPreview.notes && <p className="settings-note">{backupPreview.notes}</p>}
                    <BackupMetricGrid preview={backupPreview} />
                    {backupPreview.issues.length > 0 && (
                      <IssueList issues={backupPreview.issues} />
                    )}
                    <div className="settings-action-row">
                      <button
                        type="button"
                        onClick={handleEditBackupMetadata}
                        disabled={backupBusy}
                        className="settings-secondary-button"
                      >
                        名称/备注
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteSelectedBackup}
                        disabled={backupBusy}
                        className="settings-secondary-button"
                      >
                        删除
                      </button>
                      <button
                        type="button"
                        onClick={handleImportSelectedBackup}
                        disabled={
                          backupBusy || backupPreview.issues.some((issue) => issue.severity === "error")
                        }
                        className="settings-primary-button"
                      >
                        {backupImportMode === "merge" ? "合并导入此备份" : "覆盖恢复此备份"}
                      </button>
                    </div>
                  </SettingsSection>
                )}

                {desktopBackupAvailable && (
                  <SettingsSection title="外部备份" desc="如果备份不在默认位置，可以在这里填写路径后导入。">
                    <div className="settings-inline-form">
                      <label className="settings-field">
                        <span>外部备份路径</span>
                        <input
                          value={externalBackupPath}
                          onChange={(event) => {
                            setExternalBackupPath(event.target.value);
                            setExternalBackupPreview(null);
                          }}
                          placeholder="例如 ~/Downloads/duban-backup-..."
                          className="settings-input"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handlePreviewExternalBackup}
                        disabled={backupBusy}
                        className="settings-secondary-button"
                      >
                        预览外部备份
                      </button>
                    </div>

                    {externalBackupPreview && (
                      <div className="settings-nested-surface">
                        <div className="settings-nested-header">
                          <div>
                            <p className="settings-nested-title">
                              {externalBackupPreview.label || "外部备份预览"}
                            </p>
                            <p className="settings-nested-path">{externalBackupPreview.path}</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleImportExternalBackup}
                            disabled={
                              backupBusy ||
                              externalBackupPreview.issues.some((issue) => issue.severity === "error")
                            }
                            className="settings-primary-button"
                          >
                            {backupImportMode === "merge" ? "合并导入外部备份" : "覆盖恢复外部备份"}
                          </button>
                        </div>
                        <BackupMetricGrid preview={externalBackupPreview} compact />
                        {externalBackupPreview.issues.length > 0 && (
                          <IssueList issues={externalBackupPreview.issues} />
                        )}
                      </div>
                    )}
                  </SettingsSection>
                )}

                <SettingsSection title="API Key 怎么处理" compact>
                  <p className="settings-note">
                    备份只恢复书库内容。API Key 继续使用本机已保存的配置；桌面版导入失败时，会尽量恢复到导入前的书库状态。
                  </p>
                  {backupMsg && <Hint msg={backupMsg} />}
                </SettingsSection>
              </SettingsPanel>
            )}

            {activePanel === "privacy" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="数据去向"
                  title="隐私安全"
                  desc="查看哪些内容保存在本机，哪些内容会发给模型服务。"
                />
                <SettingsSection title="隐私与数据" desc="模型生成导读或回答时，只会发送完成这次请求所需的文本。">
                  <div className="settings-security-grid">
                    <StatusTile label="浏览器版" value="浏览器本地存储" detail="书库与 API Key" />
                    <StatusTile label="桌面版" value="本机数据库 + 系统钥匙串" detail="书库与密钥分开保存" />
                    <StatusTile label="模型请求" value="使用你的 Key" detail="发送给所选服务商" />
                  </div>
                  <button type="button" onClick={onOpenPrivacy} className="settings-secondary-button">
                    查看隐私说明
                  </button>
                </SettingsSection>
                <SettingsSection title="使用自己的 API Key" compact>
                  <div className="settings-copy-stack">
                    <p>
                      浏览器版会把 API Key 保存在当前浏览器；桌面版会把 API Key 保存在系统钥匙串。
                    </p>
                    <p>
                      桌面版进入设置页时会保留已保存密钥；只有测试连接或生成内容时才需要读取密钥。
                    </p>
                    <p>
                      建议使用单独的 API Key，并在模型服务商后台设置额度或限额。自定义 Base URL 时，请确认目标服务可信。
                    </p>
                  </div>
                </SettingsSection>
              </SettingsPanel>
            )}

            {activePanel === "diagnostics" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="本机诊断"
                  title="诊断与支持"
                  desc="查看桌面健康状态、导出诊断包，并复制最近 AI 错误摘要。"
                />
                <SettingsSection
                  title="版本与构建"
                  desc="反馈问题时附上这些信息，可以准确对应到代码、数据结构和备份格式。"
                >
                  <BuildInfoView info={APP_VERSION_INFO} />
                  <div className="settings-action-row settings-build-info-actions">
                    <button
                      type="button"
                      onClick={handleCopyBuildInfo}
                      className="settings-secondary-button"
                    >
                      复制版本信息
                    </button>
                  </div>
                  {buildInfoMsg && <Hint msg={buildInfoMsg} />}
                </SettingsSection>
                <SettingsSection
                  title="桌面健康检查"
                  desc="诊断包只包含脱敏摘要，不包含 API Key、prompt、正文、笔记或聊天全文。"
                >
                  {desktopDiagnosticsAvailable ? (
                    <>
                      <div className="settings-action-row">
                        <button
                          type="button"
                          onClick={handleRunHealthCheck}
                          disabled={diagnosticBusy}
                          className="settings-secondary-button"
                        >
                          {diagnosticBusy ? "处理中..." : "运行健康检查"}
                        </button>
                        <button
                          type="button"
                          onClick={handleExportDiagnosticPackage}
                          disabled={diagnosticBusy}
                          className="settings-primary-button"
                        >
                          导出诊断包
                        </button>
                      </div>
                      <DesktopHealthReportView report={desktopHealthReport} />
                      {diagnosticPackageResult && (
                        <div className="settings-diagnostic-export">
                          <p className="settings-diagnostic-title">
                            {diagnosticPackageResult.fileName}
                          </p>
                          <p className="settings-diagnostic-detail">
                            {diagnosticPackageResult.path}
                          </p>
                          <div className="settings-metric-grid settings-metric-grid-compact">
                            <Metric
                              label="包大小"
                              value={formatBytes(diagnosticPackageResult.byteSize)}
                            />
                            <Metric
                              label="健康状态"
                              value={formatHealthStatus(diagnosticPackageResult.healthStatus)}
                            />
                            <Metric
                              label="日志条数"
                              value={diagnosticPackageResult.logEntryCount || 0}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="settings-note">桌面健康检查和诊断包仅在桌面版可用。</p>
                  )}
                </SettingsSection>

                <SettingsSection
                  title="AI 调用与选材"
                  desc="可查看每次调用使用了哪些材料、为什么排除其他材料，以及是否命中缓存。诊断中不保存正文、笔记、回答或 API Key。"
                >
                  <div className="settings-action-row">
                    <button
                      type="button"
                      onClick={refreshAiDiagnostics}
                      className="settings-secondary-button"
                    >
                      刷新
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAiDiagnostics}
                      className="settings-secondary-button"
                      disabled={!aiDiagnostics.entries?.length}
                    >
                      清空诊断
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyLatestErrorDetails}
                      className="settings-secondary-button"
                      disabled={!findLatestDiagnosticIssueEntry(aiDiagnostics)}
                    >
                      复制最近错误
                    </button>
                  </div>
                  <AiDiagnosticsView
                    diagnostics={aiDiagnostics}
                    onCopyErrorDetails={handleCopyErrorDetails}
                  />
                  {diagnosticsMsg && <Hint msg={diagnosticsMsg} />}
                </SettingsSection>
              </SettingsPanel>
            )}

            {activePanel === "updates" && appUpdaterAvailable && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="正式桌面版"
                  title="软件更新"
                  desc="安全检查、下载并安装读伴的新版本。"
                />
                <SettingsSection
                  title="当前版本"
                  desc="更新包必须通过读伴内置公钥签名验证，验证失败时不会安装。"
                >
                  <div className="settings-update-summary">
                    <StatusTile label="已安装" value={APP_VERSION_INFO.appVersion} detail={formatAppChannel()} />
                    <StatusTile
                      label="更新状态"
                      value={formatUpdatePhase(updatePhase)}
                      detail={appUpdate?.version ? `可用版本 ${appUpdate.version}` : "Alpha 通道"}
                      tone={updatePhase === "error" ? "warn" : appUpdate ? "ok" : "default"}
                    />
                    <StatusTile
                      label="数据保护"
                      value={updateRecoveryPoint ? "恢复点已创建" : "安装前自动备份"}
                      detail={updateRecoveryPoint?.backupId || "备份失败会停止安装"}
                      tone={updateRecoveryPoint ? "ok" : "default"}
                    />
                  </div>

                  {appUpdate?.body && (
                    <div className="settings-update-notes" aria-label={`读伴 ${appUpdate.version} 更新说明`}>
                      <strong>版本说明</strong>
                      <p>{appUpdate.body}</p>
                    </div>
                  )}

                  {updatePhase === "downloading" && (
                    <UpdateProgress progress={updateProgress} />
                  )}

                  <div className="settings-action-row settings-update-actions">
                    <button
                      type="button"
                      className="settings-secondary-button"
                      onClick={handleCheckAppUpdate}
                      disabled={isUpdateBusy(updatePhase)}
                    >
                      {updatePhase === "checking" ? "正在检查..." : "检查更新"}
                    </button>
                    {appUpdate && updatePhase !== "restarting" && (
                      <button
                        type="button"
                        className="settings-primary-button"
                        onClick={() => setUpdateInstallConfirmOpen(true)}
                        disabled={isUpdateBusy(updatePhase)}
                      >
                        {formatUpdateAction(updatePhase)}
                      </button>
                    )}
                    {updatePhase === "restarting" && (
                      <button
                        type="button"
                        className="settings-primary-button"
                        onClick={handleRelaunchUpdatedApp}
                      >
                        重新打开读伴
                      </button>
                    )}
                    <button
                      type="button"
                      className="settings-secondary-button"
                      onClick={handleOpenAppReleasePage}
                      disabled={isUpdateBusy(updatePhase)}
                    >
                      手动下载
                    </button>
                  </div>
                  {updateMsg && <Hint msg={updateMsg} />}
                  <p className="settings-note">
                    自动恢复点保存在本机备份目录，不包含 API Key。安装失败时可以在“数据备份”中查看和恢复。
                  </p>
                </SettingsSection>
              </SettingsPanel>
            )}

            {activePanel === "advanced" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="谨慎操作"
                  title="清空数据"
                  desc="删除本机保存的书籍、进度、笔记、聊天和设置。"
                />
                <SettingsSection title="清空数据" desc="删除所有本地数据，包括书籍、进度、聊天记录和设置。">
                  <div className="settings-danger-zone">
                    <div>
                      <p className="settings-danger-title">清空全部本地数据</p>
                      <p className="settings-note">清空后会永久删除本机数据。建议先完成本地备份。</p>
                    </div>
                    <button type="button" onClick={handleClearAll} className="settings-danger-button">
                      清空全部数据
                    </button>
                  </div>
                  {saveMsg && <Hint msg={saveMsg} />}
                </SettingsSection>
              </SettingsPanel>
            )}
          </div>
        </div>
      </div>
      {updateInstallConfirmOpen && appUpdate && (
        <UpdateInstallConfirmDialog
          currentVersion={APP_VERSION_INFO.appVersion}
          nextVersion={appUpdate.version}
          onCancel={() => setUpdateInstallConfirmOpen(false)}
          onConfirm={handleInstallAppUpdate}
        />
      )}
    </div>
  );
}

function SettingsNavButton({ panel, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`settings-nav-button ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="settings-nav-icon">
        <ChineseIcon name={panel.icon} className="h-4 w-4" decorative />
      </span>
      <span>
        <span className="settings-nav-label">{panel.label}</span>
        <span className="settings-nav-desc">{panel.desc}</span>
      </span>
    </button>
  );
}

function SettingsPanel({ children }) {
  return <div className="settings-panel">{children}</div>;
}

function SettingsPanelHeader({ kicker, title, desc }) {
  return (
    <header className="settings-panel-header">
      <p className="settings-kicker">{kicker}</p>
      <h3>{title}</h3>
      <p>{desc}</p>
    </header>
  );
}

function SettingsSection({ title, desc, compact = false, children }) {
  return (
    <section className={`settings-section ${compact ? "settings-section-compact" : ""}`}>
      <div className="settings-section-head">
        <h4>{title}</h4>
        {desc && <p>{desc}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function StatusTile({ label, value, detail, tone = "default" }) {
  return (
    <div className={`settings-status-tile settings-status-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function UpdateInstallConfirmDialog({ currentVersion, nextVersion, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="取消安装更新"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/30"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`升级到读伴 ${nextVersion}`}
        className="relative w-full max-w-md rounded-lg border border-line bg-paper-card p-5 shadow-xl"
      >
        <p className="settings-kicker">软件更新</p>
        <h2 className="mt-1 font-serif text-2xl text-ink">安装读伴 {nextVersion}</h2>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-ink-soft">
          <p>当前版本 {currentVersion}。安装前会先创建完整书库恢复点，备份失败时不会下载更新。</p>
          <p>更新包通过签名验证并安装完成后，读伴会自动重启。</p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="settings-secondary-button">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="settings-primary-button">
            备份并安装
          </button>
        </div>
      </section>
    </div>
  );
}

function UpdateProgress({ progress }) {
  const total = Number(progress.total) || 0;
  const downloaded = Math.max(0, Number(progress.downloaded) || 0);
  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  return (
    <div className="settings-update-progress" aria-live="polite">
      <div>
        <span>正在下载并验证更新</span>
        <strong>{percent === null ? formatBytes(downloaded) : `${percent}%`}</strong>
      </div>
      <div className="settings-update-progress-track" aria-hidden="true">
        <span style={{ width: percent === null ? "28%" : `${Math.max(3, percent)}%` }} />
      </div>
      <small>
        {total > 0 ? `${formatBytes(downloaded)} / ${formatBytes(total)}` : `${formatBytes(downloaded)} 已下载`}
      </small>
    </div>
  );
}

function isUpdateBusy(phase) {
  return ["checking", "backing-up", "downloading", "restarting"].includes(phase);
}

function formatUpdatePhase(phase) {
  return {
    idle: "尚未检查",
    checking: "正在检查",
    current: "已是最新版",
    available: "发现新版本",
    "backing-up": "正在创建恢复点",
    downloading: "正在下载与安装",
    restarting: "等待重启",
    error: "需要处理",
  }[phase] || "未知状态";
}

function formatUpdateAction(phase) {
  if (phase === "backing-up") return "正在备份...";
  if (phase === "downloading") return "正在安装...";
  return "备份、安装并重启";
}

function BackupMetricGrid({ preview, compact = false }) {
  const metrics = [
    ["书籍", preview.bookCount],
    ["文件", preview.fileCount],
    ["页文本", preview.pageCount],
    ["进度", preview.progressCount],
    ["导读", preview.guideCount],
    ["笔记", preview.noteCount],
    ["聊天", preview.chatCount],
    ["读后交流", preview.reflectionCount],
    ["陪读事件", preview.companionEventCount],
    ["校验", preview.issues?.length ? `${preview.issues.length} 项提示` : "通过"],
    ["备份校验码", preview.manifestSha256 ? preview.manifestSha256.slice(0, 12) : "旧版未记录"],
  ];

  return (
    <div className={`settings-metric-grid ${compact ? "settings-metric-grid-compact" : ""}`}>
      {metrics.map(([label, value]) => (
        <div key={label} className="settings-metric">
          <span>{label}</span>
          <strong>{value ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}

function IssueList({ issues }) {
  return (
    <div className="settings-issue-list">
      {issues.slice(0, 6).map((issue) => (
        <p
          key={`${issue.code}:${issue.key || "global"}`}
          className={issue.severity === "error" ? "settings-issue-error" : "settings-issue-warn"}
        >
          {issue.message}
          {issue.key ? `（${issue.key}）` : ""}
        </p>
      ))}
    </div>
  );
}

function AnthropicSettings({
  apiKey,
  hasSavedKey,
  keyStatusUnknown,
  storageLabel,
  model,
  showKey,
  onApiKeyChange,
  onModelChange,
  onToggleKey,
}) {
  return (
    <div className="settings-form-stack">
      <label className="settings-field">
        <span>Anthropic API Key</span>
        <KeyInput
          value={apiKey}
          hasSavedKey={hasSavedKey}
          keyStatusUnknown={keyStatusUnknown}
          storageLabel={storageLabel}
          showKey={showKey}
          placeholder="sk-ant-..."
          onChange={onApiKeyChange}
          onToggle={onToggleKey}
        />
      </label>

      <label className="settings-field">
        <span>Claude 模型</span>
        <select
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          className="settings-input"
        >
          {ANTHROPIC_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function OpenAICompatibleSettings({
  apiKey,
  hasSavedKey,
  keyStatusUnknown,
  storageLabel,
  baseUrl,
  model,
  inputPricePerMTok,
  outputPricePerMTok,
  showKey,
  onApiKeyChange,
  onBaseUrlChange,
  onModelChange,
  onInputPriceChange,
  onOutputPriceChange,
  onToggleKey,
  onApplyModelOption,
}) {
  const selectedModelOption = findModelOption(baseUrl, model);
  const selectedModelValue = selectedModelOption
    ? getModelOptionValue(selectedModelOption)
    : "custom";

  return (
    <div className="settings-form-stack">
      <label className="settings-field">
        <span>模型清单</span>
        <select
          value={selectedModelValue}
          onChange={(event) => onApplyModelOption(event.target.value)}
          className="settings-input"
        >
          <option value="custom">自定义 / 手动填写</option>
          {MODEL_OPTION_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {OPENAI_COMPATIBLE_MODEL_OPTIONS.filter(
                (option) => option.provider === group
              ).map((option) => (
                <option key={getModelOptionValue(option)} value={getModelOptionValue(option)}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="settings-note">
        选择后会自动填充 Base URL、模型名和可用的价格估算；下面仍然可以手动修改。
      </p>

      <label className="settings-field">
        <span>API Key</span>
        <KeyInput
          value={apiKey}
          hasSavedKey={hasSavedKey}
          keyStatusUnknown={keyStatusUnknown}
          storageLabel={storageLabel}
          showKey={showKey}
          placeholder="sk-..."
          onChange={onApiKeyChange}
          onToggle={onToggleKey}
        />
      </label>

      <div className="settings-form-grid">
        <label className="settings-field">
          <span>Base URL</span>
          <input
            value={baseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            placeholder="https://api.openai.com/v1"
            className="settings-input"
          />
        </label>
        <label className="settings-field">
          <span>模型名</span>
          <input
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            placeholder={DEFAULT_OPENAI_COMPATIBLE_MODEL}
            className="settings-input"
          />
        </label>
      </div>

      <div className="settings-form-grid">
        <label className="settings-field">
          <span>输入价格（美元 / 百万 token，可选）</span>
          <input
            value={inputPricePerMTok}
            onChange={(event) => onInputPriceChange(event.target.value)}
            placeholder="例如 0.15"
            inputMode="decimal"
            className="settings-input"
          />
        </label>
        <label className="settings-field">
          <span>输出价格（美元 / 百万 token，可选）</span>
          <input
            value={outputPricePerMTok}
            onChange={(event) => onOutputPriceChange(event.target.value)}
            placeholder="例如 0.60"
            inputMode="decimal"
            className="settings-input"
          />
        </label>
      </div>
    </div>
  );
}

function AiProfileSettings({ enabled, tasks, onEnabledChange, onTaskChange }) {
  const [activeTaskId, setActiveTaskId] = useState(AI_PROFILE_TASKS[0].id);
  const activeTask = AI_PROFILE_TASKS.find((task) => task.id === activeTaskId) || AI_PROFILE_TASKS[0];
  const profile = tasks?.[activeTask.id] || DEFAULT_AI_PROFILES.tasks[activeTask.id];
  const provider = profile.provider || "";
  const selectedModelOption = findModelOption(profile.openaiBaseUrl, profile.openaiModel);
  const selectedModelValue = selectedModelOption
    ? getModelOptionValue(selectedModelOption)
    : "custom";

  function applyProfileModelOption(optionValue) {
    if (optionValue === "custom") {
      onTaskChange(activeTask.id, {
        openaiBaseUrl: "",
        openaiModel: "",
        inputPricePerMTok: "",
        outputPricePerMTok: "",
      });
      return;
    }

    const option = OPENAI_COMPATIBLE_MODEL_OPTIONS.find(
      (candidate) => getModelOptionValue(candidate) === optionValue
    );
    if (!option) return;

    onTaskChange(activeTask.id, {
      openaiBaseUrl: option.baseUrl,
      openaiModel: option.model,
      inputPricePerMTok: option.inputPricePerMTok || "",
      outputPricePerMTok: option.outputPricePerMTok || "",
    });
  }

  return (
    <div className="settings-form-stack">
      <label className="settings-check-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <span>启用任务模型 Profile</span>
      </label>

      <div className="settings-form-grid">
        <label className="settings-field">
          <span>任务</span>
          <select
            value={activeTask.id}
            onChange={(event) => setActiveTaskId(event.target.value)}
            disabled={!enabled}
            className="settings-input"
          >
            {AI_PROFILE_TASKS.map((task) => (
              <option key={task.id} value={task.id}>
                {task.label}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span>任务默认输出上限</span>
          <input value={activeTask.defaultMaxTokens} disabled className="settings-input" />
        </label>
      </div>

      <label className="settings-check-row">
        <input
          type="checkbox"
          checked={Boolean(profile.enabled)}
          disabled={!enabled}
          onChange={(event) => onTaskChange(activeTask.id, { enabled: event.target.checked })}
        />
        <span>这个任务使用独立 Profile</span>
      </label>

      {profile.enabled && (
        <>
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>供应商</span>
              <select
                value={provider}
                onChange={(event) =>
                  onTaskChange(activeTask.id, {
                    provider: event.target.value,
                  })
                }
                disabled={!enabled}
                className="settings-input"
              >
                <option value="">继承全局供应商</option>
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>Temperature</span>
              <input
                value={profile.temperature}
                onChange={(event) =>
                  onTaskChange(activeTask.id, { temperature: event.target.value })
                }
                placeholder={activeTask.defaultTemperature}
                inputMode="decimal"
                disabled={!enabled}
                className="settings-input"
              />
            </label>
          </div>

          {!provider && (
            <p className="settings-note">
              供应商留空时，这个任务会继承全局模型；仍可单独覆盖输出上限和 temperature。
            </p>
          )}

          {provider === PROVIDERS.anthropic ? (
            <label className="settings-field">
              <span>Claude 模型</span>
              <select
                value={profile.anthropicModel || ""}
                onChange={(event) =>
                  onTaskChange(activeTask.id, { anthropicModel: event.target.value })
                }
                disabled={!enabled}
                className="settings-input"
              >
                <option value="">继承全局 Claude 模型</option>
                {ANTHROPIC_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : provider === PROVIDERS.openaiCompatible ? (
            <>
              <label className="settings-field">
                <span>OpenAI-compatible 模型清单</span>
                <select
                  value={selectedModelValue}
                  onChange={(event) => applyProfileModelOption(event.target.value)}
                  disabled={!enabled}
                  className="settings-input"
                >
                  <option value="custom">继承全局或手动填写</option>
                  {MODEL_OPTION_GROUPS.map((group) => (
                    <optgroup key={group} label={group}>
                      {OPENAI_COMPATIBLE_MODEL_OPTIONS.filter(
                        (option) => option.provider === group
                      ).map((option) => (
                        <option key={getModelOptionValue(option)} value={getModelOptionValue(option)}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <div className="settings-form-grid">
                <label className="settings-field">
                  <span>Base URL</span>
                  <input
                    value={profile.openaiBaseUrl}
                    onChange={(event) =>
                      onTaskChange(activeTask.id, { openaiBaseUrl: event.target.value })
                    }
                    placeholder="留空继承全局 Base URL"
                    disabled={!enabled}
                    className="settings-input"
                  />
                </label>
                <label className="settings-field">
                  <span>模型名</span>
                  <input
                    value={profile.openaiModel}
                    onChange={(event) =>
                      onTaskChange(activeTask.id, { openaiModel: event.target.value })
                    }
                    placeholder="留空继承全局模型"
                    disabled={!enabled}
                    className="settings-input"
                  />
                </label>
              </div>

              <div className="settings-form-grid">
                <label className="settings-field">
                  <span>输入价格（美元 / 百万 token）</span>
                  <input
                    value={profile.inputPricePerMTok}
                    onChange={(event) =>
                      onTaskChange(activeTask.id, { inputPricePerMTok: event.target.value })
                    }
                    placeholder="留空继承全局价格"
                    inputMode="decimal"
                    disabled={!enabled}
                    className="settings-input"
                  />
                </label>
                <label className="settings-field">
                  <span>输出价格（美元 / 百万 token）</span>
                  <input
                    value={profile.outputPricePerMTok}
                    onChange={(event) =>
                      onTaskChange(activeTask.id, { outputPricePerMTok: event.target.value })
                    }
                    placeholder="留空继承全局价格"
                    inputMode="decimal"
                    disabled={!enabled}
                    className="settings-input"
                  />
                </label>
              </div>
            </>
          ) : null}

          <label className="settings-field">
            <span>输出 token 上限</span>
            <input
              value={profile.maxTokens}
              onChange={(event) => onTaskChange(activeTask.id, { maxTokens: event.target.value })}
              placeholder={`留空使用任务默认 ${activeTask.defaultMaxTokens}`}
              inputMode="numeric"
              disabled={!enabled}
              className="settings-input"
            />
          </label>
        </>
      )}

      <p className="settings-note">
        Profile 不保存 API Key；切到另一个供应商时，会继续使用该供应商在本机保存的 Key。
      </p>
    </div>
  );
}

function DesktopHealthReportView({ report }) {
  if (!report) {
    return <p className="settings-note">尚未运行健康检查。</p>;
  }

  const fileReport = report.files || {};
  const backupReport = report.backups || {};
  const keyStatus = report.settingsKeyStatus || {};

  return (
    <div className="settings-diagnostic-report">
      <div className="settings-metric-grid settings-metric-grid-compact">
        <Metric label="状态" value={formatHealthStatus(report.status)} />
        <Metric label="问题" value={report.issueCount || 0} />
        <Metric
          label="Schema"
          value={`${report.schemaVersion || "未知"} / ${report.expectedSchemaVersion || "未知"}`}
        />
        <Metric label="SQLite" value={report.sqliteQuickCheck || "未记录"} />
        <Metric label="缺失文件" value={fileReport.missingFileCount || 0} />
        <Metric label="孤儿文件" value={fileReport.orphanCount || 0} />
      </div>

      <div className="settings-diagnostic-kv">
        <span>备份目录：{backupReport.writable ? "可写" : backupReport.issue || "不可写"}</span>
        <span>Claude Key：{keyStatus.anthropicHasApiKey ? "已保存" : "未保存"}</span>
        <span>
          OpenAI-compatible Key：{keyStatus.openaiCompatibleHasApiKey ? "已保存" : "未保存"}
        </span>
      </div>

      {report.issues?.length > 0 && <IssueList issues={report.issues} />}
    </div>
  );
}

function BuildInfoView({ info }) {
  return (
    <div className="settings-metric-grid settings-build-info-grid">
      <Metric label="App version" value={info.appVersion} />
      <Metric label="发布通道" value={formatAppChannel(info.channel)} />
      <Metric label="运行环境" value={formatRuntimeTarget(info.runtime)} />
      <Metric label="Git commit" value={formatBuildCommit(info)} />
      <Metric label="SQLite schema" value={info.schemaVersion} />
      <Metric label="备份格式" value={info.backupVersion} />
    </div>
  );
}

function AiDiagnosticsView({ diagnostics, onCopyErrorDetails }) {
  const entries = diagnostics?.entries || [];
  if (!entries.length) {
    return <p className="settings-note">暂无 AI 调用诊断。</p>;
  }

  return (
    <div className="settings-diagnostic-list">
      {entries.map((entry) => (
        <article key={entry.id} className="settings-diagnostic-item">
          <div className="settings-diagnostic-head">
            <div>
              <p className="settings-diagnostic-title">
                {entry.taskLabel || "AI 请求"} · {formatDiagnosticMode(entry.mode)}
              </p>
              <p className="settings-diagnostic-meta">
                {formatDateTime(entry.startedAt)} · {entry.provider || "未知供应商"} ·{" "}
                {entry.model || "未知模型"}
              </p>
            </div>
            <div className="settings-diagnostic-actions">
              <span className={`settings-diagnostic-badge settings-diagnostic-${entry.status}`}>
                {formatDiagnosticStatus(entry.status)}
              </span>
              <button
                type="button"
                onClick={() => onCopyErrorDetails(entry)}
                className="settings-diagnostic-copy"
              >
                复制摘要
              </button>
            </div>
          </div>

          <div className="settings-metric-grid settings-metric-grid-compact">
            <Metric label="耗时" value={formatDuration(entry.durationMs)} />
            <Metric label="输入 token" value={entry.inputTokens || 0} />
            <Metric label="输出 token" value={entry.outputTokens || 0} />
            <Metric label="费用" value={formatUsd(entry.actualCost || entry.estimatedCost || 0)} />
            <Metric
              label="尝试"
              value={entry.mode === "cache" ? "0（未调用）" : entry.attempts || "未记录"}
            />
            <Metric label="Profile" value={entry.profileApplied ? "已应用" : "默认"} />
          </div>

          {(entry.errorCode || entry.finishReason || entry.truncated) && (
            <p className="settings-diagnostic-detail">
              {entry.errorCode ? `错误码：${entry.errorCode}` : `结束原因：${entry.finishReason || "未记录"}`}
              {entry.httpStatus ? ` · HTTP ${entry.httpStatus}` : ""}
              {entry.retryable ? " · 可重试" : ""}
              {entry.truncated ? " · 输出截断" : ""}
            </p>
          )}
          {entry.errorMessage && (
            <p className="settings-diagnostic-detail">{entry.errorMessage}</p>
          )}
          {entry.baseUrlOrigin && (
            <p className="settings-diagnostic-detail">Base URL：{entry.baseUrlOrigin}</p>
          )}
          {entry.context && <AiContextDiagnosticView context={entry.context} />}
        </article>
      ))}
    </div>
  );
}

function AiContextDiagnosticView({ context }) {
  const budget = context.budget || {};
  return (
    <details className="settings-context-diagnostic">
      <summary>
        本次使用了 {budget.sourceCount || 0} 项材料
        {context.cache?.hit ? " · 已命中缓存" : ""}
      </summary>
      <div className="settings-context-diagnostic-body">
        <p className="settings-diagnostic-detail">
          {formatContextCache(context.cache)} · 已用 {budget.usedContextChars || 0} /{" "}
          {budget.maxContextChars || 0} 字符 · 输出上限 {budget.maxOutputTokens || 0} token
        </p>
        <p className="settings-diagnostic-detail">{formatContextPolicy(context.policy)}</p>
        {context.sources?.length > 0 && (
          <div className="settings-context-source-list">
            {context.sources.map((source, index) => (
              <span key={`${source.ref || source.kind}-${index}`}>
                {formatContextSource(source)}
              </span>
            ))}
          </div>
        )}
        {context.exclusions?.length > 0 && (
          <div className="settings-context-exclusion-list">
            {context.exclusions.map((entry, index) => (
              <span key={`${entry.kind}-${entry.reason}-${index}`}>
                未带入 {formatContextSourceKind(entry.kind)}：
                {formatContextExclusionReason(entry.reason)}（{entry.count} 项）
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function Metric({ label, value }) {
  return (
    <div className="settings-metric">
      <span>{label}</span>
      <strong title={String(value)}>{value}</strong>
    </div>
  );
}

function formatDiagnosticStatus(status) {
  if (status === "success") return "成功";
  if (status === "blocked") return "已拦截";
  if (status === "cancelled") return "已取消";
  return "失败";
}

function formatDiagnosticMode(mode) {
  if (mode === "stream") return "流式";
  if (mode === "cache") return "缓存复用";
  return "非流式";
}

function formatContextCache(cache) {
  if (!cache?.kind) return "缓存状态未记录";
  if (!cache.hit) return "未命中缓存，已重新整理材料";
  return cache.kind === "guide-artifact" ? "直接使用已生成导读" : "使用已整理的上下文";
}

function formatContextPolicy(policy = {}) {
  const values = [
    { avoid: "仅使用已读内容", hint: "不透露未读内容", allow: "允许讨论后文" }[
      policy.spoiler
    ],
    { concise: "简要回答", balanced: "标准回答", deep: "详细回答" }[
      policy.answerDepth
    ],
    { never: "不追问", helpful: "信息不足时追问", always: "回答后追问" }[
      policy.followUp
    ],
    { book: "仅限书中", text_first: "以书为主", open: "可补充外部知识" }[
      policy.knowledgeBoundary
    ],
  ].filter(Boolean);
  return values.length ? `本次规则：${values.join(" · ")}` : "本次规则未记录";
}

function formatContextSource(source) {
  const page = source.pageNumber
    ? source.pageEnd && source.pageEnd !== source.pageNumber
      ? ` · 第 ${source.pageNumber}-${source.pageEnd} 页`
      : ` · 第 ${source.pageNumber} 页`
    : "";
  const state = [source.compacted ? "已压缩" : "", source.truncated ? "已截短" : ""]
    .filter(Boolean)
    .join("、");
  return `${formatContextSourceKind(source.kind)}${page} · ${source.charCount || 0} 字${
    state ? ` · ${state}` : ""
  }`;
}

function formatContextSourceKind(value) {
  return {
    selection: "选中的原文",
    current_page: "当前页",
    prior_reading: "已读内容",
    target_item: "当前阅读项",
    open_item: "允许带入的当前阅读项",
    completed_item: "已完成阅读项",
    guide: "导读",
    history_user: "历史提问",
    history_assistant: "历史回答",
    reading_chat_user: "伴读提问",
    reading_chat_assistant: "伴读回答",
    reading_note: "阅读笔记",
    memory: "确认保留的本书记忆",
    unread_item: "未读正文",
    assistant_history: "旧模型回答",
    contract_key_turn: "全书关键转折",
    contract_reading_path: "全书阅读路径",
  }[value] || "其他材料";
}

function formatContextExclusionReason(value) {
  return {
    "spoiler-policy": "受未读内容设置限制",
    "reading-frontier": "尚未确认读到",
    "context-budget": "超过本次上下文容量",
    "memory-scope": "与本次问题或阅读位置不符",
    "empty-source": "没有可用文本",
  }[value] || "未满足本次选材条件";
}

function formatHealthStatus(status) {
  if (status === "ok") return "正常";
  if (status === "warn") return "有提示";
  if (status === "error") return "需处理";
  return "未知";
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(value) {
  const ms = Number(value) || 0;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDateTime(value) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleString();
}

function AiBudgetSettings({
  enabled,
  maxInputTokensPerRequest,
  maxOutputTokensPerRequest,
  maxEstimatedCostPerRequest,
  maxEstimatedCostPerDay,
  onEnabledChange,
  onMaxInputTokensChange,
  onMaxOutputTokensChange,
  onMaxRequestCostChange,
  onMaxDayCostChange,
}) {
  return (
    <div className="settings-form-stack">
      <label className="settings-check-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <span>启用预算保护</span>
      </label>

      <div className="settings-form-grid">
        <label className="settings-field">
          <span>单次输入 token 上限</span>
          <input
            value={maxInputTokensPerRequest}
            onChange={(event) => onMaxInputTokensChange(event.target.value)}
            placeholder={DEFAULT_AI_BUDGET.maxInputTokensPerRequest}
            inputMode="numeric"
            disabled={!enabled}
            className="settings-input"
          />
        </label>
        <label className="settings-field">
          <span>单次输出 token 上限</span>
          <input
            value={maxOutputTokensPerRequest}
            onChange={(event) => onMaxOutputTokensChange(event.target.value)}
            placeholder={DEFAULT_AI_BUDGET.maxOutputTokensPerRequest}
            inputMode="numeric"
            disabled={!enabled}
            className="settings-input"
          />
        </label>
      </div>

      <div className="settings-form-grid">
        <label className="settings-field">
          <span>单次费用上限（美元，可选）</span>
          <input
            value={maxEstimatedCostPerRequest}
            onChange={(event) => onMaxRequestCostChange(event.target.value)}
            placeholder="例如 0.20"
            inputMode="decimal"
            disabled={!enabled}
            className="settings-input"
          />
        </label>
        <label className="settings-field">
          <span>每日费用上限（美元，可选）</span>
          <input
            value={maxEstimatedCostPerDay}
            onChange={(event) => onMaxDayCostChange(event.target.value)}
            placeholder="例如 2.00"
            inputMode="decimal"
            disabled={!enabled}
            className="settings-input"
          />
        </label>
      </div>

      <p className="settings-note">
        留空表示不限制对应费用；预算用量只保存日期、任务类型、token 和估算费用。
      </p>
    </div>
  );
}

function KeyInput({
  value,
  hasSavedKey,
  keyStatusUnknown,
  storageLabel,
  showKey,
  placeholder,
  onChange,
  onToggle,
}) {
  const hasDraftKey = Boolean(value.trim());
  const statusText = hasDraftKey
    ? hasSavedKey
      ? `已填写新 Key；保存后会替换${storageLabel}里的密钥。`
      : `已填写 Key；保存后会保存在${storageLabel}。`
    : hasSavedKey
    ? `已保存 Key；输入框留空时会继续保留。`
    : keyStatusUnknown
    ? "已保存密钥的状态需要在使用时确认；输入框留空时会继续保留，填写并保存新 Key 后会更新状态。"
    : "等待保存 Key。";
  const statusColor = hasDraftKey
    ? "text-amber-700"
    : hasSavedKey
    ? "text-green-700"
    : keyStatusUnknown
    ? "text-amber-700"
    : "text-ink-soft";

  return (
    <div className="settings-key-input">
      <div className="settings-key-row">
        <input
          type={showKey ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="settings-input"
        />
        <button
          type="button"
          onClick={onToggle}
          className="settings-secondary-button settings-key-toggle"
        >
          {showKey ? "隐藏" : "显示"}
        </button>
      </div>
      <p className={`settings-key-status ${statusColor}`}>{statusText}</p>
    </div>
  );
}

function Hint({ msg }) {
  const color =
    msg.type === "ok"
      ? "text-green-700"
      : msg.type === "error"
      ? "text-red-600"
      : msg.type === "warn"
      ? "text-amber-700"
      : "text-ink-soft";
  return <p className={`settings-hint ${color}`}>{msg.text}</p>;
}

function collectOpenAICompatibleTargets(settings) {
  const targets = [];
  if (settings.provider === PROVIDERS.openaiCompatible) {
    targets.push({
      label: "全局模型配置",
      baseUrl: settings.openaiCompatible.baseUrl,
    });
  }

  if (settings.aiProfiles?.enabled) {
    for (const task of AI_PROFILE_TASKS) {
      const profile = settings.aiProfiles.tasks?.[task.id];
      if (!profile?.enabled || profile.provider !== PROVIDERS.openaiCompatible) continue;
      targets.push({
        label: `${task.label} Profile`,
        baseUrl: profile.openaiBaseUrl || settings.openaiCompatible.baseUrl,
      });
    }
  }

  return targets.filter(
    (target, index, all) =>
      target.baseUrl &&
      all.findIndex((candidate) => candidate.baseUrl === target.baseUrl) === index
  );
}

function assessOpenAICompatibleBaseUrl(value) {
  const text = (value || DEFAULT_OPENAI_COMPATIBLE_BASE_URL).trim();
  let url;

  try {
    url = new URL(text);
  } catch {
    return {
      error: "请填写完整的 Base URL，例如 https://api.openai.com/v1。",
    };
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    return {
      error: "Base URL 只支持 http 或 https 地址。",
    };
  }

  const normalizedBaseUrl = text.replace(/\/+$/, "");
  return {
    normalizedBaseUrl,
    needsConfirmation:
      url.protocol !== "https:" || !OFFICIAL_OPENAI_COMPATIBLE_ORIGINS.has(url.origin),
  };
}
