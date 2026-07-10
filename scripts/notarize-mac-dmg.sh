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
DMG_PATH="${1:-$TARGET_RELEASE_DIR/bundle/dmg/${APP_NAME}_${VERSION}_${RELEASE_CHANNEL}_${ARCH}_${RELEASE_KIND}.dmg}"
NOTARY_LOG_PATH="${NOTARY_LOG_PATH:-$ROOT_DIR/release-artifacts/duban-v${VERSION}-${RELEASE_CHANNEL}-${ARCH}-${RELEASE_KIND}-notary-log.json}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Notarization must run on macOS."
  exit 1
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "Missing DMG: $DMG_PATH"
  echo "Run npm run package:mac-signed first, or pass a DMG path explicitly."
  exit 1
fi

AUTH_ARGS=()
if [[ -n "${NOTARYTOOL_KEYCHAIN_PROFILE:-}" ]]; then
  AUTH_ARGS=(--keychain-profile "$NOTARYTOOL_KEYCHAIN_PROFILE")
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_TEAM_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-${APPLE_PASSWORD:-}}" ]]; then
  AUTH_ARGS=(--apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "${APPLE_APP_SPECIFIC_PASSWORD:-$APPLE_PASSWORD}")
elif [[ -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER_ID:-}" && -n "${APPLE_API_PRIVATE_KEY_PATH:-}" ]]; then
  AUTH_ARGS=(--key "$APPLE_API_PRIVATE_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER_ID")
else
  echo "Missing notarization credentials."
  echo "Use NOTARYTOOL_KEYCHAIN_PROFILE, Apple ID + app-specific password, or App Store Connect API key env vars."
  exit 1
fi

mkdir -p "$(dirname "$NOTARY_LOG_PATH")"
xcrun notarytool submit "$DMG_PATH" --wait --output-format json "${AUTH_ARGS[@]}" > "$NOTARY_LOG_PATH"
cat "$NOTARY_LOG_PATH"
NOTARY_STATUS="$(node -e 'const fs=require("fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(value.status||""));' "$NOTARY_LOG_PATH")"
if [[ "$NOTARY_STATUS" != "Accepted" ]]; then
  echo "Apple notarization did not return Accepted: ${NOTARY_STATUS:-unknown}"
  exit 1
fi
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
spctl --assess --type open --context context:primary-signature --verbose "$DMG_PATH"

cd "$ROOT_DIR"
RELEASE_ARCH="$ARCH" TAURI_BUILD_TARGET="$TAURI_BUILD_TARGET" RELEASE_KIND="$RELEASE_KIND" npm run release:manifest

echo "Notarized and stapled DMG:"
echo "$DMG_PATH"
echo "Notarization log:"
echo "$NOTARY_LOG_PATH"
