# 后续 AI 接手提示词

> 最后更新：2026-07-22

本文档保存后续让 AI 接手读伴项目时可直接复制的提示词模板。它不是产品 prompt；产品内导读、问答、读后交流 prompt 仍维护在 `src/prompts/`，写作标准见 [PROMPT_WRITING_STANDARDS.md](./PROMPT_WRITING_STANDARDS.md)，开书契约上下文见 [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md)。

使用方式：

- 新开 AI 会话时，先复制「通用接手提示词」。
- 如果任务涉及 Tauri、本地后端、SQLite、Keychain、备份或模型请求，再追加对应专项提示词。
- 每次任务完成后，要求 AI 更新相关 docs，尤其是 [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md)。

## 通用接手提示词

```text
你正在接手「读伴 · Duban」项目。请先阅读并遵守以下文档：

1. docs/README.md
2. docs/ROADMAP.md
3. docs/PROJECT_NOTES.md
4. docs/APP_EVOLUTION_LOG.md
5. docs/BACKEND_DEVELOPMENT_STANDARDS.md
6. 如果涉及桌面存储：docs/DESKTOP_STORAGE_SCHEMA.md
7. 如果涉及 UI：docs/UI_DESIGN_STANDARDS.md
8. 如果涉及产品 prompt 或模型输出文风：docs/PROMPT_WRITING_STANDARDS.md
9. 如果涉及开书契约或读伴记忆：docs/READING_CONTRACT_CONTEXT.md
10. 如果涉及安全、隐私、Tauri command、备份、Keychain 或发布前检查：docs/SECURITY_PRIVACY_AUDIT.md
11. 如果涉及诊断日志、诊断包、健康检查或错误详情复制：docs/DIAGNOSTICS_PRIVACY_SPEC.md
12. 如果涉及正式发布包、构建通道、artifact、checksum 或 release notes：docs/RELEASE_PROCESS.md
13. 如果涉及 App 版本、Changelog 或 Git tag：docs/VERSIONING.md
14. 如果涉及 GitHub Release、CI 签名、公证或发布 Secrets：docs/GITHUB_RELEASE_AUTOMATION.md
15. 如果涉及导读、读中问答、读后回想、读伴设置、记忆或 P7：docs/COMPANION_ACTIVE_READING_PLAN.md
16. 如果涉及 P7.8 读伴形象、导读、侧栏、时间线、设置或场景衔接：docs/COMPANION_UI_AUDIT.md
17. 如果涉及具体词语偏好：src/prompts/wordSubstitutions.md；它是唯一主文件，不要另建代码替换表

项目当前是浏览器 MVP + Tauri 桌面版：
- 浏览器版使用 IndexedDB。
- 桌面版使用 Tauri Rust 本地后端、SQLite、App 数据目录、系统 Keychain 和目录式备份。
- API Key 不得进入 SQLite、备份、日志或错误信息。
- 用户 PDF、笔记、聊天记录默认只保存在本地。
- P7.1-P7.11 已完成并进入维护状态；下一步进入 P8.1 移动技术验证。
- P7 诊断摘要集中在 `companionDiagnostics.js`：只能记录材料类型、脱敏引用、页码、计数、预算、策略和缓存状态；不得添加正文、笔记、问题、回答、prompt 或原始 id。
- 对 P7 做发布回归时同时执行 `docs/P7_RELEASE_CHECKLIST.md` 与通用 `docs/RELEASE_CHECKLIST.md`；P7 阶段完成不代表某个公开 tag 已经签名、公证或发布。
- P7.8.1 已确认问题不只在暖黄纸片 PNG：导读、阅读侧栏、时间线、记录、输入区和设置存在重复头像、嵌套卡片、页面级裁切及独立工具面板感。三个方向必须使用同一示例内容，同时覆盖导读、读中、读后/记录、宽窄布局和完整/标准/印记规格；用户定稿前不要替换代码或批量清理旧资产。
- P7.8 必须遵守 `COMPANION_UI_AUDIT.md` 的不可变功能边界：一个视口一个主要身份信号、一个场景一个主要表面、用户右/读伴左/记录居中、正文优先、透明背景三规格、窄窗不压缩正文。不要只换头像，也不要在旧界面上继续堆装饰或状态动画。
- P7.8.2 三案与最终概念母稿归档在 `docs/assets/p7-8-2/`。第一版手绘 SVG 因把侧坐低头猫改成另一种圆润形象被人工否决并已删除，禁止重新接回；两个重复 `ReadingCompanion* 2.jsx` 也已清理。当前活跃资产是 `public/companion-assets/cinnabar-companion-*-v2.png` 三份透明 PNG，分别承担完整、标准、印记规格；不得用完整图直接缩放替代小规格，也不得改变侧坐、低头、前爪搭页的核心姿态。阅读页收起后只保留页边印记，点击恢复侧栏，工具栏不得重复增加文字入口。
- 产品已取消主动提问：不要根据停留、翻页、高亮或阅读事件自动调用模型，也不要恢复页边主动入口、主动程度设置或调度器。
- 旧 proactivity / intervention 相关字段与事件只为读取和备份兼容保留，不得据此恢复产品能力。
- 导读、读中问答和读后回想必须复用 `src/lib/companionContext.js`。不要在各调用文件重新拼整章正文、历史回答或整书导读。
- 严格防剧透请求只能使用组装器放行的选区、当前页和确认已读正文；`contextTrace` 只能保存引用、指纹、用途、预算和排除原因，不能复制书籍正文。
- 模型 profile 可以降低 P7 三类任务的输出上限，不能突破 `companionPolicy.answerDepth` 的硬上限。
- 不要为上下文块新增持久化表；当前使用会话内 LRU。完整章节导读沿用既有导读存储，并通过 `contextTrace.cacheKey` 判断命中与失效。

请先用 rg/sed 阅读相关代码，不要凭印象改。
除非我明确要求只给方案，否则请实现、验证并更新文档。
完成后请说明改了什么、验证了什么、还有什么限制。
```

