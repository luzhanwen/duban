# 读伴 App 化路线与实施日志

> 最后更新：2026-07-07

这份文档专门记录「读伴」从纯前端 MVP 演进为本地优先 App 的路线、阶段边界和每次实际完成的工作。

它和 [ROADMAP.md](./ROADMAP.md) 的分工不同：

- `ROADMAP.md` 记录整体产品路线、阶段优先级和 Backlog。
- 本文档记录 App 化专项路线、每次工程推进、验证结果和下一步。

## 维护规则

每次完成和 App 化相关的工作后，都要更新本文档：

- 更新顶部「最后更新」日期。
- 如果路线、阶段范围或取舍发生变化，更新「当前路线」。
- 在「实施日志」新增一条记录，写清楚日期、阶段、目标、改动、验证和后续限制。
- 如果改动影响整体产品优先级，也要同步更新 [ROADMAP.md](./ROADMAP.md)。
- 如果改动影响架构共识或数据结构，也要同步更新 [PROJECT_NOTES.md](./PROJECT_NOTES.md)。

## 当前路线

### 阶段 1：App 化边界

目标：保留现有纯前端能力，同时把运行环境、存储、文件和 AI 请求边界抽出来。

完成标准：

- 业务代码不再到处直接绑定浏览器文件 API。
- 存储调用先经过 adapter，但底层仍使用 IndexedDB。
- AI 调用先经过 transport，但底层仍使用浏览器 `fetch`。
- 浏览器版功能和数据格式保持不变。

状态：已完成。

### 阶段 2：Tauri 桌面壳

目标：把现有 React/Vite 应用放进 Tauri 桌面窗口，先跑通桌面开发环境。

完成标准：

- 项目包含 `src-tauri/`。
- 可以运行 `npm run tauri dev` 打开桌面窗口。
- Vite 开发地址和 Tauri 配置对齐。
- 现有上传、阅读、设置、AI 配置流程在桌面窗口中基本可用。

状态：已完成。桌面窗口已能启动；上传、PDF/MOBI、AI 等详细功能验证进入阶段 3。

### 阶段 3：桌面 MVP 验证

目标：先不迁移大存储，验证现有 IndexedDB 方案在桌面壳中的真实表现。

完成标准：

- PDF.js 渲染正常。
- MOBI 解析正常。
- 关闭并重新打开 App 后，本地书库、进度、笔记和设置仍可读取。
- AI 非流式和流式调用在桌面窗口中可用。

状态：已通过。用户在桌面测试环境中完成验证，反馈“测试下来没什么问题”。

当前验收清单：

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| Tauri 测试环境启动 | 通过 | `npm run tauri:dev` 已启动 Vite dev server 和 `target/debug/duban` 桌面进程。 |
| Vite 本地服务 | 通过 | `http://localhost:5173/` 返回 HTTP 200。 |
| 前端页面渲染 | 通过 | 浏览器侧确认标题为 `读伴 · Duban`，`#root` 存在，书架页可读取本地数据。 |
| Rust/Tauri 编译检查 | 通过 | `cargo check` 通过。 |
| 前端生产构建 | 通过 | `npm run build` 通过；仍有既有 chunk 体积提示。 |
| 桌面窗口人工检查 | 通过 | 用户完成桌面测试，未反馈异常。 |
| PDF 上传和阅读 | 通过 | 用户完成桌面测试，未反馈异常。 |
| MOBI 上传和阅读 | 通过 | 用户完成桌面测试，未反馈异常。 |
| IndexedDB 持久化 | 通过 | 用户完成桌面测试，未反馈异常。 |
| 笔记保存和恢复 | 通过 | 用户完成桌面测试，未反馈异常。 |
| AI 连接测试 | 通过 | 用户完成桌面测试，未反馈异常。 |
| AI 流式问答 | 通过 | 用户完成桌面测试，未反馈异常。 |

### 阶段 4：AI 请求迁到 Tauri 后端

目标：让桌面版模型请求不再依赖浏览器直连，降低 CORS 和 API Key 暴露问题。

完成标准：

- 前端通过统一 transport 调用 Tauri command。
- Rust/Tauri 后端负责发起模型 HTTP 请求。
- Claude 和 OpenAI-compatible 两条路径都可用。
- 浏览器版仍保留现有直连能力。

状态：已完成。代码编译、前端构建和桌面启动验证已通过；仍建议用户在桌面窗口内用真实 API Key 回归一次连接测试和流式问答。

### 阶段 5：长期本地存储

目标：把桌面版从 IndexedDB 迁移到更可靠的本地文件系统 + SQLite 形态。

完成标准：

- SQLite 保存书籍元数据、章节、计划、进度、导读缓存、聊天、读后交流、笔记和设置。
- 原始 PDF/MOBI、封面和导出备份保存在 App 数据目录。
- 提供从旧 IndexedDB 数据迁移或导出的路径。
- 存储 adapter 可以按运行环境分流。

状态：进行中。第一版本地数据后端已完成；阶段 5.2 schema 文档已建立；阶段 5.3 已把 `books` 迁到结构化 `books` / `book_chapters` 表；阶段 5.4 已把阅读计划和阅读进度迁到结构化表；阶段 5.5 已把笔记、聊天、读后交流和章节导读缓存迁到结构化表；阶段 5.6 已把原始文件索引和分页文本迁到结构化表，并让桌面读取文件时使用本地文件引用；阶段 5.7 已把桌面 API Key 迁入系统 Keychain；阶段 5.8 已加入备份导出/导入和显式 schema 迁移器；阶段 5.9 已把桌面备份升级为目录式、可预览、可校验、可合并导入；P6.1 已补 manifest/file sha256、失败自动回滚、外部路径导入和备份操作入口；P6.2 已把非敏感 settings、封面缓存和 AI 排版缓存迁到结构化表；P6.3 已完成大文件导入限制、进度、取消、重试和友好错误主体；P6.4 AI transport 生产化主体已完成；P6.5 安全与隐私加固基础版已完成。备份压缩归档、备份签名和迁移夹具仍待继续推进。

### 阶段 6：打包、备份和发布准备

目标：从可开发的桌面 App 走向可安装、可备份、可升级的本地产品。

完成标准：

- 可以生成桌面安装包。
- App 名称、图标、bundle identifier 和版本号明确。
- 支持导出/导入关键阅读数据。
- 有数据 schema 版本和迁移策略。
- 后续再评估签名、公证、自动更新和崩溃日志。

状态：部分完成。已能生成本地测试版 macOS `.app` 和 `.dmg` 入口；阶段 5.9 已提供目录式备份、导入前预览、校验报告和合并导入；P6.1-P6.6 基础版已完成；桌面版关闭窗口进入后台的基础行为已完成；正式签名、公证、自动更新和崩溃日志仍未完成。

## 实施日志

### 2026-07-08：桌面版关闭窗口进入后台

阶段：P6.7 发布体验准备

目标：

- 让桌面版更符合常驻阅读 App 的预期：点窗口叉号不直接退出进程，而是隐藏窗口进入后台。
- macOS 点击 Dock 图标时可以重新显示主窗口。

改动：

- Tauri 全局窗口事件中拦截主窗口 `CloseRequested`：
  - 调用 `prevent_close()` 阻止进程退出。
  - 调用 `hide()` 隐藏主窗口。
  - 写入脱敏本地诊断日志 `app.window_hidden_to_background`。
- Tauri 事件循环中处理 macOS `RunEvent::Reopen`：
  - 当没有可见窗口时，重新 `show()` 主窗口并 `set_focus()`。
- 真正退出仍交给系统级退出行为，例如 `Cmd+Q` 或应用菜单退出。

验证：

- `cd src-tauri && cargo fmt --check` 已通过。
- `cd src-tauri && cargo check` 已通过。
- `cd src-tauri && cargo test` 已通过，25 个 Rust 测试全部通过。
- `git diff --check` 已通过。

### 2026-07-08：Dock 右键退出的 dev 图标割裂定位

阶段：P6.7 发布体验准备

现象：

- 在 `npm run tauri:dev` 启动的桌面测试环境中，从 Dock 右键退出时可能短暂看到终端/调试进程相关图标，视觉上不像正式 App。

判断：

- `tauri:dev` 运行的是未打包的 debug 二进制 `target/debug/duban`，不是最终 `.app` bundle。
- 这类 Dock 图标闪烁属于开发态进程身份和 macOS Dock 缓存/启动进程的边界问题；正式安装包应以 `.app` bundle、`Info.plist` 和 `icon.icns` 作为 Dock 身份。

处理：

- 执行 `npm run tauri:build`，重新生成正式 `.app` 测试包：
  - `src-tauri/target/release/bundle/macos/读伴.app`
- 已打开该 `.app` 作为本轮视觉验证对象；后续检查 Dock 退出、Dock 唤回和图标一致性时，应优先使用这个 bundle 测试包，而不是 `tauri:dev`。

验证：

- `npm run tauri:build` 已通过；仍只有既有 Vite chunk 体积提示。

### 2026-07-07：P6.6.1 + P6.6.2 诊断规范与本地日志基础

阶段：P6.6，本地诊断与可支持性

目标：

- 先定义诊断字段和隐私过滤规则，避免后续诊断包把正文或密钥带出去。
- 建立桌面版本地 JSONL 诊断日志，为后续数据库健康检查和诊断包导出打底。

改动：

- 新增 [DIAGNOSTICS_PRIVACY_SPEC.md](./DIAGNOSTICS_PRIVACY_SPEC.md)，记录允许字段、禁止字段、脱敏规则、日志格式和新增字段审核清单。
- 新增 Rust 模块 `src-tauri/src/diagnostics.rs`：
  - 写入 `logs/duban-diagnostics.jsonl`。
  - 超过 1 MB 后轮转为 `duban-diagnostics.1.jsonl`。
  - 写入前统一脱敏 API Key、Authorization、prompt、messages、content、text、note、chat、base64、raw_json 等字段。
  - URL 字段只保留 origin。
- Tauri 启动时记录 App 启动和 SQLite 初始化成功/失败。
- AI 请求记录开始、成功、失败和取消事件，只记录供应商、模型、Base URL origin、消息数量、attempts、finishReason、truncated、错误码和 HTTP 状态等摘要。
- 更新生产级路线、后端开发标准、隐私说明、文档索引和 Roadmap。

验证：

- 先运行了 `cargo test diagnostics`，5 个诊断模块测试通过。
- `cd src-tauri && cargo fmt --check` 已通过。
- `cd src-tauri && cargo test` 已通过，23 个 Rust 测试全部通过。
- `cd src-tauri && cargo check` 已通过。
- `npm run security:scan` 已通过。
- `npm run build` 已通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 已通过。

限制：

- 目前还没有设置页导出诊断包入口。
- 截至该小阶段，数据库健康检查 command、诊断包导出、备份操作日志和错误详情复制仍在 P6.6 后续步骤。

### 2026-07-07：P6.6.3 + P6.6.4 健康检查与诊断包导出

阶段：P6.6，本地诊断与可支持性

目标：

- 让桌面后端能主动检查本地数据库和文件系统健康状态。
- 让用户后续可以一键导出一个不含密钥和正文的诊断包。

改动：

- 新增 `duban_diagnostics_health_check` Tauri command：
  - 返回当前 schema 版本、期望 schema 版本和 SQLite `quick_check`。
  - 返回关键 SQLite 表计数。
  - 检查本地文件索引是否有缺失文件或不安全相对路径。
  - 复用孤儿文件扫描，返回孤儿文件数量、体积和前 50 条相对路径。
  - 检查备份目录是否存在、可读、可写。
  - 返回非敏感 API Key 状态，只读 `app_settings.hasApiKey`，不读取 Keychain 明文。
- 新增 `duban_diagnostics_export_package` Tauri command：
  - 导出单个 JSON 诊断包到 App 数据目录 `diagnostics/duban-diagnostics-{timestamp}.json`。
  - 包含 App 摘要、健康检查、备份摘要、设置摘要、AI 调用诊断和最近 400 条本地诊断日志。
  - 导出前再次执行统一脱敏，不包含 API Key、prompt、章节正文、笔记正文、聊天全文、base64 文件内容或绝对文件路径。
- 新增前端 helper `src/lib/diagnostics.js`，后续设置页可以调用健康检查和导出诊断包。
- 更新诊断规范、生产路线、Roadmap、隐私说明和 docs 索引。

验证：

- `cd src-tauri && cargo fmt --check` 已通过。
- `cd src-tauri && cargo test` 已通过，25 个 Rust 测试全部通过。
- `cd src-tauri && cargo check` 已通过。
- `npm run security:scan` 已通过。
- `npm run build` 已通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 已通过。

限制：

- 目前只有后端 command 和前端 helper，设置页 UI 入口留到 P6.6.5。
- 诊断包当前是单个 JSON 文件，不是 zip；后续如果要包含更多文件，可以在保持脱敏规则的前提下升级 packageVersion。
- 备份导入/导出和 schema 迁移的更多事件日志仍待后续补齐。

### 2026-07-07：P6.6.5 + P6.6.6 诊断入口、错误详情复制与收尾

阶段：P6.6，本地诊断与可支持性

目标：

- 把 P6.6.3/P6.6.4 的后端诊断能力放进设置页。
- 给用户一个可以复制给开发者的脱敏错误详情。
- 固定 P6.6 的回归验证命令，并完成文档收口。

