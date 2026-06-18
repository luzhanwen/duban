import { aiTransport } from "./aiTransport.js";

export async function callModelDetailed({ settings, system, messages, maxTokens }) {
  return aiTransport.callModelDetailed({ settings, system, messages, maxTokens });
}

export async function streamModelDetailed({
  settings,
  system,
  messages,
  maxTokens,
  onText,
}) {
  return aiTransport.streamModelDetailed({
    settings,
    system,
    messages,
    maxTokens,
    onText,
  });
}

export async function testModelConnection(settings) {
  return aiTransport.testModelConnection(settings);
}
