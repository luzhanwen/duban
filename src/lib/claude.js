// ============================================================
// Claude API 封装：浏览器直连 Anthropic 接口（BYOK 模式，无后端）。
//
// 关键点：
//   1. 必须带上 anthropic-dangerous-direct-browser-access 头，否则会被 CORS 拦截。
//   2. API Key 是用户自带的，只存在本地，绝不写进代码。
//   3. 把各种错误（Key 无效、限流、网络失败）翻译成清晰的中文提示。
// ============================================================

import { isAiOutputTruncated } from "./aiCompletion.js";

const API_URL = "https://api.anthropic.com/v1/messages";

// Anthropic 接口要求的固定请求头（不含 apiKey，调用时再拼上）
function buildHeaders(apiKey) {
  return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    // 浏览器直连必须带这个头，声明「我知道这是在浏览器里直接调用」
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

// ------------------------------------------------------------
// 把 HTTP 错误状态码 / 网络异常翻译成中文提示
// ------------------------------------------------------------
function humanizeError(status, message) {
  // 优先使用接口返回的具体错误信息
  switch (status) {
    case 401:
      return "API Key 无效或未授权，请检查设置里的 Key 是否正确。";
    case 403:
      return "无权访问（403）。请确认这个 Key 有调用权限。";
    case 429:
      return "请求过于频繁或额度不足（429），请稍后再试，或检查账户额度。";
    case 500:
    case 529:
      return "Anthropic 服务暂时不可用，请稍后重试。";
    default:
      if (message) return message;
      return `请求失败：${status}`;
  }
}

// ------------------------------------------------------------
// 非流式调用：一次性拿到完整结果。
// 用于导读问题、理解小测、选中文字解释等「生成一次即可」的任务。
// ------------------------------------------------------------
export async function callClaude({
  apiKey,
  model,
  system,
  messages,
  maxTokens = 1024,
}) {
  const result = await callClaudeDetailed({
    apiKey,
    model,
    system,
    messages,
    maxTokens,
  });
  return result.text;
}

export async function callClaudeDetailed({
  apiKey,
  model,
  system,
  messages,
  maxTokens = 1024,
  signal,
  temperature,
}) {
  if (!apiKey) throw new Error("请先到「设置」里填写 API Key。");

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(buildClaudeBody({ model, maxTokens, system, messages, temperature })),
      signal,
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    // fetch 抛异常通常是网络问题（断网、被拦截等）
    throw new Error("网络请求失败，请检查网络连接后重试。");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(humanizeError(res.status, err?.error?.message));
  }

  const data = await res.json();
  // content 是一个块数组，这里把所有文本块拼成一个字符串返回
  return {
    text: data.content.map((b) => (b.type === "text" ? b.text : "")).join(""),
    usage: data.usage || null,
    model: data.model || model,
    id: data.id,
    finishReason: data.stop_reason || "",
    truncated: isAiOutputTruncated(data.stop_reason || ""),
  };
}

// ------------------------------------------------------------
// 流式调用：解析 SSE，逐字回调输出。
// 用于自由问答聊天，实现「逐字蹦出」的效果。
//
// 参数 onText(deltaText) 会在每次收到新增文本时被调用。
// 返回完整的拼接文本。
// ------------------------------------------------------------
export async function streamClaude(
  { apiKey, model, system, messages, maxTokens = 1024 },
  onText
) {
  const result = await streamClaudeDetailed(
    { apiKey, model, system, messages, maxTokens },
    onText
  );
  return result.text;
}

export async function streamClaudeDetailed(
  { apiKey, model, system, messages, maxTokens = 1024, signal, temperature },
  onText
) {
  if (!apiKey) throw new Error("请先到「设置」里填写 API Key。");

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(
        buildClaudeBody({ model, maxTokens, system, messages, temperature, stream: true })
      ),
      signal,
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new Error("网络请求失败，请检查网络连接后重试。");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(humanizeError(res.status, err?.error?.message));
  }

  // 读取响应体的字节流，按行解析 SSE 事件
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";
  let usage = null;
  let responseModel = model;
  let id = "";
  let finishReason = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // SSE 以空行分隔事件，这里按行处理
    const lines = buffer.split("\n");
    // 最后一行可能不完整，留到下一次拼接
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue; // 只关心 data: 行
      const payload = trimmed.slice("data:".length).trim();
      if (payload === "[DONE]") continue;

      try {
        const event = JSON.parse(payload);
        if (event.type === "message_start") {
          usage = event.message?.usage || usage;
          responseModel = event.message?.model || responseModel;
          id = event.message?.id || id;
        }
        if (event.type === "message_delta") {
          finishReason = event.delta?.stop_reason || finishReason;
          usage = { ...(usage || {}), ...(event.usage || {}) };
        }
        // 我们只关心「文本增量」事件
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta"
        ) {
          const piece = event.delta.text || "";
          full += piece;
          if (onText) onText(piece);
        }
        // 服务端在流中报错时也会推一个 error 事件
        if (event.type === "error") {
          throw new Error(event.error?.message || "流式响应出错。");
        }
      } catch (e) {
        // 单个事件解析失败不致命，但 error 事件抛出的错误要往上传
        if (e instanceof Error && e.message && !e.message.includes("JSON")) {
          throw e;
        }
      }
    }
  }

  return {
    text: full,
    usage,
    model: responseModel,
    id,
    finishReason,
    truncated: isAiOutputTruncated(finishReason),
  };
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function buildClaudeBody({ model, maxTokens, system, messages, temperature, stream = false }) {
  const body = { model, max_tokens: maxTokens, system, messages };
  const normalizedTemperature = normalizeTemperature(temperature);
  if (normalizedTemperature !== null) body.temperature = normalizedTemperature;
  if (stream) body.stream = true;
  return body;
}

function normalizeTemperature(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(1, Math.max(0, number));
}

// ------------------------------------------------------------
// 测试连接：发一条极短的消息，验证 Key 是否可用。
// 成功返回 true，失败抛出带中文提示的错误。
// ------------------------------------------------------------
export async function testConnection({ apiKey, model }) {
  await callClaude({
    apiKey,
    model,
    messages: [{ role: "user", content: "ping" }],
    maxTokens: 16,
  });
  return true;
}
