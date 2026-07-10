import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadReleaseState } from "./release_metadata.mjs";

const state = loadReleaseState();
const dryRun = process.argv.includes("--dry-run");
const channel = process.env.RELEASE_CHANNEL || "formal";
const kind = process.env.RELEASE_KIND || "signed";
const arch = normalizeArch(process.env.RELEASE_ARCH || os.arch());
const releaseId = `duban-v${state.version}-${channel}-${arch}-${kind}`;
const outputDir = path.join(state.root, "release-artifacts");
const manifestPath = path.join(outputDir, `${releaseId}-manifest.json`);
const checksumsPath = path.join(outputDir, `${releaseId}-checksums.txt`);
const notesPath = path.join(outputDir, `duban-v${state.version}-release-notes.md`);
const notaryLogPath = path.join(outputDir, `${releaseId}-notary-log.json`);
const expectedTag = state.targetTag;

if (state.git.dirty) fail("GitHub Release publishing requires a clean Git worktree");
if (!state.git.tagsAtHead.includes(expectedTag) || state.git.tagCommit !== state.git.commit) {
  fail(`Current HEAD must be tagged ${expectedTag}`);
}
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== expectedTag) {
  fail(`GITHUB_REF_NAME ${process.env.GITHUB_REF_NAME} does not match ${expectedTag}`);
}

for (const filePath of [manifestPath, checksumsPath, notesPath, notaryLogPath]) {
  if (!existsSync(filePath)) fail(`Missing release file: ${path.relative(state.root, filePath)}`);
}

const manifest = readJson(manifestPath);
if (manifest.version !== state.version) fail("Release manifest version does not match package version");
if (manifest.channel !== "formal" || manifest.kind !== "signed") {
  fail("GitHub Release requires a formal signed manifest");
}
if (manifest.source?.commit !== state.git.commit || manifest.source?.tag !== expectedTag) {
  fail("Release manifest source commit/tag does not match current tagged commit");
}
if (manifest.source?.dirty) fail("Release manifest is marked dirty");

const artifactPaths = (manifest.artifacts || []).map((artifact) => {
  const absolutePath = path.resolve(state.root, artifact.path);
  if (!absolutePath.startsWith(`${state.root}${path.sep}`) || !existsSync(absolutePath)) {
    fail(`Manifest artifact is missing or outside the repository: ${artifact.path}`);
  }
  const actualSha256 = sha256File(absolutePath);
  if (actualSha256 !== artifact.sha256) fail(`Artifact checksum mismatch: ${artifact.fileName}`);
  return absolutePath;
});
if (!artifactPaths.some((filePath) => filePath.endsWith(".dmg"))) {
  fail("Release manifest does not contain a DMG artifact");
}

const checksums = readFileSync(checksumsPath, "utf8");
for (const artifact of manifest.artifacts || []) {
  if (!checksums.includes(`${artifact.sha256}  ${artifact.path}`)) {
    fail(`Checksums file does not contain ${artifact.fileName}`);
  }
}

const notaryLog = readJson(notaryLogPath);
if (notaryLog.status !== "Accepted") fail(`Notarization status is ${notaryLog.status || "unknown"}`);

const assets = [...new Set([...artifactPaths, manifestPath, checksumsPath, notesPath, notaryLogPath])];
const prerelease = state.maturity !== "stable";

if (dryRun) {
  console.log(`GitHub Release dry run passed for ${expectedTag}.`);
  console.log(`- prerelease: ${prerelease}`);
  console.log(`- assets: ${assets.length}`);
  for (const asset of assets) console.log(`  - ${path.relative(state.root, asset)}`);
  process.exit(0);
}

if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  fail("GH_TOKEN or GITHUB_TOKEN is required to publish a GitHub Release");
}

const existing = readExistingRelease(expectedTag);
if (existing && !existing.isDraft) {
  fail(`GitHub Release ${expectedTag} is already published and will not be mutated`);
}
if (existing && Boolean(existing.isPrerelease) !== prerelease) {
  fail(`Existing draft prerelease state does not match ${state.maturity}`);
}

const title = `读伴 ${state.version}`;
if (!existing) {
  const createArgs = [
    "release",
    "create",
    expectedTag,
    ...assets,
    "--verify-tag",
    "--draft",
    "--title",
    title,
    "--notes-file",
    notesPath,
  ];
  if (prerelease) createArgs.push("--prerelease");
  runGh(createArgs);
} else {
  runGh(["release", "upload", expectedTag, ...assets, "--clobber"]);
  runGh(["release", "edit", expectedTag, "--title", title, "--notes-file", notesPath]);
}

runGh(["release", "edit", expectedTag, "--draft=false"]);
const published = readExistingRelease(expectedTag);
if (!published || published.isDraft) fail(`GitHub Release ${expectedTag} was not published`);

console.log(`GitHub Release published: ${published.url || expectedTag}`);

function readExistingRelease(tag) {
  const result = spawnSync("gh", ["release", "view", tag, "--json", "isDraft,isPrerelease,url"], {
    cwd: state.root,
    encoding: "utf8",
  });
  if (result.status === 0) return JSON.parse(result.stdout);
  const detail = `${result.stderr || ""}\n${result.stdout || ""}`;
  if (/release not found|not found/i.test(detail)) return null;
  fail(`Unable to inspect GitHub Release ${tag}: ${detail.trim()}`);
}

function runGh(args) {
  const result = spawnSync("gh", args, { cwd: state.root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) fail(`GitHub CLI command failed: gh ${args.slice(0, 3).join(" ")}`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function normalizeArch(value) {
  if (value === "aarch64") return "arm64";
  if (value === "x64" || value === "x86_64") return "x64";
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
