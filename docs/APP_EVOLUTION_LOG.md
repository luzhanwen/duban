# 读伴 App 化路线与实施日志

> 最后更新：2026-06-18

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

状态：进行中。第一版本地数据后端已完成；阶段 5.2 schema 文档已建立；阶段 5.3 已把 `books` 迁到结构化 `books` / `book_chapters` 表；阶段 5.4 已把阅读计划和阅读进度迁到结构化表；阶段 5.5 已把笔记、聊天、读后交流和章节导读缓存迁到结构化表；阶段 5.6 已把原始文件索引和分页文本迁到结构化表，并让桌面读取文件时使用本地文件引用；阶段 5.7 已把桌面 API Key 迁入系统 Keychain；阶段 5.8 已加入备份导出/导入和显式 schema 迁移器；阶段 5.9 已把桌面备份升级为目录式、可预览、可校验、可合并导入；P6.1 已补 manifest/file sha256、失败自动回滚、外部路径导入和备份操作入口。封面、settings 结构化表、备份压缩归档、备份签名和迁移夹具仍待继续推进。

### 阶段 6：打包、备份和发布准备

目标：从可开发的桌面 App 走向可安装、可备份、可升级的本地产品。

完成标准：

- 可以生成桌面安装包。
- App 名称、图标、bundle identifier 和版本号明确。
- 支持导出/导入关键阅读数据。
- 有数据 schema 版本和迁移策略。
- 后续再评估签名、公证、自动更新和崩溃日志。

状态：部分完成。已能生成本地测试版 macOS `.app` 和 `.dmg` 入口；阶段 5.9 已提供目录式备份、导入前预览、校验报告和合并导入；正式签名、公证、自动更新和崩溃日志仍未开始。

## 实施日志

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
