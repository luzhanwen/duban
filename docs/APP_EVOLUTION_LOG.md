# 读伴实施日志（含 App 化历史）

> 最后更新：2026-07-23

这份文档是项目唯一的按日期实施日志，保留「读伴」从纯前端 MVP 演进为本地优先 App 的完整历史，也继续记录 P7 及后续阶段每次实际完成的工作。

它和 [ROADMAP.md](./ROADMAP.md) 的分工不同：

- `ROADMAP.md` 记录整体产品路线、阶段优先级和 Backlog。
- `PROJECT_NOTES.md` 记录产品、架构与数据共识。
- 本文档只记录每次实施、验证结果和当时限制，避免把同一份流水账再复制到其他文档。

## 维护规则

每次完成项目工作后，都要更新本文档：

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

状态：已完成本地优先桌面存储基线。阶段 5.2-5.9 与 P6.1-P6.6 已建立结构化 SQLite/App 数据目录、Keychain、目录式备份、校验/合并/回滚、解析韧性、AI transport、安全和诊断能力。压缩归档、备份签名和更多历史迁移夹具属于后续增强，不阻塞当前 Public Alpha。

### 阶段 6：打包、备份和发布准备

目标：从可开发的桌面 App 走向可安装、可备份、可升级的本地产品。

完成标准：

- 可以生成桌面安装包。
- App 名称、图标、bundle identifier 和版本号明确。
- 支持导出/导入关键阅读数据。
- 有数据 schema 版本和迁移策略。
- 后续再评估签名、公证、自动更新和崩溃日志。

状态：已完成并冻结。`v0.2.0-alpha.4` 已由 GitHub Actions 自动完成 Developer ID 签名、Apple notarization/staple、Gatekeeper、updater archive/signature、manifest/checksum 和 prerelease 发布，独立下载与正式旧 PDF 回归通过。自动更新体验由用户自行验收，updater 私钥离线备份作为扩大外测前的发布运营事项保留。

### 阶段 7：连续陪读与按需协助

目标：让导读、读中和读后成为同一位读伴的连续体验，让自由提问嵌入书籍阅读现场，并让防剧透、回答深度、追问和知识边界真正改变系统行为。读伴只响应用户主动操作，不自行弹问。

完成标准：

- 三个书内阶段共享陪读脉络和可恢复状态，切换不丢草稿、引用、滚动或生成状态。
- 用户主动问答基于可靠正文锚点和已读范围，阅读事件不用于触发提问。
- 未读上下文过滤、输出预算、记忆取用和单次覆盖均有代码约束和自动化测试。
- 回答进入可编辑的章节记录和用户可控记忆，并能受控承接到下一节。
- 视觉身份和共享元素动效只表达真实状态，具备 reduced motion 和失败降级。

状态：P7.1-P7.11 与 P7-A/P7-B/P7-C 均已完成，P7 进入维护状态。现有陪读数据已具备统一 journey、事件、来源定位、已读范围、按需上下文、硬预算、缓存、连续过渡、成果索引、受控跨章节承接、可管理的本书记忆、可追溯视觉状态和脱敏上下文解释；独立「随书聊」与主动提问入口均已撤下，历史聊天和介入事件仅作兼容记录保留。下一步为 **P8.1 移动技术验证**。

## 实施日志

### 2026-07-23：书籍信息确认与关联体验修正

- 书籍信息页改为固定视口布局：页头、基本信息和底部操作保持可见，章节列表独立滚动；桌面宽屏使用表格，窄窗口自动改为双列章节卡片，避免全局和横向滚动。
- 每章增加明确的“阅读 / 不读”开关。内容类型负责说明章节性质，开关单独决定是否进入阅读计划和整本书导读取材；附录也可由用户主动打开阅读。
- 章节识别增加书名页、扉页、出版信息、自序/译序、出版缘起、参考书目和后记等规则；中文标题分类忽略内部空格。目录进入附录区后，后续系统自动识别条目默认保持在附录区。
- 旧书只修正未由用户确认的自动识别结果；用户手动设置的类型和阅读开关保持不变。未新增数据库表、schema 或备份版本。
- 修复书架卡片菜单被纸张容器截断的问题；已配置书的五项菜单在卡片和视口内完整显示。
- 导读空状态改为专用居中操作区，移除复用对话样式产生的左侧竖线；读伴设置步骤统一改为“阅读背景、阅读重点、陪读方式”等直接表达。
- 新增 `test:book-setup-experience` 并纳入 P7 全量回归，覆盖自动分类修复、用户选择优先、附录顺序、阅读计划/导读取材接线、固定视口、菜单和导读入口样式。
- 真实浏览器在 1280×720 与 760×620 下确认无全局或横向滚动，章节列表内部滚动正常；导读按钮相对内容区居中，书架完整菜单未被裁切。
- P7 全量测试、formal/test build、安全扫描、文档审计和差异格式检查通过。最新 `读伴 Test.app` 因当前环境未读取到 Developer ID，完成本地临时重签并通过 `codesign --verify --deep --strict`；可执行文件 SHA-256 为 `ef8684c1f268ec0b673f081885d7d7585f4e746e9cd84e21b5569c2ada4cd9a9`。

### 2026-07-22：章节翻页与读伴入场解耦

- 取消导读卡读伴形象随整页平移到阅读侧栏的飞行动画，避免翻页中途压住章节标题、缩放失真或与书页运动争抢注意力。
- 章节书页先独立完成翻页；翻页遮罩完全结束后，读伴侧栏再从右侧淡入。翻页时间由 `1460ms` 缩短为 `1120ms`，读伴入场使用独立的 `560ms` 克制动效。
- 翻页期间整个读伴侧栏保持隐藏，不只隐藏头像；收起状态则对页边唤醒印记使用同一入场规则。关闭翻页动画或启用减少动态时直接进入正文，不增加延迟。
- 删除旧坐标读取、目标推算、飞行图层和相关 CSS；专项回归明确检查翻页中不存在读伴飞行节点，并验证先翻页、后入场的状态顺序。
- 真实浏览器按动画时间点确认翻页中侧栏透明度为 `0`、飞行节点不存在，翻页结束后才进入 `reader-companion-side-arrive`；P7 全量测试、formal/test build、安全扫描、文档审计和差异格式检查通过。最新 `读伴 Test.app` 已本地重签并通过严格校验，可执行文件 SHA-256 为 `c7e3551b9249c33de8ecdb6361f4a0bd6e428dbf24a44b422c66838f2bbd4cf5`。

### 2026-07-22：P7.11 诊断、QA 与阶段收口

- 新增版本化 `companionDiagnostics` 安全摘要，把导读、读中问答和读后交流的上下文追踪统一转换为材料类型、单向指纹引用、页码、字符数、压缩/截短状态、排除原因计数、策略枚举、预算和缓存状态；自由文本说明、原始 id、正文、笔记、问题、回答和 prompt 不进入诊断。
- AI 调用诊断升级为 v2；正常调用、流式调用和章节导读制品缓存命中都可记录本次选材。缓存命中记录 token/费用为 0，不额外调用模型。
- 设置页“AI 错误详情”调整为“AI 调用与选材”，每条记录可展开查看选入材料、排除原因、阅读规则、预算和缓存状态，也可复制脱敏摘要。
- 新增七类合成固定案例，覆盖普通文本 PDF、无目录 PDF、扫描页、超长章节、旧书、MOBI 和窄窗口；fixtures manifest、hash 与验证脚本同步更新，不提交真实书籍或私人数据。
- 新增 `test:companion-diagnostics`、`test:p7-qa-cases` 和 `p7:preflight` 并纳入 `test:p7`；P7 候选包自动检查、桌面人工验收和阻断条件固化到 `P7_RELEASE_CHECKLIST.md`。
- 修正通用 release preflight 的旧静态假设：测试桌面构建继续由 `build_test_desktop.mjs` 保证稳定签名与最新 bundle，预检同时验证代理脚本及其 test 配置路径，不再错误要求路径直接写在 `package.json`。
- 路线图、专项计划、QA、诊断隐私、接手提示词、Changelog 和文档审计统一标记 P7.1-P7.11 完成，产品主线下一步进入 P8.1。实际公开发版仍逐次执行 Developer ID 签名、公证、staple、干净 macOS 和自动更新验收。
- 本轮不新增 SQLite 表、存储 key 或备份字段，继续使用 schema 10、目录备份 v3 与 test/formal 数据隔离。
- 最终回归通过 `test:p7`、formal/test build、`p7:preflight`、`release:preflight`、安全扫描、文档审计、fixtures 校验、Rust fmt/check 和 28 个 Rust 测试；真实浏览器诊断页无横向溢出。最新 `读伴 Test.app` 的 bundle id 为 `com.duban.reader.test`，版本/build 为 `0.2.0 / 0.2.104`；当前环境未读取到 Developer ID，测试包完成本地临时重签并通过 `codesign --verify --deep --strict`，可执行文件 SHA-256 为 `5ce5f89cd4af32b672f4fa301bf08cda5ff459b52893f1b58191d70187ef15cb`。

### 2026-07-22：P7.10 读伴静默状态与动效

- 新增集中式 `companionVisualState` 契约，把准备导读、安静陪读、回答中、等待用户、保存记录、完成、错误和离线八种状态映射到真实任务信号；离线优先于错误，错误优先于普通任务态。
- `CompanionShell` 统一监听联网变化、暴露状态与可访问文案。离线时显示克制提示，阅读和本地内容仍可使用；Reader 的导读、读中问答、读后交流、笔记保存和完成页共用同一状态来源。
- 完整、标准和印记继续使用 P7.8 定稿资产。正文 `quiet` 与等待态没有循环动作；准备和回答只在任务期间显示细线或省略点，保存与完成只播放一次短过渡，错误和离线保持静态。
- 移除旧 `expression-thinking` 对当前 PNG 形象的视觉驱动，避免业务状态被抽象表情覆盖；取消生成会随 loading 结束立即回到当前场景状态。
- 新增 `test:companion-visual-state` 并纳入 `test:p7`，覆盖状态全集、优先级、可访问文案、Reader 接线、静默无动画和 reduced motion。
- P7 全量测试、安全扫描、文档审计、test/formal 构建和差异格式检查通过；真实浏览器确认导读页为 `waiting`、390×844 无横向溢出。浏览器环境未提供安全断网切换，真实桌面离线切换留入 P7.11 人工清单。
- 最新 `读伴 Test.app` 已重建，bundle id 为 `com.duban.reader.test`，版本/build 为 `0.2.0 / 0.2.104`；完整、标准、印记三份资产均嵌入可执行文件，bundle 图标存在。可执行文件 SHA-256 为 `d578b2eac9dc117fbdf7d61e25e9ad3d09944773f11423d7c6771fa86bbd40fe`。当前构建环境未读取到 Developer ID，测试包使用本地签名；正式签名、公证仍由 P7.11 候选流程验证。
- 本轮不改变 AI prompt、请求参数、SQLite schema 10、Keychain、目录备份 v3 或 test/formal 数据隔离。下一步进入 P7.11。

### 2026-07-22：P7.9.3 整理与长期回归

- 「整理这本书」增加“记忆”视图，按阅读顺序展示本节记录、手动保存和旧设置迁入三类来源；可跨章节选择、修改和二次确认撤销。
- 新增 `companionMemoryLedger`，只在明确 `memoryLink`、来源事件或唯一来源阅读项成立时补齐旧记录来源。旧 `legacy` 内容保持原身份，不自动进入后续导读。
- 修改章节记忆会同步 `session_record.memoryLink.text`；撤销只清除长期记忆和关联，不删除本节索引、问答、笔记或读后交流。
- 固定目录备份样本扩展为两条跨阅读项记忆、两个有效本节记录、一个选区来源事件和一个删除 tombstone；校验脚本检查来源、事件数量、hash 和删除状态。
- 新增 `test:companion-memory-management` 并纳入 `test:p7`。P7 全量测试、formal/test 构建、安全扫描、备份样本校验、文档审计、差异格式检查和 28 个 Rust 测试全部通过；1440×900 下无全局滚动，760×700 下无横向溢出，浏览器控制台无警告或错误。
- 未新增 SQLite 表、存储 key 或备份字段；继续使用 schema 10、目录备份 v3 和现有 test/formal 数据隔离。P7.9 完成，下一步为 P7.10。

### 2026-07-22：完成页适配与桌面实例收尾

- 完成页默认展示有内容的“回答”，并补齐宽屏、窄屏和矮窗口布局；页面根容器不再产生全局滚动条。
- 浏览器三档视口、P7 回归、formal/test build、安全扫描和 codesign 均通过。
- 清理中断期间遗留的三个测试实例后，只启动一个最新 `读伴 Test.app`；可执行文件 SHA-256 为 `e965fd9e9099844f0166c7573b776c11a94cf3b5283dc20e3f5371bd92e49f62`。

### 2026-07-21：读后记录单视口与一键总结

- 读后环节不再作为独立长页面出现，改为从阅读中的统一时间线自然延续；网页端使用共享元素过渡，桌面端保留局部过渡以兼容 macOS WebView。
- 页面固定为 `100dvh`，顶部、底部操作区固定，仅记录区滚动；1280×720 和 760×620 实测无全局滚动条，窗口缩放后最新记录保持可见。
- 新增一键整理本节总结及重新整理，使用独立 prompt 和既有 AI transport，不新增桌面 command、SQLite 表或存储 key。
- 笔记在统一时间线中改为明确便签，和左右两侧的用户/读伴对话严格区分。
- P7 全量测试、formal/test build、安全扫描、Rust test/check 和 codesign 校验通过。新 `读伴 Test.app` 已启动，bundle id 为 `com.duban.reader.test`，可执行文件 SHA-256 为 `3b670773a30bcca706d8e0835a2c87747ce1769b3c04219d8e5f4d8a936925c9`。
- 完成页默认展开第一个有内容的成果分类，优先显示“回答”；手动切换或收起后保持用户选择。
- 完成页增加宽屏双栏、窄屏单列和矮窗口紧凑规则，根容器固定为 `100dvh`；目录或成果过长时只滚动对应内容区，不让整个桌面 WebView 产生全局滚动条。
- 1280×720、760×620、480×620 真实视口回归均无全局或横向滚动条；最新临时签名 Test.app 可执行文件 SHA-256 为 `e965fd9e9099844f0166c7573b776c11a94cf3b5283dc20e3f5371bd92e49f62`。

### 2026-07-15：阅读图标同步到桌面测试包

阶段：P7 前端体验修正回归

问题：图标源码在旧 Test.app 生成后约 15 分钟才更新，浏览器已经显示新图标，但桌面端仍运行旧 bundle。

处理与验证：

- 完全退出旧 `com.duban.reader.test`，重新执行 `npm run tauri:build:test` 并打开新 `读伴 Test.app`。
- 真实桌面阅读页确认「中途离开」显示茶杯、「我读完了」显示圆形勾选、「读伴有一问」显示对话气泡。
- 桌面测试包保留用户原测试书库和阅读位置，没有迁移或清理数据。
- 流程约束补充：桌面验收必须使用最后一次前端源码修改之后构建的 bundle；Vite 浏览器验证不能替代 Test.app 重建。

### 2026-07-14：阅读操作图标语义收敛

阶段：P7 前端体验修正

目标：让阅读工具栏和读伴入口的图标直接表达动作，不再用同一个印章覆盖完成、提问、状态和设定等不同语义。

改动：

- 新增茶杯、圆形勾选和读伴对话图标；中途离开、我读完了和读伴提问分别使用对应图标。
- 已完成状态的「回到书架」仍使用书本，避免茶杯覆盖返回动作。
- 会客厅、本书状态、旧聊天兼容区和设定读伴步骤移除 `seal` 复用；印章只保留藏书登记语境。
- 未知 `ChineseIcon` 名称不再回退为印章；新增图标语义自动化测试并纳入 P7 测试。

验证：

- 浏览器真实阅读页检查 16px 图标可辨、按钮对齐和线条重量一致。
- `npm run test:p7`、`npm run build`、`npm run release:preflight` 与 `git diff --check` 通过。

### 2026-07-14：网页版书架全视口框架

阶段：P7 前端体验修正

目标：消除超宽浏览器中因复用桌面最大内容宽度产生的大块左右空白，同时保持书卡尺寸和桌面 App 布局稳定。

改动：

- App 根节点按运行时增加 browser/desktop class，导航和书架共享 `app-wide-frame`。
- 网页版取消框架的 `1480px` 上限，保留 24–64px 安全边距；Tauri 桌面版不应用覆盖规则。
- 书卡保持 `210–236px` 列宽，由网格随视口增加列数，不把少量书卡拉伸成大卡片。
- 修复 20 本测试夹具没有指定模拟宽度时被错误限制为 420px 的问题。

验证：

- 浏览器框架宽度与可用视口一致，左边界为 0，页面无横向溢出。
- 20 本书在 1280px 视口为 4 列 5 行，卡片高度一致。
- P7 测试、正式构建、release preflight 与 `git diff --check` 通过。

### 2026-07-14：书卡阅读活动与完成状态拆分

阶段：P7 前端体验修正

目标：修复已开始阅读却显示「未启卷」，以及仅发生阅读活动就显示「今日已读」的语义冲突。

改动：

- 新增纯展示规则模块 `bookTicketStatus.js`，把未开始、阅读中、今日完成和全书完成分开计算。
- 0% 但已有当前阅读位置时显示「阅读中」；今天只产生阅读活动时显示「今日在读」。
- 「今日完成」仅依据 `completedAtByItemKey` 中当天的完成时间，不再依据 `readingDays / lastReadAt`。
- 新增 `test:book-ticket-status` 并纳入 `test:p7`，覆盖五种关键状态。

验证：

- 状态单测和完整 P7 测试通过，正式前端构建与 Test.app bundle 通过。
- 真实桌面测试库两本书均为 0% 但已有阅读位置，实际显示「阅读中 / 今日在读」。

限制：不迁移旧数据；历史记录没有 `completedAtByItemKey` 的情况下不会推测「今日完成」，以避免再次把阅读活动误判为完成。

### 2026-07-14：大书库书卡等高与响应式网格回归

阶段：P7 前端体验修正

目标：