## 阶段任务提示词

```text
我们现在进入阶段【填写阶段名】。

目标：
- 【填写目标 1】
- 【填写目标 2】

请按以下顺序工作：
1. 阅读 docs/APP_EVOLUTION_LOG.md，确认上一阶段状态。
2. 阅读 docs/ROADMAP.md 和 docs/PROJECT_NOTES.md，确认当前优先级。
3. 如果涉及 P7，阅读 docs/COMPANION_ACTIVE_READING_PLAN.md，并确认使用 2026-07-18 后的新编号。
4. 如果涉及本地后端，阅读 docs/BACKEND_DEVELOPMENT_STANDARDS.md。
5. 如果涉及 SQLite/备份/Keychain，阅读 docs/DESKTOP_STORAGE_SCHEMA.md。
6. 实现改动。
7. 跑必要验证。
8. 更新相关 docs，并在 APP_EVOLUTION_LOG.md 追加实施日志。

要求：
- 不要破坏浏览器版。
- 不要把 API Key 写入 SQLite、备份、日志或错误信息。
- 不要重新引入主动提问、主动提醒、候选问题预生成或阅读事件触发调度。
- 不要留下 Tauri/Vite 测试进程。
- 最终用简洁中文汇报。
```

## 后端修改提示词

```text
请修改读伴的本地后端能力，任务是：【填写任务】。

必须遵守：
- 先读 docs/BACKEND_DEVELOPMENT_STANDARDS.md。
- Tauri command 统一放在 src-tauri/src/storage.rs 或对应 Rust 模块，命名使用 duban_* 前缀。
- command 请求/响应使用 serde struct，并通过 camelCase 对齐前端。
- 前端页面不要直接调用 Tauri command；请通过 src/lib 下的 adapter/service 封装。
- 错误信息用用户可读中文，不泄露 API Key、书籍全文、prompt 全文或隐私数据。
- 如果改 schema，提升 CURRENT_SCHEMA_VERSION，并更新 docs/DESKTOP_STORAGE_SCHEMA.md。
- 如果改 App 化路线，更新 docs/APP_EVOLUTION_LOG.md。

验证至少包括：
- cd src-tauri && cargo fmt && cargo test && cargo check
- npm run build
- 如涉及安全、隐私、路径、备份、Keychain 或 Tauri command，运行 npm run security:scan
- 如涉及真实桌面启动，运行 npm run tauri:dev 并结束进程。
```

