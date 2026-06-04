import { useEffect, useMemo, useRef, useState } from "react";
import PdfReader from "./PdfReader.jsx";
import {
  getBook,
  getBookPages,
  getReadingProgress,
  saveReadingProgress,
} from "../lib/books.js";
import {
  generateReadingGuide,
  getPlanItemKey,
  getReadingGuide,
} from "../lib/readingGuides.js";
import { getReadingChat, sendReadingChatMessage } from "../lib/readingChat.js";
import {
  addReadingNote,
  deleteReadingNote,
  getReadingNotes,
  updateReadingNote,
} from "../lib/notes.js";
import { formatUsd } from "../lib/pricing.js";
import { toText } from "../lib/text.js";

const SESSION_STAGES = {
  intro: "intro",
  reading: "reading",
  reflection: "reflection",
};

export default function Reader({ bookId, onBack, onPlan }) {
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [progress, setProgress] = useState({
    currentItemIndex: 0,
    completedItemKeys: [],
    currentPageByItemKey: {},
    readingDays: [],
    lastReadAt: null,
  });
  const [sessionStage, setSessionStage] = useState(SESSION_STAGES.intro);
  const [reflectionAnswer, setReflectionAnswer] = useState("");
  const [guide, setGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState("");
  const [guideStartedAt, setGuideStartedAt] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [notes, setNotes] = useState([]);
  const [pendingNoteDraft, setPendingNoteDraft] = useState(null);
  const [noteSourceTarget, setNoteSourceTarget] = useState(null);
  const [noteNotice, setNoteNotice] = useState("");
  const [currentPage, setCurrentPage] = useState(null);
  const [initialReadingPage, setInitialReadingPage] = useState(null);
  const [selectedQuoteDraft, setSelectedQuoteDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const progressRef = useRef(progress);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const [savedBook, savedPages, savedProgress] = await Promise.all([
        getBook(bookId),
        getBookPages(bookId),
        getReadingProgress(bookId),
      ]);

      if (!alive) return;
      setBook(savedBook);
      setPages(savedPages);
      setProgress({
        currentItemIndex: savedProgress.currentItemIndex || 0,
        completedItemKeys: savedProgress.completedItemKeys || [],
        currentPageByItemKey: savedProgress.currentPageByItemKey || {},
        readingDays: savedProgress.readingDays || [],
        lastReadAt: savedProgress.lastReadAt || null,
      });
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [bookId]);

  const planItems = book?.readingPlan?.items || [];
  const currentIndex = clampIndex(progress.currentItemIndex, planItems.length);
  const currentItem = planItems[currentIndex] || null;
  const currentKey = getPlanItemKey(currentItem, currentIndex);
  const completedKeys = progress.completedItemKeys || [];
  const completed = currentKey ? completedKeys.includes(currentKey) : false;
  const savedLocation = getSavedLocationForCurrentItem(progress, currentKey, currentItem);
  const shouldResumeReading = Boolean(savedLocation?.pageNumber) && !completed;

  const chapterSections = useMemo(() => {
    if (!book || !currentItem) return [];
    return buildChapterSections(book.chapters || [], pages, currentItem);
  }, [book, currentItem, pages]);

  const currentPageContext = useMemo(() => {
    if (!currentItem) return null;
    const pageNumber = Number(currentPage) || Number(currentItem.startPage) || null;
    if (!pageNumber) return null;
    const page = pages.find((itemPage) => Number(itemPage.pageNumber) === pageNumber);
    return {
      pageNumber,
      text: toText(page?.text).trim(),
    };
  }, [currentItem, currentPage, pages]);

  useEffect(() => {
    let alive = true;
    setGuide(null);
    setGuideError("");
    setChatMessages([]);
    setChatError("");
    setChatLoading(false);
    setNotes([]);
    setPendingNoteDraft(null);
    setNoteSourceTarget(null);
    setNoteNotice("");
    setReflectionAnswer("");
    const savedLocationForItem = getSavedLocationForCurrentItem(
      progressRef.current,
      currentKey,
      currentItem
    );
    const savedPage = savedLocationForItem?.pageNumber || normalizePageNumber(null, currentItem);
    setCurrentPage(savedPage);
    setInitialReadingPage(savedPage);
    setSelectedQuoteDraft(null);
    setSessionStage(
      savedLocationForItem?.pageNumber && !completed
        ? SESSION_STAGES.reading
        : SESSION_STAGES.intro
    );
    if (!book?.id || !currentKey) return;

    getReadingGuide(book.id, currentKey).then((saved) => {
      if (alive) setGuide(saved);
    });
    getReadingChat(book.id, currentKey).then((saved) => {
      if (alive) setChatMessages(saved);
    });
    getReadingNotes(book.id, currentKey).then((saved) => {
      if (alive) setNotes(saved);
    });

    return () => {
      alive = false;
    };
  }, [book?.id, currentKey, completed]);

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-10 text-sm text-ink-soft">
        正在打开阅读器…
      </div>
    );
  }

  if (!book) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-ink-soft">没有找到这本书。</p>
        <button onClick={onBack} className="mt-4 text-sm text-accent underline">
          返回书架
        </button>
      </div>
    );
  }

  if (planItems.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <button onClick={onBack} className="text-sm text-accent underline">
          返回书架
        </button>
        <section className="mt-8 rounded-xl border border-line bg-paper-card p-8 text-center shadow-sm">
          <h2 className="font-serif text-2xl text-ink">还没有阅读计划</h2>
          <p className="mt-3 text-sm text-ink-soft">
            先选择阅读目标和节奏，再开始按章节阅读。
          </p>
          <button
            onClick={() => onPlan(book.id)}
            className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
          >
            设置阅读节奏
          </button>
        </section>
      </div>
    );
  }

  async function jumpTo(index) {
    const next = {
      ...progress,
      currentItemIndex: clampIndex(index, planItems.length),
    };
    persistProgress(next);
    setSessionStage(SESSION_STAGES.intro);
    await saveReadingProgress(book.id, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startReading() {
    setSessionStage(SESSION_STAGES.reading);
    recordReadingActivity({
      pageNumber:
        getSavedLocationForCurrentItem(progressRef.current, currentKey, currentItem)?.pageNumber ||
        normalizePageNumber(null, currentItem),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openReflection() {
    setSessionStage(SESSION_STAGES.reflection);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finishAndContinue() {
    const key = getPlanItemKey(currentItem, currentIndex);
    const nextKeys = completedKeys.includes(key) ? completedKeys : [...completedKeys, key];
    const nextIndex = clampIndex(currentIndex + 1, planItems.length);
    const next = {
      ...progressRef.current,
      completedItemKeys: nextKeys,
      currentItemIndex: nextIndex,
    };
    persistProgress(addReadingDay(next));
    setReflectionAnswer("");
    setSessionStage(
      currentIndex >= planItems.length - 1 ? SESSION_STAGES.reflection : SESSION_STAGES.intro
    );
    await saveReadingProgress(book.id, progressRef.current);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function markUnfinished() {
    const key = getPlanItemKey(currentItem, currentIndex);
    const next = {
      ...progress,
      completedItemKeys: completedKeys.filter((itemKey) => itemKey !== key),
    };
    persistProgress(next);
    await saveReadingProgress(book.id, next);
  }

  function persistProgress(next) {
    progressRef.current = next;
    setProgress(next);
  }

  function recordReadingActivity({ pageNumber } = {}) {
    if (!book?.id || !currentKey || !currentItem) return;

    const normalizedPage = normalizePageNumber(pageNumber, currentItem);
    const now = new Date().toISOString();
    const next = addReadingDay({
      ...progressRef.current,
      currentItemIndex: currentIndex,
      currentPageByItemKey: {
        ...(progressRef.current.currentPageByItemKey || {}),
        [currentKey]: {
          pageNumber: normalizedPage,
          updatedAt: now,
        },
      },
      lastReadAt: now,
    });

    persistProgress(next);
    saveReadingProgress(book.id, next);
  }

  function handleCurrentPageChange(pageNumber) {
    const normalizedPage = normalizePageNumber(pageNumber, currentItem);
    setCurrentPage(normalizedPage);
    recordReadingActivity({ pageNumber: normalizedPage });
  }

  async function handleGenerateGuide() {
    setGuideError("");
    setGuideLoading(true);
    setGuideStartedAt(Date.now());
    try {
      const generated = await generateReadingGuide({
        book,
        item: currentItem,
        itemKey: currentKey,
        chapterSections,
      });
      setGuide(generated);
    } catch (e) {
      setGuideError(e.message || "导读生成失败，请稍后重试。");
    } finally {
      setGuideLoading(false);
      setGuideStartedAt(null);
    }
  }

  async function handleSendChat(content, options = {}) {
    const text = toText(content).trim();
    if (!text || chatLoading) return;

    const optimisticMessage = {
      id: `chat-local-${Date.now()}`,
      role: "user",
      content: text,
      quote: options.quote || null,
      createdAt: new Date().toISOString(),
    };
    const streamingMessage = {
      id: `chat-stream-${Date.now()}`,
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };
    const previousMessages = chatMessages;

    setChatError("");
    setChatLoading(true);
    setChatMessages([...previousMessages, optimisticMessage, streamingMessage]);

    try {
      const result = await sendReadingChatMessage({
        book,
        item: currentItem,
        itemKey: currentKey,
        chapterSections,
        currentPageContext,
        guide,
        messages: previousMessages,
        content: text,
        quote: options.quote || null,
        onDelta: (delta) => {
          setChatMessages((current) =>
            current.map((message) =>
              message.id === streamingMessage.id
                ? { ...message, content: `${message.content}${delta}` }
                : message
            )
          );
        },
      });
      setChatMessages(result.messages);
    } catch (e) {
      setChatMessages(previousMessages);
      setChatError(e.message || "导师暂时没有回答出来，请稍后重试。");
    } finally {
      setChatLoading(false);
    }
  }

  function handleAskSelection(selection) {
    if (selection?.action === "ask") {
      setSelectedQuoteDraft({
        id: `quote-${Date.now()}`,
        pageNumber: selection.pageNumber || null,
        text: toText(selection.text).trim(),
        rects: normalizeHighlightRects(selection.rects),
      });
      return;
    }

    if (selection?.action === "note") {
      if (noteSourceTarget?.id) {
        handleReplaceNoteSource(selection);
        return;
      }

      setPendingNoteDraft(buildPendingNoteFromSelection(selection));
    }
  }

  async function handleReplaceNoteSource(selection) {
    if (!book?.id || !currentKey || !noteSourceTarget?.id) return;
    const nextSource = buildPendingNoteFromSelection(selection);
    const saved = await updateReadingNote(book.id, currentKey, noteSourceTarget.id, {
      pageNumber: nextSource.pageNumber,
      text: nextSource.text,
      rects: nextSource.rects,
      highlightDisabled: false,
    });
    setNotes(saved);
    setNoteSourceTarget(null);
    showNoteNotice("已重新绑定原文和高亮");
  }

  async function handleSavePendingNote(noteText) {
    if (!pendingNoteDraft || !book?.id || !currentKey) return;
    const saved = await addReadingNote(book.id, currentKey, {
      ...pendingNoteDraft,
      note: noteText,
      source: "selection",
    });
    setNotes(saved);
    setPendingNoteDraft(null);
    showNoteNotice("已添加到本章笔记");
  }

  async function handleAddChatMessageToNote(message, previousUserMessage) {
    if (!book?.id || !currentKey || !message?.content) return;
    const quote = previousUserMessage?.quote || extractQuoteFromChatContent(previousUserMessage?.content);
    const saved = await addReadingNote(book.id, currentKey, {
      pageNumber: quote.pageNumber || currentPageContext?.pageNumber || null,
      text: quote.text,
      rects: quote.rects,
      note: "AI 导师回答",
      assistantContent: message.content,
      source: "chat",
    });
    setNotes(saved);
    showNoteNotice("已把这次回答加入笔记");
  }

  async function handleUpdateNote(noteId, patch) {
    if (!book?.id || !currentKey || !noteId) return;
    const saved = await updateReadingNote(book.id, currentKey, noteId, patch);
    setNotes(saved);
    showNoteNotice("笔记已更新");
  }

  async function handleDeleteNote(noteId) {
    if (!book?.id || !currentKey || !noteId) return;
    const saved = await deleteReadingNote(book.id, currentKey, noteId);
    setNotes(saved);
    if (noteSourceTarget?.id === noteId) setNoteSourceTarget(null);
    showNoteNotice("笔记已删除");
  }

  async function handleClearNoteHighlight(noteId) {
    if (!book?.id || !currentKey || !noteId) return;
    const saved = await updateReadingNote(book.id, currentKey, noteId, {
      rects: [],
      highlightDisabled: true,
    });
    setNotes(saved);
    showNoteNotice("已取消这条笔记的高亮");
  }

  function handleStartReplaceNoteSource(note) {
    if (!note?.id) return;
    setPendingNoteDraft(null);
    setNoteSourceTarget(note);
    showNoteNotice("请在 PDF 中重新划选原文，然后点“添加笔记”");
  }

  function handleCancelReplaceNoteSource() {
    setNoteSourceTarget(null);
    showNoteNotice("已取消重新选择原文");
  }

  function showNoteNotice(message) {
    setNoteNotice(message);
    window.setTimeout(() => {
      setNoteNotice((current) => (current === message ? "" : current));
    }, 2400);
  }

  if (sessionStage === SESSION_STAGES.reading) {
    return (
      <ReadingStage
        book={book}
        item={currentItem}
        currentIndex={currentIndex}
        planItems={planItems}
        completedKeys={completedKeys}
        completed={completed}
        chapterSections={chapterSections}
        initialPage={initialReadingPage}
        savedLocation={savedLocation}
        continuing={shouldResumeReading}
        currentPage={currentPageContext?.pageNumber || null}
        currentPageHasText={Boolean(currentPageContext?.text)}
        guide={guide}
        guideLoading={guideLoading}
        guideStartedAt={guideStartedAt}
        guideError={guideError}
        chatMessages={chatMessages}
        chatLoading={chatLoading}
        chatError={chatError}
        notes={notes}
        pendingNoteDraft={pendingNoteDraft}
        noteNotice={noteNotice}
        selectedQuoteDraft={selectedQuoteDraft}
        onQuoteDraftUsed={() => setSelectedQuoteDraft(null)}
        onSavePendingNote={handleSavePendingNote}
        onCancelPendingNote={() => setPendingNoteDraft(null)}
        onAddChatMessageToNote={handleAddChatMessageToNote}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
        onClearNoteHighlight={handleClearNoteHighlight}
        onStartReplaceNoteSource={handleStartReplaceNoteSource}
        noteSourceTarget={noteSourceTarget}
        onCancelReplaceNoteSource={handleCancelReplaceNoteSource}
        onBack={onBack}
        onIntro={() => setSessionStage(SESSION_STAGES.intro)}
        onReflection={openReflection}
        onGenerateGuide={handleGenerateGuide}
        onSendChat={handleSendChat}
        onAskSelection={handleAskSelection}
        onCurrentPageChange={handleCurrentPageChange}
        onJump={jumpTo}
        onMarkUnfinished={markUnfinished}
      />
    );
  }

  if (sessionStage === SESSION_STAGES.reflection) {
    return (
      <ReflectionStage
        book={book}
        item={currentItem}
        currentIndex={currentIndex}
        planItems={planItems}
        completed={completed}
        guide={guide}
        reflectionAnswer={reflectionAnswer}
        onReflectionChange={setReflectionAnswer}
        onBack={onBack}
        onReading={startReading}
        onComplete={finishAndContinue}
      />
    );
  }

  return (
    <IntroStage
      book={book}
      item={currentItem}
      currentIndex={currentIndex}
      planItems={planItems}
      completedKeys={completedKeys}
      completed={completed}
      chapterSections={chapterSections}
      guide={guide}
      guideLoading={guideLoading}
      guideStartedAt={guideStartedAt}
      guideError={guideError}
      onBack={onBack}
      onStartReading={startReading}
      onGenerateGuide={handleGenerateGuide}
      onJump={jumpTo}
      onMarkUnfinished={markUnfinished}
    />
  );
}

function IntroStage({
  book,
  item,
  currentIndex,
  planItems,
  completedKeys,
  completed,
  chapterSections,
  currentPage,
  currentPageHasText,
  guide,
  guideLoading,
  guideStartedAt,
  guideError,
  onBack,
  onStartReading,
  onGenerateGuide,
  onJump,
  onMarkUnfinished,
}) {
  const bridge = buildReadingBridge({ book, item, currentIndex, planItems, completedKeys });

  return (
    <div className="min-h-screen bg-paper px-6 py-8">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm text-ink-soft">阅读会话</p>
        <button onClick={onBack} className="text-sm text-accent underline">
          退出到书架
        </button>
      </div>

      <main className="mx-auto flex max-w-4xl flex-col justify-center py-12 lg:min-h-[calc(100vh-96px)]">
        <p className="text-sm text-ink-soft">
          Day {item.day} · {item.date} · {item.type === "guide" ? "开始前准备" : "今日章节"}
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          {item.title}
        </h1>
        <p className="mt-4 text-sm text-ink-soft">
          第 {item.startPage}-{item.endPage} 页 · 已完成 {completedKeys.length} /{" "}
          {planItems.length} 个阅读日
        </p>

        <section className="mt-10 rounded-xl border border-line bg-paper-card p-7 shadow-sm">
          <p className="text-xs font-medium text-ink-soft">导师开场</p>
          <p className="mt-3 text-lg leading-9 text-ink">{bridge}</p>

          <TutorBriefing
            guide={guide}
            loading={guideLoading}
            startedAt={guideStartedAt}
            error={guideError}
            disabled={chapterSections.length === 0}
            onGenerate={onGenerateGuide}
          />
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <button
              onClick={() => onJump(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper-card disabled:opacity-40"
            >
              上一项
            </button>
            <button
              onClick={() => onJump(currentIndex + 1)}
              disabled={currentIndex >= planItems.length - 1}
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper-card disabled:opacity-40"
            >
              下一项
            </button>
          </div>
          <div className="flex gap-3">
            {completed && (
              <button
                onClick={onMarkUnfinished}
                className="rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper-card"
              >
                标记未完成
              </button>
            )}
            <button
              onClick={onStartReading}
              className="rounded-lg bg-accent px-5 py-2 text-sm text-white shadow-sm hover:opacity-90"
            >
              翻开这一章
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ReadingStage({
  book,
  item,
  currentIndex,
  planItems,
  completedKeys,
  completed,
  chapterSections,
  initialPage,
  savedLocation,
  continuing,
  guide,
  guideLoading,
  guideStartedAt,
  guideError,
  chatMessages,
  chatLoading,
  chatError,
  notes,
  pendingNoteDraft,
  noteNotice,
  selectedQuoteDraft,
  currentPage,
  currentPageHasText,
  onQuoteDraftUsed,
  onSavePendingNote,
  onCancelPendingNote,
  onAddChatMessageToNote,
  onUpdateNote,
  onDeleteNote,
  onClearNoteHighlight,
  onStartReplaceNoteSource,
  noteSourceTarget,
  onCancelReplaceNoteSource,
  onBack,
  onIntro,
  onReflection,
  onGenerateGuide,
  onSendChat,
  onAskSelection,
  onCurrentPageChange,
  onJump,
  onMarkUnfinished,
}) {
  const visibleHighlights = useMemo(
    () => (pendingNoteDraft ? [pendingNoteDraft, ...notes] : notes),
    [notes, pendingNoteDraft]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper">
      <header className="shrink-0 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs text-ink-soft">
              {toText(book.title)} · Day {item.day} · {item.date}
            </p>
            <h1 className="mt-1 font-serif text-2xl text-ink">{item.title}</h1>
            {continuing && savedLocation?.pageNumber && (
              <p className="mt-1 text-xs text-ink-soft">
                继续上次：第 {savedLocation.pageNumber} 页
                {savedLocation.updatedAt ? ` · ${formatReadingTime(savedLocation.updatedAt)}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onIntro}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper-card"
            >
              回到导读
            </button>
            <button
              onClick={onBack}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper-card"
            >
              {completed ? "回到书架" : "中途离开"}
            </button>
            <button
              onClick={onReflection}
              className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
            >
              我读完了
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
        <article className="min-h-[60vh] overflow-y-auto rounded-xl border border-line bg-paper-card px-4 py-5 shadow-sm sm:px-10 sm:py-7 lg:min-h-0">
          <PdfReader
            bookId={book.id}
            startPage={item.startPage}
            endPage={item.endPage}
            initialPage={initialPage}
            highlights={visibleHighlights}
            onCurrentPageChange={onCurrentPageChange}
            onAskSelection={onAskSelection}
          />
        </article>

        <TutorSidebar
          item={item}
          currentIndex={currentIndex}
          planItems={planItems}
          completedKeys={completedKeys}
          completed={completed}
          guide={guide}
          loading={guideLoading}
          startedAt={guideStartedAt}
          error={guideError}
          chatMessages={chatMessages}
          chatLoading={chatLoading}
          chatError={chatError}
          notes={notes}
          pendingNoteDraft={pendingNoteDraft}
          noteNotice={noteNotice}
          selectedQuoteDraft={selectedQuoteDraft}
          onQuoteDraftUsed={onQuoteDraftUsed}
          onSavePendingNote={onSavePendingNote}
          onCancelPendingNote={onCancelPendingNote}
          onAddChatMessageToNote={onAddChatMessageToNote}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
          onClearNoteHighlight={onClearNoteHighlight}
          onStartReplaceNoteSource={onStartReplaceNoteSource}
          noteSourceTarget={noteSourceTarget}
          currentPage={currentPage}
          currentPageHasText={currentPageHasText}
          disabled={chapterSections.length === 0 && !currentPageHasText}
          onGenerate={onGenerateGuide}
          onSendChat={onSendChat}
          onJump={onJump}
          onMarkUnfinished={onMarkUnfinished}
        />
      </main>

      {pendingNoteDraft && (
        <FloatingNoteComposer
          draft={pendingNoteDraft}
          onSave={onSavePendingNote}
          onCancel={onCancelPendingNote}
        />
      )}

      {noteSourceTarget && (
        <ReplaceSourceBanner
          note={noteSourceTarget}
          onCancel={onCancelReplaceNoteSource}
        />
      )}
    </div>
  );
}

function ReflectionStage({
  book,
  item,
  currentIndex,
  planItems,
  completed,
  guide,
  reflectionAnswer,
  onReflectionChange,
  onBack,
  onReading,
  onComplete,
}) {
  const prompts = buildReflectionPrompts(guide, item);
  const lastItem = currentIndex >= planItems.length - 1;
  const completeLabel = lastItem
    ? completed
      ? "已经完成这本书"
      : "完成这本书"
    : completed
    ? "进入下一次阅读"
    : "完成并进入下一次";

  return (
    <div className="min-h-screen bg-paper px-6 py-8">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm text-ink-soft">读后交流</p>
        <button onClick={onBack} className="text-sm text-accent underline">
          退出到书架
        </button>
      </div>

      <main className="mx-auto flex max-w-4xl flex-col justify-center py-12 lg:min-h-[calc(100vh-96px)]">
        <p className="text-sm text-ink-soft">
          {toText(book.title)} · Day {item.day}
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          读完以后，先停一下
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-9 text-ink">
          这一章不急着合上。真正有价值的部分，往往是在你试着用自己的话复述、挑出疑惑、把它和经验连接起来的时候出现。
        </p>

        <section className="mt-10 rounded-xl border border-line bg-paper-card p-7 shadow-sm">
          <h2 className="font-serif text-2xl text-ink">导师想问你的几个问题</h2>
          <ul className="mt-5 space-y-3">
            {prompts.map((prompt, index) => (
              <li key={`reflection-${index}`} className="rounded-lg bg-paper px-4 py-3 text-sm leading-6 text-ink">
                {prompt}
              </li>
            ))}
          </ul>

          <label className="mt-6 block text-sm font-medium text-ink">
            你的回答或笔记
            <textarea
              value={reflectionAnswer}
              onChange={(event) => onReflectionChange(event.target.value)}
              rows={6}
              placeholder="用自己的话写几句：这一章讲了什么？哪里让你有感觉？哪里还没想明白？"
              className="mt-2 w-full resize-y rounded-lg border border-line bg-paper px-4 py-3 font-normal leading-7 text-ink outline-none focus:border-accent"
            />
          </label>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={onReading}
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper-card"
          >
            回到正文
          </button>
          <button
            onClick={onComplete}
            disabled={completed && lastItem}
            className="rounded-lg bg-accent px-5 py-2 text-sm text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {completeLabel}
          </button>
        </div>
      </main>
    </div>
  );
}

function TutorBriefing({ guide, loading, startedAt, error, disabled, onGenerate }) {
  return (
    <div className="mt-6">
      {disabled && (
        <p className="rounded-lg bg-paper px-4 py-3 text-sm text-ink-soft">
          当前阅读项没有可用章节文本，暂时不能生成导读。
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading && <GuideLoading startedAt={startedAt} />}

      {!guide && !disabled && !error && !loading && (
        <div className="rounded-lg bg-paper px-5 py-4">
          <p className="text-sm leading-6 text-ink-soft">
            生成导读后，导师会先帮你整理今天的阅读目标和读前问题。
          </p>
          <button
            onClick={onGenerate}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
          >
            生成今日导读
          </button>
        </div>
      )}

      {guide && (
        <div className="space-y-5">
          {guide.overview && (
            <div className="rounded-lg bg-paper px-5 py-4 text-base leading-8 text-ink">
              <GuideMarkdownText value={guide.overview} />
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <GuideList title="今天读完后，你应该能" items={guide.goals} />
            <GuideList title="带着这些问题读" items={guide.questions} />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onGenerate}
              disabled={loading || disabled}
              className="rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper disabled:opacity-50"
            >
              重新生成导读
            </button>
          </div>
          <GuideUsage guide={guide} />
        </div>
      )}
    </div>
  );
}

function TutorSidebar({
  item,
  currentIndex,
  planItems,
  completed,
  guide,
  loading,
  startedAt,
  error,
  chatMessages,
  chatLoading,
  chatError,
  notes,
  pendingNoteDraft,
  noteNotice,
  selectedQuoteDraft,
  onQuoteDraftUsed,
  onSavePendingNote,
  onCancelPendingNote,
  onAddChatMessageToNote,
  onUpdateNote,
  onDeleteNote,
  onClearNoteHighlight,
  onStartReplaceNoteSource,
  noteSourceTarget,
  currentPage,
  currentPageHasText,
  disabled,
  onGenerate,
  onSendChat,
  onJump,
  onMarkUnfinished,
}) {
  const [activeGuideTab, setActiveGuideTab] = useState("goals");
  const [activePanel, setActivePanel] = useState("chat");

  useEffect(() => {
    if (selectedQuoteDraft?.text) {
      setActivePanel("chat");
      return;
    }

    if (pendingNoteDraft?.text) {
      setActivePanel("notes");
    }
  }, [selectedQuoteDraft, pendingNoteDraft]);

  return (
    <aside className="overflow-visible lg:h-full lg:min-h-0 lg:overflow-hidden">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper-card p-3 shadow-sm lg:h-full lg:min-h-0">
        <SidebarPanelTabs activePanel={activePanel} onChange={setActivePanel} />

        {activePanel === "chat" ? (
          <ChatPanel
            guide={guide}
            messages={chatMessages}
            loading={chatLoading}
            error={chatError}
            noteNotice={noteNotice}
            selectedQuoteDraft={selectedQuoteDraft}
            onQuoteDraftUsed={onQuoteDraftUsed}
            onAddMessageToNote={onAddChatMessageToNote}
            currentPage={currentPage}
            currentPageHasText={currentPageHasText}
            disabled={disabled}
            onSend={onSendChat}
          />
        ) : (
          <SidebarPanel
            activePanel={activePanel}
            guide={guide}
            loading={loading}
            startedAt={startedAt}
            error={error}
            activeGuideTab={activeGuideTab}
            onTabChange={setActiveGuideTab}
            onAsk={(question) => {
              setActivePanel("chat");
              onSendChat(question);
            }}
            disabled={disabled || chatLoading}
            currentIndex={currentIndex}
            planItems={planItems}
            completed={completed}
            notes={notes}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            onClearNoteHighlight={onClearNoteHighlight}
            onStartReplaceNoteSource={onStartReplaceNoteSource}
            noteSourceTarget={noteSourceTarget}
            pendingNoteDraft={pendingNoteDraft}
            onSavePendingNote={onSavePendingNote}
            onCancelPendingNote={onCancelPendingNote}
            onGenerate={onGenerate}
            onJump={onJump}
            onMarkUnfinished={onMarkUnfinished}
          />
        )}
      </section>
    </aside>
  );
}

const SIDEBAR_PANEL_OPTIONS = [
  { key: "chat", label: "问导师" },
  { key: "guide", label: "提示" },
  { key: "notes", label: "笔记" },
  { key: "items", label: "阅读项" },
];

function SidebarPanelTabs({ activePanel, onChange }) {
  return (
    <div className="grid grid-cols-4 rounded-lg bg-paper p-1">
      {SIDEBAR_PANEL_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`rounded-md px-2 py-1.5 text-xs transition ${
            activePanel === option.key
              ? "bg-accent text-white"
              : "text-ink-soft hover:bg-paper-card hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const GUIDE_TAB_OPTIONS = [
  { key: "goals", label: "目标", title: "阅读目标", promptPrefix: "请围绕这个阅读目标陪我读：" },
  { key: "questions", label: "问题", title: "读前问题", promptPrefix: "请带着这个问题陪我读：" },
  { key: "focus", label: "留意", title: "阅读时留意", promptPrefix: "请解释一下这个阅读提醒：" },
];

const LONG_ANSWER_CHARS = 100;

function ChatPanel({
  guide,
  messages,
  loading,
  error,
  noteNotice,
  selectedQuoteDraft,
  onQuoteDraftUsed,
  onAddMessageToNote,
  currentPage,
  currentPageHasText,
  disabled,
  onSend,
}) {
  const [draft, setDraft] = useState("");
  const [activeQuote, setActiveQuote] = useState(null);
  const textareaRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (!selectedQuoteDraft?.text) return;

    setActiveQuote(selectedQuoteDraft);
    onQuoteDraftUsed?.();

    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
    }, 0);
  }, [selectedQuoteDraft, onQuoteDraftUsed]);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;

    window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  }, [messages, loading]);

  function submitMessage(content = draft) {
    const text = toText(content).trim();
    if ((!text && !activeQuote) || loading || disabled) return;
    setDraft("");
    setActiveQuote(null);
    const quote = activeQuote ? buildQuoteMeta(activeQuote) : null;
    onSend(buildChatMessageWithQuote(text, activeQuote), { quote });
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitMessage();
  }

  function handleTextareaKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    submitMessage();
  }

  return (
    <section className="flex h-[440px] min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-paper p-2 sm:h-[520px] sm:p-3 lg:h-auto lg:flex-1 lg:basis-0">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink-soft">问导师</p>
          <h3 className="mt-1 text-sm font-medium text-ink">
            {currentPage ? `第 ${currentPage} 页伴读` : "当前章节伴读"}
          </h3>
          {currentPage && (
            <p className="mt-1 text-[11px] leading-4 text-ink-soft">
              {currentPageHasText ? "你问“这一页”时，我会优先看这一页。" : "这一页暂时没有提取到文本。"}
            </p>
          )}
        </div>
        {loading && (
          <div className="flex items-center gap-1 rounded-full bg-paper-card px-3 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
          </div>
        )}
      </div>

      {noteNotice && (
        <p className="mt-2 rounded-lg bg-paper-card px-3 py-2 text-xs text-accent">
          {noteNotice}
        </p>
      )}

      <div
        ref={messagesRef}
        className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg bg-paper-card px-3 py-3"
      >
        {messages.length === 0 ? (
          <AssistantWelcome />
        ) : (
          messages.map((message, index) =>
            message.streaming && !toText(message.content).trim() ? null : (
              <ChatMessage
                key={message.id}
                message={message}
                previousMessage={messages[index - 1]}
                latest={index === messages.length - 1}
                onAddToNote={onAddMessageToNote}
              />
            )
          )
        )}
        {loading && <ThinkingStatus />}
      </div>

      {error && <p className="mt-3 text-xs leading-5 text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="mt-2 shrink-0">
        <div className="rounded-xl border border-line bg-paper-card p-2 focus-within:border-accent">
          {activeQuote && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
              <span className="mt-0.5 text-ink-soft">↪</span>
              <p className="min-w-0 flex-1 truncate">
                “{activeQuote.text}”
              </p>
              <button
                type="button"
                onClick={() => setActiveQuote(null)}
                className="shrink-0 rounded-full px-1.5 text-sm leading-5 hover:bg-paper-card"
                aria-label="移除引用"
              >
                ×
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            disabled={loading || disabled}
            rows={2}
            placeholder={disabled ? "当前页和章节都没有可用文本" : "有问题，尽管问"}
            className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 text-ink outline-none disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={(!draft.trim() && !activeQuote) || loading || disabled}
          className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "等待回答…" : "发送"}
        </button>
      </form>
    </section>
  );
}

function FloatingNoteComposer({ draft, onSave, onCancel }) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2 lg:left-auto lg:right-[460px] lg:w-[560px] lg:translate-x-0">
      <NoteComposer draft={draft} onSave={onSave} onCancel={onCancel} floating />
    </div>
  );
}

function ReplaceSourceBanner({ note, onCancel }) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2 lg:left-auto lg:right-[460px] lg:w-[520px] lg:translate-x-0">
      <div className="rounded-xl border border-line bg-paper-card p-3 text-sm leading-6 text-ink shadow-2xl ring-1 ring-line/70">
        <p className="font-medium">正在重新选择原文</p>
        <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
          为「{note.text || note.note || "这条笔记"}」重新划一段文字，然后点浮层里的「添加笔记」。
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper"
        >
          取消重新选择
        </button>
      </div>
    </div>
  );
}

function NoteComposer({ draft, onSave, onCancel, floating = false }) {
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    setNoteText("");
  }, [draft?.id]);

  function handleSubmit(event) {
    event.preventDefault();
    onSave(noteText);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border border-line bg-paper-card p-3 shadow-sm ${
        floating ? "shadow-2xl ring-1 ring-line/70" : "mt-3"
      }`}
    >
      <div className="rounded-lg bg-paper px-3 py-2 text-xs leading-5 text-ink-soft">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-ink">添加高亮笔记</p>
          <p className="text-[11px] text-ink-soft">支持 Markdown</p>
        </div>
        <p className="mt-1 line-clamp-3">“{draft.text}”</p>
        {draft.pageNumber && <p className="mt-1">第 {draft.pageNumber} 页</p>}
      </div>
      <textarea
        value={noteText}
        onChange={(event) => setNoteText(event.target.value)}
        rows={floating ? 5 : 3}
        placeholder="写一点你的理解、疑问，或留空只保存高亮。"
        className="mt-2 w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-accent"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper"
        >
          取消
        </button>
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:opacity-90"
        >
          保存笔记
        </button>
      </div>
    </form>
  );
}

function AssistantWelcome() {
  return (
    <article className="flex items-start gap-2">
      <Avatar label="导" />
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-paper px-4 py-3 text-sm leading-6 text-ink shadow-sm">
        我会优先看你当前读到的页面。你可以直接问某个概念、某段话的意思，也可以选中原文后带着引用来问。
      </div>
    </article>
  );
}

function ThinkingStatus() {
  return (
    <p className="px-2 text-xs leading-5 text-ink-soft">导师正在整理回答…</p>
  );
}

function ChatMessage({ message, previousMessage, latest = false, onAddToNote }) {
  const isUser = message.role === "user";
  const latestAssistant = !isUser && latest;

  return (
    <article className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <Avatar label="导" />}
      <div
        className={`max-w-[86%] px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "rounded-2xl rounded-tr-sm bg-accent text-white"
            : "rounded-2xl rounded-tl-sm bg-paper text-ink"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <CollapsibleMarkdownText value={message.content} forceExpanded={latestAssistant} />
        )}
        {!isUser && !message.streaming && <ChatMessageUsage message={message} />}
        {!isUser && !message.streaming && (
          <button
            type="button"
            onClick={() => onAddToNote?.(message, previousMessage)}
            className="mt-2 rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:bg-paper-card hover:text-accent"
          >
            记到笔记
          </button>
        )}
      </div>
      {isUser && <Avatar label="你" muted />}
    </article>
  );
}

function CollapsibleMarkdownText({ value, forceExpanded = false }) {
  const text = toText(value);
  const collapsible = text.length > LONG_ANSWER_CHARS;
  const shouldForceExpanded = forceExpanded || !collapsible;
  const [expanded, setExpanded] = useState(shouldForceExpanded);

  useEffect(() => {
    setExpanded(shouldForceExpanded);
  }, [shouldForceExpanded, text]);

  const visibleText =
    collapsible && !expanded ? `${text.slice(0, LONG_ANSWER_CHARS).trimEnd()}...` : text;

  return (
    <div>
      <MarkdownText value={visibleText} />
      {collapsible && !forceExpanded && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}

function MarkdownText({ value }) {
  const blocks = splitMarkdownBlocks(value);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => (
        <MarkdownBlock key={`md-block-${index}`} block={block} blockIndex={index} />
      ))}
    </div>
  );
}

