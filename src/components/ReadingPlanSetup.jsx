import { useEffect, useMemo, useState } from "react";
import { getBook, updateBook } from "../lib/books.js";
import { toText } from "../lib/text.js";

const PURPOSES = [
  {
    value: "overview",
    title: "快速了解",
    desc: "抓住主线、关键概念和结论。",
  },
  {
    value: "study",
    title: "系统学习",
    desc: "稳步读完，建立完整知识框架。",
  },
  {
    value: "deep",
    title: "深度精读",
    desc: "慢下来推敲论证、例子和隐含前提。",
  },
  {
    value: "research",
    title: "写作研究",
    desc: "提炼可引用观点，沉淀笔记和问题。",
  },
];

const PACES = [
  { value: "light", title: "轻松", desc: "每天 15-20 分钟", chaptersPerDay: 1 },
  { value: "standard", title: "标准", desc: "每天 30-45 分钟", chaptersPerDay: 1 },
  { value: "deep", title: "深入", desc: "每天 60 分钟以上", chaptersPerDay: 1 },
];

const WEEKDAYS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

export default function ReadingPlanSetup({ bookId, onBack, onDone }) {
  const [book, setBook] = useState(null);
  const [purpose, setPurpose] = useState("study");
  const [pace, setPace] = useState("standard");
  const [startDate, setStartDate] = useState(today());
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getBook(bookId).then((saved) => {
      if (!saved) return;
      setBook(saved);
      if (saved.readingProfile) {
        setPurpose(saved.readingProfile.purpose || "study");
        setPace(saved.readingProfile.pace || "standard");
        setStartDate(saved.readingProfile.startDate || today());
        setWeekdays(saved.readingProfile.weekdays || [1, 2, 3, 4, 5]);
      }
    });
  }, [bookId]);

  const planPreview = useMemo(() => {
    if (!book) return null;
    return buildPlanPreview({
      book,
      purpose,
      pace,
      startDate,
      weekdays,
    });
  }, [book, purpose, pace, startDate, weekdays]);

  if (!book || !planPreview) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-ink-soft">
        正在读取书籍信息…
      </div>
    );
  }

  function toggleWeekday(value) {
    setWeekdays((current) => {
      if (current.includes(value) && current.length === 1) return current;
      if (current.includes(value)) return current.filter((day) => day !== value);
      return [...current, value].sort((a, b) => weekdayOrder(a) - weekdayOrder(b));
    });
  }

  async function handleSave() {
    const readingProfile = {
      purpose,
      pace,
      startDate,
      weekdays,
      updatedAt: new Date().toISOString(),
    };

    const readingPlan = {
      status: "draft",
      generatedBy: "local",
      summary: planPreview.summary,
      items: planPreview.items,
      updatedAt: new Date().toISOString(),
    };

    await updateBook(book.id, {
      readingProfile,
      readingPlan,
      status: "planned",
    });

    setMessage({ type: "ok", text: "阅读节奏已保存，计划草稿也准备好了。" });
    if (onDone) onDone(book.id);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <button onClick={onBack} className="text-sm text-accent underline">
        返回书籍信息
      </button>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-ink-soft">阅读目标与节奏</p>
          <h2 className="mt-1 font-serif text-3xl text-ink">{toText(book.title)}</h2>
          {toText(book.author) && (
            <p className="mt-2 text-sm text-ink-soft">{toText(book.author)}</p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-paper-card px-4 py-2 text-sm text-ink-soft">
          正文 {planPreview.mainCount} 章 · 导读 {planPreview.guideCount} 段
        </div>
      </div>

      <section className="mt-8">
        <h3 className="text-sm font-medium text-ink">你这次为什么读它？</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PURPOSES.map((option) => (
            <ChoiceCard
              key={option.value}
              active={purpose === option.value}
              title={option.title}
              desc={option.desc}
              onClick={() => setPurpose(option.value)}
            />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-sm font-medium text-ink">每天留给阅读的空间</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PACES.map((option) => (
            <ChoiceCard
              key={option.value}
              active={pace === option.value}
              title={option.title}
              desc={option.desc}
              onClick={() => setPace(option.value)}
            />
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <label className="block text-sm font-medium text-ink">
            开始日期
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
            />
          </label>

          <div>
            <p className="text-sm font-medium text-ink">每周阅读日</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <button
                  key={day.value}
                  onClick={() => toggleWeekday(day.value)}
                  className={`h-10 w-10 rounded-full border text-sm transition ${
                    weekdays.includes(day.value)
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-paper text-ink-soft hover:border-accent"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">计划预览</h3>
            <p className="mt-1 text-xs text-ink-soft">{planPreview.summary}</p>
          </div>
          <span className="rounded-full bg-paper px-3 py-1 text-xs text-ink-soft">
            {planPreview.items.length} 个阅读日
          </span>
        </div>

        <ol className="mt-5 space-y-2">
          {planPreview.items.slice(0, 8).map((item) => (
            <li key={`${item.day}-${item.title}`} className="rounded-lg bg-paper px-4 py-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-ink">
                  Day {item.day} · {item.title}
                </p>
                <p className="text-xs text-ink-soft">{item.date}</p>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {item.type === "guide" ? "准备阅读" : "正文章节"} · 第 {item.startPage}-
                {item.endPage} 页
              </p>
            </li>
          ))}
        </ol>

        {planPreview.items.length > 8 && (
          <p className="mt-3 text-xs text-ink-soft">
            还有 {planPreview.items.length - 8} 个阅读日会在保存后一起记录。
          </p>
        )}
      </section>

      {message && <Hint message={message} />}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
        >
          保存阅读节奏
        </button>
        <button
          onClick={onBack}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
        >
          返回修改章节
        </button>
      </div>
    </div>
  );
}

function ChoiceCard({ active, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-28 rounded-xl border p-4 text-left transition ${
        active
          ? "border-accent bg-paper-card shadow-sm"
          : "border-line bg-paper-card hover:border-accent"
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
          active ? "border-accent bg-accent" : "border-line bg-paper"
        }`}
      >
        {active && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{desc}</p>
    </button>
  );
}

function Hint({ message }) {
  const color = message.type === "ok" ? "text-green-700" : "text-red-600";
  return <p className={`mt-4 text-sm ${color}`}>{message.text}</p>;
}

function buildPlanPreview({ book, purpose, pace, startDate, weekdays }) {
  const guideChapters = book.chapters.filter((chapter) => chapter.role === "guide");
  const mainChapters = book.chapters.filter((chapter) => !chapter.role || chapter.role === "main");
  const selectedPace = PACES.find((option) => option.value === pace) || PACES[1];
  const items = [];
  let nextDate = parseDate(startDate);

  if (guideChapters.length > 0) {
    nextDate = nextReadingDate(nextDate, weekdays);
    items.push({
      id: makePlanItemId("guide", guideChapters),
      day: items.length + 1,
      date: formatDate(nextDate),
      type: "guide",
      title: "开始前准备",
      startPage: Math.min(...guideChapters.map((chapter) => chapter.startPage)),
      endPage: Math.max(...guideChapters.map((chapter) => chapter.endPage)),
      chapterIds: guideChapters.map((chapter) => chapter.id),
    });
    nextDate = addDays(nextDate, 1);
  }

  for (let index = 0; index < mainChapters.length; index += selectedPace.chaptersPerDay) {
    const group = mainChapters.slice(index, index + selectedPace.chaptersPerDay);
    nextDate = nextReadingDate(nextDate, weekdays);
    items.push({
      id: makePlanItemId("main", group),
      day: items.length + 1,
      date: formatDate(nextDate),
      type: "main",
      title: group.map((chapter) => chapter.title).join(" / "),
      startPage: Math.min(...group.map((chapter) => chapter.startPage)),
      endPage: Math.max(...group.map((chapter) => chapter.endPage)),
      chapterIds: group.map((chapter) => chapter.id),
    });
    nextDate = addDays(nextDate, 1);
  }

  const purposeText = PURPOSES.find((option) => option.value === purpose)?.title || "系统学习";
  const summary =
    mainChapters.length === 0
      ? "还没有标记为正文的章节，请回到书籍信息页调整章节用途。"
      : `${purposeText}模式，按正文 ${mainChapters.length} 章安排，预计 ${items.length} 个阅读日完成。`;

  return {
    guideCount: guideChapters.length,
    mainCount: mainChapters.length,
    summary,
    items,
  };
}

function today() {
  return formatDate(new Date());
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextReadingDate(date, weekdays) {
  let current = new Date(date);
  const allowed = weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5];
  for (let guard = 0; guard < 14; guard += 1) {
    if (allowed.includes(current.getDay())) return current;
    current = addDays(current, 1);
  }
  return current;
}

function weekdayOrder(value) {
  return value === 0 ? 7 : value;
}

function makePlanItemId(type, chapters) {
  return `${type}:${chapters.map((chapter) => chapter.id).join("+")}`;
}