## SQLite / 迁移提示词

```text
请处理读伴桌面 SQLite schema / 数据迁移，任务是：【填写任务】。

请先阅读：
- docs/BACKEND_DEVELOPMENT_STANDARDS.md
- docs/DESKTOP_STORAGE_SCHEMA.md
- src-tauri/src/storage.rs

实现要求：
- 迁移函数必须可重复执行。
- 不要依赖只跑一次的隐藏状态。
- 保留前端 storage.js / books.js 的兼容 API。
- 能保留 raw_json 就先保留，避免旧对象丢字段。
- 长期数据应优先进入结构化表或明确文件目录；`kv_store` 只保留兼容旧 key 或临时低风险 JSON。
- 已结构化的数据包括 books、book_files、book_pages、reading progress、notes、chat/reflection、reading guides、app_settings、book_covers 和 formatted_texts。
- 迁移后清理旧 kv/file_store key 时要谨慎，不能误删用户数据。
- schema_meta.schema_version 必须更新。

验证：
- cargo test 覆盖核心迁移或 roundtrip。
- cargo check 通过。
- npm run build 通过。
- 启动桌面后查询 schema_meta 和关键表计数。
```

## 备份 / 恢复提示词

```text
请处理读伴本地备份/恢复能力，任务是：【填写任务】。

当前桌面备份标准：
- format: duban.local-backup
- 当前 backupVersion: 3
- 目录式结构：manifest.json + files/
- manifest 必须维护 manifestSha256；files 项必须维护 byteSize 和 sha256。
- 默认不包含 API Key。
- 支持导入前预览、校验报告、merge 和 replace。

必须遵守：
- 备份不得包含 API Key。
- 导入前必须校验 manifestSha256、backupVersion、schemaVersion、key、重复 key、重复书籍 id、文件路径、防目录穿越、文件存在性、文件大小和文件 sha256。
- 导入前必须创建自动恢复点；导入失败时要优先恢复导入前状态。
- 旧版 base64 JSON 备份要尽量保持兼容。
- merge 模式保留当前库里备份未涉及的数据；同 id 书籍和同 key 数据以备份为准。
- replace 模式才允许清空当前库。
- 前端入口在设置页，不要塞进阅读主流程。

验证：
- 至少有 Rust 单元测试覆盖 roundtrip。
- 如果改 merge 策略，增加合并导入测试。
- npm run build、cargo test、cargo check 都要过。
```

## Keychain / API Key 提示词

```text
请处理读伴 API Key / Keychain 相关能力，任务是：【填写任务】。

必须遵守：
- 桌面版 API Key 只能进系统 Keychain。
- SQLite、备份、日志、错误信息不得保存 API Key。
- settings 读给前端时不得自动注入 Keychain 密钥，避免进入设置页就触发系统密码弹窗。
- 可以用 settings 中的非敏感 hasApiKey 标记提示“本机已保存 Key”，但不得为了显示状态读取 Keychain。
- 没有 hasApiKey 标记时，UI 可以显示状态未知，不得自动探测 Keychain。
- 备份导出必须移除 apiKey 和 hasApiKey，避免跨设备误显示本机 Keychain 状态。
- schema 初始化和旧数据迁移不得自动读写 Keychain；旧 settings 中残留的 apiKey 只允许脱敏落库。
- 设置页测试连接只测试当前输入的 API Key，不得自动读取已保存 Keychain 密钥，也不得为了测试连接自动保存设置。
- AI transport 在用户明确发起测试连接或模型请求时，如果请求体没有明文 API Key，才可以从 Keychain 解析已保存密钥。
- AI transport 可以在当前 Tauri 进程内短期缓存已解析的 Keychain 密钥以减少重复系统弹窗；缓存不得落盘，保存或删除 Keychain 密钥后必须清空。Keychain 读取与缓存写入要在同一锁内完成，避免并发模型请求同时触发多次系统授权。
- 设置页 API Key 输入框留空保存不得删除既有 Keychain 密钥；写入 SQLite 前必须脱敏。
- 清空全部数据时要删除读伴在 Keychain 中写入的 API Key。
- 导出 AI TXT 配置可以包含 API Key，但必须明确提示用户只保存在可信位置。

验证：
- 检查 kv_store.settings 中不包含 apiKey。
- 进入设置页不应触发 Keychain 密码弹窗。
- API Key 输入框为空时点击设置页测试连接，应显示缺少密钥提示，而不是触发 Keychain 弹窗。
- 已保存 Key 时，设置页应显示非明文状态提示；导出的备份中不应包含 hasApiKey。
- 不打印真实 API Key。
- cargo check、npm run build 通过。
```