改动：

- 设置页「诊断」面板新增桌面健康检查入口：
  - 调用 `duban_diagnostics_health_check`。
  - 展示状态、问题数量、schema、SQLite quick_check、缺失文件、孤儿文件、备份目录状态和非敏感 Key 状态。
- 设置页「诊断」面板新增导出诊断包入口：
  - 调用 `duban_diagnostics_export_package`。
  - 显示导出文件名、本机路径、包大小、健康状态和日志条数。
- 新增错误详情复制：
  - 可以复制最近一条异常 AI 调用摘要。
  - 单条异常诊断也可以单独复制。
  - 复制内容只包含任务、状态、错误码、HTTP 状态、供应商、模型、Base URL origin、耗时、token、费用估算和尝试次数。
- 备份导出、导入、删除和元数据更新会写入脱敏本地诊断日志：
  - 不记录外部路径、标签/备注正文、书籍内容、文件内容或 API Key。
  - 日志失败不会阻断备份主流程。
- 更新诊断规范、生产路线、Roadmap、项目笔记、后端标准和 AI 接手提示词。

验证：

- `cd src-tauri && cargo fmt --check` 已通过。
- `cd src-tauri && cargo test` 已通过，25 个 Rust 测试全部通过。
- `cd src-tauri && cargo check` 已通过。
- `npm run security:scan` 已通过。
- `npm run build` 已通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 已通过。

限制：

- 诊断包当前仍是单个 JSON 文件，不包含附件；如果后续需要更多文件，应升级 packageVersion。
- 正式签名、公证、自动更新和崩溃日志进入 P6.7 之后继续推进。

### 2026-07-07：P6.5 安全与隐私加固完整收尾

阶段：P6.5，安全与隐私加固

目标：

- 在进入本地诊断包之前，先把发布前可预见的安全风险做一次基础收束。
- 让依赖审计、Tauri 权限、CSP、安全头、输入校验和敏感信息边界有可复跑检查。

改动：

- Tauri 存储 command 新增 key、book id、外部备份路径和本地文件相对路径校验；封面、备份、孤儿文件清理等路径读取改为统一安全拼接。
- 桌面配置新增正式 CSP、dev CSP、`X-Content-Type-Options` 和 `Permissions-Policy`；Web 静态部署新增 `public/_headers`，包含 `Referrer-Policy`。
- 新增 `scripts/security_scan.mjs` 和 `npm run security:scan`，并把它并入 `npm run security:audit`。
- 更新 `SECURITY.md`、`PRIVACY.md`、`SECURITY_PRIVACY_AUDIT.md`、`PRODUCTION_UPGRADE_PLAN.md`、`PUBLIC_READINESS_CHANGES.md`、`BACKEND_DEVELOPMENT_STANDARDS.md` 和 `AI_HANDOFF_PROMPTS.md`。

验证：

- `npm run security:scan` 已通过。
- `npm run security:audit` 已在联网权限下通过，`npm audit` 为 0 vulnerabilities。
- `cd src-tauri && cargo fmt --check` 已通过。
- `cd src-tauri && cargo test` 已通过，18 个 Rust 测试全部通过。
- `cd src-tauri && cargo check` 已通过。
- `npm run build` 已通过；仍只有既有 Vite chunk 体积提示。
- `npm run build:formal` 已通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 已通过。

限制：

- `cargo audit` 仍未纳入当前本机命令，需要在 P6.9 CI 或本机安装后补齐 RustSec 漏洞审计。
- `public/_headers` 只覆盖支持该约定的静态托管平台；未来部署到其他平台时要迁移同等响应头配置。

### 2026-06-18：创建 App 化路线与实施日志

阶段：文档治理

目标：

- 为「纯前端 -> 桌面 App」路线建立一个稳定记录入口。
- 避免 App 化相关决策散落在对话、`ROADMAP.md` 和普通开发日志里。

改动：

- 新增本文档，固定 App 化专项路线。
- 明确每次相关工作完成后都要更新本文档。
- 区分本文档、`ROADMAP.md` 和 `PROJECT_NOTES.md` 的职责。
- 已同步更新 `docs/README.md` 文档索引。

验证：

- 文档已加入仓库，并已挂入 docs 索引。

后续：

- 每完成一个 App 化阶段或重要子任务，都在本节追加日志。

### 2026-06-18：阶段 1 完成 App 化边界

阶段：阶段 1，App 化边界

目标：

- 在不改变现有浏览器版行为的前提下，先抽出运行环境、存储、文件和 AI 请求边界。
- 为后续 Tauri 接入、AI 后端代理、SQLite/文件系统迁移预留替换点。

改动：

- 新增 `src/lib/runtime.js`，识别当前运行环境，先支持 `browser` 和 `tauri` 两类目标。
- 新增 `src/lib/storageAdapter.js`，把当前 localforage + IndexedDB 封装为 browser storage adapter。
- 调整 `src/lib/storage.js`，保留原有 `getItem`、`setItem`、`removeItem`、`getSettings`、`saveSettings`、`clearAll` 等门面，底层改为调用 `storageAdapter`。
- 新增 `src/lib/fileAdapter.js`，集中处理文件 ArrayBuffer 读取、TXT 读取、测试书 URL 转 File、文本文件下载。
- 将 PDF 解析、PDF 封面生成、PDF 阅读器、设置页配置导入/导出、书架测试书导入切到 `fileAdapter`。
- 新增 `src/lib/aiTransport.js`，把 Claude 和 OpenAI-compatible 的调用分发集中到 browser AI transport。
- 调整 `src/lib/ai.js`，保留原有 `callModelDetailed`、`streamModelDetailed`、`testModelConnection` 门面，底层改为调用 `aiTransport`。

验证：

- 已运行 `npm run build`，构建通过。
- 构建输出仍有 Vite 对 chunk 体积和 `sax` 浏览器兼容的提示，但没有新增编译错误。

限制：

- Tauri 分支目前仍回退到 browser adapter / browser transport，只是先占好接口。
- 原始书籍文件、分页文本、设置、笔记和聊天记录仍保存在 IndexedDB。
- AI 请求仍由浏览器 `fetch` 发起，CORS 和 API Key 暴露问题留到阶段 4 解决。

后续：

- 进入阶段 2：初始化 Tauri 桌面壳，跑通 `npm run tauri dev`。

### 2026-06-18：阶段 2 完成 Tauri 桌面壳

阶段：阶段 2，Tauri 桌面壳

目标：

- 在现有 Vite/React 项目中接入 Tauri v2。
- 让读伴可以通过桌面开发窗口启动，而不是只作为浏览器页面运行。

改动：

- 安装 `@tauri-apps/cli@2.11.2`，并在 `package.json` 增加：
  - `npm run tauri`
  - `npm run tauri:dev`
  - `npm run tauri:build`
- 使用 Tauri CLI 初始化 `src-tauri/`。
- 调整 `src-tauri/tauri.conf.json`：
  - 产品名为 `读伴`。
  - bundle identifier 为 `com.duban.reader`。
  - `devUrl` 指向 `http://localhost:5173`。
  - `frontendDist` 指向 `../dist`。
  - 默认窗口改为 `1280 x 820`，最小尺寸 `960 x 640`。
- 调整 `src-tauri/Cargo.toml` 和入口代码：
  - Rust package 改名为 `duban`。
  - lib 改名为 `duban_lib`。
  - license 设为 `MIT`。
- 调整 `vite.config.js`：
  - Tauri 开发时固定端口 `5173`。
  - 增加 `strictPort`，避免 Tauri devUrl 和 Vite 端口漂移。
  - Tauri 开发时不自动额外打开浏览器。
  - 忽略 `src-tauri/**` 的 Vite 文件监听。
  - 增加 Tauri 推荐的 build target、debug sourcemap 和 minify 分支。
- 安装 Rust minimal toolchain，用于编译 Tauri Rust 侧工程。
- 处理 macOS 对 `@tauri-apps/cli-darwin-arm64` native binding 的系统策略拦截：
  - 对项目本地 `.node` 文件做 ad-hoc codesign。
  - 将 `tauri` npm script 写成显式 `node node_modules/@tauri-apps/cli/tauri.js`，绕开当前环境中 `npm exec tauri` 被中止的问题。

验证：

- `npm run build` 通过。
- `npm run tauri -- --version` 输出 `tauri-cli 2.11.2`。
- `rustc --version` 输出 `rustc 1.96.0`。
- `cargo --version` 输出 `cargo 1.96.0`。
- `cargo check` 在 `src-tauri/` 下通过。
- `npm run tauri:dev` 已成功启动：
  - Vite dev server: `http://localhost:5173/`
  - Tauri dev command: `cargo run`
  - 桌面应用进程：`target/debug/duban`
- 验证后已中断 `tauri:dev` 进程，未留下后台会话。

限制：

- 目前仍使用 Tauri 默认图标，正式品牌图标留到打包发布阶段处理。
- 桌面窗口已能启动，但 PDF/MOBI 上传、IndexedDB 持久化、AI 非流式/流式调用尚未逐项验收。
- `tauri info` 曾经在环境探测中长时间不退出；已用 `cargo check` 和 `tauri:dev` 作为本阶段主要验证。
- 本阶段只接入桌面壳，不引入 Tauri 文件系统、SQLite 或后端 AI 代理。

后续：

- 进入阶段 3：在桌面窗口中逐项验证上传、阅读、持久化和 AI 调用。

### 2026-06-18：阶段 3 启动桌面测试环境

阶段：阶段 3，桌面 MVP 验证

目标：

- 启动可供人工验收的 Tauri 桌面测试环境。
- 先完成不依赖用户本地书籍和 API Key 的基础健康检查。

改动：

- 启动 `npm run tauri:dev`，同时运行：
  - Vite dev server: `http://localhost:5173/`
  - Tauri desktop process: `target/debug/duban`
- 将阶段 3 状态改为进行中。
- 在阶段 3 下新增验收清单，区分自动已通过项目和需要人工验收的项目。

验证：

- `curl -I http://localhost:5173/` 返回 HTTP 200。
- 内置浏览器访问 `http://localhost:5173/` 成功：
  - 页面标题为 `读伴 · Duban`。
  - `#root` 存在。
  - 书架页可读取本地数据，当前能看到已有 1 本书。
- `cargo check` 通过。
- `npm run build` 通过。

限制：

- Node `fetch('http://127.0.0.1:5173/')` 在当前沙箱中被 `EPERM` 拦截，但 `curl` 和浏览器访问均正常，因此不作为应用失败处理。
- 桌面窗口内的 PDF/MOBI 上传、阅读、笔记、关闭重开恢复和 AI 调用需要用户在当前运行中的桌面窗口里手动验证。

后续：

- 用户按阶段 3 清单完成桌面窗口人工验收后，把结果继续追加到本文档。

### 2026-06-18：阶段 3 重启桌面测试环境

阶段：阶段 3，桌面 MVP 验证

目标：

- 按用户要求重启当前 Tauri 桌面测试环境。

操作：

- 中断上一组 `npm run tauri:dev` 会话。
- 重新启动 `npm run tauri:dev`。
- 新环境启动后，Vite dev server 继续监听 `http://localhost:5173/`，Tauri 桌面进程为 `target/debug/duban`。

验证：

- `curl -I http://localhost:5173/` 返回 HTTP 200。
- 重启时间：2026-06-18 10:59:56 CST。

后续：

- 继续在当前桌面窗口中执行阶段 3 人工验收。

### 2026-06-18：阶段 3 人工验收通过

阶段：阶段 3，桌面 MVP 验证

结果：

- 用户反馈“测试下来没什么问题”。
- 阶段 3 状态更新为已通过。

说明：

- 本次反馈视为桌面 MVP 基础流程验收通过。
- 后续若发现具体 PDF/MOBI、IndexedDB 或 AI 调用边界问题，再作为阶段 3 回归项或阶段 4/5 的专项问题记录。

后续：

- 进入阶段 4：AI 请求迁到 Tauri 后端。

### 2026-06-18：阶段 4 完成 AI 请求迁到 Tauri 后端

阶段：阶段 4，AI 请求迁到 Tauri 后端

目标：

- 桌面版不再通过浏览器 `fetch` 直接请求模型服务。
- 通过 Tauri Rust command 发起模型 HTTP 请求，降低浏览器 CORS 问题。
- 保持浏览器版原有 BYOK 直连能力不变。

改动：

- 新增前端 `src/lib/tauriAiTransport.js`：
  - Tauri runtime 下使用 `@tauri-apps/api/core` 的 `invoke` 调用 Rust command。
  - 非流式调用走 `duban_ai_call_model`。
  - 流式调用走 `duban_ai_stream_model`，通过 Tauri event 接收文本增量。
  - `testModelConnection` 改为通过 Tauri command 发起 ping。
- 调整 `src/lib/aiTransport.js`：
  - 浏览器 runtime 继续使用 `browserAiTransport`。
  - Tauri runtime 切换为 `tauriAiTransport`。
- 新增 Rust 侧 AI command：
  - `duban_ai_call_model`：非流式模型调用。
  - `duban_ai_stream_model`：流式模型调用，并通过事件发送 chunk。
- Rust 侧支持供应商：
  - Anthropic Claude Messages API。
  - OpenAI-compatible Chat Completions。