function MarkdownBlock({ block, blockIndex }) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  if (lines.length === 1 && /^-{3,}$/.test(lines[0])) {
    return <hr className="my-3 border-line" />;
  }

  if (lines.every((line) => /^>\s?/.test(line))) {
    return (
      <blockquote className="border-l-4 border-line bg-paper-card px-4 py-3 text-ink-soft">
        {lines.map((line, index) => (
          <p key={`md-quote-${blockIndex}-${index}`}>
            {renderInlineMarkdown(line.replace(/^>\s?/, ""), `${blockIndex}-quote-${index}`)}
          </p>
        ))}
      </blockquote>
    );
  }

  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {lines.map((line, index) => (
          <li key={`md-ul-${blockIndex}-${index}`}>
            {renderInlineMarkdown(line.replace(/^[-*]\s+/, ""), `${blockIndex}-${index}`)}
          </li>
        ))}
      </ul>
    );
  }

  if (lines.every((line) => /^\d+\.\s+/.test(line))) {
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {lines.map((line, index) => (
          <li key={`md-ol-${blockIndex}-${index}`}>
            {renderInlineMarkdown(line.replace(/^\d+\.\s+/, ""), `${blockIndex}-${index}`)}
          </li>
        ))}
      </ol>
    );
  }

  const heading = block.trim().match(/^#{1,4}\s+(.+)$/);
  if (heading) {
    return (
      <p className="font-semibold text-ink">
        {renderInlineMarkdown(heading[1], `${blockIndex}-heading`)}
      </p>
    );
  }

  return (
    <p>
      {lines.map((line, index) => (
        <span key={`md-line-${blockIndex}-${index}`}>
          {index > 0 && <br />}
          {renderInlineMarkdown(line, `${blockIndex}-${index}`)}
        </span>
      ))}
    </p>
  );
}

