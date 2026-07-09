# Public Readiness Changes

> Last updated: 2026-07-07

这份文档记录读伴在准备 public alpha 前补上的信任、安全和公开仓库成熟度改动。它不是路线图，也不是完整开发日志；重点是说明最近补了什么、为什么补、这些改动解决了哪些公开前风险。

## 背景

读伴当前保留浏览器 MVP，同时已接入 Tauri 桌面形态，是本地优先、BYOK 的 AI 伴读应用。公开前最需要先讲清楚三件事：

- 用户数据默认存在哪里。
- 使用 AI 时，哪些内容会发送给第三方模型服务商。
- API Key、自定义 Base URL、浏览器 IndexedDB 和桌面 Keychain 存储的安全边界。

在此基础上，仓库也需要补齐公开项目常见的基础文件，让使用者、贡献者和安全报告者有明确入口。

## 已完成的产品内改动

### 应用内隐私说明页

新增 `src/components/Privacy.jsx`，作为应用内的隐私说明页面。

页面分别说明：

- 书籍文件：浏览器版原始 PDF/MOBI、提取文本和封面缓存存于 IndexedDB；桌面版原始文件、封面文件存入 App 数据目录，元数据、分页文本、非敏感设置、AI 排版缓存、导读、问答和读后交流索引存入 SQLite；AI 导读、问答和读后交流会发送必要文本给当前模型服务商。
- API Key：浏览器版保存在 IndexedDB，桌面版保存在系统 Keychain；测试连接和调用 AI 时会发给当前模型服务商；自定义 Base URL 时会发给用户填写的地址。
- 笔记与高亮：原文摘录、页码、高亮位置、笔记正文和 AI 回答摘录保存在本地；用户选择带入读后交流上下文时会发送给模型服务商。
- 聊天记录：伴读问答和读后交流记录保存在本地；继续对话时会发送最近历史消息给模型服务商。

入口放在设置页的「隐私与数据」区域，不再放在顶部主导航里。这样主导航保持轻量，隐私说明仍然在用户配置 API Key 和数据前可见。

### 设置页 BYOK 风险说明

`src/components/Settings.jsx` 增加了「BYOK 安全提醒」。

说明内容包括：

- 浏览器版直连模型服务，桌面版通过本地 Rust command 代理模型请求。
- API Key 在浏览器版保存在当前浏览器 IndexedDB 中，在桌面版保存在系统 Keychain。
- IndexedDB 不是硬件级安全存储；系统 Keychain 能提高桌面版密钥存储安全性，但仍依赖可信设备环境。
- 不可信设备、浏览器扩展、同源脚本或本机恶意软件仍可能读取本地数据。
- 建议使用单独 API Key，并在模型服务商后台设置额度或限额。

### 自定义 Base URL 二次确认

OpenAI-compatible 配置现在会在这些操作前检查 Base URL：

- 保存设置。
- 从 TXT 导入 AI 配置。
- 测试连接。

如果当前供应商是 OpenAI-compatible，且已填写 API Key，设置页会解析 Base URL：

- 官方 HTTPS origin 直接通过。
- 非官方 origin 或非 HTTPS 地址会弹窗确认。
- 非法 URL 或非 http/https 协议会阻止操作并显示错误。

弹窗明确提示：测试连接和生成内容时，API Key 与必要阅读文本会发送到该地址，读伴无法验证该服务是否可信。

## 已完成的公开仓库文件

### LICENSE

新增根目录 `LICENSE`，采用 MIT License。

当前版权主体写为 `Duban contributors`。如果后续需要改成个人名、组织名或更严格的许可证，可以单独调整。

### PRIVACY.md

新增根目录 `PRIVACY.md`，作为仓库级隐私政策。

它补充说明：

- 本地 IndexedDB 存储内容。
- AI 请求会发送哪些数据。
- BYOK 和 API Key 的安全边界。
- 自定义 Base URL 风险。
- 当前不会主动收集的内容。
- 清空数据和第三方服务政策边界。

### SECURITY.md

新增根目录 `SECURITY.md`，说明：

- 当前只支持默认分支最新版本。
- 安全问题报告方式。
- 哪些问题属于 in scope。
- 哪些问题通常 out of scope。
- API Key、本地存储、自定义 Base URL 和依赖审计的安全设计说明。

### CONTRIBUTING.md

新增根目录 `CONTRIBUTING.md`，说明：

- 本地开发命令。
- 项目原则。
- PR 前检查清单。
- 隐私和安全护栏。
- 涉及数据流、API Key、上传文件、导出行为时需要同步更新哪些文档。

### package metadata

`package.json` 和 `package-lock.json` 增加根包 license 元数据：`MIT`。

## 验证记录

已运行并通过：

```bash
npm install --package-lock-only --ignore-scripts
npm run build:formal
```

之前也用本地浏览器确认过：

- 设置页能看到 BYOK 安全提醒。
- 设置页能进入应用内隐私说明。
- 隐私说明页包含书籍、API Key、笔记与高亮、聊天记录四类说明。

## P6.5 安全与隐私加固

2026-07-07 新增并更新 [SECURITY_PRIVACY_AUDIT.md](./SECURITY_PRIVACY_AUDIT.md)，作为 P6.5 安全与隐私加固的专项记录。

本轮已完成：

- `npm audit --json`：0 个漏洞，high/critical 均为 0。
- `cargo tree -d`：记录 Rust 重复依赖树，作为后续收敛和 CI 检查基线。
- `src-tauri/capabilities/default.json`：当前只有 `core:default` 和 event listen/unlisten 权限。
- `src-tauri/tauri.conf.json`：asset protocol scope 限制为 `$APPDATA/files/**`。
- Tauri command 暴露面已盘点，存储 command 已补 key、book id、外部备份路径和本地文件相对路径校验。
- Tauri 正式 CSP、dev CSP 和基础安全头已写入配置。
- Web 静态部署新增 `public/_headers`。
- 新增 `scripts/security_scan.mjs` 和 `npm run security:scan`，并并入 `npm run security:audit`。
- `SECURITY.md` 与 `PRIVACY.md` 已同步浏览器版和桌面版边界。

仍需继续：

- 安装并启用 `cargo audit` 或在 CI 中运行 RustSec 漏洞审计。
- 新增供应商、新增 Tauri command、新增日志/诊断字段时继续复查 CSP、输入校验和敏感信息边界。

## 尚未处理的公开前事项

这些不属于本轮改动，但仍建议在正式 public 前继续处理：

- 继续按 [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md) 补生产级能力；P6.1-P6.6 基础版已完成，后续重点转向 P6.7 正式 macOS 发布包、迁移夹具、压缩归档、备份签名、自动更新和 CI。
- 为 public alpha 增加 issue 模板和基础 CI。