- Rust 侧实现：
  - 中文错误提示映射。
  - Anthropic SSE 解析。
  - OpenAI-compatible SSE 解析。
  - OpenAI usage 字段规范化为 `input_tokens` / `output_tokens`。
  - Kimi/Moonshot Base URL 下使用 `max_completion_tokens`。
- 新增依赖：
  - 前端：`@tauri-apps/api@2.11.1`。
  - Rust：`reqwest`、`futures-util`。
- 调整 `src-tauri/capabilities/default.json`：
  - 显式允许 `core:event:allow-listen` 和 `core:event:allow-unlisten`，用于前端接收流式 chunk 事件。

验证：

- `npm run build` 通过。
- `cargo fmt` 已运行。
- `cargo check` 通过。
- `npm run tauri:dev` 在新增 command 和 event 权限后成功启动桌面应用。
- 验证结束后已中断 `tauri:dev`，没有留下后台开发进程。

限制：

- 本轮没有在对话中使用真实 API Key 发起外部模型调用；真实 Anthropic/OpenAI-compatible 连接与流式输出仍建议用户在桌面窗口内回归一次。
- API Key 当前仍保存在前端 IndexedDB 设置里，并通过本地 IPC 传给 Rust command；长期更安全的 Key 存储策略留到后续阶段评估。
- 原始书籍、笔记和聊天记录仍使用 IndexedDB，存储迁移留到阶段 5。

后续：

- 在桌面窗口中用真实 API Key 回归：
  - 设置页测试连接。
  - 章节导读非流式生成。
  - 阅读中伴读流式问答。
- 进入阶段 5 前，先确认是否要把 API Key 存储也纳入本地安全存储策略。

### 2026-06-18：阶段 6 子任务打通本地 macOS 安装入口

阶段：阶段 6，打包、备份和发布准备

背景：

- 用户确认桌面软件最终应有可双击打开或安装的入口，例如 macOS `.app` / `.dmg`。
- `npm run tauri:dev` 只是开发调试模式，不适合作为普通用户入口。

改动：

- 调整 `package.json`：
  - `npm run tauri:build` 改为只生成 `.app`，避免被当前环境中的 Tauri 官方 DMG 美化脚本阻断。
  - 新增 `npm run tauri:build:all`，保留 Tauri 官方全量 bundle 命令。
  - 新增 `npm run package:mac-local`，用于生成本地测试版 `.app` + `.dmg`。
- 新增 `scripts/build-local-dmg.sh`：
  - 读取 `package.json` 版本号。
  - 对生成的 `读伴.app` 做本地 ad-hoc codesign。
  - 使用 macOS `hdiutil` 生成朴素 DMG。
  - DMG 内包含 `读伴.app` 和 `Applications` 快捷方式。
- 更新 README，说明开发模式、`.app`、本地测试版 `.dmg` 和正式签名/公证的区别。
- 更新 `ROADMAP.md` 的长期产品形态进展。

验证：

- `npm run package:mac-local` 通过。
- 生成 `.app`：
  - `src-tauri/target/release/bundle/macos/读伴.app`
- 生成本地测试版 DMG：
  - `src-tauri/target/release/bundle/dmg/读伴_0.1.0_arm64_local.dmg`
  - 当前大小约 `5.3 MB`。
- `codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/读伴.app` 通过。
- `file src-tauri/target/release/bundle/dmg/读伴_0.1.0_arm64_local.dmg` 可识别为压缩镜像数据。

限制：

- 当前 DMG 是本地测试包，使用 ad-hoc 签名，不是 Apple Developer ID 正式签名。
- 当前 DMG 没有 notarization，分发给其他机器时仍可能出现 macOS Gatekeeper 提示。
- Tauri 官方 fancy DMG 打包在当前环境中已经能生成 `.app`，但最后 `bundle_dmg.sh` 步骤失败；本轮用朴素 DMG 脚本绕过 Finder 美化依赖。
- 本轮只解决可双击入口，不处理数据备份、自动更新、崩溃日志或长期存储迁移。

后续：

- 阶段 5 继续推进长期本地存储。
- 正式发布前补 Apple Developer ID 签名、notarization、品牌图标和版本发布策略。

### 2026-06-18：阶段 5 第一版本地数据后端

阶段：阶段 5，长期本地存储

目标：

- 让 Tauri 桌面版不再继续把长期数据只放在 WebView IndexedDB。
- 先保持前端 `storage.js` / `books.js` 门面不变，用 adapter 切换桌面存储后端。
- 把普通 JSON 数据放进 SQLite，把原始 PDF/MOBI 文件放进 App 数据目录。

改动：

- 新增 `src-tauri/src/storage.rs`：
  - 初始化 App 数据目录：`~/Library/Application Support/com.duban.reader/`。
  - 创建本地数据库：`duban.sqlite3`。
  - 创建 `kv_store`、`file_store`、`schema_meta` 三张表。
  - 提供 Tauri commands：读取、写入 JSON、写入文件、删除、列 key、清空。
  - 原始书籍文件写入 `files/` 目录，SQLite 只保存文件名、MIME、大小和相对路径。
- 新增 `src/lib/tauriStorageAdapter.js`：
  - Tauri runtime 下通过 `@tauri-apps/api/core` 调用本地存储 command。
  - 普通对象/数组/字符串按 JSON 写入 SQLite。
  - `File` / `Blob` 转为文件写入本地文件目录，读取时还原为 `File`。
  - 首次运行会从 legacy IndexedDB 自动迁移已有数据；如果 Tauri SQLite 已有数据，则跳过迁移并写入标记。
- 调整 `src/lib/storageAdapter.js`：
  - 浏览器版继续使用 localforage + IndexedDB。
  - Tauri 桌面版切到 `tauriStorageAdapter`。
- 新增 Rust 依赖：
  - `rusqlite`，用于 SQLite。
  - `base64`，用于前端 IPC 传输文件内容。

验证：

- `npm run build` 通过。
- `cargo fmt` 已运行。
- `cargo check` 通过。
- `npm run tauri:dev` 成功启动桌面应用。
- `curl -I http://localhost:5173/` 返回 HTTP 200。
- 已确认 App 数据目录生成：
  - `~/Library/Application Support/com.duban.reader/duban.sqlite3`
  - `~/Library/Application Support/com.duban.reader/files/`
- 已确认 SQLite 表存在：
  - `kv_store`
  - `file_store`
  - `schema_meta`
- 已确认旧 IndexedDB 数据自动迁移：
  - `kv_store` 中出现 `books`、`settings`、`progress:*`、`book:*:pages`、`book:*:cover`、`book:*:questions:*` 和迁移标记。
  - `file_store` 中出现原始 PDF：`万历十五年（经典版）.pdf`，大小约 `4.8 MB`。
  - `files/` 目录下出现对应 `.blob` 文件。
- 验证结束后已停止 `npm run tauri:dev`，没有留下后台开发进程。

限制：

- 当前 SQLite 仍是通用 key-value 存储，不是最终结构化表设计。
- `books`、`pages`、笔记、聊天、导读缓存等仍以 JSON blob 保存；后续要拆成更可查询、更可迁移的表。
- 文件经 Tauri IPC 传输时使用 base64，适合当前 MVP 验证；超大 PDF 后续需要更直接的文件导入路径。
- API Key 当前在桌面版随 `settings` 保存到 SQLite，尚未进入系统 Keychain。
- 本轮未实现导出/导入备份、schema 版本迁移器、崩溃恢复或自动更新。

后续：

- 继续阶段 5.4：把阅读计划和阅读进度拆为结构化 SQLite 表。
- 后续再把笔记、聊天、读后交流和导读缓存逐步结构化。
- 评估 API Key 是否迁入系统 Keychain。
- 增加数据导出/导入备份命令。

### 2026-06-18：阶段 5.2 + 5.3 书籍元数据结构化

阶段：阶段 5，长期本地存储

目标：

- 先把桌面存储 schema 写清楚，避免后续迁移靠口头约定推进。
- 将 `KEYS.books` 从通用 `kv_store` 迁到结构化 SQLite 表。
- 保持前端 `listBooks`、`getBook`、`updateBook`、`deleteBook` 等 API 不变，让上层业务无感迁移。

改动：

- 新增 [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)：
  - 记录 App 数据目录和 SQLite 数据库位置。
  - 记录当前已实现表：`kv_store`、`file_store`、`books`、`book_chapters`、`schema_meta`。
  - 记录目标表：`book_files`、`book_pages`、`reading_plans`、`reading_plan_items`、`reading_progress`、`notes`、`chat_messages`、`reflection_messages`、`reading_guides`、`settings`。
  - 明确后续迁移顺序。
- 更新 `docs/README.md`，把桌面存储 schema 文档加入索引和维护规则。
- 扩展 `src-tauri/src/storage.rs`：
  - `schema_version` 升到 `2`。
  - 新增 `books` 表，用于保存书籍结构化索引和完整 `raw_json`。
  - 新增 `book_chapters` 表，用于保存章节结构化索引和完整 `raw_json`。
  - `duban_storage_get_item("books")` 改为从 `books` 表读取并按 `list_order` 返回数组。
  - `duban_storage_set_item("books", value)` 改为同步写入 `books` / `book_chapters`，并清理旧 `kv_store.books`。
  - 初始化时如果发现旧 `kv_store.books`，会自动迁移到结构化表。
  - `keys()` 会在结构化书籍存在时返回 `books`，保持旧前端清理逻辑兼容。

验证：

- `cargo fmt` 已运行。
- `cargo check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run tauri:dev` 成功启动桌面应用并触发 schema 初始化。
- `curl -I http://localhost:5173/` 返回 HTTP 200。
- 已确认 SQLite 表：
  - `books`
  - `book_chapters`
  - `file_store`
  - `kv_store`
  - `schema_meta`
- 已确认 `schema_meta.schema_version = 2`。
- 已确认当前本地数据迁移结果：
  - `books` 表有 1 条书籍记录：`万历十五年（经典版）`。
  - `book_chapters` 表有 17 条章节记录。
  - `file_store` 仍保留 1 条原始 PDF 文件索引。
  - `kv_store` 中已无 `books` key，仍保留 `settings`、`progress:*`、`book:*:pages`、`book:*:cover`、`book:*:questions:*` 等尚未结构化的数据。
- 验证结束后已停止 `npm run tauri:dev`，没有留下后台开发进程。

限制：

- `books.raw_json` 仍保留完整书籍对象，用于无损兼容 `readingProfile`、`readingPlan`、`wholeBookGuide` 等未拆表字段。
- `book_chapters` 当前从 `raw_json.chapters` 同步，前端读取仍通过完整书籍对象恢复。
- 阅读计划、阅读进度、笔记、聊天、读后交流和导读缓存仍未结构化。
- 本轮没有改变浏览器版 IndexedDB 存储路径。

后续：

- 阶段 5.4：迁移阅读计划和阅读进度。
- 阶段 5.5：迁移笔记、聊天、读后交流和导读缓存。
- 后续再处理 Keychain、备份导入导出和 schema 迁移器。

### 2026-06-18：阶段 5.4 阅读计划和阅读进度结构化

阶段：阶段 5，长期本地存储

目标：

- 将 `book.raw_json.readingPlan` 同步到可查询的阅读计划表。
- 将 `progress:{bookId}` 从 `kv_store` 迁到结构化阅读进度表。
- 保持前端 `getReadingProgress`、`saveReadingProgress` 和 `book.readingPlan` 使用方式不变。

改动：

- 扩展 `src-tauri/src/storage.rs`：
  - `schema_version` 升到 `3`。
  - 新增 `reading_plans` 表，保存阅读计划摘要、生成来源、阅读项数量和完整 `raw_json`。
  - 新增 `reading_plan_items` 表，保存每个阅读项的 `item_key`、日期、类型、标题和页码范围。
  - 新增 `reading_progress` 表，替代旧 `progress:{bookId}`。
  - 新增 `reading_item_progress` 表，拆出每个阅读项的最近页码、完成时间和完整位置 JSON。
  - `sync_books` 写入书籍时同步维护 `reading_plans` / `reading_plan_items`。
  - 初始化时从既有 `books.raw_json.readingPlan` 重建阅读计划表。
  - 初始化时将旧 `kv_store` 里的 `progress:*` 自动迁到 `reading_progress` / `reading_item_progress`。
  - `duban_storage_get_item("progress:{bookId}")` 和 `duban_storage_set_item("progress:{bookId}")` 改为读写结构化进度表。
  - `keys()` 会为结构化进度返回兼容旧清理逻辑的 `progress:{bookId}` key。
- 更新 [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)：
  - schema 版本更新为 `3`。
  - 将 `reading_plans`、`reading_plan_items`、`reading_progress`、`reading_item_progress` 标记为已实现表。
  - 从 `kv_store` 暂存列表中移除 `progress:{bookId}`。

验证：

- `cargo fmt` 已运行。
- `cargo check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run tauri:dev` 成功启动桌面应用并触发 schema 3 初始化。
- `curl -I http://localhost:5173/` 返回 HTTP 200。
- 已确认 SQLite 表：
  - `reading_plans`
  - `reading_plan_items`
  - `reading_progress`
  - `reading_item_progress`
