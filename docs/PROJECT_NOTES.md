# 读伴项目记录

> 最后更新：2026-07-08

这份文档用于记录「读伴」的产品需求、架构共识和开发日志。README 保持简短，这里保留更完整的上下文，方便后续继续迭代时不丢失方向。

文档分工见 [docs/README.md](./README.md)。简单来说：本文件记录项目总上下文和完整开发日志；路线优先级写入 [ROADMAP.md](./ROADMAP.md)；App 化专项记录写入 [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md)；阶段 5 之后的生产级升级步骤写入 [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md)；产品内提示词规范写入 [PROMPT_WRITING_STANDARDS.md](./PROMPT_WRITING_STANDARDS.md)；具体 UI 与交互改动写入 [UI_CHANGELOG.md](./UI_CHANGELOG.md)。

## 产品愿景

读伴不是普通 PDF 阅读器，而是一个带教学节奏的 AI 伴读应用。

用户上传自己的 PDF 或 MOBI 书籍后，应用先在本地解析书籍结构，再由 AI 读伴为整本书建立入口地图：这本书在解决什么问题、结构如何展开、适合怎样读。用户再和读伴一起确定阅读节奏，以及本书读伴应该重点帮自己解决什么问题。后续每章导读、阅读中问答和读后交流，都要带着这份“开书契约”推进。

## 核心流程

1. 用户上传 PDF 或 MOBI。
2. 应用在本地提取文本、识别目录或章节标题。
3. 用户确认书籍信息、作者、章节页码和章节用途。
4. 用户点击「让读伴分析这本书」，AI 生成整本书导读 `wholeBookGuide`。
5. 读伴基于整本书导读，询问用户希望用什么节奏读，以及本书读伴要重点帮用户解决什么问题。
6. 应用保存新的 `readingProfile`，其中包含阅读节奏和 `companionFocus`。
7. 应用基于整本书导读、章节结构、阅读节奏和读伴侧重点生成阅读计划。
8. 用户进入文本阅读器，按阅读计划逐项阅读并标记完成。
9. 每章导读、阅读中问答和读后交流都带入 `wholeBookGuide` 与 `companionFocus`。

## 已确认需求

### 书籍解析

- PDF 第一版先做文本提取和目录/章节识别。
- MOBI 使用浏览器端解析器读取 metadata、toc/spine 和章节 HTML，再清洗为文本页。
- 图片和表格暂时弱处理，不作为核心能力；MOBI 内嵌图片当前也不渲染。
- PDF 章节识别优先使用 PDF outline；没有 outline 时，根据每页开头标题特征猜测。
- MOBI 章节优先使用 TOC 映射；TOC 不完整时按 spine 顺序生成章节。
- 用户必须能手动编辑章节标题、起始页和结束页。

### 章节用途

章节不能全部视为同一种阅读单元。每个章节有一个用途：

- `忽略`：版权页、目录等，不进入阅读计划。
- `导读`：Welcome、About this publication、前言、序言等，作为开始前准备。
- `正文`：正式进入阅读计划，后续生成导读问题和测验。
- `附录`：保留为资料，不进入主阅读计划。

当前自动分类规则：

- Copyright Page、Contents、Table of Contents、目录、版权页 -> 忽略
- Welcome、About this publication、Preface、Foreword、前言、序言等 -> 导读
- Appendix、Glossary、References、Index、附录、术语表、参考文献等 -> 附录
- 其他默认 -> 正文

### 开书分析与阅读计划

阅读计划设置不应该是一个孤立表单，而应该是上传一本书后的“开书分析流程”。

目标流程：

- 上传并确认章节后，用户不再先填阅读目标表单，而是点击「让读伴分析这本书」。
- AI 先生成整本书导读 `wholeBookGuide`，帮助用户理解这本书的核心问题、结构地图、阅读难点和可选读法。
- `wholeBookGuide` 生成后，读伴再引导用户确认两件事：
  - 阅读节奏：每次读多久、每周读几天、是否要拆长章节、是否有期望完成时间。
  - 读伴侧重点：这本书的读伴更应该帮用户抓主线、补背景、拆论证、联系现实、辅助输出，还是解决用户自定义的问题。
- 用户确认后，应用生成 `readingProfile` 和 `readingPlan`。
- 之后每个阅读项的导读、问答、读后交流都必须带入 `readingProfile.companionFocus`，让读伴始终围绕用户真实目的工作。

`wholeBookGuide` 不是整本书摘要，也不是每章导读的合集。它更像开书前的地图，应该回答：

- 这本书主要想解决什么问题？
- 作者用怎样的结构推进？
- 哪些章节是关键转折？
- 哪些地方读者最容易卡住？
- 这本书适合哪几种读法？
- 如果只带一个问题读完整本书，应该是什么？
- 读伴建议用户选择哪些侧重点？

当前实现：

- 保存书籍信息后进入 `ReadingPlanSetup.jsx` 开书分析页。
- 用户可以点击「让读伴分析这本书」，调用 `wholeBookGuide.md` 生成 `wholeBookGuide`，并保存到书籍元数据。
- 开书分析页展示整本书导读、核心问题、结构地图、阅读难点和生成消耗。
- 用户基于整本书导读选择阅读节奏、开始日期、每周阅读日、是否拆分长章节，以及本书读伴侧重点。
- 本地按章节和节奏生成计划草稿；长章节可按当前节奏拆分为多个阅读日。
- 计划生成时，导读章节合并为「开始前准备」，正文进入主计划，忽略和附录不进入主计划。
- 当前阅读计划仍是本地生成，尚未由 AI 直接生成每日计划。

### AI 伴读

- AI 问答应主要基于当前章节。
- 每章开始前需要提供阅读目标和关键问题。
- 章节结束后的测验不偏传统选择题，而是更像读伴的关键追问。
- 后续需要按章节切块保存文本，避免每次把整本书塞给模型。

## 架构共识

### 当前阶段

当前保留浏览器网页 MVP，同时推进 Tauri 桌面 App：

- Vite + React
- Tailwind CSS
- PDF.js
- 浏览器版使用 localforage + IndexedDB
- Tauri 桌面版已接入 SQLite + App 数据目录文件存储，API Key 保存到系统 Keychain；真正 AI 使用路径允许在当前进程内短期缓存已解析密钥，减少连续系统授权弹窗
- Claude / OpenAI-compatible BYOK，用户在设置页填自己的 API Key
- 模型调用已抽象为供应商接口，当前支持 Anthropic Claude 和 OpenAI-compatible Chat Completions。
- 后端开发标准记录在 [BACKEND_DEVELOPMENT_STANDARDS.md](./BACKEND_DEVELOPMENT_STANDARDS.md)，后续 AI 接手提示词记录在 [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md)。
- 剩余生产级升级路线记录在 [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md)，覆盖数据可靠、正式发布、安全隐私、诊断、CI、QA、自动更新和 public alpha。

浏览器版继续用于快速验证核心阅读体验；桌面版逐步把长期数据和模型请求迁到本地 Rust 后端，不引入云端后端。

### 长期风险

纯浏览器 IndexedDB 不适合作为长期大型书库的唯一存储：

- 容量和清理策略不完全可控。
- 浏览器清缓存可能导致资料丢失。
- 很难自然支持跨设备同步。
- 未来章节摘要、聊天记录、测验、笔记和索引都会增加数据量。

### 暂定长期路线

短期继续网页 MVP，但保持存储层可迁移：

- 继续通过 `storage.js` / `books.js` 封装数据访问。
- 当前已增加「导出书库 / 导入书库」能力；桌面版使用目录式 `manifest.json + files/` v3 备份，并支持预览、manifest/file sha256 校验、合并导入、覆盖恢复、失败自动回滚、备份名称/备注、删除和外部路径导入。
- 阶段 5 之后已完成 P6.1 数据安全收口主体、P6.2 存储结构收束、P6.3 大文件与解析韧性主体、P6.4 AI transport 生产化主体和 P6.5 安全与隐私加固基础版；后续优先进入 P6.6 本地诊断与可支持性，再推进正式签名、公证、自动更新、CI 和 public alpha。
- 如果产品变成长期个人书库，考虑 Tauri 或 Electron 桌面版。
- 桌面版可使用本地文件系统 + SQLite，网页端保留 IndexedDB 作为轻量试用。
- 云同步可以作为可选能力，不强制上传 PDF 原文件。

## Prompt 管理

当前 prompt 已从业务代码中抽出，集中放在 `src/prompts/`：

- `mentorPersona.md`：共享读伴人格与整体表达风格，导读、伴读聊天等功能共同使用。
- `wholeBookGuide.md`：整本书开书导读 prompt，生成全书地图、阅读难点、建议读法和读伴侧重点选项。
- `readingGuide.md`：章节读前导读 prompt。
- `readingChat.md`：阅读中 sidebar 伴读问答 prompt。
- `bookCompanionChat.md`：书架独立「和读伴聊聊」页面的本书级聊天 prompt，围绕全书地图、读伴记忆、阅读进度、当前阅读项摘录、最近笔记和读中/读后交流回答。
- `readingReflection.md`：读后交流 prompt，负责读完后的开放式追问和连续追问。

代码通过 `src/lib/promptTemplates.js` 使用 Vite `?raw` 导入 Markdown 模板，并替换 `{{变量名}}`。这样既方便维护 prompt 文案，又不需要引入后端或运行时 fetch。

产品内 prompt 的写作规范维护在 [PROMPT_WRITING_STANDARDS.md](./PROMPT_WRITING_STANDARDS.md)。当前重点是让读伴更像成熟、克制、有判断力的讲书人：可以调用可靠的公共背景知识和常见评价，但不能编造具体事实；展示文本要减少“不是……而是……”这类高频模板转折；整本书导读和章节导读会写入 `styleVersion`，用于后续识别文风版本，但不能仅因旧缓存缺少版本就判定内容失效。

