# 后续 AI 接手提示词

> 最后更新：2026-07-11

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

项目当前是浏览器 MVP + Tauri 桌面版：
- 浏览器版使用 IndexedDB。
- 桌面版使用 Tauri Rust 本地后端、SQLite、App 数据目录、系统 Keychain 和目录式备份。
- API Key 不得进入 SQLite、备份、日志或错误信息。
- 用户 PDF、笔记、聊天记录默认只保存在本地。

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
3. 如果涉及本地后端，阅读 docs/BACKEND_DEVELOPMENT_STANDARDS.md。
4. 如果涉及 SQLite/备份/Keychain，阅读 docs/DESKTOP_STORAGE_SCHEMA.md。
5. 实现改动。
6. 跑必要验证。
7. 更新相关 docs，并在 APP_EVOLUTION_LOG.md 追加实施日志。

要求：
- 不要破坏浏览器版。
- 不要把 API Key 写入 SQLite、备份、日志或错误信息。
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

## 接手前快速事实

截至 2026-07-07：

- Tauri 桌面版已可启动，已有本地测试版 `.app` / `.dmg`。
- 桌面模型请求已迁到 Rust command。
- 桌面存储 schema 当前为 `9`。
- API Key 已迁入系统 Keychain。
- AI transport 允许在当前 Tauri 进程内短期缓存已从 Keychain 解析出的密钥，以减少连续系统授权弹窗；缓存不得落盘，保存/删除 Key 后必须失效。
- 原始 PDF/MOBI 文件在 App 数据目录 `files/`。
- 封面缓存文件在 App 数据目录 `files/covers/`，索引在 `book_covers`。
- 非敏感 settings 在 `app_settings`，AI 排版缓存 在 `formatted_texts`。
- 目录式备份在 App 数据目录 `backups/`，结构为 `manifest.json + files/`，当前 backupVersion 为 `3`。
- 备份支持预览、校验、合并导入和覆盖恢复。
- 备份不包含 API Key。
- P6.1 数据安全收口、P6.2 存储结构收束和 P6.3 大文件解析韧性主体已完成。
- 产品内提示词规范维护在 `docs/PROMPT_WRITING_STANDARDS.md`；改 `src/prompts/` 前必须先读。
- P6.4 已完成 Keychain 连续弹窗修复、结构化错误、超时、有限重试、请求取消、输出截断识别、费用/token 预算保护、模型 profile 管理和脱敏调用诊断。
- P6.5 安全与隐私加固基础版已完成：依赖审计、Tauri 权限基线、command 输入校验、路径护栏、Tauri/Web CSP 与安全头、敏感信息扫描脚本、隐私/安全说明同步都已落地。
- P6.6 基础版已完成：诊断字段/隐私过滤规范已落文档，Rust 本地 JSONL 诊断日志会记录 App 启动、SQLite 初始化、AI 请求摘要和备份操作摘要；设置页可运行健康检查、导出诊断包，并复制最近 AI 错误详情。
- `npm run security:scan` 会检查真实密钥形态、Tauri CSP/headers、asset protocol scope、capabilities 和备份密钥剥离锚点；`npm run security:audit` 会同时跑 `npm audit`、Rust 重复依赖树和安全扫描。
- P6.7.1 发布配置收束已完成：正式包使用 `formal` channel、`com.duban.reader`，测试包使用 `test` channel、`com.duban.reader.test`；发布流程见 `docs/RELEASE_PROCESS.md`。
- P6.7.2 签名/公证链路已跑通，但首个公证候选包在人工回归中发现旧 PDF 的 macOS `asset://` 状态 `0` 问题，已标记作废。修复在 `fileAdapter` 中用 XHR 接收自定义协议有效响应，并让 `PdfReader` 以二进制 `data` 加载；formal build 和安全扫描通过，等待下一轮桌面人工回归。确认旧书可读后必须重新签名、公证、Gatekeeper/checksum 验证，再继续干净环境全量回归。
- test/formal 环境必须严格隔离：基础 Tauri 配置和 `npm run tauri:dev` 均使用 `com.duban.reader.test`，正式配置显式使用 `com.duban.reader`；Keychain service 分别为 `com.duban.reader.test.keychain.ai` 与 `com.duban.reader.keychain.ai`。不得把开发入口改回生产 identifier，不得让测试版自动迁移正式目录。
- 本机已同时启动 test/formal 验证隔离：test SQLite 为 2 本书，formal 新库为 0 本书；后续改启动脚本、identifier、数据目录或 Keychain service 时必须重复 QA `REL-007` / `AI-008`。
- 当前 App 开发版本为 `0.2.0-alpha.2`。`package.json` 是唯一人工版本源；禁止单独修改 Tauri/Cargo/lockfile，必须使用 `npm run version:set -- <semver>` 或 `npm run version:bump -- <kind>`，并执行 `npm run version:check`。`v0.2.0-alpha.1` 是签名前失败且无 Release 的不可变 tag，历史 `v0.1.0` 也不得移动或复用；版本规则见 `docs/VERSIONING.md`。
- App 内版本信息由 `vite.config.js` 构建注入并由 `src/lib/appVersion.js` 统一消费；禁止在组件里手写 App/schema/backup 版本。正式候选包诊断页必须显示 `formal`、目标 commit 且不带 `dirty`。
- P6.9.1 基础 CI 和 P6.9.2 Release preflight CI 已完成：`.github/workflows/ci.yml` 会执行 formal build、release preflight、Rust fmt/check/test 和安全扫描。
- P6.9.3 发布检查清单与协作模板已完成：`docs/RELEASE_CHECKLIST.md`、`.github/PULL_REQUEST_TEMPLATE.md`、bug report 和 feature request issue forms 已落地。
- P6.10.1 QA 矩阵基础版已完成：`docs/QA_MATRIX.md` 覆盖 P0 smoke、P1 核心回归、升级恢复、环境维度、样本策略和发布测试记录模板。
- P6.10.2 fixtures/样本说明基础版已完成：`qa-fixtures/` 包含合成 PDF、坏 PDF、HTML 源文本、空备份 manifest、篡改备份 manifest 和 fixtures manifest；`npm run qa:fixtures` 可重生成，`npm run qa:fixtures:verify` 可校验。
- P6.7.6 tag 驱动的 macOS 自动发布已实现：`release:check/prepare/notes/publish/self-test` 和 `.github/workflows/release-macos.yml` 把 annotated tag、Developer ID 签名、Apple 公证/staple、Gatekeeper 与 GitHub Release assets 串联；配置见 `docs/GITHUB_RELEASE_AUTOMATION.md`。当前尚未创建新 tag 或实际运行 GitHub 发布。
- 仍待推进：`v0.2.0-alpha.2` tag release 实跑、干净 macOS 回归、P6.10 升级样本、artifact 内容扫描增强、压缩归档、备份签名、迁移夹具、P6.8 自动更新和 CI 中的 `cargo audit`。
