import { downloadTextFile } from "./fileAdapter.js";
import { isTauriRuntime } from "./runtime.js";
import { KEYS, normalizeSettings, storageAdapter } from "./storage.js";

const BACKUP_FORMAT = "duban.local-backup";
const BACKUP_VERSION = 3;
const BROWSER_BACKUP_VERSION = 2;

export async function exportLocalBackup() {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return {
      target: "tauri",
      ...(await invoke("duban_storage_export_backup")),
    };
  }

  const backup = await buildBrowserBackup();
  const text = JSON.stringify(backup, null, 2);
  const fileName = `duban-backup-${safeIsoTimestamp()}.json`;
  downloadTextFile({ fileName, text });
  return {
    target: "browser",
    path: "",
    fileName,
    itemCount: backup.items.length,
    fileCount: backup.files.length,
    byteSize: new Blob([text]).size,
    exportedAt: backup.exportedAt,
    includesApiKeys: backup.includesApiKeys,
  };
}

export async function listLocalBackups() {
  if (!isTauriRuntime()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("duban_storage_list_backups");
}

export async function previewLocalBackup(backupId) {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持按备份目录预览。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("duban_storage_preview_backup", { backupId });
}

export async function importLocalBackupById(backupId, mode = "replace") {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持按备份目录导入。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    target: "tauri",
    ...(await invoke("duban_storage_import_backup_id", {
      request: { backupId, mode },
    })),
  };
}

export async function previewLocalBackupPath(path) {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持预览外部目录备份。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("duban_storage_preview_backup_path", { request: { path } });
}

export async function importLocalBackupPath(path, mode = "replace") {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持导入外部目录备份。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    target: "tauri",
    ...(await invoke("duban_storage_import_backup_path", {
      request: { path, mode },
    })),
  };
}

export async function deleteLocalBackup(backupId) {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持删除目录备份。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("duban_storage_delete_backup", { backupId });
}

export async function updateLocalBackupMetadata(backupId, metadata) {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持更新目录备份信息。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("duban_storage_update_backup_metadata", {
    request: {
      backupId,
      label: metadata?.label || "",
      notes: metadata?.notes || "",
    },
  });
}

export function isDesktopBackupAvailable() {
  return isTauriRuntime();
}

export function previewLocalBackupText(text) {
  const backup = parseBackupText(text);
  return buildBrowserPreview(backup);
}

export async function importLocalBackupText(text, mode = "replace") {
  const backup = parseBackupText(text);

  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return {
      target: "tauri",
      ...(await invoke("duban_storage_import_backup", { backup, mode })),
    };
  }

  return {
    target: "browser",
    ...(await importBrowserBackup(backup, mode)),
  };
}

function parseBackupText(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("备份文件格式异常，请选择有效 JSON 文件。");
  }

  validateBackup(backup);
  return backup;
}

async function buildBrowserBackup() {
  const exportedAt = new Date().toISOString();
  const items = [];
  const files = [];
  const keys = await storageAdapter.keys();

  for (const key of [...keys].sort()) {
    if (shouldSkipBackupKey(key)) continue;
    const value = await storageAdapter.getItem(key);
    if (value === null || value === undefined) continue;

    if (isBlobLike(value)) {
      files.push(await blobToBackupFile(key, value));
      continue;
    }

    items.push({
      key,
      value: sanitizeBackupValue(key, value),
    });
  }

  return {
    format: BACKUP_FORMAT,
    backupVersion: BROWSER_BACKUP_VERSION,
    schemaVersion: "browser-indexeddb",
    exportedAt,
    app: "读伴 · Duban",
    includesApiKeys: false,
    items,
    files,
  };
}

async function importBrowserBackup(backup, mode = "replace") {
  const importMode = mode === "merge" ? "merge" : "replace";
  const preservedSettings = await storageAdapter.getItem(KEYS.settings).catch(() => null);
  const items = [...(backup.items || [])].sort(
    (left, right) => backupKeyPriority(left.key) - backupKeyPriority(right.key)
  );
  const files = [...(backup.files || [])].sort(
    (left, right) => backupKeyPriority(left.key) - backupKeyPriority(right.key)
  );

  if (importMode === "replace") {
    await storageAdapter.clear();
  }

  for (const item of items) {
    if (!item?.key || shouldSkipBackupKey(item.key)) continue;
    const value =
      item.key === KEYS.settings && !backup.includesApiKeys
        ? mergePreservedApiKeys(item.value, preservedSettings)
        : item.value;
    await storageAdapter.setItem(
      item.key,
      importMode === "merge" && item.key === KEYS.books ? await mergeBrowserBooks(value) : value
    );
  }

  for (const file of files) {
    if (!file?.key || shouldSkipBackupKey(file.key)) continue;
    await storageAdapter.setItem(file.key, backupFileToFile(file));
  }

  return {
    itemCount: items.length,
    fileCount: files.length,
    mode: importMode,
    importedAt: new Date().toISOString(),
    schemaVersion: "browser-indexeddb",
  };
}

async function mergeBrowserBooks(incomingBooks) {
  if (!Array.isArray(incomingBooks)) return incomingBooks;
  const existingBooks = await storageAdapter.getItem(KEYS.books).catch(() => []);
  if (!Array.isArray(existingBooks)) return incomingBooks;
  const merged = [...existingBooks];

  for (const incomingBook of incomingBooks) {
    const incomingId = incomingBook?.id;
    if (!incomingId) continue;
    const index = merged.findIndex((book) => book?.id === incomingId);
    if (index >= 0) {
      merged[index] = incomingBook;
    } else {
      merged.push(incomingBook);
    }
  }

  return merged;
}

