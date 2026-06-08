# 读伴 · Duban

<p align="center">
  <img src="./public/logo.svg" alt="读伴 logo" width="96" />
</p>

<p align="center">
  一个本地优先的 AI 伴读应用：把 PDF/MOBI 书籍变成有节奏、有提问、有笔记、有复盘的阅读会话。
</p>

读伴不是普通 PDF 阅读器。它会先在浏览器本地解析书籍结构，帮助用户确认章节，再由 AI 整理整本书的开书导读；用户基于这份导读确定阅读节奏和本书读伴侧重点。正式阅读时，读伴继续提供读前导读、阅读中问答、高亮笔记和读后追问。

当前项目是纯前端 MVP：

- 本地优先：原始书籍文件、分页文本、阅读进度、聊天记录、笔记和设置都保存在浏览器 IndexedDB。
- BYOK：用户在设置页填写自己的模型 API Key。
- 无项目后端：前端直接调用模型供应商接口。
- 多供应商：支持 Anthropic Claude 和 OpenAI-compatible Chat Completions。

更完整的需求共识、设计决策和开发日志见 [docs/PROJECT_NOTES.md](docs/PROJECT_NOTES.md)，阶段路线见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 体验路径

```text
上传 PDF 或 MOBI
  -> 确认书籍信息和章节结构
  -> 读伴分析整本书
  -> 选择阅读节奏和读伴侧重点
  -> 进入每日阅读
  -> 读前导读
  -> PDF 原版阅读 / MOBI 文本阅读 + 读伴问答 + 高亮笔记
  -> 读后交流
  -> 完成今日任务或提前进入下一章
```

## 当前能力

### 书架与解析

- 上传 PDF 或 MOBI，并在浏览器本地提取分页文本。
- PDF 读取 outline；没有 outline 时，根据标题规则猜测章节。
- MOBI 读取 metadata、TOC/spine 和章节 HTML，并转换为可阅读文本页。
- 支持编辑书名、作者、章节标题、起止页和章节用途。
- 章节用途包括：忽略、导读、正文、附录。
- 书架展示阅读进度、最近读到的位置、连续打卡天数和互动统计。
- 书架卡片提供「阅读目录」入口，可以按章节/阅读日查看已读、阅读中和未读内容。

### 开书分析与阅读计划

- 支持生成整本书开书导读，整理全书问题、结构地图、阅读难点和建议读法。
- 支持选择阅读节奏、开始日期、每周阅读日和是否拆分长章节。
- 支持设置本书读伴侧重点，例如抓主线、补背景、拆论证、联系现实或沉淀输出。
- 根据章节用途、阅读节奏和读伴侧重点生成本地阅读计划草稿。
- 导读章节合并为开始前准备，正文进入主阅读计划。
- 每日阅读完成后不会自动跳到下一章，而是显示完成页：
  - 退回书架
  - 提前开始下一章阅读
- 完成页也提供阅读目录，方便当天读完后回顾今天或以前的内容。

### 阅读会话

Reader 是三段式阅读会话：

| 阶段 | 作用 |
| --- | --- |
| 读前导读 | 读伴说明今天读什么、接上一次阅读的位置，以及今天往哪里推进 |
| 正文阅读 | 左侧 PDF 原版页或 MOBI 文本页阅读，右侧 sidebar 提供问答、提示、笔记和阅读项切换 |
| 读后交流 | 用户点“我读完了”后，读伴用开放问题开始追问，并根据回答继续追问 |

正文阅读能力：

- PDF 使用 PDF.js canvas 渲染当前阅读项页码范围。
- PDF 叠加 PDF.js text layer，让原版页面文字可选中。
- MOBI 使用文本阅读器展示解析后的文本页。
- 自动记录当前阅读项和最近页码/文本页，再次进入时回到上次位置。
- 阅读器识别当前可见页，读伴问答会优先带入当前页文本。
- 阅读器 sidebar 的「阅读项」面板会标记已读、阅读中和未读；点击已读项会进入正文回顾。
- 退出阅读器时隐藏全局导航，减少正式阅读时的干扰。

### AI 导读与读伴

