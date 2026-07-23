# 读伴生产级升级路线

> 最后更新：2026-07-22
>
> 状态：P6.1-P6.12 工程基线已完成并冻结。本文保留实施步骤和验收历史，不再作为当前“下一步”来源。

这份文档记录读伴从“本地可用的桌面 App”升级到“可长期使用、可分发、可维护的生产级 App”时完成了什么。当前路线以 [ROADMAP.md](./ROADMAP.md) 为准，后续发布运营按 Release、Updater、安全和 QA 专项文档执行。

## 当前基线

截至 2026-07-10，读伴已经具备这些基础：

- React/Vite 浏览器 MVP 仍可用于快速验证阅读体验。
- Tauri v2 桌面壳已接入，macOS 本地可生成 `.app` 和测试版 `.dmg`。
- 桌面版已使用 Rust command 代理 AI 请求，浏览器版仍直连模型供应商。
- 桌面版已使用 SQLite + App 数据目录文件存储承载长期书库数据。
- 桌面 API Key 已迁入系统 Keychain，备份默认不包含 API Key。
- 桌面 schema 已到 `10`，并有显式迁移器入口。
- 备份已升级为目录式 `manifest.json + files/`，支持备份清单、导入前预览、校验报告、合并导入和覆盖恢复。
- 后端开发标准和后续 AI 接手提示词已经落在文档中。
- P6.1 数据安全收口、P6.2 存储结构收束和 P6.3 大文件与解析韧性主体已完成；P6.4 AI transport 生产化已完成主体收尾，包括 Keychain 连续弹窗修复、结构化错误、超时、有限重试、请求取消、输出截断识别、费用/token 预算保护、模型 profile 管理和脱敏调用诊断。
- P6.5 安全与隐私加固已完成基础版：依赖审计、Tauri 权限基线、command 输入校验、路径护栏、Tauri/Web CSP 与安全头、敏感信息扫描脚本、隐私/安全说明同步均已落地。
- P6.6 本地诊断与可支持性基础版已完成；P6.7.1 发布配置收束已完成；P6.7.2 签名/公证前准备已完成，Developer ID、notarization、staple、Gatekeeper 验证脚本和干净 macOS 回归清单均已落地。
- P6.7.4-P6.7.6 已完成版本管理、App 内版本可见性和 tag 驱动的 macOS 自动发布：annotated tag 会触发 CI 校验、Developer ID 签名、Apple 公证/staple、Gatekeeper 验证和 GitHub Release artifact 发布。
- P6.9.1 基础 CI、P6.9.2 Release preflight CI 和 P6.9.3 发布/协作模板已完成：GitHub Actions 会在 macOS runner 上执行正式前端构建、release preflight、Rust fmt/check/test 和安全扫描；仓库已提供 release checklist、PR checklist、bug report 和 feature request 模板。
- P6.10.1 QA 矩阵基础版已完成；P6.10.2 固定 fixtures/样本说明基础版已完成：已提供合成 PDF、坏 PDF、HTML 源文本、空备份 manifest、篡改备份 manifest、fixture manifest 和生成/验证脚本。

这意味着读伴已经不是纯前端原型，但还没有达到正式分发给其他用户长期使用的生产级状态。

## 生产级目标

生产级不是简单“能打包”。读伴的生产级目标包括：

- 数据可靠：用户书库、笔记、进度、导读和聊天记录不能因为普通升级、导入失败或中途崩溃轻易损坏。
- 发布可信：安装包有正式签名、公证、版本号、发布说明和可复现的构建流程。
- 安全清晰：API Key、本地文件、AI 请求、日志、备份和自定义 Base URL 的边界清楚，默认不泄漏敏感数据。
- 故障可诊断：用户遇到问题时能导出不含隐私和密钥的诊断信息，开发者能定位问题。
- 升级可维护：schema 迁移、自动更新、回滚和回归测试有固定流程。
- 公开可协作：public alpha 前有 CI、issue 模板、贡献说明、隐私和安全说明。

## 阶段总览

