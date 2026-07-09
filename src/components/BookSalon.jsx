import { useEffect, useMemo, useState } from "react";
import { BrandName } from "./BrandLogo.jsx";
import ChineseIcon from "./ChineseIcon.jsx";
import ReadingCompanionAvatar from "./ReadingCompanionAvatar.jsx";
import { getBookPageUnitLabel } from "../lib/bookFormats.js";
import { BOOK_COMPANION_CHAT_ITEM_KEY, getBookCompanionChat } from "../lib/bookCompanionChat.js";
import { getBook, getReadingProgress } from "../lib/books.js";
import { getAllReadingNotes, updateReadingNote, deleteReadingNote } from "../lib/notes.js";
import { getPlanItemKey } from "../lib/readingGuides.js";
import { getItem, KEYS } from "../lib/storage.js";
import { toText } from "../lib/text.js";
import { normalizeWholeBookGuide } from "../lib/wholeBookGuide.js";

const NOTE_FILTERS = [
  { id: "all", label: "全部" },
  { id: "notes", label: "手记" },
  { id: "highlights", label: "摘录" },
  { id: "companion", label: "读伴" },
];

const SALON_PANELS = [
  {
    id: "notes",
    label: "笔记",
    title: "笔记整理",
  },
  {
    id: "knowledge",
    label: "重点",
    title: "重点线索",
  },
  {
    id: "review",
    label: "复盘",
    title: "阶段复盘",
  },
];

