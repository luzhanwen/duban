# 后续 AI 接手提示词

> 最后更新：2026-06-18

本文档保存后续让 AI 接手读伴项目时可直接复制的提示词模板。它不是产品 prompt；产品内导读、问答、读后交流 prompt 仍维护在 `src/prompts/` 和 [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md)。

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
8. 如果涉及开书契约或产品 prompt：docs/READING_CONTRACT_CONTEXT.md

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

截至 2026-06-18：

- Tauri 桌面版已可启动，已有本地测试版 `.app` / `.dmg`。
- 桌面模型请求已迁到 Rust command。
- 桌面存储 schema 当前为 `9`。
- API Key 已迁入系统 Keychain。
- 原始 PDF/MOBI 文件在 App 数据目录 `files/`。
- 封面缓存文件在 App 数据目录 `files/covers/`，索引在 `book_covers`。
- 非敏感 settings 在 `app_settings`，AI 排版缓存 在 `formatted_texts`。
- 目录式备份在 App 数据目录 `backups/`，结构为 `manifest.json + files/`，当前 backupVersion 为 `3`。
- 备份支持预览、校验、合并导入和覆盖恢复。
- 备份不包含 API Key。
- 仍待推进：大文件解析韧性、AI transport 生产化、压缩归档、备份签名、迁移夹具、签名公证和自动更新。