## AI Transport / 模型请求提示词

```text
请处理读伴模型请求后端/transport，任务是：【填写任务】。

当前结构：
- src/lib/ai.js 是业务入口。
- src/lib/aiTransport.js 做 runtime 分流。
- src/lib/tauriAiTransport.js 调用 Tauri Rust command。
- src-tauri/src/lib.rs 里有 Anthropic 和 OpenAI-compatible 请求实现。

必须遵守：
- 浏览器版仍可工作。
- 桌面版通过 Rust command 发请求。
- 自定义 Base URL 保留二次确认。
- 不记录 API Key、完整章节文本、完整 prompt 或用户隐私数据。
- 新供应商要说明 settings 字段、价格字段、连接测试策略和隐私边界。
- Tauri AI 错误要返回脱敏结构：message、code、kind、retryable、status；不要只返回裸字符串。
- 桌面请求要遵守统一超时和重试边界：连接 15 秒、总请求 180 秒、最多 3 次；只重试网络/超时/429/临时服务端错误，不重试鉴权、权限、模型不存在、Base URL 错误、上下文过长或响应格式错误。
- AI 业务入口要支持 AbortSignal；Tauri transport 用 requestId 调用 duban_ai_cancel_request，Rust 后端用取消令牌中止发送、退避和流式读取。用户主动取消要返回 AI_REQUEST_CANCELLED，并按非失败处理。
- AI response 要统一包含 finishReason/truncated；输出上限截断不能当作完整导读或正文整理保存，聊天类回答保存时要标记 truncated 并提示用户。
- 正式 AI 请求必须经过 src/lib/ai.js 的预算保护；预算用量只记录日期、任务类型、token 和估算费用，不记录 prompt/正文/API Key。
- 任务级模型 profile 必须经过 src/lib/ai.js 解析；profile 只能保存非敏感配置，不保存 API Key，effective settings 要继续用于预算和费用估算。
- AI 调用诊断只能记录脱敏摘要：任务、供应商、模型、Base URL origin、耗时、状态、错误码、HTTP 状态、尝试次数、token 和费用估算；不得记录 prompt、正文、笔记、聊天全文或 API Key。

验证：
- npm run build。
- cargo check。
- 如改 Rust 请求逻辑，补充可测试的纯函数或错误路径测试。
- 真实 API 连接测试由用户在可信环境里用自己的 Key 验证。
```

## UI 改动提示词

```text
请修改读伴 UI，任务是：【填写任务】。

请先阅读：
- docs/UI_DESIGN_STANDARDS.md
- docs/UI_CHANGELOG.md

要求：
- 不要做营销式 landing page。
- 工具型页面保持安静、密集但有秩序。
- 不要把页面区块都做成漂浮卡片；已有旧区块可渐进修。
- 按钮文字不能溢出。
- 变更设置页、书架、阅读器时要检查移动端布局。
- 如果涉及后端/隐私/备份文案，也要同步相应 docs。

验证：
- npm run build。
- 如果有 dev server，尽量用浏览器截图或人工步骤检查关键视口。
```

## 文档治理提示词

