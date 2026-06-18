# 读伴后端开发标准

> 最后更新：2026-06-18

本文档定义读伴后端相关工作的工程标准。当前读伴没有云端业务服务器；这里的“后端”主要指 Tauri Rust 本地后端、SQLite/App 数据目录、Keychain、备份、模型请求代理，以及前端到这些能力的 adapter 边界。未来如果引入云端后端，也必须先更新本文档和隐私边界。

## 后端定位

当前后端形态：

- 浏览器版：仍是纯前端 MVP，存储使用 IndexedDB，模型请求由浏览器直连供应商。
- 桌面版：Tauri Rust 本地后端负责模型请求代理、本地 SQLite、App 数据目录文件、系统 Keychain 和目录式备份。
- 项目默认不上传用户 PDF、笔记、聊天记录或 API Key 到读伴自己的服务器。

后端优先级：

1. 本地优先和隐私边界清晰。
2. 数据可迁移、可备份、可恢复。
3. 前端业务 API 稳定，底层实现可替换。
4. 错误可理解、可诊断，不泄露敏感信息。
5. 测试覆盖关键数据路径，而不是只看能否编译。

## 架构边界

### 前端门面

业务层优先通过这些门面访问后端能力：

- `src/lib/storage.js`
- `src/lib/books.js`
- `src/lib/ai.js`
- `src/lib/fileAdapter.js`
- `src/lib/backup.js`

不要让页面组件直接散落调用 Tauri command、localforage、Keychain 或 SQLite。例外必须有明确理由，并同步更新本文档。

### Tauri command

Tauri command 是桌面后端的公开接口：

- command 名称使用 `duban_*` 前缀。
- 请求/响应结构使用 `serde` struct，前端字段通过 `#[serde(rename_all = "camelCase")]` 对齐 JS。
- command 返回 `Result<T, String>`，错误文案面向用户，可读、简短，不包含 API Key、文件全文、完整 prompt 或隐私数据。
- 新 command 必须挂到 `src-tauri/src/lib.rs` 的 `invoke_handler`。
- 前端调用 command 时必须包在 `src/lib/*` adapter 或 service 中，不直接从组件里调用，除非是临时调试代码且不会提交。

### 浏览器兼容

桌面能力必须尽量保留浏览器版降级路径：

- 浏览器版存储继续走 IndexedDB。
- 浏览器版备份继续走 JSON 下载/导入。
- 浏览器版模型请求继续通过现有 browser transport。
- 如果某功能只能在桌面版工作，前端必须明确判断 runtime，并给出不误导的提示。

## 数据和存储标准

### SQLite

SQLite 是桌面版结构化数据来源：

- 所有 schema 改动都要同步更新 [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)。
- 每次 schema 变化都要提升 `CURRENT_SCHEMA_VERSION`。
- schema 初始化只做建表和索引；数据迁移放进显式迁移函数。
- 迁移函数必须可重复执行，不应依赖“只跑一次”的隐藏状态。
- 结构化表稳定前，可以保留 `raw_json` 兼容旧前端对象。

当前 source of truth：

- 书籍元数据：`books` / `book_chapters`
- 原始文件索引：`book_files`
- 分页文本：`book_pages`
- 阅读计划：`reading_plans` / `reading_plan_items`
- 阅读进度：`reading_progress` / `reading_item_progress`
- 笔记：`notes`
- 伴读聊天：`chat_messages`
- 读后交流：`reflection_messages`
- 章节导读：`reading_guides`
- 非敏感设置：`app_settings`
- 封面缓存：`book_covers` + `files/covers/`
- AI 排版缓存：`formatted_texts`

`kv_store` 只保留兼容旧 key 或临时低风险 JSON。新增长期数据必须优先进入结构化表或明确的文件目录，不能默认塞回 `kv_store`。

### 文件系统

桌面 App 数据目录：

```text
~/Library/Application Support/com.duban.reader/
  duban.sqlite3
  files/
  backups/
```

规则：

- 原始 PDF/MOBI 文件放在 `files/`。
- 封面缓存文件放在 `files/covers/`。
- SQLite 只保存文件索引和相对路径。
- 读取文件时优先返回本地文件引用，由前端通过 Tauri asset protocol 加载。
- 任何从备份或用户输入来的相对路径都必须防目录穿越。
- 孤儿文件扫描必须只删除 SQLite 没有引用的 `files/` 文件；引用来源至少包括 `file_store`、`book_files` 和 `book_covers`。

### Keychain

API Key 存储规则：

- 桌面版 API Key 只能存系统 Keychain。
- SQLite、备份、日志、错误字符串中不得写入 API Key。
- `settings` 写入路径必须剥离 `anthropic.apiKey`、`openaiCompatible.apiKey` 和旧 `apiKey`。
- `duban_storage_get_item("settings")` 只能返回非敏感设置，不得为了兼容前端自动读取或注入 Keychain 密钥。
- 可以在 `settings` 中保存 `anthropic.hasApiKey` / `openaiCompatible.hasApiKey` 这类非敏感状态，用来提示本机是否已保存过密钥；该状态不得被当成密钥本身，也不得触发 Keychain 读取。
- 没有 `hasApiKey` 标记时，UI 可以显示“状态未知”，但不得为了确认旧 Key 是否存在而自动读取 Keychain。
- 备份导出必须移除 `apiKey` 和 `hasApiKey`，避免把本机 Keychain 状态误带到另一台机器。
- 进入设置页、预览备份、读取普通配置等低风险动作不得触发系统 Keychain 密码弹窗。
- schema 初始化和旧数据迁移不得自动读写 Keychain；如果旧 `settings` 中残留 API Key，只允许脱敏落库，用户需要在设置页重新填写并保存新密钥。
- 设置页测试连接只测试当前输入的 API Key，不得自动读取已保存 Keychain 密钥，也不得为了测试连接自动保存设置。
- AI transport 在用户明确发起测试连接或模型请求时，如果请求体没有明文 API Key，才允许从 Keychain 解析已保存密钥。
- 设置页 API Key 输入框留空保存不得删除既有 Keychain 密钥；未来如果支持单独删除 Key，必须提供明确入口和确认。
- 清空全部数据时要同步删除读伴写入 Keychain 的 API Key。
- 备份默认 `includesApiKeys = false`。