- 已确认 `schema_meta.schema_version = 3`。
- 已确认当前本地数据迁移结果：
  - `reading_plans` 有 1 条记录，`item_count = 10`。
  - `reading_plan_items` 有 10 条记录，可查询 day、planned_date、title、type、start_page、end_page。
  - `reading_progress` 有 1 条记录，保留 `current_item_index`、`last_read_at` 和完整 `raw_json`。
  - `reading_item_progress` 有 1 条记录，保留当前阅读项最近页码 `16` 和完整位置 JSON。
  - `kv_store` 中已无 `progress:*`，仍保留 `settings`、`book:*:pages`、`book:*:cover`、`book:*:questions:*` 等后续阶段数据。
- 验证结束后已停止 `npm run tauri:dev`，没有留下后台开发进程。

限制：

- `reading_plans` 当前仍从 `books.raw_json.readingPlan` 同步，前端读取书籍对象时仍依赖完整 `raw_json`。
- `reading_progress.raw_json` 仍保留完整进度对象，用于无损兼容旧前端。
- 笔记、聊天、读后交流、导读缓存、pages 和 settings 尚未结构化。
- 本轮没有改变浏览器版 IndexedDB 存储路径。

后续：

- 阶段 5.5 已完成：笔记、聊天、读后交流和导读缓存已迁到结构化表。
- 阶段 5.6：迁移 pages / 文件导入路径，减少大文件 base64 IPC。
- 后续再处理 Keychain、备份导入导出和 schema 迁移器。

### 2026-06-18：阶段 5.5 笔记、聊天、读后交流和导读缓存结构化

阶段：阶段 5，长期本地存储

目标：

- 将 `book:{id}:notes` 从 `kv_store` 迁到结构化 `notes` 表。
- 将 `book:{id}:chat` 和 `book:{id}:reflection` 分别迁到结构化消息表。
- 将 `book:{id}:questions:{itemKey}` 迁到结构化 `reading_guides` 表。
- 保持前端 `getReadingNotes`、`getReadingChat`、`getReadingGuide` 等调用方式不变。

改动：

- 扩展 `src-tauri/src/storage.rs`：
  - `schema_version` 升到 `4`。
  - 新增 `notes` 表，保存笔记所属书籍、阅读项、页码、原文、用户笔记、读伴回答来源和完整 `raw_json`。
  - 新增 `chat_messages` 表，保存伴读问答消息，并保留引用、模型、usage、cost 等完整原始 JSON。
  - 新增 `reflection_messages` 表，保存读后交流消息，和伴读问答分表管理。
  - 新增 `reading_guides` 表，保存章节导读缓存、供应商、模型和生成时间。
  - `duban_storage_get_item` / `set_item` / `remove_item` / `keys()` 对上述旧 key 继续兼容，但底层读写结构化表。
  - 初始化时自动迁移旧 `kv_store` 中的 notes、chat、reflection 和 questions 数据。
  - `sync_books` 从“删除整张 books 后重建”改为按 `id` upsert；只有真正从书架移除的书才删除，避免更新书籍元数据时通过外键级联误删进度、笔记、聊天或导读缓存。
- 更新 [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)：
  - schema 版本更新为 `4`。
  - 将 `notes`、`chat_messages`、`reflection_messages`、`reading_guides` 标记为已实现表。
  - 从 `kv_store` 暂存列表中移除对应 book scoped key。
- 更新 [ROADMAP.md](./ROADMAP.md)、[PROJECT_NOTES.md](./PROJECT_NOTES.md) 和项目 README 的当前状态描述。

验证：

- `cargo fmt` 已运行。
- `cargo check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run tauri:dev` 成功启动桌面应用并触发 schema 4 初始化。
- `curl -I http://localhost:5173/` 返回 HTTP 200。
- 已确认 `schema_meta.schema_version = 4`。
- 已确认 SQLite 表：
  - `notes`
  - `chat_messages`
  - `reflection_messages`
  - `reading_guides`
- 已确认当前本地数据迁移结果：
  - `books` 仍有 1 条记录，`reading_progress` 仍有 1 条记录。
  - `reading_guides` 有 1 条记录，来自旧 `book:*:questions:*` 缓存。
  - `notes`、`chat_messages`、`reflection_messages` 当前为 0 条记录；表结构和写入路径已就绪，后续新数据会直接进入结构化表。
  - `kv_store` 中已无 `books`、`progress:*`、`book:*:notes`、`book:*:chat`、`book:*:reflection`、`book:*:questions:*`。
- 验证结束后已停止 `npm run tauri:dev`，没有留下后台开发进程。

限制：

- `raw_json` 仍保留完整旧对象，用于无损兼容前端当前数据形态。
- `notes` 当前未拆出 rects/highlight 几何表，仍保存在 `raw_json`。
- `chat_messages` 和 `reflection_messages` 当前不做全文索引；后续搜索能力可基于这些结构化表继续扩展。
- pages、cover、settings、AI 排版缓存和 API Key 仍未完成长期存储拆分。
- 本轮没有改变浏览器版 IndexedDB 存储路径。

后续：

- 阶段 5.6 已完成：原始文件索引和分页文本已结构化，桌面读取文件时使用本地文件引用。
- 阶段 5.7：API Key 迁入系统 Keychain。
- 阶段 5.8：备份导出/导入与 schema 迁移器。

### 2026-06-18：阶段 5.6 原始文件索引、分页文本和本地文件引用

阶段：阶段 5，长期本地存储

目标：

- 将 `book:{id}:file` 从通用 `file_store` 迁到结构化 `book_files` 表。
- 将 `book:{id}:pages` 从 `kv_store` 迁到结构化 `book_pages` 表。
- 让桌面版重开后读取原始 PDF/MOBI 时使用本地文件引用，减少整本书 base64 IPC 往返。
- 保持前端 `getBookFile`、`getBookPages` 和旧 key 清理逻辑兼容。

改动：

- 扩展 `src-tauri/src/storage.rs`：
  - `schema_version` 升到 `5`。
  - 新增 `book_files` 表，保存书籍原始文件名、MIME、大小、相对路径和预留 hash 字段。
  - 新增 `book_pages` 表，保存每页 `page_index`、`page_number`、文本和完整 `raw_json`。
  - `duban_storage_get_item("book:{id}:file")` 改为从 `book_files` 返回本地文件引用：`localPath` / `relativePath`，不再返回整本文件 base64。
  - `duban_storage_get_item("book:{id}:pages")` 改为从 `book_pages` 恢复旧数组。
  - `duban_storage_set_file("book:{id}:file")` 改为写入 `book_files`，并清理旧 `file_store`。
  - `duban_storage_set_item("book:{id}:pages")` 改为写入 `book_pages`，并清理旧 `kv_store`。
  - 初始化时自动把旧 `file_store` 中的书籍文件索引迁到 `book_files`，把旧 `kv_store` 中的 pages 迁到 `book_pages`。
  - `keys()` 会继续返回 `book:{id}:file` / `book:{id}:pages` 兼容 key，确保删除书籍时能清理结构化表和本地文件。
- 更新前端文件适配层：
  - `src/lib/tauriStorageAdapter.js` 能把 Rust 返回的 `localPath` 转成桌面本地文件引用。
  - `src/lib/fileAdapter.js` 能识别本地文件引用，并用 Tauri `convertFileSrc()` + asset protocol 读取文件。
  - `src/components/PdfReader.jsx` 在桌面端优先把 asset URL 交给 PDF.js，避免先把 PDF 读成 ArrayBuffer。
  - IndexedDB 到 Tauri 的首次迁移会优先复制 `books`，再复制文件、pages、进度和阅读数据，降低结构化表外键迁移顺序风险。
- 更新 Tauri 配置：
  - `src-tauri/tauri.conf.json` 启用 asset protocol，scope 限制为 `$APPDATA/files/**`。
  - `src-tauri/Cargo.toml` 为 `tauri` 打开 `protocol-asset` feature。
- 更新 [DESKTOP_STORAGE_SCHEMA.md](./DESKTOP_STORAGE_SCHEMA.md)、[ROADMAP.md](./ROADMAP.md)、[PROJECT_NOTES.md](./PROJECT_NOTES.md) 和项目 README。

验证：

- `cargo fmt` 已运行。
- `cargo check` 通过；首次打开 `protocol-asset` feature 时下载了新增依赖 `http-range v0.1.5`。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run tauri:dev` 成功启动桌面应用并触发 schema 5 初始化。
- `curl -I http://localhost:5173/` 返回 HTTP 200。
- 已确认 `schema_meta.schema_version = 5`。
- 已确认当前本地数据迁移结果：
  - `books` 有 1 条记录。
  - `book_files` 有 1 条记录，文件名为 `万历十五年（经典版）.pdf`，大小 `4,797,242` byte。
  - App 数据目录 `files/` 中对应文件存在，大小同为 `4,797,242` byte。
  - `book_pages` 有 384 条记录，页码范围 `1` 到 `384`。
  - `reading_progress` 和 `reading_guides` 仍各有 1 条记录。
  - `kv_store` 中已无 `books`、`progress:*`、`book:*:pages`、`book:*:file`、`book:*:questions:*`。
  - `file_store` 中已无 `book:*:file`。
- 验证结束后已停止 `npm run tauri:dev`，没有留下后台开发进程。

限制：

- 首次上传仍由浏览器 File API 将文件交给前端解析，再通过 Tauri command 保存到 App 数据目录；本轮优化的是“重开后读取/渲染原始文件”的路径。
- 当时 `book_files.sha256` 仍未计算，暂作为后续去重和完整性校验预留字段；P6.1 起新写入的原始文件会计算 sha256。
- 封面、settings、AI 排版缓存和 API Key 仍未完成长期存储拆分。
- 本轮没有改变浏览器版 IndexedDB 存储路径。

后续：

- 阶段 5.7：API Key 迁入系统 Keychain。
- 阶段 5.8：备份导出/导入与 schema 迁移器。

### 2026-06-18：阶段 5.7 API Key 迁入系统 Keychain

阶段：阶段 5，长期本地存储

目标：

- 让桌面版不再把 API Key 保存在 SQLite 的 `settings` JSON 中。
- 保持前端 `getSettings` / `saveSettings` 接口不变，浏览器版仍使用 IndexedDB。
- 将旧桌面数据中的 API Key 自动迁移到系统 Keychain，并清理 SQLite 中的敏感字段。

改动：

- 在 Tauri Rust 侧引入 `keyring`，macOS 使用系统 Keychain 后端。
- 将桌面 schema 版本升到 `6`。
- 对 `settings` key 增加桌面专用读写路径：
  - 读取时从 `kv_store.settings` 取非敏感配置，并把 Keychain 中的 `anthropic.apiKey` / `openaiCompatible.apiKey` 注入回前端兼容对象。
  - 保存时把 API Key 写入或删除系统 Keychain，SQLite 只保存供应商、模型、Base URL、价格等非敏感配置。
  - 删除 `settings` 或清空全部数据时，同步删除读伴在 Keychain 中的 API Key。
- 启动迁移时会扫描旧 `kv_store.settings`，把历史 API Key 迁入 Keychain，并回写脱敏后的 settings JSON。
- 更新设置页和隐私页文案，明确浏览器版 API Key 在 IndexedDB，桌面版 API Key 在系统 Keychain。

验证：

- `cargo fmt` 通过。
- `cargo check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run tauri:dev` 成功启动桌面测试环境。
- `http://localhost:5173/` 返回 HTTP 200。
- 已确认本机桌面数据库 `schema_meta.schema_version = 6`。
- 已确认 `kv_store.settings` 中不再包含 `apiKey` 字段，脱敏后长度为 214 bytes。
- 已确认结构化数据仍在：
  - `book_files = 1`
  - `book_pages = 384`
  - `reading_progress = 1`
  - `reading_guides = 1`
- 当前测试数据里未查到可迁移的 Keychain 条目，因为本机 `settings` 中没有已保存 API Key；后续在桌面设置页保存 API Key 时会写入系统 Keychain。
- 验证结束后已停止 `npm run tauri:dev`，没有留下 Tauri/Vite 测试进程。

限制：

- 非敏感 settings 仍暂存在 `kv_store.settings`，还没有拆成结构化 `settings` 表。
- 设置页“下载当前 AI 配置”仍会导出包含 API Key 的 TXT，需要用户只保存在可信位置。
- 浏览器版存储行为不变，API Key 仍在本机 IndexedDB。

后续：

- 阶段 5.8：备份导出/导入与 schema 迁移器。
- 继续评估封面、AI 排版缓存和非敏感 settings 的结构化拆分。

### 2026-06-18：阶段 5.8 备份导出/导入与 schema 迁移器

阶段：阶段 5，长期本地存储

目标：

- 提供一个可用的本地备份路径，降低本地数据损坏或迁移机器时的风险。
- 让桌面 schema 初始化从“直接建最新表并跑迁移函数”收束成显式迁移器入口。
- 保持前端存储门面不变，设置页提供可操作的备份入口。

改动：

- 新增 Rust command：
  - `duban_storage_export_backup`
  - `duban_storage_import_backup`
- 新增桌面备份目录 `~/Library/Application Support/com.duban.reader/backups/`。
- 新增备份格式 `duban.local-backup` v1：
  - `items` 保存兼容 key 的 JSON 数据。
  - `files` 保存原始 PDF/MOBI 等文件，当前以 base64 放进 JSON。
  - `includesApiKeys = false`，备份默认不包含 API Key。
