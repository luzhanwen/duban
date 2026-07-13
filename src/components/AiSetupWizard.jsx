import { useEffect, useRef, useState } from "react";
import { testModelConnection } from "../lib/ai.js";
import { APP_RUNTIME } from "../lib/runtime.js";
import {
  DEFAULT_ANTHROPIC_MODEL,
  getSettings,
  normalizeSettings,
  PROVIDERS,
  saveSettings,
} from "../lib/storage.js";
import ChineseIcon from "./ChineseIcon.jsx";
import BrandLogo from "./BrandLogo.jsx";

const DEEPSEEK_PRESET = {
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  inputPricePerMTok: "0.14",
  outputPricePerMTok: "0.28",
};

const SERVICE_OPTIONS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    model: "DeepSeek Flash",
    description: "响应快、费用低，适合作为读伴的日常默认模型。",
    recommended: true,
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    model: "Claude Sonnet",
    description: "适合长文本理解，也可以稍后在设置中切换模型。",
    recommended: false,
  },
];

export default function AiSetupWizard({
  initialSettings,
  onComplete,
  onDismiss,
  transitioningFromSplash = false,
}) {
  const keyInputRef = useRef(null);
  const [step, setStep] = useState(0);
  const [service, setService] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !testing && step < 3) onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss, step, testing]);

  useEffect(() => {
    if (step === 2) keyInputRef.current?.focus();
  }, [step]);

  function selectService(nextService) {
    setService(nextService);
    setApiKey("");
    setMessage(null);
  }

  function goToKeyStep() {
    setMessage(null);
    setStep(2);
  }

  async function handleValidateAndSave() {
    const key = apiKey.trim();
    if (!key) {
      setMessage({ type: "error", text: "请先填写 API Key。" });
      keyInputRef.current?.focus();
      return;
    }

    setTesting(true);
    setMessage({ type: "progress", text: "正在验证模型连接…" });
    try {
      const current = normalizeSettings(initialSettings || (await getSettings()));
      const nextSettings = buildWizardSettings(current, { service, apiKey: key });
      await testModelConnection(nextSettings);
      await saveSettings(nextSettings);
      setApiKey("");
      setShowKey(false);
      setMessage(null);
      setStep(3);
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "连接失败，请检查 API Key 和网络后重试。",
      });
    } finally {
      setTesting(false);
    }
  }

  const selectedService = SERVICE_OPTIONS.find((option) => option.id === service);
  const storageName = APP_RUNTIME.isTauri ? "系统钥匙串" : "当前浏览器";

  return (
    <div
      className={`ai-setup-backdrop ${transitioningFromSplash ? "is-splash-transition" : ""}`}
      role="presentation"
    >
      <section
        className="ai-setup-dialog literary-ui"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-setup-title"
        aria-describedby="ai-setup-description"
      >
        {step > 0 && step < 3 && (
          <button
            type="button"
            className="ai-setup-close"
            onClick={onDismiss}
            disabled={testing}
            aria-label="稍后设置 AI"
            title="稍后设置"
          >
            ×
          </button>
        )}

        <header className={`ai-setup-header ${step === 0 ? "is-welcome" : ""}`}>
          <div className={`ai-setup-mark ${step === 0 ? "is-welcome" : ""}`} aria-hidden="true">
            {step === 0 ? (
              <BrandLogo
                variant="compact"
                className="ai-setup-compact-brand"
                markClassName="ai-setup-welcome-logo"
              />
            ) : (
              <ChineseIcon name={step === 3 ? "shield" : "ink"} className="h-5 w-5" decorative />
            )}
          </div>
          <div>
            <p className="ai-setup-kicker">{step === 0 ? "读伴" : "首次设置"}</p>
            <h2 id="ai-setup-title">
              {step === 0 && "你好，欢迎使用读伴"}
              {step === 1 && "连接你的 AI 服务"}
              {step === 2 && `填写 ${selectedService.label} API Key`}
              {step === 3 && "读伴已经准备好了"}
            </h2>
            <p id="ai-setup-description">
              {step === 0 && "开始使用前，请先连接一个 AI 服务。"}
              {step === 1 && "先选择一个模型服务，之后随时可以在设置中更换。"}
              {step === 2 && `验证成功后，密钥会保存在${storageName}。`}
              {step === 3 && `${selectedService.model} 已连接，导读和问答现在可以使用。`}
            </p>
          </div>
        </header>

        {step > 0 && (
          <ol className="ai-setup-steps" aria-label="AI 设置进度">
            {["选择服务", "验证密钥", "完成"].map((label, index) => {
              const number = index + 1;
              return (
                <li
                  key={label}
                  className={number === step ? "is-active" : number < step ? "is-complete" : ""}
                  aria-current={number === step ? "step" : undefined}
                >
                  <span>{number < step ? "✓" : number}</span>
                  <small>{label}</small>
                </li>
              );
            })}
          </ol>
        )}

        {step > 0 && <div className="ai-setup-body">
          {step === 1 && (
            <fieldset className="ai-setup-service-list">
              <legend className="sr-only">选择 AI 服务</legend>
              {SERVICE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={`ai-setup-service ${service === option.id ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="ai-service"
                    value={option.id}
                    checked={service === option.id}
                    onChange={() => selectService(option.id)}
                  />
                  <span className="ai-setup-radio" aria-hidden="true" />
                  <span className="ai-setup-service-copy">
                    <strong>
                      {option.label}
                      {option.recommended && <em>推荐</em>}
                    </strong>
                    <span>{option.model}</span>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {step === 2 && (
            <div className="ai-setup-key-step">
              <div className="ai-setup-selection-summary">
                <span>当前服务</span>
                <strong>{selectedService.model}</strong>
                <button type="button" onClick={() => setStep(1)} disabled={testing}>
                  更换
                </button>
              </div>

              <div className="ai-setup-key-field">
                <label htmlFor="ai-setup-api-key">API Key</label>
                <div>
                  <input
                    id="ai-setup-api-key"
                    ref={keyInputRef}
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setMessage(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !testing) handleValidateAndSave();
                    }}
                    placeholder="sk-..."
                    autoComplete="off"
                    spellCheck="false"
                    disabled={testing}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    disabled={testing}
                  >
                    {showKey ? "隐藏" : "显示"}
                  </button>
                </div>
              </div>

              <div className="ai-setup-privacy-note">
                <ChineseIcon name="shield" className="h-4 w-4" decorative />
                <p>
                  连接测试会把 API Key 和一条测试消息发送给 {selectedService.label}；读伴不会把密钥写入备份或诊断日志。
                </p>
              </div>

              {message && (
                <p
                  className={`ai-setup-message is-${message.type}`}
                  role={message.type === "error" ? "alert" : "status"}
                >
                  {message.text}
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="ai-setup-success">
              <span className="ai-setup-success-icon" aria-hidden="true">✓</span>
              <strong>连接验证通过</strong>
              <p>默认模型已设为 {selectedService.model}，以后可以在“设置 → AI 服务”中调整。</p>
            </div>
          )}
        </div>}

        <footer className="ai-setup-actions">
          {step === 0 && (
            <>
              <button type="button" className="ai-setup-secondary" onClick={onDismiss}>
                稍后设置
              </button>
              <button type="button" className="ai-setup-primary" onClick={() => setStep(1)}>
                开始设置
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <button type="button" className="ai-setup-secondary" onClick={onDismiss}>
                稍后设置
              </button>
              <button type="button" className="ai-setup-primary" onClick={goToKeyStep}>
                下一步
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button
                type="button"
                className="ai-setup-secondary"
                onClick={() => setStep(1)}
                disabled={testing}
              >
                上一步
              </button>
              <button
                type="button"
                className="ai-setup-primary"
                onClick={handleValidateAndSave}
                disabled={testing || !apiKey.trim()}
              >
                {testing ? "正在验证…" : "验证并保存"}
              </button>
            </>
          )}
          {step === 3 && (
            <button type="button" className="ai-setup-primary" onClick={onComplete} autoFocus>
              开始使用
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function buildWizardSettings(current, { service, apiKey }) {
  if (service === "anthropic") {
    return normalizeSettings({
      ...current,
      provider: PROVIDERS.anthropic,
      anthropic: {
        ...current.anthropic,
        apiKey,
        hasApiKey: true,
        model: DEFAULT_ANTHROPIC_MODEL,
      },
    });
  }

  return normalizeSettings({
    ...current,
    provider: PROVIDERS.openaiCompatible,
    openaiCompatible: {
      ...current.openaiCompatible,
      ...DEEPSEEK_PRESET,
      apiKey,
      hasApiKey: true,
    },
  });
}
