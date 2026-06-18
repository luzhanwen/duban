export const RUNTIME_TARGETS = {
  browser: "browser",
  tauri: "tauri",
};

export function getRuntimeTarget() {
  return isTauriRuntime() ? RUNTIME_TARGETS.tauri : RUNTIME_TARGETS.browser;
}

export function getRuntimeInfo() {
  const target = getRuntimeTarget();

  return {
    target,
    isBrowser: target === RUNTIME_TARGETS.browser,
    isTauri: target === RUNTIME_TARGETS.tauri,
  };
}

export function isTauriRuntime() {
  const globalScope = globalThis;
  return Boolean(
    globalScope?.__TAURI_INTERNALS__ ||
      globalScope?.__TAURI__?.invoke ||
      globalScope?.window?.__TAURI_INTERNALS__ ||
      globalScope?.window?.__TAURI__?.invoke
  );
}

export const APP_RUNTIME = getRuntimeInfo();
