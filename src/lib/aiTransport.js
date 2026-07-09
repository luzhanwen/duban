import {
  callClaudeDetailed,
  streamClaudeDetailed,
  testConnection as testClaudeConnection,
} from "./claude.js";
import {
  callOpenAICompatibleDetailed,
  streamOpenAICompatibleDetailed,
  testOpenAICompatibleConnection,
} from "./openaiCompatible.js";
import { getRuntimeInfo, RUNTIME_TARGETS } from "./runtime.js";
import { PROVIDERS } from "./storage.js";
import { tauriAiTransport } from "./tauriAiTransport.js";

export const browserAiTransport = {
  target: RUNTIME_TARGETS.browser,

  callModelDetailed({ settings, system, messages, maxTokens, signal, temperature }) {
    if (settings.provider === PROVIDERS.openaiCompatible) {
      return callOpenAICompatibleDetailed({
        ...settings.openaiCompatible,
        system,
        messages,
        maxTokens,
        signal,
        temperature,
      });
    }

    return callClaudeDetailed({
      ...settings.anthropic,
      system,
      messages,
      maxTokens,
      signal,
      temperature,
    });
  },

  streamModelDetailed({ settings, system, messages, maxTokens, onText, signal, temperature }) {
    if (settings.provider === PROVIDERS.openaiCompatible) {
      return streamOpenAICompatibleDetailed({
        ...settings.openaiCompatible,
        system,
        messages,
        maxTokens,
        onText,
        signal,
        temperature,
      });
    }

    return streamClaudeDetailed(
      {
        ...settings.anthropic,
        system,
        messages,
        maxTokens,
        signal,
        temperature,
      },
      onText
    );
  },

  testModelConnection(settings) {
    if (settings.provider === PROVIDERS.openaiCompatible) {
      return testOpenAICompatibleConnection(settings.openaiCompatible);
    }

    return testClaudeConnection(settings.anthropic);
  },
};

export function getAiTransport(runtime = getRuntimeInfo()) {
  if (runtime.isTauri) {
    return tauriAiTransport;
  }

  return browserAiTransport;
}

export const aiTransport = getAiTransport();