注意：[AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md) 记录的是后续 AI 接手项目时使用的工程协作提示词，不属于产品内读伴 prompt；不要把它打包进前端功能。

## 当前数据概念

当前本地存储统一封装在 `src/lib/storage.js` 和 `src/lib/books.js`。

- 浏览器版：基于 localforage + IndexedDB。
- Tauri 桌面版：`storageAdapter` 切到 Tauri command；书籍元数据、章节索引、原始文件索引、分页文本、阅读计划、阅读进度、笔记、聊天、读后交流、章节导读缓存、非敏感设置、封面缓存和 AI 排版缓存已进入结构化 SQLite / App 数据目录；API Key 写入系统 Keychain；读取设置页只返回非敏感配置，不主动读回 Keychain 密钥，并用 `hasApiKey` 非敏感标记提示本机是否已保存过 Key；真正发起 AI 请求时，如果请求体没有明文 Key，Rust 后端才按需读取 Keychain，并允许在当前进程内短期缓存以减少重复弹窗；`kv_store` 仅保留兼容旧 key 或临时低风险 JSON；原始 `File/Blob` 写入 App 数据目录 `files/`，SQLite 保存文件索引；目录式备份写入 App 数据目录 `backups/`。
- Tauri 首次启动会把旧 IndexedDB 数据自动迁移到 SQLite / 文件目录；如果 SQLite 已有数据，会跳过迁移并写入迁移标记。
- 设置页支持本地备份导出/导入；桌面版备份包含书库、原始文件、分页、进度、导读、笔记和聊天记录，支持导入前预览、manifest/file sha256 校验、合并导入、覆盖恢复、失败自动回滚、备份名称/备注、删除和外部路径导入，默认不包含 API Key。
- 桌面存储 schema 记录在 [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)。

主要数据：

- `settings`：默认供应商、模型、Base URL、价格配置；浏览器版仍包含各供应商 API Key，桌面版 API Key 由系统 Keychain 保存，读取 `settings` 时不自动返回 API Key，只返回 `hasApiKey` 这类非敏感状态
- `books`：书籍元数据数组；桌面版已映射到结构化 `books` / `book_chapters` 表，并同步 `reading_plans` / `reading_plan_items`
- `book:{id}:file`：原始书籍文件 Blob；桌面版已映射到 `book_files`，重开后读取返回本地文件引用
- `book:{id}:pages`：按页或文本页提取的文本数组；桌面版已映射到 `book_pages`
- `book:{id}:chat`：伴读问答记录，内部按阅读项 key 分组；桌面版已映射到 `chat_messages`；本书级聊天使用保留 key `__book_companion__` 存在同一分组对象中，不单独升 schema
- `book:{id}:reflection`：读后交流记录，内部按阅读项 key 分组；桌面版已映射到 `reflection_messages`
- `book:{id}:notes`：高亮和笔记，内部按阅读项 key 分组；桌面版已映射到 `notes`；本书聊天回答记到笔记时优先写入当前阅读项，无法定位阅读项时写入 `__book_companion__` 分组，并以 `source = "book-companion-chat"` 标记来源
- `book:{id}:questions:{planItemKey}`：当前阅读项的 AI 章节导读缓存；桌面版已映射到 `reading_guides`
- `book:{id}:quiz:{chapterId}`：预留，章节测验
- `progress:{id}`：阅读进度、当前阅读项、每个阅读项的最近页码、每个阅读项的完成时间和打卡日期；桌面版已映射到 `reading_progress` / `reading_item_progress`

书籍元数据目前包含：

- `id`
- `title`
- `author`
- `fileName`
- `fileSize`
- `totalPages`
- `chapters`
- `detectionSource`
- `status`
- `readingProfile`
- `readingPlan`
- `createdAt`
- `updatedAt`

章节目前包含：

- `id`
- `title`
- `startPage`
- `endPage`
- `source`
- `role`

### 目标数据结构：开书分析

下一阶段引入 `wholeBookGuide` 和新版 `readingProfile`。第一版可以先放在书籍元数据中，后续如果内容变大，再迁移到独立 key，例如 `book:{id}:wholeBookGuide`，书籍元数据只保留摘要和状态。

#### `wholeBookGuide`

`wholeBookGuide` 是整本书导读，生成时机在用户确认章节之后、生成阅读计划之前。

建议结构：

```js
wholeBookGuide: {
  schemaVersion: 1,
  status: "ready", // idle | generating | ready | failed
  generatedAt: "2026-06-08T00:00:00.000Z",
  model: "claude-...",
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0
  },
  source: {
    strategy: "chapters_and_samples",
    chapterCount: 0,
    pageRanges: [],
    note: "用章节列表、导读章节和正文抽样生成，不默认塞入整本书全文。"
  },
  overview: "Markdown：压缩版开书导读，默认展示给用户。",
  fullOverview: "Markdown：完整开书导读底稿，供展开查看和后续读伴参考。",
  coreQuestion: "如果只带一个问题读完整本书，这个问题是什么。",
  bookProblem: "这本书主要试图解决的核心问题。",
  structureMap: [
    {
      title: "结构单元标题",
      role: "这一部分在全书中的作用",
      chapterIds: [],
      pageRange: "15-62",
      summary: "这一部分大概在推进什么。",
      readingHint: "读这一部分时要留心什么。"
    }
  ],
  keyTurns: [
    {
      title: "关键转折",
      chapterIds: [],
      whyItMatters: "为什么它改变了后面的阅读。"
    }
  ],
  difficultyMap: [
    {
      topic: "容易卡住的概念/背景/论证",
      where: "出现在哪些章节或页码段",
      whyHard: "为什么容易卡住",
      supportStrategy: "读伴后续应该怎样帮用户跨过去"
    }
  ],
  suggestedReadingPaths: [
    {
      id: "steady",
      title: "稳定推进",
      bestFor: "适合什么样的读者",
      description: "这条读法怎么读",
      paceHint: "节奏建议",
      companionFocusSuggestions: ["mainline", "background"]
    }
  ],
  companionFocusOptions: [
    {
      type: "mainline",
      label: "帮我抓主线",
      description: "减少被细节带走，持续提醒这段和全书问题的关系。",
      promptInstruction: "后续回答要优先收束到全书主线和当前章节位置。"
    }
  ],
  planAdvice: {
    recommendedPace: "standard",
    recommendedMinutesPerSession: 40,
    splitLongChapters: true,
    riskNotes: ["哪些章节可能需要拆开读或多留时间"]
  }
}
```

设计原则：

- `overview` 面向用户默认展示，是压缩后的快速入口，可以使用 Markdown。
- `fullOverview` 保留完整开书底稿，用户需要时再展开，后续计划和读伴行为也可以引用。
- `structureMap` 服务后续计划生成和章节导读，帮助每个阅读项知道自己在全书中的位置。
- `difficultyMap` 服务后续读伴问答和读后交流，提醒读伴主动补背景或拆论证。
- `companionFocusOptions` 不是固定死的全局选项，而是 AI 根据这本书生成的推荐侧重点。
- `source.strategy` 必须记录生成依据，避免以后误以为整本书全文都被模型读过。

#### `readingProfile.companionFocus`

`companionFocus` 是用户和这本书的读伴契约，后续 prompt 必须带入。

建议结构：

```js
readingProfile: {
  schemaVersion: 2,
  onboardingMode: "ai_book_opening",
  pace: {
    mode: "standard", // light | standard | deep | custom
    minutesPerSession: 40,
    sessionsPerWeek: 5,
    weekdays: [1, 2, 3, 4, 5],
    startDate: "2026-06-08",
    targetFinishDate: null,
    splitLongChapters: true,
    maxPagesPerSession: null
  },
  companionFocus: {
    schemaVersion: 1,
    type: "mainline", // mainline | background | argument | application | output | custom
    label: "帮我抓主线",
    userText: "我读这本书，主要想看懂它如何解释一个时代的运转。",
    aiSummary: "用户希望读伴持续帮他把人物、制度和历史叙事收束到全书主线。",
    promptInstruction: "后续导读、问答和读后追问都要优先帮助用户抓住主线，避免只堆背景知识。",
    selectedFromWholeBookGuide: true,
    updatedAt: "2026-06-08T00:00:00.000Z"
  },
  wholeBookGuide: {
    status: "ready",
    generatedAt: "2026-06-08T00:00:00.000Z"
  },
  legacy: null
}
```

`companionFocus.type` 建议先支持这些基础类型：

- `mainline`：帮我抓主线，不要迷失在细节里。
- `background`：帮我解释历史背景、概念和上下文。
- `argument`：帮我追问作者的论证是否成立。
- `application`：帮我联系现实、工作、生活或其他知识。
- `output`：帮我沉淀成文章、讲稿、读书笔记或可复用表达。
- `custom`：用户自己写一句“我读这本书主要想解决……”

后续 prompt 使用规则：

- 章节导读：根据 `companionFocus` 决定今天的提醒重点，不只是概括章节。
- 阅读中问答：回答可以发散，但最后要收束回用户选择的侧重点。
- 读后交流：追问不只检查理解，还要检查用户是否靠近自己的阅读目标。
- 笔记建议：如果用户偏 `output`，读伴应更主动提示可沉淀的表达、结构和素材。

#### 旧数据兼容

已有书籍可能只有旧版 `readingProfile`：

```js
readingProfile: {
  purpose: "study",
  pace: "standard",
  startDate: "2026-06-08",
  weekdays: [1, 2, 3, 4, 5]
}
```

兼容策略：

- 不迁移也能继续读：旧书保持现有 `readingPlan.items` 和 `progress:{id}`，阅读器不因缺少 `wholeBookGuide` 阻塞。
- 进入旧书的开书设置页时，提示可以「补生成整本书导读」。
- 如果没有 `companionFocus`，后续 prompt 使用一个保守默认值：
  - `purpose: overview` -> `mainline`
  - `purpose: study` -> `background`
  - `purpose: deep` -> `argument`
  - `purpose: research` -> `output`
