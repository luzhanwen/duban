import {
  BOOK_COMPANION_JOURNEY_ITEM_KEY,
  COMPANION_JOURNEY_SCENES,
  COMPANION_JOURNEY_TYPES,
} from "./companionJourney.js";

const TYPE_META = Object.freeze({
  [COMPANION_JOURNEY_TYPES.guideClue]: { label: "导读", tone: "guide" },
  [COMPANION_JOURNEY_TYPES.userQuestion]: { label: "你的问题", tone: "question" },
  [COMPANION_JOURNEY_TYPES.selectionQuestion]: { label: "划词提问", tone: "question" },
  [COMPANION_JOURNEY_TYPES.companionAnswer]: { label: "读伴回应", tone: "answer" },
  [COMPANION_JOURNEY_TYPES.intervention]: { label: "读伴一问", tone: "intervention" },
  [COMPANION_JOURNEY_TYPES.note]: { label: "笔记", tone: "note" },
  [COMPANION_JOURNEY_TYPES.reflection]: { label: "本节回想", tone: "reflection" },
  [COMPANION_JOURNEY_TYPES.sessionRecord]: { label: "本节记录", tone: "record" },
  [COMPANION_JOURNEY_TYPES.bookChat]: { label: "历史对话", tone: "book" },
});

export function buildGuideClues(guide, limit = 3) {
  if (!guide || typeof guide !== "object") return [];
  const candidates = [
    ...asArray(guide.questions),
    ...asArray(guide.goals),
    ...asArray(guide.focus),
    ...asArray(guide.concepts),
    ...splitOverview(guide.overview || guide.notes),
  ];
  const seen = new Set();

  return candidates.reduce((items, value) => {
    if (items.length >= clampLimit(limit)) return items;
    const clue = text(value);
    const identity = clue.toLocaleLowerCase();
    if (!clue || seen.has(identity)) return items;
    seen.add(identity);
    items.push(clue);
    return items;
  }, []);
}

export function buildCompanionTimelineCards(
  entries,
  { itemKey = null, includeBook = false } = {}
) {
  const cards = [];

  asArray(entries).forEach((entry) => {
    if (!shouldIncludeEntry(entry, itemKey, includeBook)) return;
    if (entry.type === COMPANION_JOURNEY_TYPES.guideClue) {
      const clues = buildGuideClues(entry.payload);
      clues.forEach((clue, index) => {
        cards.push(
          baseCard(entry, {
            id: `${entry.id}:clue:${index}`,
            title: `本节线索 ${index + 1}`,
            body: clue,
            quoteText: clue,
          })
        );
      });
      return;
    }

    const card = cardFromEntry(entry);
    if (card) cards.push(card);
  });

  return cards;
}

export function buildCompanionSessionRecord(entries, options = {}) {
  const cards = buildCompanionTimelineCards(entries, options);
  const counts = cards.reduce(
    (result, card) => {
      if (card.type === COMPANION_JOURNEY_TYPES.guideClue) result.clues += 1;
      if (
        card.type === COMPANION_JOURNEY_TYPES.userQuestion ||
        card.type === COMPANION_JOURNEY_TYPES.selectionQuestion
      ) {
        result.questions += 1;
      }
      if (card.type === COMPANION_JOURNEY_TYPES.companionAnswer) result.answers += 1;
      if (card.type === COMPANION_JOURNEY_TYPES.note) result.notes += 1;
      if (
        card.type === COMPANION_JOURNEY_TYPES.reflection &&
        card.role === "user"
      ) {
        result.reflections += 1;
      }
      return result;
    },
    { clues: 0, questions: 0, answers: 0, notes: 0, reflections: 0 }
  );
  const takeaway = [...cards]
    .reverse()
    .find((card) =>
      [
        COMPANION_JOURNEY_TYPES.reflection,
        COMPANION_JOURNEY_TYPES.note,
        COMPANION_JOURNEY_TYPES.companionAnswer,
      ].includes(card.type)
    );

  return {
    counts,
    total: cards.length,
    takeaway: takeaway?.body || "这一节的线索和问题已经留在陪读脉络里。",
  };
}

export function buildCompanionSessionEvidence(entries, options = {}) {
  const cards = buildCompanionTimelineCards(entries, options);
  return {
    questions: cards.filter((card) =>
      [
        COMPANION_JOURNEY_TYPES.userQuestion,
        COMPANION_JOURNEY_TYPES.selectionQuestion,
        COMPANION_JOURNEY_TYPES.companionAnswer,
      ].includes(card.type)
    ),
    notes: cards.filter((card) => card.type === COMPANION_JOURNEY_TYPES.note),
    reflections: cards.filter((card) => card.type === COMPANION_JOURNEY_TYPES.reflection),
  };
}

export function getDefaultExpandedTimelineCardIds(cards) {
  const list = asArray(cards);
  let latestQuestionIndex = -1;

  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (isQuestionCard(list[index])) {
      latestQuestionIndex = index;
      break;
    }
  }

  if (latestQuestionIndex >= 0) {
    const ids = [list[latestQuestionIndex]?.id].filter(Boolean);
    const answer = list.slice(latestQuestionIndex + 1).find(isAnswerCard);
    if (answer?.id) ids.push(answer.id);
    return ids;
  }

  const latestAnswer = [...list].reverse().find(isAnswerCard);
  return latestAnswer?.id ? [latestAnswer.id] : [];
}