function buildBrowserPreview(backup) {
  const preview = {
    backupId: "",
    path: "",
    exportedAt: backup.exportedAt || "",
    schemaVersion: backup.schemaVersion || "",
    backupVersion: backup.backupVersion || 0,
    itemCount: backup.items.length,
    fileCount: backup.files.length,
    byteSize: new Blob([JSON.stringify(backup)]).size,
    includesApiKeys: Boolean(backup.includesApiKeys),
    bookCount: 0,
    pageCount: 0,
    progressCount: 0,
    noteCount: 0,
    chatCount: 0,
    reflectionCount: 0,
    guideCount: 0,
    formattedTextCount: 0,
    coverCount: 0,
    issues: [],
  };

  for (const item of backup.items) {
    if (item.key === KEYS.books) {
      preview.bookCount = Array.isArray(item.value) ? item.value.length : 0;
    } else if (/^book:.+:pages$/.test(item.key)) {
      preview.pageCount += Array.isArray(item.value) ? item.value.length : 0;
    } else if (/^progress:/.test(item.key)) {
      preview.progressCount += 1;
    } else if (/^book:.+:notes$/.test(item.key)) {
      preview.noteCount += countGroupedItems(item.value);
    } else if (/^book:.+:chat$/.test(item.key)) {
      preview.chatCount += countGroupedItems(item.value);
    } else if (/^book:.+:reflection$/.test(item.key)) {
      preview.reflectionCount += countGroupedItems(item.value);
    } else if (/^book:.+:questions:/.test(item.key)) {
      preview.guideCount += 1;
    } else if (/^book:.+:cover$/.test(item.key)) {
      preview.coverCount += 1;
    } else if (item.key.includes(":formatted-text:")) {
      preview.formattedTextCount += 1;
    }
  }

  if (backup.includesApiKeys) {
    preview.issues.push({
      severity: "warn",
      code: "includes-api-keys",
      message: "备份声明包含 API Key；导入时会保留本机现有密钥。",
    });
  }

  return preview;
}

function validateBackup(backup) {
  if (!backup || backup.format !== BACKUP_FORMAT) {
    throw new Error("备份文件格式不正确。");
  }
  if (Number(backup.backupVersion) > BACKUP_VERSION) {
    throw new Error("备份文件版本高于当前 App 支持版本，请先升级读伴。");
  }
  if (!Array.isArray(backup.items) || !Array.isArray(backup.files)) {
    throw new Error("备份文件缺少必要的数据段。");
  }
}

function sanitizeBackupValue(key, value) {
  const cloned = JSON.parse(JSON.stringify(value));
  if (key !== KEYS.settings) return cloned;
  stripSettingsSecrets(cloned);
  return cloned;
}

function stripSettingsSecrets(value) {
  if (!value || typeof value !== "object") return;
  delete value.apiKey;
  delete value.hasApiKey;
  if (value.anthropic && typeof value.anthropic === "object") {
    delete value.anthropic.apiKey;
    delete value.anthropic.hasApiKey;
  }
  if (value.openaiCompatible && typeof value.openaiCompatible === "object") {
    delete value.openaiCompatible.apiKey;
    delete value.openaiCompatible.hasApiKey;
  }
}

function mergePreservedApiKeys(importedSettings, preservedSettings) {
  const next = normalizeSettings(importedSettings || {});
  const preserved = normalizeSettings(preservedSettings || {});
  if (!next.anthropic.apiKey && preserved.anthropic.apiKey) {
    next.anthropic.apiKey = preserved.anthropic.apiKey;
  }
  if (!next.openaiCompatible.apiKey && preserved.openaiCompatible.apiKey) {
    next.openaiCompatible.apiKey = preserved.openaiCompatible.apiKey;
  }
  return next;
}

async function blobToBackupFile(key, blob) {
  return {
    key,
    name: blob.name || fallbackFileName(key),
    mimeType: blob.type || "application/octet-stream",
    base64: arrayBufferToBase64(await blob.arrayBuffer()),
  };
}

function backupFileToFile(file) {
  const bytes = base64ToUint8Array(file.base64 || "");
  const name = file.name || fallbackFileName(file.key || "backup-file");
  const type = file.mimeType || "application/octet-stream";

  try {
    return new File([bytes], name, { type });
  } catch {
    const blob = new Blob([bytes], { type });
    Object.defineProperty(blob, "name", {
      value: name,
      configurable: true,
    });
    return blob;
  }
}

function isBlobLike(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function backupKeyPriority(key) {
  if (key === KEYS.settings) return 0;
  if (key === KEYS.books) return 1;
  if (/^book:.+:file$/.test(key)) return 2;
  if (/^book:.+:pages$/.test(key)) return 3;
  if (/^progress:/.test(key)) return 4;
  if (/^book:.+:(notes|chat|reflection)$/.test(key) || /^book:.+:questions:/.test(key)) return 5;
  return 10;
}

function countGroupedItems(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  return Object.values(value).reduce((total, item) => {
    if (Array.isArray(item)) return total + item.length;
    return total + 1;
  }, 0);
}

function shouldSkipBackupKey(key) {
  return (
    typeof key === "string" &&
    (key.startsWith("__duban:migration:") ||
      key.startsWith("__duban:ai-budget:") ||
      key === KEYS.aiDiagnostics)
  );
}

function fallbackFileName(key) {
  return `${String(key).replace(/[^a-z0-9._-]+/gi, "_") || "book"}.bin`;
}

function safeIsoTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