- 旧版 `pace` 映射到新版 `pace`：
  - `light` -> `minutesPerSession: 20`
  - `standard` -> `minutesPerSession: 40`
  - `deep` -> `minutesPerSession: 60`
- `weekdays`、`startDate` 直接沿用。
- 旧的 `readingPlan.items` 继续有效；新计划生成器可以为新 item 增加 `wholeBookRole`、`dailyGoal`、`difficulty`、`focusHint` 等字段，但不能要求旧 item 必须有这些字段。
- 重新生成整本书导读或阅读计划时，默认保留已读进度、聊天、笔记和高亮，不覆盖 `progress:{id}`。

## 已实现功能

### 应用基础

- React + Vite 项目搭建。
- Tailwind 阅读主题。
- 新增版本通道：测试版 `test` 与正式版 `formal`。
- 测试版显示书架里的本地测试书入口；正式版隐藏该入口，并在构建产物中移除 `dist/test-books`。
- 顶部导航：书架、设置。
- 品牌视觉：
  - 顶部导航已从纯文字品牌名升级为 `BrandLogo`，图形由“打开的书页 + 对话气泡”组成，对应“读”和“伴”。
  - `public/logo.svg` 作为独立 SVG 品牌资产，同时接入 `index.html` favicon。
  - `BrandName` 统一渲染界面中的「读伴」二字，使用更纤细、偏手写的中文字体栈；普通 UI 文本仍保持原有清晰字体。
  - Markdown 渲染器会识别回答、导读和笔记里出现的「读伴」，并套用同一品牌字形。
  - 应用启动时显示一次全屏开屏动画：书页展开、对话气泡出现、手写「读伴」显现，然后自动淡出进入书架；动画尊重 `prefers-reduced-motion`。
- 设置页：
  - 模型供应商下拉选择：Anthropic Claude / OpenAI-compatible
  - Anthropic API Key 和 Claude 模型配置
  - OpenAI-compatible API Key、Base URL、模型名配置
  - OpenAI-compatible 模型清单下拉框，覆盖 OpenAI、Kimi、DeepSeek
  - OpenAI-compatible 自定义输入/输出 token 价格
  - TXT 批量导入/导出 AI 配置：模板预填 Anthropic、OpenAI、DeepSeek、Kimi 等常用供应商，读取默认供应商、API Key、模型、Base URL 和价格字段，并保存到 IndexedDB；当前配置也可导出为可重新导入的 TXT
  - API Key 显示/隐藏
  - 保存设置到 IndexedDB
  - 测试当前供应商连接
  - 清空本地数据

### 书籍上传与解析

- 书架页支持上传 PDF 和 MOBI。
- PDF 使用 PDF.js 在浏览器本地提取每页文本。
- 读取 PDF 元数据中的 title/author。
- 递归读取 PDF outline 作为章节来源，并在 outline 过粗或不可用时降级到页面版式标题识别。
- 页面版式标题识别会基于 PDF.js textContent 的坐标和字号，从页面顶部大字号“第X章/第X编/Chapter/Part”等标题中提取章节候选。
- 当同一本书已识别出多个“第X章/Chapter”时，会把“第X编/Part”这类分部标题视为结构分隔符，不作为独立阅读章节，并截断上一章页码避免分部页混入正文阅读项。
- 最终会对 outline、版式标题和旧文本规则做质量评分，避免单个粗粒度 outline 把整本书识别成一个章节。
- MOBI 使用 `@lingo-reader/mobi-parser` 解析 metadata、TOC/spine 和章节 HTML。
- MOBI 正文清洗为文本，并按约 2200 字符切成文本页，复用阅读计划、当前页上下文和笔记数据结构。
- 保存原始文件和分页/文本页内容到 IndexedDB。

### 书籍确认

- 上传完成后进入书籍信息确认页。
- 可编辑书名和作者。
- 可编辑章节标题、用途、起始页、结束页。
- 可新增/删除章节。
- 保存后进入开书分析页。
- 对 PDF 元数据里的非字符串 title/author 做了兼容处理。

### 开书分析与阅读计划

- `ReadingPlanSetup.jsx` 已从旧表单升级为开书分析页。
- 支持点击「让读伴分析这本书」，调用 AI 生成整本书导读 `wholeBookGuide`。
- 开书导读基于章节结构、导读章节和正文抽样生成，不默认塞入整本书全文。
- 开书导读结果包含 overview、fullOverview、bookProblem、coreQuestion、structureMap、difficultyMap、suggestedReadingPaths、companionFocusOptions 和 planAdvice。
- 支持选择阅读节奏、开始日期、每周阅读日和是否拆分长章节。
- 支持选择本书读伴侧重点，并保存为 `readingProfile.companionFocus`。
- 数据层提供 `updateBookCompanionFocus(bookId, companionFocusPatch)`，支持在不改阅读计划、不清空进度和历史记录的前提下，随时更新单本书的读伴记忆。
- 保存新版 `readingProfile` 和本地 `readingPlan` 草稿；同时保留 `purpose` 等旧字段兼容旧 prompt。
- 书架卡片显示章节用途统计。
- 书架卡片显示阅读进度条、最近读到的位置和连续打卡天数。
- 待确认书籍只显示「完善信息」；已确认/已规划书籍显示「书籍信息」和「开书设置」。

### 阅读会话

- 已规划书籍可从书架进入阅读器。
- 阅读器按 `readingPlan.items` 打开当前阅读日。
- Reader 已重构为三段式阅读会话：
  - 读前导入：全屏读伴开场，说明今天读什么、和上一项的关系，以及带着哪些问题读。
  - 正文阅读：主区域根据书籍格式渲染 PDF 原版页或 MOBI 文本页，右侧 sidebar 保留读伴问答、导读提示、笔记和阅读项切换。
  - 读后交流：读完后进入全屏反思页，引导用户用自己的话回答读伴式问题。
- PDF 正文区默认使用 PDF.js canvas 渲染当前阅读项页码范围，并叠加 PDF.js text layer，让原版页面文字可以选中。
- MOBI 正文区使用 `TextBookReader` 渲染文本页，支持恢复上次文本页位置、划选原文后问读伴或添加笔记。
- 每页提供页码锚点，后续可用于页码定位、引用原文和选句伴读。
- AI 文本排版主入口已隐藏，底层生成与缓存能力保留为后续实验入口。
- AI 导读和伴读问答仍根据计划项的 `chapterIds` 拼接对应章节页码范围内的提取文本，并通过 `buildReadingContractContext({ book, item })` 带入开书契约上下文。
- 支持上一项、下一项。
- 支持标记当前阅读项完成或取消完成。
- 阅读进度保存到 `progress:{bookId}`。
- 正文阅读时会自动保存当前 PDF 页码；再次进入同一阅读项时回到上次读到的位置。
- 进入正文阅读、翻页和完成阅读时会记录本地打卡日期，用于书架展示连续打卡天数。
- 完成阅读时会在 `completedAtByItemKey` 中记录每个阅读项的完成时间，用于区分“今天正常开始下一项”和“提前开始下一项”。
- 如果当前阅读项未完成且已有保存位置，再次进入会直接回到正文阅读，并在顶部显示上次页码和时间；退出按钮文案改为「中途离开」。
- 如果用户已经完成当天阅读并进入下一阅读项，再次进入时按新一天处理，先显示读伴导读，而不是继续旧页面。
- 如果用户昨天完成了某个阅读项，今天下一阅读项已经到达计划日期，书架主按钮显示「开始今日阅读」，不再显示「提前开始下一章阅读」。
- 书架卡片提供「阅读目录」入口，按阅读计划列出章节/阅读日，并用明显状态区分「已读」「阅读中」「未读」「未完成」。
- 已读目录项会以回顾模式打开正文，不会把旧章节覆盖成新的当前阅读任务；阅读中目录项会直接回到上次页码，未读目录项会按正常读前导读流程开始。
- 今日阅读完成页和阅读器 sidebar 的「阅读项」面板也复用同一套目录状态，方便读完当天任务后回顾今天或以前的内容。
- 已接入手动触发的 AI 章节导读生成。
- 已接入 sidebar 伴读问答第一版：
  - 以当前阅读项对应章节文本为起点回答。
  - 允许适度发散到相关背景、现实例子、相邻概念和应用场景，但需要收束回当前书和当前章节。
  - 支持快捷问题和自由提问。
  - 聊天记录按 `book:{id}:chat` 保存，并按阅读项 key 分组。
  - 回答后展示模型、输入 token、输出 token 和估算费用。
  - 伴读回答输出上限提高到 2600 token；如果实际输出接近上限，会在消耗信息里提示可能已到输出上限。
  - sidebar 默认突出问答窗口，导读提示收纳到「提示」面板，当前只展示 3 个阅读目标和 3 个读前问题。
  - 聊天窗进一步压缩辅助信息：移除 sidebar 顶部阅读摘要和主输入区快捷问题，支持 Enter 发送、Shift+Enter 换行，消息区默认滚动到底，历史读伴回答超过 100 字默认折叠，但最新一条回答保持展开。
  - 导读里的每个目标和问题都有两个动作：「我要记笔记」会打开笔记浮窗并预填该目标/问题，「和读伴聊聊」会切到问答并把该条发送给读伴。
  - 「问 读伴」类按钮和标签在“问”和品牌名之间保留小间距，避免品牌手写字和普通字贴得太紧。
  - PDF 阅读器会识别当前可见页，伴读问答会优先带入当前页提取文本，用户问“这一页/这里/这段”时能获得更贴近页面的回答。
  - PDF text layer 选中文字后显示跟随式小按钮，支持“问 读伴”和“添加笔记”；“问 读伴”会把页码和引用文本放到输入框上方作为引子，等待用户补充问题。
  - 选中文字可保存为高亮笔记；读伴回答也可以一键记到笔记，有原文引用时会尽量挂回对应页高亮。
