import { fingerprintText } from "./companionEvents.js";
import { toText } from "./text.js";

export const COMPANION_DIAGNOSTIC_SCHEMA_VERSION = 1;

const SCENES = new Set(["readingGuide", "readingChat", "readingReflection"]);
const SOURCE_KINDS = new Set([
  "assistant_history",
  "completed_item",
  "contract_key_turn",
  "contract_reading_path",
  "current_page",
  "guide",
  "history",
  "memory",
  "note",
  "open_item",
  "reading_chat",
  "selection",
  "target_item",
  "unread_item",
]);
const EXCLUSION_REASONS = new Set([
  "context-budget",
  "missing-source-item",
  "not-explicitly-retained",
  "not-relevant",
  "reading-frontier",
  "spoiler-policy",
]);
const SOURCE_QUALITIES = new Set([
  "conversation",
  "generated",
  "good",
  "parsed",
  "unusable",
  "usable",
  "user-confirmed",
  "user-saved",
  "user-selected",
]);
const POLICY_VALUES = Object.freeze({
  spoiler: new Set(["avoid", "hint", "allow"]),
  answerDepth: new Set(["concise", "balanced", "deep"]),
  followUp: new Set(["never", "helpful", "always"]),
  knowledgeBoundary: new Set(["book", "text_first", "open"]),
});

export function buildCompanionDiagnosticContext(input = {}) {
  const trace = input?.trace && typeof input.trace === "object" ? input.trace : input;
  if (!trace || typeof trace !== "object") return null;
  const policy = input?.policy && typeof input.policy === "object" ? input.policy : {};
  const sources = asArray(trace.sourceRefs).map(normalizeSource).filter(Boolean);
  const exclusions = aggregateExclusions(trace.excluded);
  const usedContextChars = positiveNumber(trace.usedContextChars);
  const maxContextChars = positiveNumber(trace.maxContextChars);

  return {
    schemaVersion: COMPANION_DIAGNOSTIC_SCHEMA_VERSION,
    scene: SCENES.has(input?.scene) ? input.scene : "",
    cache: {
      hit: Boolean(trace.cache?.hit),
      kind: safeEnum(trace.cache?.kind, ["context-lru", "guide-artifact"]),
    },
    policy: {
      spoiler: safePolicyValue("spoiler", policy.spoiler),
      answerDepth: safePolicyValue("answerDepth", policy.answerDepth),
      followUp: safePolicyValue("followUp", policy.followUp),
      knowledgeBoundary: safePolicyValue("knowledgeBoundary", policy.knowledgeBoundary),
    },
    budget: {
      usedContextChars,
      maxContextChars,
      estimatedContextTokens: positiveNumber(trace.estimatedContextTokens),
      maxOutputTokens: positiveNumber(trace.maxOutputTokens),
      sourceCount: sources.length,
      excludedCount: exclusions.reduce((total, entry) => total + entry.count, 0),
      compactedSourceCount: sources.filter((source) => source.compacted).length,
      truncatedSourceCount: sources.filter((source) => source.truncated).length,
    },
    sources,
    exclusions,
    inputCompression: safeEnum(trace.inputCompression?.mode, ["normal", "compact"]),
  };
}

export function normalizeCompanionDiagnosticContext(value) {
  if (!value || typeof value !== "object") return null;
  return buildCompanionDiagnosticContext({
    scene: value.scene,
    policy: value.policy,
    trace: {
      cache: value.cache,
      sourceRefs: value.sources,
      excluded: expandAggregatedExclusions(value.exclusions),
      usedContextChars: value.budget?.usedContextChars,
      maxContextChars: value.budget?.maxContextChars,
      estimatedContextTokens: value.budget?.estimatedContextTokens,
      maxOutputTokens: value.budget?.maxOutputTokens,
      inputCompression: { mode: value.inputCompression },
    },
  });
}

function normalizeSource(source) {
  if (!source || typeof source !== "object") return null;
  const kind = SOURCE_KINDS.has(source.kind) ? source.kind : "unknown";
  return {
    ref: safeReference(source.ref || source.id),
    kind,
    pageNumber: positiveInteger(source.pageNumber),
    pageEnd: positiveInteger(source.pageEnd),
    itemRef: safeReference(source.itemRef || source.itemKey),
    chapterRef: safeReference(source.chapterRef || source.chapterId),
    charCount: positiveNumber(source.charCount),
    originalCharCount: positiveNumber(source.originalCharCount),
    quality: SOURCE_QUALITIES.has(source.quality) ? source.quality : "",
    compacted: Boolean(source.compacted),
    truncated: Boolean(source.truncated),
  };
}

function aggregateExclusions(items) {
  const counts = new Map();
  for (const item of asArray(items)) {
    if (!item || typeof item !== "object") continue;
    const kind = SOURCE_KINDS.has(item.kind) ? item.kind : "unknown";
    const reason = EXCLUSION_REASONS.has(item.reason) ? item.reason : "other";
    const explicitCount = Math.max(1, positiveInteger(item.count) || 1);
    const key = `${kind}:${reason}`;
    counts.set(key, (counts.get(key) || 0) + explicitCount);
  }
  return [...counts.entries()].map(([key, count]) => {
    const [kind, reason] = key.split(":");
    return { kind, reason, count };
  });
}

function expandAggregatedExclusions(items) {
  return asArray(items).map((item) => ({
    kind: item?.kind,
    reason: item?.reason,
    count: item?.count,
  }));
}

function safeReference(value) {
  const text = toText(value).trim();
  if (!text) return "";
  if (/^ref-fnv1a:[a-z0-9]+$/i.test(text)) return text;
  return `ref-${fingerprintText(text) || "unknown"}`;
}

function safePolicyValue(key, value) {
  return POLICY_VALUES[key]?.has(value) ? value : "";
}

function safeEnum(value, allowed) {
  return allowed.includes(value) ? value : "";
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
