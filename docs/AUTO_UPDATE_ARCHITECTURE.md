# 读伴自动更新架构与操作规范

> 最后更新：2026-07-11  
> 当前阶段：Alpha.4 已发布并更新真实 Alpha manifest，等待使用已安装的 Alpha.3 完成 App 内升级验收

## 目标

读伴正式桌面版通过 Tauri updater 检查、下载和安装新版本。更新必须复用现有 SemVer、annotated Git tag、GitHub Release、Developer ID 签名和 Apple 公证流水线，不能维护第二套版本号。

## 安全边界

- Developer ID 私钥证明 App 来自读伴开发者，updater 私钥证明更新包由读伴发布；两把密钥职责不同，禁止复用。
- updater 私钥只保存在发布者的安全离线位置和 GitHub `macos-release` Environment Secrets，永远不进入仓库、日志、诊断包或 Release assets。
- updater 公钥进入正式 App 配置。公钥可以公开，但一旦某个版本发布，后续更新必须由配套私钥签名。
- 丢失 updater 私钥后，已安装版本无法信任新的签名密钥，只能让用户手动下载安装包。因此必须至少保存两份受控备份。
- Tauri updater 的签名校验不可关闭；GitHub Release checksum 只用于人工核验，不能替代 updater 签名。

## 环境与通道

| 环境 | Bundle identifier | 远程更新 |
| --- | --- | --- |
| 浏览器版 | 不适用 | 不接入桌面 updater |
| Tauri test/dev | `com.duban.reader.test` | 禁用，不访问正式 manifest |
| 正式 Alpha | `com.duban.reader` | `alpha/latest.json` |
| 正式 Stable | `com.duban.reader` | 后续切换到 `stable/latest.json` |

测试环境不配置 updater endpoint。正式 Alpha 计划消费固定地址：

```text
https://raw.githubusercontent.com/luzhanwen/duban/updater-index/alpha/latest.json
```

`updater-index` 分支只保存可变的通道指针；版本化更新包和签名作为不可变 GitHub Release assets 保存。即使 manifest 托管被篡改，客户端仍必须通过内置公钥验证更新包签名。

## 分阶段实施

### P6.8.1 客户端基础

- 接入官方 `tauri-plugin-updater`、`tauri-plugin-process` 和对应 JavaScript 包。
- capability 仅增加 `updater:default` 与 `process:allow-restart`。
- 新增 `src/lib/appUpdater.js`，统一检查更新、下载/安装、清理待更新句柄和重启入口。
- 浏览器版和 test channel 返回“不支持”，不会访问远程更新源。
- 新增 `npm run updater:preflight`；普通模式检查基础并提示未配置项，严格模式要求完整信任根和发布环境变量。
- 安全扫描拦截误提交的 minisign/Tauri updater 私钥。

### P6.8.2 信任根与发布产物

- 已由用户亲自生成带强密码的 updater 密钥；私钥位于 `~/.tauri/duban-updater.key`，权限已收紧为 `600`，私钥内容未进入 Codex 输出或项目文件。
- 公钥已配置到 formal 与 release Tauri 配置。
- 已新增 release 专用配置，设置 `bundle.createUpdaterArtifacts: true`，不影响本地 test/formal 日常构建。
- 发布流水线已要求生成 macOS `.app.tar.gz` 和 `.app.tar.gz.sig`，并由 release manifest/publish 自测强制校验成对存在。
- GitHub `macos-release` Environment 已新增 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`；Secret 值不可回读，只验证了名称与更新时间。

### P6.8.3 通道 manifest

- 已新增 `updater:manifest`，根据 tagged source、release manifest、release notes、`.app.tar.gz` 和 `.sig` 生成 Tauri 静态 manifest；Apple Silicon 平台键固定为官方客户端实际查找的 `darwin-aarch64`。
- 已新增 `updater:publish`，先确认 GitHub Release 已公开且包含目标 archive，再通过 GitHub Git Data API 原子提交 `updater-index/<channel>/latest.json`。
- 初次发布会建立只含通道文件的 root commit；后续发布基于当前 tree 快进更新，保留 Alpha/Stable 两条路径。
- 同版本同内容重复执行为 no-op；同版本不同内容和版本倒退会被拒绝，避免错误回滚或静默改写。
- Release 已公开但通道更新失败时，workflow 可以验证既有 assets 后安全续跑，不会修改公开 Release。
- Alpha.3 首次真实发布前，远端 `updater-index/alpha/latest.json` 尚不存在；这不会影响 test channel，也不会在设置页暴露更新入口。

### P6.8.4 用户体验与数据保护

- 正式桌面设置页新增独立“软件更新”分类，显示当前版本、检查结果、版本说明、下载进度、数据保护状态和手动下载入口。
- 浏览器版和 Tauri test channel 不渲染该入口；Playwright 回归确认测试桌面显示“测试通道 · 桌面版”且更新入口数量为 0。
- 用户通过应用内确认弹窗开始安装；确认后先调用现有目录式备份创建恢复点，并用“升级到 `<version>` 前的恢复点”标记。备份失败时下载与安装不会开始。
- 下载和安装继续由 Tauri updater 完成签名验证；安装成功后通过 `process:allow-restart` 重启 App，重启失败时保留手动重启提示。
- 手动下载通过官方 opener 打开版本对应 GitHub Release；capability 只允许 `https://github.com/luzhanwen/duban/releases*`，不能打开任意路径或域名。
- UI 覆盖未检查、检查中、已是最新版、发现新版本、创建恢复点、下载/安装、等待重启和错误状态；真实下载、签名拒绝和 schema 恢复仍由 P6.8.5 双版本包验收。

### P6.8.5 双版本验收

- `0.2.0-alpha.3` 已首次内置 updater 公钥和 Alpha manifest 地址；签名、公证、updater archive/signature、GitHub Release 和远端 `alpha/latest.json` 已真实发布并独立核验。
- `0.2.0-alpha.4` signed updater artifact、GitHub prerelease 和远端 `alpha/latest.json` 已发布；仍需用已安装的 Alpha.3 实机完成检查、下载、签名校验、安装、重启和数据恢复验证。
- 另做篡改签名、断网、下载中断、备份失败、manifest 仍指向旧版和手动下载 fallback 测试。

## 密钥状态

本机长期密钥已生成。重新生成会更换信任根，因此除非当前私钥在 Alpha.3 发布前确认损坏，否则不要再次运行：

```bash
npm run tauri signer generate -- -w ~/.tauri/duban-updater.key
```

`.key` 是私钥；配套公钥内容可以写入仓库。不得把私钥文件放进项目目录，也不得通过聊天、Issue、PR、Release 或普通文件分享工具传递。GitHub Environment Secret 已配置；用户暂时没有合适的加密 U 盘，离线备份作为 Alpha.3 正式发布前人工检查项保留，不阻塞 P6.8.4 开发。

## 每次发布检查

```bash
npm run version:check
npm run updater:preflight
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test
npm run security:scan
```

正式 CI 需要额外运行：

```bash
npm run updater:preflight -- --strict
```

严格预检只能在 GitHub Environment 或受控本机 shell 中运行；不要在命令行直接回显私钥或密码。
