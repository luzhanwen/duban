# 读伴发布流程

> 最后更新：2026-07-09

本文档承接 P6.7「正式 macOS 发布包」。它记录发布配置、构建通道、artifact 命名、校验和、Developer ID 签名、公证、staple 和 release notes 约定。发布当天的逐项操作清单维护在 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。

## P6.7.1 当前结论

- 当前版本号固定为 `0.1.0`。
- 正式 macOS bundle identifier：`com.duban.reader`。
- 测试 macOS bundle identifier：`com.duban.reader.test`。
- 正式 App 名称：`读伴`。
- 测试 App 名称：`读伴 Test`。
- 正式前端 channel：`formal`。
- 测试前端 channel：`test`。

## 构建通道

正式 Web/Tauri 构建必须使用：

```bash
npm run build:formal
npm run tauri:build:formal
```

测试 Web/Tauri 构建必须使用：

```bash
npm run build:test
npm run tauri:build:test
```

默认 `npm run build` 等同于 `npm run build:formal`。默认 `npm run tauri:build` 等同于 `npm run tauri:build:formal`。

## 正式包护栏

- `.env.formal` 必须声明 `VITE_APP_CHANNEL=formal`。
- `.env.test` 必须声明 `VITE_APP_CHANNEL=test`。
- `vite.config.js` 的 formal build guard 会删除 `dist/test-books`。
- formal build guard 会扫描 `dist/`，如果发现 `/test-books/`、`test-books/wanli15.pdf` 或 `导入测试`，构建失败。
- `npm run release:preflight` 会复查版本、channel、Tauri formal/test 配置、发布脚本和 formal dist。

## 本地 macOS DMG

本地未公证 DMG 用于内部验证：

```bash
npm run package:mac-local
```

默认输出：

```text
src-tauri/target/release/bundle/dmg/读伴_0.1.0_formal_<arch>_local.dmg
```

其中 `<arch>` 取当前机器架构，例如 `arm64`。

## Manifest 与校验和

生成已有 release artifact 的 manifest 和 sha256：

```bash
npm run release:manifest
```

默认输出：

```text
release-artifacts/duban-v0.1.0-formal-<arch>-manifest.json
release-artifacts/duban-v0.1.0-formal-<arch>-checksums.txt
```

只有文件型 artifact 会进入 checksum，例如 `.dmg`、`.zip`、`.tar.gz`、`.msi`、`.exe`、`.AppImage`、`.deb`。`.app` bundle 是目录，不直接进入 checksum；正式分发应优先校验 `.dmg`。

`release:manifest` 只收录文件名同时包含当前 `version` 和 `RELEASE_CHANNEL` 的 artifact，避免旧版本或测试包残留时混入 checksum。

从 P6.7.2 开始，manifest 还会按 `RELEASE_KIND` 过滤 artifact。默认 `RELEASE_KIND=local`，签名发布包使用 `RELEASE_KIND=signed`，输出文件名会带上 kind：

```text
release-artifacts/duban-v0.1.0-formal-<arch>-local-manifest.json
release-artifacts/duban-v0.1.0-formal-<arch>-signed-manifest.json
```

## P6.7.2 Developer ID 签名/公证准备

当前状态，2026-07-09：

- Apple Developer Program 注册申请已提交，仍在 Apple 审核中。
- 审核通过前，无法创建 `Developer ID Application` 证书。
- 项目侧脚本和配置已准备完成；真实签名、公证和 staple 等待证书与 notarytool 凭据。

### 概念边界

- Developer ID 签名：用 Apple 颁发的 Developer ID Application 证书给 `.app` 和 `.dmg` 做代码签名，证明发布者身份，并让 macOS 能验证文件未被篡改。
- Hardened Runtime：macOS 对 Developer ID 公证软件要求的运行时保护之一，正式包已在 `src-tauri/tauri.formal.conf.json` 中启用。
- Notarization：把签名后的软件提交给 Apple notary service 自动扫描；通过后 Apple 生成公证票据。
- Staple：把公证票据绑定到 `.dmg`，用户离线或 Apple 服务不可达时，Gatekeeper 也能识别该包已公证。
- Gatekeeper 验证：在本机和干净 macOS 环境中确认 `.app`、`.dmg` 能通过 macOS 安全评估。

