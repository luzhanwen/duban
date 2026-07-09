# 安全与隐私审计记录

> 最后更新：2026-07-07

这份文档承接 P6.5「安全与隐私加固」。它记录依赖审计、Tauri 权限面、敏感信息边界和后续安全清单；不替代 [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md)，也不替代完整隐私说明。

## P6.5.1 依赖与权限基线

状态：已完成基础版。

目标：

- 建立可复跑的依赖安全审计入口。
- 记录当前前端依赖审计结果。
- 记录 Rust 依赖树和 `cargo audit` 工具缺口。
- 盘点 Tauri capabilities、asset protocol、command 暴露面和当前风险。

### 可复跑命令

```bash
npm run security:audit
```

该命令当前会执行：

- `npm audit`
- `cd src-tauri && cargo tree -d`
- `node scripts/security_scan.mjs`

说明：`cargo tree -d` 只能帮助发现重复依赖和依赖树膨胀，不等同于 RustSec 漏洞审计。后续建议在本机或 CI 安装并启用 `cargo audit`。

### 2026-07-07 审计结果

前端依赖：

- 命令：`npm audit --json`
- 结果：0 个漏洞。
- 统计：prod 16、dev 188、optional 75、peer 8、total 216。
- 严重度：info 0、low 0、moderate 0、high 0、critical 0。

Rust 依赖：

- 命令：`cargo tree -d`
- 结果：存在多组正常的传递依赖重复版本，例如 `base64`、`bitflags`、`getrandom`、`hashbrown`、`indexmap`、`serde`、`thiserror`、`toml`、`uuid` 等。
- 当前判断：这些重复版本主要来自 Tauri、Reqwest、Rusqlite、Keyring 等上游依赖组合；P6.5.1 不做强制收敛。
- 工具缺口：`cargo audit` 当前未安装，不能声明 RustSec 漏洞审计已完成。

### Tauri 权限基线

配置文件：

- `src-tauri/capabilities/default.json`
- `src-tauri/tauri.conf.json`

当前 capabilities：

- `core:default`
- `core:event:allow-listen`
- `core:event:allow-unlisten`

当前未授予：

- shell 插件权限。
- fs 插件通用读写权限。
- dialog/http 插件权限。

当前 asset protocol：

- 已启用 `protocol-asset`。
- scope 限制为 `$APPDATA/files/**`。
- 用途：让前端读取桌面 App 数据目录下的本地书籍文件和封面缓存。

当前 CSP：

- `tauri.conf.json` 已配置正式 `app.security.csp`。
- 正式 CSP 禁止 `object-src`、`base-uri` 和 `frame-ancestors`，并只允许当前已知模型供应商 API origin。
- `devCsp` 单独允许 Vite dev server 与 HMR，不进入正式 CSP。
- `app.security.headers` 已配置 Tauri 当前支持的 `X-Content-Type-Options: nosniff` 和限制性的 `Permissions-Policy`。
- `Referrer-Policy: no-referrer` 已配置在 Web 静态部署 `public/_headers` 中；Tauri v2 当前配置 schema 不接受该 header 字段。
- Web 静态部署补充 `public/_headers`，用于 Netlify/Cloudflare Pages 等支持 `_headers` 约定的平台。

### Tauri command 暴露面

AI command：

- `duban_ai_call_model`
- `duban_ai_stream_model`
- `duban_ai_cancel_request`

存储 command：

- `duban_storage_get_item`
- `duban_storage_set_item`
- `duban_storage_set_file`
- `duban_storage_remove_item`
- `duban_storage_delete_book`
- `duban_storage_keys`
- `duban_storage_clear`
- `duban_storage_scan_orphan_files`
- `duban_storage_delete_orphan_files`
- `duban_storage_export_backup`
- `duban_storage_import_backup`
- `duban_storage_list_backups`
- `duban_storage_preview_backup`
- `duban_storage_import_backup_id`
- `duban_storage_preview_backup_path`
- `duban_storage_import_backup_path`
- `duban_storage_delete_backup`
- `duban_storage_update_backup_metadata`

诊断 command：

- `duban_diagnostics_health_check`
- `duban_diagnostics_export_package`

当前边界：

