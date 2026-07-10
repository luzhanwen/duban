import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadReleaseState } from "./release_metadata.mjs";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const channel = process.env.RELEASE_CHANNEL || "formal";
const kind = process.env.RELEASE_KIND || "local";
const version = packageJson.version;
const arch = normalizeArch(process.env.RELEASE_ARCH || os.arch());
const buildTarget = normalizeBuildTarget(process.env.TAURI_BUILD_TARGET || "");
const targetReleaseDir = buildTarget
  ? path.join(root, "src-tauri", "target", buildTarget, "release")
  : path.join(root, "src-tauri", "target", "release");
const bundleDir = path.join(targetReleaseDir, "bundle");
const outputDir = path.join(root, "release-artifacts");
const releaseId = `duban-v${version}-${channel}-${arch}-${kind}`;
const releaseState = loadReleaseState(root);

if (kind === "signed" && releaseState.git.dirty && process.env.RELEASE_ALLOW_DIRTY !== "1") {
  fail("Signed release manifest requires a clean Git worktree.");
}

if (!existsSync(bundleDir)) {
  fail("Missing Tauri bundle directory. Run npm run package:mac-local or npm run tauri:build:formal first.");
}

const artifactPaths = [...collectFiles(bundleDir)].filter(
  (filePath) => isReleaseArtifact(filePath) && matchesCurrentRelease(filePath)
);
if (!artifactPaths.length) {
  fail(
    `No release artifacts found for version ${version}, channel ${channel} and kind ${kind}. Expected a named .dmg, .zip, .tar.gz, .msi, .exe, .AppImage or .deb file.`
  );
}

mkdirSync(outputDir, { recursive: true });

const artifacts = artifactPaths.map((absolutePath) => {
  const relativePath = path.relative(root, absolutePath);
  const bytes = readFileSync(absolutePath);
  return {
    fileName: path.basename(absolutePath),
    path: relativePath,
    byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});

const manifest = {
  format: "duban.release-manifest",
  version,
  channel,
  kind,
  arch,
  source: {
    commit: releaseState.git.commit,
    commitShort: releaseState.git.commitShort,
    tag: releaseState.git.tagsAtHead.includes(releaseState.targetTag)
      ? releaseState.targetTag
      : null,
    dirty: releaseState.git.dirty,
  },
  schemaVersion: releaseState.schemaVersion,
  backupVersion: releaseState.backupVersion,
  generatedAt: new Date().toISOString(),
  artifacts,
};

const manifestPath = path.join(outputDir, `${releaseId}-manifest.json`);
const checksumsPath = path.join(outputDir, `${releaseId}-checksums.txt`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  checksumsPath,
  artifacts.map((artifact) => `${artifact.sha256}  ${artifact.path}`).join("\n") + "\n"
);

console.log("Release manifest written:");
console.log(path.relative(root, manifestPath));
console.log(path.relative(root, checksumsPath));

function* collectFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      yield* collectFiles(absolutePath);
    } else if (stat.isFile()) {
      yield absolutePath;
    }
  }
}

function isReleaseArtifact(filePath) {
  return /\.(dmg|zip|tar\.gz|msi|exe|AppImage|deb)$/i.test(filePath);
}

function matchesCurrentRelease(filePath) {
  const fileName = path.basename(filePath);
  return fileName.includes(version) && fileName.includes(channel) && fileName.includes(kind);
}

function normalizeArch(value) {
  if (value === "arm64") return "arm64";
  if (value === "x64") return "x64";
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function normalizeBuildTarget(value) {
  const normalized = String(value).trim();
  if (!normalized) return "";
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) fail(`Invalid TAURI_BUILD_TARGET: ${normalized}`);
  return normalized;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