- 导入备份时会覆盖当前书库、分页、进度、导读、笔记、聊天、读后交流和非敏感设置，但不会删除或恢复系统 Keychain 中的 API Key。
- 导入备份会在覆盖前校验备份格式、key 和文件 base64 内容，降低坏备份造成半途失败的风险。
- 将 `duban_storage_set_item` / `duban_storage_set_file` 的写入逻辑抽成内部 helper，导入备份时复用同一套结构化表同步路径。
- 将 schema 版本升到 `7`，并新增 `run_schema_migrations` 作为显式迁移器入口。
- 新增前端 `src/lib/backup.js`：
  - 桌面版调用 Tauri 备份 command。
  - 浏览器版生成/导入 JSON 备份，尽量保留当前浏览器中的 API Key，但备份文件本身不写入 API Key。
- 设置页新增「本地备份」区块，支持导出备份和导入备份。
- 新增 Rust 单元测试，覆盖结构化书籍、分页和文件的备份 roundtrip。

验证：

- `cargo fmt` 通过。
- `cargo test` 通过：
  - `storage::tests::backup_roundtrip_restores_structured_data_and_files`
- `cargo check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run tauri:dev` 成功启动桌面测试环境。
- `http://localhost:5173/` 返回 HTTP 200。
- 已确认本机桌面数据库 `schema_meta.schema_version = 7`。
- 已确认结构化数据仍在：
  - `books = 1`
  - `book_files = 1`
  - `book_pages = 384`
  - `reading_progress = 1`
  - `reading_guides = 1`
- 已确认 `backups/` 目录会随 App 启动创建。
- 验证结束后已停止 `npm run tauri:dev`，没有留下 Tauri/Vite 测试进程。

限制：

- 当前备份是单个 JSON 文件，原始文件以 base64 内嵌；适合 MVP 和中小型书库，大型书库后续应升级为 zip/目录式备份。
- 备份不包含 API Key；换设备恢复后需要用户重新填写或导入 AI 配置。
- 导入备份会覆盖当前本地书库数据，当前没有“合并导入”模式。
- 封面、AI 排版缓存和非敏感 settings 仍未拆成独立结构化表。

后续：

- 继续评估 zip/目录式备份、备份校验和导入前预览。
- 继续拆分封面、AI 排版缓存和非敏感 settings。

### 2026-06-18：阶段 5.9 长期可靠备份基础

阶段：阶段 5，长期本地存储

目标：

- 把阶段 5.8 的单文件 JSON 备份升级成更适合长期书库的备份形态。
- 增加导入前预览、校验报告和合并导入，降低误恢复和大书库备份风险。
- 保持旧 JSON 备份兼容，同时让桌面版优先使用目录式备份。

改动：

- 将桌面 schema 版本升到 `8`。
- 将桌面备份格式升到 `duban.local-backup` v2：
  - 每次导出生成 `backups/duban-backup-{timestamp}/` 目录。
  - `manifest.json` 保存备份元数据和兼容 key 的 JSON 数据。
  - `files/` 保存原始 PDF/MOBI 等真实文件，manifest 中只保存 `relativePath`。
  - 旧版 base64 JSON 备份仍可通过兼容导入路径恢复。
- 新增 Rust command：
  - `duban_storage_list_backups`
  - `duban_storage_preview_backup`
  - `duban_storage_import_backup_id`
- 新增导入模式：
  - `merge`：保留当前书库中备份未涉及的数据；同 id 书籍和同 key 数据以备份为准。
  - `replace`：覆盖恢复，先清空当前书库数据再恢复备份。
- 导入前校验扩展为校验 manifest、key、文件路径、防目录穿越和文件存在性。
- 设置页「本地备份」升级为备份控制台：
  - 桌面版显示备份清单。
  - 支持导入前预览书籍、文件、页文本、进度、导读、笔记、聊天和读后交流数量。
  - 展示校验报告，存在 error 时禁用导入。
  - 支持合并导入和覆盖恢复切换。
- `src/lib/backup.js` 增加桌面清单/预览/按 id 导入 API；浏览器版保留 JSON 备份，并支持合并导入。
- 新增 Rust 单元测试：
  - 目录式备份 roundtrip 恢复结构化数据和原始文件。
  - 合并导入保留备份未涉及的既有书籍。

验证：

- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `cargo fmt` 通过。
- `cargo test` 通过：
  - `storage::tests::backup_roundtrip_restores_structured_data_and_files`
  - `storage::tests::backup_merge_keeps_books_that_are_not_in_backup`
- `cargo check` 通过。
- `npm run tauri:dev` 成功启动桌面测试环境。
- `http://localhost:5173/` 返回 HTTP 200。
- 已确认本机桌面数据库 `schema_meta.schema_version = 8`。
- 已确认结构化数据仍在：
  - `books = 1`
  - `book_files = 1`
  - `book_pages = 384`
  - `reading_progress = 1`
  - `reading_guides = 1`
- 验证结束后已停止 `npm run tauri:dev`，没有留下 Tauri/Vite 测试进程。

限制：

- 目录式备份当时尚未压缩成 zip/tar，也没有签名或校验和文件；P6.1 已补 manifest/file sha256，压缩归档和备份签名仍待后续。
- 覆盖导入当时不是完整事务式恢复；P6.1 已补导入前恢复点和失败自动回滚。
- 跨设备迁移需要复制整个 `duban-backup-*` 目录到目标机器的 `backups/` 目录。
- 备份仍不包含 API Key；换设备恢复后需要用户重新填写或导入 AI 配置。

后续：

- 后续继续增加备份压缩归档、备份签名、迁移夹具和更友好的跨设备迁移入口。

### 2026-06-18：后端开发标准与 AI 接手提示词文档化

阶段：文档治理 / 后端工程治理

目标：

- 在继续推进后端前，先把 Tauri/Rust、本地存储、Keychain、备份、AI transport 的开发标准固定下来。
- 为后续 AI 接手项目提供可复制的提示词模板，减少上下文遗漏和误操作风险。

改动：

- 新增 [BACKEND_DEVELOPMENT_STANDARDS.md](./BACKEND_DEVELOPMENT_STANDARDS.md)：
  - 明确当前“后端”范围是 Tauri Rust 本地后端，以及未来云端后端必须遵守的边界。
  - 固定 Tauri command、前端 adapter、SQLite/schema、文件系统、Keychain、备份、AI 请求、错误处理、测试验证和文档同步标准。
  - 明确 API Key 不得进入 SQLite、备份、日志或错误信息。
- 新增 [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md)：
  - 提供通用接手、阶段任务、后端修改、SQLite 迁移、备份恢复、Keychain、AI transport、UI、文档治理、代码审查和最终汇报提示词。
  - 明确产品 prompt 和 AI 接手提示词分开维护，后者不打包进前端功能。
- 更新 [README.md](./README.md)、[ROADMAP.md](./ROADMAP.md) 和 [PROJECT_NOTES.md](./PROJECT_NOTES.md)，把两份新文档挂入接手路径和当前架构共识。

验证：

- 使用 `rg` 检查新文档已被 docs 索引和路线文档引用。
- 本轮仅新增和更新文档，没有代码或 schema 改动，因此未运行构建命令。

限制：

- 这些标准是当前阶段的工程护栏；如果后续引入云端后端、同步服务或自动更新，需要再次修订。

后续：

- 下一次进入后端相关开发前，先按 [BACKEND_DEVELOPMENT_STANDARDS.md](./BACKEND_DEVELOPMENT_STANDARDS.md) 的检查清单执行。
- 新开 AI 会话接手时，优先复制 [AI_HANDOFF_PROMPTS.md](./AI_HANDOFF_PROMPTS.md) 的对应提示词。

### 2026-06-18：生产级升级路线文档化

阶段：文档治理 / 生产级发布准备

目标：

- 把阶段 5 之后还需要做的生产级升级拆成可执行步骤。
- 明确“真正的 App”不只需要后端，还需要数据可靠、正式发布、安全隐私、诊断、CI、QA、自动更新和 public alpha 准备。
- 给后续每次生产级小阶段提供同一张路线图。

改动：

- 新增 [PRODUCTION_UPGRADE_PLAN.md](./PRODUCTION_UPGRADE_PLAN.md)，将剩余工作拆为 P6.1-P6.12：
  - P6.1 数据安全收口
  - P6.2 存储结构收束
  - P6.3 大文件与解析韧性
  - P6.4 AI transport 生产化
  - P6.5 安全与隐私加固
  - P6.6 本地诊断与可支持性
  - P6.7 正式 macOS 发布包
  - P6.8 自动更新
  - P6.9 CI 与发布流水线
  - P6.10 QA 矩阵与回归样本
  - P6.11 Public alpha 准备
  - P6.12 可选云同步/后端决策
- 更新 [README.md](../README.md)、[ROADMAP.md](./ROADMAP.md)、[PROJECT_NOTES.md](./PROJECT_NOTES.md)、[docs/README.md](./README.md) 和 [PUBLIC_READINESS_CHANGES.md](./PUBLIC_READINESS_CHANGES.md)，把生产级路线挂入文档入口和当前路线。
- 明确推荐下一步从 P6.1 数据安全收口开始，再推进存储收束、大文件韧性、AI transport、安全隐私、诊断、签名公证、CI/QA、自动更新和 public alpha。

验证：

- 使用 `rg` 检查 `PRODUCTION_UPGRADE_PLAN.md` 已被 README、docs 索引、Roadmap、项目记录、公开前成熟度记录和 App 化日志引用。
- 本轮仅新增和更新文档，没有代码或 schema 改动，因此未运行构建命令。

限制：

- 这次只是路线文档化，没有实现 P6.x 中的任何生产级能力。
- 正式签名、公证、自动更新和 CI 发布仍需要后续实际开发，并依赖 Apple Developer 证书、更新包托管位置和仓库流水线权限等外部条件。

### 2026-06-18：P6.1 数据安全收口

阶段：P6，生产级可靠性

目标：

- 把阶段 5.9 的目录式备份继续推进到更适合真实长期书库的可靠形态。
- 让导入前校验不仅看结构，还能发现 manifest 或原始文件被修改、缺失或损坏。
- 让覆盖恢复和合并导入在中途失败时尽量自动恢复到导入前状态。

改动：

- 将桌面备份格式从 `duban.local-backup` v2 升到 v3：
  - `manifest.json` 新增 `manifestSha256`。
  - `files` 中每个原始文件记录 `byteSize` 和 `sha256`。
  - `manifest.json` 新增 `label` / `notes`，供设置页维护备份名称和备注。
- 导入前校验扩展为：
  - `format`
  - `backupVersion`
  - `schemaVersion`
  - manifest sha256
  - 重复 key
  - 重复书籍 id
  - 文件路径和防目录穿越
  - 文件存在性
  - 文件大小
  - 文件 sha256
- 导入流程新增隐藏恢复点：
  - 每次导入前先把当前书库导出到 `backups/.restore-point-*`。
  - 导入成功后删除恢复点。
  - 导入失败时自动用恢复点执行覆盖恢复。
  - 如果自动恢复也失败，错误信息会告知恢复点路径。
- 设置页「本地备份」升级：
  - 显示 manifest hash 摘要。
  - 支持维护备份名称/备注，保存后重新写入 manifest 校验和。
  - 支持删除本地备份，不影响当前书库。
  - 支持填写外部备份目录或 `manifest.json` 路径，先预览校验报告再导入。
- `book_files.sha256` 开始在写入原始书籍文件时落库。
- 新增 Rust 单元测试：
  - 目录式备份 roundtrip 恢复结构化数据和原始文件。
  - 合并导入保留备份未涉及的既有书籍。
  - 篡改目录式备份文件后，校验报告会阻止导入。
  - 覆盖恢复在应用阶段失败时，会自动回滚到导入前书库。

验证：

- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `cargo fmt` 通过。
- `cargo test` 通过：
  - `storage::tests::backup_roundtrip_restores_structured_data_and_files`
  - `storage::tests::backup_merge_keeps_books_that_are_not_in_backup`
  - `storage::tests::backup_validation_rejects_tampered_directory_file`
  - `storage::tests::replace_import_rolls_back_when_apply_fails`
- `cargo check` 通过。

限制：

- 外部备份导入当前通过手动输入目录或 `manifest.json` 路径完成，还没有接入原生目录选择器。
- 备份仍是目录式结构，尚未压缩为 zip/tar，也没有备份签名。
- 旧版 v1/v2 备份仍可兼容导入；如果旧备份没有 hash，只能显示 warning，不能提供 v3 级别的完整性保证。
- P6.1 还没有建立完整的旧 schema / 大书库迁移夹具，后续需要继续补。

后续：

- 进入 P6.2：存储结构收束，优先拆分非敏感 settings、封面缓存、AI 排版缓存和文件索引边界。
- 继续评估原生目录选择器、zip/tar 压缩归档和备份签名。

### 2026-06-18：P6.1 测试反馈：设置页 Keychain 弹窗阻塞修复

阶段：P6.1 测试反馈 / 本地后端体验修复

问题：

- 用户进入设置页时，macOS 会要求输入系统密码。
- 输入密码后页面看起来没有继续响应，因为旧逻辑在读取 `settings` 时会顺手读取系统 Keychain，并把 API Key 注入回前端兼容对象；这个动作发生在进入设置页时过早，也容易被系统授权弹窗阻塞体验。

