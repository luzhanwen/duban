# Security Policy

Last updated: 2026-06-18

读伴当前是纯前端、本地优先、BYOK 的 public alpha 项目。安全边界主要集中在浏览器本地存储、API Key 处理、文件解析、第三方模型请求和前端渲染。

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
- 用户提交、上传或分发没有版权许可的书籍文件。

## Security Design Notes

- 读伴没有自己的后端，默认不接收用户书籍、笔记、聊天记录或 API Key。
- API Key 保存在浏览器 IndexedDB 中，不应视为硬件级安全存储。
- OpenAI-compatible 自定义 Base URL 会在保存、导入或测试前做风险确认。
- 请避免在 issue、PR、测试文件、截图和文档中提交真实 API Key 或版权受限书籍。

## Dependency Security

公开发布前建议运行：

```bash
npm audit --omit=dev
npm audit
npm run build:formal
```

生产依赖漏洞应优先处理。开发依赖漏洞需要根据影响面评估，尤其是构建工具、插件和包管理链路。
