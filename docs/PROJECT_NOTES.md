# 读伴项目记录

> 最后更新：2026-07-22

这份文档用于记录「读伴」的产品需求、架构共识、数据概念和重要决策。已有开发日志作为历史保留；2026-07-22 起，每次实施只在 `APP_EVOLUTION_LOG.md` 追加，避免三份日志重复维护。

文档分工见 [README.md](./README.md)。简单来说：本文件维护当前共识；路线优先级写入 [ROADMAP.md](./ROADMAP.md)；实施流水统一写入 [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md)；产品内提示词规范写入 [PROMPT_WRITING_STANDARDS.md](./PROMPT_WRITING_STANDARDS.md)；UI 现行规则写入 [UI_DESIGN_STANDARDS.md](./UI_DESIGN_STANDARDS.md)。

## 产品愿景

### P7.11 诊断与阶段收口现行契约

- 用户主动发起的导读、问答和读后交流都可在设置页解释选材、排除原因、阅读规则、预算和缓存状态；诊断不是第二份内容存储。
- 诊断摘要使用固定字段白名单，原始来源 id 转为单向指纹；正文、笔记、问题、回答、prompt、排除说明原文和 API Key 不得持久化或导出。
- P7.1-P7.11 已完成并进入维护状态。功能阶段完成与公开发版分离；每个公开候选仍需独立完成签名、公证、干净机器和自动更新验收。
- 产品主线下一阶段为 P8.1 移动技术验证；P9 云后端仍在 P8 之后。

### P7.10 视觉状态现行契约

- 状态只来自真实信号：导读生成、AI 回答、笔记保存、场景完成、当前错误和浏览器/桌面联网状态；不得随机切换表情或用停留时间制造“活着”的假象。
- 正文阅读默认是 `quiet`，形象完全静止。`preparing` 和 `answering` 只在任务运行期间保留轻量进度反馈；`recording` 与 `complete` 只播放一次短过渡；`error` 与 `offline` 使用静态降级。
- 离线时阅读、翻页、笔记和已有内容查看保持可用，界面明确说明 AI 功能需等待网络恢复。取消生成后立即退出任务态，不残留加载动画。
- 状态契约集中在 `companionVisualState.js`，持续壳层统一暴露 `data-companion-state` 和联网状态；完整、标准和印记三种规格复用同一状态，不建立第二套状态形象。
- `prefers-reduced-motion` 下关闭状态动画和过渡，不改变按钮、取消、错误或离线功能。

### P7.9 长期记忆现行边界

- `readingProfile.companionMemory.items` 仍是用户可编辑的本书记忆真相源；`session_record.memoryLink` 只负责回溯来源和保持关联，不复制正文，也不形成第二份可编辑记忆。
- 「整理这本书」是已有成果的下游查看、修正和归档入口。这里可以按阅读项管理记忆，但不自动生成新记忆，不替代阅读中的明确确认。
- 旧记录只有在 `memoryLink.itemId`、来源事件 id 或唯一来源阅读项可以明确对应时才补齐来源；`legacy` 内容保持旧设置身份，不自动进入后续导读。
- 修改章节记忆会同步关联文本；撤销只清除长期记忆和 `memoryLink`，不删除本节记录。备份合并继续以事件 `updatedAt` 和 tombstone 防止已撤销记录复活。

### 2026-07-22：章节导读通俗化与阅读动机

- 真实 Test.app 诊断显示截图对应导读一次成功，输入约 `10068` token、输出 `1021` token、`finish_reason=stop`，没有触发输入压缩或输出恢复；难懂来自写作规则本身，不是长度处理。
- 导读 prompt 移除“上帝视角”和过度强调公共评价、宏大问题意识的要求，改为让用户直接看懂“上一段讲了什么、这一段要讲什么、阅读时留意什么”。
- 每段优先落到人物、地点、事件、制度、书中概念或明确行动；专业词首次出现立即用白话解释。是否易懂按完整句子判断，不设置词语黑名单，也不机械删除原文已有表达。
- 导读进一步收紧篇幅：上一项只承接 1 句话；正文从材料中的一个具体冲突、反常之处或现实后果切入，让兴趣来自事实本身，不靠营销词、连续提问或故意卖关子。
- 后续导读标题统一为“接上一次阅读 / 今天为什么值得读”，承接内容要求使用具体事件、观点或结果，不再使用“叙事推进、往哪里推进”等后台式表达。
- 文风不触发自动重写。只有输出截断、结构损坏或接口明确报告输入超限时才进入可靠性恢复，避免误判、额外费用和循环调用。
- prompt 版本升级为 `reading-guide:p7.9.2-v5`，旧导读缓存会按版本失效；不改变 SQLite schema、Keychain、备份格式或阅读边界。
- P7 全量测试、formal/test 构建、安全扫描、桌面 release 编译和临时签名校验通过；最新 Test.app 可执行文件 SHA-256 为 `29f0e7ca2d59a8e4c647cb2ea4fb60c3021eb4c8924add8d2deae0ad337bf9f5`。

### 2026-07-22：章节导读高失败率修复

- 真实桌面诊断确认最近两次导读均正常连通 DeepSeek，但输出恰好达到 `1800` token 且以 `finish_reason=length` 结束；失败来自 JSON 被截断，不是网络、Keychain 或正文解析异常。
- 章节导读的默认输出上限由 `1800` 提升至 `3200` token；简练、适中、深入三档分别为 `2200 / 3200 / 4600`，仍允许模型 profile 和预算规则向下限制。
- 首次结果被截断或无法形成有效导读时自动恢复一次：明确压缩 overview 和各条目标/问题的篇幅，同时给完整 JSON 留出受控余量；标准档第二次上限为 `4800` token。二次失败才向用户显示可操作错误，不保存半截内容。
- 如果接口明确报告输入上下文过长，则按约 `55%` 的上下文预算重新编排一次；正文不再从尾部硬截断，而是保留开头、中段和结尾，并在诊断中标记压缩来源。普通网络或鉴权错误不会触发该流程。
- 两次调用的 token 与费用合并计入诊断和预算，导读记录补充 `generationAttempts` 与 `recoveredFrom`，避免自动重试变成隐形消耗。
- 新增 `test:reading-guide-reliability` 并纳入 `test:p7`，覆盖直接成功、输出压缩恢复、输入超限识别、格式恢复和连续失败。本轮不改变 SQLite schema、Keychain、备份格式或 test/formal 数据隔离。
- P7 全量测试、formal/test 构建、安全扫描、桌面 release 编译和临时签名校验通过；该轮 `读伴 Test.app` 的 bundle id 为 `com.duban.reader.test`，可执行文件 SHA-256 为 `bd72b41a278ddb61f871a7e09c447dbbefad27c839723c1eddeb59077496eaed`。

### 2026-07-22：P7.9.2 后续导读的受控承接

- 后续导读不再笼统带入“相关或最近”的本书记忆：上一阅读项的确认记录按连续阅读关系承接，更早记录必须命中当前标题、章节结构、整书问题或难点。
- 当前/未来阅读项、来源不明、旧设置自动迁入和无关记录不会进入导读；每次最多 3 条，仍服从防剧透和上下文预算。
- 导读 prompt 升级为 `reading-guide:p7.9.2-v1`。缓存只随实际入选记录变化，无关记忆的编辑不会触发重新生成。
- 诊断来源只保存记忆 id、来源类型、来源阅读项、来源事件、命中原因和指纹，不保存用户记忆正文。
- 新增 `test:guide-memory-carryover` 并纳入 `test:p7`；P7 全量测试、formal/test 构建、安全扫描、桌面 release 编译和临时签名校验通过。
- 最新 `读伴 Test.app` 已启动且只有一个实例，bundle id 为 `com.duban.reader.test`，可执行文件 SHA-256 为 `f6c8bd98f27f79a76e9ef8e91406fd9f3345b02cceecec1fbf4d890b17fc2145`。
- 本轮不新增 SQLite 表、存储 key 或备份字段，schema 10 与目录备份 v3 保持不变。下一步为 **P7.9.3 整理与长期回归**。

### 2026-07-22：完成页适配验收收尾

- 昨日中断后继续完成“回答默认展开”和“今天这段读完了”页面响应式验收，专项测试、P7 全量测试、formal/test build、安全扫描和签名校验均通过。
- 清理昨日重启过程中留下的重复 Test.app 进程，当前只运行一个最新实例；包可执行文件 SHA-256 仍为 `e965fd9e9099844f0166c7573b776c11a94cf3b5283dc20e3f5371bd92e49f62`。

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

## 2026-07-21：读后记录改为阅读时间线的连续阶段

- 移除读后页“读完后，留一个判断”大标题，读中的导读线索、问题、回答和笔记继续显示在同一时间线中；进入读后时默认定位最新记录。
- 场景切换把时间线纳入共享元素过渡。Tauri 仍使用已验证的局部 fallback，避免重新引入长正文/PDF Canvas 整页快照闪烁。
- 读后页改为单视口布局，无全局滚动条；只有时间线独立滚动。1280×720 与 760×620 实测页面高度等于视口高度，窗口变窄后仍保持贴底。
- 输入提示统一为“还有什么想聊的，可以接着聊。”。用户产生读后交流后可以一键整理或重新整理本节总结；总结使用独立 prompt，并继续受防剧透、阅读边界、上下文预算和来源约束。
- 用户问题、读伴回答和居中记录继续使用不同布局；笔记进一步改为暖纸便签，避免居中后仍像聊天排版失误。
- 新增 `test:reading-reflection-experience` 并纳入 `test:p7`；P7 全量测试、formal/test build、安全扫描、28 个 Rust 测试与签名校验通过。
- `读伴 Test.app` 已重建并启动，bundle id 为 `com.duban.reader.test`，可执行文件 SHA-256 为 `3b670773a30bcca706d8e0835a2c87747ce1769b3c04219d8e5f4d8a936925c9`。
- 本轮不新增 SQLite 表或 key，不改变 schema 10、目录备份 v3、Keychain、书籍文件或 test/formal 数据隔离。下一步仍为 **P7.9.2 后续导读的受控承接**。
- 完成页成果索引补充默认选择：优先展开有内容的“回答”，回答为空时依次选择“笔记”或“读后”；用户手动操作后不强制切回。
- “今天这段读完了”页面同步改为 `100dvh`：宽屏采用成果区与阅读目录双栏，成果详情和目录各自在边界内滚动；900px 以下切为单列内部滚动，文档本身不产生全局滚动条。
- 默认成果与完成页适配补丁已完成 P7 全量测试、formal/test build、安全扫描和签名校验；最新 Test.app 可执行文件 SHA-256 为 `e965fd9e9099844f0166c7573b776c11a94cf3b5283dc20e3f5371bd92e49f62`。

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
- 阅读器正文页已开始按「现代数字书斋」视觉标准收敛：顶栏、正文纸页、PDF 承托和右侧读伴栏统一使用米纸、淡墨、柔和纸边和少量朱砂强调。
- 浏览器版使用 localforage + IndexedDB
- Tauri 桌面版已接入 SQLite + App 数据目录文件存储，API Key 保存到系统 Keychain；真正 AI 使用路径允许在当前进程内短期缓存已解析密钥，减少连续系统授权弹窗
- Claude / OpenAI-compatible BYOK，用户在设置页填自己的 API Key
- 模型调用已抽象为供应商接口，当前支持 Anthropic Claude 和 OpenAI-compatible Chat Completions。
- 后端开发标准记录在 [BACKEND_DEVELOPMENT_STANDARDS.md](./BACKEND_DEVELOPMENT_STANDARDS.md)，后续 AI 接手提示词记录在 [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md)。
- 剩余生产级升级路线记录在 [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md)，覆盖数据可靠、正式发布、安全隐私、诊断、CI、QA、自动更新和 public alpha。
- P7.1-P7.10 已完成；读伴界面已采用“朱砂批注 + 具象猫与书页读伴”，本节完成页只提供回答、笔记和读后交流回看，后续导读只承接用户确认且本次相关的过往记录；八种视觉状态均来自真实任务信号，正文静默态没有循环动画。下一步为 P7.11 诊断、QA 与 Public Alpha 验收。

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
  - `BrandName` 统一渲染界面中的「读伴」二字，使用项目内置的轻量书写字标字体；普通 UI 文本仍保持原有清晰字体。
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

