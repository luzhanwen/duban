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
import { PROVIDERS } from "./storage.js";

export async function callModelDetailed({ settings, system, messages, maxTokens }) {
  if (settings.provider === PROVIDERS.openaiCompatible) {
    return callOpenAICompatibleDetailed({
      ...settings.openaiCompatible,
      system,
      messages,
      maxTokens,
    });
  }

  return callClaudeDetailed({
    ...settings.anthropic,
    system,
    messages,
    maxTokens,
  });
}

export async function streamModelDetailed({
  settings,
  system,
  messages,
  maxTokens,
  onText,
}) {
  if (settings.provider === PROVIDERS.openaiCompatible) {
    return streamOpenAICompatibleDetailed({
      ...settings.openaiCompatible,
      system,
      messages,
      maxTokens,
      onText,
    });
  }

  return streamClaudeDetailed(
    {
      ...settings.anthropic,
      system,
      messages,
      maxTokens,
    },
    onText
  );
}

export async function testModelConnection(settings) {
  if (settings.provider === PROVIDERS.openaiCompatible) {
    return testOpenAICompatibleConnection(settings.openaiCompatible);
  }

  return testClaudeConnection(settings.anthropic);
}
