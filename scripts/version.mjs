import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const command = process.argv[2] || "check";
const argument = process.argv[3];
const prereleaseId = process.argv[4] || "alpha";

try {
  if (command === "check") {
    checkVersions();
  } else if (command === "set") {
    setVersion(argument);
  } else if (command === "bump") {
    setVersion(bumpVersion(readState().packageVersion, argument, prereleaseId));
  } else {
    failUsage(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}

function checkVersions() {
  const state = readState();
  const issues = [];

  if (!isValidSemver(state.packageVersion)) {
    issues.push(`package.json version is not valid SemVer: ${state.packageVersion}`);
  }
  const derived = derivePlatformVersions(state.packageVersion);
  compare(issues, "package-lock.json", state.packageLockVersion, state.packageVersion);
  compare(issues, "package-lock.json packages['']", state.packageLockRootVersion, state.packageVersion);
  compare(issues, "src-tauri/Cargo.toml", state.cargoVersion, state.packageVersion);
  compare(issues, "src-tauri/Cargo.lock duban package", state.cargoLockVersion, state.packageVersion);
  compare(issues, "src-tauri/tauri.conf.json", state.tauriVersion, derived.tauriVersion);
  compare(
    issues,
    "src-tauri/tauri.conf.json bundle.macOS.bundleVersion",
    state.macosBundleVersion,
    derived.macosBundleVersion
  );

  if (issues.length) {
    throw new Error(`Version check failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  }

  console.log(`Version check passed: ${state.packageVersion}`);
  return state.packageVersion;
}

function setVersion(version) {
  if (!version) failUsage("Missing target version.");
  if (!isValidSemver(version)) throw new Error(`Invalid SemVer version: ${version}`);
  const derived = derivePlatformVersions(version);

  updateJson("package.json", (value) => {
    value.version = version;
  });
  updateJson("package-lock.json", (value) => {
    value.version = version;
    if (!value.packages?.[""]) throw new Error("package-lock.json is missing packages['']");
    value.packages[""].version = version;
  });
  updateJson("src-tauri/tauri.conf.json", (value) => {
    value.version = derived.tauriVersion;
    value.bundle ||= {};
    value.bundle.macOS ||= {};
    value.bundle.macOS.bundleVersion = derived.macosBundleVersion;
  });
  updateCargoToml(version);
  updateCargoLock(version);
  updateChangelogTarget(version);

  checkVersions();
  console.log(`Version set to ${version}. No Git tag was created.`);
}

function bumpVersion(current, kind, id) {
  const parsed = parseSemver(current);
  if (!parsed) throw new Error(`Cannot bump invalid current version: ${current}`);
  if (!/^[0-9A-Za-z-]+$/.test(id)) throw new Error(`Invalid prerelease identifier: ${id}`);

  let { major, minor, patch, prerelease } = parsed;
  if (kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
    prerelease = "";
  } else if (kind === "minor") {
    minor += 1;
    patch = 0;
    prerelease = "";
  } else if (kind === "patch") {
    patch += 1;
    prerelease = "";
  } else if (kind === "premajor" || kind === "preminor" || kind === "prepatch") {
    if (kind === "premajor") {
      major += 1;
      minor = 0;
      patch = 0;
    } else if (kind === "preminor") {
      minor += 1;
      patch = 0;
    } else {
      patch += 1;
    }
    prerelease = `${id}.1`;
  } else if (kind === "prerelease") {
    if (!prerelease) {
      patch += 1;
      prerelease = `${id}.1`;
    } else {
      const identifiers = prerelease.split(".");
      const last = identifiers.at(-1);
      if (/^(0|[1-9]\d*)$/.test(last)) {
        identifiers[identifiers.length - 1] = String(Number(last) + 1);
      } else {
        identifiers.push("1");
      }
      prerelease = identifiers.join(".");
    }
  } else {
    failUsage(`Unsupported bump kind: ${kind || "(missing)"}`);
  }

  return `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ""}`;
}

function readState() {
  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  const tauriConfig = readJson("src-tauri/tauri.conf.json");
  const cargoToml = readText("src-tauri/Cargo.toml");
  const cargoLock = readText("src-tauri/Cargo.lock");

  return {
    packageVersion: packageJson.version,
    packageLockVersion: packageLock.version,
    packageLockRootVersion: packageLock.packages?.[""]?.version,
    tauriVersion: tauriConfig.version,
    macosBundleVersion: tauriConfig.bundle?.macOS?.bundleVersion,
    cargoVersion: cargoPackageVersion(cargoToml, "src-tauri/Cargo.toml"),
    cargoLockVersion: cargoLockPackageVersion(cargoLock),
  };
}

function updateJson(relativePath, mutate) {
  const value = readJson(relativePath);
  mutate(value);
  writeFileSync(resolve(relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function updateCargoToml(version) {
  const relativePath = "src-tauri/Cargo.toml";
  const lines = readText(relativePath).split("\n");
  let inPackage = false;
  let updated = false;

  for (let index = 0; index < lines.length; index += 1) {
    const section = lines[index].match(/^\[([^\]]+)]\s*$/)?.[1];
    if (section) {
      inPackage = section === "package";
      continue;
    }
    if (inPackage && /^version\s*=/.test(lines[index])) {
      lines[index] = `version = "${version}"`;
      updated = true;
      break;
    }
  }

  if (!updated) throw new Error(`${relativePath} is missing [package].version`);
  writeFileSync(resolve(relativePath), lines.join("\n"));
}

function updateCargoLock(version) {
  const relativePath = "src-tauri/Cargo.lock";
  const text = readText(relativePath);
  const pattern = /(\[\[package]]\nname = "duban"\nversion = ")[^"]+("\n)/;
  if (!pattern.test(text)) throw new Error(`${relativePath} is missing the duban package block`);
  writeFileSync(resolve(relativePath), text.replace(pattern, `$1${version}$2`));
}

function updateChangelogTarget(version) {
  const relativePath = "CHANGELOG.md";
  const text = readText(relativePath);
  const unreleased = text.match(/^## \[Unreleased]\s*$/m);
  if (!unreleased || unreleased.index === undefined) {
    throw new Error(`${relativePath} is missing [Unreleased]`);
  }
  const bodyStart = unreleased.index + unreleased[0].length;
  const nextHeadingOffset = text.slice(bodyStart).search(/^## \[/m);
  const end = nextHeadingOffset < 0 ? text.length : bodyStart + nextHeadingOffset;
  const body = text.slice(bodyStart, end);
  const targetLine = `目标版本：\`${version}\``;
  const nextBody = /^目标版本：.*$/m.test(body)
    ? body.replace(/^目标版本：.*$/m, targetLine)
    : `\n\n${targetLine}${body}`;
  writeFileSync(resolve(relativePath), text.slice(0, bodyStart) + nextBody + text.slice(end));
}

function cargoPackageVersion(text, label) {
  let inPackage = false;
  for (const line of text.split("\n")) {
    const section = line.match(/^\[([^\]]+)]\s*$/)?.[1];
    if (section) {
      inPackage = section === "package";
      continue;
    }
    if (inPackage) {
      const version = line.match(/^version\s*=\s*"([^"]+)"/)?.[1];
      if (version) return version;
    }
  }
  throw new Error(`${label} is missing [package].version`);
}

function cargoLockPackageVersion(text) {
  const block = text
    .split(/(?=^\[\[package]]\s*$)/m)
    .find((candidate) => /^name = "duban"\s*$/m.test(candidate));
  const version = block?.match(/^version = "([^"]+)"\s*$/m)?.[1];
  if (!version) throw new Error("src-tauri/Cargo.lock is missing the duban package version");
  return version;
}