当前权威顺序以 [ROADMAP.md](./ROADMAP.md) 为准：

1. **P7.11 诊断、QA 与 Public Alpha 验收**：完善上下文解释、固定样本、隐私/迁移/动效回归和候选包检查。
2. P7 完成后再进入 **P8 手机版 App**；**P9 云后端与同步**不作为 P8 前置条件。

持续发布运营事项：下一候选必须带入 Alpha.4 之后的 MOBI/KF8、动态分屏、精确划词、笔记高亮和 P7 改动；Alpha.3 到 Alpha.4 的 App 内升级体验与 updater 私钥离线备份仍由用户择机完成。

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
  - 新增 `.brand-script` 字体类；最初使用系统手写字体栈，现已升级为项目内置 `Duban Brand Script` 两字子集，并仅以楷体/衬线字体作为加载失败兜底。
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
- 新增 `scripts/security_scan.mjs` 与 `npm run security:scan`，检查真实密钥形态、Tauri CSP/headers、asset protocol 必须关闭、fs 单文件只读 scope、其他 capabilities 和备份密钥剥离锚点；`npm run security:audit` 会同时运行 `npm audit`、Rust 重复依赖树和安全扫描。
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
- 2026-07-09：P6.7.1 发布配置收束已完成：固定 `0.1.0`、formal/test channel、正式/测试 bundle identifier、artifact 命名、release preflight、manifest/checksum 和 release notes 约定。下一步进入签名/公证前正式包验证。
- 2026-07-09：P6.7.2 签名/公证前准备已完成：新增 Developer ID 签名环境预检、signed DMG 打包、公证/staple、Gatekeeper 验证脚本；formal macOS 构建启用 hardened runtime 和 entitlements；发布流程文档补充用户侧 Apple Developer 证书与 notarytool 凭据步骤。
- 2026-07-09：P6.7 真实签名/公证暂时搁置：Apple Developer Program 注册申请仍在审核中，暂时无法创建 `Developer ID Application` 证书；下一步建议先推进不依赖 Apple 审核的 P6.9 CI 与发布流水线或 P6.10 QA 矩阵。
- 2026-07-09：P6.9.1 基础 CI 和 P6.9.2 Release preflight CI 已完成：新增 GitHub Actions，在 macOS runner 上执行 `npm run build`、`npm run release:preflight`、Rust fmt/check/test 和 `npm run security:scan`。
- 2026-07-09：P6.9.3 发布检查清单与协作模板已完成：新增 release checklist、PR checklist、bug report 和 feature request issue forms，明确验证命令、隐私边界、数据迁移、备份、Keychain、发布和文档同步检查。
- 2026-07-09：P6.10.1 QA 矩阵基础版已完成：新增 QA matrix，覆盖 P0 smoke、P1 核心回归、升级恢复、跨环境维度、样本策略和发布测试记录模板。
- 2026-07-09：P6.10.2 fixtures/样本说明基础版已完成：新增 `qa-fixtures/`、合成 PDF、坏 PDF、HTML 源文本、空备份 manifest、篡改备份 manifest、fixtures manifest，以及 `qa:fixtures`/`qa:fixtures:verify` 脚本。
- 2026-07-10：Apple Developer Program 审核已通过，P6.7 外部阻塞解除；`Developer ID Application: Zhanwen Lu (FBMN9293RM)` 已安装在登录钥匙串并与私钥正确配对，`duban-notarytool` Keychain profile 已通过 Apple 验证并保存，严格发布预检已通过；下一步运行 signed + notarized DMG 全流程。
- 2026-07-10：首个真实 `arm64` 正式 DMG 已完成 Developer ID 签名并获 Apple notarization `Accepted`（Submission ID `024075bb-11c2-4f70-b7f8-d1d0da68f0a6`）；staple、App/DMG Gatekeeper 和 checksum 验证均通过。正式打包脚本改为保留 `app,dmg` 并在产出后立即验证两者签名；P6.7 仅剩干净 macOS 人工回归。
- 2026-07-10：正式包人工回归发现旧 PDF 在 macOS `asset://` 自定义协议下被 PDF.js 以状态 `0` 拒绝，原始文件、SQLite 索引和 scope 均正常。首个公证候选包已作废；`fileAdapter` 新增自定义协议 XHR 二进制读取，`PdfReader` 在 `asset:` 下改以 `data` 加载，formal build 和安全扫描通过，等待桌面人工确认后重新公证。
- 2026-07-10：发现历史 `tauri:dev` 没有加载 `tauri.test.conf.json`，导致开发数据写入 `com.duban.reader`。现已将 `tauri:dev` 固定到 test 配置、基础 Tauri identifier 改为 test-safe、窗口标题改为 `读伴 Test`，Keychain service 改为按 identifier 隔离；历史 310 MB 开发书库已完整迁入 `com.duban.reader.test`，并保留 `com.duban.reader.pre-isolation-20260710` 回滚快照。本地 formal/test 双进程验证为正式库 0 本、测试库 2 本。
- 2026-07-10：版本管理第一步完成：由于历史 `v0.1.0` 已指向旧提交且不可复用，当前开发线升为 `0.2.0-alpha.1`。新增 `scripts/version.mjs`、`version:check/set/bump`、`docs/VERSIONING.md` 和根目录 `CHANGELOG.md`；`package.json` 为单一人工版本源，脚本同步 Cargo/npm lock，并为 macOS 派生数字版本 `0.2.0` / build `0.2.101`；CI、release preflight 和 signing preflight 接入一致性检查。
- 2026-07-10：P6.7.5 版本可见性完成：Vite 从 `package.json`、Git/CI 和 Rust 存储常量注入 App version、channel、commit/dirty、schema、backup version；设置导航显示简版身份，诊断页显示并可复制完整构建身份。正式候选包要求 `formal`、目标 commit 且不带 `dirty`。
- 2026-07-10：P6.7.6 tag 驱动发布链路完成：新增 release candidate/tag-ready/tagged 状态校验、Changelog 冻结、release notes、发布 manifest/checksum/notary evidence 和离线状态机自测。推送位于 `origin/main` 的 clean annotated `v<version>` tag 后，GitHub Actions 会在 `macos-release` Environment 中完成 arm64 Developer ID 签名、Apple 公证/staple、Gatekeeper 验证，并以 draft-first 方式上传和发布 GitHub Release；P6.8 后续直接消费同一套 tag/source metadata 与 Release assets。本轮未创建或推送 tag，也未实际发布 Release。
- 2026-07-11：`v0.2.0-alpha.1` 首次 tag workflow 在签名前被 annotated-tag 护栏拦截：远端 tag 正确，但 checkout runner 的同名本地 ref 暂时指向 commit。未使用 Apple Secrets、未生成 DMG/Release；旧 tag 保持不可变。版本升为 `0.2.0-alpha.2`，两个 release job 增加显式远端 tag object fetch，并由 release preflight 固定检查。
- 2026-07-11：`v0.2.0-alpha.2` 首个自动发布成功：GitHub Actions 完成 tagged source 全检、Developer ID 签名、Apple notarization `Accepted`、staple、Gatekeeper、manifest/checksum 和 prerelease assets 上传。独立下载 DMG 的 SHA-256、hdiutil、stapler、spctl、codesign 均通过；等待人工 smoke test。GitHub 会将中文 asset 文件名清洗为前导下划线，下个版本改用 ASCII `Duban_...` 上传名。
- 2026-07-11：P6.8.1 自动更新客户端基础完成：版本升为 `0.2.0-alpha.3`，接入官方 Tauri updater/process 插件、最小 capability、正式通道更新服务、updater preflight 和私钥泄漏扫描。测试/浏览器环境不配置远程 endpoint；Alpha 使用独立 updater 信任根和 `updater-index/alpha/latest.json`，Alpha.3 内置信任根后由 Alpha.4 完成真实升级验收。详见 `AUTO_UPDATE_ARCHITECTURE.md`。
- 2026-07-11：P6.8.2 本机信任根与发布产物代码完成：独立 updater 私钥已在项目外生成并收紧为 `600`，公钥进入 formal/release 配置；发布链强制生成和上传 ASCII 命名的 DMG、`.app.tar.gz` 与 `.sig`，普通 formal 构建不要求私钥。待用户完成离线备份并向 `macos-release` Environment 添加两个 updater Secrets 后进入 P6.8.3。
- 2026-07-11：P6.8.3 Alpha manifest 状态机完成：两个 updater Environment Secrets 已配置；发布链从 signed archive/signature 生成 `darwin-aarch64` 静态 manifest，只在公开 Release assets 验证后原子更新 `updater-index/alpha/latest.json`。状态机支持同版本幂等，拒绝倒退和同版本改写，并允许通道发布失败后的受控续跑。等待 Alpha.3 首次真实执行，下一步进入 P6.8.4 设置页更新体验与安装前恢复点。
- 2026-07-11：P6.8.4 完成：正式桌面设置页新增软件更新面板、release notes、下载进度、安装前目录式恢复点、签名安装后的安全重启和 GitHub Release 手动下载；opener capability 仅允许读伴 Releases URL。桌面 test channel 回归确认不显示入口，宽屏/390px 布局无溢出。下一步发布 Alpha.3，再由 Alpha.4 做真实双版本升级。
- 2026-07-11：P6.8 PR #3 完整 CI 通过并合并至 `main`（merge `7ee097d`）；Alpha.3 candidate 检查通过，Changelog 已冻结为 2026-07-11，进入发布准备提交与 annotated tag 阶段。
- 2026-07-11：`v0.2.0-alpha.3` 首次 updater 发布成功：workflow `29158078112` 完成签名、公证、staple、Gatekeeper、updater archive/signature、8 个 Release assets 和 `updater-index/alpha/latest.json`。独立下载 DMG 的 checksum、hdiutil、stapler、spctl 均通过；远端 manifest 正确指向 `darwin-aarch64 / 0.2.0-alpha.3`。下一步用户安装 Alpha.3，再发布 Alpha.4 做真实升级。
- 2026-07-12：桌面测试环境修复：Tauri updater 插件已在应用启动时注册，测试配置缺少合法 `plugins.updater` 对象会导致 `npm run tauri:dev` 初始化失败；现已为 `tauri.test.conf.json` 补齐与 Alpha 通道一致的公钥和 manifest endpoint。测试环境仍通过前端渠道判断隐藏“软件更新”入口，本修复只保证插件初始化和桌面验收环境可启动。
- 2026-07-12：首次 AI 配置向导完成：开屏结束后只读取设置中的非敏感 Key 状态，无 Key 时先显示仅含图标、欢迎标题和一句设置提示的系统式欢迎页，再进入三步居中悬浮引导；默认推荐 DeepSeek Flash，也可选 Claude Sonnet。连接验证成功后才复用现有 `saveSettings` 写入浏览器存储或桌面 Keychain。稍后设置只关闭当前会话，已有 Key 用户不会看到引导，也不会因此主动读取 Keychain 明文。宽屏与 390px 定位、溢出和可访问性回归通过，真实 DeepSeek/Keychain 连接待桌面人工验证。
- 2026-07-12：首次 AI 欢迎动效完成：无 Key 用户的开屏 Logo 会缩小并移动到欢迎弹窗 Logo 的精确位置，弹窗 Logo 在最后一帧接管，过程中只显示一个 Logo；纸面背景同步变为虚化遮罩，弹窗从中心展开。Splash 延后到共享动画结束后卸载，过渡来源状态保持到向导结束，避免空白帧和二次闪入。欢迎页已移除右上角关闭按钮，保留底部“稍后设置”。桌面交接位置/尺寸、时间轴截图和控制台检查通过，减少动态效果偏好继续即时切换。
- 2026-07-12：首次 AI 欢迎动效视觉/性能修正：欢迎页改用与 Splash 相同的透明 `LogoMark`，删除带米白底的图片和外层 Logo 背景、边框、阴影。移除大面积 dialog blur 与动态 backdrop-filter 插值，Logo 接管改为最后 32% 连续交叉；最终 `68×68px` Logo 为透明背景且时间轴无控制台告警。
- 2026-07-12：品牌字标与 Logo 三规格完成：基于 Google Fonts 官方 OFL 字体 Ma Shan Zheng 生成仅含“读伴”的 `Duban Brand Script` WOFF2 子集，约 `1.8 KB`，许可证随 App 分发。`BrandLogo` 新增 horizontal / vertical / compact variant，分别用于导航、Splash 和首次设置；横版根据预览反馈默认隐藏 `DUBAN` 并收紧图文间距，竖版保留英文，浏览器确认字体加载、三种真实布局和共享 Logo 尺寸均正常。
- 2026-07-12：全局产品字体统一到 `--font-app-cn`，标题、正文、按钮、输入和阅读辅助界面暂以系统 `Songti SC` 作为无授权评审基线，品牌字标与等宽技术信息保持独立。商业字体评估首选汉仪君黑、备选汉仪玄宋；未将任何试用商业字体加入仓库，采购前需确认桌面 App/Webfont/DMG 与更新包分发/字体子集化授权。
- 2026-07-13：本地旧书读取完成真实 Test bundle 修复：此前 `asset:// + XHR` 在当前 macOS WebKit 中仍失败，现改用 Tauri 官方 fs 插件读取 `$APPDATA/files/**`，只授予单文件只读权限；PDF.js 统一接收二进制 `data`。重新构建测试包后，《全球通史》第 48 页原页、文本层和后续页面成功渲染，阅读进度未迁移或重建；完整前端、Rust、发布预检和安全检查通过。下一正式候选版本必须包含该修复并重新签名、公证。
- 2026-07-13：PDF 翻页模式完成窗口宽高自适应：渲染比例同时受可用宽度和高度约束，一屏完整显示单页且阅读面板无纵向滚动；新增“专注阅读”收起/恢复读伴侧栏。真实 Test.app 验证第 48 页带侧栏和专注模式均保持比例居中，切到第 49 页后页码与继续阅读位置同步。自动双页和 MOBI 动态分页待后续。
- 2026-07-13：PDF 翻页交互继续收口：新增书页左右边缘热区、触摸/手写笔滑动、触控板横向滚动和防连跳阈值；所有入口统一更新页码和阅读进度。新增可持久化的翻页动画开关，默认使用 240ms 轻微横移/淡入/缩放，reduced motion 下关闭。Test.app 实测边缘点击从 48→49，关闭动画后 49→50，状态正常；触控板惯性手感待用户人工验收。
- 2026-07-13：阅读器窄窗口回归修正：专注阅读扩展到滚动模式；900–1180px 下标题与工具栏分行，读伴默认收起且重新打开时为覆盖层，不再压缩书页。滚动 PDF 设置 640px 可读宽度下限，解决窄窗口标题竖排、页面异常缩小和正文不可辨认。
- 2026-07-13：阅读计划以本节页码作为主显示：全球通史 PDF 第48页在当前阅读项中显示为本节第1页，后续依次递增；原书页码只在本节第一页旁轻量提示一次，顶部和读伴卡片不重复强调。底层 pageNumber、高亮、笔记、AI 上下文与恢复进度仍保存真实 PDF 页码，历史数据无需迁移；独立引用页码明确标为“原书第X页”。
- 2026-07-13：读伴产品方向完成能力优先校正，并新增 P7 主动陪读引擎规划。保留“用户为一本书设定读伴并由它陪完整本书”的核心，但暂停继续扩展没有功能差异的名字、颜色、表情和抽象人格标签。P7 按章节内容地图、提问埋点预生成、阅读事件、介入调度、阅读中提问、回答记忆、章节沉淀、开书设置收敛、诊断 QA 和视觉身份重构十步推进；任何用户设置都必须映射到真实埋点选择、触发频率或问题形式。详细设计见 [COMPANION_ACTIVE_READING_PLAN.md](./COMPANION_ACTIVE_READING_PLAN.md)。本轮只更新规划与决策记录，尚未修改产品代码、数据 schema 或现有用户数据。
- 2026-07-13：阶段顺序正式调整为 P6 生产化整体收尾、P7 主动陪读引擎、P8 手机版 App、P9 云后端与多设备同步。原 P6.12 云同步/后端决策整体移动到 P9，P6.12 改为生产化总验收与阶段冻结，统一收口正式候选包、自动更新双版本验收、升级样本、自动化回归、`cargo audit`、Public Alpha 说明、updater 私钥离线备份和最终 release/QA 检查。P8 手机版首期不依赖账号和云服务，先完成本地导入、阅读、AI、笔记和手动迁移闭环；P9 再建设账号、本地优先同步、加密、云基础设施和可选模型代理。新增 [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md) 与 [CLOUD_BACKEND_PLAN.md](./CLOUD_BACKEND_PLAN.md)。本轮只调整路线与文档，没有开始 P8/P9 代码实现。
- 2026-07-13：P6.12.1 正式候选包准备启动。已从 `main@2a6d82f` 建立 `codex/p6.12.1-alpha.4` 分支，并使用统一升版脚本将 npm、Cargo、Tauri、macOS bundleVersion、lockfile 和 Changelog 目标同步到 `0.2.0-alpha.4`。候选内容包含受限 Tauri fs 旧 PDF 修复、首次 AI 配置向导、品牌三规格、PDF 自适应/手势/动画、窄窗口专注阅读和本节页码。正式构建、版本检查、发布状态机、release preflight、安全扫描、QA fixtures、Rust fmt/check、26 个 Rust 测试和联网 `npm audit` 已通过，依赖审计结果为 0 漏洞。真实 `读伴 Test.app` 已直接恢复升级前保存的《全球通史》，原页与文本层正常；自动化操作验证了滚动切翻页、本节第 3→4 页边缘点击和专注阅读收起侧栏。候选尚未签名、公证或在另一台干净 macOS 上完成最终人工回归。
- 2026-07-13：Alpha.4 候选 PR #4 的 GitHub Actions 已通过并合并到 `main@ccb4cc1`。`release:prepare` 已将 Changelog 的 Alpha.4 内容从 Unreleased 冻结为 `2026-07-13` 正式版本段；下一步提交 release preparation、通过 tag-ready 检查并推送 annotated `v0.2.0-alpha.4` tag，触发 GitHub Environment 中的签名、公证、staple、Gatekeeper、updater artifacts 和 GitHub prerelease 流程。
- 2026-07-13：P6.12.1 Alpha.4 正式候选机器发布与本机旧书回归完成。`main@512718f` 的 CI 与 tag-ready 检查通过，annotated `v0.2.0-alpha.4` 触发 workflow `29221217621`；Developer ID 签名、Apple notarization `Accepted`（Submission ID `dc424207-65de-4cb6-b2f4-b7934457b264`）、staple、App/DMG Gatekeeper、updater archive/signature、8 个 Release assets 和 Alpha manifest 均成功。独立下载 DMG SHA-256 为 `09824f8dabb1976b2f5c5105cba4a85d8c0f117167524d0c25f3f516bd5adff8`，与 Release checksum 一致；hdiutil、stapler、spctl 和 codesign 均通过。挂载的正式包使用 `com.duban.reader`、Developer ID team `FBMN9293RM`、hardened runtime 和 build `0.2.104`，并成功读取 Alpha.4 前正式环境单独导入的《全球通史》，原书第 48 页起的原页和文本层正常，无 asset protocol 状态 0。正式/测试同名书 id 与导入时间不同，未发现跨环境串库。P6.12.1 仍保留另一台干净 macOS 的首次安装、空环境、AI 配置、备份和重启恢复人工验收；下一步进入 P6.12.2 Alpha.3 → Alpha.4 App 内更新验收。
- 2026-07-13：为 P6.12.1 首次启动回归准备同机干净 formal 状态：在确认正式 App 未运行后，将 `~/Library/Application Support/com.duban.reader`、正式/旧通用 WebKit 状态、缓存和正式偏好文件移动到 `~/Library/Application Support/duban-reset-snapshots/20260713-135513/`，没有直接删除。移动前正式库为 1 本书、约 103 MB；完整快照约 281 MB。`com.duban.reader.test` 未移动，测试书库仍可读取；正式 Keychain 密钥也保留，避免不可恢复地删除用户凭据。正式数据目录当前不存在，下一次 Alpha.4 启动将创建新库并进入首次设置路径。
- 2026-07-13：从完全退出状态再次启动只读 DMG 中的 Alpha.4 build `0.2.104`，首次欢迎页显示“你好，欢迎使用读伴”，书架显示 0 本书和“上传第一本书”，确认 formal 空环境与 test 书库隔离。当前 App 已停留在欢迎页交给人工继续操作；AI 连接、PDF 导入、备份导出和完全退出后的恢复仍待验收。
- 2026-07-13：首次安装回归发现混合 MOBI/KF8 兼容问题：用户本地 7.1 MB、Mobipocket v6/UTF-8 样本在 Alpha.4 中只显示 1 文本页和 1 章节。第三方解析器的旧 MOBI 入口没有抛错，却只返回 385 字符的残缺 HTML 壳；同一文件的 KF8 入口可读出 28 个 spine、22 个目录项和约 23.4 万字。`mobi.js` 已改为同时评估成功候选，按 spine、TOC 和抽样正文完整度选择解析器，并在已加载章节明显短于原始章节时回退原始文本。真实 `读伴 Test.app` 初次重新导入恢复为 130 文本页、28 个 spine 章节，SQLite 保存 130 页、237185 个正文字符。继续复核发现版权信息和含子章节的卷标题用途不准、无标题正文被生成为“章节 N”；现已把用途判断提取为 PDF/MOBI 共用规则，版权/目录默认忽略，TOC 中有 children 的卷标题忽略，无标题 spine 合并到上一真实章节。直接重解析结果为 130 页、23 个有效章节，第二/三/六/七卷正文范围连续且不再出现泛化章节名。该修复尚未进入已发布 Alpha.4，下一正式候选需包含并重新执行 MOBI smoke test。
- 2026-07-13：MOBI/纯文本翻页模式改为运行时自适应分屏。此前每个约 2200 字的持久化文本页在翻页模式只渲染一次，外层又使用 `overflow: hidden`，较小窗口会直接裁掉尾部正文。现由 `TextBookReader` 按真实阅读区宽高和字体测量结果切成屏幕页，导航先走屏幕页、再跨逻辑文本页；方向键、页边点击和横向手势共用同一边界策略。持久化 `pageNumber`、章节范围、阅读进度、笔记和 AI 上下文不变。真实 Test.app 用《显微镜下的大明》第 6 文本页验证为 6 屏，约 960px 窗口无串栏或半行截断，可从 `6/6` 进入下一逻辑页，并可由下一页首屏反向返回 `6/6`。该修复与混合 MOBI/KF8 导入修复均尚未进入 Alpha.4，下一正式候选需执行 `LIB-006 + RD-002A`。
- 2026-07-13：MOBI/纯文本笔记高亮链路补齐。`ReadingStage` 现在把待保存和历史笔记统一传给 `TextBookReader`，文本阅读器按逻辑页码与规范化原文定位高亮；自适应分屏片段保留段落编号和字符偏移，因此窗口重排、屏幕页正反切换及滚动/翻页切换不会让高亮漂移。旧笔记不需要 schema 迁移，“取消高亮”和“重新划原文”继续消费现有字段。真实 Test.app 已验证历史“徽州府”笔记恢复、`1/5 → 2/5 → 1/5` 后保持、新建笔记即时高亮及取消草稿不落库；相同短句在同一逻辑页重复出现时仍采用首个文本匹配。
- 2026-07-13：修复 MOBI 翻页模式页边热区干扰精确划词。原左右透明按钮覆盖正文两侧，拖选靠近右缘的短词时会截获鼠标终点并让 WebKit 扩选到后续段落。现页边箭头只作视觉提示且 `pointer-events: none`，阅读区仅在鼠标单击没有产生文字选择时按落点翻屏；触摸滑动、触控板横滑和其他翻页入口不变。真实 Test.app 已精确选中“歙县”两字，并验证右缘 `1/6 → 2/6`、左缘 `2/6 → 1/6`。
- 2026-07-13：P6.12 总收尾完成并冻结 P6 工程阶段。用户决定自行验收 Alpha.3 → Alpha.4 App 内更新，因此 P6.12.2 改为非阻塞发布运营检查；updater 私钥加密离线备份同样保留为扩大外测前的用户操作。既有 fixtures 与 Rust schema/备份 roundtrip/篡改拒绝/失败回滚/merge 测试认定为升级恢复和自动化基线，更多历史整库样本与 GUI 自动化进入持续 QA。CI 新增独立 RustSec `cargo audit` job；首次扫描发现 3 条 high advisory，已将 `quinn-proto` 升至 0.11.15，并对 Tauri/plist 版本约束下不接触用户 XML 的两条 `quick-xml` advisory 建立带移除条件的精确例外，最终无未忽略漏洞。release preflight 新增 `.env`、证书/私钥、测试书和私钥正文产物扫描，README 补齐 Public Alpha 安装、配置、备份、隐私、安全、限制和反馈入口。开发主线进入 P7；已发布 Alpha.4 仍不包含本地最新 MOBI/阅读器修复，下一候选必须带入并回归。
- 2026-07-14：P7 完成第二版完整重规划。实施顺序从“先建内容地图和埋点”调整为“先验证连续陪读体验，再固化数据和主动能力”：P7.1-P7.4 先用现有导读、读中问答、读后交流、本书聊天和笔记建立统一陪读脉络、持续挂载的 `CompanionShell`、共享元素动效，以及硬规则/软记忆/单次覆盖设置模型；P7.5-P7.9 再完成统一事件与来源 schema、内容地图、`readFrontier`、材料预生成、阅读事件、介入调度和 AI 上下文硬约束；P7.10-P7.12 收口章节沉淀、视觉状态、诊断、QA 和候选包。防剧透必须过滤未读上下文，回答深度必须限制输出 token/结构，不能只改 prompt；原 `companionFocus` 作为兼容数据保留，后续惰性映射。详细设计见 [COMPANION_ACTIVE_READING_PLAN.md](./COMPANION_ACTIVE_READING_PLAN.md)。本轮仅修改规划文档，没有更改代码、schema、prompt 或用户数据；下一步是 P7.1。
- 2026-07-14：P7.1 陪读脉络契约与前端适配层完成。新增纯函数 `companionJourney.js` 和只读 `companionJourneyStore.js`，把现有按阅读项分散保存的导读、章节问答、划词提问、读伴回答、笔记、读后交流和 `__book_companion__` 本书聊天统一为按时间排序的 `CompanionJourneyItem`。适配层提供稳定 id、scene/type/status、阅读项关系、来源锚点、存储 payload 定位和轻量展示 payload；不复制导读 raw、不创建新存储 key、不修改 schema。找不到阅读项的旧数据和无分组旧数组会保留为 `orphaned`，同 source id 的残缺副本按来源去重，旧纯文本 guide 也不会丢失。新增 `npm run test:companion-journey`，11 条夹具覆盖排序、稳定 id、去重、筛选、划词来源、旧数据和失效关联；正式构建、安全扫描、Node 语法和 store 独立导入检查通过。P7.1 没有 UI 改动，下一步进入 P7.2 持续挂载的读伴壳层。
- 2026-07-14：P7.2 持续挂载的读伴壳层完成。新增 `CompanionShell.jsx` 和 `companionShellState.js`，以 `bookId:itemKey` 作为会话边界，把导读、正文、读后和完成页放在同一个持续 provider 下；只有切换阅读项才重置。共享状态覆盖侧栏面板、聊天草稿、划词引用、读后草稿、侧栏开合与聊天/读后时间线滚动，AI 消息、请求取消和笔记仍由原 `Reader` 父层与原存储路径管理。新增 presence/context/timeline/composer 四个共享语义组件，并让 Reader 当前 live state 消费 P7.1 journey。真实浏览器用《万历十五年》验证正文/导读与正文/读后往返后两类草稿均恢复，shell session key 未变，控制台无 warning/error；1280x720 与 390x844 无横向溢出。新增 shell reducer 测试、`npm run test:p7` 和 CI 步骤；构建、安全扫描与 diff 检查通过。P7.2 未实现最终时间线重排或共享元素动画，下一步进入 P7.3。
- 2026-07-14：P7.3 统一陪读时间线与场景间共享元素动效完成。新增 `companionTimeline.js`、`CompanionJourneyTimeline.jsx` 和 `companionTransition.js`，将导读线索、读中问答/划词、读伴回答、笔记、读后交流和本书聊天映射为统一可引用卡片，并以 View Transition API 或降级淡入交接同一读伴标记、最新记录和介入卡。导读收束 2-3 条本节线索；读后继续原时间线并生成轻量本节记录；随书闲聊可展开陪读脉络、引用任一卡片，阅读器在往返期间保持挂载，因此页码、侧栏、滚动和草稿不会丢失。正文页边加入明确标注且不落库的「交互原型」，只验证主动提问的出现、展开、引用和关闭。`npm run test:p7` 与前端构建通过，Test.app release bundle 构建通过；浏览器真实书籍会话验证跨场景恢复、六类卡片共同显示、引用和读后无横向溢出。一次桌面自动化启动恢复了旧 WebView 页面，因此真实 Test.app 动效与新增窄屏样式留到下一次桌面回归复核。下一步进入 P7.4 行为策略与记忆设置收敛。
- 2026-07-14：P7.3 首轮试用反馈收敛完成。导读成功态保留 overview 导读正文和重新生成入口，只删除与「带进正文的线索」重复的「带走什么 / 留意什么」目标与问题卡片；正文侧栏删除「提示 / 阅读项」，保留「问读伴 / 笔记」。原「翻开这一章」会让共享过渡和 1.46 秒纸面翻页并行，读伴被翻页层遮住；现改为读取导读头像与正文侧栏头像的真实位置，让同一读伴在翻页中移动并缩小，末帧由真实侧栏节点接管，紧接上一段场景动画时会先中断旧过渡。浏览器用《万历十五年》验证导读正文与 3 条线索并存、目标/问题卡片已移除、侧栏只有 2 个页签，动画中飞行节点存在且目标透明，结束后飞行节点移除、目标恢复，页面无横向溢出。P7 自动化测试、正式构建、安全扫描和 diff 检查通过；下一步仍为 P7.4。
- 2026-07-14：P7.3 第二轮试用反馈撤下独立「随书聊」入口。书架操作菜单、整理页、导读、正文工具栏、读后和完成页不再提供「随书聊 / 和读伴聊聊」，App 也不再导入或渲染独立 `BookCompanionChat` 页面，不再维护阅读器与聊天页往返状态。正文侧栏「问读伴」、划词提问、导读、读后交流和统一陪读时间线保持不变，让对话继续发生在书籍现场。旧 `__book_companion__` 消息、聊天来源笔记和备份/schema 兼容路径均未删除，仍可由 journey 和整理页读取；本轮没有数据迁移或用户数据清理。新增 `test:companion-entrypoints` 锁定无独立入口、书内提问保留和历史数据兼容契约；P7 测试、正式构建、diff 检查与当前代码的 Test.app bundle 均通过，真实桌面验证书架菜单、整理页、正文工具栏和「问读伴 / 笔记」状态符合预期。P7 当前产品结构正式收敛为导读、读中、读后三个书内阶段，下一步仍为 P7.4。
- 2026-07-14：修复书架书卡因书名行数不同而高度不齐，并把验证范围扩展到大书库和窗口变化。根因是标题只设置两行截断，没有固定两行排版高度，一行标题会比两行标题少一个行盒；同时网格没有声明隐式行和书卡的纵向拉伸契约。现为桌面标题区固定 `3.375rem`，手机双列字号固定对应的 `2.76rem`，网格使用等高隐式行，书卡与纸张填满行高；封面比例、作者、状态、进度和印章布局不变。test channel 新增不写数据库的 20 本混合书卡夹具，实测容器 1080/820/620px 时分别为 4/3/2 列、5/7/10 行，所有卡片和纸张高度一致且无横向溢出；真实 Test.app 拖到配置允许的 960px 最小宽度后保持两列等高。P7 测试、正式构建、release preflight 和最新 Test.app bundle 均通过，formal 包不会启用测试夹具。
- 2026-07-14：修复书卡「未启卷」和「今日已读」同时出现的状态矛盾。完成百分比仍只统计 `completedItemKeys`，但展示层新增当前阅读位置判断：0% 且已有位置显示「阅读中」，部分完成后继续显示「已读 N% · 阅读中」。`readingDays / lastReadAt` 只解释为阅读活动，显示「今日在读」；只有 `completedAtByItemKey` 中存在当天完成时间时才显示「今日完成」，整本完成仍优先显示「全书读完」。没有 schema 迁移或历史进度重写。新增纯函数 `bookTicketStatus.js` 与状态单测，真实 Test.app 两本已有阅读位置但未完成的书均验证为「阅读中 / 今日在读」；P7 测试、正式构建和 Test.app bundle 通过。
- 2026-07-14：网页版导航和书架取消 `1480px` 最大框架宽度，解决 2K/4K 浏览器中内容被夹在中央、两侧空白过大的问题。App 根节点按 `APP_RUNTIME` 标记 browser/desktop；只有 browser 下的 `app-wide-frame` 使用完整视口，保留原 24–64px 响应式边距，Tauri 桌面版仍保留原宽度上限。书卡列宽继续限制为 `210–236px`，不会随宽屏膨胀，书多时由 `auto-fill` 增加列数。浏览器实测框架占满可用 1280px 视口、20 本书为 4 列 5 行、无横向溢出；同时修复 20 本夹具在缺少 `fixture-width` 时被 `Number(null)` 误钳制为 420px 的测试问题。P7 测试、正式构建与 release preflight 通过。
- 2026-07-14：阅读工具栏和相关场景完成图标语义收敛。新增 `tea / complete / companion` 三个 `ChineseIcon`：中途离开使用茶杯，已完成后的回到书架仍用书本，我读完了使用圆形勾选，读伴主动介入使用对话气泡；会客厅、本书状态、旧聊天兼容区和设定读伴步骤也分别改用茶杯、脉搏、对话和笔墨。`seal` 现在只用于书卡藏书登记，未知图标名不再静默回退成印章。新增 `test:icon-semantics` 并纳入 P7 测试；浏览器真实阅读页截图确认 16px 图标清晰、对齐正常，正式构建与 release preflight 通过。
- 2026-07-15：补做阅读图标的桌面 bundle 同步与回归。检查发现此前打开的 `读伴 Test.app` 生成于 2026-07-14 17:51，而 `ChineseIcon.jsx / Reader.jsx` 的图标改动完成于 18:06，因此桌面端仍显示旧图标；代码本身没有 browser/Tauri 分叉。已完全退出旧 App，重新执行 `npm run tauri:build:test` 并打开新 bundle。真实桌面阅读页确认「中途离开」为茶杯、「我读完了」为圆形勾选、「读伴有一问」为对话气泡。后续任何需要桌面人工验收的前端修改，都必须在最后一次源码变更后重新构建 Test.app，不能用先前 bundle 或仅凭 Vite 页面宣称桌面已更新。