- 前端通过 `src/lib/ai.js`、`src/lib/backup.js`、`src/lib/tauriStorageAdapter.js` 调用 Tauri command。
- 页面组件不直接散落调用 Tauri command。
- 存储 command 可读写本地书库数据，因此后续 P6.5.2 需要逐项复查输入校验、路径约束和敏感信息脱敏。

### 已确认安全边界

- 桌面 API Key 只进入系统 Keychain。
- SQLite `app_settings.raw_json` 不保存 API Key。
- 浏览器/桌面备份默认不包含 API Key。
- AI 预算日用量 `__duban:ai-budget:{YYYY-MM-DD}` 不进入备份。
- AI 调用诊断 `__duban:ai-diagnostics` 不进入备份。
- AI 调用诊断不保存 prompt、章节正文、笔记正文、聊天全文或 API Key。
- 设置页复制错误详情只复制 AI 调用诊断的脱敏摘要。
- 本地诊断日志中的备份事件只记录操作类型、模式、计数、备份 id 和状态，不记录外部路径、标签/备注正文、书籍内容、文件内容或 API Key。
- 设置页测试连接只使用当前输入的 API Key，不自动读取 Keychain。
- 自定义 OpenAI-compatible Base URL 在保存、TXT 导入、测试连接和已启用任务 profile 中有二次确认。

## 当前待办

- P6.5.2：逐项复查 Tauri command 输入校验、文件路径边界、备份导入路径和清空/删除类操作。已完成基础版。
- P6.5.3：补正式 Web/Tauri 安全头与 CSP 策略。已完成基础版。
- P6.5.4：系统扫描日志、错误、备份、诊断导出，确认不包含 API Key 或正文级隐私。已完成可复跑脚本基础版。
- P6.5.5：更新隐私说明和安全说明，让浏览器版与桌面版边界一致。已完成基础版。
- 后续 CI：安装并运行 `cargo audit`，把 RustSec 审计纳入发布检查。

## P6.5.2-P6.5.5 安全加固收尾

状态：已完成基础版。

本轮新增：

- Tauri 存储 command 读写入口统一校验 key，删除书籍入口校验 book id。
- 本地文件相对路径统一限制在 `files/*.blob` 或 `files/covers/*.blob` 两种形态，读取、删除、备份和封面缓存路径均走安全拼接。
- 外部备份路径先做文本校验，再 canonicalize；只接受已存在的目录或 `manifest.json` 文件。
- 文件名写入本地索引和备份前会清理路径分隔符、控制字符和无意义前后缀。
- Tauri 正式 CSP、dev CSP 和基础安全头已写入 `src-tauri/tauri.conf.json`。
- Web 静态部署安全头写入 `public/_headers`。
- 新增 `scripts/security_scan.mjs`，检查真实密钥形态、Tauri CSP/headers、asset protocol scope、capabilities 和备份密钥剥离锚点。
- 根目录 `SECURITY.md` 与 `PRIVACY.md` 已更新浏览器版/桌面版边界。

本轮可复跑命令：

```bash
npm run security:scan
npm run security:audit
cd src-tauri && cargo test && cargo check
npm run build
```

本轮验证结果：

- `npm run security:scan` 通过。
- `npm run security:audit` 通过，`npm audit` 为 0 vulnerabilities。
- `cd src-tauri && cargo test` 通过，18 个 Rust 测试全部通过。
- `cd src-tauri && cargo check` 通过。
- `cd src-tauri && cargo fmt --check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run build:formal` 通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 通过。

已知限制：

- `public/_headers` 是静态托管平台配置约定；如果未来部署到 Nginx、S3/CloudFront、Vercel 或自建服务，需要把同等响应头复制到对应平台配置。
- `npm run security:audit` 当前仍未包含 RustSec 漏洞数据库审计；需要在 P6.9 CI 或本机安装 `cargo audit` 后补齐。
- CSP 当前显式允许 Anthropic、OpenAI、DeepSeek、Moonshot/Kimi API origin；新增供应商或自定义云代理时必须同步复查 CSP 与 Base URL 确认文案。

## 复查原则

- 任何新增 Tauri command 都要先写清楚调用者、输入、输出和敏感信息边界。
- 任何新增备份/诊断/日志字段都默认视为可能泄密，必须先做脱敏设计。
- 任何新增文件路径输入都必须防目录穿越，并说明允许访问的根目录。
- 任何新增外部网络目标都必须说明用户是否知情、是否包含 API Key、是否包含阅读文本。
