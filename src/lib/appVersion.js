import { APP_CHANNEL } from "./appChannel.js";
import { getRuntimeTarget } from "./runtime.js";

const injectedBuildInfo =
  typeof __DUBAN_BUILD_INFO__ === "undefined" ? null : __DUBAN_BUILD_INFO__;

export const APP_VERSION_INFO = Object.freeze({
  appVersion: cleanValue(injectedBuildInfo?.appVersion),
  channel: cleanValue(injectedBuildInfo?.channel, APP_CHANNEL),
  commit: cleanValue(injectedBuildInfo?.commit),
  commitShort: cleanValue(injectedBuildInfo?.commitShort),
  dirty: Boolean(injectedBuildInfo?.dirty),
  schemaVersion: cleanValue(injectedBuildInfo?.schemaVersion),
  backupVersion: cleanValue(injectedBuildInfo?.backupVersion),
  runtime: getRuntimeTarget(),
});

export function formatAppChannel(channel = APP_VERSION_INFO.channel) {
  if (channel === "test") return "测试通道";
  if (channel === "formal") return "正式通道";
  return channel || "未知通道";
}

export function formatRuntimeTarget(runtime = APP_VERSION_INFO.runtime) {
  if (runtime === "tauri") return "桌面版";
  if (runtime === "browser") return "网页版";
  return runtime || "未知环境";
}

export function formatBuildCommit(info = APP_VERSION_INFO) {
  const commit = info.commitShort || "unknown";
  return info.dirty ? `${commit} · dirty` : commit;
}

export function buildVersionSupportText(info = APP_VERSION_INFO) {
  return [
    "读伴版本信息",
    `App version：${info.appVersion}`,
    `发布通道：${formatAppChannel(info.channel)} (${info.channel})`,
    `运行环境：${formatRuntimeTarget(info.runtime)} (${info.runtime})`,
    `Git commit：${info.commit}${info.dirty ? " (dirty)" : ""}`,
    `SQLite schema：${info.schemaVersion}`,
    `备份格式：${info.backupVersion}`,
  ].join("\n");
}

function cleanValue(value, fallback = "unknown") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}