- 修复一行书名和两行书名导致同排书卡高度不一致的问题。
- 确认 20 本以上形成多行时仍保持稳定网格，并随窗口宽度自动改变列数。

改动：

- 桌面与手机书卡标题区分别固定为对应字号的两行高度，短标题不再缩短卡片。
- 书架网格使用等高隐式行，书卡和纸张背景拉伸到完整行高；封面仍维持 `2 / 3` 比例。
- test channel 增加不写数据库的 20 本混合书卡夹具，覆盖短/长标题、长作者、不同阅读状态和进度；formal channel 不启用。
- QA 矩阵新增 `SMK-002A`，把多行等高、响应式列数、无横向溢出和封面比例列为固定回归要求。

验证：

- 20 本夹具在 1080/820/620px 容器分别排成 4/3/2 列和 5/7/10 行；所有卡片与纸张高度一致，每行无高度分叉，页面无横向溢出。
- 最新 `读伴 Test.app` 从默认窗口拖到配置允许的 960px 最小宽度后保持两列，真实两本书顶部和底部对齐。
- `npm run test:p7`、`npm run build`、`npm run release:preflight`、`npm run tauri:build:test` 和 `git diff --check` 通过。

限制：

- Tauri 主窗口最小宽度为 960px，因此桌面版不会进入小于 640px 的手机断点；手机双列规则继续由 Web/mobile viewport 使用。
- 测试夹具通过 `?shelf-grid-fixture=20&fixture-width=<px>` 使用，只在 test channel 生效，不保存、覆盖或删除真实书籍。

### 2026-07-14：撤下独立「随书聊」入口

阶段：P7-A 连续体验基线反馈收敛

目标：

- 让读伴继续嵌入导读、正文和读后，不再成为一个需要离开书籍才能进入的聊天目的地。

改动：

- 撤下书架操作菜单、整理页、导读、正文工具栏、读后和完成页中的「随书聊 / 和读伴聊聊」入口。
- App 不再挂载独立 `BookCompanionChat` 视图，也不再为聊天往返保留第二套页面导航状态。
- 正文侧栏「问读伴」、划词提问、导读、读后交流和统一陪读脉络保持不变。
- 旧 `__book_companion__` 消息、由其生成的笔记及备份数据不删除，继续作为兼容历史进入 journey 与整理页统计。

边界与下一步：

- 本轮只撤下产品入口，没有迁移或清除旧聊天数据，也没有修改 SQLite schema。
- P7.4 继续围绕嵌入阅读现场的提问与介入设计策略，不再为独立聊天页增加能力。

验证：

- `npm run test:p7`、正式前端构建、`git diff --check` 和当前代码的 `读伴 Test.app` release bundle 构建通过。
- 真实 Test.app 确认书架菜单、整理页和正文工具栏均无独立聊天入口；正文「问读伴 / 笔记」与整理页历史读伴回答正常保留。

### 2026-07-14：P7.3 统一陪读时间线与场景间共享元素动效

阶段：P7-A 连续体验基线

目标：

- 把导读、读中、读后和随书闲聊从相邻功能串为同一位读伴的连续脉络，并先用不落库的原型验证主动介入体验。

改动：

- 新增统一时间线转换器与 `CompanionJourneyTimeline`，同屏展示导读线索、问答、笔记、读后交流、本书聊天和原型介入。
- 导读收束出 2-3 条本节线索；读后显示完整脉络并在完成阶段压缩为本节会话记录。
- 随书闲聊可展开陪读脉络、引用记录；从阅读器往返时保持 Reader 挂载，恢复页码、侧栏和草稿。
- 正文页边新增明确标注的「交互原型」，可以展开、引用和关闭，但不保存为真实调度事件。
- 新增可中断共享过渡：支持读伴标记、最新记录和介入卡交接；兼容重复点击、API 缺失和 reduced motion。
- `test:p7` 加入时间线、引用、会话记录和原型状态测试。
- 根据首轮试用保留导读 overview 正文与重新生成入口，只去掉与「带进正文的线索」重复的目标/问题卡片；正文侧栏从四页签收敛为「问读伴 / 笔记」。
- 「翻开这一章」不再与普通 scene transition 并行动画；改为测量导读与侧栏头像位置，让读伴随翻页移动、缩小并在末帧交给真实侧栏节点，快速连续操作会先结束上一段共享过渡。

验证：

- `npm run test:p7`、`npm run build` 和 `npm run tauri:build:test` 通过。
- 浏览器真实阅读会话已验证正文/随书闲聊往返、草稿恢复、六类卡片共同显示、显式引用和读后无横向溢出。
- 测试过程没有发送 AI 请求，模拟介入没有写入正式 journey。
- 《万历十五年》再次验证导读正文与 3 条线索并存、目标/问题卡片已移除，正文仅有 2 个侧栏页签；翻页中飞行节点可见且目标节点暂时透明，结束后目标正常接管，无横向溢出。

边界与下一步：

- 真实主动问题、阅读事件、调度与持久化仍属于 P7.5-P7.8；当前原型不会冒充生产能力。
- Test.app 构建成功，但本机自动化窗口出现一次旧 WebView 恢复页，真实桌面 UI 交互需在下一次启动回归中复核。
- 下一步 P7.4 将抽象人格设置收敛为剧透、回答深度、追问、主动程度和知识边界等硬规则，以及可编辑软记忆和单次覆盖。

### 2026-07-14：P7.2 持续挂载的读伴壳层

阶段：P7-A 连续体验基线

目标：

- 让同一阅读项的导读、正文与读后共享读伴会话状态，避免阶段切换时草稿、引用、面板和滚动位置被卸载。

改动：

- 新增 `CompanionShell` provider，并以 `bookId:itemKey` 作为明确会话边界。
- 新增 presence/context/timeline/composer 四个共享语义组件，接入导读、正文侧栏和读后交流。
- 把聊天草稿、划词引用、读后草稿、active panel、sidebar open 和时间线滚动提升到 shell state。
- 时间线返回后恢复原位置；流式生成只在用户仍接近底部时自动跟随。
- Reader 当前 live state 通过 P7.1 adapter 生成 journey 并交给 shell；原消息、请求取消、笔记和进度存储不变。
- 新增 shell reducer 测试、`test:p7` 聚合命令和 CI 契约测试步骤。

验证：

- `npm run test:p7`、`npm run build`、`npm run security:scan` 与 `git diff --check` 通过。
- 本地真实阅读会话验证聊天草稿和读后草稿跨场景恢复，shell session key 不变，控制台无 warning/error。
- 1280x720 与 390x844 均无横向溢出。

边界与下一步：

- 本阶段没有 schema、prompt 或旧数据改写。
- P7.3 将在此壳层上串联四场景的统一时间线与共享元素动效。

### 2026-07-14：P7.1 陪读脉络契约与前端适配层

阶段：P7-A 连续体验基线

目标：

- 在不迁移 schema、不改写旧数据的前提下，把现有陪读记录规范化为后续共享壳层可直接消费的只读 journey。

改动：

- 新增 `src/lib/companionJourney.js`：
  - 定义四类 scene、九类当前/预留 type 和 available/orphaned 状态。
  - 聚合导读、章节问答、划词问答、读伴回答、笔记、读后交流和本书聊天。
  - 生成稳定 journey id，按来源去重、按时间排序，并提供 scene/type/item 筛选。
  - 保留页码、摘录和选区矩形来源，不复制导读 raw 内容。
- 新增 `src/lib/companionJourneyStore.js`，从现有存储 key 只读加载一本书的 journey；单项读取失败时降级为空，不影响其他记录。
- 旧数组格式、旧纯文本 guide 和失效阅读项均有明确降级，不会被错误绑定到当前阅读项。
- 新增 `scripts/test_companion_journey.mjs` 与 `npm run test:companion-journey`。

验证：

- `npm run test:companion-journey` 通过，共检查 11 条固定记录。
- `npm run build` 通过；仍只有既有 Vite chunk 体积提示。
- `npm run security:scan` 通过。
- `node --check src/lib/companionJourney.js`、`node --check src/lib/companionJourneyStore.js` 和 store 独立 import 检查通过。

边界与下一步：

- 本阶段没有 UI、prompt、schema 或用户数据改动；adapter 尚未替换现有页面展示。
- 下一步 P7.2 使用该 journey 建立持续挂载的 `CompanionShell`，先串联导读、正文和读后状态。

### 2026-07-14：P7 连续陪读与主动介入重新规划

阶段：P7 规划 v2

决策：

- 前端体验先行：先把现有导读、读中、读后和随书闲聊串成统一 journey，再冻结新 schema。
- 使用持续挂载的读伴壳层和共享元素动效表达同一位读伴在场景间移动，避免关闭一个功能再打开另一个功能的割裂感。
- 设置拆为硬规则、软记忆和单次覆盖；删除“概念/论证/背景/应用”等无法稳定界定的硬分类。
- 防剧透由 `readFrontier` 和上下文过滤保障，回答深度由 token/结构预算保障；prompt 只作为补充约束。
- 主动介入前端原型与真实调度明确分阶段，P7-A 不以模拟状态冒充生产能力。

文档改动：

- 重写 [COMPANION_ACTIVE_READING_PLAN.md](./COMPANION_ACTIVE_READING_PLAN.md)，将 P7 拆为 12 个可验收步骤和三个里程碑。
- 同步 [ROADMAP.md](./ROADMAP.md) 和 [PROJECT_NOTES.md](./PROJECT_NOTES.md) 的当前阶段、依赖和下一步。

验证：

- 本轮仅修改 Markdown 规划，不涉及代码、schema、prompt、构建产物或用户数据。
- 下一步从 P7.1 陪读脉络契约与前端适配层开始。

### 2026-07-13：P6.12 总收尾与阶段冻结

阶段：P6.12.2-P6.12.8 / Public Alpha 工程基线

决策：

- Alpha.3 → Alpha.4 App 内真实更新体验由用户自行验收，不再让 AI 重复执行，也不阻塞 P6 冻结；结果仍应补到 Release Checklist/QA Matrix。
- updater 私钥加密离线备份继续由用户在受控介质上完成，是扩大外部测试前的发布运营检查项，不是开发主线阻塞。
- 现有空/篡改备份 fixtures 与 Rust 的 schema、备份 roundtrip、篡改拒绝、replace 回滚和 merge 测试认定为升级恢复基线；更多历史整库样本和 GUI Playwright 作为持续 QA。

改动：

- CI 新增独立 `RustSec Audit` job，安装 `cargo-audit` 并在 `src-tauri` 直接执行审计；本地保留 `npm run security:rust-audit` 快捷入口。
- 首次 RustSec 审计发现 `quinn-proto 0.11.14` 与 `quick-xml 0.39.4` 共 3 条 high advisory；`quinn-proto` 已兼容升级到 0.11.15。Tauri 2.11.3 经 `plist 1.9.0` 仍约束 `quick-xml 0.39.x`，项目新增两条精确 ignore，并记录该 plist 路径不接收书籍、模型响应或其他用户 XML；上游允许 0.41 后必须删除例外。
- `release:preflight` 扩展正式产物扫描，拒绝 `.env`、证书/私钥文件、测试书目录和私钥正文形态进入 `dist`。
- README 新增 Public Alpha 安装、首次 AI 配置、备份、隐私、安全、支持范围、限制、版本通道与反馈入口，并增加 CI badge。
- P6.10-P6.12、Roadmap、Release Checklist、后端标准和 AI 接手状态统一改为 P6 工程基线完成；开发主线切换到 P7。

验证：

- formal build、version check、release self-test、release preflight、QA fixtures、安全扫描、Rust fmt/check、Rust check、26 个 Rust tests、联网 `npm audit` 和 `git diff --check` 均通过。
- 已安装 `cargo-audit 0.22.2` 并联网加载 1160 条 advisory，对 566 个锁定依赖执行扫描；修复/精确例外后无未忽略漏洞，保留 18 条上游 unmaintained/unsound informational warning 供持续依赖升级跟踪。

限制：

- 已发布 Alpha.4 不包含当前工作区中的混合 MOBI/KF8、动态文本分屏、精确划词和笔记高亮修复；下一候选版本必须带入这些改动并执行 `SMK-004 + LIB-006 + RD-002A`。
- P6 完成表示生产化工程基线可维护，不表示所有平台、文件和失败场景都已穷尽验证。

### 2026-07-13：MOBI 翻页模式精确划词

阶段：P6.12.1 正式候选包回归 / 阅读器选择交互修复

问题：

- 翻页模式原先使用覆盖书页左右两侧、贯穿全文高度的透明按钮实现页边点击；短词靠近右侧时，鼠标拖选终点会被按钮截获。
- macOS WebKit 在缺少有效拖选终点时可能把选择范围延伸到后续段落，用户只想选择“歙县”却会选中大段正文。

改动：

- 页边箭头改为不接收指针事件的视觉提示，不再覆盖正文选择层。
- 阅读区只在鼠标完成一次没有产生文字选择的左键单击时，根据落点判断上一屏/下一屏；一旦存在非折叠选择，始终保留原文范围且不翻页。
- 触摸/手写笔横向滑动、触控板横滑、顶部箭头和方向键入口保持原逻辑；页边提示继续随可用方向和鼠标位置显示。

验证：

- 真实 `读伴 Test.app` 在《显微镜下的大明》第 6 文本页翻页模式中，反向拖动可只选择“歙县”两个字，浮层没有扩大到后续段落。
- 清除选择后轻点正文右缘从 `1/6` 进入 `2/6`，轻点左缘返回 `1/6`；短词选择与页边翻屏同时可用。
- `npm run build:test`、`npm run tauri:build:test`、`npm run build:formal`、`npm run release:preflight`、`npm run security:scan` 和 `git diff --check` 通过；测试过程没有创建或删除笔记。

### 2026-07-13：MOBI/纯文本笔记高亮恢复

阶段：P6.12.1 正式候选包回归 / 阅读器笔记一致性修复

问题：

- PDF 阅读器会接收待保存笔记和历史笔记作为高亮数据，MOBI/纯文本阅读器此前只支持划选与保存，没有把笔记重新绘制到正文中。
- 自适应翻页会把一个逻辑文本页拆成多个屏幕页，仅保存屏幕坐标会在窗口变化后失效。

改动：

- `ReadingStage` 将与 PDF 相同的可见高亮集合传给 `TextBookReader`；待保存笔记即时出现高亮，保存后由历史笔记继续恢复。
- 文本页按“逻辑页码 + 规范化原文”匹配旧笔记，不修改 SQLite schema；已有 MOBI 笔记无需迁移。
- 动态分屏片段保留原段落编号和字符偏移，高亮绑定原文范围而非屏幕坐标，因此重新分屏、正反翻页和滚动/翻页切换后仍能定位。
- `highlightDisabled` 继续控制“取消高亮”，重新划原文后会按新文本定位；高亮样式不增加排版尺寸，避免影响屏幕分页结果。

验证：

- `npm run build:test`、`npm run tauri:build:test`、`npm run build:formal`、`npm run release:preflight`、`npm run security:scan` 和 `git diff --check` 通过。
- 真实 `读伴 Test.app` 中，升级前保存的《显微镜下的大明》第 6 文本页“徽州府”笔记在启动后恢复高亮；从屏幕页 `1/5` 前进到 `2/5` 再返回后仍存在。
- 新划选“辖的歙”并点击“添加笔记”后即时出现临时高亮，取消后未写入测试笔记；切换滚动模式后历史高亮仍可见。

限制：

- 没有字符偏移的历史笔记采用与 PDF 文本兜底一致的首个原文匹配策略；同一逻辑文本页出现完全相同的短句时，默认高亮第一次出现的位置。

### 2026-07-13：MOBI 翻页模式自适应分屏

阶段：P6.12.1 正式候选包回归 / 阅读器兼容修复

目标：

- 修复较长 MOBI 文本页在翻页模式下只有大窗口才能完整显示、较小窗口会被底部直接裁断的问题。
- 不通过缩小字体硬塞正文，也不改写已保存的文本页、章节、进度、笔记和 AI 上下文页码。

改动：

- `TextBookReader` 在翻页模式下根据阅读区实际宽度、高度和当前字体排版测量正文，把一个逻辑文本页拆成若干屏幕页。
- 长段落会在能完整容纳的位置切分，并优先靠近空格或中文标点断开；每次窗口或读伴侧栏尺寸变化后自动重算。
- 顶部按钮、方向键、书页边缘点击、触摸/手写笔左右滑动和触控板横滑统一先翻当前逻辑页内的屏幕页，到首尾边界后再切换相邻逻辑页。
- 顶部计数在存在多屏时显示“本页 2/6 · 本节 1/7”；关闭翻页动画后即时换屏，减少动态效果偏好继续禁用动画。
- 逻辑 `pageNumber` 没有变化，阅读进度、章节范围、笔记原文绑定和 AI 当前页上下文无需迁移。

验证：

- `npm run build:test` 通过；只有既有 Vite 大 chunk 提示。
- 重新构建真实 `读伴 Test.app`，使用本地授权《显微镜下的大明》MOBI 的第 6 文本页回归：正常窗口自动拆为 6 屏，连续方向键可到 `6/6`，随后进入本节第 2 个逻辑文本页；在下一逻辑页首屏按左键会准确返回上一页 `6/6`。
- 将桌面窗口缩到约 960px 并自动收起读伴后，正文保持原字号，当前屏右侧无串栏、底部无半行裁断；最后一屏完整显示该逻辑页尾段。

限制：

- 屏幕页是运行时排版结果，窗口和字体布局变化后屏数可能变化；持久化位置仍以逻辑文本页为准，不保存屏幕页索引。
- 本轮不渲染 MOBI 原版式、内嵌图片或复杂表格；这些仍属于后续格式能力。

### 2026-07-13：混合 MOBI/KF8 只导入 1 页修复

问题：

- 首次安装回归使用一份本地 7.1 MB、Mobipocket v6/UTF-8 样本时，Alpha.4 只生成 1 文本页和 1 个章节。
- 文件并未损坏，而是同时包含旧 MOBI 与 KF8/AZW3 内容。`@lingo-reader/mobi-parser` 的 `initMobiFile` 没有报错，但只返回 1 个 spine 和 385 字符的残缺 HTML 壳；`initKf8File` 可正确返回 28 个 spine、22 个目录项和约 23.4 万字。