| 阶段 | 名称 | 核心问题 | 主要产出 |
| --- | --- | --- | --- |
| P6.1 | 数据安全收口 | 备份和恢复要能长期信任 | 校验和、恢复事务、迁移测试夹具、备份操作补齐 |
| P6.2 | 存储结构收束 | 兼容 KV 不能无限膨胀 | settings、封面、缓存、文件索引的结构化边界 |
| P6.3 | 大文件与解析韧性 | 大 PDF/MOBI 不能拖垮 App | 文件限制、进度、取消、重试和友好错误 |
| P6.4 | AI transport 生产化 | 模型调用要可控、可恢复、可解释 | 超时、重试、取消、错误映射、费用保护、模型 profile、脱敏诊断 |
| P6.5 | 安全与隐私加固 | 发布前减少可预见风险 | 依赖审计、Tauri 权限、CSP、日志脱敏 |
| P6.6 | 本地诊断与可支持性 | 出问题后能定位 | 本地日志、诊断包、隐私过滤和导出入口 |
| P6.7 | 正式 macOS 发布包 | 用户能安全双击安装 | 正式 `.app`/`.dmg`、签名、公证、Gatekeeper 验证 |
| P6.8 | 自动更新 | 用户不必手动替换 App | Tauri updater、签名清单、通道和回滚策略 |
| P6.9 | CI 与发布流水线 | 每次发布前自动检查 | build/test/check/package workflow 和产物校验 |
| P6.10 | QA 矩阵与回归样本 | 关键路径不靠临时手测 | 测试书、升级样本、备份样本、发布验收清单 |
| P6.11 | Public alpha 准备 | 公开协作和用户反馈入口 | issue 模板、公开说明、已知限制、发布说明 |
| P6.12 | 生产化总验收与阶段冻结 | P6 是否可以整体关闭 | 正式候选包、升级验收、完整 QA、安全审计和 Public Alpha 基线 |

## 详细步骤

### P6.1 数据安全收口

目标：把阶段 5.9 的长期可靠备份基础，继续推进到“可以放心恢复真实书库”的程度。

当前进展：

- 已将桌面备份格式升级为 `duban.local-backup` v3。
- 已为 manifest 增加 `manifestSha256`，为每个备份原始文件增加 `sha256` 和 `byteSize` 校验。
- 导入前校验已覆盖 format、backupVersion、schemaVersion、重复 key、重复书籍 id、manifest hash、文件路径、防目录穿越、文件大小和文件 hash。
- `replace` 和 `merge` 导入前都会创建隐藏恢复点；导入失败时会自动恢复导入前状态。
- 设置页已支持备份名称/备注、删除本地备份、外部目录或 `manifest.json` 路径预览与导入。
- 已新增 Rust 测试覆盖目录式备份 roundtrip、合并导入、坏 hash 阻止导入和覆盖恢复失败回滚。

要做：

- 为 schema 迁移继续准备固定测试夹具：旧 schema 数据库、旧备份目录、坏备份目录、大书库备份目录。
- 后续评估 zip/tar 压缩归档和备份签名；归档内仍保持 `manifest.json + files/` 结构。

完成标准：

- 坏备份不能进入导入流程。已完成。
- 覆盖恢复中途失败不会留下半损坏书库。已完成。
- 用户能从外部选择一个备份目录导入，而不必手动放到 App 数据目录。已通过路径输入方式完成，原生文件选择器可后续再补。
- 备份报告能清楚说明书籍数、文件数、页文本数、进度、笔记、聊天、导读和校验结果。已完成。

推荐验证：

- `cargo test`
- `cargo check`
- `npm run build`
- 用真实本地书库导出、预览、合并导入、覆盖恢复各跑一次。

### P6.2 存储结构收束

目标：减少兼容 KV 的长期负担，让长期数据边界更清楚。

当前进展：

- P6.2 已将桌面 schema 升到 `9`；P7.5 进一步升到 `10`，新增陪读事件表与备份合并契约。
- 已新增 `app_settings`，替代 `kv_store.settings`；API Key 继续只进 Keychain，`hasApiKey` 仅作为本机非敏感状态。
- 已新增 `book_covers`，封面文件写入 App 数据目录 `files/covers/`，SQLite 保存关联、MIME、来源和更新时间。
- 已新增 `formatted_texts`，替代 `book:{id}:formatted-text:{itemKey}`。
- 已为 `book_files` 补充 `import_source` 和 `last_verified_at`；`sha256`、`mime_type`、文件大小和相对路径继续作为长期索引。
- 已新增孤儿文件扫描/清理 Tauri command：`duban_storage_scan_orphan_files`、`duban_storage_delete_orphan_files`。
- 已明确 `kv_store` 只保留兼容旧 key 或临时低风险 JSON，不再承载上述长期核心数据。

完成标准：