- 已接入本书级「和读伴聊聊」P0-P2：
  - 书架菜单进入独立本书读伴聊天页，页面会加载本书级历史消息。
  - 本书聊天已从占位回复升级为真实流式 AI 回答，支持 Enter 发送、停止生成、错误提示、模型/Token/费用展示和本地持久化。
  - 本书聊天上下文带入书名作者、读伴记忆 `readingProfile.companionFocus`、整本书地图 `wholeBookGuide`、阅读计划、当前阅读位置、当前阅读项少量摘录、最近笔记、高亮、阅读中问答和读后交流。
  - 为避免泛聊天和无意剧透，默认不把整本书全文塞进模型；用户问到未读后文时，prompt 要求先提醒可能剧透，并优先给不剧透回答。
  - 数据层复用 `book:{id}:chat`，用保留 item key `__book_companion__` 区分本书级聊天，不影响按阅读项保存的 sidebar 问答。
  - P2 增加“记到笔记”和“清空聊天”：读伴回答可沉淀到当前阅读项笔记并回流到后续本书聊天上下文，清空聊天只清除本书级历史，不删除书籍、进度或已保存笔记。
- 已插入本书「整理这本书 / 复盘」前端阶段：
  - 新增 `BookSalon` 页面，从书架菜单和本书聊天页进入。
  - 「整理这本书」聚合书籍、阅读进度、全书笔记、本书聊天和读后交流，作为单本书的复盘工作台。
  - 页面遵循「现代数字书斋」视觉标准，收敛为左侧本书状态栏 + 右侧主案面标签页，不做大 banner，也不把知识卡和复盘常驻堆在首屏。
  - 当前已支持在整理页里筛选、编辑、保存和二次确认删除笔记；「重点」和「复盘」作为主案面标签页，先基于本地已有导读与沉淀生成轻量视图。
  - 入口文案改为更直白的「整理这本书」，主控件改为标题下方轻量页签和左对齐筛选片，减少右上角大胶囊组带来的杂乱感。
  - 会客厅首版视觉已继续收敛：页面内部明确为「本书会客厅」，使用朱砂进度小章、本书状态、笔记列表和轻分隔整理区，弱化后台管理台感；桌面端进一步改成固定一屏的案面布局，并二次删掉解释性文案，减少页面滚动、左右失衡和无效占位。
  - 本轮不新增 schema，也不接入 AI 自动知识库；后续再评估标签、知识点卡片持久化、AI 自动归纳、导出和跨书关联。
- 正文阅读页采用独立滚动布局：正文区域有独立边框和滚动条，sidebar 也独立滚动，互不牵扯。
- 阅读器内隐藏全局顶部导航，正式阅读时只保留阅读会话自身的退出入口。
- 已接入读后交流第一版：用户点“我读完了”后进入读伴追问式对话，读伴先问一个读后问题，再根据用户回答继续追问；读后页可选择是否带入本阅读项的伴读问答、高亮和笔记作为追问上下文。
- 阅读器 sidebar 新增「记忆」面板，支持查看和编辑本书 `readingProfile.companionFocus`；保存后只更新当前书籍的读伴记忆，不清空历史聊天、导读缓存、读后交流或笔记。
- 书架卡片里的伴读互动统计使用自然短文案，例如 `3提问 2笔记`，避免 `3 问 · 2 记` 这种过于机械的缩写。

### AI 章节导读

- 阅读器中当前阅读项显示 AI 导读面板。
- 用户点击「生成导读」时才调用 Claude，避免自动消耗 token。
- 导读基于当前阅读项对应章节文本生成。
- 导读结果包含：
  - 本章概览
  - 3 个阅读目标
  - 3 个读前问题
- 导读结果保存到 `book:{id}:questions:{planItemKey}`。
- 已保存导读会在再次打开同一阅读项时自动显示。
- 生成过程中显示等待动画、已等待时间和阶段提示。
- 重新生成导读时会立即清空旧导读内容，只保留生成中的状态卡，避免旧内容和新 loading 叠在一起造成误解。
- 生成完成后显示本次输入 token、输出 token、模型和估算费用。
- 费用估算基于 Anthropic 官方每百万 token 价格表，实际账单以 Anthropic 控制台为准。
- 导读提示词已调整为通俗、循循善诱的读伴口吻，避免生成晦涩的教材式摘要。
- 导读提示词进一步调整为平和、自然、讲书式口吻，要求 overview 按“场景 -> 困惑 -> 阅读问题”推进，避免报告腔和堆概念。
- 导读生成包含一轮隐式自查与修订：检查是否通顺、是否足够通俗、是否像读伴口吻、是否能激发兴趣、是否过度剧透。
- 导读提示词要求 overview 使用结构化 Markdown：短标题、短段落、单个分割线、加粗和引用；overview 不再生成“带着什么问题读”小节，读前问题只在下方 questions 卡片展示。
- 导读生成会带入当前阅读项在计划中的位置、上一项和下一项：第一项建立整本书入口，第二项及以后必须承上启下，避免每次都像重新介绍整本书。
- 导读 prompt 已收敛输出结构：只要求 `overview`、`goals` 和 `questions`，其中 `goals` 必须正好 3 条、`questions` 必须正好 3 条；不再要求 `concepts`、`focus` 或 `notes`。
- 阅读提示面板不再使用二级 tab，也不再展示“留意”内容；改为两组柔和卡片：「今天的收获」和「可以追的问题」。
- 提示面板空状态从单个按钮改为说明 + 骨架预览 +「生成阅读提示」按钮，避免 sidebar 右侧大面积空白。
- 从读前导入进入正文时支持翻页过渡：导读页先保留章节信息，再以轻量纸面滑翻露出正文；过渡尊重 `prefers-reduced-motion`，并避免在动画中段触发额外滚动或阅读活动记录。

## 下一步计划

### 本轮已完成

1. 开书分析流程已经从旧表单升级为“读伴先分析整本书，再和用户商量阅读契约”。
2. 新增 `wholeBookGuide.md` 和 `src/lib/wholeBookGuide.js`，支持基于章节列表、导读章节和正文抽样生成整本书导读。
3. `ReadingPlanSetup.jsx` 已重做为开书分析页，覆盖整本书导读、阅读节奏、开始日期、每周阅读日、长章节拆分和读伴侧重点。
4. 新版 `readingProfile` 已保存 `pace`、`companionFocus` 和 `wholeBookGuide` 状态，同时保留旧字段兼容。
5. 开书导读展示已从字段卡片调整为三层地图：快速导读、阅读路线、读伴支援；完整导读底稿可展开查看。
6. 新增 `src/lib/readingContract.js`，统一抽取当前阅读项和开书契约之间的关系。
7. 章节导读、阅读中问答、读后交流都已接入开书契约上下文。
8. 数据层提供 `updateBookCompanionFocus(bookId, companionFocusPatch)`，阅读器新增「记忆」面板，用户可在阅读中随时调整本书读伴记忆。
9. 解析失败、输出截断和重新生成旧内容残留的问题已做基础处理。

### 下一阶段建议

1. 验证和调优开书契约接入效果：
   - 用旧书、没有 `wholeBookGuide` 的书、新版开书流程生成的书分别测试。
   - 检查导读、问答和读后交流是否自然体现全书视野，而不是机械复述开书契约。
   - 用《万历十五年》这类需要背景和评价视角的书测试导读是否足够渊博、专业、能说明作品为什么重要。
   - 如重复格式化逻辑继续增多，再抽出共享 formatter 和上下文预算策略。

2. UI 与读伴记忆体验打磨：
   - 优化「记忆」面板的入口层级、保存反馈、移动端可用性和表单文案。
   - 用户修改阅读意图、节奏或读伴侧重点后，提示是否需要重新分析或重新生成计划。
   - 避免把“记忆”做成全局资料库；第一阶段仍保持单本书、轻量、可解释。

3. AI 生成阅读计划增强：
   - 在当前本地计划草稿基础上，让 AI 基于 `wholeBookGuide`、章节结构、用户节奏和读伴侧重点生成更自然的总体计划说明。
   - 为每个阅读项补充阅读目标、关键问题、难度提示和全书位置。
   - 允许用户接受、编辑或重新生成计划，并确保不覆盖已有进度、聊天、笔记和高亮。

4. 开书分析体验打磨：
   - 生成导读时支持更清楚的进度、取消和重试。
   - 对 JSON 解析失败保留更可读的诊断入口，方便后续排查 prompt 和模型问题。

5. 当前阅读器增强：
   - 支持清空当前阅读项聊天记录。
   - 强化引用来源、页码和选中文字证据链。
   - 增加字号、行距、宽度等阅读设置。
   - 继续打磨高亮、批注、笔记导出和搜索。

6. 数据可迁移能力：
   - 已完成本地备份导出/导入，覆盖书库、原始文件、分页、进度、导读、笔记和聊天记录。
   - 桌面版已支持目录式备份、导入前预览、manifest/file sha256 校验、合并导入、覆盖恢复、失败自动回滚、备份名称/备注、删除和外部路径导入。
   - 后续增强压缩归档、备份签名和迁移夹具。
   - 继续为桌面版、本地文件系统和 SQLite 保持迁移接口稳定。

## 开发日志

### 2026-06-02

- 明确产品方向：AI 伴读应用，而不是普通 PDF 阅读器。
- 明确 MVP 主流程：
  - 上传 PDF
  - 本地解析
  - 确认书籍信息
  - 选择阅读目标与节奏
  - 后续 AI 伴读
