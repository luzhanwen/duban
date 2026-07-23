import { flushSync } from "react-dom";
import { isTauriRuntime } from "./runtime.js";

let activeTransition = null;
let fallbackTimer = null;

export function runCompanionTransition(update, { name = "scene" } = {}) {
  if (typeof update !== "function") return null;
  if (typeof document === "undefined" || prefersReducedMotion()) {
    update();
    return null;
  }

  const root = document.documentElement;
  cancelCompanionTransition();
  root.dataset.companionTransition = name;

  if (shouldUseNativeCompanionTransition()) {
    const transition = document.startViewTransition(() => flushSync(update));
    activeTransition = transition;
    Promise.resolve(transition.finished)
      .catch(() => {})
      .finally(() => {
        if (activeTransition !== transition) return;
        activeTransition = null;
        delete root.dataset.companionTransition;
      });
    return transition;
  }

  flushSync(update);
  root.classList.remove("companion-transition-fallback");
  void root.offsetWidth;
  root.classList.add("companion-transition-fallback");
  if (fallbackTimer) window.clearTimeout(fallbackTimer);
  fallbackTimer = window.setTimeout(() => {
    root.classList.remove("companion-transition-fallback");
    delete root.dataset.companionTransition;
    fallbackTimer = null;
  }, 360);
  return null;
}

export function shouldUseNativeCompanionTransition({
  tauri = isTauriRuntime(),
  nativeApiAvailable =
    typeof document !== "undefined" && typeof document.startViewTransition === "function",
} = {}) {
  return !tauri && nativeApiAvailable;
}

export function cancelCompanionTransition() {
  activeTransition?.skipTransition?.();
  activeTransition = null;
  if (fallbackTimer && typeof window !== "undefined") {
    window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("companion-transition-fallback");
    delete document.documentElement.dataset.companionTransition;
  }
}

export function prefersReducedMotion() {
  return Boolean(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
