# 读伴文档索引

> 最后更新：2026-07-11

这个目录保存「读伴」的项目说明、路线图、UI 标准和开发日志。后续维护文档时，先看这份索引，再决定内容应该写到哪里。

## 文档分工

| 文档 | 用途 | 适合记录 |
| --- | --- | --- |
| [PROJECT_NOTES.md](./PROJECT_NOTES.md) | 项目总记录 | 产品愿景、核心流程、已确认需求、架构共识、数据结构、完整开发日志、已知限制 |
| [ROADMAP.md](./ROADMAP.md) | 路线图 | 当前状态、阶段目标、优先级、Backlog、暂不优先事项 |
| [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md) | App 化专项路线与实施日志 | 从纯前端到桌面 App 的阶段路线、每次工程推进、验证结果和后续限制 |
| [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md) | 生产级升级路线 | 数据可靠、正式发布、安全隐私、诊断、CI、QA、自动更新和 public alpha 的剩余步骤 |
| [BACKEND_DEVELOPMENT_STANDARDS.md](./BACKEND_DEVELOPMENT_STANDARDS.md) | 后端开发标准 | Tauri Rust 本地后端、SQLite、Keychain、备份、AI transport、测试验证和文档同步标准 |
| [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md) | 后续 AI 接手提示词 | 新 AI 会话接手项目、后端修改、迁移、备份、Keychain、代码审查和最终汇报的可复制提示词 |
| [PROMPT_WRITING_STANDARDS.md](./PROMPT_WRITING_STANDARDS.md) | 产品提示词编写规范 | 产品内系统提示词、导读/问答/读后交流 prompt、AI 文风、慎用句式和验收清单 |
| [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md) | 桌面存储 Schema | Tauri 桌面版 SQLite 表、App 数据目录、迁移顺序和结构化存储边界 |
| [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md) | 开书契约上下文 | 统一上下文构建函数、字段含义、兼容策略、三类 prompt 接入记录、读伴记忆数据层 |
| [PUBLIC_READINESS_CHANGES.md](./PUBLIC_READINESS_CHANGES.md) | 公开前成熟度记录 | 隐私说明、BYOK 风险提示、Base URL 确认、公开仓库基础文件、安全边界 |
| [SECURITY_PRIVACY_AUDIT.md](./SECURITY_PRIVACY_AUDIT.md) | 安全与隐私审计记录 | P6.5 依赖审计、Tauri 权限、command 暴露面、CSP 和敏感信息边界 |
| [DIAGNOSTICS_PRIVACY_SPEC.md](./DIAGNOSTICS_PRIVACY_SPEC.md) | 诊断与隐私过滤规范 | P6.6 本地日志、诊断包、错误详情复制和健康检查的字段边界与脱敏规则 |
| [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) | 发布流程 | P6.7 发布配置、构建通道、artifact 命名、校验和与 release notes 约定 |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | 发布检查清单 | 每次发布前的本地检查、CI、local/signed 包、smoke test、release notes 和发布后确认 |
| [VERSIONING.md](./VERSIONING.md) | 版本管理规范 | SemVer、单一版本源、升版命令、Git tag、Changelog 和 App/schema/backup 版本边界 |
| [GITHUB_RELEASE_AUTOMATION.md](./GITHUB_RELEASE_AUTOMATION.md) | GitHub Release 自动发布 | Environment/Secrets、tag 触发、Developer ID 签名、公证、artifact 上传和失败恢复 |
| [AUTO_UPDATE_ARCHITECTURE.md](./AUTO_UPDATE_ARCHITECTURE.md) | 自动更新架构与操作规范 | updater 信任根、Alpha/Stable 通道、发布产物、manifest、数据保护和双版本验收 |
| [QA_MATRIX.md](./QA_MATRIX.md) | QA 矩阵与回归样本 | P6.10 smoke test、核心回归、升级恢复、环境维度和样本策略 |
| [UI_DESIGN_STANDARDS.md](./UI_DESIGN_STANDARDS.md) | UI 设计标准 | 视觉气质、色彩字体、布局比例、卡片边界、页面过渡、动效规范、验收清单 |
| [UI_CHANGELOG.md](./UI_CHANGELOG.md) | UI/体验更新日志 | 书架、阅读器、笔记、品牌视觉、交互细节等前端体验改动 |
| [OPENING_COMPANION_ONBOARDING.md](./OPENING_COMPANION_ONBOARDING.md) | 开书读伴设定流程 | 开书设置改为多轮设定读伴对话、开书记忆和开书地图降级的实现边界 |

