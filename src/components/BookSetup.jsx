import { useEffect, useMemo, useState } from "react";
import { getBookPageUnitLabel } from "../lib/bookFormats.js";
import { getBook, updateBook } from "../lib/books.js";
import {
  isChapterIncluded,
  normalizeChapterReadingChoice,
  normalizeChapterReadingChoices,
} from "../lib/chapterRoles.js";
import { toText } from "../lib/text.js";

const ROLE_OPTIONS = [
  { value: "ignore", label: "信息页" },
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
  const includedChapterCount = useMemo(
    () => chapters.filter(isChapterIncluded).length,
    [chapters]
  );

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
    if (!chapters.some(isChapterIncluded)) return "请至少选择一个要阅读的章节。";

    for (const chapter of chapters) {
      if (!chapter.title.trim()) return "每个章节都需要标题。";
      if (chapter.startPage < 1 || chapter.endPage < 1) return `${rangeUnitLabel}请填写 1 或更大的数字。`;
      if (chapter.startPage > chapter.endPage) return `章节起始${rangeUnitLabel}请早于或等于结束${rangeUnitLabel}。`;
      if (chapter.endPage > book.totalPages) return `结束${rangeUnitLabel}请填写在 ${book.totalPages} 以内。`;
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
                  : field === "includeInReading"
                  ? Boolean(value)
                  : Math.max(1, Number.parseInt(value, 10) || 1),
              ...(field === "role" ? { roleConfirmed: true } : {}),
              ...(field === "includeInReading"
                ? { includeInReadingConfirmed: true }
                : {}),
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
        roleConfirmed: true,
        includeInReading: true,
        includeInReadingConfirmed: true,
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
        ...normalizeChapterReadingChoice(chapter),
        title: chapter.title.trim(),
        startPage: clampPage(chapter.startPage, book.totalPages),
        endPage: clampPage(chapter.endPage, book.totalPages),
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
    <div className="book-setup-page">
      <div className="book-setup-shell">
        <header className="book-setup-header">
          <button type="button" onClick={onBack} className="book-setup-back">
            返回书架
          </button>
          <div className="book-setup-heading-row">
            <div className="book-setup-heading-copy">
              <p>确认书籍信息</p>
              <h2>{book.title}</h2>
            </div>
            <div className="book-setup-summary" aria-label="识别结果">
              <span>{book.totalPages} {pageUnitLabel}</span>
              <span>{chapters.length} 个章节</span>
              <strong>已选 {includedChapterCount} 个</strong>
            </div>
          </div>
        </header>

        <section className="book-setup-metadata" aria-label="书籍基本信息">
          <label>
            <span>书名</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>作者</span>
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="可留空"
            />
          </label>
        </section>

        <section className="book-setup-chapters" aria-labelledby="book-setup-chapters-title">
          <div className="book-setup-chapters-header">
            <div>
              <h3 id="book-setup-chapters-title">章节与{rangeUnitLabel}范围</h3>
              <p>确认内容类型，再逐章决定是否纳入阅读计划。</p>
            </div>
            <button type="button" onClick={addChapter} className="book-setup-add">
              新增章节
            </button>
          </div>

          <div className="book-setup-chapter-list" role="table" aria-label="章节设置">
            <div className="book-setup-chapter-columns" role="row">
              <span role="columnheader">章节标题</span>
              <span role="columnheader">内容类型</span>
              <span role="columnheader">是否阅读</span>
              <span role="columnheader">起始{pageUnitLabel}</span>
              <span role="columnheader">结束{pageUnitLabel}</span>
              <span role="columnheader">来源</span>
              <span role="columnheader">操作</span>
            </div>

            <div className="book-setup-chapter-rows" role="rowgroup">
              {chapters.map((chapter) => {
                const included = isChapterIncluded(chapter);
                return (
                  <div
                    key={chapter.id}
                    className={`book-setup-chapter-row ${included ? "" : "is-excluded"}`}
                    role="row"
                  >
                    <label className="book-setup-chapter-title" role="cell">
                      <span className="book-setup-mobile-label">章节标题</span>
                      <input
                        value={chapter.title}
                        onChange={(event) =>
                          updateChapter(chapter.id, "title", event.target.value)
                        }
                      />
                    </label>

                    <label className="book-setup-chapter-role" role="cell">
                      <span className="book-setup-mobile-label">内容类型</span>
                      <select
                        value={chapter.role || "main"}
                        onChange={(event) =>
                          updateChapter(chapter.id, "role", event.target.value)
                        }
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="book-setup-chapter-reading" role="cell">
                      <span className="book-setup-mobile-label">是否阅读</span>
                      <span className="book-setup-reading-control">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={(event) =>
                            updateChapter(
                              chapter.id,
                              "includeInReading",
                              event.target.checked
                            )
                          }
                          aria-label={`${chapter.title}：${included ? "纳入阅读" : "不纳入阅读"}`}
                        />
                        <span className="book-setup-reading-switch" aria-hidden="true" />
                        <span>{included ? "阅读" : "不读"}</span>
                      </span>
                    </label>

                    <label className="book-setup-chapter-start" role="cell">
                      <span className="book-setup-mobile-label">起始{pageUnitLabel}</span>
                      <input
                        type="number"
                        min="1"
                        max={book.totalPages}
                        value={chapter.startPage}
                        onChange={(event) =>
                          updateChapter(chapter.id, "startPage", event.target.value)
                        }
                      />
                    </label>

                    <label className="book-setup-chapter-end" role="cell">
                      <span className="book-setup-mobile-label">结束{pageUnitLabel}</span>
                      <input
                        type="number"
                        min="1"
                        max={book.totalPages}
                        value={chapter.endPage}
                        onChange={(event) =>
                          updateChapter(chapter.id, "endPage", event.target.value)
                        }
                      />
                    </label>

                    <div className="book-setup-chapter-source" role="cell">
                      <span className="book-setup-mobile-label">来源</span>
                      <span>{sourceLabel(chapter.source)}</span>
                    </div>

                    <div className="book-setup-chapter-action" role="cell">
                      <button type="button" onClick={() => removeChapter(chapter.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="book-setup-actions">
          <div className="book-setup-action-message">
            {message && <Hint message={message} />}
          </div>
          <div className="book-setup-action-buttons">
            <button type="button" onClick={onBack} className="is-secondary">
              稍后再说
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="is-primary">
              {saving ? "保存中…" : "保存并设定读伴"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Hint({ message }) {
  return <p className={`book-setup-hint is-${message.type}`}>{message.text}</p>;
}

function sourceLabel(source) {
  if (source === "outline") return "目录";
  if (source === "manual") return "手动";
  if (source === "fallback") return "默认";
  return "标题";
}

function normalizeChapters(chapters) {
  return normalizeChapterReadingChoices(chapters);
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