export function isCompanionTimelineCardCollapsible(card, { compact = false } = {}) {
  const body = text(card?.body);
  if (!body) return false;
  const visibleLineLimit = compact ? 4 : 5;
  const characterLimit = compact ? 96 : 180;
  return body.length > characterLimit || body.split(/\r?\n/).length > visibleLineLimit;
}

export function getCompanionTimelineCardLayout(card) {
  if (
    card?.type === COMPANION_JOURNEY_TYPES.userQuestion ||
    card?.type === COMPANION_JOURNEY_TYPES.selectionQuestion
  ) {
    return "user";
  }
  if (
    card?.type === COMPANION_JOURNEY_TYPES.companionAnswer ||
    card?.type === COMPANION_JOURNEY_TYPES.intervention
  ) {
    return "assistant";
  }
  if (card?.type === COMPANION_JOURNEY_TYPES.bookChat) {
    return card?.role === "user" ? "user" : "assistant";
  }
  if (card?.type === COMPANION_JOURNEY_TYPES.reflection) {
    if (card?.kind === "summary") return "record";
    return card?.role === "user" ? "user" : "assistant";
  }
  return "record";
}

export function formatCompanionTimelineQuote(card) {
  const source = text(card?.quoteText || card?.body);
  if (!source) return "";
  const label = text(card?.label) || "陪读记录";
  return `引用${label}：\n> ${truncate(source, 240)}\n\n`;
}

function cardFromEntry(entry) {
  const payload = entry?.payload || {};
  const role = payload.role === "user" ? "user" : "assistant";
  const sourceText = text(entry?.sourceRef?.text || payload.quote?.text);
  let title = "";
  let body = "";

  switch (entry?.type) {
    case COMPANION_JOURNEY_TYPES.userQuestion:
    case COMPANION_JOURNEY_TYPES.selectionQuestion:
    case COMPANION_JOURNEY_TYPES.companionAnswer:
    case COMPANION_JOURNEY_TYPES.reflection:
    case COMPANION_JOURNEY_TYPES.bookChat:
      body = text(payload.content);
      title = sourceText ? `关于“${truncate(sourceText, 34)}”` : "";
      break;
    case COMPANION_JOURNEY_TYPES.note:
      title = text(payload.note) || "读到这里记下";
      body = text(payload.assistantContent || payload.text || payload.note);
      break;
    default:
      body = text(payload.content || payload.text || payload.note);
  }

  if (!body) return null;
  const reflectionOverrides = buildReflectionCardOverrides(entry, payload, role);
  return baseCard(entry, {
    title,
    body,
    quoteText: sourceText || body,
    role,
    detail: buildUsageDetail(payload),
    ...reflectionOverrides,
  });
}

function buildReflectionCardOverrides(entry, payload, role) {
  if (entry?.type !== COMPANION_JOURNEY_TYPES.reflection) return {};
  const kind = text(payload?.kind);
  if (kind === "summary") {
    return { label: "本节总结", tone: "summary", kind, role: "assistant" };
  }
  return {
    label: role === "user" ? "你的回想" : "读伴回应",
    tone: role === "user" ? "reflection-user" : "reflection-answer",
    kind,
  };
}

function baseCard(entry, overrides = {}) {
  const meta = TYPE_META[entry?.type] || { label: "陪读记录", tone: "default" };
  return {
    id: overrides.id || entry.id,
    scene: entry.scene,
    type: entry.type,
    label: overrides.label || meta.label,
    tone: overrides.tone || meta.tone,
    kind: overrides.kind || "",
    title: overrides.title || "",
    body: overrides.body || "",
    quoteText: overrides.quoteText || overrides.body || "",
    createdAt: entry.createdAt || null,
    role: overrides.role || entry?.payload?.role || "assistant",
    detail: overrides.detail || "",
    prototype: false,
    sourceEntry: entry,
  };
}

function buildUsageDetail(payload) {
  const parts = [];
  if (text(payload?.model)) parts.push(text(payload.model));
  if (payload?.usage) {
    parts.push(`输入 ${payload.usage.input_tokens ?? "?"} / 输出 ${payload.usage.output_tokens ?? "?"}`);
  }
  const cost = Number(payload?.cost?.totalCost ?? payload?.cost);
  if (Number.isFinite(cost) && cost > 0) parts.push(`$${cost.toFixed(4)}`);
  return parts.join(" · ");
}

function shouldIncludeEntry(entry, itemKey, includeBook) {
  if (!entry) return false;
  if (entry.itemKey === BOOK_COMPANION_JOURNEY_ITEM_KEY) return includeBook;
  return itemKey === null || entry.itemKey === itemKey;
}

function isQuestionCard(card) {
  if ([
    COMPANION_JOURNEY_TYPES.userQuestion,
    COMPANION_JOURNEY_TYPES.selectionQuestion,
  ].includes(card?.type)) return true;
  return card?.type === COMPANION_JOURNEY_TYPES.reflection && card?.role === "user";
}

function isAnswerCard(card) {
  if (card?.type === COMPANION_JOURNEY_TYPES.companionAnswer) return true;
  return (
    card?.type === COMPANION_JOURNEY_TYPES.reflection &&
    card?.role === "assistant" &&
    card?.kind !== "summary"
  );
}

function splitOverview(value) {
  return text(value)
    .split(/(?:\n\s*---\s*\n|[。！？!?]\s*)/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function truncate(value, maxLength) {
  const source = text(value);
  return source.length > maxLength ? `${source.slice(0, maxLength)}…` : source;
}

function clampLimit(value) {
  const limit = Number(value);
  return Number.isFinite(limit) ? Math.max(1, Math.min(6, Math.floor(limit))) : 3;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
