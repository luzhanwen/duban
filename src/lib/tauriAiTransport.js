import { RUNTIME_TARGETS } from "./runtime.js";

const STREAM_CHUNK_EVENT = "duban-ai-stream-chunk";

export const tauriAiTransport = {
  target: RUNTIME_TARGETS.tauri,

  async callModelDetailed({ settings, system, messages, maxTokens, signal, temperature }) {
    const { invoke } = await import("@tauri-apps/api/core");
    const requestId = makeRequestId();
    const unbindAbort = bindAbortSignal({ signal, requestId, invoke });
    try {
      return await invoke("duban_ai_call_model", {
        requestId,
        request: buildTauriAiRequest({ settings, system, messages, maxTokens, temperature }),
      });
    } catch (error) {
      throw normalizeTauriError(error);
    } finally {
      unbindAbort();
    }
  },

  async streamModelDetailed({ settings, system, messages, maxTokens, onText, signal, temperature }) {
    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");
    const requestId = makeRequestId();
    const unbindAbort = bindAbortSignal({ signal, requestId, invoke });
    const unlistenChunk = await listen(STREAM_CHUNK_EVENT, (event) => {
      const payload = event.payload || {};
      if (payload.requestId !== requestId) return;
      if (payload.text) onText?.(payload.text);
    });

    try {
      return await invoke("duban_ai_stream_model", {
        requestId,
        request: buildTauriAiRequest({ settings, system, messages, maxTokens, temperature }),
      });
    } catch (error) {
      throw normalizeTauriError(error);
    } finally {
      unbindAbort();
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

function buildTauriAiRequest({ settings, system, messages, maxTokens, temperature }) {
  return {
    settings,
    system,
    messages,
    maxTokens,
    temperature,
  };
}

function normalizeTauriError(error) {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);

  const message = error?.message || "Tauri 后端请求失败，请稍后重试。";
  const normalized =
    error?.code === "AI_REQUEST_CANCELLED" ? makeAbortError(message) : new Error(message);
  if (error && typeof error === "object") {
    normalized.code = error.code || "";
    normalized.kind = error.kind || "";
    normalized.retryable = Boolean(error.retryable);
    normalized.status = error.status ?? null;
  }
  return normalized;
}

function bindAbortSignal({ signal, requestId, invoke }) {
  if (!signal) return () => {};
  if (signal.aborted) throw makeAbortError();

  const cancel = () => {
    invoke("duban_ai_cancel_request", { requestId }).catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  return () => signal.removeEventListener("abort", cancel);
}

function makeAbortError(message = "已取消生成。") {
  const error = new Error(message);
  error.name = "AbortError";
  error.code = "AI_REQUEST_CANCELLED";
  error.kind = "cancelled";
  error.retryable = false;
  error.status = null;
  return error;
}

function makeRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
