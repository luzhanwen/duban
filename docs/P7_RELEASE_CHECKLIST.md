# P7 候选包验收清单

> 状态：P7 工程收口清单，2026-07-22 建立
>
> 适用范围：`0.2.0-alpha.4` 之后包含完整 P7 能力的 Public Alpha 候选包

本文只检查 P7 连续陪读、按需上下文、记忆、视觉状态和诊断能力。签名、公证、staple、GitHub Release 与更新清单仍按 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) 执行。

## 一、自动检查

发布候选提交必须全部通过：

```bash
npm run qa:fixtures
npm run qa:fixtures:verify
npm run test:p7
npm run build:formal
npm run build:test
npm run p7:preflight
npm run release:preflight
npm run security:scan
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

自动检查必须确认：

- 导读、读中问答和读后交流都使用统一上下文组装器。
- 严格不剧透时不带入未读正文、旧模型回答或高风险整书字段。
- 翻页、停留、高亮和窗口切换不会自动调用模型，也没有主动提问入口。
- AI 诊断只保存材料类型、脱敏引用、页码、数量、预算、策略和缓存状态。
- 正式 `dist/` 不包含测试入口、固定样本、测试秘密标记、证书或私钥材料。
- schema 10、目录备份 v3、旧来源定位和陪读事件合并测试保持通过。

## 二、固定样本

自动契约样本位于 `qa-fixtures/p7/companion-context-cases.json`：

- 普通文本 PDF。
- 无目录 PDF。
- 扫描页无可用文本。
- 超长章节压缩与预算。
- P7 前旧书与旧来源定位。
- MOBI 结构化文本。
- 390×844 窄窗口。

受版权或体积限制不能提交的真实 PDF/MOBI，只在本机人工验收，不进入仓库或诊断包。

## 三、桌面人工验收

在最新 `读伴 Test.app` 完成以下检查，并记录通过/失败和必要截图：

- 从书架进入导读、正文、读后，再回到书架；读伴身份和时间线连续，草稿与阅读位置不丢失。
- 在导读生成、回答中、保存、完成、错误、离线状态间切换；取消后立即退出任务态，阅读始终可用。
- 开启 macOS“减少动态效果”后重复场景切换；功能完整且没有状态动画。
- 选择“仅使用已读内容”，在当前页提问；回答与设置页诊断都不出现未读内容。
- 重复同一导读/上下文后检查缓存命中；改变正文、规则、模型或 prompt 后检查缓存失效。
- 在设置的“诊断 -> AI 调用与选材”展开最近记录，能看懂选入材料、排除原因、预算和缓存状态。
- 导出诊断包并搜索本次书籍原句、笔记原句、问题原句、回答原句和 API Key；结果均不得命中。
- 完全退出并重启，确认书库、进度、笔记、聊天、记忆和来源关系恢复；撤销的记忆不复活。
- 在普通窗口、约 960px 窗口和 390×844 等效窄窗口检查导读、阅读器、读后与诊断页面，无全局横向滚动或正文压缩。

## 四、正式发布前人工验收

P7 完成不等于公开版本已经发布。创建公开 tag 前还必须：

- 使用 Developer ID 构建正式包，完成 Apple notarization 与 staple。
- 在干净 macOS 用户环境安装并由 Gatekeeper 首次打开。
- 确认 formal bundle id、数据目录和 Keychain service 不读取 Test.app 数据。
- 检查 GitHub Release 的 DMG、updater archive、签名、checksum 和 manifest。
- 从上一公开 Alpha 执行一次真实自动更新，并确认用户数据与 API Key 状态不丢失。

## 五、阻断条件

出现以下任一情况不得发布：

- 未读正文进入严格模式请求或回答。
- 诊断包包含正文、笔记、聊天、prompt、密钥或绝对用户路径。
- 阅读事件自动触发模型调用或恢复主动提问入口。
- 导读、正文、读后切换丢失记录、草稿或进度。
- 旧书、备份或 schema 升级破坏现有数据。
- 正式包包含测试入口、测试样本或签名/公证失败。
