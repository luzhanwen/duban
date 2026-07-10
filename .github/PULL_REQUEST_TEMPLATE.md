## Summary

-

## Scope

- [ ] Frontend/UI
- [ ] Tauri/Rust backend
- [ ] SQLite/storage/schema
- [ ] AI transport/prompt
- [ ] Backup/import/export
- [ ] Security/privacy
- [ ] Release/CI/docs

## Validation

- [ ] `npm run build`
- [ ] `npm run release:preflight`
- [ ] `npm run release:self-test`
- [ ] `cd src-tauri && cargo fmt --check`
- [ ] `cd src-tauri && cargo check`
- [ ] `cd src-tauri && cargo test`
- [ ] `npm run security:scan`
- [ ] Manual desktop smoke test, if user-facing behavior changed

## Data, Privacy, And Release Safety

- [ ] No API keys, prompts, book text, notes, chat content, absolute local paths, or diagnostic raw payloads are added to logs, backups, errors, or screenshots.
- [ ] If SQLite schema or stored data changed, `docs/DESKTOP_STORAGE_SCHEMA.md` and migration/backup behavior were reviewed.
- [ ] If Keychain, backup, AI transport, diagnostics, or Tauri command behavior changed, `docs/BACKEND_DEVELOPMENT_STANDARDS.md` was reviewed.
- [ ] If release/package behavior changed, `docs/RELEASE_PROCESS.md` or `docs/RELEASE_CHECKLIST.md` was updated.
- [ ] If UI changed, `docs/UI_DESIGN_STANDARDS.md` was checked and `docs/UI_CHANGELOG.md` was updated when appropriate.

## Notes

-