- 新增长期数据时优先有结构化位置，而不是继续塞进 `kv_store`。已完成。
- Keychain、SQLite、App 数据目录三者职责清楚。已完成。
- 清理逻辑不会删除仍被书籍引用的原始文件、封面或缓存。后端扫描/清理命令已完成，原生 UI 入口后续放入诊断/维护页。

### P6.3 大文件与解析韧性

目标：让大 PDF/MOBI、坏文件和长时间解析有可控体验。

当前进展：

- 已新增导入防护模块 `bookImportGuards.js`，集中管理文件大小、页数、MOBI 内容片段数、提取文本量和错误文案。
- 上传前检查文件类型和文件大小：
  - PDF 当前上限 150 MB。
  - MOBI 当前上限 80 MB。
- PDF 打开后检查页数：
  - PDF 当前上限 2000 页。
- MOBI 打开后检查内容片段数：
  - MOBI 当前上限 1200 个 spine item。
- PDF/MOBI 解析过程已提供更细进度：
  - 检查文件
  - 读取文件
  - 打开文档
  - 读取目录
  - 提取文本
  - 保存到本地
- 导入过程中已提供取消按钮：
  - PDF 逐页提取前后检查取消状态。
  - MOBI 逐内容片段提取前后检查取消状态。
  - Tauri 本地文件引用的 fetch 读取会接收 AbortSignal。
- 解析失败后保留最近一次文件引用，书架错误提示提供“重试”。
- 对常见错误提供友好文案：
  - 文件过大
  - PDF 页数过多
  - MOBI 内容片段过多
  - 提取文本过多
  - 扫描版/空文本 PDF
  - 加密 PDF
  - 损坏 PDF
  - 本地文件读取失败
- 保存书籍时改为先写原始文件和分页，再写书籍列表；保存失败会清理已写入 key，避免半本书污染书库。

仍待后续：

- 大 PDF 文本提取避免一次性把所有中间状态堆进内存。
- 增加“只导入元数据/稍后解析”的降级路径评估。
- 用大书、坏书、扫描版 PDF 建立固定回归样本，不提交版权原文。

完成标准：

- 用户知道当前卡在哪一步，以及能不能取消。已完成主体。
- 单本书解析失败不影响已有书库。已完成主体。
- 常见坏文件有明确文案，不以空白页或控制台错误结束。已完成主体，仍需补更多真实坏文件样本。

### P6.4 AI transport 生产化

目标：让本地 Rust AI 代理更像稳定后端，而不是简单转发。

当前进展：

- 已完成一个 P6.4 前置收口：桌面版 AI 请求在缺少明文 API Key 时，允许从 Keychain 读取后写入当前 Tauri 进程内短期缓存。
- 缓存只在内存中，不进入 SQLite、备份、日志或错误信息。
- 请求体显式传入 API Key 时优先使用请求体，不读缓存也不读 Keychain。
- 保存新 Key、删除 Key 或清空数据后会清空缓存，避免继续使用旧密钥。
- Keychain 读取与缓存写入放在同一锁内，避免并发模型请求同时 miss 缓存后触发多次系统授权。
- 已完成 P6.4.1 + P6.4.2：Tauri AI command 返回结构化脱敏错误，区分网络、鉴权、权限、限流/额度、模型/Base URL、上下文过长、响应格式和服务端临时错误；前端保留 `code/kind/retryable/status` 诊断字段。
- 已完成统一超时、重试和退避骨架：连接超时 15 秒，总请求超时 180 秒，最多 3 次尝试，只对网络/超时/429/临时服务端错误重试。
- 已完成 P6.4.3 请求取消：AI 业务入口支持 `AbortSignal`，Tauri transport 用 `requestId` 调用取消 command，Rust 后端可中止等待中的发送、重试退避和流式读取；开书分析、章节导读、伴读聊天和读后交流都提供停止入口。
- 已完成 P6.4.4 输出截断识别：浏览器版和桌面版 AI response 统一返回 `truncated`；章节导读和正文整理命中截断时拒绝保存半截结果；整本书导读命中截断时保存 failed 诊断态；聊天和读后追问保留回答但提示输出上限。
- 已完成 P6.4.5 费用/token 预算保护：正式 AI 请求发出前统一估算输入 token、最大输出 token 和最高费用；设置页可配置单次输入/输出上限、单次费用上限和每日费用上限；预算日用量只保存脱敏统计，并从浏览器/桌面备份中排除。
- 已完成 P6.4.6 模型 profile 管理：不同 AI 任务可单独指定供应商、模型、Base URL、输入/输出价格、输出 token 上限和 temperature；profile 只保存非敏感配置，API Key 仍使用供应商级 Keychain/本地设置。
- 已完成 P6.4 收尾：正式 AI 请求记录最近 20 条脱敏调用诊断，包含任务、供应商、模型、Base URL origin、耗时、状态、错误码、HTTP 状态、尝试次数、token 和费用估算；不记录 API Key、prompt、章节正文、笔记正文或聊天全文。