### 2026-07-16：P7.4 行为策略与记忆设置收敛完成

- 新增版本化 `companionPolicy`：剧透边界、回答深度、追问方式、主动程度、知识边界均有稳定默认值和非法值降级。
- 新增显式 `companionMemory`，用户可在阅读侧栏的「本书读伴」弹层中新增、修正、删除；旧开书设置惰性显示为“旧设置”，首次保存新模型后不删除旧字段。
- 新增当前问题 `sessionOverride`：简短、深入、不追问、可谈后文、只依据书中内容；发送后自动恢复默认。
- AI 三条路径均接入策略与记忆。回答深度直接控制 `maxTokens`；默认防剧透下，读中问答不带入完整阅读项正文；安静模式隐藏主动介入交互原型。
- 新增 `test:companion-policy` 并纳入 `test:p7`；P7 自动化、formal build、1280x720 和 390x844 浏览器回归通过。
- 最后一次源码变更后已重新执行 `npm run tauri:build:test`。首次打开时 macOS 复用了仍在后台运行的旧 Test 进程，完全退出后重新打开最新 bundle，真实桌面阅读页已确认「本书读伴设置」「仅本次」及五类策略/记忆弹层均为最新实现，布局和操作正常。后续桌面回归继续遵守“先退出旧进程，再打开最终构建”的规则。
- P7.4 没有新增 SQLite 表；新字段暂存 `books.raw_json.readingProfile`。精确 `readFrontier`、真实介入调度和统一事件持久化进入 P7.5-P7.9。
- 下一步是 **P7.5 统一事件、来源与存储迁移**。

