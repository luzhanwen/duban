import { useEffect, useMemo, useRef, useState } from "react";
import { BrandName, renderBrandNameText } from "./BrandLogo.jsx";
import PdfReader from "./PdfReader.jsx";
import TextBookReader from "./TextBookReader.jsx";
import { getBookPageUnitLabel, isPdfBook } from "../lib/bookFormats.js";
import {
  getBook,
  getBookPages,
  getReadingProgress,
  saveReadingProgress,
  updateBookCompanionFocus,
} from "../lib/books.js";
import {
  generateReadingGuide,
  getPlanItemKey,
  getReadingGuide,
} from "../lib/readingGuides.js";
import { getReadingChat, sendReadingChatMessage } from "../lib/readingChat.js";
import {
  buildInitialReflectionMessage,
  getReadingReflection,
  saveReadingReflection,
  sendReadingReflectionMessage,
} from "../lib/readingReflection.js";
import {
  addReadingNote,
  deleteReadingNote,
  getReadingNotes,
  updateReadingNote,
} from "../lib/notes.js";
import { formatUsd } from "../lib/pricing.js";
import {
  formatLocalDate,
  isPlanItemDue,
} from "../lib/readingSchedule.js";
import { buildReadingContractContext } from "../lib/readingContract.js";
import { toText } from "../lib/text.js";

const SESSION_STAGES = {
  intro: "intro",
  reading: "reading",
  reflection: "reflection",
  completed: "completed",
};

const PAGE_TURN_TRANSITION_MS = 1460;