后续延伸：

- P6.6 诊断包可以复用 AI 调用诊断摘要，但导出前仍要执行隐私过滤。
- P6.5 安全审计继续检查日志、错误、备份和诊断包永不包含 API Key。

完成标准：

- AI 请求失败时，用户知道是配置、网络、额度、模型还是内容太长。
- 用户能取消长时间生成。
- 输出截断能被识别并提示，而不是当成完整导读保存。已完成。
- 单次和每日费用/token 预算能在请求前拦截。已完成基础版。
- 不同任务能用不同模型、temperature、输出上限和价格，并复用同一套预算/截断/取消/错误处理入口。已完成基础版。
- 最近 AI 调用有脱敏诊断记录，用户可以在设置页查看和清空；浏览器 JSON 备份和桌面目录式备份都不会包含这些记录。已完成基础版。

### P6.5 安全与隐私加固

目标：正式公开或分发前，把可预见的安全风险逐项收束。

当前进展：

- 已完成 P6.5.1 依赖与权限基线：新增 [SECURITY_PRIVACY_AUDIT.md](./SECURITY_PRIVACY_AUDIT.md)，记录 `npm audit` 0 漏洞结果、Rust 依赖重复树、`cargo audit` 工具缺口、Tauri capabilities、asset protocol scope 和 command 暴露面。
- 已新增 `npm run security:audit`，用于复跑前端依赖审计、Rust 重复依赖树检查和本地安全扫描。
- 已完成 P6.5.2：`duban_storage_get_item`、`set_item`、`set_file`、`remove_item` 和 `delete_book` 的输入校验收束；本地文件相对路径限制为顶层 blob 或 `covers/` 下封面文件；外部备份路径先校验文本再 canonicalize。
- 已完成 P6.5.3：Tauri 正式 CSP、dev CSP、`X-Content-Type-Options`、`Permissions-Policy` 已写入配置；Web 静态部署补充 `public/_headers`，其中包含 `Referrer-Policy`。
- 已完成 P6.5.4：新增 `scripts/security_scan.mjs`，扫描真实 API Key 形态、Tauri CSP/headers、capabilities、asset protocol scope 和备份密钥剥离锚点。
- 已完成 P6.5.5：根目录 `SECURITY.md`、`PRIVACY.md` 和公开成熟度/接手文档已同步浏览器版与桌面版隐私安全边界。

后续保持：

- 如果后续 `npm audit` 出现 high/critical 报告，升级或替换对应依赖并复跑审计。
- 新增供应商、新增 Tauri command、新增诊断/日志字段时，必须同步复查 CSP、输入校验、敏感信息边界和 [SECURITY_PRIVACY_AUDIT.md](./SECURITY_PRIVACY_AUDIT.md)。
- P6.9 CI 阶段安装并启用 `cargo audit`，把 RustSec 漏洞审计纳入发布检查。
- 如果未来 Web 部署不支持 `public/_headers`，需要把同等安全响应头迁移到目标平台配置。

完成标准：

- 发布前安全清单可逐项勾选。已完成基础版。
- 已知高风险依赖有处理方案。当前 `npm audit` 基线为 0 漏洞。
- Tauri 权限和 command 暴露面能解释清楚。已完成基础版。
- Tauri/Web CSP 与安全头有可落地配置。已完成基础版。
- API Key 不进入 SQLite、备份、错误、AI 调用诊断或安全扫描允许范围。已完成基础版。

### P6.6 本地诊断与可支持性

目标：让用户反馈问题时，开发者不用猜。

当前进展：