## 阅读顺序

1. 想快速理解项目方向：先读 [ROADMAP.md](./ROADMAP.md)。
2. 想接手开发或理解历史决策：读 [PROJECT_NOTES.md](./PROJECT_NOTES.md)。
3. 要推进纯前端到桌面 App 的迁移：读 [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md)。
4. 要推进正式分发、长期可靠、CI、QA、自动更新或 public alpha：读 [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md)。
5. 要修改 Tauri/Rust、本地后端、AI transport、Keychain 或备份：读 [BACKEND_DEVELOPMENT_STANDARDS.md](./BACKEND_DEVELOPMENT_STANDARDS.md)。
6. 要修改桌面存储、SQLite 或数据迁移：读 [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)。
7. 要让后续 AI 接手任务：复制 [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md) 中对应提示词。
8. 要修改产品内系统提示词、导读/问答/读后交流 prompt 或模型输出文风：先读 [PROMPT_WRITING_STANDARDS.md](./PROMPT_WRITING_STANDARDS.md)。
9. 要维护开书契约、导读/问答/读后交流 prompt 或读伴记忆：读 [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md)。
10. 要检查公开前信任、安全和项目成熟度补项：读 [PUBLIC_READINESS_CHANGES.md](./PUBLIC_READINESS_CHANGES.md)。
11. 要推进 P6.5 安全与隐私加固：读 [SECURITY_PRIVACY_AUDIT.md](./SECURITY_PRIVACY_AUDIT.md)。
12. 要推进 P6.6 本地诊断、日志、诊断包或错误详情复制：读 [DIAGNOSTICS_PRIVACY_SPEC.md](./DIAGNOSTICS_PRIVACY_SPEC.md)。
13. 要推进 P6.7 正式发布包、artifact、校验和或 release notes：读 [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)。
14. 要发布前逐项确认：读 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。
15. 要做发布前 QA、smoke test 或回归样本：读 [QA_MATRIX.md](./QA_MATRIX.md)。
16. 要升版、创建 tag 或维护 Changelog：读 [VERSIONING.md](./VERSIONING.md)。
17. 要配置或执行 tag 驱动的签名、公证与 GitHub Release：读 [GITHUB_RELEASE_AUTOMATION.md](./GITHUB_RELEASE_AUTOMATION.md)。
18. 要推进 Tauri updater、更新密钥、通道 manifest 或升级验收：读 [AUTO_UPDATE_ARCHITECTURE.md](./AUTO_UPDATE_ARCHITECTURE.md)。
19. 要开发或修改前端界面：先读 [UI_DESIGN_STANDARDS.md](./UI_DESIGN_STANDARDS.md)。
20. 想追踪界面为什么变成现在这样：读 [UI_CHANGELOG.md](./UI_CHANGELOG.md)。
21. 要继续打磨开书设置、捎话记忆或“设定读伴”体验：读 [OPENING_COMPANION_ONBOARDING.md](./OPENING_COMPANION_ONBOARDING.md)。

## 维护规则