export default function BookSalon({
  bookId,
  onBack,
  onReadBook,
  onPlanBook,
  onChatBook,
}) {
  const [book, setBook] = useState(null);
  const [progress, setProgress] = useState(null);
  const [notes, setNotes] = useState([]);
  const [bookChat, setBookChat] = useState([]);
  const [reflections, setReflections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(false);
  const [activePanel, setActivePanel] = useState("notes");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const [savedBook, savedProgress, savedNotes, savedChat, reflectionStore] =
        await Promise.all([
          getBook(bookId),
          getReadingProgress(bookId),
          getAllReadingNotes(bookId),
          getBookCompanionChat(bookId),
          getItem(KEYS.bookReflection(bookId), {}).catch(() => ({})),
        ]);
      if (!alive) return;
      setBook(savedBook);
      setProgress(savedProgress);
      const orderedNotes = sortByTime(savedNotes);
      setNotes(orderedNotes);
      setBookChat(savedChat);
      setReflections(sortByTime(flattenGroupedMessages(reflectionStore)));
      setSelectedNoteId((current) => current || orderedNotes[0]?.id || "");
      setNotice("");
      setConfirmDeleteNote(false);
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [bookId]);

  const itemLookup = useMemo(() => buildItemLookup(book), [book]);
  const context = useMemo(
    () => buildSalonContext({ book, progress, notes, bookChat, reflections }),
    [book, progress, notes, bookChat, reflections]
  );
  const visibleNotes = useMemo(
    () => notes.filter((note) => noteMatchesFilter(note, filter)),
    [notes, filter]
  );
  const selectedNote = useMemo(
    () =>
      visibleNotes.find((note) => note.id === selectedNoteId) ||
      visibleNotes[0] ||
      null,
    [selectedNoteId, visibleNotes]
  );
  const knowledgeCards = useMemo(
    () => buildKnowledgeCards(book, notes),
    [book, notes]
  );
  const reviewDraft = useMemo(
    () => buildReviewDraft({ book, notes, reflections, bookChat }),
    [book, notes, reflections, bookChat]
  );
  const activePanelMeta =
    SALON_PANELS.find((panel) => panel.id === activePanel) || SALON_PANELS[0];
  const salonStamp = context.canRead
    ? { top: "读至", main: `${context.percent}%` }
    : { top: "读伴", main: "待设" };

  useEffect(() => {
    setNoteDraft(selectedNote?.note || "");
    setConfirmDeleteNote(false);
  }, [selectedNote?.id, selectedNote?.note]);

  async function refreshNotes(nextSelectedId = selectedNote?.id || "") {
    const saved = sortByTime(await getAllReadingNotes(bookId));
    setNotes(saved);
    setSelectedNoteId(nextSelectedId || saved[0]?.id || "");
  }

  async function handleSaveNote(event) {
    event.preventDefault();
    if (!book?.id || !selectedNote?.id || !selectedNote?.itemKey) return;
    await updateReadingNote(book.id, selectedNote.itemKey, selectedNote.id, {
      note: noteDraft,
    });
    await refreshNotes(selectedNote.id);
    setNotice("笔记已保存。");
    setConfirmDeleteNote(false);
  }

  async function handleDeleteNote() {
    if (!book?.id || !selectedNote?.id || !selectedNote?.itemKey) return;
    if (!confirmDeleteNote) {
      setConfirmDeleteNote(true);
      setNotice("再次点击确认删除这条笔记。");
      return;
    }
    await deleteReadingNote(book.id, selectedNote.itemKey, selectedNote.id);
    await refreshNotes("");
    setNotice("这条笔记已删除。");
    setConfirmDeleteNote(false);
  }

  if (loading) {
    return (
      <main className="book-salon-page mx-auto max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
        <section className="book-salon-loading">正在加载。</section>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="book-salon-page mx-auto max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onBack} className="book-salon-back">
          返回藏书
        </button>
        <section className="book-salon-empty">
          <h2>没有找到这本书</h2>
          <p>回到藏书页后可以重新选择一本书。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="book-salon-page mx-auto max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
      <div className="book-salon-topbar">
        <button type="button" onClick={onBack} className="book-salon-back">
          <ChineseIcon name="books" className="h-4 w-4" decorative />
          <span>返回藏书</span>
        </button>
      </div>

      <header className="book-salon-heading">
        <div className="book-salon-avatar">
          <ReadingCompanionAvatar stage={4} expression="gentle" />
        </div>
        <div className="book-salon-title-block">
          <p className="book-salon-kicker">
            <ChineseIcon name="seal" className="h-4 w-4" decorative />
            <span>本书会客厅</span>
          </p>
          <h1>{toText(book.title) || "未命名书籍"}</h1>
          <p>{toText(book.author) || "佚名"} · {context.positionText}</p>
        </div>
        <div className="book-salon-stamp" aria-hidden="true">
          <span>{salonStamp.top}</span>
          <strong>{salonStamp.main}</strong>
        </div>
        <div className="book-salon-heading-actions">
          <button type="button" onClick={() => onChatBook(book.id)}>
            <ChineseIcon name="ink" className="h-4 w-4" decorative />
            和读伴聊聊
          </button>
          {context.canRead ? (
            <button type="button" onClick={() => onReadBook(book.id)} className="is-primary">
              <ChineseIcon name="scroll" className="h-4 w-4" decorative />
              继续阅读
            </button>
          ) : (
            <button type="button" onClick={() => onPlanBook(book.id)} className="is-primary">
              <ChineseIcon name="plan" className="h-4 w-4" decorative />
              设定读伴
            </button>
          )}
        </div>
      </header>

      <section className="book-salon-layout">
        <aside className="book-salon-rail" aria-label="本书概览">
          <section className="book-salon-ledger">
            <div className="book-salon-section-title">
              <ChineseIcon name="seal" className="h-4 w-4" decorative />
              <span>本书状态</span>
            </div>
            <dl>
              <div>
                <dt>笔记</dt>
                <dd>{context.noteCount}</dd>
              </div>
              <div>
                <dt>摘录</dt>
                <dd>{context.highlightCount}</dd>
              </div>
              <div>
                <dt>读伴回答</dt>
                <dd>{context.companionNoteCount}</dd>
              </div>
              <div>
                <dt>读后交流</dt>
                <dd>{context.reflectionCount}</dd>
              </div>
            </dl>
            <div className="book-salon-progress">
              <span style={{ width: `${context.percent}%` }} />
            </div>
            <p>{context.progressText}</p>
          </section>

          <section className="book-salon-reading-card">
            <div className="book-salon-section-title">
              <ChineseIcon name="scroll" className="h-4 w-4" decorative />
              <span>当前进度</span>
            </div>
            <strong>{context.currentTitle}</strong>
            <p>{context.currentDetail}</p>
          </section>
        </aside>

        <section className="book-salon-desk" aria-label="整理这本书工作区">
          <div className="book-salon-desk-head">
            <div>
              <h2>{activePanelMeta.title}</h2>
            </div>
            <div className="book-salon-panel-tabs" role="tablist" aria-label="整理视图">
              {SALON_PANELS.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  role="tab"
                  aria-selected={activePanel === panel.id}
                  className={activePanel === panel.id ? "is-active" : ""}
                  onClick={() => setActivePanel(panel.id)}
                >
                  {panel.label}
                </button>
              ))}
            </div>
          </div>

          {activePanel === "notes" && (
            <section className="book-salon-panel" aria-label="本书笔记">
              <div className="book-salon-panel-tools">
                <span>筛选</span>
                <div className="book-salon-filter" role="tablist" aria-label="筛选笔记">
                  {NOTE_FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === option.id}
                      className={filter === option.id ? "is-active" : ""}
                      onClick={() => setFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="book-salon-note-workspace">
                <div className="book-salon-note-column">
                  <div className="book-salon-note-list-head">
                    <span>笔记列表</span>
                    <em>{visibleNotes.length} 条</em>
                  </div>
                  <div className="book-salon-note-list" aria-label="笔记列表">
                    {visibleNotes.length === 0 ? (
                      <div className="book-salon-note-empty">
                        <ChineseIcon name="ink" className="h-5 w-5" decorative />
                        <p>没有符合条件的笔记。</p>
                      </div>
                    ) : (
                      visibleNotes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          className={note.id === selectedNote?.id ? "is-selected" : ""}
                          onClick={() => {
                            setSelectedNoteId(note.id);
                            setNotice("");
                          }}
                        >
                          <span>{getNoteSourceLabel(note)}</span>
                          <strong>{getNoteTitle(note)}</strong>
                          <em>
                            {getItemTitle(note.itemKey, itemLookup)}
                            {note.pageNumber ? ` · ${formatBookPage(note.pageNumber, context.pageUnitLabel)}` : ""}
                          </em>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <form className="book-salon-editor" onSubmit={handleSaveNote}>
                  {selectedNote ? (
                    <>
                      <div className="book-salon-editor-source">
                        <span>{getNoteSourceLabel(selectedNote)}</span>
                        <p>{getItemTitle(selectedNote.itemKey, itemLookup)}</p>
                      </div>
                      {selectedNote.text && (
                        <blockquote>
                          {selectedNote.text}
                        </blockquote>
                      )}
                      {selectedNote.assistantContent && (
                        <div className="book-salon-assistant-note">
                          <BrandName />：{selectedNote.assistantContent}
                        </div>
                      )}
                      <label>
                        <span>我的整理</span>
                        <textarea
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value)}
                          rows={7}
                        />
                      </label>
                      <div className="book-salon-editor-actions">
                        {notice && <p>{notice}</p>}
                        {confirmDeleteNote && (
                          <button type="button" onClick={() => setConfirmDeleteNote(false)}>
                            取消
                          </button>
                        )}
                        <button type="button" onClick={handleDeleteNote} className="is-danger">
                          {confirmDeleteNote ? "确认删除" : "删除"}
                        </button>
                        <button type="submit" className="is-primary">
                          保存
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="book-salon-editor-empty">
                      <ChineseIcon name="sample" className="h-6 w-6" decorative />
                      <p>选择左侧笔记。</p>
                    </div>
                  )}
                </form>
              </div>
            </section>
          )}

          {activePanel === "knowledge" && (
            <section className="book-salon-panel" aria-label="重点">
              <div className="book-salon-knowledge-board">
                {knowledgeCards.map((card) => (
                  <article key={`${card.kicker}-${card.title}`}>
                    <span>{card.kicker}</span>
                    <strong>{card.title}</strong>
                    {card.body && <p>{card.body}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {activePanel === "review" && (
            <section className="book-salon-panel" aria-label="复盘">
              <div className="book-salon-review-board">
                {reviewDraft.map((section) => (
                  <article key={section.title}>
                    <span>复盘</span>
                    <strong>{section.title}</strong>
                    {section.body && <p>{section.body}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}

function buildSalonContext({ book, progress = {}, notes = [], bookChat = [], reflections = [] }) {
  const planItems = Array.isArray(book?.readingPlan?.items) ? book.readingPlan.items : [];
  const totalCount = planItems.length;
  const completedKeys = Array.isArray(progress?.completedItemKeys) ? progress.completedItemKeys : [];
  const completedCount = completedKeys.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentIndex = clampIndex(progress?.currentItemIndex || 0, totalCount);
  const currentItem = planItems[currentIndex] || null;
  const pageUnitLabel = getBookPageUnitLabel(book);
  const currentKey = getPlanItemKey(currentItem, currentIndex);
  const savedLocation = progress?.currentPageByItemKey?.[currentKey] || null;
  const pageNumber = savedLocation?.pageNumber || currentItem?.startPage || null;
  const canRead = book?.status === "planned" && totalCount > 0;

  return {
    canRead,
    percent,
    pageUnitLabel,
    noteCount: notes.length,
    highlightCount: notes.filter((note) => note.text).length,
    companionNoteCount: notes.filter((note) => note.source === "book-companion-chat" || note.assistantContent).length,
    reflectionCount: reflections.length,
    chatCount: bookChat.length,
    currentTitle: currentItem?.title || "尚未定下阅读计划",
    currentDetail: canRead
      ? `${pageNumber ? formatBookPage(pageNumber, pageUnitLabel) : "还没开始"} · 第 ${currentIndex + 1}/${totalCount} 个阅读日`
      : "未设置读伴",
    positionText: canRead ? `已读 ${percent}%` : "尚未设定读伴",
    progressText: canRead
      ? `已完成 ${completedCount}/${totalCount || 0} 个阅读日`
      : "未设置读伴",
  };
}

function buildKnowledgeCards(book, notes) {
  const guide = normalizeWholeBookGuide(book?.wholeBookGuide);
  const cards = [];

  if (guide?.bookProblem) {
    cards.push({
      kicker: "作者想解释",
      title: "这本书想讲什么",
      body: limitLine(guide.bookProblem, 120),
    });
  }
  if (guide?.coreQuestion) {
    cards.push({
      kicker: "带着读的问题",
      title: limitLine(guide.coreQuestion, 42),
      body: "",
    });
  }

  asArray(guide?.keyTurns).slice(0, 2).forEach((item) => {
    cards.push({
      kicker: "重要线索",
      title: toText(item.title) || "重要变化",
      body: limitLine(item.whyItMatters || item.summary || item.readingHint, 110),
    });
  });

  asArray(guide?.difficultyMap).slice(0, 2).forEach((item) => {
    cards.push({
      kicker: "容易卡住",
      title: toText(item.topic) || "需要回看",
      body: limitLine(item.supportStrategy || item.whyHard || item.where, 110),
    });
  });

  if (cards.length === 0 && notes.length > 0) {
    notes.slice(0, 3).forEach((note, index) => {
      cards.push({
        kicker: index === 0 ? "待整理" : "笔记",
        title: getNoteTitle(note),
        body: limitLine(note.note || note.assistantContent || note.text, 110),
      });
    });
  }

  return cards.length
    ? cards.slice(0, 5)
    : [
        {
          kicker: "待整理",
          title: "暂无重点",
          body: "",
        },
      ];
}

function buildReviewDraft({ book, notes, reflections, bookChat }) {
  const guide = normalizeWholeBookGuide(book?.wholeBookGuide);
  const firstUserReflection = reflections.find((message) => message.role === "user");
  const savedCompanionNote = notes.find((note) => note.source === "book-companion-chat" || note.assistantContent);
  const userNote = notes.find((note) => note.note);
  const lastQuestion = [...bookChat].reverse().find((message) => message.role === "user");

  return [
    {
      title: "问题",
      body: limitLine(guide?.coreQuestion || guide?.bookProblem || lastQuestion?.content || "", 130),
    },
    {
      title: "判断",
      body: limitLine(userNote?.note || firstUserReflection?.content || "", 130),
    },
    {
      title: "追问",
      body: limitLine(savedCompanionNote?.assistantContent || lastQuestion?.content || "", 130),
    },
  ];
}

function buildItemLookup(book) {
  const items = Array.isArray(book?.readingPlan?.items) ? book.readingPlan.items : [];
  const lookup = new Map();
  items.forEach((item, index) => {
    lookup.set(getPlanItemKey(item, index), toText(item.title) || `阅读日 ${index + 1}`);
  });
  lookup.set(BOOK_COMPANION_CHAT_ITEM_KEY, "本书读伴聊天");
  return lookup;
}

function getItemTitle(itemKey, lookup) {
  return lookup.get(itemKey) || "未归档阅读项";
}

function getNoteSourceLabel(note) {
  if (note.source === "book-companion-chat") return "读伴回答";
  if (note.assistantContent) return "读伴回答";
  if (note.text && note.note) return "摘录手记";
  if (note.text) return "原文摘录";
  return "手记";
}

function getNoteTitle(note) {
  return limitLine(note.note || note.text || note.assistantContent || "未命名笔记", 56);
}

function noteMatchesFilter(note, filter) {
  if (filter === "all") return true;
  if (filter === "notes") return Boolean(note.note);
  if (filter === "highlights") return Boolean(note.text);
  if (filter === "companion") return note.source === "book-companion-chat" || Boolean(note.assistantContent);
  return true;
}

function flattenGroupedMessages(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([itemKey, messages]) =>
    Array.isArray(messages)
      ? messages.map((message) => ({ ...message, itemKey: message.itemKey || itemKey }))
      : []
  );
}

function sortByTime(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const left = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const right = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return right - left;
  });
}

function formatBookPage(pageNumber, pageUnitLabel) {
  if (!pageNumber) return "";
  if (pageUnitLabel === "文本页") return `文本页 ${pageNumber}`;
  return `第 ${pageNumber} 页`;
}

function limitLine(value, max = 80) {
  const text = toText(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampIndex(value, length) {
  if (length <= 0) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(length - 1, number));
}
