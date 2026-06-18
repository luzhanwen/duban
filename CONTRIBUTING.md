# Contributing

谢谢你愿意改进读伴。这个项目当前处于 public alpha 阶段，优先级是让本地优先、BYOK、AI 伴读这条主线稳定可信。

## Development Setup

建议使用 Node.js 18 或以上版本。

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build
npm run build:formal
npm run build:test
npm run preview
```

## Project Principles

- 本地优先：书籍、进度、笔记和聊天记录默认留在浏览器本地。
- BYOK：用户自己提供模型 API Key，项目不内置共享密钥。
- 不默认上传书籍：只有用户主动使用 AI 功能时，必要文本才会发送给模型服务商。
- 阅读优先：AI 功能应围绕读前导读、正文理解、笔记和读后反思服务，不把产品变成泛聊天入口。
- 克制改动：尽量沿用现有 React、Tailwind、IndexedDB/localforage 和 prompt 模板结构。

## Before You Open A Pull Request

请确认：

- 没有提交 `.env`、真实 API Key、个人书籍文件、截图中的密钥或本地配置。
- 没有把版权受限 PDF/MOBI 放进仓库。
- 涉及 API Key、Base URL、本地存储、文件解析或 Markdown 渲染的改动，已经从隐私和安全角度检查过。
- 用户可见文案清楚说明数据会存在哪里、什么时候发送给第三方。
- UI 改动在桌面和移动宽度下都不会遮挡正文阅读、设置表单或关键按钮。

建议至少运行：

```bash
npm run build:formal
```

如果改动依赖或构建链，也请运行：

```bash
npm audit --omit=dev
npm audit
```

## Pull Request Style

PR 描述建议包含：

- 改动目的。
- 主要文件。
- 验证方式。
- 已知限制或后续事项。

请保持 PR 范围集中。安全、存储迁移、阅读器交互和 AI prompt 行为都容易互相影响，最好拆成较小的、可以独立验证的改动。

## Privacy And Security Guardrails

涉及以下区域时请格外小心：

- `src/lib/storage.js`：本地数据结构和 IndexedDB key。
- `src/lib/claude.js`、`src/lib/openaiCompatible.js`、`src/lib/ai.js`：模型请求、API Key 和 Base URL。
- `src/lib/pdf.js`、`src/lib/mobi.js`：用户上传文件解析。
- `src/components/Reader.jsx`、`src/components/PdfReader.jsx`、`src/components/TextBookReader.jsx`：正文阅读、选区、笔记和 AI 上下文。
- `src/components/Settings.jsx`：配置导入导出、Key 保存、连接测试。

不要把模型返回内容当成可信 HTML 注入页面。当前项目应继续使用 React 文本渲染或受控的 Markdown 子集。

## Documentation

如果你改变了用户数据流、API Key 处理、模型服务商配置、上传文件处理或导出行为，请同步更新：

- `README.md`
- `PRIVACY.md`
- `SECURITY.md`
- `docs/ROADMAP.md` 或 `docs/PROJECT_NOTES.md` 中相关部分