### 2026-07-16：P7.5 统一事件、来源与存储迁移完成

- 新增 `companionEvents.js` 与 `companionEventStore.js`，以 schema v1 统一导读、问答、回答、笔记、读后、策略变更、单次覆盖、介入状态和本节记录引用；历史 payload 使用确定性事件 id，重复同步不会生成副本。
- `sourceAnchor` 支持 PDF 原书页、文本页、字符范围、选区矩形和内容指纹。事件只保存原数据引用和定位，不保存 `sourceAnchor.text`，不会复制大段正文、问答或私人笔记。
- 现有导读、聊天、读后和笔记表继续是内容 source of truth；读取陪读 journey 时惰性补齐事件，删除笔记写 tombstone。策略/记忆仍以 `books.raw_json.readingProfile` 为可编辑真相源，事件只保存快照引用。
- 桌面 SQLite schema 从 `9` 升到 `10`，新增 `companion_events` 表和查询索引。同步函数在事务内整组校验，失败回滚；删除书籍继续通过外键级联清理。
- 浏览器和桌面目录式备份 v3 均支持陪读事件计数、校验和按事件合并；本地事件较新时不被旧备份覆盖，同时间 tombstone 优先。
- 新增 P7.5 合成备份 fixture、事件契约测试和 Rust roundtrip/merge/rollback 测试。下一步是 **P7.6 内容地图、阅读边界与可靠锚点**。
- 自动化验证全部通过：P7 测试、formal build、fixtures、Rust fmt/check/27 tests、安全扫描、release self-test、版本校验和 diff 检查。浏览器真实会话保存策略正常；最终 Test.app 诊断为 schema `10 / 10`、SQLite `ok`、缺失文件 0。进入《显微镜下的大明》后导出备份，预览为 16 条陪读事件且校验通过。测试库已有 5 个孤儿文件提示未在本阶段处理。

