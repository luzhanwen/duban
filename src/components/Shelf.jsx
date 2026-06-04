import { useEffect, useRef, useState } from "react";
import { createBookFromPdf, listBooks } from "../lib/books.js";
import { parsePdf } from "../lib/pdf.js";
import { toText } from "../lib/text.js";

const TEST_BOOK = {
  fileName: "万历十五年（经典版）.pdf",
  url: "/test-books/wanli15.pdf",
};

export default function Shelf({ onSetupBook, onPlanBook, onReadBook }) {
  const inputRef = useRef(null);
  const [books, setBooks] = useState([]);
  const [uploadState, setUploadState] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    refreshBooks();
  }, []);

  async function refreshBooks() {
    const saved = await listBooks();
    setBooks(saved);
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
            上传一本 PDF，先在本地提取文本与章节。确认书籍信息之后，再进入阅读目标和计划。
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

      {import.meta.env.DEV && (
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
              onSetupBook={onSetupBook}
              onPlanBook={onPlanBook}
              onReadBook={onReadBook}
            />
          ))}
        </div>
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

function BookCard({ book, onSetupBook, onPlanBook, onReadBook }) {
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
      {canPlan ? (
        <>
          {canRead && (
            <button
              onClick={() => onReadBook(book.id)}
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2 text-sm text-white transition hover:opacity-90"
            >
              开始阅读
            </button>
          )}
          <div className={`${canRead ? "mt-2" : "mt-5"} flex flex-wrap gap-2`}>
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
              阅读节奏
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
