import { useEffect, useRef, useState } from "react";
import { testModelConnection } from "../lib/ai.js";
import { buildAiConfigText, parseAiConfigText } from "../lib/aiConfigImport.js";
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
  const confirmedBaseUrlsRef = useRef(new Set());
  const [provider, setProvider] = useState(PROVIDERS.anthropic);
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(DEFAULT_OPENAI_COMPATIBLE_BASE_URL);
  const [openaiModel, setOpenaiModel] = useState(DEFAULT_OPENAI_COMPATIBLE_MODEL);
  const [inputPricePerMTok, setInputPricePerMTok] = useState("");
  const [outputPricePerMTok, setOutputPricePerMTok] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [testMsg, setTestMsg] = useState(null);
  const [configMsg, setConfigMsg] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getSettings().then((settings) => {
      applySettingsToForm(settings);
    });
  }, []);

  function applySettingsToForm(settings) {
    const normalized = normalizeSettings(settings);
    setProvider(normalized.provider);
    setAnthropicApiKey(normalized.anthropic.apiKey);
    setAnthropicModel(normalized.anthropic.model);
    setOpenaiApiKey(normalized.openaiCompatible.apiKey);
    setOpenaiBaseUrl(normalized.openaiCompatible.baseUrl);
    setOpenaiModel(normalized.openaiCompatible.model);
    setInputPricePerMTok(normalized.openaiCompatible.inputPricePerMTok);
    setOutputPricePerMTok(normalized.openaiCompatible.outputPricePerMTok);
  }

  function buildSettings(overrides = {}) {
    return normalizeSettings({
      provider: overrides.provider || provider,
      anthropic: {
        apiKey: anthropicApiKey.trim(),
        model: anthropicModel.trim(),
        ...(overrides.anthropic || {}),
      },
      openaiCompatible: {
        apiKey: openaiApiKey.trim(),
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
      const parsed = parseAiConfigText(await file.text());
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

  async function handleTest() {
    setTestMsg(null);
    const settings = buildSettings();
    const activeKey =
      provider === PROVIDERS.openaiCompatible
        ? settings.openaiCompatible.apiKey
        : settings.anthropic.apiKey;

    if (!activeKey) {
      setTestMsg({ type: "error", text: "请先填写当前供应商的 API Key。" });
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
      await saveSettings(settings);
      await testModelConnection(settings);
      setTestMsg({ type: "ok", text: "连接成功！当前模型配置可正常使用。" });
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
    if (!settings.openaiCompatible.apiKey) return true;

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
        配置默认模型供应商。API Key 只保存在本机浏览器 IndexedDB 中。
      </p>

      <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900">
        <h3 className="font-medium">BYOK 安全提醒</h3>
        <p className="mt-2">
          读伴是纯前端直连模型服务：API Key 会保存在当前浏览器 IndexedDB 中，并在测试连接或生成内容时发送给你选择的模型服务商。
          IndexedDB 不是硬件级安全存储；不可信设备、浏览器扩展、同源脚本或本机恶意软件仍可能读取本地数据。
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
          model={anthropicModel}
          showKey={showKey}
          onApiKeyChange={setAnthropicApiKey}
          onModelChange={setAnthropicModel}
          onToggleKey={() => setShowKey((value) => !value)}
        />
      ) : (
        <OpenAICompatibleSettings
          apiKey={openaiApiKey}
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

function KeyInput({ value, showKey, placeholder, onChange, onToggle }) {
  return (
    <div className="mt-2 flex gap-2">
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

function downloadTextFile({ fileName, text }) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
