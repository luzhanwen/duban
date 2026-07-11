import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadReleaseState } from "./release_metadata.mjs";

const state = loadReleaseState();
const dryRun = process.argv.includes("--dry-run");
const channel = updaterChannel(state.maturity);
const repository = process.env.GITHUB_REPOSITORY || "luzhanwen/duban";
const branch = "updater-index";
const manifestPath = path.join(
  state.root,
  "release-artifacts",
  `duban-v${state.version}-updater-${channel}.json`
);
const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
const channelPath = `${channel}/latest.json`;

if (state.git.dirty) fail("Updater publication requires a clean Git worktree");
if (!state.git.tagsAtHead.includes(state.targetTag) || state.git.tagCommit !== state.git.commit) {
  fail(`Updater publication requires ${state.targetTag} on the current commit`);
}
if (manifest.version !== state.version) fail("Updater manifest version does not match the tagged source");

const platformAssets = Object.values(manifest.platforms || {});
if (platformAssets.length !== 1) fail("Updater manifest must contain exactly one platform for this release");
const archiveName = decodeURIComponent(new URL(platformAssets[0].url).pathname.split("/").pop());

if (dryRun) {
  console.log(`Updater publication dry run passed: ${channelPath} -> ${state.version}`);
  console.log(`- repository: ${repository}`);
  console.log(`- archive: ${archiveName}`);
  process.exit(0);
}

if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  fail("GH_TOKEN or GITHUB_TOKEN is required to publish the updater channel");
}

const release = ghApi("GET", `repos/${repository}/releases/tags/${state.targetTag}`);
if (release.draft) fail(`GitHub Release ${state.targetTag} is still a draft`);
if (!(release.assets || []).some((asset) => asset.name === archiveName)) {
  fail(`Published GitHub Release does not contain updater archive: ${archiveName}`);
}

const currentFile = ghApi(
  "GET",
  `repos/${repository}/contents/${channelPath}?ref=${branch}`,
  undefined,
  { allowNotFound: true }
);
if (currentFile) {
  const currentText = Buffer.from(String(currentFile.content || "").replace(/\s/g, ""), "base64").toString("utf8");
  const current = JSON.parse(currentText);
  const comparison = compareSemver(current.version, manifest.version);
  if (comparison > 0) fail(`Refusing updater channel rollback: ${current.version} -> ${manifest.version}`);
  if (comparison === 0) {
    if (normalizeJson(currentText) !== normalizeJson(manifestText)) {
      fail(`Updater channel already contains different content for ${manifest.version}`);
    }
    console.log(`Updater channel already points to ${manifest.version}; no change required.`);
    process.exit(0);
  }
}

const currentRef = ghApi("GET", `repos/${repository}/git/ref/heads/${branch}`, undefined, {
  allowNotFound: true,
});
const blob = ghApi("POST", `repos/${repository}/git/blobs`, {
  content: manifestText,
  encoding: "utf-8",
});

let baseTree;
let parentSha;
if (currentRef) {
  parentSha = currentRef.object.sha;
  const parentCommit = ghApi("GET", `repos/${repository}/git/commits/${parentSha}`);
  baseTree = parentCommit.tree.sha;
}

const treePayload = {
  tree: [{ path: channelPath, mode: "100644", type: "blob", sha: blob.sha }],
};
if (baseTree) treePayload.base_tree = baseTree;
const tree = ghApi("POST", `repos/${repository}/git/trees`, treePayload);
const commitPayload = {
  message: `updater: ${channel} ${state.version}`,
  tree: tree.sha,
};
if (parentSha) commitPayload.parents = [parentSha];
const commit = ghApi("POST", `repos/${repository}/git/commits`, commitPayload);

if (currentRef) {
  ghApi("PATCH", `repos/${repository}/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
} else {
  ghApi("POST", `repos/${repository}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: commit.sha,
  });
}

console.log(`Updater channel published: ${channelPath} -> ${state.version}`);
console.log(`https://raw.githubusercontent.com/${repository}/${branch}/${channelPath}`);

function ghApi(method, endpoint, payload, { allowNotFound = false } = {}) {
  const args = ["api", "--method", method, endpoint];
  if (payload !== undefined) args.push("--input", "-");
  const result = spawnSync("gh", args, {
    cwd: state.root,
    encoding: "utf8",
    input: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (result.status === 0) return result.stdout.trim() ? JSON.parse(result.stdout) : {};
  const detail = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
  if (allowNotFound && /HTTP 404|not found/i.test(detail)) return null;
  fail(`GitHub API failed (${method} ${endpoint}): ${detail}`);
}

function updaterChannel(maturity) {
  if (["alpha", "beta", "rc"].includes(maturity)) return "alpha";
  if (maturity === "stable") return "stable";
  fail(`Unsupported updater release maturity: ${maturity}`);
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;
  if (!b.pre.length) return -1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    if (a.pre[index] === undefined) return -1;
    if (b.pre[index] === undefined) return 1;
    if (a.pre[index] === b.pre[index]) continue;
    const aNumber = /^\d+$/.test(a.pre[index]) ? Number(a.pre[index]) : null;
    const bNumber = /^\d+$/.test(b.pre[index]) ? Number(b.pre[index]) : null;
    if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
    if (aNumber !== null) return -1;
    if (bNumber !== null) return 1;
    return a.pre[index].localeCompare(b.pre[index]);
  }
  return 0;
}

function parseSemver(value) {
  const match = String(value).match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );
  if (!match) fail(`Invalid updater SemVer: ${value}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split(".") : [],
  };
}

function normalizeJson(value) {
  return JSON.stringify(JSON.parse(value));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
