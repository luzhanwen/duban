import {
  changelogTarget,
  hasReleaseContent,
  loadReleaseState,
  meaningfulChangelogBody,
  runGit,
} from "./release_metadata.mjs";

const args = process.argv.slice(2);
const requestedStage = args.find((value) => !value.startsWith("--")) || "auto";
const allowDirty = args.includes("--allow-dirty");
const state = loadReleaseState();
const stage = resolveStage(requestedStage);
const issues = [];
const warnings = [];

if (!state.validSemver) issues.push(`package.json version is not valid SemVer: ${state.version}`);
if (!state.git.commit) issues.push("Git HEAD is unavailable");
if (state.git.dirty && !allowDirty) {
  issues.push(`Git worktree is dirty (${state.git.changedPaths} changed paths)`);
}
if (allowDirty && stage !== "candidate") {
  issues.push("--allow-dirty is only available for candidate checks");
}
if (state.git.dirty && allowDirty) {
  warnings.push(`Git worktree is dirty (${state.git.changedPaths} changed paths); this result is not releaseable`);
}

if (stage === "candidate") validateCandidate();
if (stage === "tag-ready") validateTagReady();
if (stage === "tagged") validateTagged();
if (!["candidate", "tag-ready", "tagged"].includes(stage)) {
  issues.push(`Unknown release stage: ${stage}`);
}

if (issues.length) {
  console.error(`Release ${stage} check failed:`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Release ${stage} check passed.`);
console.log(`- version: ${state.version}`);
console.log(`- tag: ${state.targetTag}`);
console.log(`- commit: ${state.git.commit}`);
console.log(`- branch: ${state.git.branch}`);
console.log(`- changelog: ${state.changelog.released ? "released section" : "Unreleased draft"}`);
console.log(`- worktree: ${state.git.dirty ? "dirty (allowed for this check only)" : "clean"}`);
for (const warning of warnings) console.warn(`warning: ${warning}`);

function validateCandidate() {
  const source = state.changelog.released || state.changelog.unreleased;
  if (!source) {
    issues.push("CHANGELOG.md is missing Unreleased or current version section");
    return;
  }
  if (!state.changelog.released) {
    const target = changelogTarget(state.changelog.unreleased);
    if (target !== state.version) {
      issues.push(`CHANGELOG.md Unreleased target ${target || "(missing)"} does not match ${state.version}`);
    }
  }
  validateSection(source);
  if (state.git.tagExists) issues.push(`Tag ${state.targetTag} already exists; bump the version instead of reusing it`);
}

function validateTagReady() {
  if (!state.changelog.released) {
    issues.push(`CHANGELOG.md must contain ## [${state.version}] - YYYY-MM-DD before tagging`);
  } else {
    validateSection(state.changelog.released);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.changelog.released.date)) {
      issues.push(`CHANGELOG.md ${state.version} section is missing a release date`);
    }
  }
  if (state.git.tagExists) issues.push(`Tag ${state.targetTag} already exists`);
  validateReleaseBase();
}

function validateTagged() {
  if (!state.changelog.released) {
    issues.push(`CHANGELOG.md must contain ## [${state.version}] - YYYY-MM-DD for a pushed tag`);
  } else {
    validateSection(state.changelog.released);
  }
  const pushedTag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";
  if (pushedTag && pushedTag !== state.targetTag) {
    issues.push(`Pushed tag ${pushedTag} does not match package version tag ${state.targetTag}`);
  }
  if (!state.git.tagExists) {
    issues.push(`Tag ${state.targetTag} does not exist`);
  } else if (state.git.tagCommit !== state.git.commit) {
    issues.push(`Tag ${state.targetTag} points to ${state.git.tagCommit}, not current HEAD ${state.git.commit}`);
  }
  if (!state.git.tagsAtHead.includes(state.targetTag)) {
    issues.push(`Current HEAD is not exactly tagged ${state.targetTag}`);
  }
  if (state.git.tagObjectType && state.git.tagObjectType !== "tag") {
    issues.push(`Tag ${state.targetTag} must be an annotated tag, not ${state.git.tagObjectType}`);
  }
  validateReleaseBase();
}

function validateSection(section) {
  if (!hasReleaseContent(section)) {
    issues.push(`CHANGELOG.md ${section.label} section must contain at least one category and change item`);
  }
  const body = meaningfulChangelogBody(section);
  if (/^-\s*$/m.test(body)) issues.push(`CHANGELOG.md ${section.label} section contains an empty list item`);
}

function resolveStage(value) {
  if (value !== "auto") return value;
  return process.env.GITHUB_REF_TYPE === "tag" || process.env.GITHUB_REF?.startsWith("refs/tags/")
    ? "tagged"
    : "candidate";
}

function validateReleaseBase() {
  const releaseBase = process.env.RELEASE_BASE_REF || "origin/main";
  const containingBranches = runGit(
    state.root,
    ["branch", "--remotes", "--contains", state.git.commit],
    { optional: true }
  )
    .split("\n")
    .map((value) => value.trim().replace(/^\*\s*/, ""));
  if (!containingBranches.includes(releaseBase)) {
    issues.push(`Release commit must be contained in ${releaseBase}`);
  }
}
