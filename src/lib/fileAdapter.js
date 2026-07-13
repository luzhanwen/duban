import { getRuntimeInfo, RUNTIME_TARGETS } from "./runtime.js";

export const browserFileAdapter = {
  target: RUNTIME_TARGETS.browser,

  readAsArrayBuffer(file, options = {}) {
    if (isLocalFileRef(file)) return readLocalFileAsArrayBuffer(file, options);
    assertFileMethod(file, "arrayBuffer");
    return file.arrayBuffer();
  },

  readAsText(file) {
    if (isLocalFileRef(file)) return readLocalFileAsText(file);
    assertFileMethod(file, "text");
    return file.text();
  },

  async fetchAsFile(url, fileName, options = {}) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(options.errorMessage || "文件读取失败。");
    }

    const blob = await response.blob();
    return new File([blob], fileName, {
      type: options.type || blob.type || "",
    });
  },

  downloadText({ fileName, text, type = "text/plain;charset=utf-8" }) {
    if (typeof document === "undefined") {
      throw new Error("当前运行环境不支持浏览器下载。");
    }

    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};

export function getFileAdapter(runtime = getRuntimeInfo()) {
  if (runtime.isTauri) {
    return browserFileAdapter;
  }

  return browserFileAdapter;
}

export const fileAdapter = getFileAdapter();

export function readFileAsArrayBuffer(file, options) {
  return fileAdapter.readAsArrayBuffer(file, options);
}

export function readTextFile(file) {
  return fileAdapter.readAsText(file);
}

export function fetchFileFromUrl(url, fileName, options) {
  return fileAdapter.fetchAsFile(url, fileName, options);
}

export function downloadTextFile(options) {
  return fileAdapter.downloadText(options);
}

function assertFileMethod(file, methodName) {
  if (!file || typeof file[methodName] !== "function") {
    throw new Error("文件对象无效，请重新选择文件。");
  }
}

function isLocalFileRef(file) {
  return Boolean(getLocalFilePath(file));
}

function getLocalFilePath(file) {
  return typeof file?.__dubanLocalFilePath === "string" ? file.__dubanLocalFilePath : "";
}

async function readLocalFileAsArrayBuffer(file, options = {}) {
  const localPath = getLocalFilePath(file);
  if (!localPath) throw new Error("本地文件引用无效，请重新导入。");
  if (options.signal?.aborted) throw createLocalFileAbortError();

  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(localPath);
    if (options.signal?.aborted) throw createLocalFileAbortError();
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new Error("本地书籍文件为空。请重新导入。");
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("读取本地书籍文件失败，请确认文件仍在书库中。", { cause: error });
  }
}

async function readLocalFileAsText(file) {
  const localPath = getLocalFilePath(file);
  if (!localPath) throw new Error("本地文件引用无效，请重新导入。");

  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    return await readTextFile(localPath);
  } catch (error) {
    throw new Error("读取本地文本文件失败，请确认文件仍在书库中。", { cause: error });
  }
}

function createLocalFileAbortError() {
  const error = new Error("读取本地书籍文件已取消。");
  error.name = "AbortError";
  return error;
}