修复：

- MOBI 导入不再以“第一个未抛错的解析器”为准；会初始化可用的 MOBI/KF8 候选，并按 spine 数、TOC 数和首/中/尾章节抽样正文量选择结构更完整的结果。
- 若解析器加载后的章节 HTML 明显短于 spine 原始文本，则回退使用原始章节内容，避免第三方解析器再次静默返回短壳。
- 章节用途判断从 PDF 模块提取为 PDF/MOBI/书籍确认页共用规则；“版权信息”、目录、扉页等前置内容默认忽略。
- 保留 MOBI TOC 层级：带子章节的卷标题作为结构分组忽略；没有独立标题的后续 spine 合并到上一真实章节，不再生成“章节 10/12/25/27”一类伪章节。没有子章节、直接承载正文的卷仍保留为正文。
- 新增 QA `LIB-006`，固定覆盖扩展名为 `.mobi` 的混合 MOBI/KF8 文件。

验证：

- 直接诊断确认 KF8 候选为 28 个 spine、22 个扁平目录项、约 233988 个去标签正文字符。
- 真实 `读伴 Test.app` 初次重新导入后显示 130 文本页、28 个 spine 章节，书名与作者正确；SQLite 保存 130 个文本页、237185 个正文字符，范围覆盖 1–130 页。
- 继续修正章节语义后直接重解析为 130 文本页、23 个有效章节：版权信息、第一卷/第五卷结构标题和末尾目录均为忽略；第二/三/六/七卷吸收后续无标题正文，范围分别为 31–49、50–65、116–125、126–129；不再出现泛化“章节 N”。
- 共享章节用途规则的定向检查覆盖版权信息、Table of Contents、序言、正文章节和附录。
- `npm run build:test`、串行 `npm run build:formal`、`npm run tauri:build:test`、`npm run security:scan` 和 `git diff --check` 通过。并行运行 test/formal build 会争用同一个 `dist/`，本轮曾触发正式包测试 token 护栏，改为串行后通过。

限制：

- 用户在 Alpha.4 中已经导入的 1 页错误记录不会自动重解析，需要在包含修复的版本中删除后重新导入。
- 版权样本只用于本机人工回归，不提交仓库；后续仍需制作可公开提交的最小混合 MOBI/KF8 fixture。
- 已发布的 Alpha.4 不包含本修复，下一正式候选必须重新打包、签名并执行 `SMK-004`、`LIB-006` 和 `RD-002`。

### 2026-07-13：P6.12.1 本机首次启动回归环境重置

完成：

- 确认正式 App 未运行后，将 `com.duban.reader` 数据目录、formal/旧通用 WebKit 数据、缓存和偏好文件整体移动到 `~/Library/Application Support/duban-reset-snapshots/20260713-135513/`，没有直接删除。
- 移动前正式库为 1 本书、约 103 MB；完整可恢复快照约 281 MB。
- 测试目录 `com.duban.reader.test` 未改动，正式 Keychain 密钥也未删除；新 SQLite 的 `hasApiKey` 默认状态仍会触发首次 AI 设置，同时避免丢失无法从文件快照恢复的系统凭据。
- 正式 App 数据目录当前不存在，下一次 Alpha.4 启动将创建全新数据库和文件目录。

待验证：

- 从完全退出状态启动只读 DMG 中的 Alpha.4 build `0.2.104`，已确认首次欢迎页显示“你好，欢迎使用读伴”，书架为 0 本书且显示“上传第一本书”。
- AI 配置、PDF 导入、备份导出以及完全退出后的进度恢复仍待人工继续验收。

### 2026-07-13：P6.12.1 Alpha.4 正式候选发布与旧书回归

完成：

- PR #4 和最终 `main@512718f` CI 通过；annotated `v0.2.0-alpha.4` 已推送。
- Release workflow `29221217621` 完成 Developer ID 签名、Apple 公证 `Accepted`、staple、Gatekeeper、updater 签名、GitHub prerelease 和 Alpha manifest 更新。
- Apple Submission ID：`dc424207-65de-4cb6-b2f4-b7934457b264`。
- 正式 DMG SHA-256：`09824f8dabb1976b2f5c5105cba4a85d8c0f117167524d0c25f3f516bd5adff8`，独立下载结果与 Release checksum 一致。
- 独立执行 `hdiutil verify`、`xcrun stapler validate`、DMG/App `codesign` 和 `spctl`，全部通过并显示 `Notarized Developer ID`。
- 包内 App 为 arm64、`com.duban.reader`、Developer ID team `FBMN9293RM`、hardened runtime、bundle version `0.2.104`。
- 从只读挂载 DMG 启动正式 Alpha.4，成功打开 Alpha.4 前正式环境导入的旧 PDF；原书第 48 页起的原页和文本层正常，没有 `Unexpected server response (0)`。
- 正式/测试书库的同名书使用不同 id、不同文件和不同创建时间，确认本次没有 test/formal 串库。

剩余：

- 当前机器已有正式数据，不能充当干净 macOS 首次安装环境；需在另一台 Mac 或独立干净用户完成首次启动、空书架、AI 配置、导入、备份和重启恢复。
- P6.12.2 继续用已安装 Alpha.3 验证 App 内升级到 Alpha.4。

### 2026-07-13：P6.12.1 Alpha.4 候选源码与桌面回归

目标：将 Alpha.3 之后确认的旧 PDF 修复和阅读体验改动整理为可追溯的下一正式候选版本。

完成：

- 建立 `codex/p6.12.1-alpha.4` 发布分支，并把 npm、Cargo、Tauri、macOS bundleVersion、lockfile 和 Changelog 目标统一升到 `0.2.0-alpha.4`。
- Alpha.4 Changelog 已覆盖受限 fs 旧书读取、首次 AI 设置、品牌三规格、PDF 自适应/手势/动画、窄窗口专注阅读和本节页码。
- 生成真实 `读伴 Test.app`，直接读取 `com.duban.reader.test` 中升级前保存的《全球通史》，无需重新导入；PDF 原页、文本层和历史阅读位置正常。
- 桌面自动化验证滚动切翻页、书页边缘从本节第 3 页翻到第 4 页，以及专注阅读收起读伴侧栏。
- Tauri asset protocol 保持关闭；本地书籍只通过 `$APPDATA/files/**` 范围内的 `fs:allow-read-file` 权限读取。

验证：

- `npm run build`
- `npm run version:check`
- `npm run release:self-test`
- `npm run release:preflight`
- `npm run security:scan`
- `npm run qa:fixtures:verify`
- `npm audit --audit-level=high`：0 漏洞
- `cargo fmt --check`
- `cargo check`
- `cargo test`：26 passed
- `git diff --check`

剩余：

- 候选源码 PR #4 已通过 GitHub Actions 并合并到 `main@ccb4cc1`；Changelog 已冻结，等待 release preparation commit 与 annotated tag。
- 正式签名、公证、staple、Gatekeeper 与 artifact 校验尚未执行。
- 干净 macOS 环境的首次安装、空书架、AI Key、导入/旧书迁移、备份和重启恢复仍需最终人工验收。

### 2026-07-13：P6-P9 阶段边界重新确认

目标：把生产化收尾、主动陪读、手机版和云后端拆成职责清晰的连续阶段。

调整：

- P6 不再包含云后端决策，改为完整完成正式候选包、自动更新、升级恢复、自动化 QA、安全审计、Public Alpha 和发布密钥恢复能力后整体关闭。
- P7 当时规划为主动陪读引擎；该方向已在 2026-07-17 撤回，当前以连续陪读和用户发起的按需协助为准。
- P8 明确为手机版 App；首期本地优先，不等待账号或云同步，优先验证 iOS 并保留 Android 路径。
- P9 承接原 P6.12，统一建设账号、云后端、本地优先多设备同步、加密、云备份和可选模型代理。
- 新增 `MOBILE_APP_PLAN.md` 与 `CLOUD_BACKEND_PLAN.md`，并更新生产路线、总路线、文档索引和项目日志。

验证：

- `git diff --check` 通过。
- 当前路线文档中的 P6.12 已统一为生产化总验收；历史日志保留旧编号背景，并由新日志说明迁移关系。

限制：

- 本轮只调整路线与文档，没有开始 P8/P9 实现。
- P6.12.7 updater 私钥加密离线备份仍需要用户准备受控离线介质后人工完成。

### 2026-07-13：PDF 自适应单页、横向手势与专注阅读

阶段：Alpha.4 发布前阅读体验收口

实现：

- PDF 翻页模式从仅按宽度缩放改为 `min(widthScale, heightScale)`，通过 `ResizeObserver` 同时跟踪阅读容器宽高。
- Canvas、text layer 和高亮仍使用同一个 PDF.js viewport；滚动模式不受影响。
- 翻页阅读面板改为无纵向滚动的完整单页居中布局，PDF 纸张宽度跟随真实页面尺寸。
- 新增“专注阅读”开关，可收起/恢复读伴侧栏；布局变化会触发页面重新适配，不改变页码与进度。
- 阅读器双栏断点收紧为 `900px`，覆盖桌面 App 的 `960px` 最小窗口，避免最小尺寸提前切成上下堆叠并重新引入页面滚动。
- 新增书页左右边缘点击、触摸/手写笔左右滑动和触控板横向滚动翻页；所有入口复用 `handleReaderPageJump`，统一更新页码、进度和动画方向。
- 横向滚动使用累计阈值、纵横方向判断和 `420ms` 锁，降低触控板惯性连续跳页风险。
- 新增持久化“翻页动画”开关；动画为 `240ms` 轻微横移/淡入/缩放，关闭开关或系统启用 reduced motion 时即时切页。

验证：

- 真实 Test bundle 中，第 48 页在带侧栏模式完整显示；专注模式收起侧栏后仍保持比例和居中。
- 下一页切换到第 49 页，页码由 `1/30` 更新为 `2/30`，继续阅读位置同步，阅读区无纵向滚动条。
- 点击书页右边缘从第 48 页翻到 49；关闭动画后再翻到 50，checkbox 状态、页码与继续阅读位置均同步。触控板手势代码已接入，真实惯性手感留给用户人工验收。

后续：

- 自动双页和 MOBI/纯文本按窗口重新分页尚未实现。

窄窗口回归修正：

- 专注阅读入口扩展到滚动模式，切换阅读方式不再强制恢复侧栏。
- `900–1180px` 下顶部标题与操作区分行，读伴默认收起；重新打开时以覆盖层显示，不压缩 PDF 阅读区。
- 滚动模式 PDF 渲染宽度下限设为 `640px`，防止极窄窗口继续缩小文字；滚动与翻页模式仍共享同一文件、文本层和进度状态。

阅读项页码语义：

- 当前阅读项从 PDF 第 48 页开始时，界面主页码从“第 48 页”改为“本节第 1 页”；原始位置只在本节第一页旁轻量提示一次。
- 顶部恢复提示、翻页 stepper、连续页面标签和读伴状态只使用相对页码；笔记、高亮、AI 上下文与 SQLite 进度继续保存真实 PDF 页码。
- Test.app 实测《全球通史》连续页按本节 1/2/3 对应原书 48/49/50，历史进度无需迁移。

### 2026-07-13：本地书籍读取从 asset protocol 迁到受限 fs 插件

阶段：Alpha.4 发布前核心阅读链路修复

问题：

- 已保存旧 PDF 在真实 `读伴 Test.app` 中仍显示 `Unexpected server response (0)`；此前让 PDF.js 在 `asset:` 下改读 XHR 的兼容补丁，在当前 macOS WebKit 中会触发错误事件，无法稳定取得响应体。
- 排查时发现旧打包测试进程与当前调试进程同时存在，自动化最初命中了旧包；后续回归固定为关闭残留进程、重新构建并只启动最新 Test bundle。

实现：

- PDF.js 不再接收任何本地 asset URL，统一通过 `readFileAsArrayBuffer()` 得到二进制 `data` 后打开文档。
- 桌面本地文件读取改用 Tauri 官方 `@tauri-apps/plugin-fs` / `tauri-plugin-fs`；浏览器上传仍使用原生 File API，上层接口不变。
- capability 只授予 `fs:allow-read-file`，scope 限制为 `$APPDATA/files/**`；未开放写入、删除、目录遍历、用户主目录或下载目录。
- 移除已经没有调用方的 `convertFileSrc`、`protocol-asset` feature、asset scope 和对应 CSP 来源；安全扫描要求 asset protocol 保持关闭，并精确校验 fs 权限形态。
- 空文件、取消和插件读取失败继续转换为用户可读错误，不暴露本地路径或底层错误详情。

验证：

- 重新构建 `读伴 Test.app`，使用现有测试书库打开迁移前保存的《全球通史》，第 48 页 PDF 原页、文本层和后续页面成功渲染，阅读进度保持不变。
- `npm run tauri:build:test`、`npm run build:formal`、`npm run release:preflight`、`npm run security:scan`、`cargo fmt --check`、`cargo check`、`cargo test` 和 `git diff --check` 通过；Rust 26 个测试通过。

发布影响：

- `v0.2.0-alpha.3` 不包含本修复；下一候选版本必须重新签名、公证，并把旧书读取列为正式包 smoke test 阻断项。

### 2026-07-12：全局产品字体基线与商业字体候选

阶段：Alpha.4 发布前视觉一致性收口

实现：

- 将标题、正文、按钮、输入和阅读辅助界面统一到 `--font-app-cn`，当前使用系统 `Songti SC` 及跨平台宋体回退作为无授权依赖的评审基线。
- Tailwind `serif` / `sans` 共同消费该变量，品牌两字子集与等宽技术信息继续保持独立字体职责。
- 商业字体评估首选汉仪君黑，备选汉仪玄宋；在取得桌面嵌入、Webfont、安装/更新包分发和子集化授权前，不把试用字体纳入仓库与产物。

验证：

- `npm run build:test`、`npm run build:formal`、`npm run release:preflight` 和 `npm run security:scan` 均通过。
- 1280px 设置页实际命中 `Songti SC`，密集表单、导航和标题层级清晰，页面无横向溢出；字体改动不改变此前已通过的 390px 响应式尺寸与断点。

### 2026-07-12：品牌字标与横版 / 竖版 / 简版 Logo

阶段：Alpha.4 发布前品牌体验收口

实现：

- 原品牌字体从依赖系统 `HanziPen SC` 的纤细手写栈，迁为项目内置 `Duban Brand Script`；字形基础来自 OFL 授权的 Ma Shan Zheng，仅裁剪“读伴”两个字并重命名内部 family。
- 字体从约 `5.6 MB` 原文件裁剪为约 `1.8 KB` WOFF2；完整许可证随 `public/fonts/` 和正式构建产物分发。
- `BrandLogo` 收束为 `horizontal`、`vertical`、`compact` 三种正式 variant，分别接入顶部导航、Splash 和首次 AI 设置共享 Logo。
- 三种版本共享 `LogoMark` 与品牌尺寸规则；横版/竖版使用 `BrandName`，竖版默认增加 `DUBAN`，简版只保留图形和无障碍名称，业务组件不再自行拼接 Logo。
- 横版实机预览后移除默认 `DUBAN` 并缩短图文间距，解决右侧空白过大和英文悬在下方的问题；竖版保留英文，组件提供 `showLatin` 覆盖能力。

验证：

- 字体 cmap 仅包含 `U+4F34` / `U+8BFB`，内部名称为 `Duban Brand Script` / `DubanBrandScript-Regular`。
- test build 正确复制 WOFF2 与 OFL 文件；浏览器 `document.fonts.check()` 为 true。
- 1280×800 实际截图覆盖竖版开屏、简版欢迎页和横版导航；三种版本均渲染正常，控制台无告警。
- 简版仍为 `68×68px`，未改变此前校准的共享 Logo 位置与缩放轨迹。
- 收紧后的横版约 `104×40px`，只包含图形和中文字标；390px 顶部导航无重叠、页面无横向溢出。

后续限制：

- 当前字体子集只允许渲染“读伴”，不能用于其他中文文案；需要新增品牌文字时必须重新评估字体范围、授权和构建体积。

### 2026-07-12：未配置用户的首次 AI 引导

阶段：Alpha.4 发布前用户体验收口

目标：

- 新用户不需要先理解完整设置页，就能按顺序完成模型选择、API Key 验证和安全保存。
- 已配置用户不被打扰，也不因为状态检查主动读取 Keychain 明文。

实现：

- 新增 `AiSetupWizard`，在开屏结束后按 `getSettings()` 返回的非敏感 `hasApiKey` 状态决定是否显示。
- 引导第一屏新增安静的系统式欢迎页，只保留应用图标、欢迎标题和一句连接 AI 的提示；具体模型、安全和保存信息在用户开始设置后再展示。
- Anthropic 或 OpenAI-compatible 任一供应商已有 Key 时跳过引导；无 Key 时默认推荐 `DeepSeek Flash`，也可选择 `Claude Sonnet`。
- DeepSeek 快速配置复用现有 `openai-compatible` transport，写入项目已有 Base URL、模型和价格字段；Claude 复用现有 Anthropic transport。
- API Key 先完成真实连接测试，测试成功后再走现有 `saveSettings`；桌面 Keychain、浏览器存储、脱敏诊断和备份排除规则均未另起实现。
- 支持稍后设置、Escape、显示/隐藏 Key、Enter 提交、忙碌/错误/成功状态和步骤反馈；稍后设置只在当前启动会话内关闭。
- 根据用户试用反馈修正弹窗定位：提高 fixed 遮罩规则优先级，避免被 App 壳的相对定位规则覆盖；手机端也使用页面中央悬浮弹窗，不做贴底 sheet。
- 开屏结束与首次设置改为共享元素动画：Splash Logo 从 `112px` 缩小并移动到欢迎弹窗 Logo 的最终位置，弹窗 Logo 保持隐藏直到交接帧，视觉上始终只有一个 Logo。欢迎弹窗同时从中心展开，背景从纸面过渡为虚化遮罩。
- 桌面轨迹按实际布局从 `(640, 345.75)` 移到 `(640, 313.16)` 并缩为 `68px`；390px 轨迹使用独立响应式位移和缩放。Splash 延后到共享动画结束后卸载，避免提前断开。
- 欢迎页右上角关闭按钮已移除，用户通过底部“稍后设置”表达跳过意图。
- 欢迎页改用开屏同源的透明 `LogoMark`，去除带底色的图片资产和 Logo 外层背景、边框、阴影，避免弹窗纸面上出现双重底色。
- 性能收口移除 dialog 大面积 `filter: blur()` 和动画中的 `backdrop-filter` 插值；Logo 接管由末尾离散切换改为最后 32% 的连续透明度交叉，降低结束帧 GPU 合成压力。
- “来自开屏”的过渡状态在本次向导生命周期内保持不变，防止 Splash 卸载时 class 切换导致弹窗再次播放普通入场动画。

