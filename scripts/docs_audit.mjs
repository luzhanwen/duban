import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");
const docsIndexPath = path.join(docsDir, "README.md");

const markdownFiles = await collectMarkdownFiles(docsDir);
const docsIndex = await readFile(docsIndexPath, "utf8");
const errors = [];

for (const file of markdownFiles) {
  const source = await readFile(file, "utf8");
  for (const target of extractLocalMarkdownTargets(source)) {
    const targetPath = path.resolve(path.dirname(file), decodeURIComponent(target));
    try {
      await access(targetPath);
    } catch {
      errors.push(`${relative(file)} -> missing ${target}`);
    }
  }
}

for (const file of markdownFiles) {
  if (path.dirname(file) !== docsDir || file === docsIndexPath) continue;
  const expectedLink = `./${path.basename(file)}`;
  if (!docsIndex.includes(expectedLink)) {
    errors.push(`${relative(file)} is not indexed by docs/README.md`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const storageSource = await readFile(path.join(root, "src-tauri/src/storage.rs"), "utf8");
const schemaVersion = storageSource.match(/CURRENT_SCHEMA_VERSION:\s*&str\s*=\s*"(\d+)"/)?.[1];
const backupVersion = storageSource.match(/BACKUP_VERSION:\s*u32\s*=\s*(\d+)/)?.[1];

assert.ok(schemaVersion, "Could not read CURRENT_SCHEMA_VERSION from storage.rs");
assert.ok(backupVersion, "Could not read BACKUP_VERSION from storage.rs");

const [roadmap, versioning, storageDocs, releaseProcess, companionPlan, appLog, handoff] = await Promise.all([
  read("docs/ROADMAP.md"),
  read("docs/VERSIONING.md"),
  read("docs/DESKTOP_STORAGE_SCHEMA.md"),
  read("docs/RELEASE_PROCESS.md"),
  read("docs/COMPANION_ACTIVE_READING_PLAN.md"),
  read("docs/APP_EVOLUTION_LOG.md"),
  read("docs/AI_HANDOFF_PROMPTS.md"),
]);

for (const [name, source] of [
  ["docs/README.md", docsIndex],
  ["docs/VERSIONING.md", versioning],
  ["docs/RELEASE_PROCESS.md", releaseProcess],
]) {
  if (!source.includes(packageJson.version)) {
    errors.push(`${name} does not mention current package version ${packageJson.version}`);
  }
}

for (const [name, source] of [
  ["docs/README.md", docsIndex],
  ["docs/ROADMAP.md", roadmap],
  ["docs/COMPANION_ACTIVE_READING_PLAN.md", companionPlan],
  ["docs/AI_HANDOFF_PROMPTS.md", handoff],
]) {
  if (/下一步(?:是|为|进入)?[^\n]*P7\.(?:10|11)/.test(source)) {
    errors.push(`${name} still identifies completed P7 as the next step`);
  }
}

if (!storageDocs.includes(`schema \`${schemaVersion}\``)) {
  errors.push(`docs/DESKTOP_STORAGE_SCHEMA.md does not mention schema ${schemaVersion}`);
}
if (!new RegExp(`backupVersion[^\\n]*[\\x60]${backupVersion}[\\x60]`).test(storageDocs)) {
  errors.push(`docs/DESKTOP_STORAGE_SCHEMA.md does not mention backupVersion ${backupVersion}`);
}

for (const [name, source] of [
  ["docs/README.md", docsIndex],
  ["docs/ROADMAP.md", roadmap],
  ["docs/COMPANION_ACTIVE_READING_PLAN.md", companionPlan],
  ["docs/APP_EVOLUTION_LOG.md", appLog],
  ["docs/AI_HANDOFF_PROMPTS.md", handoff],
]) {
  if (!source.includes("P8.1")) {
    errors.push(`${name} does not identify P8.1 as the current next step`);
  }
}

for (const [name, source] of [
  ["docs/README.md", docsIndex],
  ["docs/ROADMAP.md", roadmap],
  ["docs/COMPANION_ACTIVE_READING_PLAN.md", companionPlan],
  ["docs/AI_HANDOFF_PROMPTS.md", handoff],
]) {
  if (!/P7(?:\.1-P7\.11| 已完成)/.test(source)) {
    errors.push(`${name} does not mark P7 complete`);
  }
}

if (roadmap.includes("P7 主动陪读引擎阶段")) {
  errors.push("docs/ROADMAP.md still describes P7 as the removed active-intervention engine");
}

if (errors.length > 0) {
  console.error("Documentation audit failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Documentation audit passed (${markdownFiles.length} docs, App ${packageJson.version}, schema ${schemaVersion}, backup v${backupVersion}).`
);

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(absolute)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function extractLocalMarkdownTargets(source) {
  const targets = [];
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of source.matchAll(linkPattern)) {
    let target = match[1].trim();
    if (!target || target.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    target = target.split("#", 1)[0];
    if (target) targets.push(target);
  }
  return targets;
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function relative(file) {
  return path.relative(root, file);
}
