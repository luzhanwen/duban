import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isRetryableUpdaterError,
  normalizeUpdaterError,
} from "../src/lib/appUpdaterPolicy.js";

assert.equal(
  isRetryableUpdaterError(
    new Error(
      "error sending request for url (https://raw.githubusercontent.com/example/latest.json)"
    )
  ),
  true
);
assert.equal(isRetryableUpdaterError(new Error("request timed out")), true);
assert.equal(isRetryableUpdaterError(new Error("invalid release signature")), false);

const networkError = normalizeUpdaterError(
  new Error("error sending request for url (https://example.com/latest.json)"),
  "检查更新失败",
  { networkHint: true }
);
assert.equal(
  networkError.message,
  "检查更新失败：无法连接更新服务，请检查网络后重试"
);
assert.doesNotMatch(networkError.message, /https?:\/\//);

const signatureError = normalizeUpdaterError(
  new Error("invalid release signature"),
  "下载或安装更新失败"
);
assert.equal(
  signatureError.message,
  "下载或安装更新失败：invalid release signature"
);

const cargoManifest = await readFile(
  new URL("../src-tauri/Cargo.toml", import.meta.url),
  "utf8"
);
assert.match(
  cargoManifest,
  /\[target\.'cfg\(target_os = "macos"\)'\.dependencies\][\s\S]*tauri-plugin-updater = \{ version = "2\.10\.1", default-features = false, features = \["native-tls", "zip"\] \}/
);
assert.match(
  cargoManifest,
  /\[target\.'cfg\(not\(target_os = "macos"\)\)'\.dependencies\][\s\S]*tauri-plugin-updater = "2\.10\.1"/
);

console.log("App updater reliability tests passed.");
