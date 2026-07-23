#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-读伴}"
ARTIFACT_NAME="${ARTIFACT_NAME:-Duban}"
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
TARGET_DMG="$DMG_DIR/${ARTIFACT_NAME}_${VERSION}_${RELEASE_CHANNEL}_${ARCH}_${RELEASE_KIND}.dmg"
TARGET_UPDATE_ARCHIVE="$TARGET_RELEASE_DIR/bundle/macos/${ARTIFACT_NAME}_${VERSION}_${RELEASE_CHANNEL}_${ARCH}_${RELEASE_KIND}.app.tar.gz"
TARGET_UPDATE_SIGNATURE="${TARGET_UPDATE_ARCHIVE}.sig"
UPDATER_KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/duban-updater.key}"
UPDATER_PASSWORD_SERVICE="${TAURI_SIGNING_PASSWORD_SERVICE:-com.duban.reader.updater-signing}"
UPDATER_PASSWORD_ACCOUNT="${TAURI_SIGNING_PASSWORD_ACCOUNT:-$USER}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS signing must run on macOS."
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" && -z "${APPLE_CERTIFICATE:-}" ]]; then
  echo "Missing signing identity."
  echo "Set APPLE_SIGNING_IDENTITY to your Developer ID Application identity, or provide APPLE_CERTIFICATE for CI signing."
  exit 1
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -f "$UPDATER_KEY_PATH" ]]; then
  TAURI_SIGNING_PRIVATE_KEY="$(<"$UPDATER_KEY_PATH")"
  export TAURI_SIGNING_PRIVATE_KEY
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]]; then
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(
    security find-generic-password \
      -a "$UPDATER_PASSWORD_ACCOUNT" \
      -s "$UPDATER_PASSWORD_SERVICE" \
      -w 2>/dev/null || true
  )"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" || -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]]; then
  echo "Missing updater signing credentials."
  echo "Private key path: $UPDATER_KEY_PATH"
  echo "Store the password in Keychain service $UPDATER_PASSWORD_SERVICE, or set the two Tauri signing environment variables."
  exit 1
fi

cd "$ROOT_DIR"
npm run release:check
npm run release:signing-preflight -- --strict --signing-only
BUILD_ARGS=(build --bundles app,dmg --config src-tauri/tauri.release.conf.json)
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

shopt -s nullglob
UPDATE_ARCHIVES=("$TARGET_RELEASE_DIR/bundle/macos"/*.app.tar.gz)
if [[ "${#UPDATE_ARCHIVES[@]}" -eq 0 ]]; then
  echo "No updater archive was produced by Tauri."
  exit 1
fi
LATEST_UPDATE_ARCHIVE="$(ls -t "${UPDATE_ARCHIVES[@]}" | head -n 1)"
if [[ ! -f "${LATEST_UPDATE_ARCHIVE}.sig" ]]; then
  echo "No updater signature was produced for: $LATEST_UPDATE_ARCHIVE"
  exit 1
fi
if [[ "$LATEST_UPDATE_ARCHIVE" != "$TARGET_UPDATE_ARCHIVE" ]]; then
  cp "$LATEST_UPDATE_ARCHIVE" "$TARGET_UPDATE_ARCHIVE"
  cp "${LATEST_UPDATE_ARCHIVE}.sig" "$TARGET_UPDATE_SIGNATURE"
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign --verify --strict --verbose=2 "$TARGET_DMG"

echo "Created signed macOS DMG candidate:"
echo "$TARGET_DMG"
echo "Created signed updater artifacts:"
echo "$TARGET_UPDATE_ARCHIVE"
echo "$TARGET_UPDATE_SIGNATURE"

RELEASE_ARCH="$ARCH" TAURI_BUILD_TARGET="$TAURI_BUILD_TARGET" RELEASE_KIND="$RELEASE_KIND" npm run release:manifest