- 手动生成当前阅读项导读，避免自动消耗 token。
- 导读基于当前阅读项对应章节文本生成，并缓存到本地。
- 导读 overview 支持结构化 Markdown：短标题、短段落、引用、加粗和分割线。
- 整本书开书导读默认展示压缩版，完整导读底稿可展开查看。
- 第二天及之后的导读会承上启下，不会每次都重新介绍整本书。
- 导读结果收敛为：
  - 本章概览
  - 3 个阅读目标
  - 3 个读前问题
- 重新生成导读时会先清空旧内容，只显示生成中的状态卡。
- 阅读 sidebar 中可以自由向读伴提问，也可以把导读目标/问题一键发给读伴聊聊。
- 读后交流可以选择带入本阅读项的伴读问答、高亮和笔记上下文。

### 高亮与笔记

- PDF 选中文字后显示跟随式操作：
  - 问 读伴
  - 添加笔记
- 选中文本可保存为高亮笔记。
- 读伴回答可一键记到本章笔记；有原文引用时，会尽量挂回对应页高亮。
- 导读里的每个目标和问题都可以直接“我要记笔记”。
- 待保存笔记使用浮窗编辑，支持拖动、键盘微调和回到底部初始位置。
- 笔记支持 Markdown 编辑与渲染。

### 品牌体验

- 顶部导航使用 `BrandLogo`：打开的书页 + 对话气泡。
- `public/logo.svg` 作为独立品牌资产和 favicon。
- 界面中的“读伴”二字使用更纤细、偏手写的品牌字体。
- Markdown 渲染器会识别动态文本中的“读伴”，并套用品牌字形。
- 应用启动时显示一次 logo 开屏动画，并尊重 `prefers-reduced-motion`。

## 技术栈

| 类型 | 选择 |
| --- | --- |
| 构建 | Vite |
| UI | React + Tailwind CSS |
| PDF | PDF.js (`pdfjs-dist`) |
| MOBI | `@lingo-reader/mobi-parser` |
| 本地存储 | localforage + IndexedDB |
| AI | Anthropic Messages API, OpenAI-compatible Chat Completions |
| Prompt | Markdown 模板 + Vite `?raw` |

## 本地运行

建议使用 Node.js 18 或以上版本。

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:5173
```

常用命令：

```bash
npm run build
npm run build:formal
npm run build:test
npm run preview
```

## 版本通道

读伴有两个前端版本通道：

| 通道 | 命令 | 说明 |
| --- | --- | --- |
| `test` | `npm run dev`, `npm run build:test` | 显示书架里的本地测试书入口 |
| `formal` | `npm run build`, `npm run build:formal` | 隐藏本地测试书入口，并从构建产物移除 `dist/test-books` |

本地测试 PDF 放在 `public/test-books/` 下，但 `*.pdf` 已被 `.gitignore` 忽略，避免把版权书误提交到仓库。

## 目录结构

```text
src/
  App.jsx                 应用主壳，负责页面切换、导航和开屏
  main.jsx                React 入口
  index.css               Tailwind 入口、全局样式和品牌动画

  components/
    BrandLogo.jsx         logo、品牌字形和动态文本品牌渲染
    SplashScreen.jsx      应用开屏动画
    Shelf.jsx             书架页：上传 PDF/MOBI、展示书籍和阅读状态
    BookSetup.jsx         书籍信息确认：编辑书名、作者、章节和用途
    ReadingPlanSetup.jsx  开书分析：整本书导读、节奏、读伴侧重点和计划草稿
    Reader.jsx            阅读会话：导读、正文阅读、sidebar、笔记、读后交流
    PdfReader.jsx         PDF 原版页渲染：canvas 页面、text layer、选区、高亮
    TextBookReader.jsx    MOBI 文本页阅读：文本分页、选区、当前页识别
    Settings.jsx          设置页：供应商、模型、API Key、价格和连接测试

  lib/
    storage.js            IndexedDB key、设置读写、通用本地存储封装
    books.js              书籍、原始文件、分页文本和阅读进度读写
    bookFormats.js        书籍格式识别和格式相关展示文案
    pdf.js                PDF 解析、文本提取、outline/章节猜测
    mobi.js               MOBI 解析、文本提取、TOC/spine 章节生成
    ai.js                 统一 AI 调用入口
    claude.js             Anthropic Claude 调用
    openaiCompatible.js   OpenAI-compatible 调用
    pricing.js            token 费用估算
    readingGuides.js      章节导读生成、解析和保存
    readingChat.js        阅读中伴读问答
    readingReflection.js  读后交流追问
    notes.js              高亮和笔记读写
    promptTemplates.js    Markdown prompt 模板加载和变量替换

  prompts/
    mentorPersona.md      共享读伴人格与表达风格
    wholeBookGuide.md     整本书开书导读 prompt
    readingGuide.md       章节读前导读 prompt
    readingChat.md        阅读中伴读问答 prompt
    readingReflection.md  读后交流 prompt