function parseSemver(version) {
  const match = version?.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );
  if (!match) return null;
  const prerelease = match[4] || "";
  if (prerelease.split(".").some((part) => /^\d+$/.test(part) && !/^(0|[1-9]\d*)$/.test(part))) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

function derivePlatformVersions(version) {
  const parsed = parseSemver(version);
  if (!parsed) throw new Error(`Cannot derive platform versions from invalid SemVer: ${version}`);

  const tauriVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  let buildOffset = 900;
  if (parsed.prerelease) {
    const match = parsed.prerelease.match(/^(alpha|beta|rc)\.([1-9]\d?)$/);
    if (!match) {
      throw new Error(
        `macOS prerelease must be alpha.N, beta.N, or rc.N with N between 1 and 99: ${parsed.prerelease}`
      );
    }
    const stageOffset = { alpha: 100, beta: 300, rc: 500 }[match[1]];
    buildOffset = stageOffset + Number(match[2]);
  }

  return {
    tauriVersion,
    macosBundleVersion: `${parsed.major}.${parsed.minor}.${parsed.patch * 1000 + buildOffset}`,
  };
}

function isValidSemver(version) {
  return Boolean(parseSemver(version));
}

function compare(issues, label, actual, expected) {
  if (actual !== expected) issues.push(`${label} version ${actual || "(missing)"} does not match ${expected}`);
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(resolve(relativePath), "utf8");
}

function resolve(relativePath) {
  return path.join(root, relativePath);
}

function failUsage(message) {
  throw new Error(
    `${message}\nUsage:\n  node scripts/version.mjs check\n  node scripts/version.mjs set <semver>\n  node scripts/version.mjs bump <major|minor|patch|premajor|preminor|prepatch|prerelease> [id]`
  );
}
