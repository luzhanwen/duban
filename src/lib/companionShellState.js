export const COMPANION_SHELL_PANELS = Object.freeze([
  "chat",
  "notes",
]);

export const COMPANION_SHELL_ACTIONS = Object.freeze({
  setActivePanel: "set-active-panel",
  setChatDraft: "set-chat-draft",
  setActiveQuote: "set-active-quote",
  setReflectionDraft: "set-reflection-draft",
  setSidebarOpen: "set-sidebar-open",
  setSidebarLayoutInitialized: "set-sidebar-layout-initialized",
  setSessionOverride: "set-session-override",
});

export function createCompanionShellState() {
  return {
    activePanel: "chat",
    chatDraft: "",
    activeQuote: null,
    reflectionDraft: "",
    sidebarOpen: true,
    sidebarLayoutInitialized: false,
    sessionOverride: "default",
  };
}

export function companionShellReducer(state, action) {
  switch (action?.type) {
    case COMPANION_SHELL_ACTIONS.setActivePanel:
      return {
        ...state,
        activePanel: normalizePanel(action.value),
      };
    case COMPANION_SHELL_ACTIONS.setChatDraft:
      return {
        ...state,
        chatDraft: text(action.value),
      };
    case COMPANION_SHELL_ACTIONS.setActiveQuote:
      return {
        ...state,
        activeQuote: normalizeQuote(action.value),
      };
    case COMPANION_SHELL_ACTIONS.setReflectionDraft:
      return {
        ...state,
        reflectionDraft: text(action.value),
      };
    case COMPANION_SHELL_ACTIONS.setSidebarOpen:
      return {
        ...state,
        sidebarOpen: Boolean(action.value),
      };
    case COMPANION_SHELL_ACTIONS.setSidebarLayoutInitialized:
      return {
        ...state,
        sidebarLayoutInitialized: Boolean(action.value),
      };
    case COMPANION_SHELL_ACTIONS.setSessionOverride:
      return {
        ...state,
        sessionOverride: text(action.value) || "default",
      };
    default:
      return state;
  }
}

function normalizePanel(value) {
  return COMPANION_SHELL_PANELS.includes(value) ? value : "chat";
}

function normalizeQuote(value) {
  if (!value?.text) return null;
  return {
    ...value,
    text: text(value.text).trim(),
  };
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