验证：

- `npm run build:test`、`npm run build:formal`、`npm run release:preflight` 和 `npm run security:scan` 通过；最终 `dist` 为不含测试入口的 formal 产物。
- 全新浏览器 origin 验证未配置时自动出现，DeepSeek 默认选中并带推荐标记；已有数据 origin 不出现引导。
- 1280×800 下遮罩为完整 fixed 视口，弹窗宽 `672px`、居中且页面无横向溢出。
- 390×844 下遮罩覆盖完整视口，弹窗宽约 `363px`、居中悬浮且 `body.scrollWidth = 390`。
- 欢迎页在 1280×800 和 390×844 下均保持居中；点击“开始设置”可进入 DeepSeek 默认选中的服务选择页。
- 动画时间轴截图覆盖开屏稳定态、交叉过渡态和最终欢迎页；最终弹窗 `opacity = 1`、`transform = scale(1)`，Splash 已卸载且无控制台错误。
- 共享 Logo 交接帧两层中心坐标误差小于 `0.03px`、尺寸误差小于 `0.02px`；最终只保留弹窗 Logo，欢迎页关闭按钮数量为 `0`。
- 最终 Logo 容器计算样式为透明背景、无边框、无阴影，SVG 尺寸 `68×68px`；时间轴复查无控制台错误或警告。
- 第二步的密钥输入框拥有独立 `API Key` 可访问名称，空 Key 时验证按钮禁用。

后续限制：

- 不在自动化测试中发送真实密钥；需要在 Tauri test 环境人工完成 DeepSeek 连接、Keychain 保存、重启后不再弹出和不触发连续密码框的验证。

### 2026-07-11：v0.2.0-alpha.3 首次真实 updater 发布成功

阶段：P6.8.5 双版本验收（第一版）

发布结果：

- annotated tag `v0.2.0-alpha.3` 绑定 clean `main` 提交 `446d68a`；tagged source、QA fixtures、formal build、release/updater preflight、Rust fmt/check/test 和 security scan 全部通过。
- Release workflow `29158078112` 两个 job 全绿；Developer ID 签名、Apple notarization/staple、Gatekeeper、updater signing、GitHub Release 和 Alpha channel publication 全部成功。
- GitHub Release `读伴 0.2.0-alpha.3` 已作为非 draft prerelease 公开：<https://github.com/luzhanwen/duban/releases/tag/v0.2.0-alpha.3>。
- Release 共 8 个 assets：ASCII DMG、`.app.tar.gz`、`.app.tar.gz.sig`、release manifest、checksums、notary log、release notes 和 updater Alpha JSON。
- `updater-index` 分支已由 root commit `515680c` 建立，公开 `alpha/latest.json` 指向 `0.2.0-alpha.3` 的 `darwin-aarch64` archive。

独立下载验证：

- DMG 大小 `18,648,247` bytes，SHA-256 为 `b5a7996b599aa98dcd3479a9d3ba423bfa919e3733395d7f3bf544335379a02f`，与 Release digest/checksums 一致。
- updater archive SHA-256 为 `c63718ba829a3ed18e1386b0702b20211c5d5910ad4838f4fefbb87f85a733c7`；`.sig` SHA-256 为 `da6ed7e3a7cf3c6852a020354b14cec2a266c9df6f5ea71d2b4854eec5a170eb`。
- Apple notary submission `02f147bc-5c71-49fe-8cf3-6bef77b2f558` 状态为 `Accepted`。
- 已下载公开 DMG 并通过 `hdiutil verify`、`xcrun stapler validate` 和 `spctl`；Gatekeeper 来源为 `Notarized Developer ID`。
- 远端 manifest 版本、release notes、`pub_date`、`darwin-aarch64`、签名文本和 GitHub archive URL 均可读取且互相一致。

下一步：

- 用户从 GitHub Release 安装 Alpha.3，确认正式书库、软件更新入口、手动下载和 App 重启正常。
- Alpha.3 安装确认后把开发版本升到 Alpha.4，发布第二个 signed updater artifact，并从 Alpha.3 完成真实检查、恢复点、下载、安装和重启。
- 坏签名、断网/中断、备份失败和 schema 恢复仍在 Alpha.4 验收中覆盖。

### 2026-07-11：P6.8 合并与 Alpha.3 发布准备

阶段：P6.8 自动更新 / Alpha.3 发布

- P6.8 功能提交 `fc27564` 已通过 PR #3 的完整 CI；检查包含前端构建、Rust、security scan 和 release preflight，耗时 2 分 33 秒。
- PR #3 已合并到 `main`，合并提交为 `7ee097d`；本地主分支与 `origin/main` 一致。
- `release:check -- candidate` 通过，确认版本 `0.2.0-alpha.3`、目标 annotated tag `v0.2.0-alpha.3`、clean main 和 Unreleased Changelog 草稿。
- `release:prepare` 已把 Alpha.3 Changelog 冻结为 2026-07-11；下一步提交发布准备、运行 tag-ready 检查并推送 tag。
- updater 私钥离线备份继续作为扩大 Alpha 测试前事项，本次内部 Alpha.3 按用户决定继续推进。

### 2026-07-11：P6.8.4 软件更新界面、恢复点与重启

阶段：P6.8 自动更新

改动：

- 正式 Tauri 设置页新增独立“软件更新”分类；浏览器版和 test channel 通过运行环境/通道双重判断隐藏入口。
- 更新面板显示已安装版本、Alpha 通道、检查状态、可用版本、release notes、数据保护状态和下载字节/百分比进度。
- 新增应用内安装确认弹窗，替代关键更新流程中的原生 `window.confirm`。
- 用户确认后先调用现有 `exportLocalBackup` 创建完整目录式恢复点，并写入升级目标版本标签和来源备注；备份失败时不会调用 updater 下载。
- updater 下载并安装完成后调用 process relaunch；失败时保留恢复点信息，并允许重试或手动下载。
- 新增官方 opener 2.5.4，手动下载只允许打开读伴 GitHub Releases URL；安全扫描固定检查该单一 scope。
- 安装流程复用现有备份 schema、Keychain 隔离和 updater 签名验证，不新增数据库 schema 或备份格式。

验证：

- `npm run build` / `build:test` / `build:formal` 通过；正式构建的 updater/opener 动态 chunk 正常生成。
- `cargo check`、`cargo fmt --check`、`cargo test` 通过，26 个 Rust 测试全部通过。
- `npm run security:scan`、`npm run updater:preflight`、`npm run release:self-test`、`npm run version:check` 和 `git diff --check` 通过。
- 本地 UI 回归在正式 Tauri mock 下验证：更新入口、idle 状态、模拟发现 Alpha.4、release notes 和应用内确认弹窗均正常。
- 1280px 桌面截图布局正常；390x844 窄屏 `bodyScrollWidth=390`，更新面板宽 358px、按钮宽 324px，无横向溢出。
- Tauri test mock 明确显示“测试通道 · 桌面版”，软件更新入口数量为 0；最终重新执行 formal build，临时 QA 注入未留在 `dist/index.html`。

限制与下一步：

- Alpha.3 尚未真实发布，当前没有可由 updater 下载的真实 Alpha.4；签名安装、失败中断和重启只能在 P6.8.5 双版本包中验收。
- updater 私钥加密离线备份因用户暂时没有合适设备而延后，保留为 Alpha 扩大测试前人工检查项。
- 下一步合并发布 Alpha.3，验证真实 updater assets、远端 manifest 和正式更新入口；随后发布 Alpha.4 完成旧版到新版升级。

### 2026-07-11：P6.8.3 Alpha updater manifest 与原子通道发布

阶段：P6.8 自动更新

改动：

- 验证 `macos-release` Environment 已存在两个 updater Secret，未读取或输出 Secret 值。
- 新增 `updater_manifest.mjs`：从 clean tagged source、正式 release manifest、release notes、updater archive 和 `.sig` 生成 Tauri 静态 JSON。
- 根据官方 updater 2.10.1 源码确认 Apple Silicon manifest 平台键为 `darwin-aarch64`。
- 新增 `updater_publish.mjs`：只在 GitHub Release 已公开且包含目标 archive 后，通过 GitHub Git Data API 原子更新 `updater-index/alpha/latest.json`。
- 首次执行建立 root commit；后续基于当前 tree 快进提交，支持未来保留 `stable/latest.json`。
- 通道发布拒绝版本倒退和同版本不同内容；同版本相同内容为 no-op。
- release publish 增加受控续跑：只有显式允许且公开 Release 包含全部预期 assets 时才跳过重复发布，供通道更新失败后安全重试。
- workflow 在公开 Release 后才移动 Alpha 指针，并把生成的 updater manifest 同时保存在 Release assets 和 workflow evidence。

验证：

- `npm run release:self-test` 通过，离线覆盖 updater manifest 生成、Release dry run 和 updater channel dry run。
- `npm run updater:preflight`、`npm run security:scan`、`npm run version:check` 和 `git diff --check` 通过。

限制与下一步：

- Alpha.3 尚未发布，因此远端 `updater-index` 分支和真实 `alpha/latest.json` 尚未创建。
- P6.8.4 设置页更新体验、安装前恢复点、重启和手动下载 fallback 已在同轮后续完成。
- Alpha.3 发布后只能验证产物和通道；真实旧版升级必须由后续 Alpha.4 验证。

### 2026-07-11：P6.8.2 updater 信任根与签名更新产物

阶段：P6.8 自动更新

改动：

- 用户在项目外的 `~/.tauri/` 生成独立 updater 密钥；仅读取并提交可公开公钥，私钥内容未读取或输出。
- 将私钥文件权限从生成后的 `644` 收紧为 `600`，只允许当前用户读写。
- formal Tauri 配置内置 updater 公钥和 Alpha manifest HTTPS 地址；test-safe 基础配置仍没有远程 updater endpoint。
- 新增 `tauri.release.conf.json`，只在 tag release 构建中开启 `bundle.createUpdaterArtifacts`，避免日常 formal/test 构建要求 updater 私钥。
- signed package 脚本要求 updater 私钥与密码环境变量，生成 ASCII 命名的 DMG、`.app.tar.gz` 和 `.app.tar.gz.sig`。
- release manifest、GitHub publish 和离线发布状态机自测强制要求 updater archive/signature 成对存在。
- release workflow 新增普通/严格 updater 预检、GitHub Secrets 注入和 updater 资产证据上传。

验证：

- updater 普通预检和模拟环境变量严格预检通过。
- release workflow 离线状态机自测通过，覆盖 DMG、updater archive 和签名。
- shell 语法检查、security scan、version check 和 `git diff --check` 通过。
- `npm run tauri:build:formal` 通过，证明正式客户端可内置公钥与 endpoint，同时日常 formal 构建不要求私钥。

限制与下一步：

- GitHub `macos-release` Environment 已添加 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 私钥仍需制作至少一份加密离线备份。
- P6.8.3 manifest 生成与安全通道发布状态机已在同轮后续完成。

### 2026-07-11：P6.8.1 自动更新客户端基础

阶段：P6.8 自动更新

目标：

- 在不影响浏览器版、Tauri 测试环境和现有发布链路的前提下，接入 Tauri updater 客户端基础。
- 先固定最小权限、通道隔离和密钥安全边界，再生成长期信任根。

改动：

- 开发版本从 `0.2.0-alpha.2` 升为 `0.2.0-alpha.3`，npm/Cargo/Tauri/macOS build version 和 Changelog 同步更新。
- 接入 `@tauri-apps/plugin-updater`、`@tauri-apps/plugin-process`、`tauri-plugin-updater` 和 `tauri-plugin-process`。
- Rust 注册 updater/process 插件；Tauri capability 只增加 `updater:default` 与 `process:allow-restart`。
- 新增 `src/lib/appUpdater.js`，统一封装检查更新、下载/安装、待更新资源清理和重启；浏览器版与 test channel 会在发起网络请求前返回不支持。
- 新增 `npm run updater:preflight`；普通模式允许在信任根配置前检查客户端基础，严格模式要求 formal 公钥、HTTPS endpoint、release updater artifacts 和私钥环境变量全部就绪。
- 安全扫描新增 Tauri/minisign updater 私钥检测，防止长期私钥误入仓库。
- 新增 [AUTO_UPDATE_ARCHITECTURE.md](./AUTO_UPDATE_ARCHITECTURE.md)，固定独立 updater 密钥、`updater-index/alpha/latest.json`、GitHub Release 不可变产物、安装前恢复点和 Alpha.3 -> Alpha.4 双版本验收策略。

验证：

- `cargo check` 通过，官方 updater/process Rust 插件可正常编译并注册。
- `npm run updater:preflight` 通过，并正确提示 formal 信任根和 release updater 配置仍待完成。
- `npm run version:check`、`npm run build`、`cargo fmt --check`、`cargo test`、`npm run security:scan` 和 `git diff --check` 通过；Rust 共 26 个测试全部通过。

限制与下一步：

- 尚未生成 updater 长期私钥，也未把占位公钥写入配置；这是有意的安全停点。
- P6.8.2 需要用户确认私钥保管位置和密码管理方式后亲自生成密钥，再配置公钥、release updater artifacts 和 GitHub Environment Secrets。
- Alpha.3 只负责把信任根带到已安装客户端；必须再发布 Alpha.4 才能验证真实自动升级。

### 2026-07-11：v0.2.0-alpha.2 首个自动签名、公证与 GitHub Release 成功

阶段：P6.7 正式 macOS 发布包 / P6.9 CI 与发布流水线

发布结果：

- annotated tag `v0.2.0-alpha.2` 绑定 clean `main` commit `8ae7653`；tagged source、版本、Changelog、fixtures、formal build、release preflight、Rust fmt/check/test 和安全扫描全部通过。
- GitHub `macos-release` Environment 成功导入 Developer ID `.p12`，构建 `arm64` signed DMG；Apple notarization 返回 `Accepted`，staple、App/DMG Gatekeeper 和 codesign 验证通过。
- GitHub Release `读伴 0.2.0-alpha.2` 已作为非 draft prerelease 发布，包含 DMG、release notes、manifest、checksums 和 notary log；workflow run `29144346955` 全绿。

独立下载验证：

- 下载 DMG 大小 `17,939,982` bytes，SHA-256 为 `eb078547f60f0123feed449a63949905a96932afa0ac0f249a52deb0b6ad787a`，与 manifest/checksums 一致。
- manifest 为 `formal / signed / arm64`，source commit `8ae7653`、tag `v0.2.0-alpha.2`、`dirty=false`；notary log 状态为 `Accepted`。
- `hdiutil verify`、系统权限下 `xcrun stapler validate`、`spctl` 和 `codesign --verify` 均通过，Gatekeeper 来源为 `Notarized Developer ID`。

后续：

- GitHub 将中文 DMG asset 名清洗为 `_0.2.0-alpha.2_formal_arm64_signed.dmg`；内容和包内“读伴”名称不受影响，下个版本改用 ASCII 上传名 `Duban_...`。
- 用户仍需对公开下载 DMG 执行安装、首次启动、正式空书库、PDF/MOBI、Keychain、AI、备份和重启恢复 smoke test。
- smoke test 通过后，P6.7 正式收口并进入 P6.8 Tauri updater。

### 2026-07-11：首次 Tag Release 失败保护与 Alpha.2 修复

阶段：P6.7 正式 macOS 发布包 / P6.9 CI 与发布流水线

结果：

- `v0.2.0-alpha.1` 已作为 annotated tag 推送并绑定 `main` 提交 `27ebb82`；远端 API 和 `git ls-remote` 均确认 tag object 正确。
- GitHub Actions `Validate Tagged Source` 在签名前停止：`actions/checkout` 在 runner 中把触发 SHA 暂时解析为同名 lightweight tag，`release:check tagged` 因此按设计拒绝继续。
- `macos-release` Environment 的 6 个 Secrets 已配置，但失败发生在无 Secrets 的校验 job；Developer ID 私钥和 Apple 公证凭据未被使用，没有 DMG、draft Release 或公开 Release。

处理：

- 保留 `v0.2.0-alpha.1` 不移动、不删除、不复用；版本升为 `0.2.0-alpha.2`。
- 两个 release job 在 checkout 后显式 force-fetch `refs/tags/<tag>`，确保本地 ref 指向远端 annotated tag object。
- release preflight 新增双 job tag-fetch 护栏；Changelog、版本规范、发布文档、Roadmap 和 AI 接手事实同步更新。

下一步：

- 完成 Alpha.2 的本地/PR CI，冻结 Changelog 后创建 `v0.2.0-alpha.2`，重新运行签名、公证与 GitHub Release。

### 2026-07-10：P6.7.6 Tag 驱动的签名、公证与 GitHub Release 自动发布

阶段：P6.7 正式 macOS 发布包 / P6.9 CI 与发布流水线

目标：

- 让 `v<SemVer>` annotated tag 成为一次正式发布的不可变入口，把源码版本、签名包、公证证据和 GitHub Release 绑定到同一 commit。
- 自动完成发布校验、Developer ID 签名、Apple notarization/staple、Gatekeeper 验证和 artifact 上传，并为 P6.8 自动更新提供稳定的版本与产物来源。

改动：