- 已完成 P6.6.1：新增 [DIAGNOSTICS_PRIVACY_SPEC.md](./DIAGNOSTICS_PRIVACY_SPEC.md)，定义诊断字段允许清单、禁止清单、脱敏规则、日志格式和新增字段审核规则。
- 已完成 P6.6.2：新增 Rust 本地诊断日志基础，日志写入 App 数据目录 `logs/duban-diagnostics.jsonl`，JSONL 格式，超过 1 MB 后轮转为 `duban-diagnostics.1.jsonl`。
- 已记录 App 启动、SQLite 初始化成功/失败、AI 请求开始/成功/失败/取消；日志写入失败不会影响主流程。
- 已完成 P6.6.3：新增 `duban_diagnostics_health_check`，覆盖 schema 版本、SQLite quick_check、表计数、缺失文件、不安全路径、孤儿文件、备份目录读写和非敏感 Key 状态。
- 已完成 P6.6.4：新增 `duban_diagnostics_export_package`，导出脱敏 JSON 诊断包，包含 App 摘要、健康检查、备份摘要、设置摘要、AI 调用诊断和最近本地诊断日志。
- 已完成 P6.6.5：设置页「诊断」面板可运行健康检查、导出诊断包，并复制最近 AI 错误详情。
- 已完成 P6.6.6：备份导出/导入/删除/元数据更新写入脱敏本地诊断日志，文档和回归命令完成收口。

完成标准：

- 诊断包能帮助定位常见启动失败、迁移失败、备份失败和 AI 请求失败。基础版已完成。
- 诊断包默认不包含敏感内容，用户可以在导出前看到说明。基础版已完成。

### P6.7 正式 macOS 发布包

目标：从本地测试 `.dmg` 进入真正可分发的 macOS 安装包。

要做：

- 已完成 P6.7.1：固定版本号 `0.1.0`、正式/测试 bundle identifier、App 名称、test/formal channel、artifact 命名、release preflight、manifest/checksum 和 release notes 约定。
- 已完成：固定桌面窗口生命周期，点主窗口叉号隐藏到后台，Dock 图标可以重新唤回，真正退出走系统退出。
- 已完成 P6.7.2：准备 Developer ID 签名、公证、staple、Gatekeeper 验证脚本和干净 macOS 回归清单。
- 已完成 P6.7.4 版本管理基础：当前开发线升为 `0.2.0-alpha.1`，`package.json` 成为单一版本源，npm/Tauri/Cargo/lockfile 可统一校验和升版，CI/release preflight 已接入版本检查，并建立 VERSIONING/CHANGELOG。
- 已完成 P6.7.5 版本可见性：设置页/诊断展示 App version、formal/test channel、runtime、Git commit/dirty、SQLite schema 和 backup version；正式候选包必须来自干净 commit。
- 已完成 P6.7.6：新增 tag 驱动的 macOS release workflow；只接受位于 `origin/main` 的 clean annotated `v<version>` tag，自动完成构建、签名、公证、staple、Gatekeeper、manifest/checksum/notary log 和 GitHub Release 发布。配置与操作见 [GITHUB_RELEASE_AUTOMATION.md](./GITHUB_RELEASE_AUTOMATION.md)。
- Apple Developer Program 审核已通过；外部审核阻塞已解除。
- `Developer ID Application: Zhanwen Lu (FBMN9293RM)` 已安装并与私钥正确配对；`duban-notarytool` Keychain profile 已验证并保存；严格发布预检已通过。
- 首个 `arm64` signed DMG 的 Apple notarization、staple、App/DMG Gatekeeper 和 checksum 验证均通过，但人工回归发现旧 PDF 的 macOS `asset://` 状态 `0` 兼容问题，该候选包已作废。
- 兼容修复已完成代码、formal build 和安全扫描验证，当前在 Tauri 桌面环境回归；通过后重新签名、公证并替换候选包。
- 人工回归同时发现历史 `tauri:dev` 未加载 test 配置，开发数据曾写入正式 identifier。已将基础配置和开发脚本改为 test-safe，数据目录与 Keychain service 均按 identifier 隔离；历史开发书库已迁回 test 目录并保留回滚快照。本地 formal 与 test 双进程验证结果为正式库 0 本、测试库 2 本。
- 在干净 macOS 用户环境中安装、首次启动、导入书籍、保存 API Key、生成导读、重启恢复。
- 输出版本化 release artifacts：`.app`、`.dmg`、校验和、release notes。
- 首次运行自动流水线前，在 GitHub 配置 `macos-release` Environment、Apple 签名/公证 Secrets 和可选 required reviewer。

完成标准：

- 用户下载 `.dmg` 后可以双击安装并打开，不被 Gatekeeper 阻止。
- 正式包不包含本地测试书和测试入口。
- release notes 说明升级内容、已知限制和数据备份建议。

外部依赖：

