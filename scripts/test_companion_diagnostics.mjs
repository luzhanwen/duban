import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCompanionDiagnosticContext,
  normalizeCompanionDiagnosticContext,
} from "../src/lib/companionDiagnostics.js";
import { buildAiDiagnosticEntry, normalizeAiDiagnostics } from "../src/lib/aiDiagnostics.js";
import { buildDiagnosticEntryDetails } from "../src/lib/diagnostics.js";

const secret = "DUBAN_P7_DIAGNOSTIC_TEST_SECRET";
const context = buildCompanionDiagnosticContext({
  scene: "readingChat",
  policy: {
    spoiler: "avoid",
    answerDepth: "balanced",
    followUp: "helpful",
    knowledgeBoundary: "text_first",
    privateInstruction: secret,
  },
  trace: {
    cache: { hit: false, kind: "context-lru" },
    sourceRefs: [
      {
        id: `source-${secret}`,
        kind: "current_page",
        purpose: secret,
        itemKey: `中文书名-${secret}`,
        pageNumber: 8,
        charCount: 640,
        originalCharCount: 900,
        compacted: true,
        text: secret,
      },
      {
        id: "malicious-source",
        kind: secret,
        quality: secret,
        charCount: 8,
      },
    ],
    excluded: [
      { kind: "unread_item", reason: "spoiler-policy", detail: secret },
      { kind: "unread_item", reason: "spoiler-policy", detail: "another private detail" },
      { kind: secret, reason: secret, detail: secret },
    ],
    usedContextChars: 640,
    maxContextChars: 7200,
    estimatedContextTokens: 830,
    maxOutputTokens: 1500,
    inputCompression: { mode: "normal", originalText: secret },
    prompt: secret,
    messages: [{ content: secret }],
  },
});

const serialized = JSON.stringify(context);
assert.doesNotMatch(serialized, new RegExp(secret));
assert.doesNotMatch(
  serialized,
  /"(?:purpose|detail|prompt|messages|privateInstruction|text)"\s*:/
);
assert.equal(context.scene, "readingChat");
assert.equal(context.sources[0].pageNumber, 8);
assert.equal(context.sources[0].compacted, true);
assert.match(context.sources[0].ref, /^ref-fnv1a:/);
assert.equal(context.sources[1].kind, "unknown");
assert.equal(context.exclusions[1].reason, "other");
assert.equal(context.exclusions[0].count, 2);

const normalized = normalizeCompanionDiagnosticContext({
  ...context,
  sourceText: secret,
  sources: [{ ...context.sources[0], text: secret, note: secret }],
  exclusions: [{ ...context.exclusions[0], detail: secret }],
});
assert.doesNotMatch(JSON.stringify(normalized), new RegExp(secret));
assert.equal(normalized.sources[0].ref, context.sources[0].ref);

const entry = buildAiDiagnosticEntry({
  mode: "cache",
  taskType: "readingChat",
  startedAt: "2026-07-22T00:00:00.000Z",
  endedAt: "2026-07-22T00:00:00.000Z",
  settings: {
    provider: "openai-compatible",
    openaiCompatible: { model: "qa-model", baseUrl: "https://example.com/v1" },
  },
  result: { attempts: 0 },
  diagnosticContext: context,
});
assert.equal(entry.mode, "cache");
assert.equal(entry.attempts, 0);
assert.equal(entry.context.sources.length, 2);

const migrated = normalizeAiDiagnostics({ version: 1, entries: [{ ...entry, context }] });
assert.equal(migrated.version, 2);
assert.equal(migrated.entries[0].attempts, 0);
assert.equal(migrated.entries[0].context.sources[0].ref, context.sources[0].ref);

const details = buildDiagnosticEntryDetails(entry);
assert.match(details, /当前页（第 8 页）/);
assert.match(details, /阅读边界限制/);
assert.match(details, /仅使用已读内容/);
assert.doesNotMatch(details, new RegExp(secret));

const aiSource = await readFile(new URL("../src/lib/ai.js", import.meta.url), "utf8");
const guideSource = await readFile(new URL("../src/lib/readingGuides.js", import.meta.url), "utf8");
const chatSource = await readFile(new URL("../src/lib/readingChat.js", import.meta.url), "utf8");
const reflectionSource = await readFile(
  new URL("../src/lib/readingReflection.js", import.meta.url),
  "utf8"
);
const settingsSource = await readFile(
  new URL("../src/components/Settings.jsx", import.meta.url),
  "utf8"
);
assert.match(aiSource, /diagnosticContext/);
assert.match(guideSource, /recordAiCacheDiagnostic/);
assert.match(chatSource, /scene: context\.scene/);
assert.match(reflectionSource, /scene: context\.scene/);
assert.match(settingsSource, /AI 调用与选材/);
assert.match(settingsSource, /本次使用了/);

console.log("Companion diagnostics tests passed.");
