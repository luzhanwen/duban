import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCompanionSectionMemoryText,
  buildCompanionSectionRecordDraft,
  companionSectionRecordFromEvent,
  hasMeaningfulCompanionSectionRecord,
  isCompanionSectionMemoryCurrent,
  withoutConfirmedCompanionSectionMemory,
  withConfirmedCompanionSectionMemory,
} from "../src/lib/companionSectionRecord.js";
import { buildCompanionJourney } from "../src/lib/companionJourney.js";
import { buildCompanionSessionEvidence } from "../src/lib/companionTimeline.js";
import {
  createCompanionMemoryItem,
  normalizeCompanionMemory,
} from "../src/lib/companionPolicy.js";

const journey = buildCompanionJourney({
  bookId: "book-1",
  planItems: [{ id: "item-1", title: "第一节" }],
  reflectionStore: {
    "item-1": [
      {
        id: "reflection-1",
        role: "user",
        content: "制度的惯性往往比个人意志更难改变。",
        createdAt: "2026-07-21T01:00:00.000Z",
      },
      {
        id: "reflection-2",
        role: "assistant",
        content: "这是一个重要判断。",
        createdAt: "2026-07-21T01:01:00.000Z",
      },
    ],
  },
  chatStore: {
    "item-1": [
      { id: "question-1", role: "user", content: "为什么制度会形成惯性？" },
      { id: "answer-1", role: "assistant", content: "可以从利益结构开始理解。" },
    ],
  },
  notesStore: {
    "item-1": [{ id: "note-1", note: "制度惯性", text: "利益结构会延缓改变。" }],
  },
});

const draft = buildCompanionSectionRecordDraft(journey, { itemKey: "item-1" });
assert.equal(draft.understanding, "制度的惯性往往比个人意志更难改变。");
assert.deepEqual(draft.openQuestions, []);
assert.equal(draft.sourceEventIds.length, 1);
assert.equal(hasMeaningfulCompanionSectionRecord(draft), true);
const evidence = buildCompanionSessionEvidence(journey, { itemKey: "item-1" });
assert.equal(evidence.questions.length, 2, "问答展开应同时包含用户问题和读伴回答");
assert.equal(evidence.notes.length, 1);
assert.equal(evidence.reflections.length, 2, "读后回答展开应保留对话双方内容");
assert.equal(
  hasMeaningfulCompanionSectionRecord({
    understanding: "",
    openQuestions: [],
    sourceEventIds: ["source-only"],
  }),
  false,
  "source references alone must not create an empty section record"
);

const questionJourney = buildCompanionJourney({
  bookId: "book-1",
  planItems: [{ id: "item-2", title: "第二节" }],
  reflectionStore: {
    "item-2": [
      {
        id: "reflection-question",
        role: "user",
        content: "这种制度为什么一直没有被纠正？",
      },
    ],
  },
});
const questionDraft = buildCompanionSectionRecordDraft(questionJourney, { itemKey: "item-2" });
assert.equal(questionDraft.understanding, "");
assert.deepEqual(questionDraft.openQuestions, ["这种制度为什么一直没有被纠正？"]);

const assistantOnly = buildCompanionJourney({
  bookId: "book-1",
  planItems: [{ id: "item-3", title: "第三节" }],
  reflectionStore: {
    "item-3": [{ id: "assistant-only", role: "assistant", content: "模型生成的总结" }],
  },
});
assert.equal(
  hasMeaningfulCompanionSectionRecord(
    buildCompanionSectionRecordDraft(assistantOnly, { itemKey: "item-3" })
  ),
  false,
  "只有模型回答时不得自动形成用户成果"
);

const aiAnswerNoteOnly = buildCompanionJourney({
  bookId: "book-1",
  planItems: [{ id: "item-4", title: "第四节" }],
  notesStore: {
    "item-4": [
      {
        id: "ai-answer-note",
        note: "AI 回答",
        assistantContent: "模型生成的长回答",
      },
    ],
  },
});
assert.equal(
  hasMeaningfulCompanionSectionRecord(
    buildCompanionSectionRecordDraft(aiAnswerNoteOnly, { itemKey: "item-4" })
  ),
  false,
  "保存的模型回答标题不得冒充用户自己的本节理解"
);