- 新增 `.github/workflows/release-macos.yml`：只在推送 `v*` tag 后运行，先验证 tagged source，再在 `macos-release` Environment 中构建 `arm64` 正式包、签名、公证、staple、验证并发布 GitHub Release。
- 新增发布状态机脚本：`release:check` 区分 candidate/tag-ready/tagged，要求版本、Changelog、clean HEAD、`origin/main` 和 annotated tag 一致；`release:prepare` 将 Unreleased 内容冻结到带日期版本段，但不创建 tag。
- 新增 `release:notes`、`release:publish` 和 `release:self-test`：release notes、manifest、checksums 和 notary log 都绑定 tag/commit；GitHub Release 先建 draft，所有资产上传完成后才公开，已公开 Release 不允许脚本覆盖。
- manifest 新增 source commit/tag/dirty、SQLite schema 和 backup version；signed manifest 拒绝 dirty source。签名、公证和验证脚本支持显式 `arm64` target 路径，公证 JSON 日志作为发布证据保存。
- 新增 [GITHUB_RELEASE_AUTOMATION.md](./GITHUB_RELEASE_AUTOMATION.md)，记录 GitHub Environment、Secrets、证书导出、每次发版命令、失败恢复和 P6.8 边界。
- 基础 CI 和 release preflight 接入离线发布状态机自测；PR checklist、VERSIONING、RELEASE_PROCESS、RELEASE_CHECKLIST、README 和 AI 接手规范同步更新。

验证：

- `npm run release:self-test` 通过：临时 Git 仓库中的 finalized Changelog、annotated tag、manifest、Accepted notary log 和 publish dry-run 全链路通过，dirty source 负向用例被拒绝。
- `npm run release:check -- candidate --allow-dirty` 和 `npm run release:prepare -- --dry-run --allow-dirty` 通过；默认 candidate 与 tagged 检查会按预期拒绝当前 dirty、未 finalize、未打 tag 的工作区。
- CI secrets 模拟下 `npm run release:signing-preflight -- --strict` 通过；未进行真实证书导入、签名、公证或 GitHub 发布。
- GitHub CLI 的 draft/publish/verify-tag 参数、`notarytool --output-format json --wait` 参数、workflow YAML 和 shell/Node 语法均完成本地验证。

限制与下一步：

- 本轮没有创建、移动或推送任何 Git tag，也没有创建 GitHub Release；历史 `v0.1.0` 继续保持不变。
- 仓库维护者仍需按自动发布文档创建 `macos-release` Environment、配置 Apple Secrets，并建议启用 required reviewer。
- P6.8 尚未实现 updater 签名和 `latest.json`；后续直接消费这套 tag、release notes、manifest/checksum 和 GitHub Release 资产，不另建第二套版本源。

### 2026-07-10：P6.7.5 版本可见性

阶段：P6.7 正式 macOS 发布包 / P6.6 本地诊断与可支持性

目标：

- 让用户和支持人员能在 App 内确认当前版本、发布通道、源码提交、SQLite schema 和备份格式，不再依赖包名或口头描述判断版本。
- 让未提交代码构建的包明确显示 `dirty`，避免把同一个 commit 误认为唯一构建来源。

改动：

- Vite 在构建时注入统一构建身份：App version 读取 `package.json`，channel 读取当前 formal/test mode，commit 优先读取 `DUBAN_BUILD_COMMIT` / `GITHUB_SHA` 并回退到本地 Git，schema/backup version 直接读取 Rust 存储常量。
- 新增 `src/lib/appVersion.js`，统一提供版本信息、中文通道/运行环境标签和可复制的支持摘要；业务组件不手写版本号。
- 设置页分类导航底部显示 `读伴 <version>`、发布通道和运行环境。
- 设置页「诊断」新增「版本与构建」，展示 App version、channel、runtime、Git commit、dirty 状态、SQLite schema 和备份格式，并可一键复制脱敏版本信息。
- release preflight 新增版本可见性源码护栏；发布流程和检查清单要求正式候选包显示 `formal`、目标 commit 且不带 `dirty`。

验证：

- `npm run build:test` 通过，产物注入 `0.2.0-alpha.1 / test / c8107b2e9591 / dirty / schema 9 / backup 3`。
- `npm run build:formal` 和 `npm run release:preflight` 通过，formal 产物通道切换为 `formal`，其他构建身份保持一致。
- 本地浏览器实测设置导航版本摘要、诊断六项构建信息和复制成功反馈；1280px 下为三列两行，390px 下为单列，无页面横向溢出。
- `cargo fmt --check`、`cargo test` 通过，26 个 Rust 测试全部通过；`npm run tauri:build:formal` 成功生成正式 `读伴.app`。
- `npm run version:check`、`npm run security:scan` 和 `git diff --check` 通过；前端仍只有既有 Vite chunk 体积提示。

后续：

- 当前显示 `dirty` 是因为本轮改动尚未提交；正式候选包必须从干净 commit 重新构建，并人工确认诊断页不显示 `dirty`。
- 旧 PDF 修复完成桌面人工回归后，按 `0.2.0-alpha.1` 重新签名、公证并执行完整 release checklist。

### 2026-07-10：P6.7.4 版本管理基础

阶段：P6.7 正式 macOS 发布包 / P6.9 CI 与发布流水线

问题：

- npm、Tauri 和 Cargo 虽然都写着 `0.1.0`，但版本散落且 App 不可见；Git 的 `v0.1.0` 已指向 2026-06-18 的旧提交，当前代码继续沿用该数字会导致 tag、源码和正式包无法对应。
- 发布流程没有统一升版命令，CI 只检查 package/Tauri 的一部分一致性，Cargo 与 lockfile 可能漂移。
- 没有正式 VERSIONING 规范和用户级 CHANGELOG。

改动：

- 当前开发版本升为 `0.2.0-alpha.1`；旧 `v0.1.0` tag 保持不可变，未创建新 tag。
- `package.json` 成为唯一人工版本源；脚本为 Tauri 派生纯数字 `0.2.0` 和 macOS `CFBundleVersion=0.2.101`，避免把 Apple 不接受的 `-alpha.1` 写入 bundle 字段。
- 新增 `scripts/version.mjs` 和 `npm run version:check`、`version:set`、`version:bump`，同步 npm lock、Cargo manifest/lock，并验证严格 SemVer。
- release preflight、signing preflight 和 GitHub Actions CI 接入版本一致性检查。
- 新增 `docs/VERSIONING.md`，定义 SemVer、Alpha/Beta/RC、App/schema/backup 版本边界、分支/tag、artifact 和发布顺序。
- 新增根目录 `CHANGELOG.md`，用 `[Unreleased]` 维护目标 `0.2.0-alpha.1` 的用户可见变化。
- README、发布流程、发布检查清单、后端标准、Roadmap、生产升级计划、项目记录和 AI 接手提示词同步更新。

验证：

- `npm run version:check` 在 `0.1.0` 旧状态和 `0.2.0-alpha.1` 新状态均通过。
- `npm run version:set -- 0.2.0-alpha.1` 成功同步所有版本文件，且明确未创建 Git tag。
- 非法版本 `01.2.3` 被脚本拒绝且没有写入文件；`npm run version:bump -- prerelease` 已演练 `alpha.1 -> alpha.2`，Tauri/macOS 构建号同步变为 `0.2.102`，随后成功恢复到 `0.2.0-alpha.1` / `0.2.101`。
- `npm run build`、`npm run release:preflight`、`npm run security:scan`、`npm run qa:fixtures:verify` 和 `git diff --check` 通过；前端仍只有既有 Vite chunk 体积提示。
- `cargo fmt --check`、`cargo check`、`cargo test` 通过；Rust 构建识别为 `duban v0.2.0-alpha.1`，26 个测试全部通过。
- `npm run tauri:build:formal` 通过并生成正式 `读伴.app`；包内 `CFBundleIdentifier=com.duban.reader`、`CFBundleShortVersionString=0.2.0`、`CFBundleVersion=0.2.101`。
- `npm run release:signing-preflight` 非严格模式通过；当前受限命令环境未读取到登录钥匙串中的 Developer ID 和公证凭据，因此保留警告，正式签名时仍须在可访问钥匙串的终端执行严格预检。

后续：

- 设置页/诊断版本展示已由 P6.7.5 完成。
- 当前 Alpha 完成人工回归和新公证包前不得创建 `v0.2.0-alpha.1` release tag。

### 2026-07-10：test/formal 本地数据与 Keychain 隔离修复

阶段：P6.7 正式 macOS 发布包

问题：

- `tauri.test.conf.json` 已定义 `com.duban.reader.test`，但历史 `npm run tauri:dev` 没有加载该配置，直接使用基础配置中的 `com.duban.reader`。
- 因此开发期两本书、进度、笔记、文件和日志均进入正式 App 数据目录，正式包首次启动时错误显示测试书库。
- Keychain service 也曾固定为 `com.duban.reader.ai`，测试/正式没有隔离。

改动：

- `npm run tauri:dev` 固定转发到 `tauri:dev:test`，显式加载 `src-tauri/tauri.test.conf.json`。
- 基础 Tauri `productName/identifier` 改为 `读伴 Test` / `com.duban.reader.test`；正式构建必须由 formal config 显式覆盖。
- 测试窗口标题固定为 `读伴 Test`。
- release preflight 新增基础配置 test-safe、开发脚本 test config 和测试窗口标题检查。
- Rust Keychain service 改为按 Tauri identifier 初始化：正式 `com.duban.reader.keychain.ai`，测试 `com.duban.reader.test.keychain.ai`；旧共用 service 不再读取。
- 历史开发数据从 `com.duban.reader` 完整迁到 `com.duban.reader.test`，迁移前复制到 `com.duban.reader.pre-isolation-20260710` 作为回滚快照。

验证：

- 测试目录和快照均约 310 MB、13 个文件；测试库有 2 本书、2 个原文件索引、1643 页文本和 1 条笔记。
- 仅运行测试版时 `~/Library/Application Support/com.duban.reader/` 保持不存在；随后同时启动本地 formal `.app`，正式库全新初始化为 0 本书、目录约 472 KB，测试库仍为 2 本书、约 310 MB。
- test/formal 两个进程可同时运行，分别使用 `target/debug/duban` 和 formal `.app`，SQLite 数据没有交叉。
- `npm run build`、`npm run release:preflight`、`npm run security:scan`、`cargo fmt --check`、`cargo check`、`cargo test` 和 `git diff --check` 通过；Rust 共 26 个测试通过。

后续：

- 测试/正式使用新的独立 Keychain service，需要分别在各自设置页保存一次 API Key。
- 用户确认测试版旧 PDF 可读后，重新构建、公证正式候选包，并验证 formal 首次启动为空书架。

### 2026-07-10：正式包旧 PDF asset protocol 回归修复

阶段：P6.7 正式 macOS 发布包

问题：

- 首个公证包打开迁移前已保存的 PDF 时，PDF.js 显示 `Unexpected server response (0)`。
- SQLite 中书籍和 `book_files` 记录正常，原始 PDF 文件存在且格式有效，路径位于 `$APPDATA/files/**` scope 内，数据没有丢失。
- macOS `asset://` 是自定义协议，WebKit XHR 返回状态 `0`；PDF.js 只接受 `file://` 的状态 `0`，因此在读取有效响应前主动报错。

改动：

- `src/lib/fileAdapter.js` 对 `asset:` URL 使用可取消的 XHR 读取，接受自定义协议的状态 `0` 并返回 ArrayBuffer/text。
- `src/components/PdfReader.jsx` 在 macOS `asset:` 下不再把 URL 直接交给 PDF.js，而是先读取二进制再通过 `data` 打开。
- 其他平台返回正常 HTTP asset URL 时仍保留 PDF.js URL 加载路径。

验证：

- `npm run build` 通过；仍只有既有 chunk 体积提示。
- `npm run security:scan` 通过。
- `git diff --check` 通过。
- 修复版 `npm run tauri:dev` 已启动，等待用户打开旧 PDF 完成人工确认。

发布影响：

- Submission ID `024075bb-11c2-4f70-b7f8-d1d0da68f0a6` 对应候选包不得分发。
- 人工确认修复后，必须重新生成 signed DMG、重新公证并更新 SHA-256 和发布证据。

### 2026-07-10：P6.7.3 首个真实签名与公证 DMG

阶段：P6.7 正式 macOS 发布包

目标：

- 使用真实 Developer ID Application 和 notarytool Keychain profile 构建第一个可分发候选包。
- 在送 Apple 前验证 App/DMG 签名，公证后验证 staple、Gatekeeper 和 checksum。

改动：

- `scripts/package-mac-signed.sh` 从只构建 `dmg` 改为同时构建 `app,dmg`，确保 Tauri 不会在 DMG 完成后清理 `.app`。
- 正式命名 DMG 生成后立即对 `.app` 执行 deep/strict codesign 验证，并对 DMG 执行 strict codesign 验证。
- 公证日志保存为本机 `release-artifacts/duban-v0.1.0-formal-arm64-signed-notary-log.json`。

结果：

- Artifact：`读伴_0.1.0_formal_arm64_signed.dmg`，大小 `17,989,912` bytes。
- SHA-256：`4d1327d0d1ca2be6de7e6f5cf9d08a3ab9734e71a2f088a32dbdc6cbf09dad86`。
- Apple notarization Submission ID：`024075bb-11c2-4f70-b7f8-d1d0da68f0a6`。
- Apple 结果：`Accepted` / `Ready for distribution` / status code `0`。
- `xcrun stapler validate` 通过；App 和 DMG 的 `spctl` 结果均为 `accepted`，source 为 `Notarized Developer ID`。
- 最终 signed manifest/checksum 已在 staple 后重新生成，`shasum -a 256 -c` 通过。

待人工验证：

- 人工回归已发现旧 PDF `asset://` 状态 `0` 问题；该候选包已作废，修复记录见上方。

### 2026-07-10：Apple Developer Program 审核通过

阶段：P6.7 正式 macOS 发布包

状态变化：

- Apple Developer Program 审核已通过，创建 Developer ID 证书的外部阻塞解除。
- `Developer ID Application: Zhanwen Lu (FBMN9293RM)` 已导入登录钥匙串，证书下可展开看到 `Duban Developer ID` 私钥。
- 沙箱外执行 `security find-identity -v -p codesigning` 显示 `1 valid identities found`；项目发布预检也已识别并匹配该身份。沙箱内读取登录钥匙串可能错误显示为 `0`，不能据此判断证书无效。
- `duban-notarytool` Keychain profile 已通过 Apple 验证并保存到钥匙串。
- 使用真实签名身份和公证 profile 运行 `npm run release:signing-preflight -- --strict` 已通过，签名/公证前置条件全部就绪。
- 后续真实 signed DMG 构建、公证与验证结果见上方 P6.7.3 记录。

安全边界：

- Apple Account 密码、App 专用密码、证书私钥和 `.p12` 文件不得写入仓库、开发日志或对话截图。
- 公证凭据优先通过 `notarytool store-credentials` 保存到本机 Keychain。

### 2026-07-09：P6.10.2 固定 Fixtures 与样本说明

阶段：P6.10 QA 矩阵与回归样本

目标：

- 建立可以安全提交到仓库的最小 QA fixtures。
- 明确 MOBI 和含书备份样本的版权与隐私边界。
- 提供可重复生成和验证 fixtures 的脚本，避免样本 hash、大小和说明靠手填。

改动：

- 新增 `npm run qa:fixtures`，由 `scripts/generate_qa_fixtures.mjs` 生成确定性样本。
- 新增 `npm run qa:fixtures:verify`，由 `scripts/verify_qa_fixtures.mjs` 校验样本 hash、大小、PDF 页数、坏 PDF 负向解析和备份 manifest hash。
- 新增 `qa-fixtures/README.md`，说明样本用途、MOBI 样本策略和重新生成命令。
- 新增 `qa-fixtures/fixtures.json`，记录每个 fixture 的路径、大小、sha256、用途和预期。
- 新增书籍样本：
  - `qa-fixtures/books/duban-qa-two-page.pdf`：合成两页 PDF，用于导入、阅读器打开和翻页 smoke test。
  - `qa-fixtures/books/duban-qa-corrupt.pdf`：故意损坏的 PDF，用于导入失败负向测试。
  - `qa-fixtures/books/duban-qa-mini-book.html`：自写 HTML 源文本，供后续生成合法 MOBI fixture。
- 新增备份样本：
  - `qa-fixtures/backups/duban-backup-empty-v3/manifest.json`：空目录式备份 manifest，用于预览和校验 smoke test。
  - `qa-fixtures/backups/duban-backup-tampered-v3/manifest.json`：manifest hash 故意错误，用于校验报告负向测试。
- 更新 [QA_MATRIX.md](./QA_MATRIX.md)、生产级路线、发布清单、Roadmap、项目记录和 AI 接手提示词。

验证：

- `npm run qa:fixtures` 已通过。
- `npm run qa:fixtures:verify` 已通过。
- `git diff --check` 已通过。
- `npm run release:preflight` 已通过。

限制：

- 当前不提交二进制 MOBI fixture；MOBI 仍用本地授权样本人工验证，并在 QA Run 中记录来源授权摘要。
- 当前备份样本为空备份和篡改备份；含真实书籍数据的备份 roundtrip、旧 schema 数据库和旧备份样本进入 P6.10.3。

### 2026-07-09：P6.10.1 QA 矩阵基础版

阶段：P6.10 QA 矩阵与回归样本

目标：

- 建立发布前固定 QA 表，让关键路径不再靠临时记忆测试。
- 把 smoke test、核心回归、升级恢复、跨环境测试和样本策略统一到一个文档。
- 明确测试证据的隐私边界，避免 API Key、书籍正文、笔记、聊天或绝对路径进入测试记录。

改动：

- 新增 [QA_MATRIX.md](./QA_MATRIX.md)：
  - 使用规则和结果标记：`Pass`、`Fail`、`Blocked`、`Skipped`。
  - 测试环境维度：App 形态、包类型、用户状态、网络状态、API Key、文件类型、数据规模和备份来源。
  - P0 Smoke Test：首次启动、书架显示、PDF/MOBI 导入、阅读器打开、进度恢复、Key 状态、AI 请求、备份导出和重启恢复。
  - P1 核心回归：书库导入、阅读器/笔记、AI/设置、备份/诊断、发布包/桌面行为。
  - 升级与数据恢复：新 schema 空库启动、旧 schema 升级、旧备份导入、新备份 roundtrip 和损坏备份。
  - 回归样本策略：不提交版权受限原文，可提交公版/开源/自写/合成样本。
  - 发布测试记录模板。
- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) 的 smoke test 部分改为引用 QA 矩阵。
- 更新文档索引、生产级路线、Roadmap、项目记录和 AI 接手提示词。

验证：

- `git diff --check` 已通过。
- `npm run release:preflight` 已通过。

限制：

- 当前只建立 QA 矩阵和样本策略，还没有提交固定 fixtures。
- 真实 signed DMG 的干净 macOS 回归仍等待 Apple Developer Program 审核通过。
- 部分场景仍需人工真实 API Key 和本地授权书籍样本验证。

### 2026-07-09：P6.7/P6.9 发布与阅读器改动本地校验记录

阶段：P6.7 正式 macOS 发布包、P6.9 CI 与发布流水线、阅读器体验收束

目标：

- 把发布通道、release preflight、manifest/checksum、签名/公证前准备、CI workflow、GitHub 协作模板和 release checklist 整理为一次可推送的工程提交。
- 同步提交阅读器米纸视觉、文案减负、线条减负和读伴专属光标改动，因为用户确认本轮一起提交。
- 在 push 前完成本地质量校验，并明确仍需人工核验的内容。

提交范围：

- 发布配置：`.env.example`、`.env.formal`、`.env.test`、`.gitignore`、`package.json`、`vite.config.js`、release/package/signing/notarization/gatekeeper 脚本、Tauri formal/test 配置和 macOS entitlements。
- CI：`.github/workflows/ci.yml`。
- GitHub 协作模板：PR template、bug report、feature request 和 issue template config。
- 文档：文档索引、生产级路线、发布流程、发布检查清单、AI 接手提示词、项目记录、Roadmap 和 App 化日志。
- UI/阅读器：阅读器布局、PDF/Text reader 外层视觉、读伴侧栏、聊天/笔记/导读文案、会客厅空状态、全局专属 cursor 和 UI changelog。

本地校验结果：

- `npm run build` 通过；仍有既有 Vite chunk 体积提示。
- `npm run release:preflight` 通过。
- `cd src-tauri && cargo fmt --check` 通过。
- `cd src-tauri && cargo check` 通过。
- `cd src-tauri && cargo test` 通过，25 个 Rust 测试全部通过。
- `npm run security:scan` 通过。
- `git diff --check` 通过。

CI 状态：

- 本地记录时尚未 push，GitHub Actions 尚未触发；push 后需要查看 `CI` workflow 结果。

仍需人工核验：

- GitHub Actions `CI` workflow 是否在远端通过。
- GitHub PR template 和 issue forms 在 GitHub 网页端是否按预期显示。
- 阅读器视觉与文案改动需要人工检查：桌面和窄屏下阅读页、PDF 原版页、文本页、右侧读伴栏、聊天输入、笔记浮层、导读生成和完成页是否无重叠、无溢出。
- macOS signed/notarized DMG 仍等待 Apple Developer Program 审核通过、Developer ID Application 证书和 notarytool 凭据；本轮未执行真实签名、公证、staple 或 Gatekeeper 验证。
- local DMG 打包和干净 macOS smoke test 本轮未执行，发布前仍需按 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) 手动完成。

### 2026-07-09：P6.9.3 发布检查清单与协作模板

阶段：P6.9 CI 与发布流水线

目标：

- 固化发布前人工 checklist，避免每次发布只凭记忆检查。
- 给 PR 增加固定检查项，覆盖验证命令、隐私、数据迁移、备份、Keychain、发布和文档同步。
- 给 bug 和 feature issue 增加结构化模板，减少问题描述缺关键信息或带入敏感内容的风险。

改动：

- 新增 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)：
  - 发布边界。
  - 合并前检查。
  - 本地质量检查。
  - CI 检查。
  - local 内测包。
  - signed 正式包。
  - 手动 smoke test。
  - release notes。
  - 发布后确认。
- 新增 `.github/PULL_REQUEST_TEMPLATE.md`：
  - 要求填写变更范围。
  - 固定列出 build、release preflight、Rust fmt/check/test、安全扫描和手动桌面 smoke test。
  - 明确 API Key、prompt、书籍正文、笔记、聊天、绝对本地路径等不得进入日志、备份、错误或截图。
  - 要求涉及 SQLite、Keychain、备份、AI transport、发布或 UI 时同步相关 docs。
- 新增 `.github/ISSUE_TEMPLATE/bug_report.yml`：
  - 要求描述复现步骤、期望行为、实际行为、影响面、版本和 macOS 信息。
  - 明确不要提交 API Key、书籍正文、私密笔记、聊天记录或绝对本地路径。
- 新增 `.github/ISSUE_TEMPLATE/feature_request.yml`：
  - 要求先描述用户问题，再描述方案。
  - 按阅读体验、AI 读伴、书库/存储、备份、桌面发布、安全隐私等区域分类。
- 新增 `.github/ISSUE_TEMPLATE/config.yml`，关闭空白 issue，并把安全问题引导到私密 security advisory。
- 更新文档索引、发布流程、生产级路线、Roadmap、项目记录和 AI 接手提示词。

验证：

- `ruby -e "require 'yaml'; ..."` 已通过，`.github/ISSUE_TEMPLATE/*.yml` 均可解析。
- `npm run release:preflight` 已通过。
- `git diff --check` 已通过。

限制：

- GitHub issue forms 和 PR template 需要推送到 GitHub 后才能在网页端实际验证。
- 当前仍未增加 Tauri build workflow、artifact 上传或 signed release 自动化。

### 2026-07-09：P6.9.1 + P6.9.2 基础 CI 与 Release Preflight CI

阶段：P6.9 CI 与发布流水线

目标：

- 建立第一条 GitHub Actions 基础质量检查，减少本机可跑但远端失败的风险。
- 在 CI 中固定执行 formal frontend build，并复用 release preflight 检查正式包不混入测试入口。

改动：

- 新增 `.github/workflows/ci.yml`。
- CI 触发条件：
  - push 到 `main` 或 `master`。
  - pull request。
  - 手动 `workflow_dispatch`。
- CI 使用 `macos-14` runner，匹配当前 macOS/Tauri 发布目标，避免 Linux 缺少 Tauri 系统依赖造成噪音。
- CI 步骤：
  - `npm ci`
  - `npm run build`
  - `npm run release:preflight`
  - `cd src-tauri && cargo fmt --check`
  - `cd src-tauri && cargo check`
  - `cd src-tauri && cargo test`
  - `npm run security:scan`

验证：

- `npm run build` 已通过；仍只有既有 Vite chunk 体积提示。
- `npm run release:preflight` 已通过。
- `cd src-tauri && cargo fmt --check` 已通过。
- `cd src-tauri && cargo check` 已通过。
- `cd src-tauri && cargo test` 已通过，25 个 Rust 测试全部通过。
- `npm run security:scan` 已通过。
- `git diff --check` 已通过。

限制：

- 当前 CI 还没有真正构建 Tauri `.app/.dmg`。
- 当前 CI 还没有 GitHub release artifact 上传、签名、公证或自动发布。
- GitHub Actions 真正运行结果需要推送到 GitHub 后查看。

### 2026-07-09：P6.7 真实签名/公证暂停等待 Apple 审核

阶段：P6.7 正式 macOS 发布包

状态：

- 项目侧 Developer ID 签名、公证、staple 和 Gatekeeper 验证脚本已准备完成。
- 用户已提交 Apple Developer Program 注册申请。
- 当前 Apple Developer Program 仍处于审核中，暂时不能进入 Apple Developer 后台创建 `Developer ID Application` 证书。

影响：

- 暂时不能运行真实 `npm run package:mac-signed`。
- 暂时不能运行真实 `npm run release:notarize`。
- 暂时不能完成 signed + notarized DMG 的干净 macOS 环境回归。

恢复条件：

- Apple Developer Program 审核通过并完成激活。
- 创建并导入 `Developer ID Application` 证书，终端能通过 `security find-identity -v -p codesigning | grep "Developer ID Application"` 查到身份。
- 配置 notarytool 凭据，例如 `NOTARYTOOL_KEYCHAIN_PROFILE=duban-notarytool`。

恢复后下一条命令：

```bash
npm run release:signing-preflight -- --strict
```

下一步建议：

- P6.7 真实签名/公证暂时搁置。
- 优先推进不依赖 Apple 审核的 P6.9 CI 与发布流水线，或 P6.10 QA 矩阵与回归样本。

### 2026-07-09：P6.7.2 签名/公证前准备

阶段：P6.7 正式 macOS 发布包

目标：

- 在没有 Apple Developer 证书的情况下，先把项目内可准备的签名、公证和 Gatekeeper 验证入口补齐。
- 明确用户需要在 Apple Developer 侧完成哪些账号、证书和凭据步骤。
- 让正式包构建具备 hardened runtime 和 entitlements 配置，为 Developer ID 公证做准备。

改动：

- 新增 `src-tauri/entitlements.plist`，作为 formal macOS 签名的 entitlements 文件。
- formal Tauri 配置启用 `bundle.macOS.hardenedRuntime=true`，并绑定 `entitlements.plist`。
- 新增 `npm run release:signing-preflight`：
  - 检查 macOS 平台、codesign/security/spctl/hdiutil、notarytool、stapler。
  - 检查 Developer ID Application 身份和 notarytool 凭据；默认 warning，`-- --strict` 下缺失即失败。
- 新增 `npm run package:mac-signed`：
  - 需要 `APPLE_SIGNING_IDENTITY` 或 CI 的 `APPLE_CERTIFICATE`。
  - 生成 `读伴_0.1.0_formal_<arch>_signed.dmg`。
- 新增 `npm run release:notarize`：
  - 支持 `NOTARYTOOL_KEYCHAIN_PROFILE`、Apple ID + app-specific password、App Store Connect API key 三类凭据。
  - 成功后执行 `xcrun stapler staple`、`xcrun stapler validate` 和 DMG Gatekeeper 验证。
- 新增 `npm run release:gatekeeper`，对 `.app` 和 signed DMG 做 codesign、stapler 和 Gatekeeper 验证。
- `release:manifest` 增加 `RELEASE_KIND` 过滤和输出命名，区分 `local` 与 `signed` artifact。
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) 补充 Developer ID、notarization、staple、正式验证流程和干净 macOS 回归清单。

验证：

- `npm run release:signing-preflight` 已通过；当前机器缺少 Developer ID Application 证书和 notarytool 凭据，因此以 warning 形式提示。
- `npm run release:preflight` 已通过。
- `npm run tauri:build:formal` 已通过，formal `.app` 仍可生成。
- `npm run release:manifest` 已通过，默认生成 `local` kind 的 manifest/checksum。
- `bash -n scripts/package-mac-signed.sh scripts/notarize-mac-dmg.sh scripts/verify-mac-release.sh` 已通过。
- `npm run security:scan` 已通过。
- `cd src-tauri && cargo check` 已通过。
- `git diff --check` 已通过。

限制：

- 当前机器如果没有 Developer ID Application 证书，不能真正运行 `package:mac-signed`。
- 当前如果没有 notarytool 凭据，不能真正运行 `release:notarize`。
- 干净 macOS 环境回归仍需要真实 signed + notarized DMG。

### 2026-07-09：P6.7.1 发布配置收束

阶段：P6.7 正式 macOS 发布包

目标：

- 固定正式包和测试包的版本、App 名称、bundle identifier 与前端 channel。
- 明确正式构建不能带入测试书、测试入口或测试文案。
- 建立本地发布前检查、artifact 命名、manifest、checksum 和 release notes 约定。

改动：

- 新增 `.env.formal` 和 `.env.test`，分别声明 `VITE_APP_CHANNEL=formal` 与 `VITE_APP_CHANNEL=test`。
- 新增 Tauri formal/test 配置：
  - 正式包：`读伴` / `com.duban.reader`。
  - 测试包：`读伴 Test` / `com.duban.reader.test`。
- 调整 npm scripts：
  - 默认 `build`、`tauri:build` 指向 formal channel。
  - 新增 `tauri:build:formal`、`tauri:build:test`、`release:preflight`、`release:manifest`。
- 增强 formal build guard：正式构建会删除 `dist/test-books`，并扫描 `dist/` 中的测试入口 token。
- 本地 DMG 命名改为 `读伴_0.1.0_formal_<arch>_local.dmg`。
- 新增发布流程文档 [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)，同步更新 Roadmap、生产级升级路线、项目记录、文档索引和 AI 接手提示词。

验证：

- `npm run build:formal` 已通过；正式 dist 未发现测试入口 token。
- `npm run release:preflight` 已通过。
- `npm run build:test` 已通过，测试 channel 构建仍可用。
- `npm run tauri:build:formal` 已通过，生成 `src-tauri/target/release/bundle/macos/读伴.app`。
- `npm run tauri:build:test` 已通过，生成 `src-tauri/target/release/bundle/macos/读伴 Test.app`。
- `npm run package:mac-local` 在普通沙箱下因 `hdiutil create failed - 设备未配置` 失败；提升权限后已通过，生成 `src-tauri/target/release/bundle/dmg/读伴_0.1.0_formal_arm64_local.dmg`。
- `npm run release:manifest` 已通过，生成本地 manifest 与 sha256 checksum。

限制：

- 当前 DMG 仍是本地 ad-hoc 签名、未公证产物，只能用于内部验证。
- 正式发布仍需要 Apple Developer ID 签名、notarization、staple 和干净 macOS 用户环境回归。
- `release-artifacts/` 是本地生成目录，已加入 git ignore；最终发布时应把 checksum 内容复制到 release notes。

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

### 2026-07-16：P7.4 读伴行为设置进入桌面数据链路

- `updateBookCompanionSettings` 通过既有 `books` 门面保存 `readingProfile.companionPolicy / companionMemory`，浏览器继续写 IndexedDB，桌面继续写 SQLite `books.raw_json`。
- P7.4 不新增 command、数据库表或迁移版本；旧 `companionFocus` 保留，避免历史开书设置和读伴形象数据丢失。
- 导读、读中问答和读后交流共用同一策略规范化和 token 预算映射；单次覆盖只存在于当前持续挂载的 `CompanionShell` 会话。
- 下一步 P7.5 将把已验证的事件、来源、策略与记忆形态固化为正式迁移和备份契约。

### 2026-07-16：P7.5 陪读事件与 schema 10

- 新增版本化陪读事件和 `sourceAnchor`，统一现有导读、问答、回答、笔记与读后记录，并记录策略、单次覆盖、介入状态和本节记录之间的关联。
- 采用“原存储保存内容、事件保存引用”的兼容层；旧书惰性补齐稳定事件，不复制正文。笔记删除会留下 tombstone。
- SQLite schema 升到 `10` 并新增 `companion_events`；事务校验失败回滚，书籍删除继续级联清理。
- 备份 v3 不升格式版本，增加事件预览、隐私校验和按 id/更新时间/tombstone 合并；新增合成 fixture 与前后端自动化覆盖。
- 最终 Test.app 回归确认 schema `10 / 10`、SQLite `ok`、缺失文件 0；真实书籍惰性生成 16 条事件，目录式备份预览计数为 16 且校验通过。测试目录既有 5 个孤儿文件只形成非阻断健康提示。
- 下一步进入 P7.6，建立正文内容地图与精确 `readFrontier`。

### 2026-07-16：陪读时间线长内容可展开与类型辨识

- 长时间线卡片保留自动收起，但最新问题与紧随其后的读伴回答默认展开；新一轮问答到达后，旧的长问答回到收起状态。
- 历史长问答、笔记或导读可以点击卡片或「展开 / 收起」按钮查看全文，短内容不显示无意义控制。
- 导读、问题、回答、笔记、回想/记录和书籍来源使用不同的边线、底色与标记色，继续共享同一时间线组件和事件契约。
- 纯函数测试覆盖默认展开集合和桌面/完整时间线折叠阈值；本轮没有修改 SQLite schema、备份格式、AI prompt 或既有用户数据。
- P7 自动化、formal build、安全扫描与 Test.app 构建通过；真实《显微镜下的大明》时间线完成旧回答展开/收起和最新长回答默认展开回归。
- 同轮体验修正新增三轨布局适配：用户发言右侧、读伴发言左侧、阅读过程记录居中；历史 `book_chat` 按消息角色进入左右轨，布局不持久化、不改变 schema。

### 2026-07-16：防剧透从提示偏好升级为请求边界

- 修复 `spoiler=avoid` 仍可能出现具体后文预告：严格请求不再带入 whole-book 契约字段、章节导读或历史模型回答，系统提示也移除前后文发散冲突。
- 防剧透与方向提示模式暂停未经检查的 token 流；完整回答经过泄露提示过滤后再进入 UI 和 `bookChat` 存储。允许后文模式保持原流式体验。
- 自动化新增策略流式开关、典型后文泄露过滤、安全回退和允许后文不改写测试；本轮不修改 schema、既有消息或备份格式。
- P7 回归、formal build、安全扫描和最终 Test.app 构建通过；未在自动化中调用真实模型，最新版桌面包已打开供同问题人工复测。

### 2026-07-17：陪读消息 Markdown 与聊天式入场

- 模型回答和用户消息进入同一受控 Markdown 展示层，列表、粗体、斜体、引用、链接、代码和紧凑标题可正确显示，原始 HTML 不执行。
- 新增 card id 只在当前时间线会话内触发一次 420ms 入场；用户从右、读伴从左、过程记录从下方进入，历史数据载入和上下文切换不重播。
- Markdown 内容继续支持长消息自动折叠/手动展开，不改变陪读事件、SQLite schema 或备份契约。
- 自动化新增 Markdown 列表/粗体/脚本过滤测试并纳入 `test:p7`；下一步仍为 P7.6 内容地图、阅读边界与可靠锚点。
- 最终重建并完全重启 `读伴 Test.app`，真实历史回答确认 Markdown 标记不再裸露、列表结构与粗体语义正常。

### 2026-07-17：P7.6 已读范围与来源定位完成

