#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-读伴}"
VERSION="$(cd "$ROOT_DIR" && node -p "require('./package.json').version")"
ARCH="$(uname -m)"

APP_PATH="${APP_PATH:-$ROOT_DIR/src-tauri/target/release/bundle/macos/$APP_NAME.app}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/src-tauri/target/release/bundle/dmg}"
DMG_PATH="${DMG_PATH:-$OUT_DIR/${APP_NAME}_${VERSION}_${ARCH}_local.dmg}"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/duban-dmg.XXXXXX")"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Missing app bundle: $APP_PATH"
  echo "Run npm run tauri:build first."
  exit 1
fi

mkdir -p "$OUT_DIR"

# Local test builds are ad-hoc signed so macOS sees a complete app bundle.
xattr -cr "$APP_PATH"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

ditto "$APP_PATH" "$STAGING_DIR/$APP_NAME.app"
ln -s /Applications "$STAGING_DIR/Applications"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo "Created local macOS DMG:"
echo "$DMG_PATH"
