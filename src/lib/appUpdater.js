import { APP_CHANNEL } from "./appChannel.js";
import { isTauriRuntime } from "./runtime.js";

const FORMAL_CHANNEL = "formal";
const DEFAULT_CHECK_TIMEOUT_MS = 30_000;
const RELEASES_URL = "https://github.com/luzhanwen/duban/releases";

let pendingUpdate = null;

export function isAppUpdaterAvailable() {
  return isTauriRuntime() && APP_CHANNEL === FORMAL_CHANNEL;
}

export async function checkForAppUpdate() {
  if (!isAppUpdaterAvailable()) {
    return {
      supported: false,
      available: false,
      reason: APP_CHANNEL === FORMAL_CHANNEL ? "not-desktop" : "non-formal-channel",
    };
  }

  await clearPendingAppUpdate();

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: DEFAULT_CHECK_TIMEOUT_MS });
    pendingUpdate = update || null;

    if (!update) {
      return { supported: true, available: false };
    }

    return {
      supported: true,
      available: true,
      version: update.version,
      currentVersion: update.currentVersion,
      date: update.date || null,
      body: update.body || "",
    };
  } catch (error) {
    throw normalizeUpdaterError(error, "检查更新失败");
  }
}

export async function downloadAndInstallAppUpdate(onProgress) {
  if (!pendingUpdate) {
    throw new Error("没有待安装的更新，请先检查更新");
  }

  try {
    await pendingUpdate.downloadAndInstall((event) => {
      onProgress?.(normalizeUpdateProgress(event));
    });
  } catch (error) {
    throw normalizeUpdaterError(error, "下载或安装更新失败");
  }
}

export async function relaunchUpdatedApp() {
  if (!isAppUpdaterAvailable()) {
    throw new Error("当前环境不支持应用更新重启");
  }

  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (error) {
    throw normalizeUpdaterError(error, "重启应用失败");
  }
}

export function buildAppReleaseUrl(version = "") {
  const normalized = String(version || "").trim();
  if (!normalized) return RELEASES_URL;
  if (!/^[0-9A-Za-z.-]+$/.test(normalized)) return RELEASES_URL;
  return `${RELEASES_URL}/tag/v${normalized}`;
}

export async function openAppReleasePage(version = "") {
  if (!isAppUpdaterAvailable()) {
    throw new Error("当前环境不支持打开桌面版下载页面");
  }
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(buildAppReleaseUrl(version));
  } catch (error) {
    throw normalizeUpdaterError(error, "打开下载页面失败");
  }
}

export async function clearPendingAppUpdate() {
  const update = pendingUpdate;
  pendingUpdate = null;
  if (update?.close) {
    await update.close().catch(() => {});
  }
}

function normalizeUpdateProgress(event) {
  if (event?.event === "Started") {
    return {
      phase: "started",
      contentLength: event.data?.contentLength ?? null,
      chunkLength: 0,
    };
  }
  if (event?.event === "Progress") {
    return {
      phase: "progress",
      contentLength: null,
      chunkLength: event.data?.chunkLength ?? 0,
    };
  }
  return {
    phase: event?.event === "Finished" ? "finished" : "unknown",
    contentLength: null,
    chunkLength: 0,
  };
}

function normalizeUpdaterError(error, fallbackMessage) {
  const detail = String(error?.message || error || "").trim();
  const message = detail ? `${fallbackMessage}：${detail}` : fallbackMessage;
  const normalized = new Error(message);
  normalized.cause = error;
  return normalized;
}
