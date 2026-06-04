import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Vite 配置：启用 React 插件（支持 JSX 与快速刷新）
export default defineConfig(({ mode }) => {
  const channel = mode === "test" ? "test" : "formal";

  return {
    plugins: [react(), formalBuildGuard(channel)],
    server: {
      port: 5173, // 本地开发端口，运行 npm run dev 后访问 http://localhost:5173
      open: true, // 启动时自动打开浏览器
    },
  };
});

function formalBuildGuard(channel) {
  return {
    name: "duban-formal-build-guard",
    apply: "build",
    async closeBundle() {
      if (channel === "test") return;

      await fs.rm(path.join(rootDir, "dist", "test-books"), {
        recursive: true,
        force: true,
      });
    },
  };
}