- 确认第一版先做文本阅读，不做 PDF 原版渲染。
- 确认章节调整第一版只做标题、起始页、结束页编辑。
- 确认先本地解析，确认信息后再调用 AI。
- 实现真实书架和 PDF 上传入口。
- 新增 `src/lib/pdf.js`，实现 PDF 文本提取、outline 读取和章节猜测。
- 新增 `src/lib/books.js`，封装书籍列表、PDF、分页文本保存。
- 新增 `src/components/Shelf.jsx`，替换书架占位页。
- 新增 `src/components/BookSetup.jsx`，实现书籍信息确认和章节编辑。
- 增加章节用途 `role`，解决前言、目录、版权页混入阅读计划的问题。
- 新增阅读目标与节奏选择页 `src/components/ReadingPlanSetup.jsx`。
- 实现本地计划草稿生成，导读合并为开始前准备，正文进入主计划。
- 简化书架按钮状态，待确认书籍只显示「完善信息」。
- 修复 PDF 元数据 author/title 不是字符串时的保存报错。
- 新增 `src/lib/text.js`，统一处理 PDF 元数据文本化。
- 新增文本阅读器 `src/components/Reader.jsx`。
- 新增阅读进度读写方法，使用 `progress:{bookId}` 保存当前计划项和已完成项。
- 书架为已规划书籍新增「开始阅读」入口。
- 新增 `src/lib/readingGuides.js`，实现 AI 章节导读生成、解析与本地保存。
- 阅读器新增 AI 导读面板，支持生成、重新生成和展示已保存导读。
- 新增 `src/lib/pricing.js`，根据 Claude 模型和 usage 估算导读生成费用。
- 优化导读生成 loading 体验，显示耗时、阶段状态和动画。
- Claude 非流式调用新增 detailed 返回形式，支持读取 usage、model 和 response id。
- 调整章节导读 prompt：overview 改为更长的读前开场白，要求用白话解释、具体类比和能激发兴趣的问题。
- 为章节导读 prompt 增加反射自查机制：生成后先检查并修订，最终只返回修订后的 JSON。
- 调整导读 overview 展示：新导读要求分段，旧导读会在前端按句子温和切分。
- 重构模型配置：新增统一模型调用接口，设置页支持 Anthropic Claude 和 OpenAI-compatible。
- 新增 OpenAI-compatible Chat Completions 调用，可配置 Base URL、模型名和 API Key；Kimi 可通过 `https://api.moonshot.cn/v1` 使用。
- 根据 Kimi 官方文档更新 Kimi 模型清单：`kimi-k2.6`、`kimi-k2.5`、`moonshot-v1-128k`；不再使用已下线的 `kimi-latest`。
- Kimi 请求使用官方推荐的 `max_completion_tokens` 参数，其他 OpenAI-compatible 请求仍使用 `max_tokens`。
- 新增 DeepSeek OpenAI-compatible 模型清单项：`https://api.deepseek.com`，支持 `deepseek-v4-flash` 和 `deepseek-v4-pro`。

### 2026-06-03

- 设置页将 OpenAI-compatible 的快捷按钮改为模型清单下拉框，避免模型越来越多时界面变乱。
- 根据 OpenAI 官方模型文档加入推荐 GPT 模型：`gpt-5.5`、`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.4-nano`。
- OpenAI-compatible 模型清单选择后会自动填充 Base URL、模型名和可用的每百万 token 价格；用户仍可手动编辑自定义模型。
- OpenAI-compatible 默认模型从 `gpt-4o-mini` 更新为更适合作为新默认项的 `gpt-5.4-mini`。
- 设置页将默认模型供应商从两张选择卡片改为下拉框，与模型选择交互保持一致。
- 重构 `Reader` 为三段式阅读会话：读前读伴导入、正文阅读与目标 sidebar、读后读伴式反思。
- 阅读模式下隐藏应用顶部导航，减少书架、设置等后台信息对正式阅读的干扰。
- 优化章节导读 prompt：导读口吻从摘要式进一步改为平和讲书式，强调自然说话、少报告腔、用场景引出问题。
- 新增 `src/lib/readingChat.js`，实现当前章节伴读问答调用和本地保存。
- 阅读 sidebar 新增“问 读伴”窗口，支持快捷问题、自由提问、对话历史、生成中状态和单次回答消耗展示。
- 优化阅读 sidebar 信息架构：问答成为默认主界面，目标/问题/留意改为切换面板，并可一键发送给读伴追问。
- 优化伴读问答 UI 为客服机器人式左右气泡，区分用户和读伴消息。
- 调整正文阅读页布局：阅读区域加边框形成独立阅读框，正文和 sidebar 在桌面端分别滚动。
- 进一步压缩 sidebar 的示例问题占用：快捷问题改为输入框附近的横向小按钮，阅读提示默认折叠。
- 放大伴读聊天体验：桌面端 sidebar 宽度增加，聊天面板明确占据剩余高度；阅读提示、上一项/下一项、标记未完成统一收进折叠操作区。
- 快捷问题按钮使用短标签展示，但发送给 AI 时保留完整问题上下文，减少空间占用。
- 调整伴读问答 prompt：不再严格限制只能回答当前章节内容，允许围绕用户兴趣适度延展，但要求区分章节文本与延伸解释，并最终收束回本书和当前章节。
- 新增 `src/prompts/`，将导读和伴读聊天 prompt 文件化。
- 新增 `mentorPersona.md`，把读伴的人格、语气和整体特色抽为共享 prompt。
- 新增 `src/lib/promptTemplates.js`，用 Vite `?raw` 导入 Markdown prompt 并替换变量。
- 伴读聊天气泡新增轻量 Markdown 渲染，支持粗体、行内代码、标题、列表、引用块和段落换行，避免模型输出 `**重点**` 或引用原文时原样显示。
- 新增 `src/components/PdfReader.jsx`，将 Reader 正文区升级为 PDF.js 原版页渲染。
- `src/lib/books.js` 新增 `getBookFile`，用于从 IndexedDB 读取原始 PDF Blob。
- Reader 正文区默认使用 PDF 原版渲染，并隐藏 AI文本主入口。
- 新增 `src/lib/readingTextFormat.js` 和 `src/prompts/readingTextFormat.md`，用于生成和缓存 AI 排版文本。
- PDF 原版页渲染优化页间距、宽度适配和加载状态，并为每个页面添加 `pdf-page-{pageNumber}` 锚点与 `data-page-number`。
- 伴读问答新增当前可见页上下文：`PdfReader` 使用 IntersectionObserver 回传当前页，Reader 将该页的提取文本加入 `readingChat` prompt，并在 sidebar 展示“第 X 页伴读”。
- PDF 原版页新增 PDF.js text layer：每页 canvas 上方叠加透明可选文字层，保持原版视觉，同时为后续“选中句子跟随式伴读”提供基础。
- 新增选句跟随式伴读第一版：捕捉 PDF text layer 选区，在选区上方显示跟随式操作浮层；后续已统一为 `问 读伴 / 添加笔记` 两个入口。

### 2026-06-04

- 项目正式命名为「读伴」，仓库/package 名称使用 `duban`，界面标题和文档同步更新。
- 伴读聊天改为流式输出：Claude 和 OpenAI-compatible 调用都走统一流式入口，等待模型回答时能逐步显示内容。
- 历史读伴回答超过 100 字默认折叠，减少 sidebar 被长回答占满；最新一条回答始终展开，避免刚生成的内容被立刻收起。
- 保留 IndexedDB 内部数据库名 `reading-companion`，避免已有本地书籍、设置和聊天记录因改名而不可见。
- 阅读位置保存落地：`progress:{bookId}` 记录当前阅读项、各阅读项最近 PDF 页码、最后阅读时间和打卡日期；再次进入阅读器会跳回上次页码。
- 书架卡片新增阅读进度条、最近读到的位置和连续打卡天数，让用户回到书架时也能看到阅读状态。
- 阅读入口语义细化：未完成的阅读项显示「继续阅读」并直接回到正文；新阅读项显示「开始今日阅读」并保留导读仪式感。
- 每日阅读完成后不再自动推进到下一项，而是进入“今日阅读完成”页；用户可以退回书架，也可以选择提前开始下一章。书架也会把已完成的当日任务显示为“今日已完成”，主按钮改为“提前开始下一章阅读”。
- 增加测试版/正式版区分：`npm run dev`、`npm run build:test` 为测试版，保留本地测试书；`npm run build`、`npm run build:formal` 为正式版，不包含本地测试书入口和测试书构建产物。
- 导读生成与展示规则更新：prompt 改为鼓励在 overview 中使用结构化 Markdown，前端导读渲染支持标题、段落、列表、引用和加粗，让读前导读更容易扫读。
- 新增高亮笔记第一版：PDF 选区浮层保留“问 读伴/添加笔记”，移除“解释这句”；选区笔记保存后会在 PDF text layer 上做柔和高亮，AI 读伴回答可一键加入本章笔记。
- 优化阅读 sidebar：撤掉“聊天 + 阅读提示折叠块”的堆叠结构，改为「问 读伴 / 提示 / 笔记 / 阅读项」面板切换，默认保持问答区清爽，提示和笔记按需进入独立滚动面板。
- 优化选区伴读细节：划词问 读伴会自动切回「问 读伴」面板；流式生成中改为小字状态提示，不再额外占用一个读伴气泡；新高亮记录 PDF 选区矩形，避免只选一个词却把整行高亮。
- 优化笔记面板：笔记列表撑满右侧面板，支持点击进入详情；用户笔记可编辑并以 Markdown 渲染，AI 读伴回答也按 Markdown 展示。
- 优化添加笔记动线：PDF 选区点击“添加笔记”后会自动切换到「笔记」面板，并在该面板顶部展示待保存的高亮笔记草稿。
- 调整添加笔记体验：待保存笔记改为浮在阅读页上的便签式编辑框，右侧「笔记」面板只保留上下文提示和笔记列表，避免在窄 sidebar 中写长笔记。
- 待保存笔记浮窗顶部新增「拖动窗口」把手，支持鼠标/触控拖动、方向键微调和 `Home` 回到底部初始位；浮窗会限制在视口内，避免遮挡正文后无法挪开。
- 待保存的高亮笔记会作为临时高亮传给 PDF 页面，保存前后选中原文都保持高亮显示。
- PDF 高亮矩形在保存和渲染前会合并重叠区域，避免同一行被重复半透明高亮叠加后颜色过深。
- 补齐笔记管理能力：笔记详情支持删除整条笔记、取消 PDF 高亮，以及进入“重新选择原文”模式后在 PDF 上重新划句子绑定到该笔记。

