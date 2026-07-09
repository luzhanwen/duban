#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-读伴}"
VERSION="$(cd "$ROOT_DIR" && node -p "require('./package.json').version")"
ARCH="$(uname -m)"
RELEASE_CHANNEL="${RELEASE_CHANNEL:-formal}"
RELEASE_KIND="${RELEASE_KIND:-signed}"
APP_PATH="${APP_PATH:-$ROOT_DIR/src-tauri/target/release/bundle/macos/$APP_NAME.app}"
DMG_PATH="${1:-$ROOT_DIR/src-tauri/target/release/bundle/dmg/${APP_NAME}_${VERSION}_${RELEASE_CHANNEL}_${ARCH}_${RELEASE_KIND}.dmg}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Gatekeeper verification must run on macOS."
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "Missing app bundle: $APP_PATH"
  exit 1
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "Missing DMG: $DMG_PATH"
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign --display --verbose=4 "$APP_PATH"
xcrun stapler validate "$DMG_PATH"
spctl --assess --type execute --verbose "$APP_PATH"
spctl --assess --type open --context context:primary-signature --verbose "$DMG_PATH"

echo "macOS release verification passed:"
echo "$APP_PATH"
echo "$DMG_PATH"
