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

export function getLocalFileAssetUrl(file) {
  const localPath = getLocalFilePath(file);
  if (!localPath) return "";

  const tauriInternals = globalThis.window?.__TAURI_INTERNALS__;
  if (tauriInternals?.convertFileSrc) {
    return tauriInternals.convertFileSrc(localPath, "asset");
  }

  return "";
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
  const url = await resolveLocalFileAssetUrl(file);
  if (isCustomAssetProtocolUrl(url)) {
    return readCustomAssetUrl(url, "arraybuffer", options.signal);
  }

  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error("读取本地书籍文件失败。");
  return response.arrayBuffer();
}

async function readLocalFileAsText(file) {
  const url = await resolveLocalFileAssetUrl(file);
  if (isCustomAssetProtocolUrl(url)) {
    return readCustomAssetUrl(url, "text");
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error("读取本地文本文件失败。");
  return response.text();
}

function isCustomAssetProtocolUrl(url) {
  return typeof url === "string" && url.startsWith("asset:");
}

function readCustomAssetUrl(url, responseType, signal) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const cleanup = () => signal?.removeEventListener("abort", handleAbort);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () => {
      if (settled) return;
      request.onabort = null;
      request.abort();
      finish(() => {
        const error = new Error("读取本地书籍文件已取消。");
        error.name = "AbortError";
        reject(error);
      });
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    request.open("GET", url, true);
    request.responseType = responseType;
    request.onload = () => {
      const acceptedStatus = request.status === 0 || (request.status >= 200 && request.status < 300);
      const value = responseType === "arraybuffer" ? request.response : request.responseText;
      if (!acceptedStatus || value === null || value === undefined) {
        finish(() => reject(new Error("读取本地书籍文件失败。")));
        return;
      }
      finish(() => resolve(value));
    };
    request.onerror = () => finish(() => reject(new Error("读取本地书籍文件失败。")));
    request.onabort = () => finish(() => {
      const error = new Error("读取本地书籍文件已取消。");
      error.name = "AbortError";
      reject(error);
    });
    signal?.addEventListener("abort", handleAbort, { once: true });
    request.send();
  });
}

async function resolveLocalFileAssetUrl(file) {
  const localPath = getLocalFilePath(file);
  if (!localPath) throw new Error("本地文件引用无效，请重新导入。");

  const directUrl = getLocalFileAssetUrl(file);
  if (directUrl) return directUrl;

  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(localPath, "asset");
}