### 2026-06-05

- 品牌称呼统一：
  - 全项目可见文案、prompt 和文档中的旧角色称呼统一替换为“读伴”，保持和产品标题一致。
  - 只替换角色称呼，不改变读伴原有的人格设定：耐心、平和、渊博但不卖弄，继续以陪读、追问、解释和收束为核心。
  - 读伴聊天、读后交流、导读和笔记里的角色标签同步改为“读伴回答/读伴追问”或更自然的省略形式。

- 品牌 logo 与视觉系统：
  - 新增 `src/components/BrandLogo.jsx`，包含 `LogoMark`、`BrandName` 和品牌文本渲染辅助方法。
  - 新增 `public/logo.svg`，作为可独立复用的品牌资产和浏览器 favicon。
  - 顶部导航从纯文字“读伴”改为图形 logo + wordmark；图形由打开的书页和对话气泡组成，表达“读”和“伴”。
  - `index.html` 新增 `<link rel="icon" type="image/svg+xml" href="/logo.svg" />`。
  - 新增 `.brand-script` 字体类，优先使用 `HanziPen SC`、`Xingkai SC`、`Kaiti SC` 等更纤细、偏手写的中文字体；没有这些字体时降级到楷体/衬线字体。
  - 界面中可控的「读伴」二字统一通过 `BrandName` 渲染，和普通 UI 字体拉开气质差异。
  - Markdown 文本渲染也会识别「读伴」并套用品牌字形，覆盖导读、聊天回答、笔记内容等动态文本中的品牌名。

- 开屏动画：
  - 新增 `src/components/SplashScreen.jsx`，应用首次加载时显示全屏品牌开场。
  - `LogoMark` 内部 SVG 元素增加可动画 class，支持书页展开、外框描边、对话气泡出现和圆点依次浮现。
  - 开屏约 2.5 秒后自动淡出，进入书架；动画过程不需要用户操作，也不会阻塞后续页面状态。
  - CSS 中新增 `splash-*` keyframes，并适配 `prefers-reduced-motion: reduce`，降低动态效果用户会快速显示和退出。
  - 桌面和 390px 手机宽度都做过视觉检查，logo 居中、尺寸合适，淡出后 overlay 会从 DOM 中移除。

- 阅读 sidebar 文案细节：
  - 品牌动作按钮和标签统一改成视觉上有小间距的「问 读伴」，通过 `inline-flex` 和 `gap` 实现，避免普通字和品牌手写字贴在一起。
  - PDF 选区浮层、sidebar tab、问答面板标题都同步了这个间距。
  - 伴读气泡头像从旧的“导”改为“伴”，保持品牌语义一致。
  - 书架卡片里的互动统计从 `3 问 · 2 记` 改为更自然的 `3提问 2笔记`。

- 阅读完成与读后交流：
  - 用户点击「我读完了」后不再只是结束当前阅读项，而是进入读伴追问式读后交流。
  - 读伴会先抛出一个开放问题，再根据用户回答继续追问，形成连续对话。
  - 读后交流页增加上下文选项，可以选择带入本阅读项里的伴读提问、AI 回答、高亮和笔记，让追问更贴近真实阅读过程。
  - 每日阅读完成后不再自动开始下一章，而是显示“今日阅读完成”状态，并给出「退回书架」和「提前开始下一章阅读」两个选择。
  - 书架页也同步这个语义：当天任务已完成时显示完成状态，主操作改为提前开始下一章，而不是误导用户继续今天任务。
  - 新增书架「阅读目录」入口，用户可以从目录点击已读、阅读中或未读章节。
  - 今日阅读完成页新增目录区，解决“今天读完但还想回顾今天/以前内容”的场景。
  - 阅读器 sidebar 的「阅读项」面板也升级为目录样式，和书架目录一样标记已读、阅读中、未读。
  - Reader 增加 transient review mode：点击已读章节会直接打开 PDF 正文用于回顾，同时保留 `progress.currentItemIndex`，避免回看旧章节后书架上的今日任务被带偏。

- 导读生成与读前开场体验：
  - 导读内容不再输出一大块纯文本，prompt 要求 overview 使用 Markdown 的短标题、短段落、引用、加粗和分割线，前端同步渲染这些结构。
  - 导读生成 loading 从单薄提示改为带阶段感的状态卡：展示正在整理今天入口、已等待时间、进度条、骨架正文和阶段列表。
  - 点击「重新生成导读」时立即清空旧内容，只显示生成中状态，避免旧导读在新导读返回前继续留在页面里。
  - 导读生成会带入阅读计划位置、上一项和下一项；从第二个阅读日开始必须承上启下，先接住上一次阅读，再说明今天往哪里推进。
  - overview 内部移除和下方 questions 重复的“带着什么问题读”小节；“接上一次阅读”和“今天往哪里推进”之间要求使用 Markdown `---` 分隔，帮助用户快速扫读。

- 导读提示页体验重构：
  - 原来的提示面板是二级 tab：`目标 / 问题 / 留意`，用户反馈空白多、层级硬、像表单列表。
  - 改为更柔和的阅读卡片布局：顶部标题为「今天这段怎么读」，下面按组展示提示内容。
  - 提示面板不再展示“留意”，只展示两组：「今天的收获」和「可以追的问题」。
  - 空状态从旧的单按钮改为说明文案、骨架预览和「生成阅读提示」按钮，降低右侧大面积空白带来的突兀感。
  - 旧的 `activeGuideTab` 状态和二级 tab 切换逻辑被移除，避免后续开发误以为提示面板仍是 tab 结构。

- 导读 prompt 输出结构收敛：
  - `readingGuide.md` 的 JSON 结构从 `overview + goals + concepts + questions + focus` 收敛为 `overview + goals + questions`。
  - 要求 `goals` 正好 3 条，`questions` 正好 3 条。
  - 明确要求模型不要输出 `concepts`、`focus`、`notes` 或其他额外字段。
  - 自查规则新增“goals 是否正好 3 条、questions 是否正好 3 条”的检查。
  - 前端仍保留对旧导读缓存的兼容解析，但新生成导读会遵循新的 3 目标 + 3 问题结构。

- 每条导读提示增加双动作：
  - 每个目标/问题下方新增两个操作：`我要记笔记` 和 `和读伴聊聊`。
  - `和读伴聊聊` 会切到「问 读伴」面板，并把该目标/问题作为用户消息发送给读伴。
  - `我要记笔记` 会切到「笔记」面板，并打开待保存笔记浮窗。
  - 从导读提示创建的笔记草稿会记录 `source: "guide"`，并保存 `insightType`、`insightTitle` 等来源信息，便于后续区分“原文高亮笔记”和“导读目标/问题笔记”。
  - 笔记浮窗标题会根据来源显示「记录这个目标」或「记录这个问题」，placeholder 也改为更适合读前记录的文案。

- 笔记浮窗拖动：
  - `FloatingNoteComposer` 从固定底部定位改为可拖拽浮窗。
  - 浮窗初始仍靠近底部，桌面端避开右侧 sidebar，窄屏时居中。
  - 顶部新增轻量拖动把手，只在把手区域响应拖动，textarea 和按钮不会误触发拖动。
  - 拖动位置会被限制在当前 viewport 内，避免拖出屏幕。
  - 支持键盘方向键微调，`Shift + 方向键` 大步移动，`Home` 回到底部初始位置。

- 验证记录：
  - 每轮改动后均执行 `npm run build`，构建通过。
  - 用本地测试环境 `http://127.0.0.1:5175/` 检查过 logo、开屏动画、品牌字体、阅读提示空状态和 sidebar 入口。
  - 自动化环境中 PDF text layer 的真实拖选不稳定，未能完整自动触发“选中文字 -> 添加笔记 -> 拖动浮窗”的端到端路径；但拖动能力本身已通过代码和构建验证，交互入口为浮窗顶部「拖动窗口」把手。

### 2026-06-08

- 开书分析流程需求设计：
  - 将“阅读目标与节奏设置”从旧的表单式收集，升级为“读伴先分析整本书，再和用户商量阅读契约”的目标流程。
  - 明确上传和确认章节后，下一步应由用户点击「让读伴分析这本书」，生成整本书导读 `wholeBookGuide`。
  - 明确 `wholeBookGuide` 的作用不是摘要，而是开书地图：核心问题、结构地图、关键转折、阅读难点、建议读法和读伴侧重点建议。
  - 明确 `readingProfile.companionFocus` 是本书读伴的长期行为参数，后续章节导读、阅读中问答、读后交流都必须带入。
  - 明确新版 `readingProfile` 应包含 `pace`、`companionFocus` 和 `wholeBookGuide` 状态；旧版 `purpose` / `pace` / `weekdays` / `startDate` 需要兼容。
  - 明确旧书不应因为缺少 `wholeBookGuide` 被阻塞；可以继续阅读，并在合适入口提示补生成整本书导读。
  - 下一步实现前，需要先新增整本书导读 prompt，再改造 `ReadingPlanSetup.jsx` 为开书分析页。
