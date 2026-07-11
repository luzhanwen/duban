import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const issues = [];

const excludedDirectories = new Set([
  ".git",
  "dist",
  "node_modules",
  "src-tauri/gen",
  "src-tauri/target",
]);

const textExtensions = new Set([
  ".cjs",
  ".conf",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".rs",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const secretPatterns = [
  {
    name: "Anthropic/OpenAI-style API key",
    regex: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    name: "Google API key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: "Slack token",
    regex: /\bxox[baprs]-[0-9A-Za-z-]{24,}\b/g,
  },
  {
    name: "Tauri updater private key",
    regex: /untrusted comment: minisign encrypted secret key\s*\n[A-Za-z0-9+/=]{80,}/g,
  },
];

scanForSecrets();
validateTauriSecurityConfig();
validateCapabilityScope();
validateWebSecurityHeaders();
validateBackupSecretRedaction();

if (issues.length > 0) {
  console.error("Security scan failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Security scan passed.");

function scanForSecrets() {
  for (const filePath of walk(root)) {
    const extension = path.extname(filePath);
    if (!textExtensions.has(extension)) {
      continue;
    }
    const relativePath = path.relative(root, filePath);
    const content = readFileSync(filePath, "utf8");
    for (const pattern of secretPatterns) {
      const matches = content.matchAll(pattern.regex);
      for (const match of matches) {
        const token = match[0];
        if (isAllowedExampleSecret(token)) {
          continue;
        }
        issues.push(`${relativePath}: possible ${pattern.name} committed (${mask(token)})`);
      }
    }
  }
}

function validateTauriSecurityConfig() {
  const config = readJson("src-tauri/tauri.conf.json");
  const security = config?.app?.security;
  if (!security) {
    issues.push("src-tauri/tauri.conf.json: missing app.security");
    return;
  }

  const csp = security.csp;
  if (typeof csp !== "string" || csp.trim().length === 0) {
    issues.push("src-tauri/tauri.conf.json: production CSP must be non-empty");
  } else {
    for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"]) {
      if (!csp.includes(directive)) {
        issues.push(`src-tauri/tauri.conf.json: production CSP missing ${directive}`);
      }
    }
    if (csp.includes("http://localhost:*") || csp.includes("'unsafe-eval'")) {
      issues.push("src-tauri/tauri.conf.json: production CSP contains development-only sources");
    }
  }

  const devCsp = security.devCsp;
  if (typeof devCsp !== "string" || !devCsp.includes("ws://localhost:5173")) {
    issues.push("src-tauri/tauri.conf.json: devCsp should explicitly allow Vite HMR");
  }

  const assetScope = security.assetProtocol?.scope ?? [];
  if (!Array.isArray(assetScope) || assetScope.length !== 1 || assetScope[0] !== "$APPDATA/files/**") {
    issues.push("src-tauri/tauri.conf.json: asset protocol scope must stay limited to $APPDATA/files/**");
  }

  const headers = security.headers ?? {};
  if (headers["X-Content-Type-Options"] !== "nosniff") {
    issues.push("src-tauri/tauri.conf.json: missing X-Content-Type-Options nosniff");
  }
  if (typeof headers["Permissions-Policy"] !== "string" || !headers["Permissions-Policy"].includes("microphone=()")) {
    issues.push("src-tauri/tauri.conf.json: missing restrictive Permissions-Policy");
  }
}

function validateCapabilityScope() {
  const capability = readJson("src-tauri/capabilities/default.json");
  const permissions = capability?.permissions ?? [];
  if (!Array.isArray(permissions)) {
    issues.push("src-tauri/capabilities/default.json: permissions must be an array");
    return;
  }
  const blocked = permissions.filter((permission) => {
    if (typeof permission !== "string") {
      return false;
    }
    if (/^(fs|shell|http):/.test(permission) || permission.includes("shell")) {
      return true;
    }
    return ["process:default", "process:allow-exit"].includes(permission);
  });
  if (blocked.length > 0) {
    issues.push(`src-tauri/capabilities/default.json: broad permissions found (${blocked.join(", ")})`);
  }

  const requiredUpdaterPermissions = ["updater:default", "process:allow-restart"];
  for (const permission of requiredUpdaterPermissions) {
    if (!permissions.includes(permission)) {
      issues.push(`src-tauri/capabilities/default.json: missing updater permission (${permission})`);
    }
  }

  const openerPermission = permissions.find(
    (permission) => permission?.identifier === "opener:allow-open-url"
  );
  const openerUrls = openerPermission?.allow?.map((entry) => entry?.url).filter(Boolean) ?? [];
  if (
    openerUrls.length !== 1 ||
    openerUrls[0] !== "https://github.com/luzhanwen/duban/releases*"
  ) {
    issues.push("src-tauri/capabilities/default.json: opener scope must stay limited to Duban GitHub Releases");
  }
}

function validateWebSecurityHeaders() {
  const headersPath = path.join(root, "public/_headers");
  if (!existsSync(headersPath)) {
    issues.push("public/_headers: missing static hosting security headers");
    return;
  }
  const content = readFileSync(headersPath, "utf8");
  for (const expected of [
    "Content-Security-Policy:",
    "Referrer-Policy: no-referrer",
    "X-Content-Type-Options: nosniff",
    "Permissions-Policy:",
    "frame-ancestors 'none'",
  ]) {
    if (!content.includes(expected)) {
      issues.push(`public/_headers: missing ${expected}`);
    }
  }
}

function validateBackupSecretRedaction() {
  const storageSource = readFileSync(path.join(root, "src-tauri/src/storage.rs"), "utf8");
  for (const expected of [
    "strip_settings_secrets",
    "strip_settings_key_status",
    "includes_api_keys: false",
    "remove_path(value, &[\"anthropic\", \"apiKey\"])",
    "remove_path(value, &[\"openaiCompatible\", \"apiKey\"])",
  ]) {
    if (!storageSource.includes(expected)) {
      issues.push(`src-tauri/src/storage.rs: backup secret redaction anchor missing (${expected})`);
    }
  }
}

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const relativePath = path.relative(root, absolutePath);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      if (isExcludedDirectory(relativePath)) {
        continue;
      }
      yield* walk(absolutePath);
      continue;
    }
    if (stat.isFile() && stat.size <= 2_000_000) {
      yield absolutePath;
    }
  }
}

function isExcludedDirectory(relativePath) {
  return [...excludedDirectories].some(
    (directory) => relativePath === directory || relativePath.startsWith(`${directory}${path.sep}`)
  );
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function isAllowedExampleSecret(token) {
  return /example|placeholder|test/i.test(token) || token.includes("...");
}

function mask(value) {
  if (value.length <= 12) {
    return "***";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