改动：

- Tauri `load_settings` 改为只返回 SQLite/KV 中的非敏感设置，不再自动读取或注入 Keychain 密钥。
- 新增后端密钥解析边界：AI transport 在测试连接或模型请求真正发起时，如果请求体没有明文 API Key，才从 Keychain 读取已保存密钥。
- 设置页 API Key 输入框留空保存不会删除既有 Keychain 密钥；只有填写新 Key 后保存才更新 Keychain。
- 桌面版测试连接最初尝试复用 Keychain 中已保存的密钥；后续在“反复弹窗二次修复”中已收紧为只测试当前输入的 API Key，不再读取 Keychain。
- OpenAI-compatible 自定义 Base URL 的确认逻辑在桌面版仍会保留，即使 API Key 输入框为空。
- 更新设置页文案，明确桌面版进入设置页不会自动回填 Keychain 密钥。
- 更新后端开发标准、AI 接手提示词、桌面存储 schema、项目说明和 README，固定“读设置不读密钥”的规则。

验证：

- `cargo fmt` 通过。
- `cargo check` 通过。
- `cargo test` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。

限制：

- 第一次真正测试连接或调用 AI 时，macOS 仍可能根据 Keychain 授权策略弹出系统确认；这是按需读取密钥的正常行为。
- 设置页不会展示已保存 API Key 的明文，这是刻意的安全边界。

### 2026-06-18：P6.1 测试反馈：Keychain 反复弹窗二次修复

阶段：P6.1 测试反馈 / Keychain 交互收口

问题：

- 首次修复后，用户复测时仍遇到系统密码弹窗反复出现。
- 进一步排查发现风险不只在 `load_settings`：
  - schema 初始化仍会运行旧的“把 settings 里的 API Key 迁到 Keychain”逻辑。
  - 如果旧 SQLite 中残留过明文 `apiKey`，设置页读取后仍可能在测试连接或保存路径再次触发 Keychain。
  - 设置页测试连接此前会先保存设置，再测试连接，容易把“测试”变成 Keychain 写入动作。

改动：

- 启动 schema 迁移不再自动读写 Keychain。
- 新增纯脱敏迁移：如果旧 `kv_store.settings` 中残留 `apiKey`、`anthropic.apiKey` 或 `openaiCompatible.apiKey`，只从 SQLite 中移除这些字段，不再尝试写入 Keychain。
- `load_settings` 返回前强制脱敏，确保旧数据即使尚未清理，也不会回到设置表单。
- 设置页测试连接改为只测试当前输入的 API Key：
  - API Key 输入框为空时直接提示补充密钥。
  - 不自动读取已保存 Keychain 密钥。
  - 不再为了测试连接自动保存设置。
- 新增 Rust 单元测试 `legacy_settings_secrets_are_redacted_without_keychain_migration`，覆盖旧 settings 脱敏且不走 Keychain 迁移的路径。
- 更新 README、桌面 schema、后端标准和 AI 接手提示词，固定“设置页不读 Keychain，测试连接也不读 Keychain”的规则。

验证：

- `cargo test` 通过，当前 5 个 Rust 单元测试全部通过。

限制：

- 如果某个旧版本的 API Key 只存在 SQLite 明文字段且从未成功保存进 Keychain，本次会为避免弹窗和敏感数据落库而脱敏移除；用户需要在设置页重新粘贴 API Key 并保存。
- 阅读页真正发起 AI 请求时，如果请求体没有 API Key，仍会按需读取 Keychain；这属于显式 AI 使用路径，不应发生在进入设置页。

### 2026-06-18：P6.1 测试反馈：设置页显示已保存 Key 状态

阶段：P6.1 测试反馈 / 设置页可理解性修复

问题：

- 桌面版为了避免 Keychain 弹窗，不会把已保存的 API Key 明文读回输入框。
- 但输入框一直为空会让用户误以为没有保存 Key，尤其是在“留空保存不会覆盖已有密钥”的规则下，状态需要更明确。

改动：

- 在 settings 中增加非敏感状态：
  - `anthropic.hasApiKey`
  - `openaiCompatible.hasApiKey`
- 保存新 API Key 时，Tauri 后端写入 Keychain 后会把对应 `hasApiKey` 标记设为 `true`，并继续移除明文 `apiKey`。
- 设置页 API Key 输入框下方显示状态：
  - 尚未保存 Key。
  - 已保存 Key（不会显示明文）；留空保存会继续保留。
  - 未读取 Keychain，保存状态未知；如果之前保存过 Key，它仍会保留。
  - 已填写新 Key；保存后会更新系统 Keychain 中的密钥。
- 桌面版保存新 Key 后会清空输入框，只保留“已保存 Key”的状态提示，避免明文继续停留在设置页。
- 设置页测试连接在已保存 Key 但输入框为空时，会明确提示：本机已保存 Key，但设置页测试连接不会自动读取它，若要重新测试需要临时粘贴 Key。
- 备份导出会移除 `apiKey` 和 `hasApiKey`，避免把本机 Keychain 状态带到另一台机器。
- 替换导入或清空书库但不删除 Keychain 时，后端会尽量保留当前本机的 `hasApiKey` 状态。
- 更新 README、项目记录、桌面 schema、后端标准和 AI 接手提示词。

验证：

- `cargo fmt --check` 通过。
- `cargo check` 通过。
- `cargo test` 通过，当前 5 个 Rust 单元测试全部通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 通过。

限制：

- `hasApiKey` 只是本机状态标记，不代表可以恢复或查看密钥明文。
- 旧版本已经写入 Keychain、但还没有 `hasApiKey` 标记的密钥，读伴不会主动读取 Keychain 去确认；设置页会显示状态未知，直到用户重新保存新 Key。
- 如果用户在系统 Keychain 外部手动删除读伴的密钥，读伴不会主动读取 Keychain 校正这个标记；后续需要在“Key 管理”入口里提供明确的删除/重置状态能力。

### 2026-06-18：P6.2 存储结构收束

阶段：P6.2，生产级可靠性

目标：

- 减少 `kv_store` 的长期负担，让桌面长期数据进入清晰的结构化表或文件目录。
- 保留前端兼容 key，不让 UI 和业务层感知底层迁移。
- 继续明确 SQLite、App 数据目录和 Keychain 的职责边界。

改动：

- 将桌面 schema 从 `8` 升到 `9`。
- 新增 `app_settings`：
  - 替代 `kv_store.settings`。
  - 保存供应商、模型、Base URL、价格和 `hasApiKey` 等非敏感配置。
  - API Key 仍只进入系统 Keychain。
  - 旧 `kv_store.settings` 会脱敏后迁入 `app_settings`，不会自动读写 Keychain。
- 新增 `book_covers`：
  - 替代 `book:{id}:cover`。
  - 封面 data URL 解码后写入 App 数据目录 `files/covers/`。
  - SQLite 保存书籍关联、MIME、文件大小、相对路径、来源和更新时间。
  - 读取 `book:{id}:cover` 时仍重组成 data URL 返回给前端。
- 新增 `formatted_texts`：
  - 替代 `book:{id}:formatted-text:{itemKey}`。
  - 保存 provider、model、generatedAt 和完整 raw JSON。
- `book_files` 补充：
  - `import_source`
  - `last_verified_at`
- 新增孤儿文件维护命令：
  - `duban_storage_scan_orphan_files`
  - `duban_storage_delete_orphan_files`
  - 扫描只以 SQLite 中的 `file_store`、`book_files`、`book_covers` 引用为准，避免误删仍被书籍或封面使用的文件。
- 备份导出仍保持兼容 key：
  - `settings`
  - `book:{id}:cover`
  - `book:{id}:formatted-text:{itemKey}`
  - 但底层读取来自结构化表。
- 更新 `DESKTOP_STORAGE_SCHEMA.md`、`PRODUCTION_UPGRADE_PLAN.md`、README、Roadmap、项目记录、公开前成熟度记录、后端标准和 AI 接手提示词。

验证：

- `cargo fmt --check` 通过。
- `cargo check` 通过。
- `cargo test` 通过，当前 6 个 Rust 单元测试全部通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。

限制：

- 孤儿文件扫描/清理目前是后端 Tauri command，尚未在设置页或诊断页提供可视化入口。
- 封面缓存已进入文件目录，但目前仍通过兼容 data URL 返回给前端；后续若需要更大规模封面墙，可再改成 asset URL。
- 压缩归档、备份签名和完整旧 schema 夹具仍待后续阶段。

### 2026-06-18：桌面 App 图标统一到开屏 logo

阶段：品牌与桌面入口修正

目标：

- 让 macOS/Windows 桌面入口图标使用读伴开屏中的书页 + 对话气泡 logo，而不是 Tauri 默认旧图标。
- 固化图标生成方式，避免后续品牌资产和桌面包图标再次分叉。

改动：

- 使用 `public/logo.svg` 重新生成 `src-tauri/icons/` 下的 Tauri 图标资源：
  - `icon.icns`
  - `icon.ico`
  - `icon.png`
  - `32x32.png`
  - `128x128.png`
  - `128x128@2x.png`
  - Windows Store、iOS 和 Android 标准尺寸图标
- 新增 `npm run icons:generate`，后续更新 `public/logo.svg` 后可一键同步桌面与平台图标。
- 更新 README 的品牌体验说明，明确桌面 App 图标与开屏 logo 同源。

验证：

- 视觉检查 `src-tauri/icons/icon.png`，确认已替换为读伴书页 + 对话气泡 logo。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run tauri:build` 通过，并重新生成 `src-tauri/target/release/bundle/macos/读伴.app`；bundle 的 `Info.plist` 指向 `Contents/Resources/icon.icns`。

### 2026-06-18：网页版增加桌面版下载入口

阶段：网页分发入口

目标：

- 让用户从网页版能发现并下载读伴桌面版。
- 避免 Tauri 桌面版里出现“下载桌面版”的自指入口。
- 让下载地址能随发布渠道调整，不把本地测试包硬编码到前端。

改动：

- 顶部导航新增「下载桌面版」入口。
- 入口仅在浏览器运行时显示；Tauri 桌面运行时自动隐藏。
- 下载地址读取 `VITE_DESKTOP_DOWNLOAD_URL`；未配置时默认指向 GitHub Releases 最新页。
- 新增 `.env.example`，记录网页下载入口的环境变量配置。
- README 增加网页版下载入口和发布地址配置说明。

验证：

- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 通过。

限制：

- 当前默认地址是 Release 页，不是 DMG 直链；正式发布时应把 `VITE_DESKTOP_DOWNLOAD_URL` 配成最新 `.dmg` 或下载页地址。

### 2026-06-18：桌面 dev 图标缓存刷新

阶段：桌面入口修正

现象：

- `src-tauri/icons/` 和 release `.app` 已经换成读伴书页 + 对话气泡 logo，但 `npm run tauri:dev` 打开的桌面窗口仍显示 Tauri 旧默认图标。

处理：

- 停止旧的 Tauri dev 进程。
- 执行 `cargo clean -p duban`，清理旧的 debug 编译产物，强制重新运行 Tauri build script 并重新编译 `target/debug/duban`。
- 重新启动 `npm run tauri:dev`。
- 执行 `killall Dock`，刷新 macOS Dock 图标缓存。

验证：

- `npm run tauri:dev` 已重新编译 `duban(build.rs)` 和 `target/debug/duban`。
- `http://localhost:5173/` 返回 `200 OK`。

注意：

- 如果后续替换 `src-tauri/icons/` 后 dev 窗口仍显示旧图标，优先按以上流程刷新 debug 构建缓存和 Dock 缓存。

### 2026-06-18：桌面窗口主动设置运行时图标

阶段：桌面入口修正

现象：

- 清理 debug 缓存并刷新 Dock 后，`tauri:dev` 仍可能出现 Dock 图标空白，说明 dev 二进制运行时没有稳定拿到窗口图标。

改动：

- 新增 `public/app-icon.png`，与 `src-tauri/icons/icon.png` 使用同一套读伴书页 + 对话气泡图标。
- 新增 `src/lib/desktopIcon.js`：
  - 仅在 Tauri 运行时执行。
  - 启动后读取 `/app-icon.png`。
  - 调用 `getCurrentWindow().setIcon(...)` 主动设置当前窗口图标。
- `src-tauri/Cargo.toml` 为 Tauri 打开 `image-png` feature，支持运行时设置 PNG 图标。
- `App.jsx` 启动时调用桌面图标初始化函数。

验证：

- `cargo check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run tauri:dev` 已重新编译并启动。
- `npm run tauri:build` 通过，并重新生成 `src-tauri/target/release/bundle/macos/读伴.app`。
- 已打开重建后的正式 `.app` 测试包，用真实 bundle 图标验证 Dock 表现。

### 2026-06-18：P6.3 大文件与解析韧性

阶段：P6.3，生产级可靠性

目标：

- 大 PDF/MOBI、坏文件、扫描版 PDF 和长时间解析不能把 App 拖到无反馈状态。
- 用户在导入时能知道当前卡在哪一步，并能取消。
- 解析或保存失败不能在书架和本地存储里留下半本书。

改动：

