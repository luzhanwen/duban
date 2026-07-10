import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const storageVersions = readStorageVersions();

// Vite 配置：启用 React 插件（支持 JSX 与快速刷新）
export default defineConfig(({ mode }) => {
  const channel = mode === "test" ? "test" : "formal";
  const tauriDevHost = process.env.TAURI_DEV_HOST;
  const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM || tauriDevHost);
  const buildInfo = resolveBuildInfo(channel);

  return {
    plugins: [react(), formalBuildGuard(channel)],
    clearScreen: false,
    define: {
      __DUBAN_BUILD_INFO__: JSON.stringify(buildInfo),
    },
    server: {
      port: 5173, // 本地开发端口，运行 npm run dev 后访问 http://localhost:5173
      strictPort: true, // Tauri 需要 devUrl 端口固定
      host: tauriDevHost || false,
      hmr: tauriDevHost
        ? {
            protocol: "ws",
            host: tauriDevHost,
            port: 1421,
          }
        : undefined,
      open: !isTauri, // Tauri dev 时只打开桌面窗口，不额外打开浏览器
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    build: {
      target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
      minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
      sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    },
  };
});

function resolveBuildInfo(channel) {
  const commit = resolveGitCommit();
  return {
    appVersion: packageJson.version,
    channel,
    commit: commit.full,
    commitShort: commit.short,
    dirty: commit.dirty,
    schemaVersion: storageVersions.schemaVersion,
    backupVersion: storageVersions.backupVersion,
  };
}

function readStorageVersions() {
  const source = readFileSync(path.join(rootDir, "src-tauri/src/storage.rs"), "utf8");
  const schemaVersion = source.match(/const CURRENT_SCHEMA_VERSION: &str = "([^"]+)";/)?.[1];
  const backupVersion = source.match(/const BACKUP_VERSION: u32 = (\d+);/)?.[1];
  if (!schemaVersion || !backupVersion) {
    throw new Error("Unable to read schema/backup versions from src-tauri/src/storage.rs");
  }
  return { schemaVersion, backupVersion };
}

function resolveGitCommit() {
  const explicitCommit = process.env.DUBAN_BUILD_COMMIT || process.env.GITHUB_SHA;
  const full = explicitCommit || runGit(["rev-parse", "HEAD"]) || "unknown";
  const dirtyOverride = process.env.DUBAN_BUILD_DIRTY;
  const dirty =
    dirtyOverride === undefined
      ? Boolean(runGit(["status", "--porcelain"]))
      : /^(1|true|yes)$/i.test(dirtyOverride);
  return {
    full,
    short: full === "unknown" ? "unknown" : full.slice(0, 12),
    dirty,
  };
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function formalBuildGuard(channel) {
  return {
    name: "duban-formal-build-guard",
    apply: "build",
    async closeBundle() {
      if (channel === "test") return;

      const distDir = path.join(rootDir, "dist");
      await fs.rm(path.join(distDir, "test-books"), {
        recursive: true,
        force: true,
      });
      await assertFormalDistHasNoTestEntrypoints(distDir);
    },
  };
}

async function assertFormalDistHasNoTestEntrypoints(distDir) {
  const forbidden = ["/test-books/", "test-books/wanli15.pdf", "导入测试"];
  for await (const filePath of walkFiles(distDir)) {
    const stat = await fs.stat(filePath);
    if (stat.size > 2_000_000) continue;
    const content = await fs.readFile(filePath, "utf8");
    const matched = forbidden.find((token) => content.includes(token));
    if (matched) {
      throw new Error(`Formal build leaked test-only token ${matched} in ${path.relative(rootDir, filePath)}`);
    }
  }
}

async function* walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(absolutePath);
    } else if (entry.isFile()) {
      yield absolutePath;
    }
  }
}