docs/
  PROJECT_NOTES.md        需求记录、架构共识、开发日志、后续路线
  ROADMAP.md              路线图
```

## 本地数据

本地存储由 `src/lib/storage.js` 统一管理，底层使用 localforage 封装 IndexedDB。

主要 key：

| Key | 内容 |
| --- | --- |
| `settings` | 模型供应商、API Key、模型名、Base URL、价格配置 |
| `books` | 书籍元数据列表 |
| `book:{id}:file` | 原始书籍 Blob |
| `book:{id}:pages` | 分页/文本页文本数组 |
| `book:{id}:questions:{planItemKey}` | 当前阅读项的章节导读缓存 |
| `book:{id}:chat` | 伴读聊天记录，内部按阅读项 key 分组 |
| `book:{id}:reflection` | 读后交流记录，内部按阅读项 key 分组 |
| `book:{id}:notes` | 高亮和笔记，内部按阅读项 key 分组 |
| `book:{id}:formatted-text:{planItemKey}` | AI 排版 Markdown 文本缓存，当前主入口暂不展示 |
| `progress:{id}` | 阅读进度、当前阅读项、最近页码和打卡日期 |

IndexedDB 适合 MVP 和个人本地试用，但不应视为长期大型书库的最终存储方案。后续可考虑导出/导入、桌面版本地文件系统或 SQLite。

## Prompt 管理

Prompt 不直接写在业务逻辑里，而是集中放在 `src/prompts/`。

- `mentorPersona.md` 是共享读伴人格，描述语气、边界和陪读方式。
- 功能 prompt 通过 `{{mentorPersona}}` 引入共享人格，再补充自己的任务规则。
- `promptTemplates.js` 使用 Vite `?raw` 导入 Markdown 文件，并替换 `{{bookTitle}}`、`{{chapterText}}` 等变量。

这样 prompt 可以像产品文档一样维护，同时仍然被打包进前端应用。

## 模型与 API Key

设置页支持两类供应商：

- Anthropic Claude
- OpenAI-compatible

OpenAI-compatible 可配置 API Key、Base URL、模型名，以及输入/输出每百万 token 价格。模型清单中目前包含 OpenAI、Kimi、DeepSeek 的常用模型。

设置页支持从 TXT 文档批量导入 AI 配置，模板见 `public/ai-config-template.txt`。模板已预填 Anthropic、OpenAI、DeepSeek、Kimi 等常用供应商；只填一个供应商的 API Key 时，会自动把它设为当前默认。设置页也可以把当前 AI 配置下载成可重新导入的 TXT，导出文件会包含 API Key，请妥善保管。

API Key 只保存在本机 IndexedDB，不会写入代码仓库，也不会上传到项目自己的服务器。

纯前端直连第三方 API 可能遇到 CORS 限制。如果某个供应商无法从浏览器直接调用，后续需要增加本地代理或后端代理。

## 后续方向

- 更完整的引用来源和页码证据链。
- 更强的高亮、批注、笔记管理和导出。
- AI 生成更自然的整体阅读计划。
- 字号、行距、阅读宽度等阅读设置。
- 导出/导入书库。
- 为长期使用探索 Tauri/Electron 桌面版或 SQLite 存储。
