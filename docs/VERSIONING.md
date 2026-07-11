# 读伴版本管理规范

> 最后更新：2026-07-11

本文档定义读伴的 App 版本、Git tag、发布通道、数据兼容版本和升版流程。版本相关改动必须同时遵守 [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) 与 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。

## 当前版本

- 当前开发版本：`0.2.0-alpha.2`
- `v0.2.0-alpha.1`：首次自动发布失败 tag，签名前停止且没有 GitHub Release；保持不可变。
- 上一个历史 tag：`v0.1.0`，指向旧提交 `be4fb57`，不得移动、覆盖或删除。
- 当前阶段：内部 Alpha；不得仅凭版本号宣称可公开稳定发布。

## 单一版本源

`package.json` 的 `version` 是唯一允许人工修改的 App 版本源。

- `src-tauri/tauri.conf.json` 的数字版本和 macOS `bundleVersion` 由脚本从 `package.json` 派生。
- `package-lock.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 由版本脚本同步。
- 禁止手工只改其中一个文件。

可用命令：

```bash
npm run version:check
npm run version:set -- 0.2.0-alpha.2
npm run version:bump -- prerelease
npm run version:bump -- patch
npm run version:bump -- minor
npm run version:bump -- preminor beta
```

这些命令只修改版本文件，不创建 Git tag、不提交、不推送。升版后仍要人工更新 `CHANGELOG.md` 和发布说明。

## SemVer 规则

读伴在 `1.0.0` 前使用 Semantic Versioning：`MAJOR.MINOR.PATCH[-PRERELEASE]`。

| 变化 | 示例 | 使用条件 |
| --- | --- | --- |
| prerelease | `0.2.0-alpha.1` → `0.2.0-alpha.2` | 同一开发阶段继续迭代 |
| patch | `0.2.0` → `0.2.1` | 向后兼容的 Bug 修复 |
| minor | `0.2.1` → `0.3.0` | 新功能、明显体验变化或兼容升级 |
| major | `0.x` → `1.0.0` | 首个长期稳定版；之后用于破坏性变化 |

预发布阶段：

```text
alpha.N  内部开发和本机验证
beta.N   少量外部用户验证，核心数据路径已稳定
rc.N     发布候选，功能冻结，只修发布阻塞问题
稳定版    去掉预发布后缀，例如 0.2.0
```

从 `0.2.0-rc.1` 晋升到 `0.2.0` 时使用显式 `version:set`，不得用 patch bump 生成 `0.2.1`。

## 不同版本维度

以下数字独立演进，禁止互相替代：

| 维度 | 当前值 | 责任 |
| --- | --- | --- |
| App version | `0.2.0-alpha.1` | 用户版本、构建产物、Git tag |
| Git commit | 当前短 SHA | 精确定位源码和构建 |
| SQLite schema | `9` | 本地数据库迁移 |
| Backup format | `3` | 备份导入兼容性 |

macOS bundle 字段只能使用数字和点，因此预发布后缀不直接写入 Info.plist：

| App SemVer | CFBundleShortVersionString | CFBundleVersion |
| --- | --- | --- |
| `0.2.0-alpha.1` | `0.2.0` | `0.2.101` |
| `0.2.0-beta.1` | `0.2.0` | `0.2.301` |
| `0.2.0-rc.1` | `0.2.0` | `0.2.501` |
| `0.2.0` | `0.2.0` | `0.2.900` |

预发布序号限制为 `1-99`。该映射保证同一 patch 内 alpha → beta → rc → stable 单调递增，进入下一个 patch/minor/major 后仍继续递增。

App 升版不要求提升 schema；只有数据库结构或迁移逻辑变化才提升 `CURRENT_SCHEMA_VERSION`。只有备份格式契约变化才提升 `BACKUP_VERSION`。

## App 内构建身份

设置页分类导航显示简版版本信息，「诊断 -> 版本与构建」显示并可复制完整构建身份：

- App version
- formal/test channel
- browser/tauri runtime
- 完整 Git commit 和 12 位短 commit
- 工作区是否为 `dirty`
- SQLite schema version
- Backup format version

这些值由 Vite 构建时统一注入：App version 读取 `package.json`；schema/backup version 读取 `src-tauri/src/storage.rs`；commit 优先读取 `DUBAN_BUILD_COMMIT`、CI 的 `GITHUB_SHA`，否则读取当前 Git HEAD。`DUBAN_BUILD_DIRTY` 可在受控构建环境显式覆盖 dirty 状态。

正式候选包必须在诊断页满足：channel 为 `formal`、commit 与目标发布提交一致、没有 `dirty`。本地未提交代码构建显示 `dirty` 属于预期行为，不得作为正式候选包发布。

## Git 与分支

- `main`：保持可发布或已发布状态。
- `codex/*`、`feat/*`、`fix/*`：短期任务分支，通过 PR 合入。
- `release/vX.Y.Z`：仅在 RC 冻结期按需创建，不长期维护。
- 不再把长期 `develop` 分支作为版本来源；版本只由源码和不可变 tag 确定。

提交类型沿用：`feat`、`fix`、`docs`、`test`、`refactor`、`chore`、`release`。

## Tag 规则

- 预发布 tag：`v0.2.0-alpha.1`、`v0.2.0-beta.1`、`v0.2.0-rc.1`。
- 稳定 tag：`v0.2.0`。
- tag 必须指向已通过 CI、release preflight 和对应发布检查的提交。
- tag 一旦推送即不可移动或复用；发现问题必须升到下一个版本。
- 本地开发构建、失败候选包和未完成 smoke test 的提交不得创建 release tag。

## Artifact 命名

通用格式：

```text
读伴_<version>_<channel>_<arch>_<kind>.dmg
duban-v<version>-<channel>-<arch>-<kind>-manifest.json
duban-v<version>-<channel>-<arch>-<kind>-checksums.txt
duban-v<version>-<channel>-<arch>-<kind>-notary-log.json
```

示例：

```text
读伴_0.2.0-alpha.1_formal_arm64_signed.dmg
```

`test/formal` 表示运行环境和数据通道；`alpha/beta/rc` 属于 App 版本成熟度，两者不能混用。

## Changelog

- 根目录 `CHANGELOG.md` 是用户可读的版本变化来源。
- 开发中的变化写入 `[Unreleased]`。
- 创建 tag 前，把 `[Unreleased]` 内容整理到对应版本和日期下，再新建空的 `[Unreleased]`。
- 至少记录 `Added`、`Changed`、`Fixed`、`Security`、`Known limitations` 中适用的部分。
- 数据迁移、备份兼容、Keychain、正式/测试隔离和已知数据风险必须明确写出。

## 发布顺序

1. 在 `main` 的干净工作区确认目标版本，执行 `npm run release:check -- candidate`。
2. 如需升版，执行 `npm run version:set -- <version>` 或 `version:bump`；脚本会同步 Unreleased 目标。
3. 执行 `npm run release:prepare`，审阅并提交冻结后的 `CHANGELOG.md`。
4. 完成人工 smoke test、数据升级回归和本地质量检查。
5. 推送 release commit 到 `main`，执行 `npm run release:check -- tag-ready`。
6. 创建 annotated tag，例如 `git tag -a v0.2.0-alpha.1 -m "读伴 0.2.0-alpha.1"`。
7. 推送 tag；GitHub Actions 自动校验、签名、公证、staple、Gatekeeper、manifest/checksum 和 release notes。
8. 自动化先创建 draft，全部资产上传成功后发布 GitHub Release；预发布版本标记为 prerelease。

版本脚本不得自动创建或移动第 6 步的 tag。完整 GitHub Environment/Secrets 配置见 [GITHUB_RELEASE_AUTOMATION.md](./GITHUB_RELEASE_AUTOMATION.md)。

## 首次落地验证

`0.2.0-alpha.1` 版本管理基础在 2026-07-10 完成以下验证：

- 非法 SemVer 不会写入版本文件。
- `prerelease` 可在 `alpha.1` 与 `alpha.2` 之间正确同步 npm、Cargo、Tauri 和 lockfile，且不会创建 Git tag。
- 前端构建、Rust check/test、release preflight、安全扫描和 QA fixtures 校验通过。
- 正式 `.app` 构建通过，包内版本为 `0.2.0 (0.2.101)`，identifier 为 `com.duban.reader`。