- 新增 `src/lib/bookImportGuards.js`：
  - 集中维护导入限制、取消错误、错误文案和解析进度工具。
  - PDF 文件大小上限：150 MB。
  - MOBI 文件大小上限：80 MB。
  - PDF 页数上限：2000 页。
  - MOBI spine item 上限：1200 个。
  - 提取文本上限：约 350 万字。
  - MOBI 文本页上限：5000 个文本页。
- PDF 解析器增强：
  - 支持 `{ signal, onProgress }` 参数，同时保留旧的 `onProgress` 函数调用方式。
  - 读取前校验文件大小。
  - 打开后校验页数。
  - 逐页提取前后检查取消状态。
  - 取消时销毁 PDF.js loading task。
  - 对扫描版/空文本 PDF 抛出明确错误。
- MOBI 解析器增强：
  - 支持 `{ signal, onProgress }` 参数，同时保留旧的 `onProgress` 函数调用方式。
  - 读取前校验文件大小。
  - 打开后校验 spine item 数量。
  - 逐内容片段提取前后检查取消状态。
  - 限制提取文本量和生成文本页数量。
- 书架导入体验增强：
  - 导入进度拆成检查文件、读取文件、打开文档、读取目录、提取文本、保存到本地。
  - 导入过程中显示取消按钮。
  - 取消后提示“已取消导入，未保存任何内容”。
  - 失败后保留最近一次文件引用并提供“重试”。
  - 常见错误映射为用户可读文案，包括文件过大、页数过多、加密 PDF、损坏 PDF、扫描版 PDF、本地文件读取失败等。
- 本地文件读取增强：
  - Tauri 本地文件引用的 fetch 读取接收 AbortSignal。
- 保存书籍增强：
  - `createBookFromParsedFile` 改为先写原始文件和分页，再写书籍列表。
  - 保存失败会清理已经写入的书籍文件和分页 key，避免半本书污染书库。
- 更新 `PRODUCTION_UPGRADE_PLAN.md`、`ROADMAP.md`、`PROJECT_NOTES.md` 和文档索引。

验证：

- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `cargo check` 通过。
- 使用 Node 直接验证导入 guard 的文件大小限制和取消错误识别。

限制：

- PDF 仍需要先读取完整文件 ArrayBuffer；当前通过文件大小上限控制风险，尚未改成真正的流式或 worker 化解析。
- 暂未引入版权受限的大书/坏书固定样本；后续需要用可公开样本补回归测试。
- “只导入元数据/稍后解析”的降级路径尚未实现。

### 2026-07-01：AI 使用时 Keychain 连续弹窗修复

阶段：P6.4 前置问题修复 / Keychain 交互收口

现象：

- 桌面版真正使用 AI 时，macOS 会连续两次要求输入系统密码。
- 进入设置页和测试连接路径此前已经避免自动读取 Keychain；本次问题集中在真正模型请求时的 Keychain 读取体验。

原因判断：

- Tauri AI transport 在请求体没有明文 API Key 时，会按需从系统 Keychain 读取已保存密钥。
- 部分 AI 使用链路可能连续或并发触发多个模型请求，或系统对同一进程的连续 Keychain 读取逐次弹窗。
- 原实现每次模型请求都会直接读取 Keychain，没有进程内复用。

改动：

- 在 Tauri Rust 后端新增进程内 `AI_KEY_CACHE`：
  - 只缓存当前进程已从 Keychain 成功读出的供应商 API Key。
  - 缓存只在内存中，不写入 SQLite、日志、备份或错误字符串。
  - 请求体中显式传入 API Key 时优先使用请求体，不读缓存也不读 Keychain。
- `resolve_api_key` 流程调整为：
  - 先使用请求体中的临时明文 Key。
  - 如果请求体为空，先查内存缓存。
  - 缓存没有时才读取 Keychain，并在成功后写入内存缓存。
  - Keychain 读取和缓存写入在同一锁内完成，避免并发模型请求同时 miss 缓存后触发两次系统授权。
- Keychain 写入或删除后清空内存缓存：
  - 保存新 Key 后不会继续使用旧缓存。
  - 清空数据或删除 Key 后不会继续使用旧缓存。
- 新增 Rust 单元测试，覆盖 AI Key 缓存可清理且不触发真实 Keychain 访问。
- 更新后端标准、桌面 schema 和 AI 接手提示词，固定“允许进程内缓存，但不得落盘且必须失效”的边界。

验证：

- `cargo fmt --check` 通过。
- `cargo test` 通过，当前 7 个 Rust 单元测试全部通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。

限制：

- 第一次真正使用某个供应商的已保存 Key 时，macOS 仍可能弹出一次系统授权，这是按需读取 Keychain 的预期行为。
- 如果用户在系统 Keychain 外部手动修改密钥，当前进程内缓存不会自动感知；在设置页保存/删除密钥或重启 App 后会刷新。

### 2026-07-02：P6.4.1 + P6.4.2 AI 错误分类与超时重试

阶段：P6.4 AI transport 生产化

目标：

- 让桌面版 Rust AI 代理不再只返回裸字符串错误。
- 模型请求失败时，用户能区分网络、配置、鉴权、额度、模型、Base URL、上下文过长、响应格式和服务端临时故障。
- 对临时失败做有限重试，避免网络抖动直接打断导读或伴读聊天。

改动：

- Tauri AI command 的错误返回升级为结构化脱敏 `AiError`：
  - `message`：用户可读文案。
  - `code`：脱敏诊断码，例如 `AI_AUTH_INVALID`、`AI_RATE_LIMITED`、`AI_CONTENT_TOO_LONG`。
  - `kind`：错误分类，例如 `network`、`auth`、`model`、`base_url`、`response_format`。
  - `retryable`：是否属于可重试错误。
  - `status`：可选 HTTP 状态码。
- 流式错误事件同步带上 `code/kind/retryable/status`，为后续诊断面板预留字段。
- 前端 `tauriAiTransport` 保持原有调用方式，但不再把对象错误压扁成普通字符串；抛出的 `Error` 会保留 `code/kind/retryable/status`。
- Rust AI 请求统一接入 `send_ai_request_with_retry`：
  - 连接超时 15 秒。
  - 总请求超时 180 秒。
  - 最多 3 次尝试。
  - 退避间隔为 400ms、1000ms。
  - 只对网络失败、超时、429、408/409/425 和 5xx/529 临时服务端错误重试。
- 鉴权失败、权限不足、模型不存在、Base URL 格式错误、上下文过长、响应格式异常等错误直接返回，不盲目重试。
- OpenAI-compatible Base URL 在 Rust 侧增加基本格式校验，仅允许 `http` / `https`。
- 错误文案不直接回显供应商原始错误，避免未来把敏感请求细节带到 UI、日志或诊断包。
- 显式声明 `tokio` 的 `time` feature，用于异步退避等待；依赖版本仍复用现有锁文件中的 Tokio。
- 新增 Rust 单元测试：
  - AI Key 缓存可清理且缓存命中不访问 Keychain。
  - HTTP 错误分类覆盖鉴权、限流、模型不存在和上下文过长。
  - 重试策略只覆盖临时失败。
  - Base URL 校验保持可操作的错误提示。
- 更新 `PRODUCTION_UPGRADE_PLAN.md`、`ROADMAP.md`、`PROJECT_NOTES.md`、`BACKEND_DEVELOPMENT_STANDARDS.md` 和 `AI_HANDOFF_PROMPTS.md`。

验证：

- `cargo fmt --check` 通过。
- `cargo test` 通过，当前 10 个 Rust 单元测试全部通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。

限制：

- P6.4 仍未完整完成：请求取消、截断识别、费用/token 保护、模型 profile 管理和调用诊断仍待后续阶段推进。
- 当前重试只覆盖发起请求阶段；流式响应已经开始输出后，如果中途断流，不会自动重试，以免向用户重复输出或保存混合结果。

### 2026-07-02：P6.4.3 AI 请求取消

阶段：P6.4 AI transport 生产化

目标：

- 用户离开页面、切换阅读项或主动停止生成时，桌面后端不继续跑无用的模型请求。
- 长时间开书分析、章节导读、伴读聊天和读后交流都要有明确停止入口。
- 用户主动取消不应被当作红色失败。

改动：

- Rust Tauri 后端新增请求取消能力：
  - 新增 `duban_ai_cancel_request` command。
  - 每个 Tauri AI 请求用 `requestId` 注册取消令牌。
  - command 完成后注销取消令牌，避免 registry 长期积累。
  - 请求取消返回结构化错误 `AI_REQUEST_CANCELLED` / `cancelled`。
- 后端取消点覆盖：
  - HTTP `.send()` 等待中。
  - 重试退避等待中。
  - 流式响应读取中。
  - 取消后会 drop 掉对应 reqwest future，尽量中止在途请求。
- 前端 AI 入口升级：
  - `callModelDetailed` / `streamModelDetailed` 支持 `AbortSignal`。
  - 浏览器版 Anthropic / OpenAI-compatible fetch 也透传 `signal`。
  - Tauri transport 在 `signal.abort()` 时调用 `duban_ai_cancel_request`。
  - Tauri 返回 `AI_REQUEST_CANCELLED` 时转成 `AbortError`，业务层按取消处理。
- 业务函数透传 `signal`：
  - 整本书导读。
  - 章节读前导读。
  - 伴读聊天。
  - 读后交流。
  - AI 正文排版生成。
- UI 接入：
  - 开书分析页生成中显示“停止整理”。
  - 读前导读生成中显示“停止生成”。
  - 伴读聊天等待时显示“停止回答”。
  - 读后交流等待时显示“停止追问”。
  - Reader 卸载、切换阅读项、进入正文、进入读后或完成阅读时，会中止对应在途 AI 请求。
- 新增 `src/lib/aiCancellation.js`，统一识别 `AbortError` / `AI_REQUEST_CANCELLED` / `cancelled`。
- 新增 Rust 单元测试，覆盖请求取消 registry 的注册、标记和注销。
- 更新 `PRODUCTION_UPGRADE_PLAN.md`、`ROADMAP.md`、`PROJECT_NOTES.md`、`BACKEND_DEVELOPMENT_STANDARDS.md` 和 `AI_HANDOFF_PROMPTS.md`。

验证：

- `cargo test` 通过，当前 11 个 Rust 单元测试全部通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 通过。

限制：

- P6.4 仍未完整完成：截断识别、费用/token 保护、模型 profile 管理和调用诊断仍待后续推进。
- 已开始流式输出后，用户主动取消会停止继续读取；不会保存取消中的临时 assistant 消息。
- 取消依赖前端触发 AbortSignal；如果系统网络栈已经把请求发到模型服务，远端是否停止计费取决于供应商行为。

### 2026-07-02：P6.4.4 模型输出截断识别

阶段：P6.4 AI transport 生产化

目标：

- 模型返回 `max_tokens` / `length` 等输出上限结束原因时，不能把半截结果当成完整导读或正文整理保存。
- 浏览器版和桌面版都要用同一套截断语义。
- 聊天类流式回答可以保留已生成内容，但必须标记并提示用户这不是完整结束。

改动：

- 新增 `src/lib/aiCompletion.js`：
  - 统一识别 `length`、`max_tokens`、`max_output_tokens` 和 `output_token_limit`。
  - 新增 `AI_OUTPUT_TRUNCATED` / `output_truncated` 错误构造函数。
- 浏览器直连 AI transport：
  - Claude 非流式和流式返回 `truncated`。
  - OpenAI-compatible 非流式和流式返回 `truncated`。
- Tauri Rust AI 后端：
  - `AiResponse` 新增 `truncated` 字段。
  - Anthropic 和 OpenAI-compatible 的非流式/流式路径都根据 finish reason 设置截断标记。
  - 新增 Rust 单元测试覆盖截断 finish reason 判定。
- 业务保存保护：
  - 章节读前导读命中截断时直接失败，不再解析或保存半截导读。
  - AI 正文整理命中截断时直接失败，不再保存半截格式化正文。
  - 整本书导读改用统一截断判断；截断时仍保存 failed 诊断态，不渲染成 ready。
  - 伴读聊天和读后追问会把 `truncated` 写入 assistant message，保留回答但标明输出上限。
- UI 提示：
  - 聊天和读后追问的用量信息如果明确截断，显示“已到输出上限”。
  - 仅靠输出 token 接近上限推断时，仍显示“可能已到输出上限”。
- 更新 `PRODUCTION_UPGRADE_PLAN.md`、`ROADMAP.md`、`PROJECT_NOTES.md`、`BACKEND_DEVELOPMENT_STANDARDS.md` 和 `AI_HANDOFF_PROMPTS.md`。

验证：

- 前端 `aiCompletion` helper 断言通过。
- `cargo fmt --check` 通过。
- `cargo test` 通过，当前 12 个 Rust 单元测试全部通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 通过。

限制：

- P6.4 仍未完整完成：费用/token 预算保护、模型 profile 管理和调用诊断仍待后续推进。
- 聊天/追问类回答目前只标记截断，不会自动续写；后续可在 profile 或重试策略里设计“继续生成”入口。

### 2026-07-06：P6.4.5 费用/token 预算保护

阶段：P6.4 AI transport 生产化

目标：

- AI 请求发出前先做输入 token、输出 token 和费用估算，避免明显超预算的请求直接打到模型服务。
- 预算配置必须是非敏感设置，不包含 API Key、prompt、章节全文、笔记或聊天全文。
- 预算日用量只记录脱敏统计，并且不进入备份。