function splitMarkdownBlocks(value) {
  return toText(value)
    .replace(/^\s*---+\s*$/gm, "\n\n---\n\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function renderInlineMarkdown(text, keyPrefix) {
  const parts = [];
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2] || match[3]) {
      parts.push(
        <strong key={`${keyPrefix}-strong-${match.index}`} className="font-semibold">
          {match[2] || match[3]}
        </strong>
      );
    } else if (match[4]) {
      parts.push(
        <code
          key={`${keyPrefix}-code-${match.index}`}
          className="rounded bg-paper-card px-1 py-0.5 font-mono text-[0.9em]"
        >
          {match[4]}
        </code>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function Avatar({ label, muted = false }) {
  return (
    <span
      className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
        muted ? "bg-line text-ink-soft" : "bg-accent text-white"
      }`}
    >
      {label}
    </span>
  );
}

function ChatMessageUsage({ message }) {
  const usage = message.usage;
  const cost = message.cost;
  const hitOutputLimit =
    usage?.output_tokens &&
    message.maxOutputTokens &&
    usage.output_tokens >= message.maxOutputTokens * 0.98;

  if (!usage && !cost && !message.model) return null;

  return (
    <p className="mt-2 border-t border-line pt-2 text-[11px] leading-4 text-ink-soft">
      {message.model ? `${message.model} · ` : ""}
      输入 {usage?.input_tokens ?? "未知"} / 输出 {usage?.output_tokens ?? "未知"}
      {cost ? ` · ${formatUsd(cost.totalCost)}` : ""}
      {hitOutputLimit ? " · 可能已到输出上限" : ""}
    </p>
  );
}

function SidebarPanel({
  activePanel,
  guide,
  loading,
  startedAt,
  error,
  activeGuideTab,
  onTabChange,
  onAsk,
  disabled,
  currentIndex,
  planItems,
  completed,
  notes,
  onUpdateNote,
  onDeleteNote,
  onClearNoteHighlight,
  onStartReplaceNoteSource,
  noteSourceTarget,
  pendingNoteDraft,
  onSavePendingNote,
  onCancelPendingNote,
  onGenerate,
  onJump,
  onMarkUnfinished,
}) {
  if (activePanel === "guide") {
    return (
      <section className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded-lg bg-paper p-3 lg:h-auto lg:flex-1">
        <div className="shrink-0">
          <p className="text-xs text-ink-soft">阅读提示</p>
          <h3 className="mt-1 text-sm font-medium text-ink">带着目标读这一段</h3>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {loading && <GuideLoading startedAt={startedAt} compact />}
          {error && <p className="text-sm leading-6 text-red-600">{error}</p>}
          {!guide && !loading && (
            <button
              onClick={onGenerate}
              disabled={disabled}
              className="w-full rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper-card disabled:opacity-50"
            >
              生成阅读目标
            </button>
          )}
          {guide && (
            <GuideInsightPanel
              guide={guide}
              activeTab={activeGuideTab}
              onTabChange={onTabChange}
              onAsk={onAsk}
              disabled={disabled}
              showTitle={false}
            />
          )}
        </div>
      </section>
    );
  }

  if (activePanel === "notes") {
    return (
      <section className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded-lg bg-paper p-3 lg:h-auto lg:flex-1">
        <div className="shrink-0">
          <p className="text-xs text-ink-soft">本章笔记</p>
          <h3 className="mt-1 text-sm font-medium text-ink">高亮、摘录和导师回答</h3>
        </div>
        <div className="mt-3 min-h-0 flex-1">
          <NotesPanel
            notes={notes}
            showTitle={false}
            pendingNoteDraft={pendingNoteDraft}
            noteSourceTarget={noteSourceTarget}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            onClearNoteHighlight={onClearNoteHighlight}
            onStartReplaceNoteSource={onStartReplaceNoteSource}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded-lg bg-paper p-3 lg:h-auto lg:flex-1">
      <div className="shrink-0">
        <p className="text-xs text-ink-soft">阅读项</p>
        <h3 className="mt-1 text-sm font-medium text-ink">切换当天的阅读内容</h3>
      </div>
      <ReadingItemsPanel
        currentIndex={currentIndex}
        planItems={planItems}
        completed={completed}
        onJump={onJump}
        onMarkUnfinished={onMarkUnfinished}
      />
    </section>
  );
}

function ReadingItemsPanel({ currentIndex, planItems, completed, onJump, onMarkUnfinished }) {
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onJump(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper-card disabled:opacity-40"
        >
          上一项
        </button>
        <button
          onClick={() => onJump(currentIndex + 1)}
          disabled={currentIndex >= planItems.length - 1}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper-card disabled:opacity-40"
        >
          下一项
        </button>
      </div>
      <ol className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {planItems.map((planItem, index) => (
          <li key={planItem.key || `${planItem.title}-${index}`}>
            <button
              type="button"
              onClick={() => onJump(index)}
              className={`w-full rounded-lg px-3 py-2 text-left text-xs leading-5 transition ${
                index === currentIndex
                  ? "bg-accent text-white"
                  : "bg-paper-card text-ink-soft hover:text-accent"
              }`}
            >
              <span className="block text-[11px] opacity-80">Day {planItem.day}</span>
              <span className="line-clamp-2">{planItem.title}</span>
            </button>
          </li>
        ))}
      </ol>
      {completed && (
        <button
          onClick={onMarkUnfinished}
          className="mt-3 w-full shrink-0 rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper-card"
        >
          标记未完成
        </button>
      )}
    </div>
  );
}

function NotesPanel({
  notes,
  showTitle = true,
  pendingNoteDraft,
  noteSourceTarget,
  onUpdateNote,
  onDeleteNote,
  onClearNoteHighlight,
  onStartReplaceNoteSource,
}) {
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const selectedNote = notes.find((note) => note.id === selectedNoteId) || null;

  useEffect(() => {
    if (!pendingNoteDraft?.text) return;
    setSelectedNoteId(null);
    setEditing(false);
  }, [pendingNoteDraft]);

  useEffect(() => {
    if (selectedNoteId && !notes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(null);
      setEditing(false);
    }
  }, [notes, selectedNoteId]);

  useEffect(() => {
    if (!selectedNote || !editing) return;
    setDraft(selectedNote.note || "");
  }, [selectedNote, editing]);

  function openNote(note) {
    setSelectedNoteId(note.id);
    setEditing(false);
  }

  function startEditing() {
    if (!selectedNote) return;
    setDraft(selectedNote.note || "");
    setEditing(true);
  }

  async function saveNoteEdit(event) {
    event.preventDefault();
    if (!selectedNote || !onUpdateNote) return;
    await onUpdateNote(selectedNote.id, { note: draft });
    setEditing(false);
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      {showTitle && <p className="text-xs font-medium text-ink-soft">本章笔记</p>}
      {pendingNoteDraft && (
        <p className="mb-2 shrink-0 rounded-lg bg-paper-card px-3 py-2 text-xs leading-5 text-ink-soft">
          正在为选中的原文添加笔记，编辑框已浮在阅读页上。
        </p>
      )}
      {noteSourceTarget && (
        <p className="mb-2 shrink-0 rounded-lg bg-paper-card px-3 py-2 text-xs leading-5 text-accent">
          正在重新选择「{noteSourceTarget.text || noteSourceTarget.note || "这条笔记"}」的原文。
        </p>
      )}
      {notes.length === 0 ? (
        <p className="mt-2 rounded-lg bg-paper-card px-3 py-3 text-xs leading-5 text-ink-soft">
          选中 PDF 原文后可以添加高亮笔记；导师回答也可以一键记到这里。
        </p>
      ) : selectedNote ? (
        <NoteDetail
          note={selectedNote}
          editing={editing}
          draft={draft}
          onDraftChange={setDraft}
          onBack={() => {
            setSelectedNoteId(null);
            setEditing(false);
          }}
          onEdit={startEditing}
          onCancel={() => setEditing(false)}
          onSave={saveNoteEdit}
          onDelete={() => onDeleteNote?.(selectedNote.id)}
          onClearHighlight={() => onClearNoteHighlight?.(selectedNote.id)}
          onReplaceSource={() => onStartReplaceNoteSource?.(selectedNote)}
          editable={Boolean(onUpdateNote)}
        />
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => openNote(note)}
                className="w-full rounded-lg bg-paper-card px-3 py-3 text-left text-xs leading-5 transition hover:bg-paper hover:shadow-sm"
              >
                <p className="line-clamp-2 text-ink">“{note.text || "AI 导师回答"}”</p>
                <p className="mt-1 line-clamp-3 text-ink-soft">
                  {note.note || note.assistantContent || "未填写笔记"}
                </p>
                <p className="mt-2 text-[11px] text-ink-soft">
                  {note.pageNumber ? `第 ${note.pageNumber} 页 · ` : ""}
                  {formatReadingTime(note.createdAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteDetail({
  note,
  editing,
  draft,
  onDraftChange,
  onBack,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onClearHighlight,
  onReplaceSource,
  editable,
}) {
  const hasHighlight = Boolean(note.text && !note.highlightDisabled);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-paper-card"
        >
          返回列表
        </button>
        {!editing && editable && (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              删除
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {note.text && (
          <section className="rounded-lg bg-paper-card px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-ink-soft">
                原文摘录{note.pageNumber ? ` · 第 ${note.pageNumber} 页` : ""}
                {note.highlightDisabled ? " · 高亮已取消" : ""}
              </p>
            </div>
            <blockquote className="mt-2 border-l-4 border-line pl-3 text-sm leading-6 text-ink">
              {note.text}
            </blockquote>
            {!editing && editable && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onReplaceSource}
                  className="rounded-lg border border-line px-3 py-2 text-xs text-ink-soft hover:bg-paper"
                >
                  重新划原文
                </button>
                <button
                  type="button"
                  onClick={onClearHighlight}
                  disabled={!hasHighlight}
                  className="rounded-lg border border-line px-3 py-2 text-xs text-ink-soft hover:bg-paper disabled:opacity-40"
                >
                  取消高亮
                </button>
              </div>
            )}
          </section>
        )}

        <section className="rounded-lg bg-paper-card px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-soft">我的笔记</p>
            <p className="text-[11px] text-ink-soft">支持 Markdown</p>
          </div>
          {editing ? (
            <form onSubmit={onSave} className="mt-2">
              <textarea
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                rows={8}
                placeholder="用 Markdown 写下你的理解、疑问或延伸。"
                className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-accent"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:opacity-90"
                >
                  保存
                </button>
              </div>
            </form>
          ) : note.note ? (
            <div className="mt-2 text-sm leading-6 text-ink">
              <MarkdownText value={note.note} />
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-ink-soft">还没有写自己的笔记。</p>
          )}
        </section>

        {note.assistantContent && (
          <section className="rounded-lg bg-paper-card px-3 py-3">
            <p className="text-[11px] text-ink-soft">AI 导师回答</p>
            <div className="mt-2 text-sm leading-6 text-ink">
              <MarkdownText value={note.assistantContent} />
            </div>
          </section>
        )}

        <p className="px-1 text-[11px] leading-5 text-ink-soft">
          {note.pageNumber ? `第 ${note.pageNumber} 页 · ` : ""}
          创建于 {formatReadingTime(note.createdAt)}
          {note.updatedAt && note.updatedAt !== note.createdAt
            ? ` · 更新于 ${formatReadingTime(note.updatedAt)}`
            : ""}
        </p>
      </div>
    </div>
  );
}

function GuideInsightPanel({ guide, activeTab, onTabChange, onAsk, disabled, showTitle = true }) {
  const activeOption =
    GUIDE_TAB_OPTIONS.find((option) => option.key === activeTab) || GUIDE_TAB_OPTIONS[0];
  const items = toList(guide?.[activeOption.key]).slice(0, 2);

  return (
    <section>
      {showTitle && <p className="text-xs font-medium text-ink-soft">阅读提示</p>}
      <div className={showTitle ? "mt-2" : ""}>
        <div className="grid grid-cols-3 rounded-lg bg-paper-card p-1">
          {GUIDE_TAB_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => onTabChange(option.key)}
              className={`rounded-md px-2 py-1 text-xs transition ${
                activeTab === option.key
                  ? "bg-accent text-white"
                  : "text-ink-soft hover:bg-paper"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="mt-3 text-xs leading-5 text-ink-soft">这一类提示还没有内容。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((item, index) => (
              <li key={`${activeOption.key}-${index}`}>
                <button
                  onClick={() => onAsk(`${activeOption.promptPrefix}${item}`)}
                  disabled={disabled}
                  className="w-full rounded-lg bg-paper-card px-3 py-2 text-left text-xs leading-5 text-ink hover:text-accent disabled:opacity-50"
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function toList(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(toText) : [];
}

function buildChapterSections(chapters, pages, item) {
  const chapterIds = item.chapterIds || [];
  const selected =
    chapterIds.length > 0
      ? chapters.filter((chapter) => chapterIds.includes(chapter.id))
      : chapters.filter(
          (chapter) =>
            chapter.startPage <= item.endPage &&
            chapter.endPage >= item.startPage &&
            (chapter.role === item.type || (!chapter.role && item.type === "main"))
        );

  return selected.map((chapter) => ({
    chapter,
    text: pages
      .filter(
        (page) => page.pageNumber >= chapter.startPage && page.pageNumber <= chapter.endPage
      )
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n\n"),
  }));
}

function buildReadingBridge({ book, item, currentIndex, planItems }) {
  const title = toText(book.title) || "这本书";
  const previous = planItems[currentIndex - 1];

  if (currentIndex === 0) {
    return `今天是你正式翻开《${title}》的第一步。先不用急着抓住所有细节，我们先建立一个入口：这本书到底想带你理解什么问题，作者为什么要这样安排开场，以及你可以用什么节奏进入它。`;
  }

  return `上一项你读的是「${previous?.title || "前一部分"}」。今天这一章会接着往前走：你可以一边回想上一章留下的问题，一边观察作者这次是补充背景、推进概念，还是开始给出方法。`;
}

function buildReflectionPrompts(guide, item) {
  const questions = (guide?.questions || []).slice(0, 2);
  return [
    `如果只用一句话概括「${item.title}」，你会怎么说？`,
    ...questions,
    "这一章里有没有一个概念，可以立刻和你的经验、工作或生活连接起来？",
  ].slice(0, 4);
}

function buildPendingNoteFromSelection(selection) {
  return {
    id: `note-draft-${Date.now()}`,
    pageNumber: selection?.pageNumber || null,
    text: toText(selection?.text).trim(),
    rects: normalizeHighlightRects(selection?.rects),
  };
}

function buildQuoteMeta(quote) {
  if (!quote?.text) return null;
  return {
    pageNumber: quote.pageNumber || null,
    text: toText(quote.text).trim(),
    rects: normalizeHighlightRects(quote.rects),
  };
}

function normalizeHighlightRects(rects) {
  if (!Array.isArray(rects)) return [];
  return rects
    .map((rect) => ({
      x: clampRatio(rect.x),
      y: clampRatio(rect.y),
      width: clampRatio(rect.width),
      height: clampRatio(rect.height),
    }))
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function extractQuoteFromChatContent(content) {
  const text = toText(content);
  const pageMatch = text.match(/我在第\s*(\d+)\s*页选中/);
  const quoteMatch = text.match(/^>\s*(.+)$/m);

  return {
    pageNumber: pageMatch ? Number(pageMatch[1]) : null,
    text: quoteMatch ? quoteMatch[1].trim() : "",
  };
}

function clampIndex(index, length) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function getSavedLocationForCurrentItem(progress, key, item) {
  const savedLocation = progress?.currentPageByItemKey?.[key];
  if (!savedLocation?.pageNumber) return null;

  return {
    ...savedLocation,
    pageNumber: normalizePageNumber(savedLocation.pageNumber, item),
  };
}

function normalizePageNumber(pageNumber, item) {
  const start = Number(item?.startPage) || 1;
  const end = Math.max(start, Number(item?.endPage) || start);
  const value = Number(pageNumber) || start;
  return Math.max(start, Math.min(value, end));
}

function addReadingDay(progress) {
  const today = formatLocalDate(new Date());
  const readingDays = new Set(progress.readingDays || []);
  readingDays.add(today);

  return {
    ...progress,
    readingDays: [...readingDays].sort(),
  };
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatReadingTime(value) {
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

function buildChatMessageWithQuote(question, quote) {
  const text = toText(question).trim();
  if (!quote?.text) return text;

  const pageNumber = quote.pageNumber ? `第 ${quote.pageNumber} 页` : "当前页";
  return [
    `我在${pageNumber}选中了这句/这段：`,
    `> ${toText(quote.text).trim()}`,
    "",
    text ? `我想问：${text}` : "请围绕这段话陪我读。"
  ].join("\n");
}

function GuideLoading({ startedAt, compact = false }) {
  const elapsed = useElapsedSeconds(startedAt);
  const waitingMessage = WAITING_MESSAGES[Math.floor(elapsed / 4) % WAITING_MESSAGES.length];

  return (
    <div className={`${compact ? "mt-5" : "mt-0"} rounded-xl border border-line bg-paper p-5`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink">AI 正在准备导读</p>
          <p className="mt-1 text-xs text-ink-soft">
            已等待 {elapsed} 秒。长章节会稍慢一些，页面可以保持打开。
          </p>
        </div>
        <div className="rounded-lg bg-paper-card px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent" />
          </div>
        </div>
      </div>
      {!compact && (
        <p className="mt-4 rounded-lg bg-paper-card px-4 py-3 text-sm text-ink">
          {waitingMessage}
        </p>
      )}
    </div>
  );
}

const WAITING_MESSAGES = [
  "正在阅读当前章节上下文",
  "正在提炼本章的阅读目标",
  "正在整理关键概念和读前问题",
  "正在把导读组织成清晰结构",
];

function GuideUsage({ guide }) {
  const usage = guide.usage;
  const cost = guide.cost;

  if (!usage && !cost) return null;

  return (
    <div className="rounded-lg border border-line bg-paper px-4 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium text-ink">本次生成消耗</h3>
        {guide.model && <p className="text-xs text-ink-soft">{guide.model}</p>}
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <Stat label="输入 token" value={usage?.input_tokens ?? "未知"} />
        <Stat label="输出 token" value={usage?.output_tokens ?? "未知"} />
        <Stat label="估算费用" value={cost ? formatUsd(cost.totalCost) : "未知"} />
      </div>
      {cost && (
        <p className="mt-3 text-xs leading-5 text-ink-soft">
          估算按 ${cost.inputRatePerMTok}/百万输入 token、${cost.outputRatePerMTok}/百万输出
          token 计算；实际账单以模型服务商后台为准。
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 font-medium text-ink">{value}</p>
    </div>
  );
}

function GuideList({ title, items, compact = false }) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <ul className={`mt-2 ${compact ? "space-y-2" : "space-y-3"}`}>
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className={`rounded-lg bg-paper text-ink ${
              compact ? "px-3 py-2 text-xs leading-5" : "px-4 py-3 text-sm leading-6"
            }`}
          >
            <GuideMarkdownText value={item} compact={compact} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuideMarkdownText({ value, compact = false }) {
  const blocks = splitGuideMarkdownBlocks(value);
  if (blocks.length === 0) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {blocks.map((block, index) =>
        block.type === "quote" ? (
          <blockquote
            key={`guide-md-${index}`}
            className="border-l-4 border-line bg-paper-card px-4 py-3 text-ink-soft"
          >
            {block.lines.map((line, lineIndex) => (
              <p key={`guide-md-${index}-${lineIndex}`}>
                {renderGuideInlineMarkdown(line, `guide-${index}-${lineIndex}`)}
              </p>
            ))}
          </blockquote>
        ) : (
          <p key={`guide-md-${index}`}>
            {renderGuideInlineMarkdown(block.text, `guide-${index}`)}
          </p>
        )
      )}
    </div>
  );
}

function splitGuideMarkdownBlocks(value) {
  const lines = toText(value)
    .replace(/\\n/g, "\n")
    .split(/\n+/)
    .map(cleanGuideMarkdownLine)
    .filter(Boolean);

  const blocks = [];
  let paragraph = [];
  let quote = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ").replace(/\s+/g, " ").trim() });
    paragraph = [];
  }

  function flushQuote() {
    if (quote.length === 0) return;
    blocks.push({ type: "quote", lines: quote });
    quote = [];
  }

  for (const line of lines) {
    if (line.startsWith(">")) {
      flushParagraph();
      quote.push(line.replace(/^>\s?/, "").trim());
    } else {
      flushQuote();
      paragraph.push(line);
    }
  }

  flushQuote();
  flushParagraph();
  return blocks;
}

function cleanGuideMarkdownLine(line) {
  const text = line.trim();
  if (!text || /^-{3,}$/.test(text)) return "";

  return text
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/, "")
    .replace(/\s*\|\s*/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function renderGuideInlineMarkdown(text, keyPrefix) {
  const parts = [];
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <strong key={`${keyPrefix}-strong-${match.index}`} className="font-semibold">
        {match[2] || match[3]}
      </strong>
    );

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function useElapsedSeconds(startedAt) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }

    function update() {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return elapsed;
}
