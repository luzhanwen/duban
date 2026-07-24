# 读伴文档索引

> 最后更新：2026-07-24
>
> 当前基线：App `0.2.0-alpha.6` 已发布、桌面 schema `10`、目录备份 `v3`；P6 已冻结，P7 已完成。Alpha.6 修复 macOS 更新清单连接问题，旧版需手动安装一次，再从 Alpha.6 开始验收 App 内升级。

本目录同时保存现行规范、阶段计划和历史记录。接手项目时先看本页的分类，不要把历史阶段文档中的“下一步”当成当前任务。

## 首次接手

按以下顺序读取即可，不需要从头阅读全部 1.2 万行历史：

1. [ROADMAP.md](./ROADMAP.md)：当前阶段、优先级和真正的下一步。
2. [PROJECT_NOTES.md](./PROJECT_NOTES.md)：产品原则、架构共识、数据概念和当前限制。
3. 当前任务对应的专项规范，按下面的分类选择。
4. 需要理解历史原因时，再查 [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md)。
5. 让 AI 接手时使用 [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md)。

## 现行文档

### 项目与实施

| 文档 | 职责 | 维护状态 |
| --- | --- | --- |
| [ROADMAP.md](./ROADMAP.md) | 当前路线、阶段状态、优先级、Backlog | 持续维护，不写流水账 |
| [PROJECT_NOTES.md](./PROJECT_NOTES.md) | 产品与架构共识、当前数据概念、重要决策 | 持续维护；已有历史日志保留，但不再重复追加每次实施记录 |
| [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md) | 全项目唯一的按日期实施日志 | 每次完成工作都更新 |
| [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md) | 后续 AI 接手、专项任务和最终汇报模板 | 协作方式变化时更新 |
| [COMPANION_ACTIVE_READING_PLAN.md](./COMPANION_ACTIVE_READING_PLAN.md) | P7 连续陪读、按需上下文、记忆与验收 | P7 当前专项来源 |

### 工程与产品规范

| 文档 | 职责 |
| --- | --- |
| [BACKEND_DEVELOPMENT_STANDARDS.md](./BACKEND_DEVELOPMENT_STANDARDS.md) | Tauri/Rust、SQLite、Keychain、备份、AI transport 工程标准 |
| [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md) | 桌面表结构、迁移、App 数据目录与备份边界 |
| [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md) | 开书契约、统一陪读上下文、阅读边界与缓存来源 |
| [PROMPT_WRITING_STANDARDS.md](./PROMPT_WRITING_STANDARDS.md) | 产品 prompt、文风、防剧透和输出验收标准 |
| [wordSubstitutions.md](../src/prompts/wordSubstitutions.md) | AI 用词替代偏好的运行时唯一主文件 |
| [UI_DESIGN_STANDARDS.md](./UI_DESIGN_STANDARDS.md) | 视觉、布局、组件层级、响应式和动效护栏 |
| [SECURITY_PRIVACY_AUDIT.md](./SECURITY_PRIVACY_AUDIT.md) | 权限、依赖、CSP、敏感信息和安全复查基线 |
| [DIAGNOSTICS_PRIVACY_SPEC.md](./DIAGNOSTICS_PRIVACY_SPEC.md) | 本地日志、诊断包、错误详情和隐私过滤规则 |
| [QA_MATRIX.md](./QA_MATRIX.md) | Smoke Test、模块回归、升级恢复、fixtures 和验收证据 |
| [P7_RELEASE_CHECKLIST.md](./P7_RELEASE_CHECKLIST.md) | P7 候选包自动检查、固定样本、桌面人工验收和发布阻断条件 |

### 发布与更新

这些文件职责相邻但不重复，不合并：

| 文档 | 职责 |
| --- | --- |
| [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) | 发布规则、构建通道、产物和手动故障恢复流程 |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | 每次发布当天逐项执行的清单 |
| [VERSIONING.md](./VERSIONING.md) | SemVer、单一版本源、Git tag 和 Changelog 规则 |
| [GITHUB_RELEASE_AUTOMATION.md](./GITHUB_RELEASE_AUTOMATION.md) | GitHub Environment、Secrets、签名、公证和自动发布 |
| [AUTO_UPDATE_ARCHITECTURE.md](./AUTO_UPDATE_ARCHITECTURE.md) | updater 信任根、通道 manifest、数据保护和升级验收 |

## 未来阶段

| 文档 | 状态 |
| --- | --- |
| [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md) | P8 方向已确定，等待 P7 当前主线完成后启动 |
| [CLOUD_BACKEND_PLAN.md](./CLOUD_BACKEND_PLAN.md) | P9 方向已确定，P9 前不进入云端实现 |

## 已完成阶段档案

这些文件保留决策背景，不再承担当前路线或现行规范。遇到冲突时，以 `ROADMAP`、现行专项规范和代码为准。

| 文档 | 档案内容 | 当前替代来源 |
| --- | --- | --- |
| [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md) | P6.1-P6.12 生产化实施与冻结记录 | 发布、QA、安全各现行规范 |
| [PUBLIC_READINESS_CHANGES.md](./PUBLIC_READINESS_CHANGES.md) | 首轮 Public Alpha 信任与仓库成熟度改动 | `PRIVACY.md`、`SECURITY.md`、Release Checklist |
| [OPENING_COMPANION_ONBOARDING.md](./OPENING_COMPANION_ONBOARDING.md) | 旧开书设定流程的设计与实现历史 | P7 计划、阅读上下文规范 |
| [COMPANION_UI_AUDIT.md](./COMPANION_UI_AUDIT.md) | P7.8 界面审计、方案比较和定稿过程 | UI 设计标准、P7 计划 |
| [UI_CHANGELOG.md](./UI_CHANGELOG.md) | 2026-07-22 以前的 UI 试错与演进历史 | UI 设计标准 + App 实施日志 |

## 维护规则

- 每次完成工作，只在 [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md) 追加一份实施记录，写清“为什么、改了什么、验证、限制”。
- 改变当前阶段或优先级时更新 `ROADMAP.md`；改变产品原则、架构或数据边界时更新 `PROJECT_NOTES.md`。
- 改 UI 规则更新 `UI_DESIGN_STANDARDS.md`，但不再向已冻结的 `UI_CHANGELOG.md` 追加同一份流水账。
- P6、P7.8 或旧开书流程的历史文档只做事实纠错，不继续承载新阶段计划。
- 版本号以 `package.json` 为唯一人工源；schema 与 backup version 以 Rust 常量为准。普通文档尽量引用来源，不复制“当前版本”。
- 新增具体词语偏好只修改 `src/prompts/wordSubstitutions.md`，不要在组件、业务 prompt 或输出后处理里另建名单。
- 新增 Markdown 文档必须挂到本索引，并说明它是“现行规范、当前计划、未来计划”还是“历史档案”。
- 修改文档后运行 `npm run docs:audit` 和 `git diff --check`；基础 CI 也会自动执行文档审计。

## 当前治理结论

- 三套流水账已经明确归一：未来实施记录只进入 `APP_EVOLUTION_LOG.md`；`PROJECT_NOTES.md` 保留共识和历史，`UI_CHANGELOG.md` 冻结为档案。
- P6 已完成并冻结，`PRODUCTION_UPGRADE_PLAN.md` 不再被描述为“剩余生产级路线”。
- P7.1-P7.11 已完成并进入维护状态；下一步是 P8.1 移动技术验证，P9 尚未启动。
- 发布相关五份文档职责不同，保持拆分比强行合并更清楚。
- 开书流程和 P7.8 审计文档保留历史价值，但已退出首次接手必读路径。
