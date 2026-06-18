import { RUNTIME_TARGETS } from "./runtime.js";

const STREAM_CHUNK_EVENT = "duban-ai-stream-chunk";

export const tauriAiTransport = {
  target: RUNTIME_TARGETS.tauri,

  async callModelDetailed({ settings, system, messages, maxTokens }) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("duban_ai_call_model", {
      request: buildTauriAiRequest({ settings, system, messages, maxTokens }),
    }).catch((error) => {
      throw new Error(normalizeTauriError(error));
    });
  },

  async streamModelDetailed({ settings, system, messages, maxTokens, onText }) {
    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");
    const requestId = makeRequestId();
    const unlistenChunk = await listen(STREAM_CHUNK_EVENT, (event) => {
      const payload = event.payload || {};
      if (payload.requestId !== requestId) return;
      if (payload.text) onText?.(payload.text);
    });

    try {
      return await invoke("duban_ai_stream_model", {
        requestId,
        request: buildTauriAiRequest({ settings, system, messages, maxTokens }),
      });
    } catch (error) {
      throw new Error(normalizeTauriError(error));
    } finally {
      unlistenChunk();
    }
  },

  async testModelConnection(settings) {
    await tauriAiTransport.callModelDetailed({
      settings,
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 16,
    });
    return true;
  },
};

function buildTauriAiRequest({ settings, system, messages, maxTokens }) {
  return {
    settings,
    system,
    messages,
    maxTokens,
  };
}

function normalizeTauriError(error) {
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  return "Tauri 后端请求失败，请稍后重试。";
}

function makeRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
