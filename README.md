# 读伴 · Duban

浏览器端 AI 伴读应用。用户上传自己的 PDF 书籍后，读伴先在本地解析文本和章节结构，再帮助用户确认书籍信息、选择阅读目标与节奏，并在正式阅读时提供读前导读、章节伴读问答和读后反思。

当前项目是纯前端 MVP：

- 无后端服务器。
- PDF、章节文本、阅读进度、聊天记录和设置都保存在浏览器 IndexedDB。
- AI 使用 BYOK 模式，用户在设置页填写自己的模型 API Key。
- 当前支持 Anthropic Claude 和 OpenAI-compatible Chat Completions（OpenAI、Kimi、DeepSeek 等）。

更完整的需求共识和开发日志见 [docs/PROJECT_NOTES.md](docs/PROJECT_NOTES.md)。

## 当前能力

- 上传 PDF，并在浏览器本地提取分页文本。
- 读取 PDF outline 或根据标题规则猜测章节。
- 确认书名、作者、章节标题、页码范围和章节用途。
- 将章节分为忽略、导读、正文、附录，避免版权页、目录、前言混入主阅读计划。
- 选择阅读目标、节奏、开始日期和每周阅读日。
- 生成本地阅读计划草稿。
- 进入三段式阅读会话：
  - 读前导入：导师开场、章节导读、阅读目标和读前问题。
  - 正文阅读：左侧独立滚动阅读框默认渲染 PDF 原版页，右侧独立 sidebar。
  - 读后交流：导师式反思问题和笔记入口。
- 正文区默认使用 PDF.js canvas 渲染当前章节页码范围，并叠加 PDF.js text layer，让原版页面文字可选中。
- 每个 PDF 页面提供页码锚点，方便后续定位、引用和选句伴读。
- AI 文本排版能力暂不作为主入口展示，底层生成与缓存能力保留为后续实验入口。
- 手动生成 AI 章节导读，并显示 token 和估算费用。
- 在阅读 sidebar 中基于当前可见页和当前阅读项进行伴读问答，允许适度发散后收束回本书。
- 在 PDF 原版页中选中文字后显示跟随式按钮：可一键解释选中句子，也可把引用作为输入框上方的引子，再向导师追问。
- 将导读、伴读聊天等 prompt 文件化，并共享统一导师人格。

## 技术栈

- Vite
- React
- Tailwind CSS
- PDF.js (`pdfjs-dist`)
- localforage + IndexedDB
- Anthropic Messages API
- OpenAI-compatible Chat Completions

## 运行方式

建议使用 Node.js 18 或以上版本。

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:5173
```

其他命令：

```bash
npm run build
npm run preview
```

## 目录结构

```text
src/
  App.jsx                 应用主壳，负责页面切换和顶层导航
  main.jsx                React 入口
  index.css               Tailwind 入口和全局基础样式

  components/
    Shelf.jsx             书架页：上传 PDF、展示本地书籍、进入配置/阅读
    BookSetup.jsx         书籍信息确认页：编辑书名、作者、章节和章节用途
    ReadingPlanSetup.jsx  阅读目标与节奏页：生成本地阅读计划草稿
    Reader.jsx            阅读会话：读前导入、正文阅读、sidebar 问答、读后反思
    Settings.jsx          设置页：模型供应商、模型清单、API Key、测试连接
    PdfReader.jsx         PDF 原版页渲染：按当前章节页码范围渲染 canvas 页面和 text layer

  lib/
    storage.js            IndexedDB key、设置读写、通用本地存储封装
    books.js              书籍、分页文本、阅读进度的读写
    pdf.js                PDF 解析、文本提取、outline/章节猜测
    text.js               PDF 元数据等非字符串内容的安全文本化
    ai.js                 统一 AI 调用入口，按供应商分发
    claude.js             Anthropic Claude Messages API 调用
    openaiCompatible.js   OpenAI-compatible Chat Completions 调用
    pricing.js            token 费用估算和美元格式化
    readingGuides.js      章节导读生成、解析、保存
    readingChat.js        阅读 sidebar 伴读问答、保存和费用统计
    promptTemplates.js    Markdown prompt 模板加载和变量替换

  prompts/
    mentorPersona.md      共享导师人格和整体表达风格
    readingGuide.md       章节读前导读 prompt
    readingChat.md        阅读中伴读问答 prompt
    readingTextFormat.md  AI 文本排版 prompt，当前主界面暂不展示入口