```text
请只做文档治理，任务是：【填写任务】。

要求：
- 新增文档必须挂到 docs/README.md。
- 如果影响 App 化、Tauri、本地后端或存储路线，更新 docs/APP_EVOLUTION_LOG.md。
- 如果影响整体阶段目标或 Backlog，更新 docs/ROADMAP.md。
- 如果影响架构共识，更新 docs/PROJECT_NOTES.md。
- 如果影响 schema、数据目录、备份格式，更新 docs/DESKTOP_STORAGE_SCHEMA.md。
- 文档要写清楚：为什么、改了什么、限制和下一步。
```

## 版本与 GitHub Release 提示词

```text
请处理读伴版本/正式发布任务，目标是：【填写任务】。

必须先阅读：
- docs/VERSIONING.md
- docs/RELEASE_PROCESS.md
- docs/RELEASE_CHECKLIST.md
- docs/GITHUB_RELEASE_AUTOMATION.md
- CHANGELOG.md

不可违反：
- `package.json` 是唯一人工版本源；不得单独修改 Tauri/Cargo/npm lock 版本。
- 历史 tag 不得移动、删除或复用，尤其是 `v0.1.0`。
- 只能从已进入 `origin/main` 的 clean commit 创建 annotated `v<SemVer>` tag。
- AI 不得自行创建、推送 tag 或公开 GitHub Release，除非用户明确要求执行该发布动作。
- 发布前先运行 `npm run release:prepare -- --dry-run`；冻结 Changelog 后提交并运行 `npm run release:check -- tag-ready`。
- 推送 tag 后由 `.github/workflows/release-macos.yml` 完成签名、公证和发布；不得另写会自动生成 tag 的 Release 流程。
- `APPLE_CERTIFICATE`、证书密码、Keychain 密码、Apple ID App 专用密码和 updater 私钥不得写入代码、日志、文档、artifact 或对话。
- P6.8 必须复用现有 SemVer/tag/source metadata、GitHub Release 和 release notes，只追加 updater 签名资产与 manifest。

验证至少包括：
- npm run version:check
- npm run release:self-test
- npm run build:formal
- npm run release:preflight
- npm run security:scan
- npm run qa:fixtures:verify
- cd src-tauri && cargo fmt --check && cargo check && cargo test

完成后更新 APP_EVOLUTION_LOG、PRODUCTION_UPGRADE_PLAN、ROADMAP 和 PROJECT_NOTES，并明确说明是否实际创建/推送 tag、是否发布 Release、哪些步骤仍需人工核验。
```

## 代码审查提示词

```text
请 review 当前改动，重点找 bug、数据丢失风险、隐私泄漏、迁移遗漏和测试缺口。

请优先检查：
- API Key 是否可能进入 SQLite、备份、日志、错误信息。
- schema 迁移是否可重复执行。
- Tauri command 是否通过 adapter 封装给前端。
- 浏览器版是否被桌面改动破坏。
- 备份/恢复是否可能误删数据。
- 是否有必要的 cargo test / cargo check / npm run build。
- 文档是否同步更新。

请按严重程度列 findings，给出文件和行号。没有问题也要明确说没有发现阻断问题，并说明剩余风险。
```

## 最终汇报提示词

```text
请用中文简洁汇报：

- 完成了什么。
- 关键文件位置。
- 跑了哪些验证。
- 有哪些限制或下一步。
- 如果启动过测试环境，说明是否已停止。

不要输出过长实现细节，不要让用户自己复制文件；用户和你在同一个工作区。
```

## 接手前事实来源

这里不再复制一份会持续过期的“当前事实快照”。接手者必须从以下来源读取实时状态：

- App 版本：`package.json`，并运行 `npm run version:check`。
- 当前阶段与下一步：`docs/ROADMAP.md`。
- 桌面 schema、备份版本和数据目录：`docs/DESKTOP_STORAGE_SCHEMA.md` 与 `src-tauri/src/storage.rs`。
- 发布、签名、公证和 updater 状态：`docs/RELEASE_CHECKLIST.md`、`docs/VERSIONING.md`、`docs/AUTO_UPDATE_ARCHITECTURE.md`。
- 当前 P7 状态：`docs/COMPANION_ACTIVE_READING_PLAN.md`。
- 最近实施与验证：`docs/APP_EVOLUTION_LOG.md` 顶部最新日期记录。
- 文档一致性：运行 `npm run docs:audit`。