- Apple Developer 账号。
- Developer ID Application / Installer 证书。
- 可访问 Apple notarization 服务的发布环境。

### P6.8 自动更新

目标：让正式用户能从 App 内安全升级。

当前进展：

- P6.8.1 客户端基础已完成：接入官方 updater/process Rust 与 JavaScript 插件，最小开放 `updater:default` 和 `process:allow-restart`，新增正式通道更新服务、预检脚本和 updater 私钥泄漏扫描。
- 浏览器版与 Tauri test channel 不会访问正式更新源；远程 endpoint 只允许进入 formal 配置。
- 已确定 Alpha 与 Stable 分离的固定 manifest 路径，版本化更新包继续使用不可变 GitHub Release assets。完整设计见 [AUTO_UPDATE_ARCHITECTURE.md](./AUTO_UPDATE_ARCHITECTURE.md)。
- Alpha.3 已作为首个内置信任根的版本发布，Alpha.4 更新资产和远端清单也已发布；App 内双版本体验由用户自行验收。

剩余步骤：

- P6.8.2 已完成：独立 updater 私钥已生成且权限为 `600`，公钥进入 formal/release 配置，两个 updater GitHub Environment Secrets 已配置，release build、manifest、publish 和 workflow 已要求 `.app.tar.gz` 与 `.sig`。Alpha.3 发布前仍需人工确认加密离线备份。
- P6.8.3 已完成真实执行：Alpha.3 GitHub Release 公开后建立 `updater-index` root commit，并原子发布 `alpha/latest.json`；远端版本、平台键、签名与 archive URL 已独立核验。
- P6.8.4 已完成：正式桌面设置页接入检查更新、版本说明、下载进度、安装前目录式恢复点、安全重启和受限 GitHub Release 手动下载；浏览器版与 Tauri test channel 不显示更新入口。
- P6.8.5：Alpha.3/Alpha.4 发布链已完成；正常升级和失败场景保留为用户发布验收项，不阻塞 P6 冻结。
- 复用 P6.7.6 的 SemVer/tag/source metadata、GitHub Release 和 release notes；updater 只追加签名更新包与 `latest.json`，不得再维护第二套版本号。

完成标准：

- 旧版本能检测到新版本并完成升级。
- 更新包签名校验失败时不会安装。
- schema 升级失败时能给出恢复建议。

外部依赖：

- 更新包托管位置，例如 GitHub Releases 或自有静态文件服务。
- updater 签名密钥管理策略。

### P6.9 CI 与发布流水线

目标：减少“在本机刚好能跑”的发布风险。

要做：

- 已完成 P6.9.1：新增基础 GitHub Actions CI，执行 `npm run build`、`cargo fmt --check`、`cargo check`、`cargo test` 和 `npm run security:scan`。
- 已完成 P6.9.2：CI 在正式前端构建后执行 `npm run release:preflight`，检查 formal dist 不包含测试书、测试入口和测试文案。
- 已完成 P6.7.6/P6.9 发布 workflow：tag 推送后在 macOS runner 构建、签名、公证、验证并发布正式 DMG，artifact 的版本、commit、tag、checksum 和公证状态会在发布前复核。
- 待增强：继续扩展正式构建 artifact 内容扫描，例如显式检查 `.env` 和更多敏感文件形态。
- 已完成 P6.9.3：新增 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)，包含发布边界、本地质量检查、CI、local/signed 包、smoke test、release notes 和发布后确认。
- 已完成 P6.9.3：新增 `.github/PULL_REQUEST_TEMPLATE.md`，覆盖验证命令、隐私、数据迁移、备份、Keychain、发布和文档同步检查。
- 已完成 P6.9.3：新增 bug report 和 feature request issue forms，并默认关闭空白 issue。

完成标准：

- 合并前能自动发现常见构建和测试问题。
- 发布流程可以被后续 AI 或人类开发者照着执行。

### P6.10 QA 矩阵与回归样本

目标：生产级发布前，每次都能固定验证关键路径。

要做：

