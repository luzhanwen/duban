import { useEffect, useRef, useState } from "react";
import { testModelConnection } from "../lib/ai.js";
import { buildAiConfigText, parseAiConfigText } from "../lib/aiConfigImport.js";
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

const ANTHROPIC_MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6（默认，均衡）" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8（更强，较贵）" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5（更快，便宜）" },
];

const PROVIDER_OPTIONS = [
  {
    value: PROVIDERS.anthropic,
    label: "Anthropic Claude",
    desc: "使用 Claude Messages API，适合当前默认导读能力。",
  },
  {
    value: PROVIDERS.openaiCompatible,
    label: "OpenAI-compatible",
    desc: "兼容 OpenAI Chat Completions，可用于 OpenAI、Kimi、DeepSeek 等服务。",
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
    desc: "模型、密钥与连接测试",
  },
  {
    id: "config",
    label: "批量配置",
    desc: "TXT 导入与配置导出",
  },
  {
    id: "backup",
    label: "数据备份",
    desc: "书库迁移与恢复",
  },
  {
    id: "privacy",
    label: "隐私安全",
    desc: "BYOK 与本地数据边界",
  },
  {
    id: "advanced",
    label: "高级维护",
    desc: "危险操作集中管理",
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
  const [showKey, setShowKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [testMsg, setTestMsg] = useState(null);
  const [configMsg, setConfigMsg] = useState(null);
  const [backupMsg, setBackupMsg] = useState(null);
  const [backupList, setBackupList] = useState([]);
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const [backupPreview, setBackupPreview] = useState(null);
  const [externalBackupPath, setExternalBackupPath] = useState("");
  const [externalBackupPreview, setExternalBackupPreview] = useState(null);
  const [backupImportMode, setBackupImportMode] = useState("merge");
  const [testing, setTesting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [activePanel, setActivePanel] = useState("ai");
  const desktopBackupAvailable = isDesktopBackupAvailable();

  useEffect(() => {
    getSettings().then((settings) => {
      applySettingsToForm(settings);
    });
  }, []);

  useEffect(() => {
    if (desktopBackupAvailable) {
      refreshDesktopBackups();
    }
  }, [desktopBackupAvailable]);

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

    await saveSettings(settings);
    applySavedKeyState(settings);
    setSaveMsg({ type: "ok", text: "已保存到本地。" });
    setTimeout(() => setSaveMsg(null), 2000);
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
        text: `${locationText}。包含 ${result.itemCount} 组数据和 ${result.fileCount} 个文件，不包含 API Key。`,
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
          ? "合并导入会保留当前书库中备份没有涉及的数据；同 id 书籍和同 key 数据会以备份为准。"
          : "覆盖恢复会清空当前书库、进度、笔记和聊天，再恢复备份内容。",
        "备份不包含 API Key；桌面版会保留当前 Keychain 中的 API Key。",
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
      setBackupMsg({ type: "warn", text: "请先填写外部备份目录或 manifest.json 路径。" });
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
          ? "当前校验报告有错误，不能导入。"
          : "导入前会再次校验 manifest 和原始文件 hash；失败会自动恢复导入前状态。",
        "备份不包含 API Key；桌面版会保留当前 Keychain 中的 API Key。",
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
      setBackupMsg({ type: "ok", text: "已更新备份名称和备注，并重新写入 manifest 校验和。" });
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

    const ok = window.confirm(`确定删除备份 ${selectedBackupId} 吗？这个操作不会删除当前书库。`);
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
          ? "合并导入会保留当前书库中备份没有涉及的数据；同 id 书籍和同 key 数据会以备份为准。"
          : "覆盖恢复会清空当前书库、进度、笔记、聊天和本地设置。",
        "备份文件不包含 API Key；桌面版会保留当前 Keychain 中的 API Key，浏览器版会尽量保留当前浏览器中的 API Key。",
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
          ? "本机已保存当前供应商的 API Key；设置页测试连接不会自动读取它。若要重新测试，请临时粘贴 Key。"
          : "请先填写当前供应商的 API Key。桌面版设置页不会自动读取已保存的 Keychain 密钥，以避免系统密码弹窗。",
      });
      return;
    }

    if (
      !confirmOpenAICompatibleTarget(
        settings,
        setTestMsg,
        "已取消测试连接，未向这个 Base URL 发送请求。"
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
      "确定要清空全部数据吗？这会删除所有书籍、进度、聊天记录和设置，且无法恢复。"
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
    setSaveMsg({ type: "ok", text: "已清空全部本地数据。" });
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
    if (settings.provider !== PROVIDERS.openaiCompatible) return true;
    if (!settings.openaiCompatible.apiKey && !desktopBackupAvailable) return true;

    const assessment = assessOpenAICompatibleBaseUrl(settings.openaiCompatible.baseUrl);
    if (assessment.error) {
      setMessage({
        type: "error",
        text: assessment.error,
      });
      return false;
    }

    if (!assessment.needsConfirmation) return true;
    if (confirmedBaseUrlsRef.current.has(assessment.normalizedBaseUrl)) return true;

    const confirmed = window.confirm(
      [
        "你正在使用非官方或非 HTTPS 的 OpenAI-compatible Base URL。",
        "",
        `目标地址：${assessment.normalizedBaseUrl}`,
        "",
        "测试连接和生成内容时，读伴会把你的 API Key 与必要的阅读文本发送到这个地址。读伴无法验证该服务是否可信。",
        "",
        "请只在你完全信任这个服务商或本地代理时继续。是否确认使用？",
      ].join("\n")
    );

    if (confirmed) {
      confirmedBaseUrlsRef.current.add(assessment.normalizedBaseUrl);
      return true;
    }

    setMessage({
      type: "warn",
      text: cancelText || "已取消操作，未使用这个 OpenAI-compatible Base URL。",
    });
    return false;
  }

  const storageLabel = desktopBackupAvailable ? "系统 Keychain" : "IndexedDB";
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

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-hero">
          <div>
            <p className="settings-kicker">Preferences</p>
            <h2 className="settings-title">设置</h2>
            <p className="settings-subtitle">
              管理读伴的模型服务、本地数据和安全边界。高频配置放在前面，低频维护收进独立面板。
            </p>
          </div>
          <div className="settings-status-grid" aria-label="当前设置状态">
            <StatusTile label="模型" value={activeProviderOption.label} detail={activeModelName || "未设置"} />
            <StatusTile
              label="密钥"
              value={activeHasSavedKey ? "已保存" : "待配置"}
              detail={activeHasSavedKey ? storageLabel : "当前供应商"}
              tone={activeHasSavedKey ? "ok" : "warn"}
            />
            <StatusTile label="备份" value={backupStatusText} detail="不包含 API Key" />
          </div>
        </header>

        <div className="settings-layout">
          <aside className="settings-sidebar" aria-label="设置分类">
            {SETTINGS_PANELS.map((panel) => (
              <SettingsNavButton
                key={panel.id}
                panel={panel}
                active={activePanel === panel.id}
                onClick={() => setActivePanel(panel.id)}
              />
            ))}
          </aside>

          <div className="settings-content" key={activePanel}>
            {activePanel === "ai" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="Model Control"
                  title="AI 服务"
                  desc="配置读伴生成导读、问答和读后交流时使用的默认模型。"
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
                  desc="密钥留空保存不会覆盖桌面版 Keychain 中已保存的密钥。"
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

                <SettingsSection title="连接边界" compact>
                  <p className="settings-note">
                    浏览器版直连 OpenAI-compatible 服务时，部分服务可能因为 CORS 策略无法调用。
                    自定义 Base URL 会在测试连接和生成内容时接收 API Key 与必要阅读文本。
                  </p>
                </SettingsSection>

                <div className="settings-save-bar">
                  <div>
                    <p className="settings-save-title">模型配置</p>
                    <p className="settings-save-subtitle">保存后会用于后续导读、问答和读后交流。</p>
                  </div>
                  <div className="settings-save-actions">
                    <button type="button" onClick={handleTest} disabled={testing} className="settings-secondary-button">
                      {testing ? "测试中…" : "测试连接"}
                    </button>
                    <button type="button" onClick={handleSave} className="settings-primary-button">
                      保存设置
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
                  kicker="Bulk Setup"
                  title="批量配置"
                  desc="用 TXT 模板快速写入供应商、模型、Base URL、价格和 API Key。"
                />
                <SettingsSection
                  title="AI 批量配置"
                  desc="模板已预填常用供应商，只需要粘贴要使用的 API Key。导入会立即保存到本地。"
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
                    如果配置里包含非官方 Base URL，会先要求确认。下载当前配置会包含 API Key，请只保存在可信位置。
                  </p>
                  {configMsg && <Hint msg={configMsg} />}
                </SettingsSection>
              </SettingsPanel>
            )}

            {activePanel === "backup" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="Local Library"
                  title="数据备份"
                  desc="导出、预览、校验和恢复本地书库数据。备份默认不包含 API Key。"
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
                  desc="桌面版导出目录式备份；浏览器版导出 JSON 备份。"
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
                  <SettingsSection title="外部备份" desc="填写备份目录或 manifest.json 路径，先预览校验再导入。">
                    <div className="settings-inline-form">
                      <label className="settings-field">
                        <span>外部备份目录或 manifest.json 路径</span>
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

                <SettingsSection title="备份边界" compact>
                  <p className="settings-note">
                    桌面版备份会校验 manifest 和文件 hash，失败会自动回滚到导入前状态。导入不会从备份恢复 API Key。
                  </p>
                  {backupMsg && <Hint msg={backupMsg} />}
                </SettingsSection>
              </SettingsPanel>
            )}

            {activePanel === "privacy" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="Trust Boundary"
                  title="隐私安全"
                  desc="读伴默认把书籍、笔记、聊天和 API Key 保存在本机。"
                />
                <SettingsSection title="隐私与数据" desc="查看完整说明，确认哪些数据会留在本地、哪些会发送给模型服务商。">
                  <div className="settings-security-grid">
                    <StatusTile label="浏览器版" value="IndexedDB" detail="书库与 API Key" />
                    <StatusTile label="桌面版" value="SQLite + Keychain" detail="书库与密钥分离" />
                    <StatusTile label="AI 请求" value="BYOK" detail="发送给所选服务商" />
                  </div>
                  <button type="button" onClick={onOpenPrivacy} className="settings-secondary-button">
                    查看隐私说明
                  </button>
                </SettingsSection>
                <SettingsSection title="BYOK 安全提醒" compact>
                  <div className="settings-copy-stack">
                    <p>
                      浏览器版会把 API Key 保存在当前浏览器 IndexedDB；桌面版会把 API Key 保存在系统 Keychain。
                    </p>
                    <p>
                      桌面版进入设置页时不会自动把已保存密钥读回输入框，避免打开设置页就触发系统密码弹窗。
                    </p>
                    <p>
                      建议使用单独的 API Key，并在模型服务商后台设置额度或限额。自定义 Base URL 时，请确认目标服务可信。
                    </p>
                  </div>
                </SettingsSection>
              </SettingsPanel>
            )}

            {activePanel === "advanced" && (
              <SettingsPanel>
                <SettingsPanelHeader
                  kicker="Maintenance"
                  title="高级维护"
                  desc="低频、不可逆或需要谨慎确认的操作集中放在这里。"
                />
                <SettingsSection title="清空数据" desc="删除所有本地数据，包括书籍、进度、聊天记录和设置。">
                  <div className="settings-danger-zone">
                    <div>
                      <p className="settings-danger-title">清空全部本地数据</p>
                      <p className="settings-note">这个操作无法恢复。建议先完成本地备份。</p>
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
      <span className="settings-nav-dot" />
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
    ["校验", preview.issues?.length ? `${preview.issues.length} 项提示` : "通过"],
    ["manifest", preview.manifestSha256 ? preview.manifestSha256.slice(0, 12) : "旧版未记录"],
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
      ? `已填写新 Key；保存后会更新${storageLabel}中的密钥。`
      : `已填写 Key；保存后会写入${storageLabel}。`
    : hasSavedKey
    ? `已保存 Key（不会显示明文）；留空保存会继续保留。`
    : keyStatusUnknown
    ? "未读取 Keychain，保存状态未知；如果之前保存过 Key，它仍会保留。填写并保存新 Key 后会显示已保存。"
    : "尚未保存 Key。";
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

function assessOpenAICompatibleBaseUrl(value) {
  const text = (value || DEFAULT_OPENAI_COMPATIBLE_BASE_URL).trim();
  let url;

  try {
    url = new URL(text);
  } catch {
    return {
      error: "Base URL 不是有效地址，请使用类似 https://api.openai.com/v1 的完整 URL。",
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
