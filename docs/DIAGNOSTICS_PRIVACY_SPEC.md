# 诊断与隐私过滤规范

> 最后更新：2026-07-07

本文档承接 P6.6「本地诊断与可支持性」。它定义读伴本地日志、诊断包、错误详情复制和数据库健康检查可以记录什么、必须过滤什么，以及新增诊断字段时的审核规则。

## 目标

- 帮助定位启动失败、SQLite 初始化失败、备份失败、AI 请求失败和后续迁移失败。
- 默认不泄露 API Key、完整 prompt、章节正文、笔记正文、聊天全文、原始文件内容或版权文本。
- 让诊断日志成为后续“导出诊断包”的基础，而不是临时 console 输出。

## 当前落地状态

P6.6.1 已完成：

- 明确诊断字段允许清单、禁止清单和脱敏规则。
- 新增 Rust 脱敏函数 `redact_diagnostic_value`，所有本地诊断日志写入前都会经过它。
- 新增测试覆盖 API Key 样式、Authorization、正文级字段、Base URL origin 和 JSONL 写入。

P6.6.2 已完成基础版：

- 桌面版启动时创建 `logs/duban-diagnostics.jsonl`。
- 日志文件采用 JSON Lines，每行一条诊断事件。
- 单个当前日志文件超过 1 MB 时轮转为 `duban-diagnostics.1.jsonl`。
- 已记录 App 启动、SQLite 初始化成功/失败、AI 请求开始/成功/失败/取消。
- 日志写入失败不影响 App 主流程。

P6.6.3 已完成基础版：

- 新增 `duban_diagnostics_health_check` Tauri command。
- 健康检查覆盖 schema 版本、SQLite quick_check、关键表计数、缺失文件、不安全文件路径、孤儿文件、备份目录读写状态和非敏感 Key 状态。
- 健康检查不读取 Keychain 明文，只使用 `app_settings` 中的 `hasApiKey` 非敏感状态。

P6.6.4 已完成基础版：

- 新增 `duban_diagnostics_export_package` Tauri command。
- 导出单个脱敏 JSON 文件，位置在 App 数据目录 `diagnostics/duban-diagnostics-{timestamp}.json`。
- 诊断包包含 App 摘要、存储健康检查、备份摘要、非敏感设置摘要、最近 AI 调用诊断和最近本地诊断日志。
- 导出包内不包含绝对文件路径；command 返回值会告诉本机导出文件实际路径。

P6.6.5 已完成：

- 设置页「诊断」面板新增桌面健康检查和导出诊断包入口。
- 设置页支持复制最近 AI 错误详情，也支持复制单条异常调用摘要。
- 复制内容只包含脱敏字段：任务、状态、错误码、HTTP 状态、供应商、模型、Base URL origin、耗时、token、费用估算和尝试次数。

P6.6.6 已完成：

- 备份导出、导入、删除和元数据更新会写入脱敏本地诊断日志。
- P6.6 文档、路线图和 AI 接手提示词已完成收口。
- 回归验证命令固定为 `cargo fmt --check`、`cargo test`、`cargo check`、`npm run security:scan`、`npm run build` 和 `git diff --check`。

## 文件位置

桌面版诊断日志位于 App 数据目录：

```text
~/Library/Application Support/com.duban.reader/logs/
  duban-diagnostics.jsonl
  duban-diagnostics.1.jsonl
```

导出诊断包时，可以读取上述文件，但仍要再次执行隐私过滤。

## 日志格式

每行是一个 JSON 对象：

```json
{
  "schemaVersion": 1,
  "timestamp": "1783420000",
  "level": "info",
  "category": "ai",
  "event": "request_failed",
  "appVersion": "0.1.0",
  "fields": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "baseUrlOrigin": "https://api.anthropic.com",
    "stream": false,
    "messageCount": 2,
    "hasSystem": true,
    "maxTokens": 1024,
    "status": "error",
    "errorCode": "AI_NETWORK_TIMEOUT",
    "errorKind": "network",
    "retryable": true
  }
}
```

说明：

- `timestamp` 当前是 Unix 秒字符串；后续如需要 ISO 时间，可以在 schemaVersion 升级后调整。
- `fields` 必须只包含脱敏摘要。
- 不允许把 `messages`、`prompt`、`content`、`text`、`note`、`chat` 等正文级字段写入日志。

## 允许字段

默认允许记录：

- App 摘要：版本、运行环境、debug/formal、系统、CPU 架构。
- 存储摘要：schema 版本、初始化成功/失败、迁移阶段名称、错误诊断码。
- 备份摘要：backupVersion、schemaVersion、itemCount、fileCount、issueCount、导入模式、是否成功。
- AI 摘要：供应商、模型、Base URL origin、是否流式、消息数量、是否有 system、maxTokens、temperature、attempts、finishReason、truncated。
- 错误摘要：脱敏错误码、错误分类、HTTP 状态、retryable、用户可读错误文案。
- 计数类字段：表数量、书籍数量、孤儿文件数量、缺失文件数量、日志行数。

## 禁止字段

任何诊断日志、诊断包或错误详情复制都不得包含：

- API Key、Authorization header、Bearer token、Keychain 原始内容。
- 完整 prompt、system prompt、messages 数组、聊天全文。
- 章节正文、分页文本、选中文字、原文引用、笔记正文、读后交流正文。
- 原始 PDF/MOBI 文件内容、base64 文件内容、备份原始文件内容。
- SQLite `raw_json` 原文、完整浏览器 JSON 备份、完整目录式备份 manifest。
- 用户文件绝对路径，除非后续明确只保留 App 数据目录下的相对路径。

## 脱敏规则

Rust 侧当前实现：

- 命中敏感 key 时直接写为 `[redacted]`。
- `apiKey`、`authorization`、`password`、`secret`、`credential`、`privateKey` 等密钥类字段会被整体过滤。
- `prompt`、`system`、`messages`、`content`、`text`、`pageText`、`selectedText`、`quote`、`excerpt`、`note`、`chat`、`conversation` 等正文级字段会被整体过滤。
- URL 字段只保留 origin，例如 `https://api.example.com/v1/chat` 记录为 `https://api.example.com`。
- 字符串内出现 `sk-...` 或 `Bearer ...` 形态时会替换为 `[redacted]`。
- 单个字符串最多保留 500 个字符，超出后追加 `[truncated]` 标记。
- 日志 category、event 和字段名会移除控制字符。

## 新增字段审核

新增任何诊断字段前，先回答：

- 这个字段能否定位问题？
- 它是否可能包含用户正文、笔记、聊天、prompt 或密钥？
- 能不能用计数、状态码、错误码、origin、布尔值替代原文？
- 是否需要同步更新本文档、`BACKEND_DEVELOPMENT_STANDARDS.md` 和 `SECURITY_PRIVACY_AUDIT.md`？

默认原则：能用摘要不用原文，能用 origin 不用完整 URL，能用错误码不用供应商原始错误体。

## P6.6 收口状态

P6.6 基础版已完成。后续如果诊断包需要包含更多文件，应提高 packageVersion，并继续遵守本文档的字段允许清单、禁止清单和二次脱敏规则。
