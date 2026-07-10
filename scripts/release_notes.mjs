import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  loadReleaseState,
  maturityLabel,
  meaningfulChangelogBody,
} from "./release_metadata.mjs";

const mode = process.argv.slice(2).find((value) => !value.startsWith("--")) || "draft";
const state = loadReleaseState();
const section = mode === "final" ? state.changelog.released : state.changelog.released || state.changelog.unreleased;

if (!section) fail(`CHANGELOG.md has no section available for ${state.version}`);
if (mode === "final" && state.git.dirty) fail("Final release notes require a clean Git worktree");
if (mode === "final" && !state.changelog.released) {
  fail(`Final release notes require ## [${state.version}] - YYYY-MM-DD in CHANGELOG.md`);
}
if (!["draft", "final"].includes(mode)) fail(`Unknown release notes mode: ${mode}`);

const outputDir = path.join(state.root, "release-artifacts");
const suffix = mode === "draft" ? "-draft" : "";
const outputPath = path.join(outputDir, `duban-v${state.version}-release-notes${suffix}.md`);
const tagText = state.git.tagExists ? state.targetTag : `${state.targetTag}（待创建）`;
const dirtyText = state.git.dirty ? "（dirty，仅供草稿审阅）" : "";
const content = [
  `# 读伴 ${state.version}`,
  "",
  `> ${maturityLabel(state.maturity)} · formal 发布通道`,
  "",
  meaningfulChangelogBody(section),
  "",
  "## 构建信息",
  "",
  `- App version：\`${state.version}\``,
  `- Git tag：\`${tagText}\``,
  `- Git commit：\`${state.git.commit}\`${dirtyText}`,
  `- SQLite schema：\`${state.schemaVersion}\``,
  `- Backup format：\`${state.backupVersion}\``,
  "",
  "## 安装与数据",
  "",
  "- 本版本仍是本地优先；书库、笔记和阅读进度默认保存在本机。",
  "- 桌面版 API Key 保存在系统 Keychain，不进入备份或诊断包。",
  "- 升级前建议先在设置页导出一次本地备份。",
  "",
].join("\n");

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, content);
console.log(`Release notes written: ${path.relative(state.root, outputPath)}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
