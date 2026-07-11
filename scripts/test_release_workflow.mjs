import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "duban-release-test-"));
const remoteRoot = `${fixtureRoot}-remote.git`;
const version = "1.2.3-alpha.1";
const tag = `v${version}`;

try {
  write("package.json", `${JSON.stringify({ name: "duban-release-test", version }, null, 2)}\n`);
  write(".gitignore", "src-tauri/target/\nrelease-artifacts/\n");
  write(
    "src-tauri/src/storage.rs",
    'const CURRENT_SCHEMA_VERSION: &str = "9";\nconst BACKUP_VERSION: u32 = 3;\n'
  );
  write(
    "CHANGELOG.md",
    [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      `目标版本：\`${version}\``,
      "",
      "### Added",
      "",
      "- Release state fixture.",
      "",
      "## [1.0.0] - 2026-01-01",
      "",
      "- Historical fixture.",
      "",
    ].join("\n")
  );

  git(["init", "-b", "main"]);
  git(["config", "user.name", "Duban Release Test"]);
  git(["config", "user.email", "release-test@example.invalid"]);
  git(["add", "."]);
  git(["commit", "-m", "candidate fixture"]);
  git(["update-ref", "refs/remotes/origin/main", "HEAD"]);

  runNode("release_check.mjs", ["candidate"]);
  runNode("release_prepare.mjs", ["--date=2026-07-10"]);
  const preparedChangelog = readFileSync(path.join(fixtureRoot, "CHANGELOG.md"), "utf8");
  if (!preparedChangelog.includes("- Release state fixture.\n\n## [1.0.0]")) {
    throw new Error("Prepared changelog did not preserve a blank line before historical releases");
  }
  git(["add", "CHANGELOG.md"]);
  git(["commit", "-m", `prepare ${tag}`]);
  git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
  runNode("release_check.mjs", ["tag-ready"]);
  git(["tag", "-a", tag, "-m", `Release ${version}`]);

  execFileSync("git", ["clone", "--bare", fixtureRoot, remoteRoot], { encoding: "utf8" });
  git(["tag", "--force", tag, "HEAD"]);
  if (git(["cat-file", "-t", tag]) !== "commit") {
    throw new Error("Lightweight checkout tag fixture was not created");
  }
  git(["fetch", "--force", remoteRoot, `refs/tags/${tag}:refs/tags/${tag}`]);
  if (git(["cat-file", "-t", tag]) !== "tag") {
    throw new Error("Explicit tag fetch did not restore the annotated tag object");
  }

  const artifactPath = `src-tauri/target/release/bundle/dmg/读伴_${version}_formal_arm64_signed.dmg`;
  const artifactBytes = Buffer.from("synthetic signed dmg fixture\n", "utf8");
  write(artifactPath, artifactBytes);
  const releaseId = `duban-v${version}-formal-arm64-signed`;
  runNode("release_manifest.mjs", [], { RELEASE_ARCH: "arm64", RELEASE_KIND: "signed" });
  runNode("release_notes.mjs", ["final"]);
  write(
    `release-artifacts/${releaseId}-notary-log.json`,
    `${JSON.stringify({ id: "fixture", status: "Accepted" }, null, 2)}\n`
  );

  runNode("release_check.mjs", ["tagged"], {
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF_NAME: tag,
  });
  runNode("release_publish.mjs", ["--dry-run"], {
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF_NAME: tag,
    RELEASE_ARCH: "arm64",
  });

  write("dirty.txt", "dirty\n");
  const dirtyCheck = runNode("release_check.mjs", ["tagged"], {}, { expectFailure: true });
  if (!dirtyCheck.includes("Git worktree is dirty")) {
    throw new Error("Dirty release fixture was not rejected for the expected reason");
  }

  console.log("Release workflow self-test passed.");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(remoteRoot, { recursive: true, force: true });
}

function runNode(scriptName, args, extraEnv = {}, { expectFailure = false } = {}) {
  const result = spawnSync(process.execPath, [path.join(scriptsDir, scriptName), ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...process.env, RELEASE_ROOT: fixtureRoot, ...extraEnv },
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (!expectFailure && result.status !== 0) throw new Error(output.trim());
  if (expectFailure && result.status === 0) throw new Error(`${scriptName} unexpectedly passed`);
  return output;
}

function git(args) {
  return execFileSync("git", args, { cwd: fixtureRoot, encoding: "utf8" }).trim();
}

function write(relativePath, content) {
  const absolutePath = path.join(fixtureRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}
