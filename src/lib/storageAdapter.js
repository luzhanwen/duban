import localforage from "localforage";
import { getRuntimeInfo, RUNTIME_TARGETS } from "./runtime.js";
import { createTauriStorageAdapter } from "./tauriStorageAdapter.js";

const browserStore = localforage.createInstance({
  name: "reading-companion",
  storeName: "main",
  description: "读伴的本地数据：书籍、进度、设置、聊天记录等",
});

export const browserStorageAdapter = {
  target: RUNTIME_TARGETS.browser,

  getItem(key) {
    return browserStore.getItem(key);
  },

  setItem(key, value) {
    return browserStore.setItem(key, value);
  },

  removeItem(key) {
    return browserStore.removeItem(key);
  },

  clear() {
    return browserStore.clear();
  },

  keys() {
    return browserStore.keys();
  },
};

export function getStorageAdapter(runtime = getRuntimeInfo()) {
  if (runtime.isTauri) {
    return createTauriStorageAdapter(browserStorageAdapter);
  }

  return browserStorageAdapter;
}

export const storageAdapter = getStorageAdapter();