### 2026-07-16：陪读时间线折叠交互与类型样式修正

- 时间线根据内容长度决定是否折叠；最新用户问题、划词问题及其后第一条读伴回答默认展开，新的问答出现时，上一轮长问答自动收起。
- 历史长内容可通过「展开 / 收起」或点击卡片正文切换；卡片内引用、记笔记等交互不会触发折叠。
- 导读、问题、回答、笔记、读后回想/本节记录和书籍记录使用不同的克制色彩与左侧标记，底层事件类型、存储和备份契约不变。
- 新增默认展开集合和折叠阈值的纯函数测试；该修正不新增 schema、prompt 或用户数据迁移。
- `npm run test:p7`、formal build、安全扫描和 diff 检查通过；最终 Test.app 真实长时间线验证旧回答/笔记收起、最新回答展开，历史回答可往返展开与收起。
- 后续 UI 修正将卡片布局归一为 `user / assistant / record` 三类：用户问题右对齐，读伴回答和主动提问左对齐，导读、笔记、回想与本节记录居中；该布局字段仅用于展示，不进入事件或备份数据。

### 2026-07-16：严格防剧透泄露修复

- 根因不是设置未保存，而是问答请求仍携带 whole-book 契约字段和历史 assistant 消息，且系统提示允许向前后文发散；即使不传完整章节，模型也可能凭参数知识说出后续。
- `avoid / hint` 现在只带入当前可见页、用户材料和显式记忆；`allow` 才带入整本书、章节导读、历史回答等未读风险上下文。
- 严格模式改为缓冲完整回答、执行确定性泄露提示检查后再展示与保存；已保存的历史回答不重写，但不会再次进入严格请求。
- P7.6 精确阅读边界完成前继续保守处理；届时按已读正文块恢复上下文，而不是重新开放整个阅读项。
- P7 自动化、formal build、安全扫描、diff 和 Test.app 构建通过。自动测试没有触发真实 AI 调用，避免把用户书页作为测试数据再次发送给第三方服务。

### 2026-07-17：陪读消息富文本与新消息动效

- 陪读时间线使用 `react-markdown` 受控解析模型与用户消息，允许常用阅读型 Markdown 元素，跳过原始 HTML；存储中的消息正文和陪读事件 schema 保持纯文本 Markdown，不做迁移。
- 多节点 Markdown 使用统一内容容器参与 4/5 行折叠，避免列表和多段回答绕过历史内容收起规则。
- 时间线仅追踪当前上下文中新增加的 card id 并播放方向化入场；切换书籍/阅读项或首次打开历史记录不会整页重播，系统减少动态效果时关闭动画。
- 新增 Markdown 安全渲染测试并纳入 P7 回归；本次不修改 SQLite schema、备份格式、AI prompt 或防剧透请求边界。
- P7 全量测试、formal build、安全扫描和 Test.app 构建通过；真实历史回答验证 Markdown 标记已被解析，最新版桌面测试包已重新打开。

### 2026-07-17：P7.6 让读伴准确知道你读到哪里