- 已完成 P6.10.1：新增 [QA_MATRIX.md](./QA_MATRIX.md)，建立手动 smoke test、核心回归、升级数据恢复、跨环境维度和样本策略。
- 已完成 P6.10.2：建立 `qa-fixtures/`、`npm run qa:fixtures` 和 `npm run qa:fixtures:verify`，提供合成 PDF、坏 PDF、HTML 源文本、空备份 manifest 和篡改备份 manifest；MOBI 二进制样本暂用本地授权样本说明，不提交仓库。
- P6.10.3 基线已完成：空/篡改目录备份 fixture 与预期报告已固定；Rust 测试覆盖 schema 初始化迁移、含结构化数据和文件的备份 roundtrip、文件篡改拒绝、覆盖恢复失败自动回滚、合并导入保留现有书籍。历史版本含版权书的整库快照不提交仓库，后续每次 schema 变更时再按需要增加脱敏迁移 fixture。
- P6.10.4 基线已完成：CI 已自动执行 formal build、版本/发布状态机、release preflight、Rust fmt/check/test、安全扫描和 RustSec 审计；GUI 级 Playwright 回归与更多历史迁移样本作为持续 QA，不再阻塞 P6 冻结。

完成标准：

- 每次发布前有一张固定 QA 表，而不是临时凭记忆测试。
- 关键数据路径都有样本和预期结果。

### P6.11 Public alpha 准备

目标：让外部用户和贡献者能理解边界、提交问题并安全试用。

要做：

- [x] README 增加安装、使用、备份、隐私、安全和已知限制的 public alpha 说明。
- [x] 补齐 issue templates、CI badge、版本通道说明和 release notes 入口。
- [x] 明确支持范围：Apple Silicon、主要验证的 macOS 版本、模型供应商、PDF/MOBI 和扫描版 PDF 限制。
- [x] 明确不承诺内容：云同步、多人协作、在线书城、移动端和默认云端保存 PDF。
- [x] 增加反馈路径：bug、功能建议、安全问题和脱敏诊断包分别走什么入口。
- [x] 首次设置已引导 AI 配置；README 和设置页数据备份区提示用户定期备份。

完成标准：

- 一个新用户不用读完整开发日志，也能知道怎么安装、怎么备份、怎么配置 API Key、遇到问题怎么反馈。

### P6.12 生产化总验收与阶段冻结

状态：**2026-07-13 已完成并冻结。** P6 形成了可重复发布、升级、恢复和支持的 Public Alpha 工程基线。自动更新实机体验与 updater 私钥离线备份由用户作为发布运营事项继续执行，不阻塞开发阶段切换。

云同步、账号体系和真正云后端不再属于 P6，统一移动到 P9。P6 的完成不依赖云服务。

收尾步骤：

1. **P6.12.1 正式候选包回归**：机器发布与本机旧书回归已完成。`v0.2.0-alpha.4` 已完成签名、公证、staple、Gatekeeper、Release 和独立下载校验；正式候选可读取 Alpha.4 前正式环境导入的旧 PDF。2026-07-13 已将本机 formal 数据、WebKit 状态、缓存和偏好文件可逆移动到独立快照，并从完全退出状态启动 Alpha.4，确认首次欢迎页和 0 本书空书架正确；Keychain 与 test 数据保持不动。干净回归随后发现 Alpha.4 对混合 MOBI/KF8 文件会误选残缺旧 MOBI 壳，本地已修复；初次 Test bundle 复核恢复到 130 文本页，进一步按 TOC 层级和无标题片段归并后直接解析为 23 个有效章节。继续实机回归发现固定文本页在小窗口翻页时被裁断，现已改为按真实阅读区宽高运行时分屏，逻辑页码和已有数据不变；目标样本第 6 文本页在约 960px 窗口可完整走完 6 屏。下一正式候选必须同时包含并执行 `LIB-006 + RD-002A`。剩余 AI 配置、PDF 导入、备份和重启恢复人工验收，以及条件允许时另一台干净 macOS 的安装复核。
2. **P6.12.2 自动更新双版本验收（用户验收、非阻塞）**：Alpha.3 与 Alpha.4 的发布资产、签名、静态更新清单、安装前恢复点和客户端入口均已建立。用户决定自行完成 App 内真实升级体验；结果继续记录到 Release Checklist/QA Matrix，但不再要求 AI 重复执行，也不阻塞 P6 冻结。
3. **P6.12.3 升级与恢复样本（基线完成）**：已有空备份、篡改备份 fixtures，以及 schema、含书备份 roundtrip、篡改拒绝、replace 回滚和 merge 保留数据的 Rust 自动化测试。更多历史整库文件样本随未来 schema 变化持续补充。
4. **P6.12.4 自动化回归（基线完成）**：CI 与 Rust 测试已覆盖适合无界面执行的核心路径；完整 GUI Playwright 回归列入持续 QA Backlog。
5. **P6.12.5 安全检查补齐（完成）**：CI 增加独立 RustSec `cargo audit` job；首次审计将 `quinn-proto` 升到 0.11.15，Tauri/plist 暂时无法升级的两条 `quick-xml` advisory 采用带输入边界说明和移除条件的精确 ignore；无未忽略漏洞。`release:preflight` 增加正式 `dist` 中 `.env`、证书/私钥文件、测试书目录和私钥正文形态扫描。
6. **P6.12.6 Public Alpha 收口（完成）**：README 已集中说明安装、AI 配置、备份、隐私、安全、支持范围、已知限制、版本通道和反馈入口，并补 CI badge。
7. **P6.12.7 发布密钥恢复能力（用户运营事项、非阻塞）**：updater 私钥仍需用户在受控加密介质上建立离线备份并演练恢复。扩大外部测试前必须完成，但不再阻塞 P6 工程阶段冻结。
8. **P6.12.8 阶段验收与冻结（完成）**：正式发布流水线、Release Checklist、QA Matrix、恢复/诊断文档和安全基线均已建立；未完成的人工作业和增强项已明确移入发布运营清单或持续 QA。

