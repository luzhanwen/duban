import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, "qa-fixtures");
const versions = readStorageVersions();

writeText(
  "qa-fixtures/books/duban-qa-two-page.pdf",
  buildPdf([
    ["Duban QA PDF Fixture", "Synthetic public test file.", "Page 1 of 2."],
    ["Second Page", "Use this file for import and reader smoke tests.", "No copyrighted book text is included."],
  ])
);

writeText(
  "qa-fixtures/books/duban-qa-corrupt.pdf",
  "%PDF-1.4\nThis fixture is intentionally corrupt and should not import as a readable PDF.\n"
);

writeText(
  "qa-fixtures/books/duban-qa-mini-book.html",
  [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    "  <title>Duban QA Mini Book</title>",
    "</head>",
    "<body>",
    "  <h1>Duban QA Mini Book</h1>",
    "  <h2>Chapter One</h2>",
    "  <p>This synthetic source text is safe to commit.</p>",
    "  <h2>Chapter Two</h2>",
    "  <p>Use it as source material if a future tool generates a valid MOBI fixture.</p>",
    "</body>",
    "</html>",
    "",
  ].join("\n")
);

writeBackupFixture("qa-fixtures/backups/duban-backup-empty-v3/manifest.json", {
  label: "QA Empty Backup Fixture",
  notes: "Preview-only empty backup fixture. Merge import is a no-op; replace import clears current data.",
  items: [],
  files: [],
});

const tamperedBackup = buildBackup({
  label: "QA Tampered Backup Fixture",
  notes: "This manifest has an intentionally wrong manifestSha256 and should produce a validation issue.",
  items: [],
  files: [],
});
tamperedBackup.manifestSha256 = "0".repeat(64);
writeText(
  "qa-fixtures/backups/duban-backup-tampered-v3/manifest.json",
  `${JSON.stringify(tamperedBackup, null, 2)}\n`
);

const fixtureEntries = [
  fileEntry("books/duban-qa-two-page.pdf", {
    id: "pdf-valid-two-page",
    kind: "book",
    format: "pdf",
    purpose: ["SMK-003", "SMK-005", "RD-001"],
    expected: "Imports as a small two-page PDF and opens in the reader.",
    license: "Synthetic fixture created for this repository.",
  }),
  fileEntry("books/duban-qa-corrupt.pdf", {
    id: "pdf-corrupt-negative",
    kind: "book-negative",
    format: "pdf",
    purpose: ["LIB-003"],
    expected: "Import fails with a friendly error and no stored book remains.",
    license: "Synthetic fixture created for this repository.",
  }),
  fileEntry("books/duban-qa-mini-book.html", {
    id: "mobi-source-html",
    kind: "source",
    format: "html",
    purpose: ["SMK-004-source"],
    expected: "Source text only. Not an importable MOBI fixture.",
    license: "Synthetic fixture created for this repository.",
  }),
  fileEntry("backups/duban-backup-empty-v3/manifest.json", {
    id: "backup-empty-v3",
    kind: "backup",
    format: "duban.local-backup",
    purpose: ["BK-002", "BK-003", "UPG-004-preview"],
    expected: "Previews without validation errors. Merge import is a no-op; replace import clears data.",
    license: "Synthetic fixture created for this repository.",
  }),
  fileEntry("backups/duban-backup-tampered-v3/manifest.json", {
    id: "backup-tampered-v3",
    kind: "backup-negative",
    format: "duban.local-backup",
    purpose: ["BK-003", "UPG-005"],
    expected: "Preview reports a manifest hash validation issue.",
    license: "Synthetic fixture created for this repository.",
  }),
];

writeText(
  "qa-fixtures/fixtures.json",
  `${JSON.stringify(
    {
      format: "duban.qa-fixtures",
      generatedBy: "npm run qa:fixtures",
      schemaVersion: versions.schemaVersion,
      backupVersion: versions.backupVersion,
      fixtures: fixtureEntries,
      policy: {
        copyrightedBookFiles:
          "Do not commit copyrighted PDF/MOBI files. Use public-domain, open-license, self-authored, or synthetic fixtures only.",
        privateData:
          "Do not include API keys, private notes, chat transcripts, prompts, absolute local paths, or user book text.",
      },
    },
    null,
    2
  )}\n`
);

console.log("Generated QA fixtures:");
for (const entry of fixtureEntries) {
  console.log(`- ${entry.path} (${entry.sha256.slice(0, 12)}...)`);
}

function writeBackupFixture(relativePath, options) {
  const backup = buildBackup(options);
  backup.manifestSha256 = sha256Text(JSON.stringify({ ...backup, manifestSha256: null }));
  writeText(relativePath, `${JSON.stringify(backup, null, 2)}\n`);
}

function buildBackup({ label, notes, items, files }) {
  return {
    format: "duban.local-backup",
    backupVersion: Number(versions.backupVersion),
    schemaVersion: versions.schemaVersion,
    exportedAt: "2026-07-09T00:00:00.000Z",
    app: "Duban QA Fixture",
    label,
    notes,
    manifestSha256: null,
    includesApiKeys: false,
    items,
    files,
  };
}

function buildPdf(pages) {
  const objects = [
    "not-used",
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${
      pages.length
    } >>`,
  ];
  const fontObjectId = 3 + pages.length * 2;

  for (let index = 0; index < pages.length; index += 1) {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = { stream: pageContent(pages[index]) };
  }

  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, "utf8");
    output += serializePdfObject(id, objects[id]);
  }

  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length}\n`;
  output += "0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return output;
}

function pageContent(lines) {
  const escaped = lines.map((line) => `(${escapePdfText(line)}) Tj`);
  return [
    "BT",
    "/F1 24 Tf",
    "72 720 Td",
    escaped[0],
    "/F1 12 Tf",
    "0 -36 Td",
    escaped[1],
    "0 -24 Td",
    escaped[2],
    "ET",
  ].join("\n");
}

function serializePdfObject(id, object) {
  if (typeof object === "string") {
    return `${id} 0 obj\n${object}\nendobj\n`;
  }
  const length = Buffer.byteLength(object.stream, "utf8");
  return `${id} 0 obj\n<< /Length ${length} >>\nstream\n${object.stream}\nendstream\nendobj\n`;
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function fileEntry(relativePath, metadata) {
  const absolutePath = path.join(fixtureRoot, relativePath);
  const bytes = readFileSync(absolutePath);
  return {
    ...metadata,
    path: `qa-fixtures/${relativePath}`,
    byteSize: statSync(absolutePath).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function writeText(relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readStorageVersions() {
  const source = readFileSync(path.join(root, "src-tauri/src/storage.rs"), "utf8");
  const schemaVersion = source.match(/const CURRENT_SCHEMA_VERSION: &str = "(\d+)";/)?.[1];
  const backupVersion = source.match(/const BACKUP_VERSION: u32 = (\d+);/)?.[1];
  if (!schemaVersion || !backupVersion) {
    throw new Error("Unable to read storage schema or backup version from src-tauri/src/storage.rs");
  }
  return { schemaVersion, backupVersion };
}
