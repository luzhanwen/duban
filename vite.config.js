import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 配置：启用 React 插件（支持 JSX 与快速刷新）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // 本地开发端口，运行 npm run dev 后访问 http://localhost:5173
    open: true, // 启动时自动打开浏览器
  },
});
