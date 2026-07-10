# 读伴 QA 矩阵与回归样本

> 最后更新：2026-07-10

本文档承接 P6.10「QA 矩阵与回归样本」。目标是让每次发布前的人工验证不再依赖记忆，而是按固定场景、固定预期和固定证据记录执行。

## 使用规则

- 发布前至少执行「P0 Smoke Test」。
- 改动触及某个模块时，额外执行该模块对应的 P1 回归场景。
- 涉及 SQLite schema、备份、导入恢复或 App 数据目录时，必须执行「升级与数据恢复」场景。
- 涉及 AI transport、Keychain、预算、模型 profile 或诊断日志时，必须执行「AI 与设置」场景。
- 测试证据可以是简短文字、脱敏截图或诊断摘要；不得包含 API Key、书籍正文、私密笔记、聊天全文、绝对本地路径或未授权版权内容。
- 结果标记统一使用：`Pass`、`Fail`、`Blocked`、`Skipped`。

## 测试环境维度

| 维度 | 必测值 | 发布前说明 |
| --- | --- | --- |
| App 形态 | 浏览器版、Tauri 桌面版 | P6 发布重点是桌面版；浏览器版用于确认未被破坏 |
| 包类型 | dev、local DMG、signed DMG | signed DMG 等 Apple Developer 审核后执行 |
| 数据通道 | test、formal | SQLite/files/backups/diagnostics/Keychain 必须隔离；测试数据不得出现在 formal |
| 用户状态 | 新用户、已有用户 | 新用户验证首次启动；已有用户验证数据恢复 |
| 网络状态 | 有网络、无网络 | AI 请求仅有网络时验证；无网络验证错误提示 |
| API Key | 未配置、正确 Key、错误 Key | 正确 Key 用人工私密环境验证 |
| 文件类型 | PDF、MOBI | 扫描版 PDF 当前记录为已知限制 |
| 数据规模 | 小书、中等书、大书 | 大书样本不提交版权文件，只记录本地样本名与特征 |
| 备份来源 | 新备份、旧备份、损坏备份 | P6.10.2 已提供空备份和篡改备份 manifest；含书升级样本进入 P6.10.3 |

## P0 Smoke Test

发布候选包必须先通过这些场景，才继续更细的回归测试。

| ID | 场景 | 步骤 | 预期结果 | 证据 |
| --- | --- | --- | --- | --- |
| SMK-001 | 首次启动 | 打开 App | 进入书架，无白屏、崩溃或权限弹窗循环 | 截图或文字 |
| SMK-002 | 书架显示 | 查看书架和顶部入口 | 书架正常渲染，设置、下载桌面版入口不遮挡主流程 | 截图 |
| SMK-003 | 导入 PDF | 导入一本可公开或本地授权 PDF | 书籍进入书架，能打开阅读器 | 书名/页数摘要 |
| SMK-004 | 导入 MOBI | 导入一本可公开或本地授权 MOBI | 书籍进入书架，章节可打开 | 章节数摘要 |
| SMK-005 | 阅读器打开 | 打开 PDF 和 MOBI 阅读器 | 正文、页码或章节、右侧读伴区域正常 | 截图 |
| SMK-006 | 阅读进度 | 翻页或切换章节后退出再进入 | 进度恢复到最近位置 | 文字 |
| SMK-007 | API Key 状态 | 打开设置页 | 已保存 Key 有明确状态提示；不会自动弹连续系统密码框 | 截图/文字 |
| SMK-008 | AI 请求 | 使用正确 Key 发起一次简短问答 | 返回内容，失败时错误可读且不泄露 Key | 脱敏摘要 |
| SMK-009 | 备份导出 | 导出一次备份 | 生成目录式备份，manifest 与 files 存在 | 文件摘要 |
| SMK-010 | 重启恢复 | 完全退出 App 后重新打开 | 书库、进度、笔记/聊天摘要和设置状态恢复 | 文字 |

## P1 核心回归矩阵

### 书库与导入