完成标准：

- 已发布 Alpha.4 包含旧 PDF 本地文件读取修复并通过签名、公证、Gatekeeper、独立下载和正式旧书回归；后续本地 MOBI/阅读器修复明确进入下一候选包回归清单。
- 自动更新发布链、签名清单、安装前恢复点和失败保留恢复点均已实现；Alpha.3 -> Alpha.4 的 App 内体验验收由用户自行执行并记录，不阻塞阶段冻结。
- schema、当前目录备份、损坏备份、恢复回滚和合并导入已有固定 fixture 或 Rust 测试与预期；新增历史迁移样本改为 schema 变更时的持续要求。
- CI 覆盖前端构建、Rust 检查与测试、release preflight、安全扫描和 RustSec 审计。
- 新用户可以只读 README/发布说明完成安装、AI 配置、备份和问题反馈。
- 发布密钥、回滚方法、诊断方法和人工发布检查都有可执行记录。

## 推荐执行顺序

P6.1-P6.12 的工程基线已于 2026-07-13 完成并冻结。`v0.2.0-alpha.4` 已完成签名、公证、updater artifacts、GitHub prerelease、Alpha manifest、独立下载和正式旧 PDF 回归；当前工作重心是 P7 连续陪读与按需协助。

推荐顺序：

1. 下一候选版本必须带入尚未发布的混合 MOBI/KF8、动态文本分屏、精确划词和笔记高亮修复，并执行 `SMK-004 + LIB-006 + RD-002A`。
2. 用户在方便时自行完成 Alpha.3 -> Alpha.4 App 内更新验收，并把结果补到 Release Checklist/QA Matrix。
3. 扩大外部测试前，由用户完成 updater 私钥加密离线备份和一次恢复演练。
4. 开发主线进入 P7；P8 为手机版 App，P9 为云后端与多设备同步。

如果目标变成“尽快给少数可信用户试用”，可以把 P6.7 提前到 P6.6 之前，但必须保留 P6.1 的恢复事务/备份校验、P6.2 的结构化存储边界和 P6.5 的基础安全护栏。

## 每次推进时必须更新

- [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md)：记录本次做了什么、验证了什么、还有什么限制。
- [ROADMAP.md](./ROADMAP.md)：更新当前状态和对应阶段进度。
- [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)：任何 schema、迁移、备份格式变化都要同步。
- [BACKEND_DEVELOPMENT_STANDARDS.md](./BACKEND_DEVELOPMENT_STANDARDS.md)：如果改变 Tauri/Rust、Keychain、AI transport、备份或诊断标准，需要同步。
- [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md)：如果新增固定任务类型，需要补接手提示词。
- [PUBLIC_READINESS_CHANGES.md](./PUBLIC_READINESS_CHANGES.md)：涉及公开前安全、隐私、仓库成熟度时同步。

## 明确的外部阻塞

- 正式签名和 notarization 需要 Apple Developer 账号和证书。
- 自动更新需要签名密钥、更新包托管位置和版本通道策略。
- CI 发布流水线如果使用 GitHub Actions，需要仓库远端、密钥管理和 release 权限。
- P6.12.7 的 updater 私钥加密离线备份需要用户准备受控离线介质并亲自保管。
- 云同步或云端模型代理属于 P9，需要重新设计隐私政策、数据流和后端运维边界。