const memoryText = buildCompanionSectionMemoryText({
  ...draft,
  openQuestions: ["制度变化需要满足什么条件？"],
});
assert.match(memoryText, /^本节理解：/);
assert.match(memoryText, /仍在思考：/);
assert.ok(memoryText.length <= 240);

const confirmed = withConfirmedCompanionSectionMemory(draft, {
  itemId: "memory-1",
  text: buildCompanionSectionMemoryText(draft),
  confirmedAt: "2026-07-21T02:00:00.000Z",
});
assert.equal(isCompanionSectionMemoryCurrent(confirmed), true);
assert.equal(
  isCompanionSectionMemoryCurrent({ ...confirmed, understanding: "修改后的理解" }),
  false,
  "编辑本节记录后必须再次确认才能更新记忆"
);
const unlinked = withoutConfirmedCompanionSectionMemory(
  confirmed,
  "2026-07-21T02:10:00.000Z"
);
assert.equal(unlinked.memoryLink, null, "撤销记忆后必须清除本节记录中的记忆关联");
assert.equal(unlinked.understanding, draft.understanding, "撤销记忆不得删除本节记录");

const legacy = companionSectionRecordFromEvent({
  itemKey: "item-legacy",
  status: "completed",
  metadata: { takeaway: "旧版留下的有效理解" },
  relatedEventIds: ["event:note:1"],
  createdAt: "2026-07-20T01:00:00.000Z",
  updatedAt: "2026-07-20T01:00:00.000Z",
});
assert.equal(legacy.understanding, "旧版留下的有效理解");
assert.equal(
  companionSectionRecordFromEvent({
    itemKey: "item-empty",
    status: "completed",
    metadata: { takeaway: "这一节的线索和问题已经留在陪读脉络里。" },
  }),
  null,
  "旧版兜底文案不得冒充真实成果"
);
assert.equal(
  companionSectionRecordFromEvent({
    itemKey: "item-legacy-ai",
    status: "completed",
    metadata: {
      record: {
        itemKey: "item-legacy-ai",
        understanding: "AI 回答",
        sourceEventIds: ["event:note-ai"],
      },
    },
  }),
  null,
  "旧构建误存的模型回答标题不得显示成用户成果"
);

const memoryItem = createCompanionMemoryItem(
  "本节理解：制度的惯性往往比个人意志更难改变。",
  "2026-07-21T03:00:00.000Z",
  {
    source: "session_record",
    sourceItemKey: "item-1",
    sourceEventId: "event:session_record:abc",
  }
);
const normalizedMemory = normalizeCompanionMemory({ initialized: true, items: [memoryItem] });
assert.equal(normalizedMemory.items[0].source, "session_record");
assert.equal(normalizedMemory.items[0].sourceItemKey, "item-1");
assert.equal(normalizedMemory.items[0].sourceEventId, "event:session_record:abc");

const editorSource = readFileSync(
  new URL("../src/components/CompanionSectionRecordEditor.jsx", import.meta.url),
  "utf8"
);
assert.match(editorSource, /撤销记忆/);
assert.match(editorSource, /label: "回答"/);
assert.match(editorSource, /label: "笔记"/);
assert.match(editorSource, /label: "读后"/);
assert.match(editorSource, /buildCompanionSessionEvidence/);
assert.match(editorSource, /evidenceOptions\.find\(\(option\) => option\.count > 0\)/);
assert.match(editorSource, /return currentAvailable \? current : defaultEvidence/);
assert.doesNotMatch(editorSource, /<textarea/);
assert.doesNotMatch(editorSource, /保存本节记录/);
assert.doesNotMatch(editorSource, /确认让读伴记住/);

const storeSource = readFileSync(
  new URL("../src/lib/companionEventStore.js", import.meta.url),
  "utf8"
);
assert.match(storeSource, /saveCompanionSessionRecord/);
assert.match(storeSource, /metadata:\s*\{[\s\S]*record:/);
assert.match(storeSource, /COMPANION_EVENT_STATUSES\.deleted/);

console.log("Companion section evidence and memory revocation tests passed.");
