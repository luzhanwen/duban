import { useEffect, useMemo, useState } from "react";
import { getBookPageUnitLabel } from "../lib/bookFormats.js";
import { getBook, updateBook } from "../lib/books.js";
import { guessChapterRole } from "../lib/pdf.js";
import { toText } from "../lib/text.js";

const ROLE_OPTIONS = [
  { value: "ignore", label: "忽略" },
  { value: "guide", label: "导读" },
  { value: "main", label: "正文" },
  { value: "appendix", label: "附录" },
];

export default function BookSetup({ bookId, onBack, onSaved }) {
  const [book, setBook] = useState(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [chapters, setChapters] = useState([]);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const pageUnitLabel = book ? getBookPageUnitLabel(book) : "页";
  const rangeUnitLabel = pageUnitLabel === "页" ? "页码" : pageUnitLabel;

  useEffect(() => {
    getBook(bookId).then((saved) => {
      if (!saved) return;
      setBook(saved);
      setTitle(toEditableText(saved.title));
      setAuthor(toEditableText(saved.author));
      setChapters(normalizeChapters(saved.chapters || []));
    });
  }, [bookId]);

  const validation = useMemo(() => {
    if (!book) return "";
    if (!toEditableText(title).trim()) return "请填写书名。";
    if (chapters.length === 0) return "至少需要保留一个章节。";

    for (const chapter of chapters) {
      if (!chapter.title.trim()) return "每个章节都需要标题。";
      if (chapter.startPage < 1 || chapter.endPage < 1) return `${rangeUnitLabel}不能小于 1。`;
      if (chapter.startPage > chapter.endPage) return `章节起始${rangeUnitLabel}不能大于结束${rangeUnitLabel}。`;
      if (chapter.endPage > book.totalPages) return `结束${rangeUnitLabel}不能超过 ${book.totalPages}。`;
    }

    return "";
  }, [book, chapters, rangeUnitLabel, title]);

  if (!book) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-ink-soft">
        正在读取书籍信息…
      </div>
    );
  }

  function updateChapter(id, field, value) {
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === id
          ? {
              ...chapter,
              [field]:
                field === "title"
                  ? value
                  : field === "role"
                  ? value
                  : Math.max(1, Number.parseInt(value, 10) || 1),
            }
          : chapter
      )
    );
  }

  function addChapter() {
    const last = chapters[chapters.length - 1];
    const startPage = last ? Math.min(last.endPage + 1, book.totalPages) : 1;
    setChapters((current) => [
      ...current,
      {
        id: makeId("chapter"),
        title: `新章节 ${current.length + 1}`,
        startPage,
        endPage: book.totalPages,
        source: "manual",
        role: "main",
      },
    ]);
  }

  function removeChapter(id) {
    if (chapters.length <= 1) {
      setMessage({ type: "error", text: "至少保留一个章节。" });
      return;
    }
    setChapters((current) => current.filter((chapter) => chapter.id !== id));
  }

  async function handleSave() {
    setMessage(null);
    if (validation) {
      setMessage({ type: "error", text: validation });
      return;
    }

    setSaving(true);

    const normalizedChapters = chapters
      .map((chapter) => ({
        ...chapter,
        title: chapter.title.trim(),
        startPage: clampPage(chapter.startPage, book.totalPages),
        endPage: clampPage(chapter.endPage, book.totalPages),
        role: chapter.role || guessChapterRole(chapter.title),
      }))
      .sort((a, b) => a.startPage - b.startPage);

    try {
      const saved = await updateBook(book.id, {
        title: toEditableText(title).trim(),
        author: toEditableText(author).trim(),
        chapters: normalizedChapters,
        status: "confirmed",
      });

      if (saved) {
        setBook(saved);
        setChapters(saved.chapters);
      }
      if (onSaved) onSaved(saved || { id: book.id });
    } catch (e) {
      setMessage({ type: "error", text: e.message || "保存失败，请稍后重试。" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <button onClick={onBack} className="text-sm text-accent underline">
        返回书架
      </button>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-ink-soft">确认书籍信息</p>
          <h2 className="mt-1 font-serif text-3xl text-ink">{book.title}</h2>
        </div>
        <div className="rounded-lg border border-line bg-paper-card px-4 py-2 text-sm text-ink-soft">
          {book.totalPages} {pageUnitLabel} · {book.chapters.length} 个识别章节
        </div>
      </div>

      <section className="mt-8 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            书名
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            作者
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="可留空"
              className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
            />
          </label>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">章节与页码范围</h3>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              先确认每章标题、用途和{rangeUnitLabel}范围。后续阅读计划会优先按“正文”章节生成。
            </p>
          </div>
          <button
            onClick={addChapter}
            className="rounded-lg border border-accent px-3 py-2 text-sm text-accent hover:bg-paper"
          >
            新增章节
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs text-ink-soft">
              <tr>
                <th className="px-3 font-normal">章节标题</th>
                <th className="w-28 px-3 font-normal">用途</th>
                <th className="w-28 px-3 font-normal">起始{pageUnitLabel}</th>
                <th className="w-28 px-3 font-normal">结束{pageUnitLabel}</th>
                <th className="w-24 px-3 font-normal">来源</th>
                <th className="w-20 px-3 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((chapter) => (
                <tr key={chapter.id} className="bg-paper">
                  <td className="rounded-l-lg px-3 py-2">
                    <input
                      value={chapter.title}
                      onChange={(event) =>
                        updateChapter(chapter.id, "title", event.target.value)
                      }
                      className="w-full rounded-md border border-transparent bg-paper-card px-3 py-2 text-ink outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={chapter.role || "main"}
                      onChange={(event) =>
                        updateChapter(chapter.id, "role", event.target.value)
                      }
                      className="w-full rounded-md border border-transparent bg-paper-card px-3 py-2 text-ink outline-none focus:border-accent"
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      max={book.totalPages}
                      value={chapter.startPage}
                      onChange={(event) =>
                        updateChapter(chapter.id, "startPage", event.target.value)
                      }
                      className="w-full rounded-md border border-transparent bg-paper-card px-3 py-2 text-ink outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      max={book.totalPages}
                      value={chapter.endPage}
                      onChange={(event) =>
                        updateChapter(chapter.id, "endPage", event.target.value)
                      }
                      className="w-full rounded-md border border-transparent bg-paper-card px-3 py-2 text-ink outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {sourceLabel(chapter.source)}
                  </td>
                  <td className="rounded-r-lg px-3 py-2">
                    <button
                      onClick={() => removeChapter(chapter.id)}
                      className="text-xs text-red-600 underline"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {message && <Hint message={message} />}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "保存中…" : "保存并进入开书分析"}
        </button>
        <button
          onClick={onBack}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
        >
          稍后再说
        </button>
      </div>
    </div>
  );
}

function Hint({ message }) {
  const color = message.type === "ok" ? "text-green-700" : "text-red-600";
  return <p className={`mt-4 text-sm ${color}`}>{message.text}</p>;
}

function sourceLabel(source) {
  if (source === "outline") return "目录";
  if (source === "manual") return "手动";
  if (source === "fallback") return "默认";
  return "标题";
}

function normalizeChapters(chapters) {
  return chapters.map((chapter) => ({
    ...chapter,
    role: chapter.role || guessChapterRole(chapter.title),
  }));
}

function toEditableText(value) {
  return toText(value);
}

function clampPage(value, totalPages) {
  return Math.max(1, Math.min(Number(value) || 1, totalPages));
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