- 从现有页文本按需构建稳定正文块和质量等级，不重新导入旧书、不调用 AI、不新增持久化内容表。
- 真实 Test.app 回归发现旧阅读计划可能让导读项覆盖正文页范围；正文块现支持多个重叠阅读项及各自顺序，避免正文已读范围为空。
- 阅读进度开始区分到达、有效阅读和完成；跳页不补齐中间内容，停留、划词、问答、笔记和完成操作会更新确认已读范围。
- 严格不剧透问答现在可使用当前页和系统确认读过的合格正文，同时继续隔离未读页、低质量块和整节正文。
- 来源定位增加可选 v2 正文块 id、块内字符范围、指纹和定位状态；旧 v1 继续兼容，并提供精确命中、文本回找和明确失效三种结果。
- 数据继续写入 `reading_progress.raw_json` 和既有事件/笔记/聊天 JSON，SQLite schema 保持 `10`，备份格式保持 v3。
- 新增正文分块、阅读范围和来源兼容自动化；P7、构建、fixtures、Rust 27 项测试、安全扫描、release preflight 和 diff 检查通过。
- 最终强制重建并打开 `读伴 Test.app`，真实书籍写入 `reachedRanges=[[12,17]]`、`engagedRanges=[[12,17]]` 和内容指纹；schema `10`、SQLite `quick_check = ok`。
- 本轮同时确认前端单独变化时 Tauri/Cargo 可能复用旧 release binary；桌面最终回归需核对 bundle 可执行文件时间或 hash，必要时主动触发 Rust 重编译。后续产品决策和编号重排已将下一步定为 P7.7 按需上下文编排与缓存。

### 2026-07-17：翻页模式支持键盘左右键

- 左右方向键分别复用现有上一页/下一页逻辑，PDF 和动态文本分屏均保持原动画与进度更新。
- 编辑控件、设置弹窗、中文组合输入和系统组合键会阻止全局翻页；滚动模式保持原行为。
- 新增独立键盘规则测试并纳入 P7 回归。
- 最终 Test.app 验证右键 `1/5 -> 2/5`、左键 `2/5 -> 1/5`，输入框聚焦时方向键不翻页；构建与自动化检查通过。

### 2026-07-17：撤下主动提问

- 根据真实使用体验，主动提问会打断阅读节奏，产品方向调整为“用户先发起、读伴按需回应”。
- 阅读页移除「读伴有一问」入口与交互原型卡；本书读伴设置移除「主动提醒」。
- shell 不再维护主动介入状态，前端不再写入新的 `intervention_state`；旧 `proactivity` 固定规范化为 `quiet`。
- 旧介入事件类型、SQLite schema 10、目录备份 v3 和历史时间线读取保持兼容，没有删除或重写用户数据。
- 当时先将 P7.7 改为按需上下文材料与缓存并取消原 P7.8 主动调度器；2026-07-18 又将上下文硬约束合入新 P7.7，后续不得从阅读停留、翻页或高亮恢复自动发问。
- `npm run test:p7`、`npm run build`、`npm run security:scan` 和 `git diff --check` 通过；重新构建 `读伴 Test.app` 后，bundle 资源中不含「读伴有一问」「交互原型」「主动提醒」。

### 2026-07-18：P7 后半程路线重排

- 取消主动提问后，不再保留空置的 P7.8 和沿用旧依赖；活跃路线从 P7.7 起重新编号，P7 最终由原 12 步收敛为 10 步。
- 新 P7.7 合并原 P7.7 材料准备与原 P7.9 上下文硬约束，统一负责用户发起后的选材、防剧透、输出预算、缓存、费用和失败降级。
- 原 P7.8 主动调度器退出路线；原 P7.10-P7.12 依次调整为新 P7.8 成果沉淀、新 P7.9 静默视觉状态和新 P7.10 诊断/QA/Public Alpha。
- P7-B 调整为 P7.5-P7.7，P7-C 调整为 P7.8-P7.10。视觉和 QA 验收删除介入/冷却/候选问题，增加“不自动调用模型”、缓存命中/失效和按需上下文来源解释。
- 历史实施日志保留当时编号，`ROADMAP.md` 和专项计划增加编号映射；AI 接手提示词明确禁止恢复主动提问。
- 本轮只调整项目文档，没有修改代码、schema、prompt、备份格式或用户数据。下一步为 **P7.7 按需上下文编排与缓存**。

### 2026-07-18：P7.7 按需上下文编排与缓存

- 新增统一纯函数 `src/lib/companionContext.js`，章节导读、读中问答和读后回想不再分别裁剪整章、当前页、历史对话和笔记。
- 组装器按场景和优先级选择用户选区、当前页、确认已读正文、用户选择带入的笔记/问答和相关记忆；低质量正文不会进入缓存或请求。
- 严格防剧透与只给方向模式继续执行代码级隔离：读中请求排除未读正文、导读全文、旧模型回答和整书高风险字段；允许后文时才放开当前阅读项全文。读后回想只有在当前阅读项确认完成后才带入本项全文。
- 每次 AI 结果保存脱敏 `contextTrace`：只含来源用途、页码、正文块 id、内容指纹、质量、字符数、排除原因、策略指纹、模型签名、prompt 版本、输入估算和输出上限，不复制正文。
- 简短/适中/深入映射不同上下文字符预算、回答结构和输出 token。AI profile 仍可调低 token，但新增 `hardMaxTokens` 后不能突破读伴策略上限。
- 中间上下文使用最多 48 项的进程/会话内 LRU，不新增数据库表。章节导读完整制品继续保存到 `reading_guides`，`contextTrace.cacheKey` 同时包含正文、阅读计划连续性、策略、模型和 prompt 版本；普通生成可命中，明确重新生成会绕过缓存。
- 划词提问现在会把用户选中的原文作为最高优先级来源真正带入请求，并保留正文块引用；此前选区只随消息保存、未明确进入 prompt 的缺口一并补齐。
- usage、费用、取消、超时、有限重试、预算保护、模型 profile 和脱敏诊断继续复用 P6 链路。上下文模块不导入 AI transport，翻页/停留处理函数也没有模型调用。
- 为保证纯函数可直接在 Node 测试，`readingContract.js` 不再为整书导读字段规范化静态依赖模型调用模块；只解析契约实际需要的字段。
- 新增 `test:companion-context` 并纳入 `test:p7`，覆盖严格模式无未读正文、来源引用、三档预算、缓存命中/四类失效、未完成读后边界、profile 硬上限和禁止自动调用。
- 验证通过：`npm run test:p7`、`npm run build`、`npm run build:test`、`npm run security:scan`、`cargo fmt --check`、`cargo check`、`cargo test`（27 项）和 `git diff --check`。
- 已在最终缓存失效补丁后重建 `src-tauri/target/release/bundle/macos/读伴 Test.app`；bundle id 为 `com.duban.reader.test`，可执行文件 SHA-256 为 `442657311af87538306b1cf296a0d0d606460fe9199ce4803bf0c59cd8effa6e`。
- 本轮没有新增 SQLite 表或 key，没有改变 schema 10、目录备份 v3 或既有用户内容；下一步进入 **P7.8 成果沉淀与用户可控记忆**。

### 2026-07-20：读伴整体界面与视觉重构前置为新 P7.8

- 用户认可成果记录与用户可控记忆方向，但指出问题不只在暖黄纸片角色：导读、侧栏、对话时间线、记录、输入区和设置都需要与最新“现代数字书斋”重新协调，视觉与交互问题应优先解决。
- 新增 P7.8“读伴整体界面与视觉重构”，按界面审计、三个关键场景整体方向人工定稿、组件/界面/资产重构、场景和桌面回归四步执行。
- 新阶段统一形象、信息层级、对话与记录排版、输入区、设置和场景衔接；完整形象、标准头像和简化印记仍作为三种规格。首轮不建设任意外观编辑器，也不引入主动提醒。
- 原成果沉淀顺延为 P7.9，原视觉状态顺延为 P7.10 且只负责真实状态与静默动效，诊断与 Public Alpha 验收顺延为 P7.11。
- 本轮仅更新规划和接手文档，没有修改产品代码、用户数据、SQLite schema 或备份格式。下一步为 **P7.8.1 界面审计与体验约束**。

### 2026-07-20：P7.8.1 读伴整体界面审计与体验约束

- 新增 `COMPANION_UI_AUDIT.md`，盘点开书设置、章节导读、阅读侧栏、问答/笔记时间线、输入区、本书设置、读后回想和完成页的组成、问题和重构优先级。
- 检查真实 `读伴 Test.app` 的《全球通史》导读、读中侧栏和设置弹层：设置的两列规则、软记忆和保存区结构可保留；导读和侧栏存在重复身份、嵌套表面和独立工具面板感。
- 资产审计确认当前暖黄纸片 PNG 与朱砂猫章品牌断裂；同一位图直接从导读大头像缩到侧栏小头像，缺少完整/标准/印记三种专门规格。
- 实现审计确认旧 SVG CSS、新 PNG CSS、两个 `* 2.jsx` 历史组件和过时 SVG 文档并存。清理延后到 P7.8.3，避免在用户选择方向前破坏现有界面。
- `UI_DESIGN_STANDARDS.md` 新增读伴界面标准，冻结一个视口一个主要身份信号、一个场景一个主要表面、对话/记录排版、透明背景三规格、窄窗口不压缩正文和克制过渡。
- 本轮仅修改文档，不改变导读、问答、笔记、读后、策略、上下文、事件、来源、进度、schema 10、备份 v3 或历史兼容。下一步为 **P7.8.2 三个整体方向方案与人工定稿**。

### 2026-07-20：P7.8.2 三个整体方向预览

- 按同一章、同一导读、同一问答、同一读后记录和同一画布产出“墨页猫影、朱砂批注、书灯留白”三个整体方向，避免把设计选择缩减为单一头像比较。
- 每个方向同时呈现导读、正文、页边陪读、居中记录、读后承接和完整/标准/印记三种规格；窄窗行为统一为覆盖式侧栏，不压缩正文。
- 预览已归档到 `docs/assets/p7-8-2/`，取舍和后续实现边界同步写入 `COMPANION_UI_AUDIT.md`。
- 当前客户端不支持内置设计选择表单，已改为直接展示三张预览供用户回复方向名称。人工定稿前不修改产品代码、现有资产、AI 行为、schema 10、备份 v3 或用户数据，也不进入 P7.8.3。

### 2026-07-20：P7.8.2 朱砂方向进入形象细化

- 第一轮人工反馈倾向“朱砂批注”的整体排版和页边陪读方式，但认为现有校记符号太抽象，尚不足以代表一位贯穿全书的读伴。
- 决策拆分为“界面语言”和“身份形象”：界面继续沿朱砂批注方向探索，形象另行生成更具体的概念稿，再进行人工确认。
- 形象必须保留克制、书卷和校记气质，同时提供完整、标准和印记三种专门规格；禁止复制 App 猫章、使用独立头像底板或退回暖黄纸片吉祥物。
- 本轮只补充设计提示词和项目记录，没有修改产品代码、现有资产、AI 行为、schema 10、备份 v3 或用户数据。P7.8.3 仍未启动。

### 2026-07-20：P7.8.2 朱砂读伴形象正式定稿

- 用户选定黑墨猫伏在打开书页上的外部概念稿，解决第一版纯校记符号过于抽象的问题，同时保留朱砂批注贴着正文和页边生长的气质。
- 最终视觉母题为“猫 + 打开的书页 + 少量朱砂批注线”；完整、标准和印记三种规格分别承担导读承接、当前陪读区域和页码/批注/保存反馈。
- 概念母稿已归档到 `docs/assets/p7-8-2/selected-cinnabar-companion-concept.png`。P7.8.3 必须重新制作透明背景资产，统一轮廓和线宽，并简化批注线末端符号。
- 本轮只完成设计定稿与文档归档，没有修改产品代码、现有界面资产、AI 行为、schema 10、备份 v3 或用户数据。下一步进入 **P7.8.3 组件、界面与资产重构**。

### 2026-07-20：P7.8.3 朱砂读伴第一版桌面包

- 新增完整、标准、印记三份透明 SVG，并通过统一 `variant` 接口接入导读、读中侧栏、时间线、读后和翻页承接；活跃组件不再加载旧暖黄纸片 PNG。
- 导读与读中界面改为朱砂边线、墨线、正文式排版和单一主要表面，减少嵌套卡片和独立聊天工具感。
- 900px 以下侧栏从正文文档流中移出，固定为右侧覆盖面板，长书不需要滚到末尾才能找到读伴；临界宽度正文不再被继续压缩。
- 本轮只改前端形象和布局，不改变桌面 command、SQLite、Keychain、AI transport、schema 10、目录备份 v3 或 test/formal 数据隔离。
- `npm run test:p7`、formal build、安全扫描、diff 检查和浏览器宽窄视口回归通过，控制台无新增 warning/error。
- 使用 `APPLE_SIGNING_IDENTITY=-` 生成临时签名 `读伴 Test.app`，bundle id 为 `com.duban.reader.test`；`codesign --verify --deep --strict` 通过，可执行文件 SHA-256 为 `b31d76e113f39e7002605f722a92d8f2f0e6f493a9075adf3b67b60ebef830a9`。
- 下一步先进行真实桌面视觉复核；确认方向后清理旧 PNG、重复组件和历史 CSS，再进入 P7.8.4 场景衔接与响应式回归。

### 2026-07-21：P7.8.3 形象原型还原修正

- 第一版手绘 SVG 因明显偏离定稿猫的姿态和轮廓被人工否决：原型中的修长侧坐、低头看书和前爪搭页关系没有被保留。
- 重新制作完整、标准、印记三份透明 PNG，分别保留同一只猫在大、中、小规格中的关键特征，并通过统一 `variant` 接口替换活跃引用。
- 真实浏览器导读和读中侧栏确认形象一致、透明背景融合、自然尺寸正确，控制台无新增 warning/error。
- P7 测试、formal/test 前端构建和临时签名桌面构建通过；新 `读伴 Test.app` 已实际打开，签名校验通过，可执行文件 SHA-256 为 `aff523e23fb77a96c13ecaf6be3cccbf9080c451976cd14fb90f7b3ce30d84a5`。
- Release preflight 因现有 `tauri:build:test` 包装脚本不满足静态配置路径检查而失败，版本检查本身通过；该发布脚本契约问题未混入本轮视觉修正。
- 第一版 SVG 不再有活跃引用，暂留到真实桌面人工确认后清理；本轮不改变桌面后端、AI、SQLite schema 10、Keychain、目录备份 v3 或用户数据。

### 2026-07-21：P7.8.4 页边唤醒与桌面回归

- 第二版读伴形象通过人工确认。读伴收起后只保留透明猫耳书页印记，点击可恢复原侧栏；工具栏不再重复显示文字唤醒入口。
- 开合过程保持问答草稿、阅读页、滚动/翻页模式和陪读时间线；用户主动划词提问会自动展开读伴。
- 1280px、960px、760px 浏览器回归无横向溢出或控制台错误，窄窗侧栏继续覆盖正文而不压缩书页。
- 被否决的第一版 SVG 与两个重复历史组件已确认无引用并删除；P7 自动化测试、formal/test build 和 diff 检查通过。
- 使用临时签名重建 `读伴 Test.app`，bundle id 为 `com.duban.reader.test`；`codesign --verify --deep --strict` 通过，可执行文件 SHA-256 为 `cf4cb64904ac7262518f757d31d1e7fe28c6c859b26b28fdf5ef2f639a530528`。
- P7.8 到此完成，桌面主线下一步进入 P7.9；本轮不改变 Rust command、SQLite schema 10、Keychain、AI transport、目录备份 v3 或环境隔离。

### 2026-07-21：桌面阅读页闪烁兼容修复

- macOS Test.app 在读伴开合或场景切换后偶发书页闪烁，滚轮触发 WebView 重绘后恢复。
- 根因收敛为 Tauri WebView 对长正文/PDF Canvas 的原生整页 View Transition 快照合成不稳定，不涉及书籍文件或阅读数据。
- 桌面端改用局部读伴元素动画，网页端继续保留原生共享元素过渡；新增运行时测试并并入 P7 回归。
- `test:p7`、test/formal build、安全扫描、codesign 和真实 Test.app 回归通过；MOBI 滚动/翻页模式均可不滚动完成读伴开合，翻页后正文保持可见。测试包 SHA-256：`921c15499665b03a625f27bc40c41561ac6ff0168411e05f583a42abbcffd744`。

### 2026-07-21：P7.9.1 本节记录与显式记忆确认

- 新增版本化 `CompanionSectionRecord`，把用户理解、未解决问题、来源事件和记忆关联保存到既有 `session_record` 事件；没有新增 SQLite 表、兼容 key 或 schema 版本。
- 完成页新增可编辑、可删除的「本节留下了什么」。用户回想或真实笔记可作为草稿，模型回答不会被自动整理成用户观点；没有真实内容时保持空白。
- “保存本节记录”和“确认让读伴记住”明确分离。确认后记忆保留来源阅读项和事件 id；记录再次编辑时必须重新确认，避免静默改变长期记忆。
- 旧有效 `takeaway` 可继续读取，历史兜底文案以及旧构建误存的 `AI 回答` 会自动忽略；删除沿用事件 tombstone，目录备份 v3 和 merge 规则继续有效。
- 新增 `test:companion-section-record` 并纳入 `test:p7`，覆盖草稿来源、空记录、旧记录迁移、记忆摘要和重新确认边界。P7 全量测试、formal/test build、安全扫描、Rust test/check、diff 与 Test.app 签名校验通过；最终可执行文件 SHA-256 为 `f22fbe936d4e6a230e453e878ad667d63e17f22352777d3b083a250ba109ba49`。
- 真实 Test.app 已确认旧错误记录自动呈现为空白，手工输入会启用保存与记忆确认；保存后的重启恢复因 macOS 锁屏中断，保留为下一次人工操作。下一步进入 **P7.9.2 后续导读的受控承接**。
- 按人工反馈继续修正完成页：顶部数量变为可展开的问答、笔记和读后回答；编辑区由并排表单改为读伴左问、用户右答的两轮对话。
- 已确认本书记忆新增撤销动作，撤销只移除长期记忆和 `memoryLink`，保留本节理解与问题；旧异常来源记忆可按 `sourceItemKey` 找回并撤销。
- P7 全量测试、formal/test build、安全扫描、Rust 测试、diff 和真实桌面展开/切换回归通过；新 Test.app 签名有效，可执行文件 SHA-256 为 `b17f660d86a35a2b816b231d70805a1cab6b0ba1bb4222407337a743795ef614`。
- 用户进一步指出读后聊天已经完成表达，完成页再次留言本身就是重复流程。最终移除完成页输入、保存和新记忆确认，只保留“回答 / 笔记 / 读后”三个已有成果入口。
- 后台 `session_record` 继续作为来源和迁移索引，不在界面制造第二份内容；本节关联记忆存在时仍可撤销，撤销后不影响原问答、笔记和读后交流。
- 最终 Test.app 已真实确认完成页只有“回答 / 笔记 / 读后”，空项禁用且没有 textarea、保存或新记忆确认；签名有效，可执行文件 SHA-256 为 `02e6f5a41d8d440605e6e7b8da2ca1891458f7cd76efb59df55b2390cf7cd6cf`。
## 2026-07-22：P7.9.2 后续导读受控承接