| ID | 场景 | 触发条件 | 预期结果 |
| --- | --- | --- | --- |
| LIB-001 | 重复导入同一本书 | 导入同一 PDF/MOBI 两次 | 不破坏已有数据；重复策略符合当前产品行为 |
| LIB-002 | 取消导入 | 大文件导入中取消 | 取消后无半成品书籍或孤儿文件异常 |
| LIB-003 | 导入失败 | 导入坏文件或不支持格式 | 失败提示友好，不写入损坏数据 |
| LIB-004 | 大书导入 | 导入接近当前限制的大 PDF/MOBI | 显示进度、可取消、错误提示可理解 |
| LIB-005 | 章节识别 | 打开带目录和不带目录的 PDF/MOBI | 章节列表可用；低质量识别可人工调整 |

### 阅读器与笔记

| ID | 场景 | 触发条件 | 预期结果 |
| --- | --- | --- | --- |
| RD-001 | PDF 翻页 | 连续翻页、跳页 | 页面稳定渲染，无明显重排或空白 |
| RD-002 | MOBI 章节阅读 | 切换章节、滚动正文 | 正文不丢段，章节标题稳定 |
| RD-003 | 高亮与笔记 | 选中文字并保存笔记 | 笔记保存后可再次查看 |
| RD-004 | 章节编辑 | 修改章节标题或范围 | 修改后阅读入口和导读上下文使用新信息 |
| RD-005 | 读后交流 | 完成一次读后交流 | 对话保存到本书上下文 |

### AI 与设置

| ID | 场景 | 触发条件 | 预期结果 |
| --- | --- | --- | --- |
| AI-001 | 未配置 Key | 发起 AI 请求 | 提示去设置，不崩溃 |
| AI-002 | 错误 Key | 使用错误 Key 请求 | 结构化错误可读，不泄露 Key |
| AI-003 | 正确 Key | 生成导读/问答 | 请求成功，预算与 token 提示正常 |
| AI-004 | 请求取消 | 请求中取消 | UI 停止等待，后端记录取消摘要 |
| AI-005 | 自定义 Base URL | 使用 OpenAI-compatible 自定义地址 | URL 校验和错误提示符合预期 |
| AI-006 | 模型 profile | 切换 profile 后请求 | 使用当前 profile 的模型、价格和预算设置 |
| AI-007 | Keychain 状态 | 设置页保存、留空保存、更新 Key | 留空不覆盖已有 Key，新 Key 才更新 |
| AI-008 | Keychain 通道隔离 | 分别在 test/formal 保存或读取 Key | 两个 identifier 使用独立 service，互不显示或覆盖 |

### 备份、导入与诊断

| ID | 场景 | 触发条件 | 预期结果 |
| --- | --- | --- | --- |
| BK-001 | 备份导出 | 有书籍、笔记、聊天后导出 | manifest、files、sha256 完整；不包含 API Key |
| BK-002 | 导入前预览 | 选择备份目录 | 显示书籍数量、文件状态、风险摘要 |
| BK-003 | 校验报告 | 导入前运行校验 | 缺失、篡改或版本问题有明确报告 |
| BK-004 | 合并导入 | 导入到已有书库 | 不覆盖未在备份中的书；冲突策略符合预期 |
| BK-005 | 覆盖恢复 | 使用备份覆盖当前数据 | 失败时可回滚；成功后数据一致 |
| BK-006 | 诊断包 | 设置页导出诊断包 | 诊断包不含正文、Key、prompt、笔记全文或绝对路径 |

### 发布包与桌面行为

| ID | 场景 | 触发条件 | 预期结果 |
| --- | --- | --- | --- |
| REL-001 | local DMG | `npm run package:mac-local` | 生成命名规范的 local DMG |
| REL-002 | formal channel | `npm run release:preflight` | formal dist 不含测试书或测试入口 |
| REL-003 | 窗口关闭 | 点击窗口叉号 | 主窗口隐藏到后台，不直接退出 |
| REL-004 | Dock 唤回 | 点击 Dock 图标 | 主窗口重新显示并聚焦 |
| REL-005 | 系统退出 | `Cmd+Q` 或菜单退出 | App 真正退出 |
| REL-006 | signed DMG | Apple 证书可用后执行 | signed/notarized/stapled/Gatekeeper 均通过 |
| REL-007 | test/formal 数据隔离 | test 中保留书库后启动 formal 新用户包 | formal 书架为空且不读取 test SQLite/files/backups；test 数据仍完整 |

