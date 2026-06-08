import { useEffect, useRef, useState } from "react";
import { IS_TEST_CHANNEL } from "../lib/appChannel.js";
import {
  BOOK_FILE_ACCEPT,
  BOOK_FORMATS,
  getBookFormat,
  getBookFormatLabel,
  getBookPageUnitLabel,
} from "../lib/bookFormats.js";
import {
  createBookFromParsedFile,
  deleteBook,
  getReadingProgress,
  listBooks,
  saveReadingProgress,
} from "../lib/books.js";
import { parseMobi } from "../lib/mobi.js";
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
  const [menuBookId, setMenuBookId] = useState(null);
  const [expandedBookId, setExpandedBookId] = useState(null);
  const [deletingBookId, setDeletingBookId] = useState(null);
  const [uploadState, setUploadState] = useState(null);
  const [error, setError] = useState("");
  const directoryBook = books.find((book) => book.id === directoryBookId) || null;

  useEffect(() => {
    refreshBooks();
  }, []);

  useEffect(() => {
    if (!menuBookId) return undefined;

    function closeMenu(event) {
      if (event.target?.closest?.("[data-book-menu]")) return;
      setMenuBookId(null);
    }

    function closeWithEscape(event) {
      if (event.key === "Escape") setMenuBookId(null);
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [menuBookId]);

  async function refreshBooks() {
    const saved = await listBooks();
    const progressEntries = await Promise.all(
      saved.map(async (book) => [book.id, await getReadingProgress(book.id)])
    );
    setBooks(saved);
    setProgressByBookId(Object.fromEntries(progressEntries));
  }

  async function importBookFile(file) {
    const format = getBookFormat(file);
    const formatLabel = getBookFormatLabel(format);

    if (!format) {
      setError("请上传 PDF 或 MOBI 文件。");
      return;
    }

    setError("");
    setUploadState({ fileName: file.name, current: 0, total: 0, phase: `解析 ${formatLabel}` });

    try {
      const parser = format === BOOK_FORMATS.mobi ? parseMobi : parsePdf;
      const parsed = await parser(file, ({ current, total }) => {
        setUploadState({ fileName: file.name, current, total, phase: "提取文本" });
      });
      setUploadState({
        fileName: file.name,
        current: parsed.totalPages,
        total: parsed.totalPages,
        phase: "保存到本地",
      });
      const book = await createBookFromParsedFile(file, parsed);
      await refreshBooks();
      setUploadState(null);
      onSetupBook(book.id);
    } catch (e) {
      setUploadState(null);
      setError(e.message || `${formatLabel} 解析失败，请换一本书重试。`);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    await importBookFile(file);
  }

  async function handleImportTestBook() {
    try {
      const response = await fetch(TEST_BOOK.url);
      if (!response.ok) throw new Error("测试书文件读取失败。");
      const blob = await response.blob();
      const file = new File([blob], TEST_BOOK.fileName, { type: "application/pdf" });
      await importBookFile(file);
    } catch (e) {
      setUploadState(null);
      setError(e.message || "测试书导入失败，请稍后重试。");
    }
  }

  async function handleDeleteBook(book) {
    const title = toText(book.title) || "这本书";
    setMenuBookId(null);

    const confirmed = window.confirm(
      `确定从书架删除《${title}》吗？\n\n原始文件、阅读计划、进度、笔记和问答记录都会从本地移除。`
    );
    if (!confirmed) return;

    setError("");
    setDeletingBookId(book.id);
    try {
      await deleteBook(book.id);
      if (directoryBookId === book.id) setDirectoryBookId(null);
      await refreshBooks();
    } catch (e) {
      setError(e.message || "删除失败，请稍后重试。");
    } finally {
      setDeletingBookId(null);
    }
  }

  return (
    <div className="literary-ui mx-auto max-w-5xl px-5 py-7 sm:px-6 sm:py-9">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-medium leading-tight text-ink">书架</h2>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            {books.length > 0
              ? `${books.length} 本书在这里，继续今天的阅读。`
              : "上传一本 PDF 或 MOBI，先完成本地文本提取、目录识别和书籍信息确认。"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            type="file"
            accept={BOOK_FILE_ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />
          {IS_TEST_CHANNEL && (
            <button
              type="button"
              onClick={handleImportTestBook}
              disabled={Boolean(uploadState)}
              className="shelf-tool-button"
            >
              导入测试书
            </button>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(uploadState)}
            className="shelf-tool-button"
          >
            上传书籍
          </button>
        </div>
      </div>

      {uploadState && <UploadProgress uploadState={uploadState} />}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {books.length === 0 ? (
        <EmptyShelf onUpload={() => inputRef.current?.click()} />
      ) : (
        <section className="mt-8">
          <div className="bookshelf-grid grid gap-5 lg:grid-cols-2">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                progress={progressByBookId[book.id]}
                menuOpen={menuBookId === book.id}
                expanded={expandedBookId === book.id}
                deleting={deletingBookId === book.id}
                onSetupBook={onSetupBook}
                onPlanBook={onPlanBook}
                onReadBook={onReadBook}
                onOpenDirectory={setDirectoryBookId}
                onDeleteBook={handleDeleteBook}
                onExpandBook={setExpandedBookId}
                onCollapseBook={(bookId) =>
                  setExpandedBookId((currentBookId) =>
                    currentBookId === bookId ? null : currentBookId
                  )
                }
                onToggleMenu={(nextBookId) =>
                  setMenuBookId((currentBookId) =>
                    currentBookId === nextBookId ? null : nextBookId
                  )
                }
                onCloseMenu={() => setMenuBookId(null)}
              />
            ))}
          </div>
        </section>
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
    <section className="mt-6 rounded-lg border border-line bg-paper-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4 text-sm">
        <div>
          <p className="font-medium text-ink">{uploadState.phase}</p>
          <p className="mt-1 text-ink-soft">{uploadState.fileName}</p>
        </div>
        <span className="text-ink-soft">{percent}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper">
        <div
          className="h-full rounded-full bg-ink-soft/40 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}

function EmptyShelf({ onUpload }) {
  return (
    <section className="mt-10 rounded-lg border border-dashed border-line bg-paper-card px-6 py-14 text-center shadow-sm">
      <div className="empty-shelf-illustration mx-auto mb-7 flex h-28 max-w-sm items-end justify-center gap-2">
        <span className="h-20 w-8 rounded-t-md bg-[#6f8f72]" />
        <span className="h-24 w-9 rounded-t-md bg-[#8d83a8]" />
        <span className="h-16 w-7 rounded-t-md bg-[#5b7f95]" />
        <span className="h-[5.5rem] w-8 rounded-t-md bg-[#9a8d63]" />
      </div>
      <h3 className="font-serif text-2xl text-ink">从第一本书开始</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-soft">
        当前阶段会先完成本地文本提取、目录猜测和章节确认。图片与表格暂时只作为文本上下文中的弱信息处理。
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="shelf-tool-button mt-6"
      >
        选择书籍
      </button>
    </section>
  );
}

function BookCard({
  book,
  progress,
  menuOpen,
  expanded,
  deleting,
  onSetupBook,
  onPlanBook,
  onReadBook,
  onOpenDirectory,
  onDeleteBook,
  onExpandBook,
  onCollapseBook,
  onToggleMenu,
  onCloseMenu,
}) {
  const sourceText = getDetectionSourceText(book);
  const status = getBookStatus(book.status);
  const roleCounts = countChapterRoles(book.chapters);
  const canPlan = book.status === "confirmed" || book.status === "planned";
  const canRead = book.status === "planned" && book.readingPlan?.items?.length > 0;
  const readingStats = buildReadingStats(book, progress);
  const titleText = toText(book.title) || "未命名书籍";
  const authorText = toText(book.author);
  const accent = getBookAccent(book.id);
  const pageUnitLabel = getBookPageUnitLabel(book);
  const pageCountText = `${book.totalPages} ${pageUnitLabel}`;

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
    <article
      onMouseLeave={() => onCollapseBook(book.id)}
      className={`book-card relative flex flex-col rounded-lg border border-line bg-paper-card p-6 transition duration-200 hover:-translate-y-1 focus-within:shadow-md ${
        expanded ? "book-card-expanded" : ""
      } ${
        menuOpen ? "z-20" : "z-0"
      }`}
      style={{
        "--book-accent": accent.main,
        "--book-accent-soft": accent.soft,
      }}
    >
      <div className="absolute right-6 top-6 z-10" data-book-menu>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`打开《${titleText}》操作菜单`}
          onClick={() => onToggleMenu(book.id)}
          disabled={deleting}
          className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-paper-card text-lg leading-none text-ink-soft transition hover:bg-paper hover:text-ink disabled:opacity-50"
        >
          ⋯
        </button>
        {menuOpen && (
          <BookActionMenu
            book={book}
            canPlan={canPlan}
            canRead={canRead}
            deleting={deleting}
            onSetupBook={onSetupBook}
            onPlanBook={onPlanBook}
            onOpenDirectory={onOpenDirectory}
            onDeleteBook={onDeleteBook}
            onCloseMenu={onCloseMenu}
          />
        )}
      </div>

      <div
        className="book-card-expand-zone"
        onMouseEnter={() => onExpandBook(book.id)}
      >
        <div className="book-card-header pr-12">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
              <span className="rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft">
                {pageCountText}
              </span>
            </div>
          </div>
          <h3 className="mt-5 line-clamp-2 text-[26px] font-medium leading-snug text-ink">
            {titleText}
          </h3>
          {authorText && (
            <p className="mt-2 truncate text-base text-ink-soft">{authorText}</p>
          )}
        </div>
        </div>

        {canRead && <CompactReadingHint stats={readingStats} />}

        <div className="book-card-details">
          <div className="book-card-details-inner">
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg bg-paper/70 px-3 py-2.5">
                <dt className="text-xs font-medium text-ink-soft">{pageUnitLabel}</dt>
                <dd className="mt-1 text-sm font-medium text-ink">{book.totalPages}</dd>
              </div>
              <div className="rounded-lg bg-paper/70 px-3 py-2.5">
                <dt className="text-xs font-medium text-ink-soft">章节</dt>
                <dd className="mt-1 text-sm font-medium text-ink">{book.chapters.length}</dd>
              </div>
              <div className="rounded-lg bg-paper/70 px-3 py-2.5">
                <dt className="text-xs font-medium text-ink-soft">识别</dt>
                <dd className="mt-1 truncate text-sm font-medium text-ink">{sourceText}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-ink-soft">
              <span className="rounded-full bg-paper px-3 py-1.5">正文 {roleCounts.main}</span>
              <span className="rounded-full bg-paper px-3 py-1.5">导读 {roleCounts.guide}</span>
              <span className="rounded-full bg-paper px-3 py-1.5">忽略 {roleCounts.ignore}</span>
              <span className="rounded-full bg-paper px-3 py-1.5">附录 {roleCounts.appendix}</span>
            </div>
            {canRead && <ReadingDetailSummary stats={readingStats} />}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-5">
        {canPlan ? (
          canRead ? (
            <button
              type="button"
              onClick={handleReadBook}
              disabled={deleting}
              className="book-primary-button w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
            >
              {readingStats.actionLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPlanBook(book.id)}
              disabled={deleting}
              className="book-primary-button w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
            >
              继续开书设置
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => onSetupBook(book.id)}
            disabled={deleting}
            className="book-primary-button w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
          >
            完善信息
          </button>
        )}
      </div>
    </article>
  );
}

function CompactReadingHint({ stats }) {
  return (
    <section className="book-card-summary mt-5 rounded-lg px-4 py-4">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-ink-soft">
        <span>{stats.positionLabel}</span>
        <span>{stats.percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full rounded-full bg-[var(--app-primary)]"
          style={{ width: `${stats.percent}%` }}
        />
      </div>
      <p className="mt-3 truncate text-sm font-medium text-ink">{stats.positionText}</p>
    </section>
  );
}

function BookActionMenu({
  book,
  canPlan,
  canRead,
  deleting,
  onSetupBook,
  onPlanBook,
  onOpenDirectory,
  onDeleteBook,
  onCloseMenu,
}) {
  function chooseAction(action) {
    onCloseMenu();
    action();
  }

  return (
    <div
      role="menu"
      className="absolute right-0 top-10 z-30 w-40 rounded-lg border border-line bg-paper-card p-1 text-sm shadow-lg"
    >
      {canRead && (
        <MenuItem onClick={() => chooseAction(() => onOpenDirectory(book.id))}>
          阅读目录
        </MenuItem>
      )}
      <MenuItem onClick={() => chooseAction(() => onSetupBook(book.id))}>
        书籍信息
      </MenuItem>
      {canPlan && (
        <MenuItem onClick={() => chooseAction(() => onPlanBook(book.id))}>
          开书设置
        </MenuItem>
      )}
      <div className="my-1 h-px bg-line" />
      <MenuItem danger disabled={deleting} onClick={() => onDeleteBook(book)}>
        {deleting ? "删除中" : "删除书籍"}
      </MenuItem>
    </div>
  );
}

function MenuItem({ children, danger = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-md px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-ink-soft hover:bg-paper hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

const BOOK_ACCENTS = [
  { main: "#9c6b3f", soft: "#f4eadf" },
  { main: "#8f7f4d", soft: "#f3efdf" },
  { main: "#a66f52", soft: "#f5e7df" },
  { main: "#7f8f68", soft: "#edf2e5" },
  { main: "#a8875f", soft: "#f4ecdf" },
  { main: "#8d735e", soft: "#f1e8df" },
];

function getBookAccent(id = "") {
  const text = String(id);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return BOOK_ACCENTS[hash % BOOK_ACCENTS.length];
}

function getDetectionSourceText(book) {
  if (book.detectionSource === "outline") return "PDF 目录";
  if (book.detectionSource === "toc") return "MOBI 目录";
  if (book.detectionSource === "spine") return "MOBI 顺序";
  if (book.detectionSource === "fallback") return "默认";
  return "文本标题";
}

function formatBookPageRange(startPage, endPage, pageUnitLabel = "页") {
  if (pageUnitLabel === "文本页") return `文本页 ${startPage}-${endPage}`;
  return `第 ${startPage}-${endPage} 页`;
}

function formatBookPageLabel(pageNumber, pageUnitLabel = "页") {
  if (pageUnitLabel === "文本页") return `文本页 ${pageNumber}`;
  return `第 ${pageNumber} 页`;
}

function getBookStatus(status) {
  if (status === "planned") {
    return {
      label: "已规划",
      className: "bg-[#f0eadc] text-[#7a5c33]",
    };
  }

  if (status === "confirmed") {
    return {
      label: "已确认",
      className: "bg-[#edf2e5] text-[#64724a]",
    };
  }

  return {
    label: "待确认",
    className: "bg-amber-50 text-amber-700",
  };
}

function ReadingDirectoryModal({ book, progress = {}, onClose, onOpenItem }) {
  const items = book.readingPlan?.items || [];
  const completedKeys = new Set(progress.completedItemKeys || []);
  const currentIndex = clampIndex(progress.currentItemIndex || 0, items.length);
  const itemLocations = progress.currentPageByItemKey || {};
  const pageUnitLabel = getBookPageUnitLabel(book);

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
                          {formatBookPageRange(item.startPage, item.endPage, pageUnitLabel)}
                        </span>
                      </div>
                      <h3 className="mt-2 font-serif text-xl leading-snug text-ink">
                        {item.title}
                      </h3>
                      {savedLocation?.pageNumber && (
                        <p className="mt-2 text-xs text-ink-soft">
                          上次看到{formatBookPageLabel(savedLocation.pageNumber, pageUnitLabel)}
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

function ReadingDetailSummary({ stats }) {
  return (
    <section className="mt-5 rounded-lg bg-paper/70 px-4 py-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-medium text-ink-soft">{stats.positionLabel}</p>
          <p className="mt-1.5 truncate font-medium text-ink">{stats.positionText}</p>
          {stats.lastReadText && (
            <p className="mt-1 truncate text-xs text-ink-soft">{stats.lastReadText}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-ink-soft">坚持打卡</p>
          <p className="mt-1.5 font-medium text-ink">{stats.streakDays} 天</p>
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
  const pageUnitLabel = getBookPageUnitLabel(book);
  const pageText =
    pageNumber || fallbackPage
      ? formatBookPageLabel(pageNumber || fallbackPage, pageUnitLabel)
      : "还没开始";
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
