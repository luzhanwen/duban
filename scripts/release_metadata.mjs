import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export function loadReleaseState(root = process.env.RELEASE_ROOT || process.cwd()) {
  const packageJson = readJson(root, "package.json");
  const version = String(packageJson.version || "").trim();
  const targetTag = `v${version}`;
  const changelogText = readText(root, "CHANGELOG.md");
  const git = readGitState(root, targetTag);

  return {
    root,
    version,
    targetTag,
    validSemver: isValidSemver(version),
    maturity: releaseMaturity(version),
    schemaVersion: readRustConstant(root, /const CURRENT_SCHEMA_VERSION: &str = "([^"]+)";/),
    backupVersion: readRustConstant(root, /const BACKUP_VERSION: u32 = (\d+);/),
    changelogText,
    changelog: {
      unreleased: findChangelogSection(changelogText, "Unreleased"),
      released: findChangelogSection(changelogText, version),
    },
    git,
  };
}

export function meaningfulChangelogBody(section) {
  if (!section) return "";
  return section.body
    .replace(/^目标版本：.*$/m, "")
    .replace(/^下一版本：.*$/m, "")
    .trim();
}

export function changelogTarget(section) {
  const line = section?.body.match(/^目标版本：\s*`?([^`\n]+)`?\s*$/m)?.[1];
  return line?.trim() || "";
}

export function hasReleaseContent(section) {
  const body = meaningfulChangelogBody(section);
  return /^###\s+\S+/m.test(body) && /^-\s+\S+/m.test(body);
}

export function releaseMaturity(version) {
  const prerelease = String(version).split("-", 2)[1] || "";
  if (prerelease.startsWith("alpha.")) return "alpha";
  if (prerelease.startsWith("beta.")) return "beta";
  if (prerelease.startsWith("rc.")) return "rc";
  return prerelease ? "prerelease" : "stable";
}

export function maturityLabel(maturity) {
  if (maturity === "alpha") return "Alpha 内测版";
  if (maturity === "beta") return "Beta 测试版";
  if (maturity === "rc") return "发布候选版";
  if (maturity === "stable") return "稳定版";
  return "预发布版";
}

export function isValidSemver(version) {
  const match = String(version).match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );
  if (!match) return false;
  return !(match[4] || "")
    .split(".")
    .some((part) => /^\d+$/.test(part) && !/^(0|[1-9]\d*)$/.test(part));
}

export function runGit(root, args, { optional = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", optional ? "ignore" : "pipe"],
    }).trim();
  } catch (error) {
    if (optional) return "";
    const detail = String(error?.stderr || error?.message || "").trim();
    throw new Error(`Git command failed: git ${args.join(" ")}${detail ? `\n${detail}` : ""}`);
  }
}

function readGitState(root, targetTag) {
  const commit = runGit(root, ["rev-parse", "HEAD"]);
  const branch = runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"], { optional: true }) || "detached";
  const status = runGit(root, ["status", "--porcelain", "--untracked-files=all"]);
  const tagsAtHead = runGit(root, ["tag", "--points-at", "HEAD"], { optional: true })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const tagCommit = runGit(root, ["rev-list", "-n", "1", targetTag], { optional: true });
  const tagObjectType = tagCommit
    ? runGit(root, ["cat-file", "-t", targetTag], { optional: true })
    : "";

  return {
    commit,
    commitShort: commit.slice(0, 12),
    branch,
    dirty: Boolean(status),
    changedPaths: status ? status.split("\n").length : 0,
    tagsAtHead,
    tagExists: Boolean(tagCommit),
    tagCommit,
    tagObjectType,
  };
}

function findChangelogSection(text, label) {
  const headings = [...text.matchAll(/^## \[([^\]]+)](?: - (\d{4}-\d{2}-\d{2}))?\s*$/gm)];
  const index = headings.findIndex((heading) => heading[1] === label);
  if (index < 0) return null;
  const heading = headings[index];
  const next = headings[index + 1];
  const start = heading.index;
  const bodyStart = start + heading[0].length;
  const end = next?.index ?? text.length;
  return {
    label,
    date: heading[2] || "",
    start,
    bodyStart,
    end,
    heading: heading[0],
    body: text.slice(bodyStart, end).trim(),
  };
}

function readRustConstant(root, pattern) {
  const source = readText(root, "src-tauri/src/storage.rs");
  const value = source.match(pattern)?.[1];
  if (!value) throw new Error(`Unable to read release metadata from src-tauri/src/storage.rs: ${pattern}`);
  return value;
}

function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function readText(root, relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