- 新增 `contentMap.js`，从现有书页和阅读计划按需生成稳定正文块，保存页码、阅读项、字符范围、内容指纹和文本质量；旧书无需重新导入，也不会在建图时调用 AI。
- 桌面真实书籍回归发现导读项与正文项存在页码重叠；正文块现支持多个阅读项归属和各自顺序，正文不复制，正文项作为主归属，旧计划无需修改。
- 新增 `readingFrontier.js`，在既有进度 JSON 中区分到过、有效阅读和本节完成。直接跳页不会补齐中间内容；可见停留约 1.8 秒、划词、提问、记笔记和完成阅读会更新确认已读范围。
- 严格防剧透问答恢复“当前页 + 系统确认已读正文”，同时继续排除未读页、低质量文本、整节正文和高风险历史上下文。
- 选区、笔记、聊天引用和陪读事件可保存来源定位 v2 的正文块 id、块内字符范围、内容指纹和定位状态；旧 v1 页码定位继续兼容。正文轻微变化时可尝试回找，失败时明确返回失效。
- 没有新增 SQLite 表或备份版本：`readStateByItemKey` 保存在 `reading_progress.raw_json`，事件和内容原表继续保存可选来源字段，schema 保持 `10`、目录备份保持 v3。
- 新增 `test:content-map`、`test:reading-frontier` 并纳入 `test:p7`；事件测试增加 v1/v2 来源兼容断言。P7、构建、固定 fixtures、安全扫描和 diff 检查通过，完整 Rust 与桌面回归见同日日志。
- 最终桌面回归确认《显微镜下的大明》本节第 3 页写入到达/有效阅读范围 `[[12,17]]` 与内容指纹；SQLite schema 仍为 `10`，`quick_check = ok`。
- 首次 `tauri:build:test` 只更新了前端 dist，却复用了下午的旧 release binary。清理一次 Cargo 产物并在最终前端修改后触发 Rust 源文件时间戳，bundle 可执行文件更新到 20:36。以后桌面回归需同时核对旧进程和最终 bundle 可执行文件时间，不只看 Tauri 命令成功输出。
- 当前不处理 PDF OCR、图片和复杂表格。主动提问已于 2026-07-17 从产品范围撤下，下一步是 **P7.7 按需上下文编排与缓存**。

### 2026-07-17：键盘左右键翻页

- PDF 与 MOBI/文本的翻页模式支持 `ArrowLeft` / `ArrowRight`，继续复用现有上一页/下一页、文本分屏、阅读进度和翻页动画逻辑。
- 输入框、文本域、下拉框、可编辑内容、设置弹窗、中文组合输入和带 Command/Control/Option 的组合键不会触发翻页；滚动模式不抢占左右键。
- 新增 `readerKeyboard.js` 与 `test:reader-keyboard`，并纳入 `test:p7`。
- 最终 `读伴 Test.app` 实测：右键将文本分屏从 `1/5` 翻到 `2/5`，左键返回 `1/5`；输入框聚焦后右键不改变页码。P7 全量测试、正式构建、安全扫描和 diff 检查通过。

### 2026-07-17：主动提问功能撤下

- 用户实际使用后确认主动提问本身会打断阅读，P7 产品原则调整为“用户先发起，读伴按需回应”。
- 删除阅读页主动提问 marker、模拟问题卡、shell 原型状态、主动程度 UI 和新介入事件写入；导读、用户提问、划词、笔记与读后回想不受影响。
- `companionPolicy.proactivity` 为兼容旧书继续保留，但任何旧值都固定规范化为 `quiet`；AI 硬指令明确禁止主动发起阅读问题、提醒或新任务。
- `intervention` / `intervention_state` 类型、SQLite schema 10 和备份 v3 保持可读，避免旧备份或历史记录失效。
- 当时先将 P7.7 改为按需上下文材料与缓存，并取消原 P7.8 主动调度器；2026-07-18 已进一步合并和重排活跃编号，下一步不再建设候选问题或触发调度器。
- P7 全量测试、formal build、安全扫描、diff 检查与 Test.app 重建通过；最终 bundle 可执行文件 SHA-256 为 `f85013f5e193339103dbfbfc62a537df83d3c01018799fdd3f9082700fc4eb24`。

### 2026-07-18：P7 活跃路线重新编号

- 取消主动提问后重排 P7 后半程：新 P7.7 合并按需材料、上下文硬约束和缓存；新 P7.8 为成果沉淀与用户可控记忆；新 P7.9 为不含介入状态的视觉身份与静默状态；新 P7.10 为诊断、QA 与 Public Alpha。
- 原 P7.8 主动调度器不再占用活跃编号。历史日志中的原 P7.9-P7.12 保留当时语义，专项计划提供旧编号到新编号映射。
- P7-B 现为 P7.5-P7.7，P7-C 现为 P7.8-P7.10。P7 完成后继续按既定顺序进入 P8 手机版，再进入 P9 云后端。
- AI 接手规则新增硬边界：阅读事件只服务进度、防剧透和恢复上下文，不得触发模型；旧主动字段和事件只作兼容读取。
- 本轮仅更新路线图、专项计划、文档索引和接手提示词，没有产品代码或数据迁移。下一步是 **P7.7 按需上下文编排与缓存**。

### 2026-07-18：P7.7 按需上下文编排与缓存

- `src/lib/companionContext.js` 成为书内三条 AI 路径的唯一选材入口，统一处理场景、选区、当前页、确认已读范围、来源质量、用户记忆、历史材料和预算。
- 读中严格/方向模式只带入用户选区、当前页、确认已读正文和筛选后的用户记忆；未读正文、章节导读、旧模型回答和整书高风险字段在代码层排除。
- 读后回想只有当前阅读项确认完成时才带入本项全文；未完成时退回当前页与确认已读材料。导读可读取目标阅读项，但整书关键转折和后续阅读路径继续受剧透策略限制。
- 三档回答深度同时改变上下文字符预算、prompt 结构指令和输出 token；新增 AI `hardMaxTokens`，task profile 只能降档，不能突破用户的读伴策略。
- 每条新导读、读中回答和读后回答保存不含正文的 `contextTrace`，包含来源引用、内容/策略/prompt/模型指纹、排除原因、预算和缓存状态，为 P7.10 诊断解释预留数据。
- 会话内上下文使用 48 项 LRU。章节导读完整制品沿用既有存储，按正文、阅读计划连续性、策略、模型和 prompt 版本匹配；“重新生成导读”显式绕过缓存。
- 选区文本现在实际进入问答 prompt，并作为最高优先级来源；此前只存引用、不明确进入请求的问题已修复。
- `npm run test:p7`、formal/test build、安全扫描、Rust fmt/check/27 项测试和 diff 检查通过；最终缓存失效补丁的专项测试和 test build 也通过。`读伴 Test.app` 已重建，bundle id 为 `com.duban.reader.test`，可执行文件 SHA-256 为 `442657311af87538306b1cf296a0d0d606460fe9199ce4803bf0c59cd8effa6e`。
- 没有新增 SQLite 表、IndexedDB key、备份字段或迁移；schema 保持 10，目录备份保持 v3。下一步为 **P7.8 成果沉淀与用户可控记忆**。

### 2026-07-19：桌面测试包 Keychain 身份稳定化

- P7.7 实机验证时，测试数据库仍正确标记 DeepSeek Key 已保存，系统 Keychain 中对应条目也存在，但新构建的 `读伴 Test.app` 返回 `AI_KEYCHAIN_READ_FAILED`。根因是旧测试包使用临时 ad-hoc 签名，重建后的代码身份变化，macOS 不再授权它读取旧条目；正式版的 Developer ID 签名和独立 Keychain service 不受影响。
- `npm run tauri:build:test` 现在通过专用脚本构建：macOS 本机若安装 Developer ID Application 证书，会自动把该身份传给 Tauri；没有证书的机器仍可回退到默认本地签名，但会明确提示重建后可能需要重新保存测试 Key。
- 用户可见错误保留稳定代码 `AI_KEYCHAIN_READ_FAILED`，文案改为引导进入设置重新填写并保存当前模型 Key；不自动删除 Keychain 条目，也不把 Key 写入日志或数据库。
- 本机已有 `Developer ID Application: Zhanwen Lu (FBMN9293RM)`；构建脚本已正确识别该身份，但首次签名因登录 Keychain 未解锁而在 `codesign` 返回 `errSecInternalComponent`，未把失败包当成可验收产物。用户需在自己的终端解锁登录 Keychain 后重试。旧 ad-hoc 条目可能还需要在新签名包中重新保存一次，此后同一 Developer ID 与测试 bundle id 的构建应保持稳定访问。
- 2026-07-19 19:44 为先恢复桌面验收环境，显式使用 `APPLE_SIGNING_IDENTITY=-` 完成临时签名构建；`codesign --verify --deep --strict` 通过，bundle id 为 `com.duban.reader.test`，可执行文件 SHA-256 为 `246a47f924cdfe1e79c77b17a6052db6c5b64b2db1e502687b2029152556a5d9`。旧测试进程已完全退出，新进程从最终 bundle 启动，诊断日志确认 schema 10 初始化成功。该回退只用于界面与 P7.7 验收，不视为 Keychain 稳定签名修复完成。
- 同轮实机确认设置页的“测试连接成功”只验证当前输入，并不代表 Keychain 保存成功；旧保存入口没有捕获异步写入失败，用户会看到连接成功但没有可靠的保存结果。现新增保存中、成功和失败状态：保存期间禁用测试/保存按钮；只有存储写入完成才清空新 Key 输入并声明生效；失败时保留输入、清除旧连接提示并持续展示具体错误。后端原有顺序保持不变，Keychain 写入失败时不会把新配置写入 SQLite。
- P7 全量测试、test build、安全扫描和 diff 检查通过；临时签名 Test.app 重建后 `codesign --verify --deep --strict` 通过，可执行文件 SHA-256 为 `f22a5c5b3461675f74a32153cab7443172171571468a3a1f8dc669ca751a2328`。旧进程已退出，19:56 启动的新进程从最终 bundle 运行，schema 10 初始化正常。真实 API Key 保存结果由用户在新 UI 中点击一次后确认，自动化不读取或代填用户 Key。

### 2026-07-20：清理无法覆盖的测试 Keychain 旧条目

