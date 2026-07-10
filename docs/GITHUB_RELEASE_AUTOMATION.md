# GitHub Release 自动发布配置

> 最后更新：2026-07-10

本文档说明如何把不可变 Git tag、GitHub Actions、Developer ID 签名、Apple 公证和 GitHub Release 连接起来。版本规范见 [VERSIONING.md](./VERSIONING.md)，人工验收项见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。

## 自动化边界

推送 `v<package.json version>` annotated tag 后，[release-macos.yml](../.github/workflows/release-macos.yml) 会：

1. 验证 tag、App version、Changelog、Git commit、`origin/main` 和 clean worktree。
2. 运行正式前端构建、release preflight、Rust fmt/check/test、QA fixtures 和安全扫描。
3. 进入受保护的 `macos-release` GitHub Environment。
4. 导入 Developer ID `.p12`，构建 `arm64` signed DMG。
5. 提交 Apple notarization，保存 JSON 结果并要求状态为 `Accepted`。
6. staple 公证票据，执行 codesign、stapler 和 Gatekeeper 验证。
7. 生成 release notes、manifest 和 SHA-256 checksums。
8. 先创建 draft GitHub Release；全部资产上传成功后才转为公开 Release。

`alpha`、`beta`、`rc` 自动标记为 GitHub prerelease；无预发布后缀的版本发布为普通 Release。已经公开的 Release 不会被脚本覆盖或修改。

## 一次性 GitHub 配置

### 1. 创建发布 Environment

在 GitHub 仓库中进入：

```text
Settings -> Environments -> New environment -> macos-release
```

建议：

- 如果当前 GitHub 方案支持，添加 required reviewer，tag 推送后由人工批准签名发布 job。
- Deployment branches and tags 只允许受保护的 tag；至少保证发布人员有仓库写权限。
- Environment 名称必须是 `macos-release`，与 workflow 完全一致。

### 2. 导出 Developer ID 证书

1. 打开 macOS「钥匙串访问」。
2. 进入「登录 -> 我的证书」。
3. 展开 `Developer ID Application: Zhanwen Lu (FBMN9293RM)`，确认下面能看到私钥。
4. 右键证书/私钥条目并导出为 `.p12`。
5. 为 `.p12` 设置一个新的导出密码；不要使用 Mac 登录密码。
6. 转为单行 base64：

```bash
openssl base64 -A -in /path/to/duban-developer-id.p12 -out certificate-base64.txt
```

把 `certificate-base64.txt` 的完整内容保存到 GitHub Secret 后，删除本机临时 `.p12` 和 base64 文件，或移入受保护的离线密钥存储。任何证书、私钥或 base64 内容都不得提交 Git。

### 3. 添加 Environment Secrets

进入：

```text
Settings -> Environments -> macos-release -> Environment secrets
```

添加：

| Secret | 内容 | 是否必需 |
| --- | --- | --- |
| `APPLE_CERTIFICATE` | `.p12` 的单行 base64 | 必需 |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设置的密码 | 必需 |
| `KEYCHAIN_PASSWORD` | CI 临时 Keychain 密码，可用 `openssl rand -base64 32` 生成 | 必需 |
| `APPLE_ID` | Apple Developer 账号邮箱 | 必需 |
| `APPLE_PASSWORD` | Apple ID 的 App 专用密码，不是账号登录密码 | 必需 |
| `APPLE_TEAM_ID` | `FBMN9293RM` | 必需 |
| `APPLE_SIGNING_IDENTITY` | Developer ID Application 完整名称或 SHA-1 | 可选 |

本机的 `duban-notarytool` Keychain profile 不能直接复制给 GitHub runner，因此 CI 使用 `APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID` 完成公证。

### 4. 检查 Actions 权限

进入：

```text
Settings -> Actions -> General -> Workflow permissions
```

确认仓库策略允许 release job 获得 `contents: write`。Workflow 只在发布 job 请求该权限，普通 CI 仍保持只读。

## 每次发布步骤

以下命令必须在已经合并到 `main` 的干净工作区执行。

### 1. 检查候选状态

```bash
git switch main
git pull --ff-only
npm ci
npm run version:check
npm run release:check -- candidate
npm run build:formal
npm run release:preflight
```

### 2. 冻结 Changelog

```bash
npm run release:prepare
git diff -- CHANGELOG.md
npm run release:notes -- draft
```

确认更新内容和 Known limitations 后提交：

```bash
git add CHANGELOG.md
git commit -m "release: prepare v0.2.0-alpha.1"
git push origin main
git fetch origin main --tags
```

### 3. 创建并推送 annotated tag

```bash
npm run release:check -- tag-ready
git tag -a v0.2.0-alpha.1 -m "读伴 0.2.0-alpha.1"
git push origin v0.2.0-alpha.1
```

不要使用 lightweight tag，不要移动已有 tag，不要使用 `git push --force`。Workflow 会再次验证 tag 指向、Changelog、`origin/main` 和 clean 状态。

### 4. 在 GitHub 完成发布

1. 打开 Actions 中的 `Release macOS`。
2. 检查 `Validate Tagged Source` 全部通过。
3. 如果 Environment 配置了 reviewer，批准 `macos-release` job。
4. 等待签名、公证、staple、Gatekeeper、checksum 和上传完成。
5. 打开 Releases，确认版本、prerelease 状态和下载资产。

自动上传：

```text
读伴_<version>_formal_arm64_signed.dmg
duban-v<version>-formal-arm64-signed-manifest.json
duban-v<version>-formal-arm64-signed-checksums.txt
duban-v<version>-formal-arm64-signed-notary-log.json
duban-v<version>-release-notes.md
```

同一份发布证据还会保存为 GitHub Actions workflow artifact。

## 失败与重试

- Secrets、Apple 服务或上传瞬时失败，且源码/tag 没有变化：修正外部条件后可重新运行失败 job；脚本可以继续使用同一个 draft Release。
- 已经公开的 Release：脚本拒绝覆盖。发现问题必须升版本并创建新 tag。
- 需要修改代码或 Changelog：不得移动旧 tag；删除未公开 draft（如有），升到新版本，重新走完整流程。
- 公证不是 `Accepted`：不会 staple、不会公开 Release，JSON 结果保留在 workflow artifact 供排查。
- 签名/公证成功但 GitHub 发布失败：DMG、manifest、checksum、notes 和 notary log 会保留在 workflow artifact；修复权限后重跑。

## P6.8 接口

P6.8 自动更新将消费这里已经建立的不可变版本关系和 GitHub Release 资产：

- `v<SemVer>` tag 是版本身份。
- GitHub Release 区分 prerelease/stable 通道。
- manifest 绑定 commit、tag、schema、backup version 和 DMG sha256。
- updater 后续新增独立 updater 签名密钥、更新 bundle 和 `latest.json`。

P6.7.6 不生成 `latest.json`，也不启用 App 内自动安装；这些属于 P6.8，不能与 Developer ID 证书私钥混为同一套密钥。