- 新功能完成后，先判断它影响哪一类文档：
  - 改变产品流程、数据结构、架构共识：更新 `PROJECT_NOTES.md`。
  - 改变优先级、阶段目标或待办：更新 `ROADMAP.md`。
  - 推进 App 化、桌面壳、运行环境边界、AI transport、本地文件系统或 SQLite：更新 `APP_EVOLUTION_LOG.md`。
  - 推进生产级发布、数据可靠、安全隐私、诊断、CI、QA、自动更新或 public alpha：更新 `PRODUCTION_UPGRADE_PLAN.md`。
  - 改变 Tauri/Rust 后端、AI transport、Keychain、备份或测试标准：更新 `BACKEND_DEVELOPMENT_STANDARDS.md`。
  - 改变后续 AI 接手流程、任务模板或协作方式：更新 `AI_HANDOFF_PROMPTS.md`。
  - 改变产品内系统提示词、模型输出文风、慎用句式或 prompt 验收标准：更新 `PROMPT_WRITING_STANDARDS.md`。
  - 改变 SQLite 表结构、数据迁移顺序或本地数据目录约定：更新 `DESKTOP_STORAGE_SCHEMA.md`。
  - 改变开书契约上下文构建、兼容策略或 prompt 接入边界：更新 `READING_CONTRACT_CONTEXT.md`。
  - 改变公开前隐私、安全、BYOK 或仓库成熟度边界：更新 `PUBLIC_READINESS_CHANGES.md`。
  - 推进 P6.5 安全与隐私审计：更新 `SECURITY_PRIVACY_AUDIT.md`。
  - 推进 P6.6 本地诊断、日志、诊断包、健康检查或错误详情复制：更新 `DIAGNOSTICS_PRIVACY_SPEC.md`。
  - 推进 P6.7 发布配置、artifact、校验和或 release notes：更新 `RELEASE_PROCESS.md`。
  - 改变发布前检查步骤、PR/issue 模板、smoke test 或 release checklist：更新 `RELEASE_CHECKLIST.md`。
  - 改变 App 版本、升版脚本、Git tag 或 Changelog 规则：更新 `VERSIONING.md` 和根目录 `CHANGELOG.md`。
  - 改变 GitHub Environment/Secrets、tag release、CI 签名、公证或 Release 上传：更新 `GITHUB_RELEASE_AUTOMATION.md`。
  - 改变 updater 信任根、更新通道、manifest、更新产物或升级回滚策略：更新 `AUTO_UPDATE_ARCHITECTURE.md`。
  - 改变 QA 矩阵、回归样本、测试环境维度或 smoke test 预期：更新 `QA_MATRIX.md`。
  - 改变视觉规范、布局标准、交互边界：更新 `UI_DESIGN_STANDARDS.md`。
  - 改变视觉、布局、交互、文案体验：更新 `UI_CHANGELOG.md`。
  - 改变开书读伴对话、捎话记忆或开书地图主次关系：更新 `OPENING_COMPANION_ONBOARDING.md`。
- 每次更新都尽量写清楚三件事：为什么改、改了什么、还有什么限制。
- `PROJECT_NOTES.md` 可以保留完整背景，但不要把所有 UI 微调都塞进去；细节优先放到 `UI_CHANGELOG.md`。
- `ROADMAP.md` 不写流水账，只写当前状态、下一步和取舍。
- `APP_EVOLUTION_LOG.md` 是 App 化专项流水账和阶段记录；每次相关工程推进后都要追加日志。
- `PRODUCTION_UPGRADE_PLAN.md` 是生产级升级的任务地图；阶段 5 之后的可靠性、发布、安全、诊断和 CI 工作都应先对齐它。
- `DESKTOP_STORAGE_SCHEMA.md` 是桌面版本地存储结构的来源；改 SQLite schema 时先同步它。
- `UI_DESIGN_STANDARDS.md` 是前端 UI 的护栏；新增功能时不要绕过它直接改视觉比例。
- `UI_CHANGELOG.md` 不替代产品需求文档；如果某个 UI 改动背后改变了核心流程，还要同步更新 `PROJECT_NOTES.md` 或 `ROADMAP.md`。

## 当前整理结论