- 用户在最新版 Test.app 中确认保存反馈正常显示，但实际结果为“保存失败：写入系统 Keychain 失败”。测试连接仍成功，因为它直接使用输入框中的临时 Key，不代表持久化成功。
- 系统 Keychain 中 `com.duban.reader.test.keychain.ai / openaiCompatible.apiKey` 条目创建于 2026-07-13，访问控制仍绑定旧临时签名测试包；当前 ad-hoc 包可以定位条目，但无法读取或覆盖。
- 经用户授权，只删除上述测试环境旧条目并复核其已不存在；正式版 `com.duban.reader.keychain.ai / openaiCompatible.apiKey` 条目仍然存在，没有读取、修改或删除其内容。用户当前输入框中的 Key 未被自动化读取，可直接再次点击保存，让当前测试包创建新条目。
- 这是当前测试环境的即时恢复，不是长期关闭：下次 ad-hoc 重建仍可能再次改变代码身份。长期方案仍是解锁 Developer ID 私钥访问并让 `npm run tauri:build:test` 使用稳定签名；正式签名发布包不受本次测试条目清理影响。
- 删除旧测试条目后，当前 Test.app 创建新条目仍返回“写入系统 Keychain 失败”。随后使用不含真实密钥的临时 generic-password 探针直接调用系统 `security add-generic-password`，同样在创建阶段返回 `SecKeychainItemCreateFromContent: The user name or passphrase you entered is not correct`，因此根因进一步收敛为 macOS 登录钥匙串锁定或钥匙串密码与当前登录密码不同步，而不是读伴前端、SQLite 状态或单一旧条目 ACL。
- 已打开“钥匙串访问”供用户本人解锁 `login`；自动化不会接收、记录或代填系统密码。解锁前不再重复保存真实 API Key，也不会重置默认钥匙串，以免影响 Developer ID 私钥、正式版密钥和其他系统凭据。

### 2026-07-20：本书读伴设置改为通俗表达

- 用户指出“只给方向，不说答案”等选项虽然描述了抽象策略，却没有直接说明读伴实际会怎么回答；“防剧透、回答长度、知识范围”等字段也偏产品或模型术语。
- 设置弹层标题改为“读伴怎么回答你”，四类设置分别改成“能不能聊到后文、回答要讲多细、回答后还要问你吗、回答时可以参考什么”。每个选项继续保留简短名称，并在下方实时显示一句具体效果。
- 剧透选项改为“只聊我已经读到的内容 / 提醒我留意线索，但不说后文 / 可以直接聊后文和结局”；其余选项同样改为行为结果表达。“读伴记住的事”改为“希望读伴记住的事”，明确只对本书生效并补充示例。
- 输入区“仅本次”改为“这次回答”，单次选项同步改成“这次简短一点、这次多解释一些、这次回答完就停”等口语表达。
- 本轮只修改展示文案和辅助说明；`spoiler / answerDepth / followUp / knowledgeBoundary` 的值、默认策略、保存结构、上下文隔离、防剧透检查和旧书兼容均不变，不需要数据迁移。
- `test:companion-policy`、test build、安全扫描和 diff 检查通过；专项测试新增每组选项必须提供白话说明的约束。临时签名 Test.app 重建并完全重启，`codesign --verify --deep --strict` 通过，可执行文件 SHA-256 为 `a66843e16b739eb95ad62f7daa8384d1788eaf674d3c30b2f33d1a945baff2bd`。
- 真实桌面《显微镜下的大明》阅读页打开新弹层回归：四组标题、当前选项和说明完整显示，两列布局无重叠或截断；输入区已显示“这次回答 / 按本书设置”。弹层保留打开状态供用户直接检查。
- 根据用户复核，将“回答后还要问你吗”进一步收束为“回答后是否需要追问”；仅修改字段标题，三个选项、`followUp` 保存值和模型行为保持不变。
- 用户进一步指出上一轮已从抽象术语滑向过度口语化，且“有帮助时再问一句”仍没有可执行标准。设置文案再次收敛为正式、通俗的中性表达：标题改为“本书读伴设置”，字段改为“未读内容处理、回答详细程度、回答后是否需要追问、回答参考范围”，选项改为“仅使用已读内容、提示关注方向，不透露后文、信息不足时追问”等。
- `followUp=helpful` 的行为规则同步明确：不为延续对话而追问；只有问题含义不明确或缺少必要信息时才提出一个澄清问题，信息足够则直接结束回答。该项不再生成泛泛的阅读反问，界面说明与模型指令保持一致。
- 开发文档统一使用“通俗表达”描述本轮目标：信息应直接说明实际效果，同时保持产品界面的中性和准确，不使用聊天式、情绪化或过度口语化措辞。
- `test:companion-policy` 新增“信息不足时追问”行为断言，`test:p7`、test build、安全扫描和 diff 检查通过。临时签名 Test.app 已重建并完全重启，`codesign --verify --deep --strict` 通过，可执行文件 SHA-256 为 `5a158c313c09c1c6c0e08b40410f04599a9bbc590f0515ed1b3ce68e5456d67a`。
- 真实桌面《显微镜下的大明》阅读页回归确认：弹层显示“未读内容处理、回答详细程度、回答后是否需要追问、回答参考范围”，当前选项与具体说明完整显示，两列布局无重叠或截断；弹层保留打开状态供人工复核。

### 2026-07-20：P7.8 调整为读伴整体界面与视觉重构

- 用户确认原 P7.8 的成果记录与可控记忆方向没有问题，但当前问题不只在早期暖黄纸片角色：导读、侧栏、对话时间线、记录、输入区、设置和场景衔接也与最新 UI 不够协调，整体界面重构应优先于跨章节记忆。
- 新增 P7.8“读伴整体界面与视觉重构”：先盘点所有出现位置与交互关系，制作三个同时覆盖导读、读中、记录/读后和完整/标准/印记形象的可比较方向，再统一重构相关组件、界面和资产。
- 原成果沉淀顺延为 P7.9；原视觉状态拆除基础形象职责后顺延为 P7.10，只处理真实状态和静默动效；诊断、QA 与 Public Alpha 顺延为 P7.11。
- P7.8 不修改 AI、记忆、存储、schema 或备份，也不建设任意外观编辑器。当前仅更新路线图、专项计划和接手说明，没有修改产品代码或用户数据。
- P7.8 的目标从“换一个更合适的读伴形象”扩大为“让读伴自然存在于阅读流程中”：减少重复头像、重复标题、嵌套卡片和独立工具面板感，并统一展开、收起和跨场景承接。
- 下一步为 **P7.8.1 界面审计与体验约束**。

### 2026-07-20：P7.8.1 读伴整体界面审计完成

- 新增 [COMPANION_UI_AUDIT.md](./COMPANION_UI_AUDIT.md)，把开书、导读、读中、笔记、设置、读后和完成页放在同一张界面地图中审计，不再把问题简化为“换头像”。
- 真实 Test.app 验证《全球通史》导读页、阅读侧栏和本书设置弹层。当前设置结构清楚可保留；导读和侧栏的主要问题是重复身份信号、卡片套卡片、历史内容像日志，以及输入区与时间线割裂。
- 当前暖黄纸片 PNG、橄榄书签和拟物灯/便签场景与朱砂猫章、淡墨和现代数字书斋存在身份断裂；完整图直接缩放不能承担 24-40px 小规格。
- 确认旧 SVG CSS、新 PNG CSS、重复 `ReadingCompanion* 2.jsx` 和过时开书文档并存。P7.8.3 才清理，避免 P7.8.2 定稿前误删仍在使用的规则。
- 冻结现有功能与数据边界：不改变 AI、策略、上下文、事件、来源、进度、笔记、高亮、schema 10、备份 v3 或历史兼容，也不恢复主动提问。
- 下一步为 **P7.8.2 三个整体方向方案与人工定稿**。三个方向必须用相同内容展示导读、读中、读后/记录、宽窄布局和完整/标准/印记三种规格。

### 2026-07-20：P7.8.2 三个整体方向已产出，等待人工定稿

- 使用同一章、同一导读、同一问答、同一读后记录和同一 1600 × 1000 画布，完成“墨页猫影、朱砂批注、书灯留白”三个可比较整体方向。
- 三案均覆盖章节导读、正文旁问答、居中记录、读后承接和完整/标准/印记三种身份规格；窄窗统一采用覆盖式侧栏，正文不参与压缩。
- “墨页猫影”品牌陪伴感最强；“朱砂批注”最克制、最接近现代校记；“书灯留白”在温度、书卷气和场景连续性之间较均衡。
- 三张预览已归档到 `docs/assets/p7-8-2/`，详细设计取舍写入 [COMPANION_UI_AUDIT.md](./COMPANION_UI_AUDIT.md)。
- 当前没有修改产品代码、现有读伴资产、AI、schema 10、备份 v3 或用户数据。选择器在当前客户端不可用，改为由用户直接查看三张预览并回复方向名称。
- 用户定稿前，P7.8.2 保持“等待选择”，P7.8.3 不启动。

### 2026-07-20：P7.8.2 第一轮反馈收束到朱砂方向

- 用户认为“朱砂批注”的整体界面方向较合适，但现有读伴符号太抽象，无法充分表达长期陪读身份。
- 当前不直接定稿，也不修改产品代码；先保留朱砂批注的排版、页边关系和克制色彩，单独重做更具体的读伴形象。
- 形象生成要求覆盖完整、标准和印记三种规格，使用透明背景，不复制 App Logo，不使用暖黄纸片、儿童贴纸或独立彩色头像底板。
- 外部概念稿返回并完成人工选择后，再决定是否正式定稿为朱砂方向并进入 P7.8.3。

### 2026-07-20：P7.8.2 朱砂读伴形象正式定稿

- 用户从外部生成稿中选定黑墨猫伏在打开书页上的方案。猫耳和书页使用少量朱砂，页边延伸为批注线，具象度足以表达陪伴，又能保持朱砂方案的克制校记气质。
- 正式方向确定为“朱砂批注”的界面层级、页边关系和色彩，加上“猫 + 书页 + 朱砂批注线”的身份形象。
- 概念母稿归档为 `docs/assets/p7-8-2/selected-cinnabar-companion-concept.png`，只作为后续生产资产的视觉输入。
- P7.8.3 需要重新输出透明背景的完整、标准和印记规格，统一线宽、红色比例和末端符号；不得直接裁切白底母稿或简单缩放完整图。
- 本轮只完成设计定稿与文档更新，没有修改产品代码、现有资产、AI、schema 10、备份 v3 或用户数据。下一步正式进入 **P7.8.3 组件、界面与资产重构**。

### 2026-07-20：P7.8.3 朱砂读伴第一版

