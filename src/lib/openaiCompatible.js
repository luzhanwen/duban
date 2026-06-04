const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export async function callOpenAICompatibleDetailed({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model,
  system,
  messages,
  maxTokens = 1024,
}) {
  if (!apiKey) throw new Error("尚未设置 API Key，请先到「设置」里填写。");
  if (!model) throw new Error("尚未设置模型名，请先到「设置」里填写。");

  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const chatMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  const body = {
    model,
    messages: chatMessages,
    ...buildTokenLimitPayload(baseUrl, maxTokens),
  };

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "网络请求失败，或该 OpenAI-compatible 服务不允许浏览器直连（CORS）。如果持续失败，后续需要加本地/后端代理。"
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(humanizeError(res.status, err?.error?.message || err?.message));
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  return {
    text,
    usage: normalizeUsage(data.usage),
    model: data.model || model,
    id: data.id,
    finishReason: data.choices?.[0]?.finish_reason || "",
  };
}

export async function streamOpenAICompatibleDetailed({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model,
  system,
  messages,
  maxTokens = 1024,
  onText,
}) {
  if (!apiKey) throw new Error("尚未设置 API Key，请先到「设置」里填写。");
  if (!model) throw new Error("尚未设置模型名，请先到「设置」里填写。");

  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const chatMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;
  const body = {
    model,
    messages: chatMessages,
    stream: true,
    ...buildTokenLimitPayload(baseUrl, maxTokens),
  };

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "网络请求失败，或该 OpenAI-compatible 服务不允许浏览器直连（CORS）。如果持续失败，后续需要加本地/后端代理。"
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(humanizeError(res.status, err?.error?.message || err?.message));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";
  let responseModel = model;
  let finishReason = "";
  let usage = null;
  let id = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      const dataLines = eventText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));

      for (const line of dataLines) {
        const payload = line.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") continue;

        const event = JSON.parse(payload);
        responseModel = event.model || responseModel;
        id = event.id || id;
        if (event.usage) usage = normalizeUsage(event.usage);

        const choice = event.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const piece = choice?.delta?.content || "";
        if (piece) {
          full += piece;
          onText?.(piece);
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
  };
}

export async function testOpenAICompatibleConnection(config) {
  await callOpenAICompatibleDetailed({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    messages: [{ role: "user", content: "ping" }],
    maxTokens: 16,
  });
  return true;
}

function normalizeBaseUrl(value) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildTokenLimitPayload(baseUrl, maxTokens) {
  if (isKimiBaseUrl(baseUrl)) return { max_completion_tokens: maxTokens };
  return { max_tokens: maxTokens };
}

function isKimiBaseUrl(baseUrl = "") {
  return /moonshot\.cn|platform\.moonshot\.cn|platform\.kimi\.com/i.test(baseUrl);
}

function normalizeUsage(usage) {
  if (!usage) return null;
  return {
    input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    output_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens,
  };
}

function humanizeError(status, message) {
  if (status === 401) return "API Key 无效或未授权，请检查设置里的 Key。";
  if (status === 403) return "无权访问（403）。请确认这个 Key 有调用权限。";
  if (status === 404) return "接口地址或模型不存在（404）。请检查 Base URL 和模型名。";
  if (status === 429) return "请求过于频繁或额度不足（429），请稍后再试或检查账户额度。";
  if (status >= 500) return "模型服务暂时不可用，请稍后重试。";
  return message || `请求失败：${status}`;
}
