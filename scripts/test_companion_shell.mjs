import assert from "node:assert/strict";
import {
  COMPANION_SHELL_ACTIONS,
  companionShellReducer,
  createCompanionShellState,
} from "../src/lib/companionShellState.js";

let state = createCompanionShellState();
assert.deepEqual(state, {
  activePanel: "chat",
  chatDraft: "",
  activeQuote: null,
  reflectionDraft: "",
  sidebarOpen: true,
  sidebarLayoutInitialized: false,
  sessionOverride: "default",
});

state = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setActivePanel,
  value: "notes",
});
state = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setChatDraft,
  value: "  这段话是什么意思？  ",
});
state = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setActiveQuote,
  value: { pageNumber: 6, text: "  歙县  " },
});
state = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setReflectionDraft,
  value: "我留下的判断",
});
state = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setSidebarOpen,
  value: false,
});
state = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setSidebarLayoutInitialized,
  value: true,
});
state = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setSessionOverride,
  value: "concise",
});

assert.equal(state.activePanel, "notes");
assert.equal(state.chatDraft, "  这段话是什么意思？  ");
assert.deepEqual(state.activeQuote, { pageNumber: 6, text: "歙县" });
assert.equal(state.reflectionDraft, "我留下的判断");
assert.equal(state.sidebarOpen, false);
assert.equal(state.sidebarLayoutInitialized, true);
assert.equal(state.sessionOverride, "concise");

const invalidPanelState = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setActivePanel,
  value: "guide",
});
assert.equal(invalidPanelState.activePanel, "chat");

const clearedQuoteState = companionShellReducer(state, {
  type: COMPANION_SHELL_ACTIONS.setActiveQuote,
  value: { text: "" },
});
assert.equal(clearedQuoteState.activeQuote, null);

assert.equal(
  companionShellReducer(state, { type: "unknown-action" }),
  state,
  "未知 action 不应破坏当前会话状态"
);

assert.deepEqual(
  createCompanionShellState(),
  createCompanionShellState(),
  "切换阅读项时应能创建独立的初始 shell 状态"
);

console.log("Companion shell state tests passed.");