- 根据定稿概念重新绘制透明背景的完整、标准、印记三份 SVG 生产资产，分别用于导读、读中页眉和轻量标记；没有直接使用白底概念稿。
- `ReadingCompanionAvatar` 增加规格接口，`ReadingCompanionScene` 改为三规格渐进承接；活跃组件退出旧暖黄 PNG，但历史文件暂不删除。
- 导读、侧栏、时间线、输入区和读后表面统一为朱砂批注语言，减少卡片套卡片、重复身份和独立聊天工具感。
- 修复 900px 以下读伴被排到长正文末尾的问题，改为覆盖式固定页边面板；面板使用实色米纸背景，正文不被继续压缩。
- 没有修改 AI prompt、上下文、防剧透、journey、事件、来源、进度、笔记、高亮、SQLite schema 10 或目录备份 v3。
- 浏览器真实《万历十五年》导读、读中、960px 与 760px 回归通过，控制台无 warning/error；P7 全量测试、formal build、安全扫描和 diff 检查通过。
- 临时签名 `读伴 Test.app` 已重建，bundle id 为 `com.duban.reader.test`，签名校验通过，可执行文件 SHA-256 为 `b31d76e113f39e7002605f722a92d8f2f0e6f493a9075adf3b67b60ebef830a9`。
- 下一步先由用户检查真实桌面导读、侧栏、时间线和小尺寸印记；确认方向后清理旧 PNG、重复组件和历史 CSS，再进入 P7.8.4。

### 2026-07-21：P7.8.3 读伴形象按原型重做

- 用户指出第一版猫与定稿原型完全不同。复核确认第一版虽然采用透明 SVG 和三档规格，但丢失了修长侧坐、低头看书、前爪搭页等关键身份特征，人工验收不通过。
- 使用定稿概念母稿作为严格视觉参考，重新制作完整、标准和印记三份透明 PNG；三档分别保留适合自身尺寸的信息，不直接缩放同一整图。
- `ReadingCompanionAvatar` 的活跃资源切换到 `cinnabar-companion-*-v2.png`，CSS 使用 1024:631、640:514、360:181 三组真实比例；被否决的第一版 SVG 不再有运行时引用。
- 浏览器真实《万历十五年》导读和读中侧栏视觉复核通过，图片自然尺寸正确、背景融合正常，控制台无 warning/error。
- 本轮不改变 AI、上下文、防剧透、journey、事件、来源、进度、笔记、高亮、SQLite schema 10、目录备份 v3 或 test/formal 数据隔离。
- `npm run test:p7`、formal build、test build 与 `git diff --check` 通过；`读伴 Test.app` 已重建、签名校验并实际打开，可执行文件 SHA-256 为 `aff523e23fb77a96c13ecaf6be3cccbf9080c451976cd14fb90f7b3ce30d84a5`。
- Release preflight 的版本检查通过，但仓库现有检查仍要求 `tauri:build:test` 在 `package.json` 直接写测试配置路径，当前包装脚本不满足该静态规则；它不是本轮视觉改动引入的问题，未在本次扩大范围修复。
- 当时等待用户确认后再清理第一版 SVG 和重复组件；该清理已在随后 P7.8.4 完成。

### 2026-07-21：P7.8.4 页边印记唤醒与响应式收尾

- 用户确认第二版猫与书页形象通过，并指定简化猫耳书页印记作为读伴收起后的唤醒入口。
- 阅读工具栏在读伴展开时保留「专注阅读」；收起后不显示「打开读伴」文字按钮，只在正文右侧保留透明页边印记。点击印记通过共享过渡恢复原侧栏。
- 收起/唤醒期间保持问答草稿、阅读页、滚动/翻页模式和时间线状态。用户主动划词提问时，收起的侧栏会自动展开并切到问答。
- 页边印记提供至少 44px 点击区域、键盘焦点、`aria-label`、`aria-controls` 与展开状态；减少动态偏好下关闭开合动画。
- 1280 × 800、960 × 720、760 × 720 真实浏览器回归通过，滚动与翻页模式无横向溢出，窄窗继续使用覆盖式侧栏，控制台无 warning/error。
- 用户确认后删除被否决的第一版 `cinnabar-companion-*.svg` 和两个重复 `ReadingCompanion* 2.jsx`；当前仅保留第二版透明 PNG 作为活跃资产。
- `npm run test:p7`、formal/test build、`git diff --check` 与临时签名桌面构建通过。`读伴 Test.app` bundle id 为 `com.duban.reader.test`，`codesign --verify --deep --strict` 通过，可执行文件 SHA-256 为 `cf4cb64904ac7262518f757d31d1e7fe28c6c859b26b28fdf5ef2f639a530528`。
- 本轮没有修改 AI、上下文、防剧透、事件、SQLite schema 10、目录备份 v3、Keychain 或 test/formal 数据隔离。P7.8 已完成，下一步进入 **P7.9 成果沉淀与用户可控记忆**。

### 2026-07-21：Tauri 阅读页整页快照闪烁修复

- 用户在新 Test.app 中发现书页偶发闪烁，鼠标滚动后恢复。该特征指向 WebView 合成层未及时重绘，而不是正文、PDF 文件或阅读进度损坏。
- `companionTransition.js` 过去只要检测到 `document.startViewTransition` 就会快照整个文档。macOS Tauri WebView 在长 MOBI 正文和 PDF Canvas 上对该整页快照支持不稳定，读伴开合或场景切换后可能残留失效合成层。
- 现改为按运行时选择：Tauri 永远走局部 fallback，只动画带 `data-companion-shared` 的读伴元素；普通浏览器在 API 可用时继续使用原生 View Transition。
- 新增 `test:companion-transition` 并并入 `test:p7`，防止后续重新在桌面端启用整页快照。本轮不改变 AI、SQLite、书籍文件、页码、高亮或备份数据。
- 验证：`test:p7`、test/formal build、安全扫描、Test.app 构建和 codesign 校验通过；真实 Test.app 在 MOBI 滚动/翻页模式下连续收起、展开读伴并翻页，书页不滚动也保持完整。修复包 SHA-256：`921c15499665b03a625f27bc40c41561ac6ff0168411e05f583a42abbcffd744`。

### 2026-07-21：P7.9.1 本节记录与记忆确认边界

- 完成页新增可编辑、可删除的「本节留下了什么」，分别保存用户自己的理解和仍未解决的问题，并展示本节提问、笔记和用户回想计数。
- 保存本节记录不会自动进入长期记忆；只有用户明确点击“确认让读伴记住”才会更新本书记忆，记录修改后也必须再次确认。
- 数据复用 `companion_events` 中的 `session_record`，继续使用 schema 10、事件 tombstone、目录备份 v3 和既有 merge/回滚链路。
- 只有用户回想、真实笔记或手工输入能形成草稿。模型回答、通用 `AI 回答` 标题、空来源和旧兜底文案不会冒充用户成果。
- 新增 `test:companion-section-record` 并纳入 P7 回归；P7 全量测试、formal/test build、安全扫描、Rust test/check、diff 与 Test.app 签名校验通过，最终可执行文件 SHA-256 为 `f22fbe936d4e6a230e453e878ad667d63e17f22352777d3b083a250ba109ba49`。
- 真实桌面已确认旧错误记录自动清空、输入后按钮状态正确；保存后的重启恢复因 macOS 锁屏未完成，后续人工补验。下一步进入 **P7.9.2 后续导读的受控承接**。
- 完成页随后按反馈细化：问答、笔记和读后回答数量可点击展开，编辑区改为读伴左问、用户右答；“回想”不再作为用户可见名词。
- 已确认记忆支持撤销，撤销不会删除本节记录；历史异常记忆可通过来源阅读项重新定位。最新 Test.app 已完成真实展开/切换和条件按钮回归，签名有效，SHA-256 为 `b17f660d86a35a2b816b231d70805a1cab6b0ba1bb4222407337a743795ef614`。
- 最终产品反馈确认完成页不应重复读后聊天：两轮输入、保存记录和新记忆确认已撤下，只保留可展开的“回答 / 笔记 / 读后”。`session_record` 退回后台索引职责；已有本节关联记忆仍可撤销。
- 最终 Test.app 已验证空成果页只有三个禁用入口且没有重复留言控件；P7 全量测试、formal/test build、安全扫描、Rust 测试和签名校验通过，可执行文件 SHA-256 为 `02e6f5a41d8d440605e6e7b8da2ca1891458f7cd76efb59df55b2390cf7cd6cf`。

### 2026-07-22：建立 AI 用词替代偏好主文件

- 新增 `src/prompts/wordSubstitutions.md` 作为具体用词偏好的唯一主文件，首条记录为：模型生成时尽量把“收束”按句义改为“结束、完毕、总结、回到主题”等自然表达。
- 名单通过统一人格入口进入章节导读、阅读中问答、本书聊天、读后交流、读后总结和整本书导读，不在每个业务 prompt 重复维护。
- 名单只指导模型生成，不做输出后的字符串替换；用户输入、书籍原文、引文、书名、专有名词和替换后会失真的内容不受影响。
- 正文排版任务 `readingTextFormat` 明确排除名单，避免修改原文。生成链路的 prompt 版本已升级，使旧上下文缓存失效。
- 新增 `test:prompt-word-substitutions` 并纳入 P7 全量回归；专项/P7 测试、formal/test 构建、安全扫描和临时签名桌面构建均通过。以后增加词条时必须同时运行该测试。

## 当前已知限制

- 浏览器 IndexedDB 不应视为长期大型书库的最终存储方案。
- 浏览器版直连 OpenAI-compatible 服务可能遇到 CORS 限制；Tauri 桌面版已通过本地 Rust command 代理模型请求。
- P6.4 AI transport 生产化主体已完成：Keychain 连续弹窗、结构化错误、超时、有限重试、请求取消、输出截断识别、费用/token 预算保护、模型 profile 管理和脱敏调用诊断均已落地。
- P6.1-P6.12 工程基线已完成并冻结；自动更新 App 内体验和 updater 私钥离线备份由用户作为发布运营事项继续完成，后续生产化增强进入持续 QA/Backlog。
- 2026-07-08：桌面版主窗口点叉号改为隐藏到后台，不直接退出进程；macOS 点击 Dock 图标会重新显示并聚焦主窗口。
- 2026-07-08：`tauri:dev` 下 Dock 右键退出可能短暂显示终端/调试进程图标；这是开发态未打包二进制的身份问题。Dock 图标一致性请用 `src-tauri/target/release/bundle/macos/读伴.app` 这类真实 bundle 测试包验证。
- PDF 图片、表格、扫描件 OCR 暂未支持。
- MOBI 当前提供文本阅读，不渲染 Kindle 原版版式，也暂不显示 MOBI 内嵌图片或真实内嵌封面。
- 章节识别已加入 PDF 递归 outline、页面版式标题候选和质量评分兜底；复杂目录页、扫描版 PDF 或标题版式异常的书仍可能需要用户手动调整。
- 当前阅读计划仍是本地草稿，尚未调用 AI 优化。
- AI 章节导读已实现手动生成、耗时提示、token 展示和费用估算，但还没有流式输出和编辑能力。
- 阅读会话已实现三段式骨架、阅读位置保存、PDF 原版页渲染、PDF text layer、选中文本提问浮层、高亮笔记、当前章节 sidebar 问答和读后交流；尚未支持字体设置。
- PDF.js worker 会让构建产物体积偏大，后续可考虑按需加载或拆包。
