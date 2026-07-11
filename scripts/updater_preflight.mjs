import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const issues = [];
const warnings = [];
const ok = [];

const packageJson = readJson("package.json");
const baseConfig = readJson("src-tauri/tauri.conf.json");
const formalConfig = readJson("src-tauri/tauri.formal.conf.json");
const capability = readJson("src-tauri/capabilities/default.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const rustEntry = readText("src-tauri/src/lib.rs");

checkDependency("@tauri-apps/plugin-updater");
checkDependency("@tauri-apps/plugin-process");
checkText(cargoToml, 'tauri-plugin-updater = "2.10.1"', "Rust updater dependency");
checkText(cargoToml, 'tauri-plugin-process = "2.3.1"', "Rust process dependency");
checkText(rustEntry, "tauri_plugin_updater::Builder::new().build()", "Rust updater registration");
checkText(rustEntry, "tauri_plugin_process::init()", "Rust process registration");
checkPermission("updater:default");
checkPermission("process:allow-restart");

check(
  !baseConfig.plugins?.updater,
  "base/test-safe Tauri config must not contain a remote updater endpoint",
  "base/test-safe config has no remote updater endpoint"
);

const updaterConfig = formalConfig.plugins?.updater;
if (!updaterConfig) {
  warnOrFail("formal updater trust root and endpoint are not configured yet");
} else {
  const pubkey = String(updaterConfig.pubkey || "").trim();
  check(pubkey.length >= 40, "formal updater public key is missing or invalid", "formal updater public key configured");

  const endpoints = updaterConfig.endpoints || [];
  check(
    Array.isArray(endpoints) && endpoints.length === 1,
    "formal updater must use exactly one channel manifest endpoint",
    "formal updater uses one channel manifest endpoint"
  );
  for (const endpoint of endpoints) {
    check(
      typeof endpoint === "string" && endpoint.startsWith("https://"),
      `updater endpoint must use HTTPS: ${endpoint}`,
      `HTTPS updater endpoint configured: ${endpoint}`
    );
  }
}

const releaseConfigPath = "src-tauri/tauri.release.conf.json";
if (!existsSync(path.join(root, releaseConfigPath))) {
  warnOrFail(`${releaseConfigPath} is not configured yet`);
} else {
  const releaseConfig = readJson(releaseConfigPath);
  check(
    releaseConfig.bundle?.createUpdaterArtifacts === true,
    "release config must set bundle.createUpdaterArtifacts to true",
    "release config creates updater artifacts"
  );
  check(
    releaseConfig.productName === formalConfig.productName && releaseConfig.identifier === formalConfig.identifier,
    "release config productName/identifier must match formal config",
    "release identity matches formal config"
  );
  check(
    releaseConfig.plugins?.updater?.pubkey === updaterConfig?.pubkey,
    "release updater public key must match formal config",
    "release updater public key matches formal config"
  );
  check(
    JSON.stringify(releaseConfig.plugins?.updater?.endpoints) === JSON.stringify(updaterConfig?.endpoints),
    "release updater endpoints must match formal config",
    "release updater endpoints match formal config"
  );
}

if (strict) {
  check(Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY), "TAURI_SIGNING_PRIVATE_KEY is required", "updater private key env detected");
  check(
    Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD),
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is required",
    "updater private key password env detected"
  );
}

if (issues.length) {
  console.error("Updater preflight failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  if (warnings.length) {
    console.error("\nWarnings:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log("Updater preflight passed.");
for (const item of ok) console.log(`ok: ${item}`);
if (warnings.length) {
  console.log("\nPending trust-root setup:");
  for (const warning of warnings) console.log(`- ${warning}`);
  console.log("\nRun with --strict only after the updater key and release config are installed.");
}

function checkDependency(name) {
  check(Boolean(packageJson.dependencies?.[name]), `missing npm dependency ${name}`, `npm dependency ${name}`);
}

function checkPermission(permission) {
  check(
    capability.permissions?.includes(permission),
    `missing Tauri capability ${permission}`,
    `Tauri capability ${permission}`
  );
}

function checkText(content, expected, label) {
  check(content.includes(expected), `missing ${label}`, label);
}

function check(condition, failure, success) {
  if (condition) ok.push(success);
  else issues.push(failure);
}

function warnOrFail(message) {
  if (strict) issues.push(message);
  else warnings.push(message);
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
