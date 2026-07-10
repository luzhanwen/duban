#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-读伴}"
VERSION="$(cd "$ROOT_DIR" && node -p "require('./package.json').version")"
ARCH="$(uname -m)"
ARCH="${RELEASE_ARCH:-$ARCH}"
RELEASE_CHANNEL="${RELEASE_CHANNEL:-formal}"
RELEASE_KIND="${RELEASE_KIND:-signed}"
TAURI_BUILD_TARGET="${TAURI_BUILD_TARGET:-}"
if [[ -n "$TAURI_BUILD_TARGET" ]]; then
  TARGET_RELEASE_DIR="$ROOT_DIR/src-tauri/target/$TAURI_BUILD_TARGET/release"
else
  TARGET_RELEASE_DIR="$ROOT_DIR/src-tauri/target/release"
fi
DMG_DIR="$TARGET_RELEASE_DIR/bundle/dmg"
APP_PATH="$TARGET_RELEASE_DIR/bundle/macos/$APP_NAME.app"
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
npm run release:check
npm run release:signing-preflight -- --strict --signing-only
BUILD_ARGS=(build --bundles app,dmg --config src-tauri/tauri.formal.conf.json)
if [[ -n "$TAURI_BUILD_TARGET" ]]; then
  BUILD_ARGS+=(--target "$TAURI_BUILD_TARGET")
fi
npm run tauri -- "${BUILD_ARGS[@]}"

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

if [[ ! -d "$APP_PATH" ]]; then
  echo "No app bundle was preserved by Tauri: $APP_PATH"
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign --verify --strict --verbose=2 "$TARGET_DMG"

echo "Created signed macOS DMG candidate:"
echo "$TARGET_DMG"

RELEASE_ARCH="$ARCH" TAURI_BUILD_TARGET="$TAURI_BUILD_TARGET" RELEASE_KIND="$RELEASE_KIND" npm run release:manifest
