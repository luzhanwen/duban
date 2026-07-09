#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-读伴}"
VERSION="$(cd "$ROOT_DIR" && node -p "require('./package.json').version")"
ARCH="$(uname -m)"
RELEASE_CHANNEL="${RELEASE_CHANNEL:-formal}"
RELEASE_KIND="${RELEASE_KIND:-signed}"
DMG_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
TARGET_DMG="$DMG_DIR/${APP_NAME}_${VERSION}_${RELEASE_CHANNEL}_${ARCH}_${RELEASE_KIND}.dmg"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS signing must run on macOS."
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" && -z "${APPLE_CERTIFICATE:-}" ]]; then
  echo "Missing signing identity."
  echo "Set APPLE_SIGNING_IDENTITY to your Developer ID Application identity, or provide APPLE_CERTIFICATE for CI signing."
  exit 1
fi

cd "$ROOT_DIR"
npm run release:signing-preflight
npm run tauri -- build --bundles dmg --config src-tauri/tauri.formal.conf.json

mkdir -p "$DMG_DIR"
shopt -s nullglob
DMGS=("$DMG_DIR"/*.dmg)
if [[ "${#DMGS[@]}" -eq 0 ]]; then
  echo "No DMG was produced by Tauri."
  exit 1
fi
LATEST_DMG="$(ls -t "${DMGS[@]}" | head -n 1)"

if [[ "$LATEST_DMG" != "$TARGET_DMG" ]]; then
  cp "$LATEST_DMG" "$TARGET_DMG"
fi

echo "Created signed macOS DMG candidate:"
echo "$TARGET_DMG"

RELEASE_KIND="$RELEASE_KIND" npm run release:manifest