docs/
  PROJECT_NOTES.md        需求记录、架构共识、开发日志、后续路线
```

## 核心流程

1. 用户在书架页上传 PDF。
2. `pdf.js` 使用 PDF.js 在本地提取分页文本，并尝试识别章节。
3. `books.js` 将书籍元数据、PDF 文件和分页文本写入 IndexedDB。
4. 用户进入 `BookSetup.jsx`，确认书籍信息和章节结构。
5. 用户进入 `ReadingPlanSetup.jsx`，选择阅读目标和节奏，生成本地计划。
6. 用户从书架进入 `Reader.jsx`。
7. Reader 根据当前阅读项拼接章节文本，并按三段式阅读会话呈现。
8. 用户可生成章节导读，或在 sidebar 中向导师提问。
9. PDF 阅读器识别当前可见页，伴读问答会优先带入这一页的提取文本。
10. AI 调用经过 `ai.js` 分发到 Claude 或 OpenAI-compatible 服务。
11. 导读、聊天、进度都保存回 IndexedDB。

## 本地数据

本地存储由 `src/lib/storage.js` 统一管理，底层使用 localforage 封装 IndexedDB。

主要 key：

- `settings`：模型供应商、API Key、模型名、Base URL、价格配置。
- `books`：书籍元数据列表。
- `book:{id}:file`：原始 PDF Blob。
- `book:{id}:pages`：分页文本数组。
- `book:{id}:questions:{planItemKey}`：某个阅读项的章节导读。
- `book:{id}:chat`：伴读聊天记录，内部按阅读项 key 分组。
- `book:{id}:formatted-text:{planItemKey}`：某个阅读项的 AI 排版 Markdown 文本。
- `progress:{id}`：阅读进度。

注意：IndexedDB 适合 MVP 和个人本地试用，但不应视为长期大型书库的最终存储方案。后续可考虑导出/导入、桌面版本地文件系统或 SQLite。

## Prompt 管理

Prompt 不再直接写在业务逻辑里，而是放在 `src/prompts/`。

`mentorPersona.md` 是共享人格，描述导师的总体语气、边界和特色。功能 prompt 通过 `{{mentorPersona}}` 引入它，再补充自己的任务规则。

`promptTemplates.js` 使用 Vite `?raw` 导入 Markdown 文件，并替换形如 `{{bookTitle}}`、`{{chapterText}}` 的变量。这样 prompt 可以像文档一样维护，同时仍然被打包进前端应用。

## 模型与 API Key

设置页支持两类供应商：

- Anthropic Claude
- OpenAI-compatible

OpenAI-compatible 可配置：

- API Key
- Base URL
- 模型名
- 输入/输出每百万 token 价格

模型清单中目前包含 OpenAI、Kimi、DeepSeek 的常用模型。API Key 只保存在本机 IndexedDB，不会写入代码仓库，也不会上传到项目自己的服务器。

纯前端直连第三方 API 可能遇到 CORS 限制。如果某个供应商无法从浏览器直接调用，后续需要增加本地代理或后端代理。

## 后续方向

- 更完整的选中文本批注、高亮和引用管理。
- 读后 AI 反馈和追问。
- AI 生成更完整的阅读计划。
- 阅读位置保存、字号和行距设置。
- 导出/导入书库。
- 为长期使用探索 Tauri/Electron 桌面版或 SQLite 存储。
