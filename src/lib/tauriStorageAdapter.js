import { RUNTIME_TARGETS } from "./runtime.js";

const MIGRATION_KEY = "__duban:migration:indexeddb-to-tauri:v1";

export function createTauriStorageAdapter(legacyAdapter) {
  let migrationPromise = null;

  const invokeStorage = async (command, args = {}) => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(command, args).catch((error) => {
      throw new Error(normalizeTauriStorageError(error));
    });
  };

  const getRawItem = (key) => invokeStorage("duban_storage_get_item", { key });
  const setJsonItem = (key, value) => invokeStorage("duban_storage_set_item", { key, value });
  const setFileItem = async (key, value) => {
    const file = await blobToStoredFile(value, key);
    const saved = await invokeStorage("duban_storage_set_file", { key, file });
    return storedFileToFile(saved);
  };
  const setItemWithoutMigration = async (key, value) => {
    if (isBlobLike(value)) {
      return setFileItem(key, value);
    }

    return setJsonItem(key, toJsonValue(value));
  };
  const keysWithoutMigration = () => invokeStorage("duban_storage_keys");

  const ensureMigrated = async () => {
    if (!legacyAdapter) return;
    if (!migrationPromise) {
      migrationPromise = migrateLegacyIndexedDb({
        getRawItem,
        setJsonItem,
        setItemWithoutMigration,
        keysWithoutMigration,
        legacyAdapter,
      });
    }
    return migrationPromise;
  };

  return {
    target: RUNTIME_TARGETS.tauri,

    async getItem(key) {
      await ensureMigrated();
      return unwrapStoredItem(await getRawItem(key));
    },

    async setItem(key, value) {
      await ensureMigrated();
      return setItemWithoutMigration(key, value);
    },

    async removeItem(key) {
      await ensureMigrated();
      await invokeStorage("duban_storage_remove_item", { key });
    },

    async deleteBook(id) {
      await ensureMigrated();
      return invokeStorage("duban_storage_delete_book", { bookId: id });
    },

    async clear() {
      await ensureMigrated();
      await invokeStorage("duban_storage_clear");
      await legacyAdapter?.clear?.();
    },

    async keys() {
      await ensureMigrated();
      return keysWithoutMigration();
    },
  };
}

async function migrateLegacyIndexedDb({
  getRawItem,
  setJsonItem,
  setItemWithoutMigration,
  keysWithoutMigration,
  legacyAdapter,
}) {
  const migrationFlag = await getRawItem(MIGRATION_KEY);
  if (migrationFlag) return;

  const existingKeys = await keysWithoutMigration();
  if (existingKeys.length > 0) {
    await setJsonItem(MIGRATION_KEY, {
      completedAt: new Date().toISOString(),
      skipped: true,
      reason: "tauri-storage-not-empty",
    });
    return;
  }

  const legacyKeys = prioritizeMigrationKeys(await legacyAdapter.keys());
  let copiedKeys = 0;

  for (const key of legacyKeys) {
    if (key === MIGRATION_KEY) continue;
    const value = await legacyAdapter.getItem(key);
    if (value === undefined || value === null) continue;
    await setItemWithoutMigration(key, value);
    copiedKeys += 1;
  }

  await setJsonItem(MIGRATION_KEY, {
    completedAt: new Date().toISOString(),
    copiedKeys,
    source: "indexeddb",
  });
}

function unwrapStoredItem(item) {
  if (!item) return null;
  if (item.kind === "file") return storedFileToFile(item.file);
  return item.value ?? null;
}

function isBlobLike(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

async function blobToStoredFile(blob, key) {
  const buffer = await blob.arrayBuffer();
  return {
    name: blob.name || fallbackFileName(key),
    mimeType: blob.type || "application/octet-stream",
    base64: arrayBufferToBase64(buffer),
  };
}

function storedFileToFile(file) {
  if (!file) return null;
  if (file.localPath) {
    return createLocalFileRef(file);
  }

  const bytes = base64ToUint8Array(file.base64 || "");
  const type = file.mimeType || "application/octet-stream";
  const name = file.name || "book.bin";

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

function toJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLocalFileRef(file) {
  const ref = {
    name: file.name || "book.bin",
    type: file.mimeType || "application/octet-stream",
    size: Number(file.size) || 0,
    lastModified: Date.now(),
  };

  Object.defineProperties(ref, {
    __dubanLocalFilePath: {
      value: file.localPath,
      enumerable: false,
    },
    __dubanRelativePath: {
      value: file.relativePath || "",
      enumerable: false,
    },
  });

  return ref;
}

function prioritizeMigrationKeys(keys) {
  return [...keys].sort((left, right) => migrationKeyPriority(left) - migrationKeyPriority(right));
}

function migrationKeyPriority(key) {
  if (key === "books") return 0;
  if (/^book:.+:file$/.test(key)) return 1;
  if (/^book:.+:pages$/.test(key)) return 2;
  if (/^progress:/.test(key)) return 3;
  if (/^book:.+:(notes|chat|reflection)$/.test(key)) return 4;
  if (/^book:.+:questions:/.test(key)) return 5;
  return 10;
}

function fallbackFileName(key) {
  return `${key.replace(/[^a-z0-9._-]+/gi, "_") || "book"}.bin`;
}

function normalizeTauriStorageError(error) {
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  return "Tauri 本地存储请求失败，请稍后重试。";
}
