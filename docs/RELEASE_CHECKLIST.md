# 读伴 Release Checklist

> 最后更新：2026-07-13

这份清单用于每次发布前逐项确认。它不替代 [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)，而是把发布当天要做的检查压成一张可执行 checklist。

首个 `0.1.0 formal arm64 signed` 候选包虽通过机器验证，但人工 Smoke Test 发现旧 PDF 的 macOS `asset://` 状态 `0` 问题，已标记为不得分发。Test bundle 已改用受限 Tauri fs 插件并完成旧书回归；下一正式候选仍需重新签名/公证和执行本清单全部人工项。完整证据见 [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)。

## 0. 发布边界

- [ ] 确认 `package.json` 版本与目标 tag/release notes 一致；当前开发目标为 `0.2.0-alpha.4`。
- [ ] 确认发布通道：`formal`。
- [ ] 在候选包「诊断 -> 版本与构建」确认 App version、Git commit 与目标发布提交一致，且不显示 `dirty`。
- [ ] 确认发布类型：`local` 内测包，或 `signed` 正式签名包。
- [ ] 确认本次 release notes 的主要变化、已知限制和备份建议。
- [ ] 确认 Apple Developer Program 状态；若尚未通过审核，本次只能发布 local 内测包。

## 1. 合并前检查

- [ ] PR 已填写 `.github/PULL_REQUEST_TEMPLATE.md`。
- [ ] 涉及 SQLite/storage 的改动已检查 `docs/DESKTOP_STORAGE_SCHEMA.md`。
- [ ] 涉及 Tauri/Rust、Keychain、备份或 AI transport 的改动已检查 `docs/BACKEND_DEVELOPMENT_STANDARDS.md`。
- [ ] 涉及隐私、安全、诊断或日志的改动已检查对应文档。
- [ ] 涉及 UI 的改动已检查 `docs/UI_DESIGN_STANDARDS.md`，必要时更新 `docs/UI_CHANGELOG.md`。
- [ ] docs 已同步更新，尤其是 `docs/APP_EVOLUTION_LOG.md` 和 `docs/PRODUCTION_UPGRADE_PLAN.md`。

## 2. 本地质量检查

```bash
npm run build
npm run version:check
npm run release:self-test
npm run release:preflight
cd src-tauri && cargo fmt --check
cd src-tauri && cargo check
cd src-tauri && cargo test
npm run security:scan
git diff --check
```

- [ ] `npm run build` 通过。
- [ ] `npm run version:check` 通过，npm/Tauri/Cargo/lockfile 版本一致。
- [ ] `npm run release:self-test` 通过，tag/manifest/publish 状态机正负路径正常。
- [ ] `npm run release:preflight` 通过，formal dist 不包含测试入口。
- [ ] `cargo fmt --check` 通过。
- [ ] `cargo check` 通过。
- [ ] `cargo test` 通过。
- [ ] `npm run security:scan` 通过。
- [ ] 如果 QA fixtures 有变化，`npm run qa:fixtures:verify` 通过。
- [ ] `git diff --check` 通过。

## 3. CI 检查

- [ ] GitHub Actions `CI` workflow 通过。
- [ ] 若 CI 失败，先修复失败步骤，再重新跑。
- [ ] 若本地通过但 CI 失败，记录差异原因，例如 runner、缓存、依赖或系统工具差异。

## 4. Local 内测包

```bash
npm run package:mac-local
npm run release:manifest
```

- [ ] 生成 `src-tauri/target/release/bundle/macos/读伴.app`。
- [ ] 生成 `src-tauri/target/release/bundle/dmg/读伴_<version>_formal_<arch>_local.dmg`。
- [ ] 生成 `release-artifacts/duban-v<version>-formal-<arch>-local-manifest.json`。
- [ ] 生成 `release-artifacts/duban-v<version>-formal-<arch>-local-checksums.txt`。
- [ ] 明确标注 local DMG 是 ad-hoc signed、未公证，仅用于内部验证。

## 5. Signed 正式包

推荐通过 annotated tag 触发 `.github/workflows/release-macos.yml`；Environment/Secrets 步骤见 [GITHUB_RELEASE_AUTOMATION.md](./GITHUB_RELEASE_AUTOMATION.md)。本节手动命令仅作本机验证和故障恢复。

- [ ] `npm run release:check -- candidate` 在干净 `main` 通过。
- [ ] `npm run release:prepare` 后已审阅、提交并推送 Changelog。
- [ ] `npm run release:check -- tag-ready` 通过。
- [ ] 创建并推送了不可变 annotated `v<version>` tag。
- [ ] GitHub `Validate Tagged Source` job 通过。
- [ ] `macos-release` environment approval 已完成（如启用）。

```bash
npm run release:signing-preflight -- --strict
npm run package:mac-signed
npm run release:notarize
npm run release:gatekeeper
RELEASE_KIND=signed npm run release:manifest
```

- [ ] `release:signing-preflight -- --strict` 通过。
- [ ] 生成 `读伴_<version>_formal_<arch>_signed.dmg`。
- [ ] Apple notarization 通过。
- [ ] `xcrun stapler validate` 通过。
- [ ] `spctl` Gatekeeper 验证通过。
- [ ] 生成 signed manifest/checksum。
- [ ] GitHub Release 包含 DMG、manifest、checksums、notary log 和 release notes。
- [ ] Alpha/Beta/RC 被标记为 prerelease；稳定版不是 prerelease。

## 6. 手动 Smoke Test

详细场景和预期维护在 [QA_MATRIX.md](./QA_MATRIX.md)。发布候选包至少执行 P0 Smoke Test。

- [ ] 首次启动。
- [ ] 书架显示。
- [ ] 导入一本 PDF。
- [ ] 完全退出后重新打开一本文档库中已有的 PDF，确认无需重新导入、能恢复历史页码，原页与文本层正常。
- [ ] 导入一本 MOBI。
- [ ] 打开阅读器。
- [ ] 保存阅读进度。
- [ ] 保存或识别 API Key 状态。
- [ ] 发起一次 AI 请求。
- [ ] 导出备份。
- [ ] 重启后确认数据恢复。

## 7. Release Notes

````markdown
# 读伴 <version>

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

- [ ] Release notes 写明更新内容。
- [ ] Release notes 写明数据与隐私边界。
- [ ] Release notes 写明已知限制。
- [ ] Release notes 粘贴 checksum。

## 8. 发布后

- [ ] 确认下载链接可用。
- [ ] 确认 checksum 和上传 artifact 匹配。
- [ ] 如发现发布问题，记录到 `docs/APP_EVOLUTION_LOG.md`。
- [ ] 如影响用户安装或数据安全，优先发布修复说明。
