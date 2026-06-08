import { useEffect, useRef, useState } from "react";
import { IS_TEST_CHANNEL } from "../lib/appChannel.js";
import { createBookFromPdf, getReadingProgress, listBooks, saveReadingProgress } from "../lib/books.js";
import { parsePdf } from "../lib/pdf.js";
import { toText } from "../lib/text.js";

const TEST_BOOK = {
  fileName: "万历十五年（经典版）.pdf",
  url: "/test-books/wanli15.pdf",
};

export default function Shelf({ onSetupBook, onPlanBook, onReadBook }) {
  const inputRef = useRef(null);
  const [books, setBooks] = useState([]);
  const [progressByBookId, setProgressByBookId] = useState({});
  const [directoryBookId, setDirectoryBookId] = useState(null);
  const [uploadState, setUploadState] = useState(null);
  const [error, setError] = useState("");
  const directoryBook = books.find((book) => book.id === directoryBookId) || null;

  useEffect(() => {
    refreshBooks();
  }, []);

  async function refreshBooks() {
    const saved = await listBooks();
    const progressEntries = await Promise.all(
      saved.map(async (book) => [book.id, await getReadingProgress(book.id)])
    );
    setBooks(saved);
    setProgressByBookId(Object.fromEntries(progressEntries));
  }

  async function importPdfFile(file) {
    setError("");
    setUploadState({ fileName: file.name, current: 0, total: 0, phase: "解析 PDF" });

    try {
      const parsed = await parsePdf(file, ({ current, total }) => {
        setUploadState({ fileName: file.name, current, total, phase: "提取文本" });
      });
      setUploadState({
        fileName: file.name,
        current: parsed.totalPages,
        total: parsed.totalPages,
        phase: "保存到本地",
      });
      const book = await createBookFromPdf(file, parsed);
      await refreshBooks();
      setUploadState(null);
      onSetupBook(book.id);
    } catch (e) {
      setUploadState(null);
      setError(e.message || "PDF 解析失败，请换一本书重试。");
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("请上传 PDF 文件。");
      return;
    }

    await importPdfFile(file);
  }

  async function handleImportTestBook() {
    try {
      const response = await fetch(TEST_BOOK.url);
      if (!response.ok) throw new Error("测试书文件读取失败。");
      const blob = await response.blob();
      const file = new File([blob], TEST_BOOK.fileName, { type: "application/pdf" });
      await importPdfFile(file);
    } catch (e) {
      setUploadState(null);
      setError(e.message || "测试书导入失败，请稍后重试。");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-3xl text-ink">书架</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            上传一本 PDF，先在本地提取文本与章节。确认书籍信息之后，再进入开书分析和阅读计划。
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(uploadState)}
            className="rounded-lg bg-accent px-4 py-2 text-sm text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
          >
            上传 PDF
          </button>
        </div>
      </div>

      {IS_TEST_CHANNEL && (
        <section className="mt-6 rounded-xl border border-line bg-paper-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink">本地测试书</p>
              <p className="mt-1 text-sm text-ink-soft">
                一键导入《万历十五年》，方便测试章节识别、PDF 渲染和伴读问答。
              </p>
            </div>
            <button
              onClick={handleImportTestBook}
              disabled={Boolean(uploadState)}
              className="shrink-0 rounded-lg border border-accent px-4 py-2 text-sm text-accent transition hover:bg-paper disabled:opacity-50"
            >
              导入测试书
            </button>
          </div>
        </section>
      )}

      {uploadState && (
        <UploadProgress uploadState={uploadState} />
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {books.length === 0 ? (
        <EmptyShelf onUpload={() => inputRef.current?.click()} />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              progress={progressByBookId[book.id]}
              onSetupBook={onSetupBook}
              onPlanBook={onPlanBook}
              onReadBook={onReadBook}
              onOpenDirectory={setDirectoryBookId}
            />
          ))}
        </div>
      )}

      {directoryBook && (
        <ReadingDirectoryModal
          book={directoryBook}
          progress={progressByBookId[directoryBook.id]}
          onClose={() => setDirectoryBookId(null)}
          onOpenItem={(itemIndex, mode) => {
            setDirectoryBookId(null);
            onReadBook(directoryBook.id, { itemIndex, mode });
          }}
        />
      )}
    </div>
  );
}

