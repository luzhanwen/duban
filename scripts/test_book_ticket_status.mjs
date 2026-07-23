import assert from "node:assert/strict";
import {
  getBookTicketStamp,
  getBookTicketStatusText,
  hasCompletedReadingToday,
  hasReadingActivityToday,
} from "../src/lib/bookTicketStatus.js";

const now = new Date(2026, 6, 14, 18, 0, 0);
const baseArgs = { canPlan: true, canRead: true };

assert.equal(
  getBookTicketStatusText({
    ...baseArgs,
    readingStats: { percent: 0, continuing: false },
  }),
  "未启卷"
);

const activeProgress = {
  readingDays: ["2026-07-14"],
  lastReadAt: new Date(2026, 6, 14, 17, 30, 0).toISOString(),
  completedAtByItemKey: {},
};
assert.equal(hasReadingActivityToday(activeProgress, now), true);
assert.equal(hasCompletedReadingToday(activeProgress, now), false);
assert.equal(
  getBookTicketStatusText({
    ...baseArgs,
    readingStats: { percent: 0, continuing: true },
  }),
  "阅读中"
);
assert.deepEqual(
  getBookTicketStamp({
    ...baseArgs,
    progress: activeProgress,
    readingStats: { percent: 0, continuing: true },
    now,
  }),
  {
    tone: "reading-today",
    kicker: "今日",
    label: "在读",
    ariaLabel: "今日阅读中",
  }
);

const completedProgress = {
  ...activeProgress,
  completedAtByItemKey: {
    "day-1": new Date(2026, 6, 14, 17, 45, 0).toISOString(),
  },
};
assert.equal(hasCompletedReadingToday(completedProgress, now), true);
assert.equal(
  getBookTicketStamp({
    ...baseArgs,
    progress: completedProgress,
    readingStats: { percent: 25, continuing: false },
    now,
  }).ariaLabel,
  "今日阅读已完成"
);

assert.equal(
  getBookTicketStatusText({
    ...baseArgs,
    readingStats: { percent: 25, continuing: true },
  }),
  "已读 25% · 阅读中"
);
assert.equal(
  getBookTicketStamp({
    ...baseArgs,
    progress: activeProgress,
    readingStats: { percent: 100, continuing: false },
    now,
  }).ariaLabel,
  "已读完"
);

console.log("Book ticket status tests passed.");