- 章节导读新增独立的跨阅读项记忆筛选：上一项确认记录可承接，更早记录须与当前阅读项存在可验证关联。
- 当前/未来、来源不明、旧迁移及无关记录被代码层排除，每次最多带入 3 条。
- 导读 prompt、上下文缓存与脱敏来源追踪同步升级；新增专项测试并纳入 P7 回归。
- 本轮只调整前端上下文编排与 prompt，不改变 Tauri command、SQLite schema 10、Keychain、目录备份 v3 或 test/formal 数据隔离。
- P7 全量测试、formal/test 构建、安全扫描、桌面 release 编译和临时签名校验通过；最新 Test.app 已单实例启动，可执行文件 SHA-256 为 `f6c8bd98f27f79a76e9ef8e91406fd9f3345b02cceecec1fbf4d890b17fc2145`。

## 2026-07-22：章节导读截断自动恢复

- 从 Test.app 本地脱敏诊断确认最近两次 DeepSeek 导读请求都在 `1800 / 1800` 输出 token 时以 `length` 结束，说明高失败率由响应 JSON 截断造成，API、Keychain 和请求链路本身正常。
- 导读默认输出上限调整为 `3200` token；简练、适中、深入三档分别使用 `2200 / 3200 / 4600`，并继续服从 profile 与预算的较低限制。
- 截断或首次格式无效时自动重试一次；恢复请求会压缩成品篇幅、保持 JSON 字段完整，并获得封顶 `6500` 的受控余量，标准档为 `3200 -> 4800`。第二次仍失败时返回明确可重试错误，不保存不完整导读。
- 接口明确返回输入过长时，章节上下文按约 `55%` 预算重新编排一次；超长正文保留首、中、尾代表片段，不再只保留开头。压缩状态、原始长度和实际长度写入脱敏来源诊断。
- 自动恢复的两次 usage 和费用统一汇总，生成物记录尝试次数与恢复原因；取消、缓存、预算保护、诊断与现有 transport 行为保持不变。
- 新增 `test:reading-guide-reliability` 并扩展上下文测试，覆盖输出压缩恢复、输入超限识别和首中尾保留；测试纳入 `test:p7`。本轮不新增数据库表、存储 key 或备份字段。
- P7 全量测试、formal/test 构建、安全扫描、桌面 release 编译、bundle id 和临时签名校验通过；最新 Test.app 可执行文件 SHA-256 为 `bd72b41a278ddb61f871a7e09c447dbbefad27c839723c1eddeb59077496eaed`。

## 2026-07-22：章节导读改用具体、直白的表达

- 核对最新真实诊断后确认，截图中的导读一次请求成功且没有发生输入/输出压缩；问题来自提示词鼓励模型追求宏观视角和有见识的表达。
- 删除“上帝视角”等容易诱发玄虚写法的要求，弱化公共评价和宏大背景，明确导读首先回答上一段讲了什么、这一段读什么、阅读时留意什么。
- 新增具体性约束和正反例：每段必须落到可指认对象，术语首次出现立即解释，不得给原文另造“龙脉、棋局、齿轮”等标签。
- 后续导读标题改为“接上一次阅读 / 今天读什么”，prompt 升级到 `reading-guide:p7.9.2-v3` 以使旧缓存正确失效。
- 本轮仅调整导读编排和提示词，不改变数据结构、AI transport、Keychain、预算、阅读边界或防剧透规则。
- P7 全量测试、formal/test 构建、安全扫描、桌面 release 编译和临时签名校验通过；最新 Test.app 可执行文件 SHA-256 为 `0e080dfc72d5d447ff8bf08a0f3fec74d53292f438774f6aef2c57806397a0c8`。

## 2026-07-22：章节导读补足继续阅读的动机

- 人工复核 v3 输出后确认，它已经更容易理解，但仍像章节摘要，缺少让读者继续往下读的具体理由，并再次出现“镜头切到、像棋局”等空泛比喻。
- overview 缩短到简练 `180-260`、适中 `220-360`、深入 `320-480` 字；后续承接固定为 1 句话，第二部分标题改为“今天为什么值得读”。
- 阅读动机必须来自材料中的一个具体冲突、反常之处或现实后果，只保留一个中心悬念，不提前给出完整答案，也不使用营销词或连续提问。
- 新增代码层风格恢复，识别典型文学化标签后自动用具体事实重写一次；prompt 升级到 `reading-guide:p7.9.2-v4`。
- 本轮不改变数据库、AI transport、预算核算、Keychain、阅读边界、防剧透或备份格式。
- P7 全量测试、formal/test 构建、安全扫描、桌面 release 编译和临时签名校验通过；最新 Test.app 可执行文件 SHA-256 为 `702627c398fe20164aa0de29743b3186948cc54da24b90f02e406ae0af67cb4b`。

## 2026-07-22：撤回导读关键词检测与文风自动重写

- 人工复核指出，“镜头、棋局、龙脉、齿轮”等只是单个样本里的词，不能作为全书、全品类的通用限制；按词判断会误伤原文合理表达。
- 删除代码中的关键词检测和文风自动重写。导读只有在输出截断、JSON/结构不可用或接口明确报告输入超限时才允许恢复，不因措辞风格增加调用和费用。
- prompt 改为按完整句子判断：比喻能帮助理解即可保留；增加理解成本时改为具体说明，不设置词语黑名单，也不机械删除原文表达。
- prompt 版本升级为 `reading-guide:p7.9.2-v5`。阅读动机仍来自具体冲突、反常之处或现实后果，但只作为生成引导，不作为自动重试条件。
- 本轮不改变数据库、AI transport、预算核算、Keychain、阅读边界、防剧透或备份格式。
- P7 全量测试、formal/test 构建、安全扫描、桌面 release 编译和临时签名校验通过；最新 Test.app 可执行文件 SHA-256 为 `29f0e7ca2d59a8e4c647cb2ea4fb60c3021eb4c8924add8d2deae0ad337bf9f5`。

## 2026-07-22：AI 用词替代偏好统一接入

- 新增运行时唯一主文件 `src/prompts/wordSubstitutions.md`，以“原词、建议表达、使用说明”维护具体措辞偏好；首条为“收束”按句义优先改成“结束、完毕、总结、回到主题”等。
- 章节导读、阅读中问答、本书聊天、读后交流、读后总结和整本书导读通过统一人格入口加载名单；正文排版任务明确排除，避免改变书籍原文。
- 名单是生成前指导，不是敏感词表，也不触发生成后的机械替换、自动重写或额外模型调用；用户输入、引文、书名和专有名词保持原样。
- 导读、问答和读后 prompt 版本同步升级，避免命中旧上下文缓存；新增专项测试并纳入 `test:p7`。
- 本轮不改变数据库、AI transport、预算、Keychain、阅读边界、防剧透或备份格式。
- 专项测试、P7 全量回归、formal/test 构建、安全扫描、临时签名 Test.app 构建和 `codesign --verify --deep --strict` 通过；bundle id 为 `com.duban.reader.test`，可执行文件 SHA-256 为 `8ed046bab52c0507b9e81185e1079657c35f970330852ca084eef7498eb0bc05`。

## 2026-07-22：docs 全量治理与自动审计

- 清点 `docs/` 下 26 份 Markdown、12,000 余行内容，并对照 `package.json`、Rust storage 常量、当前 P7 计划和发布状态检查版本、schema、备份、路线与链接。
- 重写文档索引，按“现行文档、发布与更新、未来阶段、已完成阶段档案”分类；首次接手不再要求顺序阅读全部历史。
- 将 `APP_EVOLUTION_LOG.md` 定为唯一实施日志；`PROJECT_NOTES.md` 只继续维护产品/架构共识，`UI_CHANGELOG.md` 冻结为 2026-07-22 以前的历史档案，避免同一改动写三遍。
- P6 生产级路线、开书设定旧流程、P7.8 UI 审计和首轮 Public Readiness 标记为完成阶段档案；不删除历史，也不再让其中旧“下一步”覆盖当前路线。
- 修正 Release Process 的 Alpha.2 旧版本、P7 主动介入旧称、P7.8.3 旧下一步、RustSec 尚未接入、Apple Developer 尚未审核等当前事实；P7 入口统一指向 P7.9.3。
- AI 接手文档删除重复且易过期的“快速事实”副本，改为从版本、路线、存储、发布和实施日志的唯一来源实时读取。
- 新增 `npm run docs:audit`，自动检查本地 Markdown 链接、索引覆盖、App 版本、schema 10、backup v3 和 P7.9.3 状态一致性；基础 GitHub Actions CI 已接入该命令。
- 本轮只调整文档治理和审计脚本，不改变产品功能、数据库、备份、AI 行为、Keychain 或用户数据。

## 2026-07-22：章节导读用词偏好增加展示兜底

- 真实导读仍出现“收束”，确认原实现只把替代名单加入提示词，模型未遵循时没有执行保障；已保存导读还会继续复用旧缓存。
- 用词名单增加“默认替代”列，模型仍可按上下文选择“完毕、总结、回到主题”等更自然的表达；章节导读的 overview、goals 和 questions 在解析及读取旧缓存时统一从同一名单执行展示兜底。
- 当前“收束”的默认替代为“结束”。书名、书籍原文、Markdown 引文、明确引用内容和用户输入不参与校正，也不增加模型调用。
- 导读样式版本升级到 `3`；旧缓存无需重新生成即可显示校正后的文本。本轮不改变 schema 10、目录备份 v3、AI transport、费用或阅读边界。

## 2026-07-22：导读页固定视口与内部滚动

- 导读页原先使用 `min-height`、大段纵向 padding 和自然内容高度，导读稍长就会撑出全局滚动条，标题与“翻开这一章”等主操作也会被推出窗口。
- `intro` 场景、导读页和主内容区统一固定为 `100dvh` 并隐藏页面级溢出；标题区、读伴身份和底部操作保持稳定，导读正文、生成状态、重新生成入口与“带进正文的线索”进入唯一的内部滚动区。
- 空导读状态在可用内容区垂直居中；窄窗把两组操作重排为两行，低高度窗口同步压缩安全边距、标题和读伴形象尺寸，不通过整体缩放牺牲可读性。
- 新增 `test:reading-guide-viewport` 并纳入 `test:p7`，防止重新引入 `min-h-screen`、全局溢出或丢失内部滚动容器。
- 浏览器实测 `1440×900`、`760×700`、`390×640` 和 `900×520`：文档 `scrollHeight` 均等于视口高度，横向无溢出，底部操作完整可见，内部导读区保持 `overflow-y: auto`；控制台无 warning/error。
- 本轮只调整导读场景 DOM、响应式布局与测试，不改变导读生成、缓存、阅读进度、AI transport、schema 10 或目录备份 v3。

## 2026-07-23：阅读计划不再生成纯注释尾段

- 真实桌面阅读发现，《万历十五年》第一章共 48 页，在标准节奏的 45 页上限下被旧算法硬切成 `45 + 3`，最后 3 页全是章末注释，却被单独命名为“第 2 段”。
- 新规则允许章节在单次上限的 20% 范围内轻微超出，48 页章节保持为一个完整阅读项；确实较长的章节按总页数均匀拆分，例如 80 页拆为 `40 + 40`，不再产生几页长的尾段。
- 新增独立 `readingPlanChunks` 纯函数和 `test:reading-plan-chunks`，覆盖轻微超限、两段均分、三段均分和关闭拆分四种情况，并纳入 P7 全量回归。
- 初版只修复新计划生成；随后补充了旧计划的窄范围兼容迁移，迁移规则与结果见下一条。

## 2026-07-23：旧版章末注释小尾段自动修复

- 修复已保存阅读计划仍可能出现“正文一段 + 仅含注释的第 2 段”的兼容问题。
- 读者页会识别同一章节中由旧版固定页数规则产生的小尾段，并自动并回完整章节。
- 自动修复会保留当前正在阅读分段的内部标识和最近页码；只有旧分段全部完成时，合并后的整章才记为完成。
- 兼容没有稳定条目 ID 的更早期计划：迁移时按原计划真实序号匹配完成状态和最近页码，避免前置导读等条目使进度错位。
- 真正超过单次阅读上限的长章节仍按均匀分段保留，不会被误合并。
- 迁移后会重新连续编号 `Day`，并同步修正计划摘要中的预计阅读日。
- 新保存的阅读计划写入 `chunkingVersion: 3`，不再重复执行旧计划兼容处理。

## 2026-07-23：合成书批量导入与阅读流程 QA

- 新增 `npm run qa:synthetic-books`，本地生成 4 本嵌入中文字体、正文为确定性占位内容的 PDF；生成目录已忽略，不向仓库提交大体量二进制样本。
- 样本覆盖标准目录 96 页、异常前后置页 54 页、无 PDF 目录 72 页和大目录 220 页；分别验证目录识别、版面标题识别、章节用途默认值和大书导入。
- Test.app 实测 4 本均成功导入：识别结果依次为 13、11、6、21 个章节项；书名页和目录默认忽略，前言类可作为导读，正文与参考书目/附录的用途区分符合预期。
- 标准样本完成读伴设定和 9 项计划生成；正文在滚动与翻页模式均正常渲染，页码、下一页和进度更新可用。
- 私密测试 Key 仅通过 Test.app 写入独立 Keychain，未进入源码、文档、日志或命令；连接测试通过。
- 完整章节导读在 120 秒内未返回，记录为模型侧超时，不记为成功；应用能自动停止、显示明确提示并继续打开正文。

## 2026-07-23：导读请求超时与停止生成修复

- 修复桌面端收到 AI 响应头后，在读取响应正文阶段无法及时取消的问题；整个模型调用也由最外层取消保护包裹，避免后台残留请求。
- 前端点击“停止生成”后会立即退出加载状态，同时通知 Rust 后端中止对应请求。
- 单次章节导读超过 2 分钟会自动停止，并提示用户稍后重试，避免界面长期卡在生成中。
- 新增 Tauri AI 取消行为回归测试，覆盖前端立即结束等待、后端取消命令下发，以及最外层保护中止仍在等待的 provider future。

## 2026-07-23：Test.app 本地签名补全

- 桌面测试包在当前机器找不到 Developer ID Application 时，Rust 链接器只会留下可执行文件级临时签名，严格校验会报告资源未封装。
- `tauri:build:test` 现在会在无 Developer ID 时对完整 Test.app 自动执行 ad-hoc 签名，并以 `codesign --verify --deep --strict` 立即校验；正式发布包的 Developer ID 签名、公证流程不受影响。

## 2026-07-23：Alpha.4 本地候选包开始打包

- 启动最新 `读伴 Test.app` 供桌面人工验收；Test.app 已通过完整 ad-hoc 签名严格校验。
- 重新生成 formal dist 后，`release:preflight` 通过，确认正式包未包含测试书入口或 test channel 资源。
- 受限 Codex 进程首次读取登录钥匙串时误报 `0 valid identities`；钥匙串访问实际显示证书与私钥完整，改用系统权限复查后确认 `Developer ID Application: Zhanwen Lu (FBMN9293RM)` 有效。
- 明确设置 `APPLE_SIGNING_IDENTITY` 和 `NOTARYTOOL_KEYCHAIN_PROFILE=duban-notarytool` 后，严格签名/公证预检全部通过，用户无需重新导入证书。
- 已继续生成内部验收用 `读伴_0.2.0-alpha.4_formal_arm64_local.dmg`；App 为完整 ad-hoc 签名，DMG 通过 `hdiutil verify`。
- 已生成 local manifest 与 checksums；DMG SHA-256 为 `5f4e18e06ef98a82329c1bc64ebcfed3e1210420b41de6e5713133aa62ff9466`。该 local DMG 仅用于本机/内部测试，不对外分发。
- 本地 signed 打包脚本现在默认从 `~/.tauri/duban-updater.key` 读取加密私钥，并从登录钥匙串服务 `com.duban.reader.updater-signing` 读取密码；秘密不进入命令、仓库、构建日志或聊天，GitHub Actions 的 Secrets 流程保持不变。

## 2026-07-23：Alpha.5 正式候选准备

- 将 npm、Cargo、Tauri、macOS bundleVersion 和 lockfile 的发布版本统一提升到 `0.2.0-alpha.5`；已发布的 `v0.2.0-alpha.4` 保留为 App 内自动更新验收的旧版起点。
- 本次候选汇总 Alpha.4 之后的 P7 连续陪读体验、MOBI/PDF 阅读修复、导读可靠性、阅读计划迁移、响应式布局、Keychain 和发布安全更新。
- 正式前端构建、版本一致性、发布流程自测、正式包预检、文档审计、QA fixtures、安全扫描、Rust 格式检查、Rust 编译和 29 个 Rust 测试均通过。
- RustSec 审计未发现阻断漏洞；Tauri 跨平台依赖链中已登记的 unmaintained/unsound 警告继续由项目审计配置显式允许，并由 CI 固定复核。
- 最新 `读伴 Test.app` 保持独立 bundle id 和独立数据目录运行；正式 Alpha.4 安装不被覆盖，便于发布 Alpha.5 后执行真实升级验收。