- 新增并接入 `src/prompts/wholeBookGuide.md`：
  - prompt 输出整本书开书导读的内容字段，不让模型生成 `status`、`generatedAt`、`model`、`usage` 等运行时元数据。
  - 输出结构覆盖 `overview`、`fullOverview`、`bookProblem`、`coreQuestion`、`structureMap`、`keyTurns`、`difficultyMap`、`suggestedReadingPaths`、`companionFocusOptions`、`planAdvice` 和 `sourceLimitations`。
  - 明确要求模型基于章节结构、导读章节和正文抽样生成，不假装完整细读整本书全文。
  - `promptTemplates.js` 新增 `buildWholeBookGuidePrompts`。
  - 新增 `src/lib/wholeBookGuide.js`，负责组织章节列表、导读章节和正文抽样，调用模型，解析 JSON，并把结果保存到书籍元数据的 `wholeBookGuide`。
  - `ReadingPlanSetup.jsx` 已改造为开书分析页：先生成整本书导读，再选择节奏和读伴侧重点，最后生成本地阅读计划草稿。
  - `BookSetup`、书架和阅读器空计划入口文案同步从“阅读节奏”调整为“开书分析/开书设置”。
- 修复整本书导读解析失败体验：
  - 发现 `wholeBookGuide` 输出 token 正好打满 `maxTokens` 时，模型返回的 JSON 容易被截断，导致 `JSON.parse` 失败。
  - 将整本书导读输出上限提高，并收紧 prompt 输出长度，避免结构化 JSON 过长。
  - 解析失败时保存为 `status: "failed"` 诊断态，页面显示错误提示，不再把失败结果渲染成“已生成”的导读卡片。
- 调整整本书导读展示层级：
  - `wholeBookGuide.md` 要求先形成完整开书理解，再输出 `fullOverview` 完整底稿和 `overview` 压缩版入口。
  - `ReadingPlanSetup.jsx` 默认只展示快速导读，完整导读放在「展开完整导读」里，避免用户一开始被长文压住。
  - 旧数据如果只有长 `overview`，前端会自动把它作为 `fullOverview`，并生成短预览。
- 优化整本书导读的“地图”展示：
  - 原先直接把 `bookProblem`、`coreQuestion`、`structureMap`、`difficultyMap` 摆成多组卡片，视觉上像后台字段面板，用户不容易理解。
  - 改为三个阅读层级：先抓住这本书的入口、阅读路线、读伴会多帮你的地方。
  - 结构地图改为纵向路线，难点地图改为“为什么会卡 / 读伴怎么帮”的支援清单，减少并排卡片造成的扫读负担。
- 更新整本书导读 prompt 的表达和个性化要求：
  - `wholeBookGuide.md` 增加“先讲透，再结构化”的要求，强调读伴要给出能点醒人的入口，而不是堆字段或术语。
  - 明确少用晦涩抽象词，必要概念必须先用白话解释；界面展示句尽量直接对“你”说，减少“用户/读者”式旁观口吻。
  - 用户填写的阅读意图被视为本书读伴契约，必须写入 overview、fullOverview、difficultyMap.supportStrategy 和 companionFocusOptions。
  - 前端对旧导读里的“读伴帮用户...”做展示清洗，避免出现“读伴会帮你：读伴帮用户...”这种重复表达。
- 设置页新增 AI 批量配置：
  - 新增 `src/lib/aiConfigImport.js`，支持解析 TXT 文档里的 `key = value` 或 `key: value` 配置行。
  - 支持 `[anthropic]`、`[openai]`、`[deepseek]`、`[kimi]`、`[openai-compatible]` 分组，也支持 `anthropic.apiKey`、`openaiCompatible.baseUrl` 等完整 key。
  - 设置页新增「AI 批量配置」区域，可上传 TXT 并立即合并保存到 IndexedDB。
  - 新增 `public/ai-config-template.txt` 作为可下载模板，预填 Anthropic、OpenAI、DeepSeek、Kimi 的 Base URL、模型名和可用价格字段。
  - 只填一个 OpenAI-compatible 供应商的 API Key 时，会自动选择该供应商并写入对应 Base URL、模型和价格；填多个 Key 时可用 `provider` 指定默认。
  - 导入时只覆盖文档里写了值的字段，空值和无法识别的行会跳过，避免半份模板清空已有配置。
  - 新增当前配置导出能力，导出的 TXT 复用导入格式并包含当前 API Key，页面提示用户妥善保存。

### 2026-06-09

- 修复阅读计划日期判断：
  - 问题：用户昨天完成一个阅读项后，今天回到书架仍显示「提前开始下一章阅读」，因为书架只根据 `completedItemKeys` 判断当前项已完成，没有比较下一阅读项的计划日期。
  - 新增 `src/lib/readingSchedule.js`，统一本地日期、计划日期和计划日是否到达的判断逻辑。
  - `progress:{bookId}` 新增 `completedAtByItemKey`，完成阅读时记录每个阅读项的完成时间；取消完成时同步移除。
  - 书架统计现在会判断下一阅读项是否已经到达计划日：到达则显示「开始今日阅读」，未到达才显示「提前开始下一章阅读」。
  - 今日完成页也会根据下一阅读项计划日调整文案：计划日已到时显示「开始下一项阅读」，未到时仍提示提前阅读。
  - 旧进度数据没有 `completedAtByItemKey` 也能继续兼容，默认空对象，不影响已有完成项。
- 增强日期提示：
  - 书架顶部显示「今天日期」和全局「上次阅读」。
  - 书卡紧凑摘要和展开详情只显示上次阅读日期，不再展示计划阅读日期，避免用户分不清它指向当前项还是下一项。
  - 计划日期只用于内部判断“开始今日阅读”还是“提前开始下一章阅读”，不再出现在主要标题和阅读目录里。
  - 书架顶部日期信息改为跟随标题显示，右侧只保留上传/测试书操作，避免日期胶囊和按钮分成两组后显得拥挤、漂浮。

### 2026-06-10 至 2026-06-15

- 打磨导读页到正文页的翻页过渡：
  - 最初从硬翻 180 度调整为更克制的纸面滑翻，避免 3D 翻转带来的炫技感和掉帧。
  - 翻页效果逐步加入折痕、高光、纸面阴影和短暂停留，让用户先看清章节名，再进入正文。
  - 阅读页改为在翻页开始时就挂载，避免动画中段切换视图造成重渲染和滚动跳动。
  - 翻页层使用 `transform` 和 `opacity` 驱动，并通过 `contain: paint` 限制重绘范围；移除滤镜和多段中间关键帧。
  - 翻页时长从早期较短版本多次调整，最终拉长到 1460ms，让纸面在大部分过渡中保持可见，最后自然淡出。
  - 阅读活动记录延后到翻页结束后执行，避免过渡期间同时触发滚动、状态记录和页面挂载。
  - `prefers-reduced-motion` 用户会跳过翻页动画，直接进入正文。

### 2026-06-15：开书契约贯穿伴读链路

- 新增 `src/lib/readingContract.js`，通过 `buildReadingContractContext({ book, item })` 统一构建当前阅读项的开书契约上下文。
- 章节导读、阅读中问答、读后交流都已接入 `bookProblem`、`coreQuestion`、当前结构位置、难点提示、关键转折和 `companionFocus`。
- prompt 规则强调开书契约是方向盘，不是每次都要复述的材料；有上下文就自然使用，没有上下文就不编造。
- 新增单本书读伴记忆数据层 `updateBookCompanionFocus(bookId, companionFocusPatch)`，支持旧书兼容和字段规范化。
- 阅读器 sidebar 新增「记忆」面板，用户可以在阅读过程中调整本书读伴记忆；保存只影响 `readingProfile.companionFocus`，不清空导读、聊天、读后交流、笔记或阅读进度。
- 新增 [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md)，集中记录上下文字段、兼容策略、三类 prompt 接入进展和后续验证重点。

### 2026-07-01 至 2026-07-02：Keychain 体验与提示词规范收口

- 桌面版 AI 使用路径新增进程内 API Key 缓存：真正模型请求缺少明文 Key 时，Rust 后端先查内存缓存，缓存缺失才读取系统 Keychain；缓存不写入 SQLite、备份、日志或错误信息。
- 保存新 Key、删除 Key 或清空数据时会清空缓存，避免继续使用旧密钥；Keychain 读取和缓存写入在同一锁内完成，减少并发请求触发多次系统授权。
- P6.4.1 + P6.4.2 已完成：Tauri AI command 统一返回脱敏错误结构，包含用户文案、诊断码、错误分类、可重试标记和 HTTP 状态；桌面 AI 请求加入 15 秒连接超时、180 秒总请求超时、最多 3 次请求尝试和 400ms/1000ms 退避。
- 错误分类已覆盖网络/超时、鉴权、权限、限流/额度、模型或 Base URL、上下文过长、响应格式异常和服务端临时错误；不把供应商原始错误或敏感请求内容直接展示给用户。
- P6.4.3 已完成请求取消：`callModelDetailed` / `streamModelDetailed` 支持 AbortSignal，Tauri transport 通过 requestId 调用取消 command，Rust 后端中止发送、重试退避和流式读取；开书分析、章节导读、伴读聊天和读后交流都有停止入口。
- P6.4.4 已完成输出截断识别：浏览器和桌面 AI response 统一带 `truncated`；`max_tokens` / `length` / `max_output_tokens` / `output_token_limit` 不会被当作完整输出；章节导读和 AI 正文整理命中截断会失败并拒绝保存半截结果，整本书导读保存 failed 诊断态，聊天和读后追问保留回答但提示“已到输出上限”。
- P6.4.5 已完成费用/token 预算保护：正式 AI 请求发出前统一估算输入 token、最大输出 token 和最高费用；设置页可配置单次输入/输出上限、单次费用上限和每日费用上限；预算用量只保存日期、任务类型、token 和估算费用，内部 key `__duban:ai-budget:{date}` 不进入浏览器或桌面备份。
- P6.4.6 已完成模型 profile 管理：设置页支持按整本书导读、章节导读、伴读问答、读后追问和正文整理分别配置供应商、模型、Base URL、价格、输出 token 上限和 temperature；正式 AI 请求会先解析任务 profile，再经过预算、截断、取消和 transport 统一入口；profile 不保存 API Key。
- P6.4 收尾已完成脱敏 AI 调用诊断：正式 AI 请求会记录最近 20 条本机诊断，包含任务、模型、Base URL origin、耗时、状态、错误码、尝试次数、token 和费用估算；设置页新增「诊断」入口，可查看和清空；内部 key `__duban:ai-diagnostics` 不进入浏览器或桌面备份。
- 新增 [PROMPT_WRITING_STANDARDS.md](./PROMPT_WRITING_STANDARDS.md)，把产品内提示词的文风要求、慎用句式、背景知识边界和验收流程固定下来。
- 更新 `mentorPersona.md`、`wholeBookGuide.md`、`readingGuide.md`、`readingChat.md`、`readingReflection.md` 和 `readingTextFormat.md`，减少模板腔和高频“不是……而是……”对照转折，强调渊博但不编造、专业但不卖弄。
- `wholeBookGuide` 和 `readingGuide` 写入 `styleVersion`，为后续识别文风版本和缓存治理预留元数据。
- `readingContract.js` 复用 `normalizeWholeBookGuide` 解析整本书导读，减少重复 JSON 修复逻辑。

