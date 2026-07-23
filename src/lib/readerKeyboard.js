const PREVIOUS_PAGE_KEYS = new Set(["ArrowLeft", "PageUp"]);
const NEXT_PAGE_KEYS = new Set(["ArrowRight", "PageDown"]);
const BLOCKED_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "dialog",
  "[role='dialog']",
  "[aria-modal='true']",
].join(", ");

export function getReaderPageKeyDirection(event, { pageMode = false } = {}) {
  if (
    !pageMode ||
    event?.defaultPrevented ||
    event?.isComposing ||
    event?.metaKey ||
    event?.ctrlKey ||
    event?.altKey ||
    isReaderKeyboardBlockedTarget(event?.target)
  ) {
    return 0;
  }

  if (PREVIOUS_PAGE_KEYS.has(event?.key)) return -1;
  if (NEXT_PAGE_KEYS.has(event?.key)) return 1;
  return 0;
}

export function isReaderKeyboardBlockedTarget(target) {
  const element = target?.closest ? target : target?.parentElement;
  return Boolean(element?.closest?.(BLOCKED_TARGET_SELECTOR));
}
