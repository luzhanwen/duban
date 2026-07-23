import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const env = { ...process.env };
let usesAdHocSignature = false;

if (process.platform === "darwin" && !env.APPLE_SIGNING_IDENTITY) {
  const identityResult = spawnSync(
    "/usr/bin/security",
    ["find-identity", "-v", "-p", "codesigning"],
    { encoding: "utf8" }
  );
  const identity = identityResult.stdout?.match(/"([^"]*Developer ID Application:[^"]*)"/)?.[1];

  if (identity) {
    env.APPLE_SIGNING_IDENTITY = identity;
    console.log(`Using stable macOS signing identity for Test.app: ${identity}`);
  } else {
    usesAdHocSignature = true;
    console.warn(
      "No Developer ID Application identity found; Test.app will use a complete ad-hoc signature. " +
        "Rebuilt apps may need the API Key to be saved again."
    );
  }
}

const result = spawnSync(
  process.execPath,
  [
    "node_modules/@tauri-apps/cli/tauri.js",
    "build",
    "--bundles",
    "app",
    "--config",
    "src-tauri/tauri.test.conf.json",
  ],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

if (process.platform === "darwin" && usesAdHocSignature) {
  const appPath = resolve(
    "src-tauri/target/release/bundle/macos/读伴 Test.app"
  );
  const signResult = spawnSync(
    "/usr/bin/codesign",
    ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath],
    { stdio: "inherit" }
  );
  if ((signResult.status ?? 1) !== 0) {
    process.exit(signResult.status ?? 1);
  }

  const verifyResult = spawnSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    { stdio: "inherit" }
  );
  if ((verifyResult.status ?? 1) !== 0) {
    process.exit(verifyResult.status ?? 1);
  }
}

process.exit(0);
