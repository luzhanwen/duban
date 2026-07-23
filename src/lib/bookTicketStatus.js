import { formatLocalDate } from "./readingSchedule.js";

export function getBookTicketStatusText({ canPlan, canRead, readingStats }) {
  if (!canPlan || !canRead) return "未设置读伴";
  if (readingStats.percent >= 100) return "全书 100% · 可回顾";
  if (readingStats.percent <= 0) {
    return readingStats.continuing ? "阅读中" : "未启卷";
  }
  if (readingStats.continuing) return `已读 ${readingStats.percent}% · 阅读中`;

  return `已读 ${readingStats.percent}%`;
}

export function getBookTicketStamp({ canPlan, canRead, progress, readingStats, now = new Date() }) {
  if (!canPlan) {
    return {
      tone: "pending",
      kicker: "读伴",
      label: "未设",
      ariaLabel: "未设置读伴",
    };
  }

  if (!canRead) {
    return {
      tone: "pending",
      kicker: "读伴",
      label: "待定",
      ariaLabel: "未设置读伴",
    };
  }

  if (readingStats.percent >= 100) {
    return {
      tone: "finished",
      kicker: "全书",
      label: "读完",
      ariaLabel: "已读完",
    };
  }

  if (hasCompletedReadingToday(progress, now)) {
    return {
      tone: "read-today",
      kicker: "今日",
      label: "完成",
      ariaLabel: "今日阅读已完成",
    };
  }

  if (hasReadingActivityToday(progress, now)) {
    return {
      tone: "reading-today",
      kicker: "今日",
      label: "在读",
      ariaLabel: "今日阅读中",
    };
  }

  return {
    tone: "unread-today",
    kicker: "今日",
    label: "未读",
    ariaLabel: "今日未读",
  };
}

export function hasReadingActivityToday(progress = {}, now = new Date()) {
  const today = formatLocalDate(now);
  if ((progress.readingDays || []).includes(today)) return true;

  return isSameLocalDay(progress.lastReadAt, today);
}

export function hasCompletedReadingToday(progress = {}, now = new Date()) {
  const today = formatLocalDate(now);
  return Object.values(progress.completedAtByItemKey || {}).some((value) =>
    isSameLocalDay(value, today)
  );
}

function isSameLocalDay(value, expectedDay) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return formatLocalDate(date) === expectedDay;
}
