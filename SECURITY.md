# Security Policy

Last updated: 2026-07-07

读伴当前保留浏览器 MVP，同时已有 Tauri 桌面版。本项目是本地优先、BYOK 的 public alpha 项目，没有读伴自己的云端业务服务器。安全边界主要集中在浏览器 IndexedDB、桌面 SQLite/App 数据目录、系统 Keychain、Tauri command、文件解析、第三方模型请求、CSP 和前端渲染。

## Supported Versions

当前只维护默认分支上的最新版本。早期提交、个人本地修改、第三方部署和 fork 不提供单独安全支持。

## Reporting A Vulnerability

请不要在公开 issue 中直接披露可利用细节、真实 API Key、私有书籍内容、日志截图或复现用敏感文件。

推荐流程：

1. 如果仓库开启了 GitHub private vulnerability reporting，请优先使用该渠道。
2. 如果没有私密报告渠道，请开一个不含攻击细节的 issue，说明你希望报告安全问题，并等待维护者提供私密联系方式。
3. 报告中尽量包含影响范围、复现步骤、受影响文件或功能、浏览器版本、是否需要真实第三方服务参与。

## In Scope

欢迎报告这些类型的问题：

- API Key 被意外写入代码、构建产物、日志或导出之外的位置。
- 自定义 Base URL、供应商切换或 TXT 配置导入导致的密钥误发风险。
- 桌面版 Keychain、SQLite、目录式备份或 AI 调用诊断意外泄露 API Key 或正文级隐私。
- Tauri command 输入校验、文件路径边界、备份导入路径或 asset protocol scope 绕过。
- XSS、HTML 注入、Markdown 渲染绕过或恶意书籍内容触发脚本执行。
- PDF/MOBI 文件解析导致的浏览器崩溃、无限循环、过度内存占用或拒绝服务。
- IndexedDB 数据误删、跨书籍串读、跨阅读项泄露或清空数据不完整。
- 依赖漏洞、构建链风险或开发服务器暴露敏感文件。

## Out Of Scope

以下问题通常不视为读伴自身安全漏洞：

- 模型回答不准确、幻觉或不符合预期。
- 第三方模型服务商自己的隐私政策、数据保留或账号安全问题。
- 用户主动把 API Key 发给不可信第三方服务商后，该第三方的后续行为。
- 本机已经被恶意软件控制、浏览器配置文件被直接读取、或用户安装了恶意浏览器扩展。
- 本机操作系统账户、Keychain 或文件系统权限已经被攻击者完全控制。
- 用户提交、上传或分发没有版权许可的书籍文件。

## Security Design Notes

- 读伴没有自己的云端后端，默认不接收用户书籍、笔记、聊天记录或 API Key。
- 浏览器版 API Key 保存在 IndexedDB 中，不应视为硬件级安全存储。
- 桌面版 API Key 保存在系统 Keychain；SQLite、目录式备份、错误文案和 AI 调用诊断不得保存 API Key。
- 桌面版本地数据使用 SQLite + App 数据目录文件，备份为 `manifest.json + files/` 目录式结构，默认不包含 API Key。
- Tauri asset protocol scope 限制为 `$APPDATA/files/**`。
- Tauri 正式 CSP 和 Web 静态部署 `_headers` 已配置基础安全头。
- OpenAI-compatible 自定义 Base URL 会在保存、导入或测试前做风险确认。
- 请避免在 issue、PR、测试文件、截图和文档中提交真实 API Key 或版权受限书籍。

## Dependency Security

公开发布前建议运行：

```bash
npm run security:scan
npm run security:audit
npm run build:formal
cd src-tauri && cargo test && cargo check
```

`npm run security:audit` 当前包括 `npm audit`、Rust 重复依赖树检查和本地安全扫描；它还没有包含 RustSec 数据库审计。后续 CI 或发布机应安装并运行 `cargo audit`。

生产依赖漏洞应优先处理。开发依赖漏洞需要根据影响面评估，尤其是构建工具、插件和包管理链路。