### 备份

桌面版备份标准：

- 当前格式：`duban.local-backup` v3。
- 当前结构：`manifest.json + files/` 目录式备份。
- `manifest.json` 保存 metadata、schemaVersion、manifestSha256、items、files 索引、label 和 notes。
- 原始文件放在备份目录的 `files/`，每个文件必须记录 `byteSize` 和 `sha256`。
- 导入前必须校验 format、backupVersion、schemaVersion、manifestSha256、重复 key、重复书籍 id、文件路径、防目录穿越、文件存在性、文件大小和文件 sha256。
- 导入前必须创建自动恢复点；导入失败时要优先恢复导入前状态，并在错误里说明回滚结果。
- 设置页允许维护备份名称/备注、删除本地备份，并通过外部目录或 `manifest.json` 路径导入备份。
- 导入模式至少支持：
  - `merge`：保留当前库里备份未涉及的数据；同 id 书籍和同 key 数据以备份为准。
  - `replace`：覆盖恢复，先清空当前书库数据再恢复备份。

后续如果加入 zip/tar：

- 归档内仍保持 `manifest.json + files/` 结构。
- 必须先完整解包到临时目录并校验，再进入导入流程。
- 解包必须防 zip-slip / 目录穿越。

## AI 请求标准

桌面版模型请求由 Rust 后端代理：

- 前端统一调用 `src/lib/ai.js`。
- transport 分流由 `src/lib/aiTransport.js` 负责。
- Tauri transport 在 `src/lib/tauriAiTransport.js`。
- Rust 侧 command 负责 HTTP 请求，不把模型供应商差异泄漏到组件层。

安全规则：

- 不记录 API Key。
- 不记录完整章节文本、用户笔记、聊天全文或 prompt 全文。
- 自定义 Base URL 必须保留二次确认机制。
- 错误文案说明失败原因，但不回显敏感请求体。

供应商规则：

- Anthropic 和 OpenAI-compatible 是当前两条主路径。
- 新增供应商时，先扩展 settings 数据结构和 `aiTransport`，再接 Rust command。
- 新增供应商必须说明 Base URL、安全边界、价格字段和连接测试策略。

## 错误处理

后端错误文案应符合：

- 用户能理解下一步，例如“请重新导入文件”“请检查备份格式”。
- 不暴露绝对隐私内容，例如完整书籍文本、API Key、完整 prompt。
- 能区分数据损坏、文件缺失、网络失败、权限失败。
- 对开发者可诊断的细节可以写入受控日志，但当前项目尚未建立长期日志系统，默认少写。

错误文案示例：

- `本地书籍文件不存在，请重新导入。`
- `备份校验未通过，请先查看校验报告。`
- `读取系统 Keychain 失败。`
- `模型服务返回空内容，请稍后重试。`

## 测试和验证

后端改动至少跑：

```bash
cd src-tauri
cargo fmt
cargo test
cargo check
cd ..
npm run build
```

涉及桌面启动、SQLite、文件、Keychain 或备份时，还要跑：

```bash
npm run tauri:dev
```

并验证：

- `http://localhost:5173/` 返回 HTTP 200。
- `schema_meta.schema_version` 符合预期。
- 关键结构化表数据没有被误删。
- 测试结束后停止 Tauri/Vite 进程。

测试覆盖建议：

- schema 迁移：旧 key 能迁入结构化表。
- 文件：原始文件可写入、读取、删除、备份恢复。
- Keychain：settings 脱敏，Keychain 读写路径不回写 SQLite。
- 备份：目录式 roundtrip、校验失败、merge 和 replace。
- AI transport：至少覆盖请求参数构造和错误文案；真实模型调用由人工用真实 Key 回归。

## 文档同步

后端相关改动必须同步文档：

- 改 schema、迁移、备份目录：更新 [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)。
- 推进 App 化、Tauri、本地后端、模型代理：更新 [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md)。
- 改架构共识：更新 [PROJECT_NOTES.md](./PROJECT_NOTES.md)。
- 改阶段目标或 Backlog：更新 [ROADMAP.md](./ROADMAP.md)。
- 改隐私、BYOK、安全边界：更新 [PUBLIC_READINESS_CHANGES.md](./PUBLIC_READINESS_CHANGES.md)。
- 改后端标准本身：更新本文档。

## 提交前检查清单

- 前端组件没有直接散落调用 Tauri command。
- API Key 没有进入 SQLite、备份、日志或错误信息。
- 新 Tauri command 已挂到 `invoke_handler`。
- 新数据结构已写入 schema 文档。
- schema 版本已更新，迁移可重复执行。
- 浏览器版有降级路径或明确提示。
- `cargo fmt`、`cargo test`、`cargo check`、`npm run build` 已通过。
- 如果启动过测试环境，已停止 Tauri/Vite 进程。
