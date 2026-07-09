import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const issues = [];
const warnings = [];
const ok = [];

const packageJson = readJson("package.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const formalConfig = readJson("src-tauri/tauri.formal.conf.json");

check(os.platform() === "darwin", "release signing must run on macOS", "macOS platform detected");
check(packageJson.version === tauriConfig.version, "package.json and tauri.conf.json versions must match", `version ${packageJson.version}`);
check(formalConfig.productName === "读伴", "formal productName must be 读伴", "formal productName is 读伴");
check(formalConfig.identifier === "com.duban.reader", "formal identifier must be com.duban.reader", "formal identifier is com.duban.reader");
check(formalConfig.bundle?.macOS?.hardenedRuntime === true, "formal macOS hardenedRuntime must be true", "hardened runtime enabled");

const entitlements = formalConfig.bundle?.macOS?.entitlements;
check(Boolean(entitlements), "formal macOS entitlements path must be configured", "entitlements path configured");
if (entitlements) {
  check(
    existsSync(path.join(root, "src-tauri", entitlements)),
    `formal macOS entitlements file is missing: ${entitlements}`,
    `entitlements file found: src-tauri/${entitlements}`
  );
}

checkScript("release:signing-preflight", "scripts/release_signing_preflight.mjs");
checkScript("package:mac-signed", "scripts/package-mac-signed.sh");
checkScript("release:notarize", "scripts/notarize-mac-dmg.sh");
checkScript("release:gatekeeper", "scripts/verify-mac-release.sh");

checkTool("/usr/bin/codesign", "codesign");
checkTool("/usr/bin/security", "security");
checkTool("/usr/sbin/spctl", "spctl");
checkTool("/usr/bin/hdiutil", "hdiutil");
checkXcrunTool("notarytool");
checkXcrunTool("stapler");

const identities = findDeveloperIdIdentities();
if (identities.length) {
  ok.push(`Developer ID Application identities found: ${identities.length}`);
} else {
  warnOrFail("No Developer ID Application signing identity found in the current keychain");
}

const signingIdentity = process.env.APPLE_SIGNING_IDENTITY || "";
if (signingIdentity) {
  const matched = identities.some((identity) => {
    return identity.hash === signingIdentity || identity.name.includes(signingIdentity);
  });
  if (matched) {
    ok.push(`APPLE_SIGNING_IDENTITY matches an installed identity: ${signingIdentity}`);
  } else {
    warnOrFail(`APPLE_SIGNING_IDENTITY does not match installed Developer ID identities: ${signingIdentity}`);
  }
} else if (!process.env.APPLE_CERTIFICATE) {
  warnOrFail("Set APPLE_SIGNING_IDENTITY, or provide APPLE_CERTIFICATE for CI-based signing");
}

if (hasNotaryCredentials()) {
  ok.push("notarization credentials detected");
} else {
  warnOrFail(
    "No notarization credentials detected. Use NOTARYTOOL_KEYCHAIN_PROFILE, Apple ID app-specific password, or App Store Connect API key env vars"
  );
}

if (issues.length) {
  console.error("Release signing preflight failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  if (warnings.length) {
    console.error("\nWarnings:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log("Release signing preflight passed.");
for (const item of ok) console.log(`ok: ${item}`);
if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
  console.log("\nRun with --strict when you expect the signing certificate and notarization credentials to be present.");
}

function check(condition, failure, success) {
  if (condition) {
    ok.push(success);
  } else {
    issues.push(failure);
  }
}

function warnOrFail(message) {
  if (strict) {
    issues.push(message);
  } else {
    warnings.push(message);
  }
}

function checkScript(name, expectedText) {
  const script = packageJson.scripts?.[name] || "";
  check(script.includes(expectedText), `package.json script ${name} must include ${expectedText}`, `script ${name} configured`);
}

function checkTool(absolutePath, label) {
  check(existsSync(absolutePath), `${label} not found at ${absolutePath}`, `${label} found`);
}

function checkXcrunTool(toolName) {
  const result = spawnSync("xcrun", ["--find", toolName], { encoding: "utf8" });
  check(result.status === 0, `xcrun cannot find ${toolName}`, `${toolName} found: ${result.stdout.trim()}`);
}

function findDeveloperIdIdentities() {
  const result = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  if (result.status !== 0) return [];

  return result.stdout
    .split("\n")
    .map((line) => line.match(/\)\s+([A-Fa-f0-9]{40})\s+"([^"]+)"/))
    .filter(Boolean)
    .map((match) => ({ hash: match[1], name: match[2] }))
    .filter((identity) => identity.name.includes("Developer ID Application:"));
}

function hasNotaryCredentials() {
  if (process.env.NOTARYTOOL_KEYCHAIN_PROFILE) return true;

  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_PASSWORD;
  if (process.env.APPLE_ID && process.env.APPLE_TEAM_ID && password) return true;

  if (
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER_ID &&
    process.env.APPLE_API_PRIVATE_KEY_PATH &&
    existsSync(process.env.APPLE_API_PRIVATE_KEY_PATH)
  ) {
    return true;
  }

  if (
    process.env.APPLE_API_KEY &&
    process.env.APPLE_API_ISSUER &&
    process.env.APPLE_API_KEY_PATH &&
    existsSync(process.env.APPLE_API_KEY_PATH)
  ) {
    return true;
  }

  return false;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}
