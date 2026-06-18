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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h2 className="font-serif text-2xl text-ink">设置</h2>
      <p className="mt-2 text-sm text-ink-soft">
        配置默认模型供应商。浏览器版 API Key 保存在本机 IndexedDB；桌面版 API Key 保存在系统 Keychain。
      </p>

      <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900">
        <h3 className="font-medium">BYOK 安全提醒</h3>
        <p className="mt-2">
          浏览器版会把 API Key 保存在当前浏览器 IndexedDB；桌面版会把 API Key 保存在系统 Keychain。
          测试连接或生成内容时，Key 会发送给你选择的模型服务商。
        </p>
        <p className="mt-2">
          桌面版进入设置页时不会自动把已保存的 Keychain 密钥读回输入框，避免一打开设置就触发系统密码弹窗；输入框留空保存不会覆盖已有密钥，填写新 Key 后保存才会更新。
          如果本机已经保存过 Key，输入框下方会显示保存状态。
        </p>
        <p className="mt-2">
          建议使用单独的 API Key，并在模型服务商后台设置额度或限额。自定义 Base URL 时，请确认目标服务可信。
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-paper-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">隐私与数据</h3>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              查看书籍、API Key、笔记和聊天记录分别存在哪里，以及什么时候会发送给模型服务商。
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
          >
            查看隐私说明
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-paper-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">本地备份</h3>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              导出书库、原始文件、分页文本、阅读进度、导读、笔记和聊天记录；备份不包含 API Key。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleBackupFileChange}
            />
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={backupBusy}
              className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {desktopBackupAvailable ? "导出目录备份" : "导出 JSON 备份"}
            </button>
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              disabled={backupBusy}
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper disabled:opacity-50"
            >
              导入 JSON
            </button>
            {desktopBackupAvailable && (
              <button
                type="button"
                onClick={() => refreshDesktopBackups()}
                disabled={backupBusy}
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper disabled:opacity-50"
              >
                刷新清单
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink-soft">
            导入模式
            <select
              value={backupImportMode}
              onChange={(event) => setBackupImportMode(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
            >
              <option value="merge">合并导入</option>
              <option value="replace">覆盖恢复</option>
            </select>
          </label>
          {desktopBackupAvailable && (
            <label className="block text-xs font-medium text-ink-soft">
              桌面备份清单
              <select
                value={selectedBackupId}
                onChange={(event) => handleSelectBackup(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
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

        {desktopBackupAvailable && backupPreview && (
          <div className="mt-4 rounded-lg border border-line bg-paper px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-ink">
                  {backupPreview.label || "导入前预览"}
                </p>
                <p className="mt-1 break-all text-xs leading-5 text-ink-soft">
                  {backupPreview.path}
                </p>
                {backupPreview.notes && (
                  <p className="mt-1 text-xs leading-5 text-ink-soft">{backupPreview.notes}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleEditBackupMetadata}
                  disabled={backupBusy}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper disabled:opacity-50"
                >
                  名称/备注
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedBackup}
                  disabled={backupBusy}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper disabled:opacity-50"
                >
                  删除
                </button>
                <button
                  type="button"
                  onClick={handleImportSelectedBackup}
                  disabled={
                    backupBusy || backupPreview.issues.some((issue) => issue.severity === "error")
                  }
                  className="rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper disabled:opacity-50"
                >
                  {backupImportMode === "merge" ? "合并导入此备份" : "覆盖恢复此备份"}
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-ink-soft sm:grid-cols-3">
              <p>书籍：{backupPreview.bookCount}</p>
              <p>文件：{backupPreview.fileCount}</p>
              <p>页文本：{backupPreview.pageCount}</p>
              <p>进度：{backupPreview.progressCount}</p>
              <p>导读：{backupPreview.guideCount}</p>
              <p>笔记：{backupPreview.noteCount}</p>
              <p>聊天：{backupPreview.chatCount}</p>
              <p>读后交流：{backupPreview.reflectionCount}</p>
              <p>校验：{backupPreview.issues.length ? `${backupPreview.issues.length} 项提示` : "通过"}</p>
              <p>
                manifest：{backupPreview.manifestSha256 ? backupPreview.manifestSha256.slice(0, 12) : "旧版未记录"}
              </p>
            </div>
            {backupPreview.issues.length > 0 && (
              <div className="mt-3 space-y-1 text-xs leading-5">
                {backupPreview.issues.slice(0, 6).map((issue) => (
                  <p
                    key={`${issue.code}:${issue.key || "global"}`}
                    className={issue.severity === "error" ? "text-red-600" : "text-amber-700"}
                  >
                    {issue.message}
                    {issue.key ? `（${issue.key}）` : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {desktopBackupAvailable && (
          <div className="mt-4 rounded-lg border border-line bg-paper px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-xs font-medium text-ink-soft">
                外部备份目录或 manifest.json 路径
                <input
                  value={externalBackupPath}
                  onChange={(event) => {
                    setExternalBackupPath(event.target.value);
                    setExternalBackupPreview(null);
                  }}
                  placeholder="例如 ~/Downloads/duban-backup-..."
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
                />
              </label>
              <button
                type="button"
                onClick={handlePreviewExternalBackup}
                disabled={backupBusy}
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper disabled:opacity-50"
              >
                预览外部备份
              </button>
            </div>

            {externalBackupPreview && (
              <div className="mt-3 rounded-lg border border-line bg-paper-card px-3 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {externalBackupPreview.label || "外部备份预览"}
                    </p>
                    <p className="mt-1 break-all text-xs leading-5 text-ink-soft">
                      {externalBackupPreview.path}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleImportExternalBackup}
                    disabled={
                      backupBusy ||
                      externalBackupPreview.issues.some((issue) => issue.severity === "error")
                    }
                    className="rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper disabled:opacity-50"
                  >
                    {backupImportMode === "merge" ? "合并导入外部备份" : "覆盖恢复外部备份"}
                  </button>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-ink-soft sm:grid-cols-3">
                  <p>书籍：{externalBackupPreview.bookCount}</p>
                  <p>文件：{externalBackupPreview.fileCount}</p>
                  <p>页文本：{externalBackupPreview.pageCount}</p>
                  <p>
                    校验：
                    {externalBackupPreview.issues.length
                      ? `${externalBackupPreview.issues.length} 项提示`
                      : "通过"}
                  </p>
                  <p>
                    manifest：
                    {externalBackupPreview.manifestSha256
                      ? externalBackupPreview.manifestSha256.slice(0, 12)
                      : "旧版未记录"}
                  </p>
                </div>
                {externalBackupPreview.issues.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs leading-5">
                    {externalBackupPreview.issues.slice(0, 6).map((issue) => (
                      <p
                        key={`${issue.code}:${issue.key || "global"}`}
                        className={issue.severity === "error" ? "text-red-600" : "text-amber-700"}
                      >
                        {issue.message}
                        {issue.key ? `（${issue.key}）` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <p className="mt-3 text-xs leading-5 text-ink-soft">
          桌面版导出为目录式备份，manifest 与原始文件分开保存到 App 数据目录的 backups 文件夹；导入前会校验 manifest 和文件 hash，失败会自动回滚到导入前状态。导入不会从备份恢复 API Key。
        </p>
        {backupMsg && <Hint msg={backupMsg} />}
      </section>

      <section className="mt-8 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
        <label className="block text-sm font-medium text-ink">
          默认模型供应商
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs leading-5 text-ink-soft">
          {PROVIDER_OPTIONS.find((option) => option.value === provider)?.desc}
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">AI 批量配置</h3>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              模板已预填常用供应商，只需要粘贴要使用的 API Key。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={configInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={handleConfigFileChange}
            />
            <button
              type="button"
              onClick={() => configInputRef.current?.click()}
              className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
            >
              导入 TXT 配置
            </button>
            <a
              href="/ai-config-template.txt"
              download
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
            >
              下载模板
            </a>
            <button
              type="button"
              onClick={handleDownloadCurrentConfig}
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
            >
              下载当前配置
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-ink-soft">
          导入会立即保存到本地；如果配置里包含非官方 Base URL，会先要求确认。下载当前配置会包含 API Key，请只保存在可信位置。
        </p>
        {configMsg && <Hint msg={configMsg} />}
      </section>

      {provider === PROVIDERS.anthropic ? (
        <AnthropicSettings
          apiKey={anthropicApiKey}
          hasSavedKey={anthropicHasApiKey}
          keyStatusUnknown={desktopBackupAvailable && !anthropicHasApiKey}
          storageLabel={desktopBackupAvailable ? "系统 Keychain" : "IndexedDB"}
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
          storageLabel={desktopBackupAvailable ? "系统 Keychain" : "IndexedDB"}
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

      <p className="mt-4 rounded-lg border border-line bg-paper-card px-4 py-3 text-xs leading-5 text-ink-soft">
        纯前端直连 OpenAI-compatible 服务时，部分服务可能因为 CORS 策略无法在浏览器中调用。
        如果填写自定义 Base URL，测试连接和生成内容时会把 API Key 发送到该地址；读伴只会对非官方或非 HTTPS 地址做二次确认，无法替你判断服务商可信度。
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
        >
          保存设置
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper disabled:opacity-50"
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
      </div>

      {saveMsg && <Hint msg={saveMsg} />}
      {testMsg && <Hint msg={testMsg} />}

      <section className="mt-12 rounded-xl border border-line p-6">
        <h3 className="text-sm font-medium text-ink">清空数据</h3>
        <p className="mt-1 text-xs text-ink-soft">
          删除所有本地数据（书籍、进度、聊天、设置），无法恢复。
        </p>
        <button
          onClick={handleClearAll}
          className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          清空全部数据
        </button>
      </section>
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
    <>
      <section className="mt-6 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
        <label className="block text-sm font-medium text-ink">Anthropic API Key</label>
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
      </section>

      <section className="mt-6 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
        <label className="block text-sm font-medium text-ink">Claude 模型</label>
        <select
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none focus:border-accent"
        >
          {ANTHROPIC_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </section>
    </>
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
    <section className="mt-6 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
      <h3 className="text-sm font-medium text-ink">OpenAI-compatible 配置</h3>

      <label className="mt-5 block text-sm font-medium text-ink">
        模型清单
        <select
          value={selectedModelValue}
          onChange={(event) => onApplyModelOption(event.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
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
      <p className="mt-2 text-xs leading-5 text-ink-soft">
        选择后会自动填充 Base URL、模型名和可用的价格估算；下面仍然可以手动修改。
      </p>

      <label className="mt-5 block text-sm font-medium text-ink">API Key</label>
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Base URL
          <input
            value={baseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            placeholder="https://api.openai.com/v1"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          模型名
          <input
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            placeholder={DEFAULT_OPENAI_COMPATIBLE_MODEL}
            className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          输入价格（美元 / 百万 token，可选）
          <input
            value={inputPricePerMTok}
            onChange={(event) => onInputPriceChange(event.target.value)}
            placeholder="例如 0.15"
            inputMode="decimal"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          输出价格（美元 / 百万 token，可选）
          <input
            value={outputPricePerMTok}
            onChange={(event) => onOutputPriceChange(event.target.value)}
            placeholder="例如 0.60"
            inputMode="decimal"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
          />
        </label>
      </div>
    </section>
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
    <div className="mt-2">
      <div className="flex gap-2">
        <input
          type={showKey ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper"
        >
          {showKey ? "隐藏" : "显示"}
        </button>
      </div>
      <p className={`mt-2 text-xs leading-5 ${statusColor}`}>{statusText}</p>
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
  return <p className={`mt-3 text-sm ${color}`}>{msg.text}</p>;
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