### 项目已准备的入口

```bash
npm run release:signing-preflight
npm run package:mac-signed
npm run release:notarize
npm run release:gatekeeper
```

说明：

- `release:signing-preflight` 默认只检查本机工具、Tauri 配置、脚本入口和可见凭据，缺少证书/凭据时给 warning。
- `npm run release:signing-preflight -- --strict` 会把缺少 Developer ID 证书或公证凭据视为失败，适合真正发布前使用。
- `package:mac-signed` 需要 `APPLE_SIGNING_IDENTITY` 或 CI 的 `APPLE_CERTIFICATE`，会生成 `读伴_0.1.0_formal_<arch>_signed.dmg`。
- `release:notarize` 默认提交 signed DMG，成功后执行 `xcrun stapler staple`、`xcrun stapler validate` 和 `spctl` DMG 验证。
- `release:gatekeeper` 对本地 `.app` 和 signed DMG 执行 codesign、stapler 和 Gatekeeper 验证。

### 本机一次性准备

1. 加入 Apple Developer Program。
2. 在 Apple Developer 后台创建并下载 `Developer ID Application` 证书。
3. 把证书导入 macOS Keychain，确保私钥也在本机。
4. 在终端确认能看到证书：

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

5. 设置签名身份，推荐使用完整证书名：

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name or Company (TEAMID)"
```

6. 准备 notarytool 凭据，推荐存入 Keychain profile：

```bash
xcrun notarytool store-credentials "duban-notarytool" \
  --apple-id "你的 Apple ID 邮箱" \
  --team-id "你的 Team ID" \
  --password "App-specific password"

export NOTARYTOOL_KEYCHAIN_PROFILE="duban-notarytool"
```

也可以不用 Keychain profile，临时使用环境变量：

```bash
export APPLE_ID="你的 Apple ID 邮箱"
export APPLE_TEAM_ID="你的 Team ID"
export APPLE_APP_SPECIFIC_PASSWORD="App-specific password"
```

### 正式验证流程

1. 确认本机签名环境：

```bash
npm run release:signing-preflight -- --strict
```

2. 构建 signed DMG：

```bash
npm run package:mac-signed
```

3. 提交 Apple 公证并 staple：

```bash
npm run release:notarize
```

4. 本机 Gatekeeper 验证：

```bash
npm run release:gatekeeper
```

5. 生成最终 manifest/checksum：

```bash
RELEASE_KIND=signed npm run release:manifest
```

6. 把 `release-artifacts/*signed-checksums.txt` 内容贴进 release notes。

### 干净 macOS 环境回归

至少在一个新 macOS 用户、另一台 Mac 或干净虚拟机里验证：

- 下载 signed + notarized DMG。
- 双击打开 DMG，不出现“无法验证开发者”或恶意软件拦截。
- 拖拽 `读伴.app` 到 Applications。
- 从 Applications 首次启动成功。
- 打开设置页，保存 API Key，Keychain 授权行为正常。
- 导入一本 PDF 和一本 MOBI。
- 生成整本书导读、章节导读和一次阅读中问答。
- 退出 App，再启动，确认书库、进度、笔记、聊天和 API Key 状态恢复。
- 点窗口叉号进入后台，Dock 图标可唤回，`Cmd+Q` 或系统退出可真正退出。
- 导出一次备份，再导入预览并查看校验报告。

## Release Notes 模板

每次发布至少包含：

````markdown
# 读伴 0.1.0

## 更新内容

-

## 数据与隐私

- 本版本仍是本地优先；书库、笔记和阅读进度默认保存在本机。
- 桌面版 API Key 保存在系统 Keychain。
- 建议升级前先导出一次本地备份。

## 已知限制

-

## 校验和

```text
粘贴 release-artifacts/*-checksums.txt 内容
```
````

## P6.7 后续

- 使用真实 Apple Developer ID 证书跑通 `package:mac-signed`。
- 执行真实 notarization 并 staple signed DMG。
- 在干净 macOS 用户环境验证安装、首次启动、导入书籍、保存 API Key、AI 请求、重启恢复和卸载。
- 输出最终 release notes。
