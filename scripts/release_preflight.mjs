import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const issues = [];

const packageJson = readJson("package.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const formalConfig = readJson("src-tauri/tauri.formal.conf.json");
const testConfig = readJson("src-tauri/tauri.test.conf.json");

expect(tauriConfig.version === semverCore(packageJson.version), "tauri.conf.json version must match the numeric SemVer core");
expect(Boolean(tauriConfig.bundle?.macOS?.bundleVersion), "tauri.conf.json must set a numeric macOS bundleVersion");
expect(packageJson.description && !packageJson.description.includes("纯前端"), "package description must not describe the app as pure frontend");
expect(tauriConfig.productName === "读伴 Test", "base Tauri productName must be test-safe");
expect(tauriConfig.identifier === "com.duban.reader.test", "base Tauri identifier must be test-safe");
expect(formalConfig.productName === "读伴", "formal productName must be 读伴");
expect(formalConfig.identifier === "com.duban.reader", "formal identifier must be com.duban.reader");
expect(formalConfig.build?.beforeBuildCommand === "npm run build:formal", "formal Tauri config must run build:formal");
expect(formalConfig.bundle?.macOS?.hardenedRuntime === true, "formal Tauri config must enable macOS hardened runtime");
expect(formalConfig.bundle?.macOS?.entitlements === "entitlements.plist", "formal Tauri config must use macOS entitlements.plist");
expect(testConfig.productName === "读伴 Test", "test Tauri productName must be distinct");
expect(testConfig.identifier === "com.duban.reader.test", "test Tauri identifier must be distinct");
expect(testConfig.build?.beforeBuildCommand === "npm run build:test", "test Tauri config must run build:test");
expect(testConfig.app?.windows?.[0]?.title === "读伴 Test", "test Tauri window title must be distinct");

expectScript("build", "vite build --mode formal");
expectScript("build:formal", "vite build --mode formal");
expectScript("build:test", "vite build --mode test");
expectScript("version:check", "scripts/version.mjs check");
expectScript("tauri:dev", "tauri:dev:test");
expectScript("tauri:dev:test", "src-tauri/tauri.test.conf.json");
expectScript("tauri:build:formal", "src-tauri/tauri.formal.conf.json");
expectScript("tauri:build:test", "src-tauri/tauri.test.conf.json");
expectScript("package:mac-local", "tauri:build:formal");
expectScript("release:preflight", "version:check");
expectScript("release:check", "scripts/release_check.mjs");
expectScript("release:prepare", "scripts/release_prepare.mjs");
expectScript("release:notes", "scripts/release_notes.mjs");
expectScript("release:self-test", "scripts/test_release_workflow.mjs");
expectScript("release:manifest", "scripts/release_manifest.mjs");
expectScript("release:publish", "scripts/release_publish.mjs");
expectScript("release:signing-preflight", "version:check");
expectScript("release:signing-preflight", "scripts/release_signing_preflight.mjs");
expectScript("package:mac-signed", "scripts/package-mac-signed.sh");
expectScript("release:notarize", "scripts/notarize-mac-dmg.sh");
expectScript("release:gatekeeper", "scripts/verify-mac-release.sh");

expectEnvChannel(".env.formal", "formal");
expectEnvChannel(".env.test", "test");
expectFileContains("src/lib/appChannel.js", "VITE_APP_CHANNEL");
expectFileContains("vite.config.js", "__DUBAN_BUILD_INFO__");
expectFileContains("vite.config.js", "CURRENT_SCHEMA_VERSION");
expectFileContains("src/lib/appVersion.js", "buildVersionSupportText");
expectFileContains("src/components/Settings.jsx", "APP_VERSION_INFO");
expectFileContains(".github/workflows/release-macos.yml", "npm run release:publish");
expectFileContains(".github/workflows/release-macos.yml", "environment: macos-release");
expectWorkflowStepEnv("Build Developer ID signed DMG", "APPLE_CERTIFICATE");
expectWorkflowStepEnv("Build Developer ID signed DMG", "APPLE_CERTIFICATE_PASSWORD");
expectWorkflowStepEnv("Build Developer ID signed DMG", "KEYCHAIN_PASSWORD");
expectWorkflowStepEnv("Submit DMG for Apple notarization and staple ticket", "APPLE_PASSWORD");
expectFileContains("vite.config.js", "formalBuildGuard");
expectFileContains("docs/RELEASE_PROCESS.md", "P6.7");
expectFileContains("docs/RELEASE_PROCESS.md", "P6.7.2");

validateFormalDist();

if (issues.length) {
  console.error("Release preflight failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Release preflight passed.");

function expect(condition, message) {
  if (!condition) issues.push(message);
}

function expectScript(name, expectedText) {
  const script = packageJson.scripts?.[name] || "";
  expect(script.includes(expectedText), `package.json script ${name} must include ${expectedText}`);
}

function expectEnvChannel(relativePath, channel) {
  const content = readText(relativePath);
  expect(
    content.includes(`VITE_APP_CHANNEL=${channel}`),
    `${relativePath} must declare VITE_APP_CHANNEL=${channel}`
  );
}

function expectFileContains(relativePath, expectedText) {
  const content = readText(relativePath);
  expect(content.includes(expectedText), `${relativePath} must include ${expectedText}`);
}

function expectWorkflowStepEnv(stepName, envName) {
  const content = readText(".github/workflows/release-macos.yml");
  const marker = `      - name: ${stepName}\n`;
  const start = content.indexOf(marker);
  if (start < 0) {
    issues.push(`release-macos workflow is missing step ${stepName}`);
    return;
  }
  const next = content.indexOf("\n      - name: ", start + marker.length);
  const section = content.slice(start, next < 0 ? content.length : next);
  expect(section.includes(`${envName}:`), `release-macos step ${stepName} must receive ${envName}`);
}

function validateFormalDist() {
  const distPath = path.join(root, "dist");
  if (!existsSync(distPath)) {
    issues.push("dist is missing; run npm run build:formal before release:preflight");
    return;
  }

  if (existsSync(path.join(distPath, "test-books"))) {
    issues.push("formal dist must not contain dist/test-books");
  }

  const forbidden = ["/test-books/", "test-books/wanli15.pdf", "导入测试"];
  for (const filePath of walk(distPath)) {
    if (statSync(filePath).size > 2_000_000) continue;
    const content = readFileSync(filePath, "utf8");
    for (const token of forbidden) {
      if (content.includes(token)) {
        issues.push(`formal dist leaks test-only token ${token} in ${path.relative(root, filePath)}`);
      }
    }
  }
}

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      yield* walk(absolutePath);
    } else if (stat.isFile()) {
      yield absolutePath;
    }
  }
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function semverCore(version) {
  return String(version || "").split(/[+-]/, 1)[0];
}