export default function Reader({
  bookId,
  initialItemIndex = null,
  initialMode = "default",
  requestId = 0,
  onBack,
  onPlan,
}) {
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [activeItemIndex, setActiveItemIndex] = useState(null);
  const [progress, setProgress] = useState({
    currentItemIndex: 0,
    completedItemKeys: [],
    completedAtByItemKey: {},
    currentPageByItemKey: {},
    readingDays: [],
    lastReadAt: null,
  });
  const [sessionStage, setSessionStage] = useState(SESSION_STAGES.intro);
  const [reflectionMessages, setReflectionMessages] = useState([]);
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [reflectionError, setReflectionError] = useState("");
  const [includeReflectionContext, setIncludeReflectionContext] = useState(true);
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
  const [preserveCurrentItemIndex, setPreserveCurrentItemIndex] = useState(false);
  const [pageTurnActive, setPageTurnActive] = useState(false);
  const progressRef = useRef(progress);
  const pendingOpenModeRef = useRef("default");
  const pageTurnFinishTimeoutRef = useRef(null);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(
    () => () => {
      if (pageTurnFinishTimeoutRef.current) {
        window.clearTimeout(pageTurnFinishTimeoutRef.current);
      }
    },
    []
  );

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
      const savedPlanItems = savedBook?.readingPlan?.items || [];
      const requestedIndex = Number.isInteger(initialItemIndex)
        ? initialItemIndex
        : savedProgress.currentItemIndex || 0;
      const openMode = initialMode || "default";

      pendingOpenModeRef.current = openMode;
      setPreserveCurrentItemIndex(openMode === "review");
      setBook(savedBook);
      setPages(savedPages);
      setActiveItemIndex(clampIndex(requestedIndex, savedPlanItems.length));
      setProgress({
        currentItemIndex: savedProgress.currentItemIndex || 0,
        completedItemKeys: savedProgress.completedItemKeys || [],
        completedAtByItemKey: savedProgress.completedAtByItemKey || {},
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
  }, [bookId, initialItemIndex, initialMode, requestId]);

  const planItems = book?.readingPlan?.items || [];
  const currentIndex = clampIndex(activeItemIndex ?? progress.currentItemIndex, planItems.length);
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

  const reflectionContextStats = useMemo(
    () => buildReflectionContextStats(chatMessages, notes),
    [chatMessages, notes]
  );

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
    setReflectionMessages([]);
    setReflectionLoading(false);
    setReflectionError("");
    setIncludeReflectionContext(true);
    const savedLocationForItem = getSavedLocationForCurrentItem(
      progressRef.current,
      currentKey,
      currentItem
    );
    const savedPage = savedLocationForItem?.pageNumber || normalizePageNumber(null, currentItem);
    const openMode = pendingOpenModeRef.current || "default";
    const forceReading = openMode === "review" || openMode === "reading";
    setCurrentPage(savedPage);
    setInitialReadingPage(savedPage);
    setSelectedQuoteDraft(null);
    setSessionStage(
      forceReading
        ? SESSION_STAGES.reading
        : completed
        ? SESSION_STAGES.completed
        : savedLocationForItem?.pageNumber
        ? SESSION_STAGES.reading
        : SESSION_STAGES.intro
    );
    pendingOpenModeRef.current = "default";
    if (!book?.id || !currentKey) return;

    getReadingGuide(book.id, currentKey).then((saved) => {
      if (alive) setGuide(saved);
    });
    getReadingChat(book.id, currentKey).then((saved) => {
      if (alive) setChatMessages(saved);
    });
    getReadingReflection(book.id, currentKey).then((saved) => {
      if (alive) setReflectionMessages(saved);
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
            先完成开书分析和阅读计划，再开始按章节阅读。
          </p>
          <button
            onClick={() => onPlan(book.id)}
            className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
          >
            前往开书设置
          </button>
        </section>
      </div>
    );
  }

  async function openPlanItem(index, mode = "default") {
    const nextIndex = clampIndex(index, planItems.length);
    const nextItem = planItems[nextIndex] || null;
    const nextKey = getPlanItemKey(nextItem, nextIndex);
    const nextCompleted = nextKey ? completedKeys.includes(nextKey) : false;
    const savedLocationForItem = getSavedLocationForCurrentItem(
      progressRef.current,
      nextKey,
      nextItem
    );
    const forceReading = mode === "review" || mode === "reading";
    const preserveCurrent = mode === "review";

    pendingOpenModeRef.current = mode;
    setPreserveCurrentItemIndex(preserveCurrent);
    setActiveItemIndex(nextIndex);
    setSessionStage(
      forceReading
        ? SESSION_STAGES.reading
        : nextCompleted
        ? SESSION_STAGES.completed
        : savedLocationForItem?.pageNumber
        ? SESSION_STAGES.reading
        : SESSION_STAGES.intro
    );

    if (!preserveCurrent) {
      const next = {
        ...progressRef.current,
        currentItemIndex: nextIndex,
      };
      persistProgress(next);
      await saveReadingProgress(book.id, next);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function jumpTo(index, mode = "default") {
    await openPlanItem(index, mode);
  }

  function enterReadingStage(options = {}) {
    const scrollBehavior = options?.scrollBehavior || "smooth";
    const trackActivity = options?.trackActivity !== false;
    setSessionStage(SESSION_STAGES.reading);
    if (trackActivity) {
      recordReadingActivity({
        pageNumber:
          getSavedLocationForCurrentItem(progressRef.current, currentKey, currentItem)?.pageNumber ||
          normalizePageNumber(null, currentItem),
      });
    }
    window.scrollTo({ top: 0, behavior: scrollBehavior });
  }

  function startReading(options = {}) {
    const withPageTurn = options?.withPageTurn === true;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!withPageTurn || reducedMotion) {
      enterReadingStage({ scrollBehavior: reducedMotion ? "auto" : "smooth" });
      return;
    }

    if (pageTurnActive) return;

    setPageTurnActive(true);
    enterReadingStage({ scrollBehavior: "auto", trackActivity: false });

    if (pageTurnFinishTimeoutRef.current) {
      window.clearTimeout(pageTurnFinishTimeoutRef.current);
    }

    pageTurnFinishTimeoutRef.current = window.setTimeout(() => {
      pageTurnFinishTimeoutRef.current = null;
      recordReadingActivity({
        pageNumber:
          getSavedLocationForCurrentItem(progressRef.current, currentKey, currentItem)?.pageNumber ||
          normalizePageNumber(null, currentItem),
      });
      setPageTurnActive(false);
    }, PAGE_TURN_TRANSITION_MS);
  }

  function openReflection() {
    ensureReflectionStarted();
    setSessionStage(SESSION_STAGES.reflection);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ensureReflectionStarted() {
    if (reflectionMessages.length > 0 || !currentItem) return;

    const opening = buildInitialReflectionMessage({ item: currentItem, guide });
    const nextMessages = [opening];
    setReflectionMessages(nextMessages);
    if (book?.id && currentKey) {
      saveReadingReflection(book.id, currentKey, nextMessages);
    }
  }

  async function finishToday() {
    const key = getPlanItemKey(currentItem, currentIndex);
    const now = new Date().toISOString();
    const nextKeys = completedKeys.includes(key) ? completedKeys : [...completedKeys, key];
    const next = {
      ...progressRef.current,
      completedItemKeys: nextKeys,
      completedAtByItemKey: {
        ...(progressRef.current.completedAtByItemKey || {}),
        [key]: progressRef.current.completedAtByItemKey?.[key] || now,
      },
      currentItemIndex: preserveCurrentItemIndex
        ? progressRef.current.currentItemIndex
        : currentIndex,
      lastReadAt: now,
    };
    persistProgress(addReadingDay(next));
    setSessionStage(SESSION_STAGES.completed);
    await saveReadingProgress(book.id, progressRef.current);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startNextItemEarly() {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= planItems.length) {
      onBack();
      return;
    }

    const next = {
      ...progressRef.current,
      currentItemIndex: clampIndex(nextIndex, planItems.length),
    };
    pendingOpenModeRef.current = "default";
    setPreserveCurrentItemIndex(false);
    setActiveItemIndex(clampIndex(nextIndex, planItems.length));
    persistProgress(next);
    setSessionStage(SESSION_STAGES.intro);
    await saveReadingProgress(book.id, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function markUnfinished() {
    const key = getPlanItemKey(currentItem, currentIndex);
    const nextCompletedAt = { ...(progress.completedAtByItemKey || {}) };
    delete nextCompletedAt[key];
    const next = {
      ...progress,
      completedItemKeys: completedKeys.filter((itemKey) => itemKey !== key),
      completedAtByItemKey: nextCompletedAt,
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
      currentItemIndex: preserveCurrentItemIndex
        ? progressRef.current.currentItemIndex
        : currentIndex,
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
        currentIndex,
        planItems,
      });
      setGuide(generated);
    } catch (e) {
      setGuideError(e.message || "导读生成失败，请稍后重试。");
    } finally {
      setGuideLoading(false);
      setGuideStartedAt(null);
    }
  }

  async function handleSaveCompanionMemory(companionFocus) {
    if (!book?.id) throw new Error("没有找到这本书，暂时无法保存读伴记忆。");
    const savedBook = await updateBookCompanionFocus(book.id, companionFocus);
    if (savedBook) {
      setBook(savedBook);
    }
    return savedBook;
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
      setChatError(e.message || "暂时没有回答出来，请稍后重试。");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleSendReflection(content) {
    const text = toText(content).trim();
    if (!text || reflectionLoading) return;

    const openingMessages =
      reflectionMessages.length > 0
        ? reflectionMessages
        : [buildInitialReflectionMessage({ item: currentItem, guide })];
    const optimisticMessage = {
      id: `reflection-local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const streamingMessage = {
      id: `reflection-stream-${Date.now()}`,
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };

    setReflectionError("");
    setReflectionLoading(true);
    setReflectionMessages([...openingMessages, optimisticMessage, streamingMessage]);

    try {
      const result = await sendReadingReflectionMessage({
        book,
        item: currentItem,
        itemKey: currentKey,
        chapterSections,
        guide,
        readingChatMessages: includeReflectionContext ? chatMessages : [],
        readingNotes: includeReflectionContext ? notes : [],
        messages: openingMessages,
        content: text,
        onDelta: (delta) => {
          setReflectionMessages((current) =>
            current.map((message) =>
              message.id === streamingMessage.id
                ? { ...message, content: `${message.content}${delta}` }
                : message
            )
          );
        },
      });
      setReflectionMessages(result.messages);
    } catch (e) {
      setReflectionMessages(openingMessages);
      setReflectionError(e.message || "暂时没有追问出来，请稍后再试。");
    } finally {
      setReflectionLoading(false);
    }
  }

  function handleAskSelection(selection) {
    const pageUnitLabel = getBookPageUnitLabel(book);

    if (selection?.action === "ask") {
      setSelectedQuoteDraft({
        id: `quote-${Date.now()}`,
        pageNumber: selection.pageNumber || null,
        pageUnitLabel,
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

      setPendingNoteDraft({
        ...buildPendingNoteFromSelection(selection),
        pageUnitLabel,
      });
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
      source: pendingNoteDraft.source || "selection",
    });
    setNotes(saved);
    setPendingNoteDraft(null);
    showNoteNotice("已添加到本章笔记");
  }

  function handleStartGuideNote(insight) {
    if (!insight?.text) return;
    setPendingNoteDraft(buildPendingNoteFromGuideInsight(insight));
  }

  async function handleAddChatMessageToNote(message, previousUserMessage) {
    if (!book?.id || !currentKey || !message?.content) return;
    const quote = previousUserMessage?.quote || extractQuoteFromChatContent(previousUserMessage?.content);
    const saved = await addReadingNote(book.id, currentKey, {
      pageNumber: quote.pageNumber || currentPageContext?.pageNumber || null,
      pageUnitLabel: quote.pageUnitLabel || getBookPageUnitLabel(book),
      text: quote.text,
      rects: quote.rects,
      note: "AI 回答",
      assistantContent: message.content,
      sourceMessageId: message.id,
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
    showNoteNotice("请在正文中重新划选原文，然后点“添加笔记”");
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

  function renderPageTurnOverlay() {
    if (!pageTurnActive) return null;

    return (
      <PageTurnTransition
        title={currentItem?.title}
        bookTitle={book?.title}
      />
    );
  }

  function renderWithPageTurn(stage) {
    return (
      <>
        {stage}
        {renderPageTurnOverlay()}
      </>
    );
  }

  if (sessionStage === SESSION_STAGES.reading) {
    return renderWithPageTurn(
      <ReadingStage
        book={book}
        item={currentItem}
        currentIndex={currentIndex}
        planItems={planItems}
        completedKeys={completedKeys}
        itemLocations={progress.currentPageByItemKey || {}}
        completed={completed}
        pages={pages}
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
        onSaveCompanionMemory={handleSaveCompanionMemory}
        onStartGuideNote={handleStartGuideNote}
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
        messages={reflectionMessages}
        loading={reflectionLoading}
        error={reflectionError}
        includeReadingContext={includeReflectionContext}
        readingContextStats={reflectionContextStats}
        onIncludeReadingContextChange={setIncludeReflectionContext}
        onBack={onBack}
        onReading={startReading}
        onSend={handleSendReflection}
        onComplete={finishToday}
      />
    );
  }

  if (sessionStage === SESSION_STAGES.completed) {
    return (
      <DailyCompleteStage
        book={book}
        item={currentItem}
        currentIndex={currentIndex}
        planItems={planItems}
        completedKeys={completedKeys}
        itemLocations={progress.currentPageByItemKey || {}}
        completedCount={completedKeys.length}
        onBack={onBack}
        onStartNext={startNextItemEarly}
        onOpenItem={openPlanItem}
      />
    );
  }

  return renderWithPageTurn(
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
      readingTransitioning={pageTurnActive}
      onBack={onBack}
      onStartReading={() => startReading({ withPageTurn: true })}
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
  readingTransitioning,
  onBack,
  onStartReading,
  onGenerateGuide,
  onJump,
  onMarkUnfinished,
}) {
  const bridge = buildReadingBridge({ book, item, currentIndex, planItems, completedKeys });
  const pageUnitLabel = getBookPageUnitLabel(book);

  return (
    <div className="reader-intro-page min-h-screen bg-paper px-6 py-8">
      {readingTransitioning && (
        <span className="sr-only" role="status" aria-live="polite">
          正在翻开这一章
        </span>
      )}
      <div className="reader-intro-topbar mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm text-ink-soft">阅读会话</p>
        <button onClick={onBack} className="text-sm text-accent underline">
          退出到书架
        </button>
      </div>

      <main className="reader-intro-main mx-auto flex max-w-4xl flex-col justify-center py-12 lg:min-h-[calc(100vh-96px)]">
        <p className="reader-intro-kicker text-sm text-ink-soft">
          Day {item.day} · {item.type === "guide" ? "开始前准备" : "今日章节"}
        </p>
        <h1 className="reader-intro-title mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          {item.title}
        </h1>
        <p className="reader-intro-meta mt-4 text-sm text-ink-soft">
          {formatPageRange(item.startPage, item.endPage, pageUnitLabel)} · 已完成 {completedKeys.length} /{" "}
          {planItems.length} 个阅读日
        </p>

        <section className="reader-intro-card mt-10 rounded-xl border border-line bg-paper-card p-7 shadow-sm">
          <p className="text-xs font-medium text-ink-soft">
            <BrandName />开场
          </p>
          <p className="reader-bridge-text mt-3 text-lg leading-9 text-ink">{bridge}</p>

          <TutorBriefing
            guide={guide}
            loading={guideLoading}
            startedAt={guideStartedAt}
            error={guideError}
            disabled={chapterSections.length === 0}
            onGenerate={onGenerateGuide}
          />
        </section>

        <div className="reader-intro-actions mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              disabled={readingTransitioning}
              className="rounded-lg bg-accent px-5 py-2 text-sm text-white shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              翻开这一章
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function PageTurnTransition({ title, bookTitle }) {
  const displayTitle = toText(title || "这一章");
  const displayBookTitle = toText(bookTitle || "");

  return (
    <div className="page-turn-overlay" role="status" aria-live="polite">
      <span className="sr-only">{`正在翻开《${displayTitle}》`}</span>
      <div className="page-turn-sheet" aria-hidden="true">
        <div className="page-turn-sheet-face page-turn-sheet-front">
          <div className="page-turn-sheet-content">
            <p className="page-turn-sheet-kicker">DUBAN READING</p>
            <h2>{displayTitle}</h2>
            {displayBookTitle && <p>{displayBookTitle}</p>}
            <PageTurnLines />
          </div>
        </div>
        <div className="page-turn-sheet-face page-turn-sheet-back">
          <div className="page-turn-sheet-content page-turn-sheet-content-back">
            <PageTurnLines />
            <PageTurnLines />
            <PageTurnLines />
            <PageTurnLines />
            <PageTurnLines />
            <PageTurnLines />
          </div>
        </div>
      </div>
      <div className="page-turn-spine-shadow" aria-hidden="true" />
    </div>
  );
}

function PageTurnLines() {
  return (
    <div className="page-turn-lines">
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function ReadingStage({
  book,
  item,
  currentIndex,
  planItems,
  completedKeys,
  itemLocations,
  completed,
  pages,
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
  onSaveCompanionMemory,
  onStartGuideNote,
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
  const pdfBook = isPdfBook(book);
  const pageUnitLabel = getBookPageUnitLabel(book);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper">
      <header className="shrink-0 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs text-ink-soft">
              {toText(book.title)} · Day {item.day}
            </p>
            <h1 className="mt-1 font-serif text-2xl text-ink">{item.title}</h1>
            {continuing && savedLocation?.pageNumber && (
              <p className="mt-1 text-xs text-ink-soft">
                继续上次：{formatPageLabel(savedLocation.pageNumber, pageUnitLabel)}
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
          {pdfBook ? (
            <PdfReader
              bookId={book.id}
              startPage={item.startPage}
              endPage={item.endPage}
              initialPage={initialPage}
              highlights={visibleHighlights}
              onCurrentPageChange={onCurrentPageChange}
              onAskSelection={onAskSelection}
            />
          ) : (
            <TextBookReader
              pages={pages}
              startPage={item.startPage}
              endPage={item.endPage}
              initialPage={initialPage}
              onCurrentPageChange={onCurrentPageChange}
              onAskSelection={onAskSelection}
            />
          )}
        </article>

        <TutorSidebar
          item={item}
          book={book}
          currentIndex={currentIndex}
          planItems={planItems}
          completedKeys={completedKeys}
          itemLocations={itemLocations}
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
          pageUnitLabel={pageUnitLabel}
          disabled={chapterSections.length === 0 && !currentPageHasText}
          onGenerate={onGenerateGuide}
          onSaveCompanionMemory={onSaveCompanionMemory}
          onStartGuideNote={onStartGuideNote}
          onSendChat={onSendChat}
          onJump={onJump}
          onMarkUnfinished={onMarkUnfinished}
        />
      </main>

      {pendingNoteDraft && (
        <FloatingNoteComposer
          draft={pendingNoteDraft}
          pageUnitLabel={pageUnitLabel}
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
  messages,
  loading,
  error,
  includeReadingContext,
  readingContextStats,
  onIncludeReadingContextChange,
  onBack,
  onReading,
  onSend,
  onComplete,
}) {
  const [draft, setDraft] = useState("");
  const messagesRef = useRef(null);
  const lastItem = currentIndex >= planItems.length - 1;
  const completeLabel = lastItem
    ? completed
      ? "已经完成这本书"
      : "完成这本书"
    : completed
    ? "今天已完成"
    : "完成今天的阅读";
  const answered = messages.some((message) => message.role === "user");
  const hasReadingContext = readingContextStats.total > 0;

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;

    window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  }, [messages, loading]);

  function submitAnswer(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    onSend(text);
  }

  function handleTextareaKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    const form = event.currentTarget.form;
    if (form) form.requestSubmit();
  }

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
          这一章不急着合上。先和<BrandName />聊几轮，把你的理解、疑惑和章节里的细节接起来。
        </p>

        <section className="mt-10 flex min-h-[520px] flex-col rounded-xl border border-line bg-paper-card p-4 shadow-sm sm:p-5">
          <div className="flex shrink-0 flex-col gap-1 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-2xl text-ink">
                <BrandName />追问
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                {answered ? "继续顺着你的回答往下想。" : <>先回答<BrandName />的第一个问题。</>}
              </p>
            </div>
            <div className="mt-3 flex flex-col items-start gap-2 sm:mt-0 sm:items-end">
              {loading && (
                <div className="flex w-fit items-center gap-1 rounded-full bg-paper px-3 py-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                </div>
              )}
              <label
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                  hasReadingContext
                    ? "cursor-pointer border-line bg-paper text-ink-soft"
                    : "cursor-not-allowed border-line bg-paper text-ink-soft opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={hasReadingContext && includeReadingContext}
                  disabled={!hasReadingContext || loading}
                  onChange={(event) => onIncludeReadingContextChange(event.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                    hasReadingContext && includeReadingContext ? "bg-accent" : "bg-line"
                  }`}
                >
                  <span
                    className={`h-3 w-3 rounded-full bg-white transition-transform ${
                      hasReadingContext && includeReadingContext ? "translate-x-3" : ""
                    }`}
                  />
                </span>
                <span>参考伴读记录和笔记</span>
                <span className="text-[11px] text-ink-soft">
                  {hasReadingContext
                    ? `${readingContextStats.chatCount} 提问 · ${readingContextStats.noteCount} 笔记`
                    : "暂无"}
                </span>
              </label>
            </div>
          </div>

          <div ref={messagesRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-5">
            {messages.map((message) =>
              message.streaming && !toText(message.content).trim() ? null : (
                <ReflectionMessage key={message.id} message={message} />
              )
            )}
            {loading && <ThinkingStatus />}
          </div>

          {error && <p className="mb-3 text-sm leading-6 text-red-600">{error}</p>}

          <form onSubmit={submitAnswer} className="shrink-0 border-t border-line pt-4">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              rows={3}
              disabled={loading}
              placeholder="用自己的话回答。Enter 发送，Shift+Enter 换行。"
              className="w-full resize-none rounded-lg border border-line bg-paper px-4 py-3 text-sm leading-7 text-ink outline-none focus:border-accent disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!draft.trim() || loading}
              className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "等待追问…" : <>回答<BrandName /></>}
            </button>
          </form>
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
            disabled={loading || (completed && lastItem)}
            className="rounded-lg bg-accent px-5 py-2 text-sm text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {completeLabel}
          </button>
        </div>
      </main>
    </div>
  );
}

function ReflectionMessage({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${
          isUser
            ? "rounded-tr-sm bg-accent text-white"
            : "rounded-tl-sm bg-paper text-ink"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">
            {renderBrandNameText(message.content, `reflection-user-${message.id}`)}
          </p>
        ) : (
          <MarkdownText value={message.content} />
        )}
        {!isUser && !message.streaming && <ChatMessageUsage message={message} />}
      </div>
    </div>
  );
}

function DailyCompleteStage({
  book,
  item,
  currentIndex,
  planItems,
  completedKeys,
  itemLocations,
  completedCount,
  onBack,
  onStartNext,
  onOpenItem,
}) {
  const nextItem = planItems[currentIndex + 1];
  const hasNext = Boolean(nextItem);
  const nextDue = hasNext && isPlanItemDue(nextItem);
  const pageUnitLabel = getBookPageUnitLabel(book);

  return (
    <div className="min-h-screen bg-paper px-6 py-8">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm text-ink-soft">今日阅读完成</p>
        <button onClick={onBack} className="text-sm text-accent underline">
          退回书架
        </button>
      </div>

      <main className="mx-auto flex max-w-4xl flex-col justify-center py-16 lg:min-h-[calc(100vh-96px)]">
        <p className="text-sm text-ink-soft">
          {toText(book.title)} · Day {item.day}
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          恭喜，今天的阅读任务完成了
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-9 text-ink">
          你已经读完「{item.title}」。今天可以在这里停下，让这一章慢慢沉淀；
          {hasNext && nextDue
            ? "下一项已经到了计划日，也可以继续进入下一项。"
            : "也可以选择提前进入下一章，但它会被视为额外阅读。"}
        </p>

        <section className="mt-10 rounded-xl border border-line bg-paper-card p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="今日完成" value={`Day ${item.day}`} />
            <Stat label="累计进度" value={`${completedCount} / ${planItems.length} 项`} />
            <Stat label="下一阅读项" value={hasNext ? nextItem.title : "已经没有下一项"} />
          </div>
        </section>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            onClick={onBack}
            className="rounded-lg border border-line px-5 py-3 text-sm text-ink-soft hover:bg-paper-card"
          >
            退回书架
          </button>
          <button
            onClick={onStartNext}
            disabled={!hasNext}
            className="rounded-lg bg-accent px-5 py-3 text-sm text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {hasNext
              ? nextDue
                ? "开始下一项阅读"
                : "提前开始下一章阅读"
              : "已经完成全部阅读"}
          </button>
        </div>

        <section className="mt-10 rounded-xl border border-line bg-paper-card p-5 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs text-ink-soft">阅读目录</p>
              <h2 className="mt-1 font-serif text-2xl text-ink">回顾今天或以前的内容</h2>
            </div>
            <p className="text-xs text-ink-soft">已读和未读会分开标记</p>
          </div>
          <ReadingDirectoryList
            currentIndex={currentIndex}
            planItems={planItems}
            completedKeys={completedKeys}
            itemLocations={itemLocations}
            pageUnitLabel={pageUnitLabel}
            onOpenItem={(index, itemCompleted) => {
              onOpenItem(index, itemCompleted ? "review" : "default");
            }}
          />
        </section>
      </main>
    </div>
  );
}

function TutorBriefing({ guide, loading, startedAt, error, disabled, onGenerate }) {
  return (
    <div className="guide-briefing mt-6">
      {disabled && (
        <p className="guide-message rounded-lg bg-paper px-4 py-3 text-sm text-ink-soft">
          当前阅读项没有可用章节文本，暂时不能生成导读。
        </p>
      )}

      {error && (
        <p className="guide-message rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading && <GuideLoading startedAt={startedAt} />}

      {!guide && !disabled && !error && !loading && (
        <div className="guide-empty-callout rounded-lg bg-paper px-5 py-4">
          <p className="text-sm leading-6 text-ink-soft">
            生成导读后，<BrandName />会先帮你整理今天的阅读目标和读前问题。
          </p>
          <button
            onClick={onGenerate}
            className="guide-primary-button mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
          >
            生成今日导读
          </button>
        </div>
      )}

      {guide && !loading && (
        <div className="guide-ready space-y-5">
          {guide.overview && (
            <div className="guide-overview rounded-lg bg-paper px-5 py-4 text-base leading-8 text-ink">
              <GuideMarkdownText value={guide.overview} />
            </div>
          )}
          <div className="guide-list-grid grid gap-5 lg:grid-cols-2">
            <GuideList title="今天读完后，你应该能" items={guide.goals} />
            <GuideList title="带着这些问题读" items={guide.questions} />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onGenerate}
              disabled={loading || disabled}
              className="guide-secondary-button rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper disabled:opacity-50"
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
  book,
  currentIndex,
  planItems,
  completedKeys,
  itemLocations,
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
  pageUnitLabel,
  disabled,
  onGenerate,
  onSaveCompanionMemory,
  onStartGuideNote,
  onSendChat,
  onJump,
  onMarkUnfinished,
}) {
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
            notes={notes}
            loading={chatLoading}
            error={chatError}
            noteNotice={noteNotice}
            selectedQuoteDraft={selectedQuoteDraft}
            onQuoteDraftUsed={onQuoteDraftUsed}
            onAddMessageToNote={onAddChatMessageToNote}
            currentPage={currentPage}
            currentPageHasText={currentPageHasText}
            pageUnitLabel={pageUnitLabel}
            disabled={disabled}
            onSend={onSendChat}
          />
        ) : (
          <SidebarPanel
            activePanel={activePanel}
            book={book}
            guide={guide}
            loading={loading}
            startedAt={startedAt}
            error={error}
            onAsk={(question) => {
              setActivePanel("chat");
              onSendChat(question);
            }}
            onTakeNote={(insight) => {
              onStartGuideNote?.(insight);
              setActivePanel("notes");
            }}
            disabled={disabled || chatLoading}
            currentIndex={currentIndex}
            planItems={planItems}
            completedKeys={completedKeys}
            itemLocations={itemLocations}
            completed={completed}
            notes={notes}
            pageUnitLabel={pageUnitLabel}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            onClearNoteHighlight={onClearNoteHighlight}
            onStartReplaceNoteSource={onStartReplaceNoteSource}
            noteSourceTarget={noteSourceTarget}
            pendingNoteDraft={pendingNoteDraft}
            onSavePendingNote={onSavePendingNote}
            onCancelPendingNote={onCancelPendingNote}
            onGenerate={onGenerate}
            onSaveCompanionMemory={onSaveCompanionMemory}
            onJump={onJump}
            onMarkUnfinished={onMarkUnfinished}
          />
        )}
      </section>
    </aside>
  );
}

const SIDEBAR_PANEL_OPTIONS = [
  { key: "chat", label: <span className="inline-flex items-baseline gap-1">问<BrandName /></span> },
  { key: "guide", label: "提示" },
  { key: "notes", label: "笔记" },
  { key: "memory", label: "记忆" },
  { key: "items", label: "阅读项" },
];

function SidebarPanelTabs({ activePanel, onChange }) {
  return (
    <div className="grid grid-cols-5 rounded-lg bg-paper p-1">
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
  {
    key: "goals",
    label: "目标",
    kicker: "读完后抓住",
    title: "今天的收获",
    promptPrefix: "请围绕这个阅读目标陪我读：",
  },
  {
    key: "questions",
    label: "问题",
    kicker: "读的时候想想",
    title: "可以追的问题",
    promptPrefix: "请带着这个问题陪我读：",
  },
];

const LONG_ANSWER_CHARS = 100;

function ChatPanel({
  guide,
  messages,
  notes,
  loading,
  error,
  noteNotice,
  selectedQuoteDraft,
  onQuoteDraftUsed,
  onAddMessageToNote,
  currentPage,
  currentPageHasText,
  pageUnitLabel = "页",
  disabled,
  onSend,
}) {
  const [draft, setDraft] = useState("");
  const [activeQuote, setActiveQuote] = useState(null);
  const textareaRef = useRef(null);
  const messagesRef = useRef(null);
  const savedChatNotes = useMemo(() => buildSavedChatNoteLookup(notes), [notes]);

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
          <p className="text-xs text-ink-soft">
            <span className="inline-flex items-baseline gap-1">问<BrandName /></span>
          </p>
          <h3 className="mt-1 text-sm font-medium text-ink">
            {currentPage ? `${formatPageLabel(currentPage, pageUnitLabel)}伴读` : "当前章节伴读"}
          </h3>
          {currentPage && (
            <p className="mt-1 text-[11px] leading-4 text-ink-soft">
              {currentPageHasText ? "你问当前这一段时，我会优先看这里。" : "这里暂时没有提取到文本。"}
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
                savedToNote={isChatMessageSavedToNote(message, savedChatNotes)}
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

function FloatingNoteComposer({ draft, pageUnitLabel = "页", onSave, onCancel }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    function placeComposer() {
      const node = containerRef.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const left =
        viewportWidth >= 1024
          ? viewportWidth - rect.width - 460
          : (viewportWidth - rect.width) / 2;
      const top = viewportHeight - rect.height - 16;

      setPosition(clampFloatingPosition({ left, top }, rect));
    }

    const frame = window.requestAnimationFrame(placeComposer);
    window.addEventListener("resize", placeComposer);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", placeComposer);
    };
  }, [draft?.id]);

  function moveComposer(clientX, clientY) {
    const drag = dragRef.current;
    const node = containerRef.current;
    if (!drag || !node) return;

    const rect = node.getBoundingClientRect();
    const next = {
      left: drag.originLeft + clientX - drag.startX,
      top: drag.originTop + clientY - drag.startY,
    };
    setPosition(clampFloatingPosition(next, rect));
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const node = containerRef.current;
    if (!node) return;

    event.preventDefault();
    const rect = node.getBoundingClientRect();
    const current = position || { left: rect.left, top: rect.top };
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originLeft: current.left,
      originTop: current.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;
    moveComposer(event.clientX, event.clientY);
  }

  function stopDragging(event) {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  }

  function handleDragKeyDown(event) {
    if (!position || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const node = containerRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const step = event.shiftKey ? 32 : 12;
    const next = { ...position };

    if (event.key === "ArrowUp") next.top -= step;
    if (event.key === "ArrowDown") next.top += step;
    if (event.key === "ArrowLeft") next.left -= step;
    if (event.key === "ArrowRight") next.left += step;
    if (event.key === "Home") {
      next.left = window.innerWidth >= 1024 ? window.innerWidth - rect.width - 460 : (window.innerWidth - rect.width) / 2;
      next.top = window.innerHeight - rect.height - 16;
    }

    setPosition(clampFloatingPosition(next, rect));
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-40 w-[calc(100vw-2rem)] max-w-[560px]"
      style={{
        left: position ? `${position.left}px` : "50%",
        top: position ? `${position.top}px` : "auto",
        bottom: position ? "auto" : "1rem",
        transform: position ? "none" : "translateX(-50%)",
        visibility: position ? "visible" : "hidden",
      }}
    >
      <NoteComposer
        draft={draft}
        pageUnitLabel={pageUnitLabel}
        onSave={onSave}
        onCancel={onCancel}
        floating
        dragging={dragging}
        dragHandleProps={{
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: stopDragging,
          onPointerCancel: stopDragging,
          onKeyDown: handleDragKeyDown,
        }}
      />
    </div>
  );
}

function clampFloatingPosition(position, rect) {
  const margin = 12;
  const width = rect.width || 560;
  const height = rect.height || 320;
  return {
    left: Math.min(Math.max(margin, position.left), Math.max(margin, window.innerWidth - width - margin)),
    top: Math.min(Math.max(margin, position.top), Math.max(margin, window.innerHeight - height - margin)),
  };
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

function NoteComposer({
  draft,
  pageUnitLabel = "页",
  onSave,
  onCancel,
  floating = false,
  dragging = false,
  dragHandleProps = {},
}) {
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
      {floating && (
        <div
          {...dragHandleProps}
          role="button"
          tabIndex={0}
          aria-label="拖动笔记窗口，按方向键也可以微调位置"
          className={`mb-2 flex cursor-grab select-none items-center justify-center gap-2 rounded-lg border border-transparent px-3 py-1.5 text-[11px] text-ink-soft outline-none transition hover:border-line hover:bg-paper focus-visible:border-accent ${
            dragging ? "cursor-grabbing border-line bg-paper text-accent" : ""
          }`}
        >
          <span className="h-1 w-10 rounded-full bg-line" />
          <span>拖动窗口</span>
        </div>
      )}
      <div className="rounded-lg bg-paper px-3 py-2 text-xs leading-5 text-ink-soft">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-ink">{draft.title || "添加高亮笔记"}</p>
          <p className="text-[11px] text-ink-soft">支持 Markdown</p>
        </div>
        <p className="mt-1 line-clamp-3">“{draft.text}”</p>
        {draft.pageNumber && (
          <p className="mt-1">{formatPageLabel(draft.pageNumber, pageUnitLabel)}</p>
        )}
      </div>
      <textarea
        value={noteText}
        onChange={(event) => setNoteText(event.target.value)}
        rows={floating ? 5 : 3}
        placeholder={draft.placeholder || "写一点你的理解、疑问，或留空只保存高亮。"}
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
      <Avatar label="伴" />
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-paper px-4 py-3 text-sm leading-6 text-ink shadow-sm">
        我会优先看你当前读到的页面。你可以直接问某个概念、某段话的意思，也可以选中原文后带着引用来问。
      </div>
    </article>
  );
}

function ThinkingStatus() {
  return (
    <p className="px-2 text-xs leading-5 text-ink-soft">
      <BrandName />正在整理回答…
    </p>
  );
}

function ChatMessage({
  message,
  previousMessage,
  latest = false,
  savedToNote = false,
  onAddToNote,
}) {
  const isUser = message.role === "user";
  const latestAssistant = !isUser && latest;

  return (
    <article className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <Avatar label="伴" />}
      <div
        className={`max-w-[86%] px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "rounded-2xl rounded-tr-sm bg-accent text-white"
            : savedToNote
              ? "rounded-2xl rounded-tl-sm border border-accent/30 bg-[#fff9ed] text-ink ring-1 ring-accent/10"
              : "rounded-2xl rounded-tl-sm bg-paper text-ink"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">
            {renderBrandNameText(message.content, `chat-user-${message.id}`)}
          </p>
        ) : (
          <CollapsibleMarkdownText value={message.content} forceExpanded={latestAssistant} />
        )}
        {!isUser && !message.streaming && <ChatMessageUsage message={message} />}
        {!isUser && !message.streaming && (
          <button
            type="button"
            disabled={savedToNote}
            onClick={() => onAddToNote?.(message, previousMessage)}
            className={`mt-2 inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              savedToNote
                ? "cursor-default border border-accent/30 bg-paper-card text-accent"
                : "bg-accent text-white shadow-sm hover:opacity-90"
            }`}
          >
            {savedToNote ? "已记到笔记" : "记到笔记"}
          </button>
        )}
      </div>
      {isUser && <Avatar label="你" muted />}
    </article>
  );
}

function buildSavedChatNoteLookup(notes) {
  const messageIds = new Set();
  const contents = new Set();

  (Array.isArray(notes) ? notes : []).forEach((note) => {
    if (note?.source !== "chat" && !note?.assistantContent) return;
    if (note.sourceMessageId) messageIds.add(note.sourceMessageId);
    const content = normalizeComparableText(note.assistantContent);
    if (content) contents.add(content);
  });

  return { messageIds, contents };
}

function isChatMessageSavedToNote(message, lookup) {
  if (message?.role !== "assistant" || message.streaming) return false;
  if (lookup.messageIds.has(message.id)) return true;
  return lookup.contents.has(normalizeComparableText(message.content));
}

function normalizeComparableText(value) {
  return toText(value).replace(/\s+/g, " ").trim();
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
      appendBrandText(parts, text.slice(lastIndex, match.index), `${keyPrefix}-text-${lastIndex}`);
    }

    if (match[2] || match[3]) {
      parts.push(
        <strong key={`${keyPrefix}-strong-${match.index}`} className="font-semibold">
          {renderBrandNameText(match[2] || match[3], `${keyPrefix}-strong-brand-${match.index}`)}
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
    appendBrandText(parts, text.slice(lastIndex), `${keyPrefix}-text-${lastIndex}`);
  }

  return parts;
}

function appendBrandText(parts, text, keyPrefix) {
  if (!text) return;
  const branded = renderBrandNameText(text, keyPrefix);
  if (Array.isArray(branded)) {
    parts.push(...branded);
  } else {
    parts.push(branded);
  }
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
  book,
  guide,
  loading,
  startedAt,
  error,
  onAsk,
  onTakeNote,
  disabled,
  currentIndex,
  planItems,
  completedKeys,
  itemLocations,
  completed,
  notes,
  pageUnitLabel,
  onUpdateNote,
  onDeleteNote,
  onClearNoteHighlight,
  onStartReplaceNoteSource,
  noteSourceTarget,
  pendingNoteDraft,
  onSavePendingNote,
  onCancelPendingNote,
  onGenerate,
  onSaveCompanionMemory,
  onJump,
  onMarkUnfinished,
}) {
  if (activePanel === "guide") {
    return (
      <section className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded-lg bg-paper p-3 lg:h-auto lg:flex-1">
        <div className="shrink-0">
          <p className="text-xs text-ink-soft">阅读提示</p>
          <h3 className="mt-1 text-sm font-medium text-ink">今天这段怎么读</h3>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {loading && <GuideLoading startedAt={startedAt} compact />}
          {error && <p className="text-sm leading-6 text-red-600">{error}</p>}
          {!guide && !loading && (
            <div className="guide-empty-callout rounded-xl border border-line bg-paper-card px-4 py-4 shadow-sm">
              <p className="text-sm font-medium text-ink">还没有阅读提示</p>
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                生成后会整理出 3 个阅读目标和 3 个读前问题。
              </p>
              <div className="mt-4 space-y-2">
                <span className="guide-skeleton-bar block h-2.5 w-24 rounded-full bg-line" />
                <span className="guide-skeleton-bar block h-2.5 w-full rounded-full bg-paper" />
                <span className="guide-skeleton-bar block h-2.5 w-10/12 rounded-full bg-paper" />
              </div>
              <button
                onClick={onGenerate}
                disabled={disabled}
                className="guide-primary-button mt-4 w-full rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                生成阅读提示
              </button>
            </div>
          )}
          {guide && !loading && (
            <GuideInsightPanel
              guide={guide}
              onAsk={onAsk}
              onTakeNote={onTakeNote}
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
          <h3 className="mt-1 text-sm font-medium text-ink">
            高亮、摘录和<BrandName />回答
          </h3>
        </div>
        <div className="mt-3 min-h-0 flex-1">
          <NotesPanel
            notes={notes}
            showTitle={false}
            pageUnitLabel={pageUnitLabel}
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

  if (activePanel === "memory") {
    return (
      <CompanionMemoryPanel
        book={book}
        onSave={onSaveCompanionMemory}
      />
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
        completedKeys={completedKeys}
        itemLocations={itemLocations}
        completed={completed}
        pageUnitLabel={pageUnitLabel}
        onJump={onJump}
        onMarkUnfinished={onMarkUnfinished}
      />
    </section>
  );
}

const COMPANION_MEMORY_OPTIONS = [
  {
    type: "mainline",
    label: "帮我抓主线",
    aiSummary: "减少被细节带走，持续提醒这段和全书问题的关系。",
    promptInstruction: "后续导读、问答和读后追问都要优先帮助用户抓住全书主线，避免只堆细节。",
  },
  {
    type: "background",
    label: "帮我补背景",
    aiSummary: "在必要时解释人物、制度、概念和时代背景。",
    promptInstruction: "后续导读、问答和读后追问都要用克制的背景补充帮助用户读懂当前文本。",
  },
  {
    type: "argument",
    label: "帮我拆论证",
    aiSummary: "追问作者的判断、证据和推理是否站得住。",
    promptInstruction: "后续导读、问答和读后追问都要帮助用户看见概念、证据和论证链。",
  },
  {
    type: "application",
    label: "帮我联系现实",
    aiSummary: "把书中的问题和现实经验、工作生活或其他知识连接起来。",
    promptInstruction: "后续导读、问答和读后追问都要帮助用户把当前文本和现实经验建立连接。",
  },
  {
    type: "output",
    label: "帮我沉淀输出",
    aiSummary: "把阅读转成笔记、文章、讲稿或可复用表达。",
    promptInstruction: "后续导读、问答和读后追问都要主动提示可沉淀的观点、结构和表达。",
  },
  {
    type: "custom",
    label: "我自己指定",
    aiSummary: "",
    promptInstruction: "后续导读、问答和读后追问都要围绕用户自定义的阅读目标收束。",
  },
];

function CompanionMemoryPanel({ book, onSave }) {
  const initialMemory = useMemo(() => normalizeCompanionMemory(book), [book]);
  const [form, setForm] = useState(initialMemory);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initialMemory);
    setError("");
  }, [initialMemory]);

  const dirty = !sameCompanionMemory(form, initialMemory);

  function updateField(field, value) {
    setNotice("");
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateType(type) {
    setNotice("");
    setError("");
    setForm((current) => {
      const currentDefault = getCompanionMemoryOption(current.type);
      const nextDefault = getCompanionMemoryOption(type);
      const shouldUseNextSummary =
        !toText(current.aiSummary).trim() || current.aiSummary === currentDefault.aiSummary;
      const shouldUseNextInstruction =
        !toText(current.promptInstruction).trim() ||
        current.promptInstruction === currentDefault.promptInstruction;

      return {
        ...current,
        type: nextDefault.type,
        label: nextDefault.label,
        aiSummary: shouldUseNextSummary ? nextDefault.aiSummary : current.aiSummary,
        promptInstruction: shouldUseNextInstruction
          ? nextDefault.promptInstruction
          : current.promptInstruction,
      };
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!dirty || saving) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const option = getCompanionMemoryOption(form.type);
      await onSave?.({
        ...initialMemory.raw,
        schemaVersion: initialMemory.raw?.schemaVersion || 1,
        type: option.type,
        label: option.label,
        userText: toText(form.userText).trim(),
        aiSummary: toText(form.aiSummary).trim(),
        promptInstruction: toText(form.promptInstruction).trim(),
      });
      setNotice("已更新本书读伴记忆，后续导读、问答和读后交流会按新的方向继续。");
    } catch (saveError) {
      setError(saveError.message || "这次没有保存成功，请稍后再试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded-lg bg-paper p-3 lg:h-auto lg:flex-1">
      <div className="shrink-0">
        <p className="text-xs text-ink-soft">读伴记忆</p>
        <h3 className="mt-1 text-sm font-medium text-ink">本书读伴记忆</h3>
      </div>

      <form onSubmit={handleSave} className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <CompanionMemoryTextarea
            label="我读这本书主要想解决什么"
            value={form.userText}
            rows={3}
            placeholder="例如：想抓住作者解释明代政治运转的主线。"
            onChange={(value) => updateField("userText", value)}
          />

          <label className="block">
            <span className="text-xs font-medium text-ink-soft">希望读伴重点帮我</span>
            <select
              value={form.type}
              onChange={(event) => updateType(event.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              {COMPANION_MEMORY_OPTIONS.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <CompanionMemoryTextarea
            label="读伴当前理解"
            value={form.aiSummary}
            rows={4}
            placeholder="读伴如何理解你这本书的陪读方向。"
            onChange={(value) => updateField("aiSummary", value)}
          />

          <CompanionMemoryTextarea
            label="后续陪读规则"
            value={form.promptInstruction}
            rows={4}
            placeholder="后续导读、问答和读后交流要怎样围绕这本书陪你。"
            onChange={(value) => updateField("promptInstruction", value)}
          />
        </div>

        {notice && <p className="mt-3 rounded-lg bg-paper-card px-3 py-2 text-xs leading-5 text-accent">{notice}</p>}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!dirty || saving}
          className="mt-3 w-full shrink-0 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存记忆"}
        </button>
      </form>
    </section>
  );
}

function CompanionMemoryTextarea({ label, value, rows, placeholder, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y rounded-lg border border-line bg-paper-card px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-accent"
      />
    </label>
  );
}

function normalizeCompanionMemory(book) {
  const focus = buildReadingContractContext({ book }).companionFocus || {};
  const option = getCompanionMemoryOption(focus.type);

  return {
    raw: focus,
    type: option.type,
    label: option.label,
    userText: toText(focus.userText),
    aiSummary: toText(focus.aiSummary) || option.aiSummary,
    promptInstruction: toText(focus.promptInstruction) || option.promptInstruction,
  };
}

function sameCompanionMemory(left, right) {
  return (
    left.type === right.type &&
    toText(left.userText).trim() === toText(right.userText).trim() &&
    toText(left.aiSummary).trim() === toText(right.aiSummary).trim() &&
    toText(left.promptInstruction).trim() === toText(right.promptInstruction).trim()
  );
}

function getCompanionMemoryOption(type) {
  return (
    COMPANION_MEMORY_OPTIONS.find((option) => option.type === type) ||
    COMPANION_MEMORY_OPTIONS[0]
  );
}

function ReadingItemsPanel({
  currentIndex,
  planItems,
  completedKeys,
  itemLocations,
  completed,
  pageUnitLabel = "页",
  onJump,
  onMarkUnfinished,
}) {
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
      <ReadingDirectoryList
        compact
        currentIndex={currentIndex}
        planItems={planItems}
        completedKeys={completedKeys}
        itemLocations={itemLocations}
        pageUnitLabel={pageUnitLabel}
        onOpenItem={(index, itemCompleted) => {
          onJump(index, itemCompleted ? "review" : "default");
        }}
      />
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

function ReadingDirectoryList({
  currentIndex,
  planItems,
  completedKeys = [],
  itemLocations = {},
  pageUnitLabel = "页",
  onOpenItem,
  compact = false,
}) {
  const completedSet = new Set(completedKeys || []);

  return (
    <ol className={`${compact ? "mt-3 min-h-0 flex-1 pr-1" : "mt-4 max-h-[420px] pr-1"} space-y-2 overflow-y-auto`}>
      {planItems.map((planItem, index) => {
        const key = getPlanItemKey(planItem, index);
        const itemCompleted = completedSet.has(key);
        const savedLocation = itemLocations[key] || null;
        const status = buildReaderDirectoryStatus({
          completed: itemCompleted,
          hasSavedLocation: Boolean(savedLocation?.pageNumber),
          isCurrent: index === currentIndex,
        });

        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onOpenItem(index, itemCompleted)}
              className={`w-full rounded-lg border text-left transition hover:-translate-y-0.5 ${
                compact ? "px-3 py-2 text-xs leading-5" : "px-4 py-3 text-sm leading-6"
              } ${status.cardClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 ${status.badgeClass}`}>
                      {status.label}
                    </span>
                    <span className="text-ink-soft">Day {planItem.day}</span>
                    <span className="text-ink-soft">
                      {formatPageRange(planItem.startPage, planItem.endPage, pageUnitLabel)}
                    </span>
                  </div>
                  <span className={`${compact ? "mt-1 line-clamp-2" : "mt-2"} block text-ink`}>
                    {planItem.title}
                  </span>
                  {savedLocation?.pageNumber && (
                    <span className="mt-1 block text-[11px] text-ink-soft">
                      上次看到{formatPageLabel(savedLocation.pageNumber, pageUnitLabel)}
                    </span>
                  )}
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-xs ${status.actionClass}`}>
                  {status.actionLabel}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function buildReaderDirectoryStatus({ completed, hasSavedLocation, isCurrent }) {
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

  return {
    label: "未读",
    actionLabel: "开始",
    cardClass: "border-line bg-paper-card",
    badgeClass: "bg-paper text-ink-soft",
    actionClass: "bg-paper text-ink-soft",
  };
}

function NotesPanel({
  notes,
  showTitle = true,
  pageUnitLabel = "页",
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
          正在添加笔记，编辑框已浮在阅读页上。
        </p>
      )}
      {noteSourceTarget && (
        <p className="mb-2 shrink-0 rounded-lg bg-paper-card px-3 py-2 text-xs leading-5 text-accent">
          正在重新选择「{noteSourceTarget.text || noteSourceTarget.note || "这条笔记"}」的原文。
        </p>
      )}
      {notes.length === 0 ? (
        <p className="mt-2 rounded-lg bg-paper-card px-3 py-3 text-xs leading-5 text-ink-soft">
          选中正文原文后可以添加高亮笔记；<BrandName />回答也可以一键记到这里。
        </p>
      ) : selectedNote ? (
        <NoteDetail
          note={selectedNote}
          pageUnitLabel={pageUnitLabel}
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
                <p className="line-clamp-2 text-ink">“{renderBrandNameText(note.text || "AI 读伴回答", `note-title-${note.id}`)}”</p>
                <p className="mt-1 line-clamp-3 text-ink-soft">
                  {note.note || note.assistantContent || "未填写笔记"}
                </p>
                <p className="mt-2 text-[11px] text-ink-soft">
                  {note.pageNumber ? `${formatPageLabel(note.pageNumber, pageUnitLabel)} · ` : ""}
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
  pageUnitLabel = "页",
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
                原文摘录{note.pageNumber ? ` · ${formatPageLabel(note.pageNumber, pageUnitLabel)}` : ""}
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
            <p className="text-[11px] text-ink-soft">
              AI <BrandName />回答
            </p>
            <div className="mt-2 text-sm leading-6 text-ink">
              <MarkdownText value={note.assistantContent} />
            </div>
          </section>
        )}

        <p className="px-1 text-[11px] leading-5 text-ink-soft">
          {note.pageNumber ? `${formatPageLabel(note.pageNumber, pageUnitLabel)} · ` : ""}
          创建于 {formatReadingTime(note.createdAt)}
          {note.updatedAt && note.updatedAt !== note.createdAt
            ? ` · 更新于 ${formatReadingTime(note.updatedAt)}`
            : ""}
        </p>
      </div>
    </div>
  );
}

function GuideInsightPanel({ guide, onAsk, onTakeNote, disabled, showTitle = true }) {
  const sections = GUIDE_TAB_OPTIONS.map((option) => ({
    ...option,
    items: toList(guide?.[option.key]).slice(0, 3),
  })).filter((section) => section.items.length > 0);

  return (
    <section className={showTitle ? "guide-insight-panel" : "guide-insight-panel h-full"}>
      {showTitle && <p className="text-xs font-medium text-ink-soft">阅读提示</p>}
      <div className={`space-y-3 ${showTitle ? "mt-3" : ""}`}>
        {sections.length === 0 ? (
          <p className="guide-message rounded-lg bg-paper-card px-3 py-3 text-xs leading-5 text-ink-soft">
            这一章还没有整理出提示。
          </p>
        ) : (
          sections.map((section, index) => (
            <GuideInsightSection
              key={section.key}
              section={section}
              sectionIndex={index}
              disabled={disabled}
              onAsk={onAsk}
              onTakeNote={onTakeNote}
            />
          ))
        )}
      </div>
    </section>
  );
}

function GuideInsightSection({ section, sectionIndex = 0, disabled, onAsk, onTakeNote }) {
  return (
    <section
      className="guide-insight-section rounded-xl border border-line bg-paper-card px-3 py-3 shadow-sm"
      style={{ "--guide-section-delay": `${sectionIndex * 80}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] text-ink-soft">{section.kicker}</p>
          <h4 className="mt-0.5 text-sm font-medium text-ink">{section.title}</h4>
        </div>
        <span className="shrink-0 rounded-full bg-paper px-2 py-1 text-[11px] text-ink-soft">
          {section.items.length} 条
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {section.items.map((item, index) => (
          <li
            key={`${section.key}-${index}`}
            className="guide-insight-item"
            style={{ "--guide-item-delay": `${index * 60}ms` }}
          >
            <div className="rounded-lg bg-paper px-3 py-2.5 text-xs leading-5 text-ink">
              {item}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  onTakeNote?.({
                    type: section.key,
                    label: section.label,
                    title: section.title,
                    text: item,
                  })
                }
                className="rounded-lg border border-line bg-paper px-2 py-1.5 text-[11px] text-ink-soft transition hover:border-accent hover:text-accent"
              >
                我要记笔记
              </button>
              <button
                type="button"
                onClick={() => onAsk(`${section.promptPrefix}${item}`)}
                disabled={disabled}
                className="inline-flex items-center justify-center rounded-lg bg-accent px-2 py-1.5 text-[11px] text-white transition hover:opacity-90 disabled:opacity-50"
              >
                和<BrandName className="mx-1" />聊聊
              </button>
            </div>
          </li>
        ))}
      </ul>
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

function buildPendingNoteFromSelection(selection) {
  return {
    id: `note-draft-${Date.now()}`,
    pageNumber: selection?.pageNumber || null,
    text: toText(selection?.text).trim(),
    rects: normalizeHighlightRects(selection?.rects),
  };
}

function buildPendingNoteFromGuideInsight(insight) {
  const text = toText(insight.text).trim();
  return {
    id: `note-draft-guide-${Date.now()}`,
    pageNumber: null,
    text,
    rects: [],
    title: insight.type === "questions" ? "记录这个问题" : "记录这个目标",
    placeholder: "写下你的理解、疑问，或者准备读完后回来补充。",
    source: "guide",
    insightType: insight.type || "",
    insightTitle: insight.title || "",
  };
}

function buildQuoteMeta(quote) {
  if (!quote?.text) return null;
  return {
    pageNumber: quote.pageNumber || null,
    pageUnitLabel: quote.pageUnitLabel || "页",
    text: toText(quote.text).trim(),
    rects: normalizeHighlightRects(quote.rects),
  };
}

function buildReflectionContextStats(chatMessages, notes) {
  const chatCount = (Array.isArray(chatMessages) ? chatMessages : []).filter(
    (message) => message.role === "user" && toText(message.content).trim()
  ).length;
  const noteCount = (Array.isArray(notes) ? notes : []).filter(
    (note) => toText(note.text || note.note || note.assistantContent).trim()
  ).length;

  return {
    chatCount,
    noteCount,
    total: chatCount + noteCount,
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
  const pageMatch = text.match(/(?:我在第\s*(\d+)\s*页选中|我在文本页\s*(\d+)\s*选中)/);
  const quoteMatch = text.match(/^>\s*(.+)$/m);

  return {
    pageNumber: pageMatch ? Number(pageMatch[1] || pageMatch[2]) : null,
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

function formatPageRange(startPage, endPage, pageUnitLabel = "页") {
  if (pageUnitLabel === "文本页") return `文本页 ${startPage}-${endPage}`;
  return `第 ${startPage}-${endPage} 页`;
}

function formatPageLabel(pageNumber, pageUnitLabel = "页") {
  if (pageUnitLabel === "文本页") return `文本页 ${pageNumber}`;
  return `第 ${pageNumber} 页`;
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

  const pageNumber = quote.pageNumber
    ? formatPageLabel(quote.pageNumber, quote.pageUnitLabel || "页")
    : "当前页";
  return [
    `我在${pageNumber}选中了这句/这段：`,
    `> ${toText(quote.text).trim()}`,
    "",
    text ? `我想问：${text}` : "请围绕这段话陪我读。"
  ].join("\n");
}

function GuideLoading({ startedAt, compact = false }) {
  const elapsed = useElapsedSeconds(startedAt);
  const activeStepIndex = Math.min(Math.floor(elapsed / 5), GUIDE_LOADING_STEPS.length - 1);
  const activeStep = GUIDE_LOADING_STEPS[activeStepIndex];
  const progressWidth = `${Math.min(88, 18 + activeStepIndex * 22 + (elapsed % 5) * 4)}%`;

  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="guide-loading-compact mt-5 rounded-lg border border-line bg-paper-card px-3 py-3"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-ink">正在整理提示</p>
          <p className="shrink-0 text-[11px] text-ink-soft">{elapsed} 秒</p>
        </div>
        <div className="guide-progress-track mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <span
            className="guide-progress-bar block h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: progressWidth }}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-soft">{activeStep.title}</p>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="guide-loading-card overflow-hidden rounded-xl border border-line bg-paper-card px-5 py-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-ink-soft">导读生成中</p>
          <h3 className="mt-1 font-serif text-xl text-ink">
            <BrandName />正在整理今天的阅读入口
          </h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            会先抓住整本书的位置，再整理 3 个目标和 3 个问题。长章节可能需要多想一会儿。
          </p>
        </div>
        <p className="inline-flex w-fit shrink-0 rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-soft">
          已等待 {elapsed} 秒
        </p>
      </div>
      <div className="guide-progress-track mt-5 h-1.5 overflow-hidden rounded-full bg-line">
        <span
          className="guide-progress-bar block h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: progressWidth }}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_230px]">
        <GuideLoadingPreview />
        <ol className="space-y-3 border-l border-line pl-4">
          {GUIDE_LOADING_STEPS.map((step, index) => {
            const active = index === activeStepIndex;
            const done = index < activeStepIndex;

            return (
              <li
                key={step.title}
                className="guide-loading-step relative"
                style={{ "--guide-item-delay": `${index * 70}ms` }}
              >
                <span
                  className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
                    active || done ? "bg-accent" : "bg-line"
                  }`}
                >
                  {active && <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />}
                </span>
                <p className={`text-sm font-medium ${active ? "text-ink" : "text-ink-soft"}`}>
                  {step.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-soft">{step.description}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function GuideLoadingPreview() {
  return (
    <div className="guide-loading-preview space-y-5">
      <GuideLoadingSkeletonSection headingWidth="w-28" lines={["w-full", "w-11/12", "w-4/5"]} />
      <GuideLoadingSkeletonSection headingWidth="w-36" lines={["w-10/12", "w-8/12"]} />
      <div className="space-y-3">
        <span className="guide-skeleton-bar block h-3 w-32 animate-pulse rounded-full bg-line" />
        <div className="space-y-2 pl-4">
          <span className="guide-skeleton-bar block h-2.5 w-10/12 animate-pulse rounded-full bg-line" />
          <span className="guide-skeleton-bar block h-2.5 w-9/12 animate-pulse rounded-full bg-line" />
          <span className="guide-skeleton-bar block h-2.5 w-7/12 animate-pulse rounded-full bg-line" />
        </div>
      </div>
    </div>
  );
}

function GuideLoadingSkeletonSection({ headingWidth, lines }) {
  return (
    <div className="space-y-3">
      <span className={`guide-skeleton-bar block h-3 ${headingWidth} animate-pulse rounded-full bg-accent/25`} />
      <div className="space-y-2">
        {lines.map((width, index) => (
          <span
            key={`${headingWidth}-${index}`}
            className={`guide-skeleton-bar block h-2.5 ${width} animate-pulse rounded-full bg-line`}
          />
        ))}
      </div>
    </div>
  );
}

const GUIDE_LOADING_STEPS = [
  {
    title: "读取章节上下文",
    description: "先看这一段在全书里的位置。",
  },
  {
    title: "提炼阅读入口",
    description: "把背景、作者眼光和今天的章节连起来。",
  },
  {
    title: "整理目标和问题",
    description: "准备读完后要抓住的能力与疑问。",
  },
  {
    title: "排版成导读",
    description: "把内容拆成短标题、段落和提示点。",
  },
];

function GuideUsage({ guide }) {
  const usage = guide.usage;
  const cost = guide.cost;

  if (!usage && !cost) return null;

  return (
    <div className="guide-usage-card rounded-lg border border-line bg-paper px-4 py-3">
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
    <div className={`guide-list-card ${compact ? "guide-list-card-compact" : ""}`}>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <ul className={`mt-2 ${compact ? "space-y-2" : "space-y-3"}`}>
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className={`guide-list-item rounded-lg bg-paper text-ink ${
              compact ? "px-3 py-2 text-xs leading-5" : "px-4 py-3 text-sm leading-6"
            }`}
            style={{ "--guide-item-delay": `${index * 70}ms` }}
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
      {blocks.map((block, index) => (
        <GuideMarkdownBlock
          key={`guide-md-${index}`}
          block={block}
          blockIndex={index}
          compact={compact}
        />
      ))}
    </div>
  );
}

function GuideMarkdownBlock({ block, blockIndex, compact }) {
  if (block.type === "divider") {
    return <hr className="my-3 border-line" />;
  }

  if (block.type === "heading") {
    return (
      <h3 className={compact ? "text-xs font-semibold text-ink" : "text-sm font-semibold text-ink"}>
        {renderGuideInlineMarkdown(block.text, `guide-${blockIndex}-heading`)}
      </h3>
    );
  }

  if (block.type === "quote") {
    return (
      <blockquote className="border-l-4 border-line bg-paper-card px-4 py-3 text-ink-soft">
        {block.lines.map((line, lineIndex) => (
          <p key={`guide-md-${blockIndex}-${lineIndex}`}>
            {renderGuideInlineMarkdown(line, `guide-${blockIndex}-${lineIndex}`)}
          </p>
        ))}
      </blockquote>
    );
  }

  if (block.type === "ul" || block.type === "ol") {
    const ListTag = block.type === "ul" ? "ul" : "ol";
    const markerClass = block.type === "ul" ? "list-disc" : "list-decimal";

    return (
      <ListTag className={`${markerClass} ${compact ? "space-y-1 pl-4" : "space-y-1.5 pl-5"}`}>
        {block.lines.map((line, lineIndex) => (
          <li key={`guide-md-${blockIndex}-${lineIndex}`}>
            {renderGuideInlineMarkdown(line, `guide-${blockIndex}-${lineIndex}`)}
          </li>
        ))}
      </ListTag>
    );
  }

  return <p>{renderGuideInlineMarkdown(block.text, `guide-${blockIndex}`)}</p>;
}

function splitGuideMarkdownBlocks(value) {
  const lines = toText(value)
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(cleanGuideMarkdownLine);

  const blocks = [];
  let paragraph = [];
  let quote = [];
  let listType = null;
  let list = [];

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

  function flushList() {
    if (list.length === 0) return;
    blocks.push({ type: listType, lines: list });
    listType = null;
    list = [];
  }

  function flushTextBlocks() {
    flushQuote();
    flushList();
    flushParagraph();
  }

  for (const line of lines) {
    if (!line) {
      flushTextBlocks();
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      flushTextBlocks();
      blocks.push({ type: "divider" });
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flushTextBlocks();
      blocks.push({ type: "heading", text: heading[1].trim() });
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      quote.push(line.replace(/^>\s?/, "").trim());
      continue;
    }

    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    if (unorderedItem) {
      flushQuote();
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      list.push(unorderedItem[1].trim());
      continue;
    }

    const orderedItem = line.match(/^\d+\.\s+(.+)$/);
    if (orderedItem) {
      flushQuote();
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      list.push(orderedItem[1].trim());
      continue;
    }

    if (quote.length > 0 || list.length > 0) {
      flushQuote();
      flushList();
    }

    paragraph.push(line);
  }

  flushTextBlocks();
  return blocks;
}

function cleanGuideMarkdownLine(line) {
  const text = line.trim();
  if (!text || /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(text)) return "";

  return text
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
      appendBrandText(parts, text.slice(lastIndex, match.index), `${keyPrefix}-text-${lastIndex}`);
    }

    parts.push(
      <strong key={`${keyPrefix}-strong-${match.index}`} className="font-semibold">
        {renderBrandNameText(match[2] || match[3], `${keyPrefix}-strong-brand-${match.index}`)}
      </strong>
    );

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    appendBrandText(parts, text.slice(lastIndex), `${keyPrefix}-text-${lastIndex}`);
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