## 升级与数据恢复

| ID | 场景 | 数据来源 | 预期结果 |
| --- | --- | --- | --- |
| UPG-001 | 新 schema 空库启动 | 删除或隔离 App 数据目录后启动 | 自动初始化到当前 schema |
| UPG-002 | 旧 schema 数据库升级 | P6.10.3 准备的旧库样本 | 迁移成功，版本更新，核心数据保留 |
| UPG-003 | 旧备份导入 | P6.10.3 准备的旧备份样本 | 预览、校验、导入路径可用 |
| UPG-004 | 新备份 roundtrip | 当前版本导出后导入 | 数据一致，文件 sha256 一致 |
| UPG-005 | 损坏备份 | 篡改 manifest 或文件 hash | 校验失败且不破坏当前书库 |

## 回归样本策略

- 不提交版权受限 PDF/MOBI 原文。
- 可提交的样本必须来自公版、开源授权、用户自写或极小合成文件。
- 大书、坏书、扫描版 PDF 等样本可以先记录在本地清单，不进入仓库。
- 每个样本记录这些元信息：文件类型、页数/章节数、大小、是否扫描版、用途、预期结果。
- 固定样本维护在 `qa-fixtures/`，用 `npm run qa:fixtures` 生成，用 `npm run qa:fixtures:verify` 验证。

## P6.10.2 固定 Fixtures

| ID | 路径 | 用途 | 预期 |
| --- | --- | --- | --- |
| `pdf-valid-two-page` | `qa-fixtures/books/duban-qa-two-page.pdf` | PDF 导入、阅读器打开、翻页 smoke test | 可被 PDF.js 读取为 2 页 |
| `pdf-corrupt-negative` | `qa-fixtures/books/duban-qa-corrupt.pdf` | 导入失败负向测试 | PDF 解析失败，App 应给友好错误 |
| `mobi-source-html` | `qa-fixtures/books/duban-qa-mini-book.html` | 后续生成合法 MOBI 的源文本 | 不是可导入 MOBI |
| `backup-empty-v3` | `qa-fixtures/backups/duban-backup-empty-v3/manifest.json` | 备份预览和校验 smoke test | manifest hash 正确；merge import 是 no-op |
| `backup-tampered-v3` | `qa-fixtures/backups/duban-backup-tampered-v3/manifest.json` | 备份校验负向测试 | manifest hash 故意错误 |

命令：

```bash
npm run qa:fixtures
npm run qa:fixtures:verify
```

说明：

- `qa-fixtures/fixtures.json` 记录每个 fixture 的路径、大小、sha256、用途和预期。
- 当前不提交二进制 MOBI fixture。MOBI 用本地授权样本人工验证，并在 QA Run 里记录文件名、大小、章节数和来源授权摘要。
- `backup-empty-v3` 是空备份。人工测试 replace import 会清空当前数据，通常只用于预览或 merge import。
- 含真实书籍数据的备份样本和旧 schema 升级样本放到 P6.10.3。

## 发布测试记录模板

每次发布可以在 issue、PR、release notes 草稿或 `docs/APP_EVOLUTION_LOG.md` 中记录：

```markdown
## QA Run

- Version:
- Build kind: dev / local / signed
- Date:
- Tester:
- Environment:
- Sample set:

| ID | Result | Notes |
| --- | --- | --- |
| SMK-001 | Pass |  |
| SMK-002 | Pass |  |
| SMK-003 | Pass |  |

## Blockers

- （无）

## Follow-ups

- （无）
```

## 后续 P6.10

- P6.10.2：建立可公开提交的最小 PDF/MOBI/备份 fixtures 或样本说明。已完成基础版。
- P6.10.3：建立升级样本：旧 schema 数据库、含书旧备份、含书新备份、损坏备份。
- P6.10.4：把部分 smoke test 自动化到 Playwright 或 Rust 测试。
