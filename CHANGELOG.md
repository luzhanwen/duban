# Changelog

读伴所有值得用户关注的变化记录在这里。版本规则见 [docs/VERSIONING.md](docs/VERSIONING.md)。

## [Unreleased]

目标版本：`待定`

## [0.2.0-alpha.3] - 2026-07-11

### Added

- 接入 Tauri updater/process 客户端基础、最小权限和正式通道更新服务。
- 新增 updater 预检、安全私钥扫描和自动更新架构文档。
- 内置 Alpha updater 公钥和通道地址，发布流水线生成并校验 signed updater archive/signature。
- 正式桌面设置页新增软件更新入口、版本说明、下载进度、安装前恢复点、安全重启和手动下载兜底。

### Known limitations

- Alpha.3 -> Alpha.4 实机升级、坏签名/断网/中断回归和 updater 私钥离线备份仍待 P6.8.5 完成。

## [0.2.0-alpha.2] - 2026-07-11

### Added

- 首个计划公开下载的 Alpha，完整包含 `0.2.0-alpha.1` 记录的桌面存储、备份、AI transport、诊断、环境隔离、历史 PDF 兼容和发布自动化能力。

### Fixed

- GitHub Actions 的两个 release job 会显式重新抓取远端 annotated tag object，避免 checkout 将触发 SHA 暂时表现为 lightweight tag 并误阻断发布。

### Known limitations

- `v0.2.0-alpha.1` 在 tagged source 校验阶段失败，未进入签名 job，也未创建 GitHub Release；该 tag 保持不可变。
- 当前正式 macOS 构建仅提供 Apple Silicon `arm64`。
- 自动更新、完整升级 fixtures、压缩备份归档和备份签名仍待后续阶段。

## [0.2.0-alpha.1] - 2026-07-10

### Added

- Tauri macOS 桌面 App、本地 SQLite 与 App 数据目录存储。
- PDF/MOBI 书库、阅读进度、笔记、聊天、导读缓存和目录式备份。
- 备份预览、校验报告、合并/覆盖导入、sha256 和失败回滚。
- 系统 Keychain API Key 存储、Rust AI transport、请求取消、预算保护和调用诊断。
- 本地健康检查、脱敏诊断包、CI、QA fixtures 和 macOS 签名/公证工具链。
- SemVer 版本同步、校验和升版脚本。
- 设置页和诊断面板中的 App version、发布通道、Git commit/dirty、SQLite schema 与备份格式展示及复制入口。
- Tag 驱动的 macOS GitHub Release 流水线，连接 Developer ID 签名、Apple 公证、staple、Gatekeeper、manifest/checksum 和 artifact 上传。

### Changed

- 测试与正式桌面环境使用独立 bundle identifier、SQLite/files/backups/logs 目录和 Keychain service。
- `npm run tauri:dev` 固定进入 `com.duban.reader.test`，正式环境只能由 formal 配置启动。
- 正式打包同时保留 `.app` 和 `.dmg`，并在公证前验证两者签名。

### Fixed

- 修复连续 AI 请求可能重复触发系统 Keychain 密码弹窗的问题。
- 修复 macOS `asset://` 状态 `0` 导致历史 PDF 无法在 PDF.js 打开的问题；当前等待桌面人工回归。
- 修复历史开发数据误写入正式 App 数据目录的问题，并完成测试数据归位与回滚快照。

### Security

- 增加 CSP、安全头、Tauri command 输入校验、路径边界和敏感信息扫描。
- 备份、日志、诊断和错误详情不包含 API Key、书籍正文或私密内容全文。

### Known limitations

- `v0.2.0-alpha.1` 的首次 tag workflow 在签名前因 runner 未保留 annotated tag object 而停止，没有生成安装包或 GitHub Release。
- 当前正式 macOS 构建仅验证 Apple Silicon `arm64`。
- 自动更新、完整升级 fixtures、压缩备份归档和备份签名仍待后续阶段。

## [0.1.0] - 2026-06-18

- 历史公开准备 tag，指向提交 `be4fb57`。
- 该 tag 早于当前 Tauri/SQLite/正式发布体系，保持不可变，不代表当前代码状态。