- `PROJECT_NOTES.md` 是主上下文文档，但已经较长，后续新增日志应尽量按日期追加，避免在前半部分不断扩写细枝末节。
- `ROADMAP.md` 的阶段路线已经能覆盖当前方向，后续应优先维护 P0/P1 的进展和优先事项；开书契约接入已经从待办转为验证和调优任务。
- `APP_EVOLUTION_LOG.md` 已用于记录从纯前端 MVP 走向桌面 App 的专项阶段、实施记录和验证结果。
- `PRODUCTION_UPGRADE_PLAN.md` 已拆出阶段 5 之后的生产级升级步骤；P6.1 数据安全收口、P6.2 存储结构收束、P6.3 大文件与解析韧性主体、P6.4 AI transport 生产化主体、P6.5 安全与隐私加固基础版和 P6.6 本地诊断与可支持性基础版已完成，P6.7.1 发布配置收束、P6.7.2 签名/公证前准备、P6.9.1 基础 CI、P6.9.2 Release preflight CI、P6.9.3 发布/协作模板、P6.10.1 QA 矩阵基础版和 P6.10.2 fixtures/样本说明基础版已完成。
- `SECURITY_PRIVACY_AUDIT.md` 已记录 P6.5 完整基础版：依赖审计、Rust 依赖树、Tauri capabilities、asset protocol、command 暴露面、CSP、安全头、输入校验和敏感信息扫描。
- `DIAGNOSTICS_PRIVACY_SPEC.md` 已建立 P6.6 诊断隐私规范；P6.6 基础版已完成，包含设置页入口、错误详情复制、健康检查、诊断包导出和备份操作日志。
- `RELEASE_PROCESS.md` 已建立 P6.7 发布流程，记录 test/formal channel、artifact 命名、release preflight、manifest、checksum 和 release notes 约定。
- `RELEASE_CHECKLIST.md` 已建立 P6.9.3 发布检查清单，配合 GitHub PR/issue 模板使用。
- `QA_MATRIX.md` 已建立 P6.10.1 QA 矩阵基础版，并在 P6.10.2 接入 `qa-fixtures/`、fixture manifest、生成脚本和验证脚本。
- `VERSIONING.md` 和根目录 `CHANGELOG.md` 已建立版本管理基础；当前开发版本为 `0.2.0-alpha.2`，CI 会校验 npm/Tauri/Cargo/lockfile 一致性。
- `GITHUB_RELEASE_AUTOMATION.md` 已建立 tag 驱动的 macOS 发布规范；CI 会绑定 tag/commit、Developer ID 签名、公证证据和 GitHub Release assets，P6.8 后续复用这套来源。
- `BACKEND_DEVELOPMENT_STANDARDS.md` 是后端和本地后端工程护栏，后续改 Tauri/Rust、SQLite、Keychain、备份或 AI transport 前应先读。
- `AI_HANDOFF_PROMPTS.md` 是后续 AI 接手入口，包含通用接手、后端修改、迁移、备份、安全审查和最终汇报提示词。
- `PROMPT_WRITING_STANDARDS.md` 已补充产品内提示词规范，用来约束读伴文风、模板句和“先否定再肯定”的高频输出习惯。
- `DESKTOP_STORAGE_SCHEMA.md` 已记录桌面 schema 9 的 SQLite 表、App 数据目录、迁移顺序和 Keychain/备份边界。
- `READING_CONTRACT_CONTEXT.md` 是开书契约和单本书读伴记忆的专项来源，当前已记录章节导读、阅读中问答、读后交流三条链路的接入情况。
- `OPENING_COMPANION_ONBOARDING.md` 记录开书设置从“等待整本书导读”改为“多轮设定读伴对话”的体验和实现边界。
- `UI_DESIGN_STANDARDS.md` 用来保护现有视觉气质和组件边界，尤其是封面书架比例、封面主操作、菜单边界、动效克制和主次操作层级。
- `UI_CHANGELOG.md` 适合作为界面演进记录，尤其适合记录书架、阅读器、笔记和品牌视觉的连续试错。
