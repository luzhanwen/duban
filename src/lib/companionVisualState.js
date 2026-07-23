export const COMPANION_VISUAL_STATES = Object.freeze({
  preparing: "preparing",
  quiet: "quiet",
  answering: "answering",
  waiting: "waiting",
  recording: "recording",
  complete: "complete",
  error: "error",
  offline: "offline",
});

const VALID_STATES = new Set(Object.values(COMPANION_VISUAL_STATES));

export const COMPANION_VISUAL_STATE_LABELS = Object.freeze({
  [COMPANION_VISUAL_STATES.preparing]: "正在准备导读",
  [COMPANION_VISUAL_STATES.quiet]: "安静陪读",
  [COMPANION_VISUAL_STATES.answering]: "正在回答",
  [COMPANION_VISUAL_STATES.waiting]: "等待你的下一步",
  [COMPANION_VISUAL_STATES.recording]: "正在保存阅读记录",
  [COMPANION_VISUAL_STATES.complete]: "本次阅读已经完成",
  [COMPANION_VISUAL_STATES.error]: "本次操作没有完成",
  [COMPANION_VISUAL_STATES.offline]: "当前处于离线状态",
});

export function normalizeCompanionVisualState(value) {
  return VALID_STATES.has(value) ? value : COMPANION_VISUAL_STATES.quiet;
}

export function resolveCompanionVisualState({
  online = true,
  error = false,
  activity = COMPANION_VISUAL_STATES.quiet,
} = {}) {
  if (!online) return COMPANION_VISUAL_STATES.offline;
  if (error) return COMPANION_VISUAL_STATES.error;
  return normalizeCompanionVisualState(activity);
}

export function getCompanionVisualStateLabel(state) {
  const normalized = normalizeCompanionVisualState(state);
  return COMPANION_VISUAL_STATE_LABELS[normalized];
}
