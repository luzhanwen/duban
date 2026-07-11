import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadReleaseState } from "./release_metadata.mjs";

const state = loadReleaseState();
const channel = updaterChannel(state.maturity);
const arch = normalizeArch(process.env.RELEASE_ARCH || "arm64");
const releaseId = `duban-v${state.version}-formal-${arch}-signed`;
const outputDir = path.join(state.root, "release-artifacts");
const releaseManifestPath = path.join(outputDir, `${releaseId}-manifest.json`);
const notesPath = path.join(outputDir, `duban-v${state.version}-release-notes.md`);
const outputPath = path.join(outputDir, `duban-v${state.version}-updater-${channel}.json`);

if (state.git.dirty) fail("Updater manifest requires a clean Git worktree");
if (!state.git.tagsAtHead.includes(state.targetTag) || state.git.tagCommit !== state.git.commit) {
  fail(`Updater manifest requires ${state.targetTag} on the current commit`);
}
for (const filePath of [releaseManifestPath, notesPath]) {
  if (!existsSync(filePath)) fail(`Missing updater input: ${path.relative(state.root, filePath)}`);
}

const releaseManifest = readJson(releaseManifestPath);
if (
  releaseManifest.version !== state.version ||
  releaseManifest.channel !== "formal" ||
  releaseManifest.kind !== "signed" ||
  releaseManifest.source?.tag !== state.targetTag ||
  releaseManifest.source?.commit !== state.git.commit ||
  releaseManifest.source?.dirty
) {
  fail("Release manifest is not a clean formal signed artifact set for the current tag");
}

const archive = (releaseManifest.artifacts || []).find((artifact) => artifact.fileName.endsWith(".app.tar.gz"));
if (!archive) fail("Release manifest does not contain a macOS updater archive");
const signature = (releaseManifest.artifacts || []).find(
  (artifact) => artifact.fileName === `${archive.fileName}.sig`
);
if (!signature) fail("Release manifest does not contain the updater archive signature");

const archivePath = path.resolve(state.root, archive.path);
const signaturePath = path.resolve(state.root, signature.path);
for (const filePath of [archivePath, signaturePath]) {
  if (!filePath.startsWith(`${state.root}${path.sep}`) || !existsSync(filePath)) {
    fail(`Updater artifact is missing or outside the repository: ${filePath}`);
  }
}

const signatureText = readFileSync(signaturePath, "utf8").trim();
if (!signatureText || !/^[A-Za-z0-9+/=\r\n]+$/.test(signatureText)) {
  fail("Updater signature file is empty or not base64 text");
}

const platform = arch === "arm64" ? "darwin-aarch64" : "darwin-x86_64";
const releaseUrl = `https://github.com/luzhanwen/duban/releases/download/${state.targetTag}/${encodeURIComponent(archive.fileName)}`;
const updaterManifest = {
  version: state.version,
  notes: readFileSync(notesPath, "utf8").trim(),
  pub_date: releaseManifest.generatedAt,
  platforms: {
    [platform]: {
      signature: signatureText,
      url: releaseUrl,
    },
  },
};

writeFileSync(outputPath, `${JSON.stringify(updaterManifest, null, 2)}\n`);
console.log(`Updater manifest written: ${path.relative(state.root, outputPath)}`);
console.log(`- channel: ${channel}`);
console.log(`- platform: ${platform}`);
console.log(`- version: ${state.version}`);

function updaterChannel(maturity) {
  if (["alpha", "beta", "rc"].includes(maturity)) return "alpha";
  if (maturity === "stable") return "stable";
  fail(`Unsupported updater release maturity: ${maturity}`);
}

function normalizeArch(value) {
  if (["arm64", "aarch64"].includes(value)) return "arm64";
  if (["x64", "x86_64"].includes(value)) return "x64";
  fail(`Unsupported macOS updater architecture: ${value}`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
