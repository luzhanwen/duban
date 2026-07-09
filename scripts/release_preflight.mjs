import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const issues = [];

const packageJson = readJson("package.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const formalConfig = readJson("src-tauri/tauri.formal.conf.json");
const testConfig = readJson("src-tauri/tauri.test.conf.json");

expect(packageJson.version === tauriConfig.version, "package.json and tauri.conf.json versions must match");
expect(packageJson.description && !packageJson.description.includes("纯前端"), "package description must not describe the app as pure frontend");
expect(tauriConfig.productName === "读伴", "formal productName must be 读伴");
expect(tauriConfig.identifier === "com.duban.reader", "formal identifier must be com.duban.reader");
expect(formalConfig.build?.beforeBuildCommand === "npm run build:formal", "formal Tauri config must run build:formal");
expect(formalConfig.bundle?.macOS?.hardenedRuntime === true, "formal Tauri config must enable macOS hardened runtime");
expect(formalConfig.bundle?.macOS?.entitlements === "entitlements.plist", "formal Tauri config must use macOS entitlements.plist");
expect(testConfig.productName === "读伴 Test", "test Tauri productName must be distinct");
expect(testConfig.identifier === "com.duban.reader.test", "test Tauri identifier must be distinct");
expect(testConfig.build?.beforeBuildCommand === "npm run build:test", "test Tauri config must run build:test");

expectScript("build", "vite build --mode formal");
expectScript("build:formal", "vite build --mode formal");
expectScript("build:test", "vite build --mode test");
expectScript("tauri:build:formal", "src-tauri/tauri.formal.conf.json");
expectScript("tauri:build:test", "src-tauri/tauri.test.conf.json");
expectScript("package:mac-local", "tauri:build:formal");
expectScript("release:manifest", "scripts/release_manifest.mjs");
expectScript("release:signing-preflight", "scripts/release_signing_preflight.mjs");
expectScript("package:mac-signed", "scripts/package-mac-signed.sh");
expectScript("release:notarize", "scripts/notarize-mac-dmg.sh");
expectScript("release:gatekeeper", "scripts/verify-mac-release.sh");

expectEnvChannel(".env.formal", "formal");
expectEnvChannel(".env.test", "test");
expectFileContains("src/lib/appChannel.js", "VITE_APP_CHANNEL");
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