改动：

- 新增 `src/lib/aiBudgetSettings.js`：
  - 维护默认预算配置。
  - 归一化 `aiBudget` 设置。
  - 区分字段缺失和用户主动清空，缺失时回到默认 token 上限，清空时表示不限制该项。
- 新增 `src/lib/aiBudget.js`：
  - 在正式 AI 请求前估算输入 token 和最大输出 token。
  - 支持单次输入 token 上限、单次输出 token 上限、单次估算费用上限和每日估算费用上限。
  - 费用预算依赖模型价格；价格缺失时会提示先补价格或清空费用上限。
  - 预算错误统一返回 `AI_BUDGET_*` / `budget`，前端按普通错误文案展示。
  - 请求成功后记录当天脱敏用量：日期、任务类型、输入/输出 token 和估算费用。
- `src/lib/ai.js` 成为预算保护总入口：
  - `callModelDetailed` / `streamModelDetailed` 在调用 transport 前执行预算检查。
  - 生成成功后记录预算用量；用量记录失败不会让本次模型结果失败。
  - 测试连接不走预算拦截。
- 核心 AI 任务已标记任务类型：
  - 整本书导读。
  - 章节导读。
  - 伴读问答。
  - 读后追问。
  - AI 正文整理。
- 设置页新增“预算保护”：
  - 可开启/关闭预算保护。
  - 可配置单次输入 token 上限、单次输出 token 上限、单次费用上限和每日费用上限。
  - OpenAI-compatible 费用预算复用已有输入/输出价格字段。
- AI 批量配置 TXT 支持 `[budget]` 分组，并会导出当前预算配置。
- 新增内部日用量 key：`__duban:ai-budget:{date}`。
  - 浏览器 JSON 备份和桌面目录式备份都会跳过该前缀。
  - 不改变桌面 schema 版本。
- 更新 `PRODUCTION_UPGRADE_PLAN.md`、`ROADMAP.md`、`PROJECT_NOTES.md`、`BACKEND_DEVELOPMENT_STANDARDS.md`、`AI_HANDOFF_PROMPTS.md` 和 `DESKTOP_STORAGE_SCHEMA.md`。

验证：

- 前端预算 helper 断言通过，覆盖默认值、token 拦截和 TXT 导入/导出。
- `cargo fmt --check` 通过。
- `cargo test` 通过，当前 12 个 Rust 单元测试全部通过。
- `cargo check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 通过。

限制：

- token 估算是启发式估算，不等同于供应商最终计费 token。
- 每日费用上限使用本机当天已记录的成功请求估算；失败请求和供应商侧实际账单仍以模型服务商后台为准。
- P6.4 仍未完整完成：模型 profile 管理和调用诊断仍待后续推进。

### 2026-07-06：P6.4.6 模型 Profile 管理

阶段：P6.4 AI transport 生产化

目标：

- 允许不同 AI 任务使用不同模型、temperature、输出上限和价格，避免所有任务被一个全局模型设置绑死。
- Profile 只能保存非敏感配置，不保存 API Key；桌面版 Key 仍只走系统 Keychain。
- Profile 生效后仍必须复用同一套预算、取消、截断识别、错误分类和 transport 路径。

改动：

- 新增 `src/lib/aiProfiles.js`：
  - 定义整本书导读、章节导读、伴读问答、读后追问和正文整理五类任务。
  - 维护默认 profile 设置和归一化逻辑。
  - 解析任务级供应商、模型、Base URL、输入/输出价格、输出 token 上限和 temperature。
  - 输出脱敏的 `settingsUsed`，供费用估算和结果展示使用。
- `src/lib/ai.js` 在正式请求前先解析任务 profile，再执行预算保护和 transport 调用。
- 浏览器 transport、Tauri transport、Anthropic/OpenAI-compatible 请求体和 Rust command 均支持传入 `temperature`。
- Rust 后端按供应商范围 clamp temperature：Anthropic 最大 1，OpenAI-compatible 最大 2。
- 设置页新增“任务模型 Profile”：
  - 可全局启用/关闭。
  - 可为每个任务单独启用 profile。
  - 可配置供应商、模型、Base URL、价格、输出 token 上限和 temperature。
  - 明确提示 profile 不保存 API Key。
- AI 批量配置 TXT 新增 `[profiles]` 分组，支持导入/导出任务级非敏感 profile。
- 自定义 OpenAI-compatible Base URL 二次确认会检查已启用的任务 profile 目标。
- 费用展示和预算估算改用 profile 生效后的脱敏 settings。
- 更新 `PRODUCTION_UPGRADE_PLAN.md`、`ROADMAP.md`、`PROJECT_NOTES.md`、`BACKEND_DEVELOPMENT_STANDARDS.md`、`AI_HANDOFF_PROMPTS.md`、`DESKTOP_STORAGE_SCHEMA.md`、`README.md`、`PUBLIC_READINESS_CHANGES.md` 和 `UI_CHANGELOG.md`。

验证：

- AI profile helper 断言通过，覆盖 profile 覆盖、继承全局供应商时不泄漏隐藏模型字段、TXT 导入/导出 roundtrip。
- `cargo fmt --check` 通过。
- `cargo test` 通过，当前 13 个 Rust 单元测试全部通过。
- `cargo check` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 通过。

限制：

- Profile 管理是本地非敏感配置管理，不是多账号/多 API Key 管理。
- 供应商留空表示继承全局供应商；任务级模型/Base URL 覆盖需要显式选择供应商，避免隐藏旧字段意外生效。
- P6.4 仍未完整完成：调用诊断仍待后续推进。

### 2026-07-06：P6.4 收尾 AI 调用诊断与敏感信息边界

阶段：P6.4 AI transport 生产化

目标：

- 为正式 AI 请求保留可排查的最近调用摘要，帮助区分配置、网络、额度、模型、内容长度、预算拦截和取消。
- 诊断记录必须脱敏，不保存 API Key、完整 prompt、章节正文、笔记正文或聊天全文。
- 诊断失败不能影响已经成功的模型结果。

改动：

- 新增 `src/lib/aiDiagnostics.js`：
  - 固定保留最近 20 条 AI 调用诊断。
  - 记录任务、调用模式、供应商、模型、Base URL origin、Profile 是否生效、输出上限、temperature、耗时、状态、错误码、HTTP 状态、可重试标记、结束原因、截断标记、token 和费用估算。
  - 对诊断文本做 API Key 样式脱敏和长度截断。
- `src/lib/ai.js` 在正式 `callModelDetailed` / `streamModelDetailed` 成功、失败、取消和预算拦截时记录诊断。
- Rust `AiResponse` 增加 `attempts`，桌面请求可在诊断中看到实际尝试次数；浏览器成功请求记为 1 次。
- 设置页新增「诊断」侧栏：
  - 显示最近 AI 调用脱敏摘要。
  - 支持刷新和清空诊断。
- 新增内部 key `__duban:ai-diagnostics`：
  - 浏览器 JSON 备份会跳过该 key。
  - 桌面目录式备份会跳过该 key。
- 更新 `PRODUCTION_UPGRADE_PLAN.md`、`ROADMAP.md`、`PROJECT_NOTES.md`、`BACKEND_DEVELOPMENT_STANDARDS.md`、`AI_HANDOFF_PROMPTS.md`、`DESKTOP_STORAGE_SCHEMA.md`、`README.md` 和 `PUBLIC_READINESS_CHANGES.md`。

验证：

- AI diagnostics helper 断言通过，覆盖状态、attempts、Base URL origin 和 API Key 样式脱敏。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `cargo fmt --check` 通过。
- `cargo test` 通过，当前 13 个 Rust 单元测试全部通过。
- `cargo check` 通过。
- `git diff --check` 通过。

限制：

- 这是本机最近调用摘要，不是完整日志系统；完整诊断包仍属于 P6.6。
- 诊断只记录 Base URL origin，不记录完整请求路径。
- 浏览器版没有后端重试层，成功请求 attempts 记为 1。

### 2026-07-06：书架删除与导入可靠性回归修复

阶段：阶段 5 / P6.3 回归修复

目标：

- 修复桌面版书架删除书籍无效的问题。
- 修复结构化 `book_files` 外键约束下，新书上传时报“写入书籍文件索引失败”的问题。
- 让大书导入进度展示符合用户直觉，避免“页码到 100 但进度条只走一点点”的误解。
- 将本轮回归修复写入文档，避免后续继续依赖对话记忆。

改动：

- 书架交互：
  - 书籍卡片支持右键打开与省略号一致的操作菜单。
  - 删除书籍改为应用内确认弹窗，不再依赖 Tauri WebView 中不稳定的 `window.confirm`。
  - 删除入口先关闭菜单，再打开确认弹窗；确认后才进入真实删除流程。
- 桌面存储：
  - 新增 Tauri command `duban_storage_delete_book(bookId)`。
  - 桌面端 `storageAdapter.deleteBook(id)` 优先调用该 command。
  - Rust 侧在删除前先收集原始文件和封面文件路径，再在事务内删除对应书籍和兼容 KV / file_store 记录，利用外键级联清理 pages、计划、进度、笔记、聊天、导读和缓存。
  - 浏览器版仍保留 IndexedDB 的逐 key 清理路径；逐 key 清理改为 best-effort，避免单个缓存删除失败阻断书籍从书架移除。
- 导入保存顺序：
  - `createBookFromParsedFile` 改为先写入 `books` 元数据，再写入 `book:{id}:file` 和 `book:{id}:pages`。
  - 这样满足桌面 SQLite 中 `book_files.book_id -> books.id` 的外键约束。
  - 文件或分页写入失败时，会回滚刚插入的书籍记录。
- 导入进度：
  - 上传进度从“当前阶段 current / total”改为整次导入的加权进度。
  - 读取/打开/目录占前段，文本提取占主要进度，保存到本地占最后阶段。
  - 保存阶段不再提前显示 100%，避免大书写入本地时给出错误完成感。

验证：

- `cargo test --manifest-path src-tauri/Cargo.toml delete_book_records_removes_book_and_related_structured_data` 通过。
- `cargo check --manifest-path src-tauri/Cargo.toml` 通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `git diff --check` 通过。
- `npm run tauri:dev` 已重新启动测试环境，Tauri 后端和 Vite 前端均能启动。

限制：

- 删除书籍的本地文件清理目前是 best-effort：数据库记录删除成功后，文件删除失败不会阻断书籍从书架移除；孤儿文件后续可通过既有孤儿文件扫描/清理命令处理。
- 当前仍由前端浏览器 File API 先解析文件，再通过 Tauri command 保存到 App 数据目录；更长期的原生文件选择器和直接文件路径导入仍未实现。
- 导入进度是阶段加权估算，不等于真实 IO 字节进度；后续如果把文件写入和分页写入拆出更细 command，可进一步展示保存阶段细进度。

### 2026-07-07：P6.5.1 依赖与权限安全基线

阶段：P6.5 安全与隐私加固

目标：

- 建立正式分发前的依赖安全审计入口。
- 记录前端依赖、Rust 依赖树、Tauri capabilities、asset protocol 和 command 暴露面基线。
- 明确哪些安全项已经通过，哪些仍属于后续 P6.5 工作。

改动：

- 新增 `docs/SECURITY_PRIVACY_AUDIT.md`：
  - 记录 `npm audit --json` 结果：0 个漏洞，high/critical 均为 0。
  - 记录 `cargo tree -d` 作为 Rust 重复依赖树基线。
  - 记录 `cargo audit` 当前未安装，RustSec 漏洞审计不能声明完成。
  - 盘点 Tauri capabilities：当前只有 `core:default`、`core:event:allow-listen` 和 `core:event:allow-unlisten`。
  - 盘点 asset protocol：已启用，scope 限制为 `$APPDATA/files/**`。
  - 盘点当前 Tauri command 暴露面，并把逐项输入校验复查留给 P6.5.2。
  - 记录当前 CSP 仍为 `null`，后续需要补正式 Web/Tauri 安全策略。
- `package.json` 新增可复跑脚本：
  - `npm run security:audit`
  - `npm run security:rust-duplicates`
- 更新 `README.md`、`PRODUCTION_UPGRADE_PLAN.md`、`ROADMAP.md`、`PUBLIC_READINESS_CHANGES.md`、`BACKEND_DEVELOPMENT_STANDARDS.md` 和 `AI_HANDOFF_PROMPTS.md`。

验证：

- `npm audit --json` 联网审计通过，0 个漏洞。
- `cd src-tauri && cargo tree -d` 通过，已记录重复依赖树基线。
- `cargo audit --version` 确认当前未安装，已记录为工具缺口。
- `npm run security:audit` 在联网权限下通过。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `cargo check` 通过。
- `git diff --check` 通过。

限制：

- P6.5.1 是安全基线，不是完整安全审计终点。
- 同日后续 P6.5 收尾已补 command 输入校验、路径边界、CSP、安全头和敏感信息扫描；见本文档前面的「P6.5 安全与隐私加固完整收尾」记录。
- Rust 漏洞审计仍需后续安装 `cargo audit` 或在 CI 中启用。
- 当时 Tauri command 只完成暴露面盘点，输入校验、路径边界和敏感信息扫描仍属于 P6.5.2 及后续步骤。
