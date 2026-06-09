import { useEffect, useRef, useState } from "react";
import { IS_TEST_CHANNEL } from "../lib/appChannel.js";
import {
  BOOK_FILE_ACCEPT,
  BOOK_FORMATS,
  getBookFormat,
  getBookFormatLabel,
  getBookPageUnitLabel,
  isPdfBook,
} from "../lib/bookFormats.js";
import {
  createBookFromParsedFile,
  deleteBook,
  getBookCover,
  getBookFile,
  getReadingProgress,
  listBooks,
  saveReadingProgress,
  saveBookCover,
} from "../lib/books.js";
import { renderPdfFirstPageCover } from "../lib/bookCovers.js";
import { parseMobi } from "../lib/mobi.js";
import { parsePdf } from "../lib/pdf.js";
import {
  formatLocalDate,
  isPlanItemDue,
  parseLocalDate,
} from "../lib/readingSchedule.js";
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
  const [deletingBookId, setDeletingBookId] = useState(null);
  const [uploadState, setUploadState] = useState(null);
  const [error, setError] = useState("");
  const directoryBook = books.find((book) => book.id === directoryBookId) || null;
  const latestReadText = getLatestReadText(progressByBookId);

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
    <div className="bookshelf-page mx-auto max-w-[1480px] px-6 pb-8 pt-7 sm:px-10 lg:px-16">
      <div className="bookshelf-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-sans text-2xl font-semibold leading-tight text-ink">全部</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-sans text-xs text-ink-soft">
            <span>{books.length} 本书</span>
            {latestReadText && <span>上次阅读 · {latestReadText}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
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
              导入测试
            </button>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(uploadState)}
            className="shelf-tool-button"
          >
            上传
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
        <section className="bookshelf-section mt-9">
          <div className="bookshelf-grid">
            {books.map((book, index) => (
              <BookCard
                key={book.id}
                book={book}
                coverIndex={index}
                progress={progressByBookId[book.id]}
                menuOpen={menuBookId === book.id}
                deleting={deletingBookId === book.id}
                onSetupBook={onSetupBook}
                onPlanBook={onPlanBook}
                onReadBook={onReadBook}
                onOpenDirectory={setDirectoryBookId}
                onDeleteBook={handleDeleteBook}
                onToggleMenu={(nextBookId) =>
                  setMenuBookId((currentBookId) =>
                    currentBookId === nextBookId ? null : nextBookId
                  )
                }
                onCloseMenu={() => setMenuBookId(null)}
              />
            ))}
          </div>
          <p className="shelf-count-footer">
            {books.length} 本书
            {latestReadText ? `，上次阅读 ${latestReadText}` : ""}
          </p>
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
  coverIndex,
  progress,
  menuOpen,
  deleting,
  onSetupBook,
  onPlanBook,
  onReadBook,
  onOpenDirectory,
  onDeleteBook,
  onToggleMenu,
  onCloseMenu,
}) {
  const status = getBookStatus(book.status);
  const canPlan = book.status === "confirmed" || book.status === "planned";
  const canRead = book.status === "planned" && book.readingPlan?.items?.length > 0;
  const readingStats = buildReadingStats(book, progress);
  const titleText = toText(book.title) || "未命名书籍";
  const authorText = toText(book.author);
  const accent = getBookAccent(book.id);
  const pageUnitLabel = getBookPageUnitLabel(book);
  const pageCountText = `${book.totalPages} ${pageUnitLabel}`;
  const coverButtonRef = useRef(null);
  const primaryActionLabel = getBookPrimaryActionLabel({
    canPlan,
    canRead,
    readingStats,
  });
  const metaText = getBookShelfMetaText({ canRead, status, readingStats });

  async function handleReadBook() {
    if (readingStats.shouldOpenNextItem) {
      await saveReadingProgress(book.id, {
        ...(progress || {}),
        currentItemIndex: readingStats.actionItemIndex,
      });
    }
    onReadBook(book.id);
  }

  async function handlePrimaryAction() {
    if (!canPlan) {
      onSetupBook(book.id);
      return;
    }

    if (!canRead) {
      onPlanBook(book.id);
      return;
    }

    await handleReadBook();
  }

  function handleCoverPointerMove(event) {
    if (event.pointerType === "touch") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = coverButtonRef.current;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - y) * 12;
    const rotateY = (x - 0.5) * 14;

    target.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
    target.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
    target.style.setProperty("--shine-x", `${(x * 100).toFixed(1)}%`);
    target.style.setProperty("--shine-y", `${(y * 100).toFixed(1)}%`);
  }

  function resetCoverTilt() {
    const target = coverButtonRef.current;
    if (!target) return;

    target.style.setProperty("--tilt-x", "0deg");
    target.style.setProperty("--tilt-y", "0deg");
    target.style.setProperty("--shine-x", "50%");
    target.style.setProperty("--shine-y", "50%");
  }

  return (
    <article
      className={`book-card book-cover-card relative ${menuOpen ? "z-20" : "z-0"}`}
      style={{
        "--book-accent": accent.main,
        "--book-accent-soft": accent.soft,
        "--book-cover-delay": `${Math.min(coverIndex, 16) * 42}ms`,
      }}
    >
      <div className="book-cover-shell">
        <button
          ref={coverButtonRef}
          type="button"
          onClick={handlePrimaryAction}
          onPointerMove={handleCoverPointerMove}
          onPointerLeave={resetCoverTilt}
          onPointerCancel={resetCoverTilt}
          disabled={deleting}
          aria-label={`${primaryActionLabel}《${titleText}》`}
          className="book-cover-button"
        >
          <BookCoverImage
            book={book}
            titleText={titleText}
            authorText={authorText}
            accent={accent}
          />
          <div className="book-cover-overlay">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${status.className}`}>
                  {status.label}
                </span>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                  {pageCountText}
                </span>
              </div>
              {canRead && (
                <div className="mt-3">
                  <div className="h-1 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full bg-[var(--app-primary)]"
                      style={{ width: `${readingStats.percent}%` }}
                    />
                  </div>
                  <p className="mt-2 truncate text-xs font-medium text-white">
                    {readingStats.positionText}
                  </p>
                </div>
              )}
              <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[var(--app-primary)] shadow-sm">
                {primaryActionLabel}
              </span>
            </div>
          </div>
        </button>

      </div>

      <div className="book-cover-meta-row" data-book-menu>
        <span className="truncate">{metaText}</span>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`打开《${titleText}》操作菜单`}
            onClick={() => onToggleMenu(book.id)}
            disabled={deleting}
            className="book-cover-more-button"
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
      </div>
    </article>
  );
}

function BookCoverImage({ book, titleText, authorText, accent }) {
  const [coverUrl, setCoverUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadCover() {
      setLoading(true);
      try {
        const cached = await getBookCover(book.id);
        if (cached) {
          if (alive) setCoverUrl(cached);
          return;
        }

        if (isPdfBook(book)) {
          const file = await getBookFile(book.id);
          if (file) {
            const nextCoverUrl = await renderPdfFirstPageCover(file);
            await saveBookCover(book.id, nextCoverUrl);
            if (alive) setCoverUrl(nextCoverUrl);
          }
        }
      } catch {
        if (alive) setCoverUrl("");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadCover();
    return () => {
      alive = false;
    };
  }, [book]);

  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={`《${titleText}》封面`}
        className="h-full w-full bg-white object-contain"
      />
    );
  }

  return (
    <BookCoverFallback
      titleText={titleText}
      authorText={authorText}
      accent={accent}
      loading={loading}
    />
  );
}

function BookCoverFallback({ titleText, authorText, accent, loading }) {
  return (
    <div
      className="book-cover-fallback flex h-full w-full flex-col justify-between p-5"
      style={{
        "--book-accent": accent.main,
        "--book-accent-soft": accent.soft,
      }}
    >
      <div className="h-1 w-10 rounded-full bg-white/70" />
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">
          {loading ? "Loading" : "Duban"}
        </p>
        <h4 className="mt-3 line-clamp-5 text-xl font-medium leading-snug text-white">
          {titleText}
        </h4>
        {authorText && (
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-white/80">
            {authorText}
          </p>
        )}
      </div>
      <div className="h-1 w-14 rounded-full bg-white/65" />
    </div>
  );
}

function getBookPrimaryActionLabel({ canPlan, canRead, readingStats }) {
  if (!canPlan) return "完善信息";
  if (!canRead) return "继续开书设置";
  return readingStats.actionLabel;
}

function getBookShelfMetaText({ canRead, status, readingStats }) {
  if (!canRead) return status.label;
  if (readingStats.percent >= 100) return "已读完";
  return `${readingStats.percent}%`;
}

function CompactReadingHint({ stats }) {
  return (
    <section className="book-card-summary relative mt-5 rounded-lg px-4 py-4 pr-10">
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
      {stats.lastReadDateText && (
        <p className="mt-2 truncate text-[11px] font-medium text-ink-soft">
          上次阅读 · {stats.lastReadDateText}
        </p>
      )}
      <span className="book-card-summary-cue" aria-hidden="true" />
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
      className="absolute right-0 top-7 z-30 w-40 rounded-lg border border-line bg-paper-card p-1 text-sm shadow-lg"
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
      <div className="mt-4 text-xs">
        <DatePill label="上次阅读" value={stats.lastReadDateText || "还没有"} />
      </div>
    </section>
  );
}

function DatePill({ label, value }) {
  return (
    <div className="rounded-lg bg-paper-card px-3 py-2">
      <p className="text-[11px] font-medium text-ink-soft">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-ink">{value}</p>
    </div>
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
  const nextIndex = currentIndex + 1;
  const nextItem = items[nextIndex];
  const nextKey = getPlanItemKey(nextItem, nextIndex);
  const currentCompleted = currentKey ? completedKeys.includes(currentKey) : false;
  const allCompleted = totalCount > 0 && completedCount >= totalCount;
  const nextDue = Boolean(nextItem && isPlanItemDue(nextItem));
  const shouldPromoteNext = Boolean(currentCompleted && !allCompleted && nextDue);
  const canAdvanceToNext = Boolean(currentItem && currentCompleted && !allCompleted && nextItem);
  const actionItemIndex = canAdvanceToNext ? nextIndex : currentIndex;
  const actionItem = shouldPromoteNext ? nextItem : currentItem;
  const actionKey = shouldPromoteNext ? nextKey : currentKey;
  const savedLocation = progress.currentPageByItemKey?.[actionKey] || null;
  const pageNumber = savedLocation?.pageNumber;
  const fallbackPage = actionItem?.startPage;
  const pageUnitLabel = getBookPageUnitLabel(book);
  const pageText =
    pageNumber || fallbackPage
      ? formatBookPageLabel(pageNumber || fallbackPage, pageUnitLabel)
      : "还没开始";
  const itemText = actionItem?.title ? actionItem.title : "还没开始";
  const hasSavedLocation = Boolean(savedLocation?.pageNumber);
  const actionCompleted = actionKey ? completedKeys.includes(actionKey) : false;
  const continuing = actionItem && !actionCompleted && hasSavedLocation;
  const actionItemDue = actionItem ? isPlanItemDue(actionItem) : true;
  const shouldOpenNextItem = shouldPromoteNext || canAdvanceToNext;
  const lastReadDateText = progress.lastReadAt ? formatLastReadTime(progress.lastReadAt) : "";

  return {
    totalCount,
    completedCount,
    percent,
    currentIndex,
    currentCompleted,
    canAdvanceToNext,
    shouldOpenNextItem,
    actionItemIndex,
    lastReadDateText,
    streakDays: calculateReadingStreak(progress.readingDays || []),
    positionText: actionItem ? `${itemText} · ${pageText}` : "还没开始",
    positionLabel: continuing
      ? "上次读到"
      : allCompleted
      ? "已完成"
      : shouldPromoteNext
      ? "今日阅读"
      : currentCompleted
      ? "今日已完成"
      : !actionItemDue
      ? "未到阅读日"
      : "今日阅读",
    lastReadText: continuing
      ? `上次阅读 ${formatLastReadTime(savedLocation.updatedAt || progress.lastReadAt)}`
      : shouldPromoteNext
      ? "下一项已经到了今天，可以继续"
      : currentCompleted && !allCompleted
      ? "今天可以在这里停下，也可以提前读下一章"
      : progress.lastReadAt
      ? `最近阅读 ${formatLastReadTime(progress.lastReadAt)}`
      : "",
    actionLabel: continuing
      ? "继续阅读"
      : allCompleted
      ? "回顾阅读"
      : shouldPromoteNext
      ? "开始今日阅读"
      : canAdvanceToNext
      ? "提前开始下一章阅读"
      : !actionItemDue
      ? "提前开始阅读"
      : "开始今日阅读",
  };
}

function getPlanItemKey(item, index) {
  return item?.id || `${item?.type || "item"}:${index}`;
}

function getLatestReadText(progressByBookId) {
  const latest = Object.values(progressByBookId || {})
    .map((progress) => progress?.lastReadAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return latest ? formatLastReadTime(latest) : "";
}

function calculateReadingStreak(days) {
  const normalized = [...new Set(days.filter(Boolean))].sort();
  if (normalized.length === 0) return 0;

  let streak = 1;
  let cursor = parseLocalDate(normalized[normalized.length - 1]);
  if (!cursor) return 0;

  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    const previous = parseLocalDate(normalized[index]);
    if (!previous) continue;
    cursor.setDate(cursor.getDate() - 1);
    if (formatLocalDate(previous) !== formatLocalDate(cursor)) break;
    streak += 1;
  }

  return streak;
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
