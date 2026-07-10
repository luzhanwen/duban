import { writeFileSync } from "node:fs";
import {
  changelogTarget,
  hasReleaseContent,
  loadReleaseState,
  meaningfulChangelogBody,
} from "./release_metadata.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const allowDirty = args.includes("--allow-dirty");
const dateArgument = args.find((value) => value.startsWith("--date="))?.slice("--date=".length);
const releaseDate = dateArgument || new Date().toISOString().slice(0, 10);
const state = loadReleaseState();
const issues = [];

if (!state.validSemver) issues.push(`Invalid package version: ${state.version}`);
if (state.git.dirty && !allowDirty) issues.push("Git worktree must be clean before preparing a release");
if (allowDirty && !dryRun) issues.push("--allow-dirty may only be used with --dry-run");
if (state.git.tagExists) issues.push(`Tag ${state.targetTag} already exists`);
if (state.changelog.released) issues.push(`CHANGELOG.md already contains a ${state.version} release section`);
if (!state.changelog.unreleased) issues.push("CHANGELOG.md is missing [Unreleased]");
if (changelogTarget(state.changelog.unreleased) !== state.version) {
  issues.push(`CHANGELOG.md Unreleased target must be ${state.version}`);
}
if (!hasReleaseContent(state.changelog.unreleased)) {
  issues.push("CHANGELOG.md Unreleased section has no release content");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) issues.push(`Invalid release date: ${releaseDate}`);

if (issues.length) {
  console.error("Release preparation failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

const body = meaningfulChangelogBody(state.changelog.unreleased);
const replacement = [
  "## [Unreleased]",
  "",
  "目标版本：`待定`",
  "",
  `## [${state.version}] - ${releaseDate}`,
  "",
  body,
  "",
].join("\n");
const nextText =
  state.changelogText.slice(0, state.changelog.unreleased.start) +
  replacement +
  state.changelogText.slice(state.changelog.unreleased.end);

if (dryRun) {
  console.log(`Release preparation dry run passed for ${state.targetTag}.`);
  console.log(`- would create: ## [${state.version}] - ${releaseDate}`);
  console.log("- would reset Unreleased target to: 待定");
  process.exit(0);
}

writeFileSync(`${state.root}/CHANGELOG.md`, nextText);
console.log(`Prepared CHANGELOG.md for ${state.targetTag}.`);
console.log("Commit the changelog, then run: npm run release:check -- tag-ready");