function UploadProgress({ uploadState }) {
  const percent =
    uploadState.total > 0
      ? Math.round((uploadState.current / uploadState.total) * 100)
      : 8;

  return (
    <section className="mt-6 rounded-xl border border-line bg-paper-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4 text-sm">
        <div>
          <p className="font-medium text-ink">{uploadState.phase}</p>
          <p className="mt-1 text-ink-soft">{uploadState.fileName}</p>
        </div>
        <span className="text-ink-soft">{percent}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}

function EmptyShelf({ onUpload }) {
  return (
    <section className="mt-10 rounded-xl border border-dashed border-line bg-paper-card px-6 py-14 text-center">
      <h3 className="font-serif text-2xl text-ink">从第一本书开始</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-soft">
        当前阶段会先完成本地文本提取、目录猜测和章节确认。图片与表格暂时只作为文本上下文中的弱信息处理。
      </p>
      <button
        onClick={onUpload}
        className="mt-6 rounded-lg border border-accent px-4 py-2 text-sm text-accent transition hover:bg-paper"
      >
        选择 PDF
      </button>
    </section>
  );
}

function BookCard({ book, progress, onSetupBook, onPlanBook, onReadBook, onOpenDirectory }) {
  const sourceText = book.detectionSource === "outline" ? "PDF 目录" : "文本标题";
  const statusText =
    book.status === "planned"
      ? "已规划"
      : book.status === "confirmed"
      ? "已确认"
      : "待确认";
  const roleCounts = countChapterRoles(book.chapters);
  const canPlan = book.status === "confirmed" || book.status === "planned";
  const canRead = book.status === "planned" && book.readingPlan?.items?.length > 0;
  const readingStats = buildReadingStats(book, progress);

  async function handleReadBook() {
    if (readingStats.canAdvanceToNext) {
      await saveReadingProgress(book.id, {
        ...(progress || {}),
        currentItemIndex: readingStats.currentIndex + 1,
      });
    }
    onReadBook(book.id);
  }

  return (
    <article className="rounded-xl border border-line bg-paper-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ink-soft">{statusText}</p>
          <h3 className="mt-1 font-serif text-xl text-ink">{toText(book.title)}</h3>
          {toText(book.author) && (
            <p className="mt-1 text-sm text-ink-soft">{toText(book.author)}</p>
          )}
        </div>
        <span className="rounded-full bg-paper px-3 py-1 text-xs text-ink-soft">
          {book.totalPages} 页
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-ink-soft">章节</dt>
          <dd className="mt-1 text-ink">{book.chapters.length} 个</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">识别方式</dt>
          <dd className="mt-1 text-ink">{sourceText}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-soft">
        <span className="rounded-full bg-paper px-3 py-1">正文 {roleCounts.main}</span>
        <span className="rounded-full bg-paper px-3 py-1">导读 {roleCounts.guide}</span>
        <span className="rounded-full bg-paper px-3 py-1">忽略 {roleCounts.ignore}</span>
        <span className="rounded-full bg-paper px-3 py-1">附录 {roleCounts.appendix}</span>
      </div>
      {canRead && (
        <ReadingProgressSummary stats={readingStats} />
      )}
      {canPlan ? (
        <>
          {canRead && (
            <button
              onClick={handleReadBook}
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2 text-sm text-white transition hover:opacity-90"
            >
              {readingStats.actionLabel}
            </button>
          )}
          <div className={`${canRead ? "mt-2" : "mt-5"} flex flex-wrap gap-2`}>
            {canRead && (
              <button
                onClick={() => onOpenDirectory(book.id)}
                className="flex-1 rounded-lg border border-line px-4 py-2 text-sm text-ink-soft transition hover:bg-paper"
              >
                阅读目录
              </button>
            )}
            <button
              onClick={() => onSetupBook(book.id)}
              className="flex-1 rounded-lg border border-line px-4 py-2 text-sm text-ink-soft transition hover:bg-paper"
            >
              书籍信息
            </button>
            <button
              onClick={() => onPlanBook(book.id)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm transition ${
                canRead
                  ? "border border-line text-ink-soft hover:bg-paper"
                  : "bg-accent text-white hover:opacity-90"
              }`}
            >
              开书设置
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={() => onSetupBook(book.id)}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2 text-sm text-white transition hover:opacity-90"
        >
          完善信息
        </button>
      )}
    </article>
  );
}

function ReadingDirectoryModal({ book, progress = {}, onClose, onOpenItem }) {
  const items = book.readingPlan?.items || [];
  const completedKeys = new Set(progress.completedItemKeys || []);
  const currentIndex = clampIndex(progress.currentItemIndex || 0, items.length);
  const itemLocations = progress.currentPageByItemKey || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="关闭阅读目录"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${toText(book.title)} 阅读目录`}
        className="relative flex max-h-[86vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-paper-card shadow-xl"
      >
        <header className="shrink-0 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-ink-soft">阅读目录</p>
              <h2 className="mt-1 font-serif text-2xl text-ink">{toText(book.title)}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                已读章节适合回顾，未读章节可以直接开始。点击任意一项进入对应内容。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-paper"
            >
              关闭
            </button>
          </div>
        </header>

        <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          {items.map((item, index) => {
            const key = getPlanItemKey(item, index);
            const completed = completedKeys.has(key);
            const savedLocation = itemLocations[key] || null;
            const status = buildDirectoryStatus({
              completed,
              hasSavedLocation: Boolean(savedLocation?.pageNumber),
              isCurrent: index === currentIndex,
              isPast: index < currentIndex,
            });
            const mode = completed ? "review" : savedLocation?.pageNumber ? "reading" : "default";

            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onOpenItem(index, mode)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${status.cardClass}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-2.5 py-1 ${status.badgeClass}`}>
                          {status.label}
                        </span>
                        <span className="text-ink-soft">Day {item.day}</span>
                        <span className="text-ink-soft">
                          {item.type === "guide" ? "开始前准备" : "正文章节"}
                        </span>
                        <span className="text-ink-soft">
                          第 {item.startPage}-{item.endPage} 页
                        </span>
                      </div>
                      <h3 className="mt-2 font-serif text-xl leading-snug text-ink">
                        {item.title}
                      </h3>
                      {savedLocation?.pageNumber && (
                        <p className="mt-2 text-xs text-ink-soft">
                          上次看到第 {savedLocation.pageNumber} 页
                          {savedLocation.updatedAt
                            ? ` · ${formatLastReadTime(savedLocation.updatedAt)}`
                            : ""}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${status.actionClass}`}>
                      {status.actionLabel}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function buildDirectoryStatus({ completed, hasSavedLocation, isCurrent, isPast }) {
  if (completed) {
    return {
      label: "已读",
      actionLabel: "回顾",
      cardClass: "border-emerald-200 bg-emerald-50/80",
      badgeClass: "bg-emerald-100 text-emerald-700",
      actionClass: "bg-white text-emerald-700",
    };
  }

  if (hasSavedLocation) {
    return {
      label: "阅读中",
      actionLabel: "继续",
      cardClass: "border-amber-200 bg-amber-50/80",
      badgeClass: "bg-amber-100 text-amber-700",
      actionClass: "bg-white text-amber-700",
    };
  }

  if (isCurrent) {
    return {
      label: "今日任务",
      actionLabel: "开始",
      cardClass: "border-accent/30 bg-paper",
      badgeClass: "bg-accent/10 text-accent",
      actionClass: "bg-accent text-white",
    };
  }

  if (isPast) {
    return {
      label: "未完成",
      actionLabel: "补读",
      cardClass: "border-line bg-paper",
      badgeClass: "bg-paper-card text-ink-soft",
      actionClass: "bg-paper-card text-ink-soft",
    };
  }

  return {
    label: "未读",
    actionLabel: "开始",
    cardClass: "border-line bg-paper",
    badgeClass: "bg-paper-card text-ink-soft",
    actionClass: "bg-paper-card text-ink-soft",
  };
}

function ReadingProgressSummary({ stats }) {
  return (
    <section className="mt-5 rounded-lg bg-paper px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-xs text-ink-soft">
        <span>阅读进度</span>
        <span>{stats.completedCount} / {stats.totalCount} 项 · {stats.percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-card">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${stats.percent}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-ink-soft">{stats.positionLabel}</p>
          <p className="mt-1 truncate text-ink">{stats.positionText}</p>
          {stats.lastReadText && (
            <p className="mt-1 truncate text-xs text-ink-soft">{stats.lastReadText}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-ink-soft">坚持打卡</p>
          <p className="mt-1 text-ink">{stats.streakDays} 天</p>
        </div>
      </div>
    </section>
  );
}

function countChapterRoles(chapters) {
  return chapters.reduce(
    (counts, chapter) => {
      const role = chapter.role || "main";
      counts[role] = (counts[role] || 0) + 1;
      return counts;
    },
    { ignore: 0, guide: 0, main: 0, appendix: 0 }
  );
}

function buildReadingStats(book, progress = {}) {
  const items = book.readingPlan?.items || [];
  const totalCount = items.length;
  const completedKeys = progress.completedItemKeys || [];
  const completedCount = completedKeys.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentIndex = clampIndex(progress.currentItemIndex || 0, totalCount);
  const currentItem = items[currentIndex];
  const currentKey = getPlanItemKey(currentItem, currentIndex);
  const savedLocation = progress.currentPageByItemKey?.[currentKey] || null;
  const pageNumber = savedLocation?.pageNumber;
  const fallbackPage = currentItem?.startPage;
  const pageText = pageNumber || fallbackPage ? `第 ${pageNumber || fallbackPage} 页` : "还没开始";
  const itemText = currentItem?.title ? currentItem.title : "还没开始";
  const currentCompleted = currentKey ? completedKeys.includes(currentKey) : false;
  const hasSavedLocation = Boolean(savedLocation?.pageNumber);
  const continuing = currentItem && !currentCompleted && hasSavedLocation;
  const allCompleted = totalCount > 0 && completedCount >= totalCount;
  const canAdvanceToNext = Boolean(currentItem && currentCompleted && !allCompleted && currentIndex < totalCount - 1);

  return {
    totalCount,
    completedCount,
    percent,
    currentIndex,
    currentCompleted,
    canAdvanceToNext,
    streakDays: calculateReadingStreak(progress.readingDays || []),
    positionText: currentItem ? `${itemText} · ${pageText}` : "还没开始",
    positionLabel: continuing
      ? "上次读到"
      : allCompleted
      ? "已完成"
      : currentCompleted
      ? "今日已完成"
      : "今日阅读",
    lastReadText: continuing
      ? `上次阅读 ${formatLastReadTime(savedLocation.updatedAt || progress.lastReadAt)}`
      : currentCompleted && !allCompleted
      ? "今天可以在这里停下，也可以提前读下一章"
      : progress.lastReadAt
      ? `最近阅读 ${formatLastReadTime(progress.lastReadAt)}`
      : "",
    actionLabel: continuing
      ? "继续阅读"
      : allCompleted
      ? "回顾阅读"
      : canAdvanceToNext
      ? "提前开始下一章阅读"
      : "开始今日阅读",
  };
}

function getPlanItemKey(item, index) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

function calculateReadingStreak(days) {
  const normalized = [...new Set(days.filter(Boolean))].sort();
  if (normalized.length === 0) return 0;

  let streak = 1;
  let cursor = parseLocalDate(normalized[normalized.length - 1]);

  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    const previous = parseLocalDate(normalized[index]);
    cursor.setDate(cursor.getDate() - 1);
    if (formatLocalDate(previous) !== formatLocalDate(cursor)) break;
    streak += 1;
  }

  return streak;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLastReadTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = formatLocalDate(new Date());
  const targetDay = formatLocalDate(date);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (targetDay === today) return `今天 ${time}`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (targetDay === formatLocalDate(yesterday)) return `昨天 ${time}`;

  return `${targetDay} ${time}`;
}

function clampIndex(index, length) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
