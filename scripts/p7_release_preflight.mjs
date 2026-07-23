import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const issues = [];
const packageJson = readJson("package.json");

expectScript("test:p7", "test:companion-diagnostics");
expectScript("test:p7", "test:p7-qa-cases");
expectScript("p7:preflight", "p7_release_preflight.mjs");
expectFile("docs/P7_RELEASE_CHECKLIST.md");
expectContains("src/lib/companionDiagnostics.js", "buildCompanionDiagnosticContext");
expectContains("src/lib/companionDiagnostics.js", "safeReference");
expectContains("src/lib/companionPolicy.js", "只响应用户主动发起的导读、提问、笔记或读后回想");
expectContains("src/components/Settings.jsx", "AI 调用与选材");
expectContains("qa-fixtures/p7/companion-context-cases.json", "narrow-window");

const dist = path.join(root, "dist");
if (!existsSync(dist)) {
  issues.push("dist is missing; run npm run build:formal first");
} else {
  const forbidden = [
    "DUBAN_P7_DIAGNOSTIC_TEST_SECRET",
    "qa-fixtures/p7/companion-context-cases.json",
    "导入测试",
  ];
  for (const file of walk(dist)) {
    if (statSync(file).size > 2_000_000) continue;
    const content = readFileSync(file, "utf8");
    for (const token of forbidden) {
      if (content.includes(token)) issues.push(`formal dist contains forbidden P7 token ${token}`);
    }
  }
}

if (issues.length) {
  console.error("P7 release preflight failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log("P7 release preflight passed.");

function expectScript(name, token) {
  if (!String(packageJson.scripts?.[name] || "").includes(token)) {
    issues.push(`package.json script ${name} must include ${token}`);
  }
}

function expectFile(relativePath) {
  if (!existsSync(path.join(root, relativePath))) issues.push(`missing ${relativePath}`);
}

function expectContains(relativePath, token) {
  if (!readFileSync(path.join(root, relativePath), "utf8").includes(token)) {
    issues.push(`${relativePath} must include ${token}`);
  }
}

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) yield* walk(absolute);
    else if (stat.isFile()) yield absolute;
  }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}
