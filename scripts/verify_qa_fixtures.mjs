import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const root = process.cwd();
const manifestPath = path.join(root, "qa-fixtures/fixtures.json");
const issues = [];

if (!existsSync(manifestPath)) {
  fail("Missing qa-fixtures/fixtures.json. Run npm run qa:fixtures first.");
}

const manifest = readJson(manifestPath);
expect(manifest.format === "duban.qa-fixtures", "fixtures.json has unexpected format");
expect(Array.isArray(manifest.fixtures), "fixtures.json must contain fixtures array");

for (const fixture of manifest.fixtures || []) {
  const absolutePath = path.join(root, fixture.path || "");
  expect(existsSync(absolutePath), `missing fixture file: ${fixture.path}`);
  if (!existsSync(absolutePath)) continue;

  const bytes = readFileSync(absolutePath);
  expect(statSync(absolutePath).size === fixture.byteSize, `byteSize mismatch for ${fixture.path}`);
  expect(sha256(bytes) === fixture.sha256, `sha256 mismatch for ${fixture.path}`);
}

await verifyPdf("qa-fixtures/books/duban-qa-two-page.pdf", 2);
await verifyCorruptPdf("qa-fixtures/books/duban-qa-corrupt.pdf");
verifyBackupManifest("qa-fixtures/backups/duban-backup-empty-v3/manifest.json", true);
verifyBackupManifest("qa-fixtures/backups/duban-backup-tampered-v3/manifest.json", false);

if (issues.length) {
  console.error("QA fixture verification failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("QA fixtures verified.");

async function verifyPdf(relativePath, expectedPages) {
  const data = new Uint8Array(readFileSync(path.join(root, relativePath)));
  const doc = await pdfjs.getDocument({ data, disableWorker: true, verbosity: pdfjs.VerbosityLevel.ERRORS }).promise;
  expect(doc.numPages === expectedPages, `${relativePath} expected ${expectedPages} pages, got ${doc.numPages}`);
}

async function verifyCorruptPdf(relativePath) {
  try {
    const data = new Uint8Array(readFileSync(path.join(root, relativePath)));
    await pdfjs.getDocument({ data, disableWorker: true, verbosity: pdfjs.VerbosityLevel.ERRORS }).promise;
    issues.push(`${relativePath} should fail PDF parsing`);
  } catch {
    // Expected.
  }
}

function verifyBackupManifest(relativePath, shouldMatch) {
  const backup = readJson(path.join(root, relativePath));
  const expected = backup.manifestSha256;
  const normalized = { ...backup, manifestSha256: null };
  const actual = sha256(JSON.stringify(normalized));
  if (shouldMatch) {
    expect(expected === actual, `${relativePath} manifestSha256 should match normalized manifest`);
  } else {
    expect(expected !== actual, `${relativePath} manifestSha256 should be intentionally invalid`);
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function expect(condition, message) {
  if (!condition) issues.push(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