### 2026-07-06：开书设置改为多轮设定读伴对话

- 开书设置第一步从“先生成整本书导读”调整为“先通过几轮对话设定这本书的读伴”：第一步隐藏顶部步骤卡、书籍统计摘要和开书地图内容，只保留空白读伴、气泡、当前问题、回答框和进度。
- 新增五个对话状态：Intro、来处、好奇心、陪读方式和成形；读伴用“Hi，我是读伴，你的阅读助手。接下来，我们会进行几轮对话，真正定制你的阅读体验。”开场。
- 读伴形态会随轮次逐步完善：从空白书页开始，依次显现眼睛、书签、线条和完成标记，让开书更像一段入书前的相识。
- 原独立「陪读方式」步骤已取消；抓主线、补背景、拆论证、联系现实、沉淀输出和自定义选择并入最后一轮设定读伴对话。
- 成形阶段新增名字、颜色和表情定制，并保存为 `readingProfile.companionFocus.companionProfile`。
- `readingProfile.companionFocus` 新增 `openingAnswers`、`openingMessage`、`companionProfile` 和 `customFocus` 写入路径；同时继续维护 `userText`、`aiSummary` 和 `promptInstruction`，保持 `buildReadingContractContext({ book, item })` 的后续读取方式不变。
- 整本书导读不再压在第一步里；开书地图作为后续可选增强能力保留，不打断第一步对话。
- `wholeBookGuide.md` 将用户输入从“用户已知阅读意图”改为“用户给读伴捎的话”，并要求 `overview` 第一句正面说明这本书是什么或带用户进入什么问题，避免用“这本书不是……”开头。
- 新增 [OPENING_COMPANION_ONBOARDING.md](./OPENING_COMPANION_ONBOARDING.md)，集中记录这次“设定读伴式开书”的背景、目标、界面流程、数据字段、prompt 约束、验证记录和后续建议。

### 2026-07-07：P6.5 安全与隐私加固基础版完成

- Tauri 存储 command 输入边界收束：读写/删除 key 会拒绝空值、过长值、控制字符、路径分隔符和 `..`；删除书籍会校验 book id；外部备份路径会先做文本校验再 canonicalize。
- 本地文件路径改为白名单形态：普通书籍 blob 只允许顶层文件，封面缓存只允许 `covers/` 下文件；封面读取、备份读取和孤儿文件清理都走统一安全路径拼接。
- 导入/备份链路继续保留 manifest/file sha256、导入前预览、校验报告、merge/replace 和失败自动回滚；本轮没有改变备份格式版本。
- Tauri 配置新增正式 CSP、dev CSP、`X-Content-Type-Options` 和 `Permissions-Policy`；Web 静态部署新增 `public/_headers`，包含 `Referrer-Policy`。
- 新增 `scripts/security_scan.mjs` 与 `npm run security:scan`，检查真实密钥形态、Tauri CSP/headers、asset protocol scope、capabilities 和备份密钥剥离锚点；`npm run security:audit` 会同时运行 `npm audit`、Rust 重复依赖树和安全扫描。
- 更新根目录 `SECURITY.md`、`PRIVACY.md`，以及 P6.5 审计、生产级路线、后端标准、AI 接手提示词、公开成熟度和 App 化日志文档。
- 已知限制：`cargo audit` 尚未纳入当前本机命令，需要在 P6.9 CI 或发布机补齐；`public/_headers` 只覆盖支持该约定的静态托管平台。

### 2026-07-07：P6.6.1 + P6.6.2 诊断规范与本地日志基础

- 新增 [DIAGNOSTICS_PRIVACY_SPEC.md](./DIAGNOSTICS_PRIVACY_SPEC.md)，定义本地日志、后续诊断包、错误详情复制和数据库健康检查的字段边界。
- 新增 Rust 本地诊断日志模块，日志写入 App 数据目录 `logs/duban-diagnostics.jsonl`，超过 1 MB 后轮转为 `duban-diagnostics.1.jsonl`。
- 诊断日志写入前统一脱敏：密钥类字段、Authorization、prompt、messages、content、text、note、chat、base64、raw_json 等字段会被过滤；URL 字段只保留 origin；字符串内 `sk-...` 与 `Bearer ...` 会被替换。
- App 启动会记录运行环境、debug 状态、系统、架构和 schema 版本；SQLite 初始化成功/失败会记录摘要。
- AI 请求会记录开始、成功、失败和取消摘要，包括 provider、model、Base URL origin、messageCount、attempts、finishReason、truncated、错误码和 HTTP 状态；不记录 prompt、正文、笔记、聊天或 API Key。
- 截至 P6.6.2，当时仍未实现诊断包导出、数据库健康检查 command、备份操作日志和设置页入口，这些放入 P6.6 后续步骤。

### 2026-07-07：P6.6.3 + P6.6.4 健康检查与诊断包导出

- 新增 `duban_diagnostics_health_check` Tauri command，检查 schema 版本、SQLite quick_check、关键表计数、本地文件缺失/不安全路径、孤儿文件、备份目录读写和非敏感 Key 状态。
- 新增 `duban_diagnostics_export_package` Tauri command，导出脱敏 JSON 诊断包到 App 数据目录 `diagnostics/duban-diagnostics-{timestamp}.json`。
- 诊断包包含 App 摘要、存储健康检查、备份摘要、设置摘要、AI 调用诊断和最近本地诊断日志；导出前再次执行统一隐私过滤。
- 新增 `src/lib/diagnostics.js`，为后续设置页入口提供 `runDiagnosticHealthCheck` 和 `exportDiagnosticPackage`。
- Rust 测试新增健康检查覆盖：空初始化存储应为 `ok`，索引文件缺失应为 `error`。
- 截至该小阶段，设置页 UI 入口和错误详情复制仍未实现，这两项放到 P6.6.5。

### 2026-07-07：P6.6.5 + P6.6.6 诊断入口、错误详情复制与收尾

- 设置页「诊断」面板新增桌面健康检查入口，展示 schema、SQLite quick_check、文件健康、备份目录和非敏感 Key 状态。
- 设置页新增导出诊断包入口，显示导出文件名、本机路径、包大小、健康状态和日志条数。
- 新增 AI 错误详情复制：可以复制最近异常调用，也可以复制单条异常摘要；复制内容不包含 API Key、prompt、正文、笔记或聊天全文。
- 备份导出、导入、删除和元数据更新会写入脱敏本地诊断日志；不记录外部路径、备注正文或书籍内容。
- P6.6 文档、路线图、后端标准和 AI 接手提示词已收口；下一步进入 P6.7 正式 macOS 发布包。

## 当前已知限制

- 浏览器 IndexedDB 不应视为长期大型书库的最终存储方案。
- 浏览器版直连 OpenAI-compatible 服务可能遇到 CORS 限制；Tauri 桌面版已通过本地 Rust command 代理模型请求。
- P6.4 AI transport 生产化主体已完成：Keychain 连续弹窗、结构化错误、超时、有限重试、请求取消、输出截断识别、费用/token 预算保护、模型 profile 管理和脱敏调用诊断均已落地。
- P6.5 安全与隐私加固基础版已完成；P6.6 本地诊断与可支持性基础版已完成，下一步进入 P6.7 正式 macOS 发布包。
- 2026-07-08：桌面版主窗口点叉号改为隐藏到后台，不直接退出进程；macOS 点击 Dock 图标会重新显示并聚焦主窗口。
- 2026-07-08：`tauri:dev` 下 Dock 右键退出可能短暂显示终端/调试进程图标；这是开发态未打包二进制的身份问题。Dock 图标一致性请用 `src-tauri/target/release/bundle/macos/读伴.app` 这类真实 bundle 测试包验证。
- PDF 图片、表格、扫描件 OCR 暂未支持。
- MOBI 当前提供文本阅读，不渲染 Kindle 原版版式，也暂不显示 MOBI 内嵌图片或真实内嵌封面。
- 章节识别已加入 PDF 递归 outline、页面版式标题候选和质量评分兜底；复杂目录页、扫描版 PDF 或标题版式异常的书仍可能需要用户手动调整。
- 当前阅读计划仍是本地草稿，尚未调用 AI 优化。
- AI 章节导读已实现手动生成、耗时提示、token 展示和费用估算，但还没有流式输出和编辑能力。
- 阅读会话已实现三段式骨架、阅读位置保存、PDF 原版页渲染、PDF text layer、选中文本提问浮层、高亮笔记、当前章节 sidebar 问答和读后交流；尚未支持字体设置。
- PDF.js worker 会让构建产物体积偏大，后续可考虑按需加载或拆包。
