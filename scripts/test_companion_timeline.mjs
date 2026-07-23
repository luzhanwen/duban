import assert from "node:assert/strict";
import {
  buildCompanionSessionRecord,
  buildCompanionTimelineCards,
  buildGuideClues,
  formatCompanionTimelineQuote,
  getDefaultExpandedTimelineCardIds,
  getCompanionTimelineCardLayout,
  isCompanionTimelineCardCollapsible,
} from "../src/lib/companionTimeline.js";
import { COMPANION_JOURNEY_TYPES } from "../src/lib/companionJourney.js";

const clues = buildGuideClues({
  questions: ["为什么此处改变？", "为什么此处改变？"],
  goals: ["辨认作者的判断"],
  overview: "先看主线。再看证据。",
});
assert.deepEqual(clues, ["为什么此处改变？", "辨认作者的判断", "先看主线"]);

const entries = [
  {
    id: "guide-1",
    itemKey: "day-1",
    scene: "guide",
    type: COMPANION_JOURNEY_TYPES.guideClue,
    payload: { questions: ["留意什么？"], goals: ["带走一个判断"] },
  },
  {
    id: "question-1",
    itemKey: "day-1",
    scene: "reading",
    type: COMPANION_JOURNEY_TYPES.selectionQuestion,
    payload: { role: "user", content: "这句话是什么意思？" },
    sourceRef: { text: "原文片段" },
  },
  {
    id: "note-1",
    itemKey: "day-1",
    scene: "reading",
    type: COMPANION_JOURNEY_TYPES.note,
    payload: { note: "我的判断", text: "原文" },
  },
  {
    id: "answer-1",
    itemKey: "day-1",
    scene: "reading",
    type: COMPANION_JOURNEY_TYPES.companionAnswer,
    payload: { role: "assistant", content: "这是对应回答。" },
  },
  {
    id: "other",
    itemKey: "day-2",
    scene: "reading",
    type: COMPANION_JOURNEY_TYPES.note,
    payload: { note: "别节笔记" },
  },
];

const cards = buildCompanionTimelineCards(entries, { itemKey: "day-1" });
assert.equal(cards.length, 5);
assert.equal(cards[0].type, COMPANION_JOURNEY_TYPES.guideClue);
assert.match(formatCompanionTimelineQuote(cards[2]), /^引用划词提问：/);

const record = buildCompanionSessionRecord(entries, { itemKey: "day-1" });
assert.deepEqual(record.counts, {
  clues: 2,
  questions: 1,
  answers: 1,
  notes: 1,
  reflections: 0,
});
assert.equal(record.total, 5);

const conversationCards = buildCompanionTimelineCards([
  {
    id: "question-old",
    itemKey: "day-1",
    scene: "reading",
    type: COMPANION_JOURNEY_TYPES.userQuestion,
    payload: { role: "user", content: "旧问题" },
  },
  {
    id: "answer-old",
    itemKey: "day-1",
    scene: "reading",
    type: COMPANION_JOURNEY_TYPES.companionAnswer,
    payload: { role: "assistant", content: "旧回答".repeat(80) },
  },
  {
    id: "question-latest",
    itemKey: "day-1",
    scene: "reading",
    type: COMPANION_JOURNEY_TYPES.selectionQuestion,
    payload: { role: "user", content: "最新问题" },
  },
  {
    id: "answer-latest",
    itemKey: "day-1",
    scene: "reading",
    type: COMPANION_JOURNEY_TYPES.companionAnswer,
    payload: { role: "assistant", content: "最新回答".repeat(80) },
  },
]);
assert.deepEqual(getDefaultExpandedTimelineCardIds(conversationCards), [
  "question-latest",
  "answer-latest",
]);
assert.equal(isCompanionTimelineCardCollapsible(conversationCards[0], { compact: true }), false);
assert.equal(isCompanionTimelineCardCollapsible(conversationCards[1], { compact: true }), true);
assert.equal(getCompanionTimelineCardLayout(conversationCards[0]), "user");
assert.equal(getCompanionTimelineCardLayout(conversationCards[1]), "assistant");
assert.equal(getCompanionTimelineCardLayout(cards[0]), "record");

const reflectionCards = buildCompanionTimelineCards([
  {
    id: "reflection-user",
    itemKey: "day-1",
    scene: "reflection",
    type: COMPANION_JOURNEY_TYPES.reflection,
    payload: { role: "user", content: "我留下的判断" },
  },
  {
    id: "reflection-answer",
    itemKey: "day-1",
    scene: "reflection",
    type: COMPANION_JOURNEY_TYPES.reflection,
    payload: { role: "assistant", content: "沿着这个判断继续看。" },
  },
  {
    id: "reflection-summary",
    itemKey: "day-1",
    scene: "reflection",
    type: COMPANION_JOURNEY_TYPES.reflection,
    payload: { role: "assistant", kind: "summary", content: "本节要点" },
  },
]);
assert.equal(getCompanionTimelineCardLayout(reflectionCards[0]), "user");
assert.equal(getCompanionTimelineCardLayout(reflectionCards[1]), "assistant");
assert.equal(getCompanionTimelineCardLayout(reflectionCards[2]), "record");
assert.equal(reflectionCards[2].label, "本节总结");
assert.equal(reflectionCards[2].tone, "summary");
assert.deepEqual(getDefaultExpandedTimelineCardIds(reflectionCards), [
  "reflection-user",
  "reflection-answer",
]);

console.log("Companion timeline tests passed.");
