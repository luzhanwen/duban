import assert from "node:assert/strict";
import { invokeCancellableAiCommand } from "../src/lib/tauriAiTransport.js";

const calls = [];
const invoke = (command, args) => {
  calls.push({ command, args });
  if (command === "duban_ai_cancel_request") {
    return Promise.resolve({ cancelled: true });
  }
  return new Promise(() => {});
};
const controller = new AbortController();
const pending = invokeCancellableAiCommand({
  invoke,
  command: "duban_ai_call_model",
  args: { request: {} },
  requestId: "request-test",
  signal: controller.signal,
});

controller.abort();
await assert.rejects(
  pending,
  (error) => error?.name === "AbortError" && error?.code === "AI_REQUEST_CANCELLED"
);
assert.equal(calls[0].command, "duban_ai_call_model");
assert.deepEqual(calls[1], {
  command: "duban_ai_cancel_request",
  args: { requestId: "request-test" },
});

const success = await invokeCancellableAiCommand({
  invoke: async (command, args) => ({ command, args }),
  command: "duban_ai_call_model",
  args: { request: { maxTokens: 10 } },
  requestId: "request-success",
});
assert.equal(success.command, "duban_ai_call_model");

console.log("Tauri AI cancellation tests passed.");
