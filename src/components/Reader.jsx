import { useEffect, useMemo, useRef, useState } from "react";
import { BrandName, renderBrandNameText } from "./BrandLogo.jsx";
import ChineseIcon from "./ChineseIcon.jsx";
import CompanionShell, {
  CompanionComposer,
  CompanionContext,
  CompanionPresence,
  CompanionTimeline,
  useCompanionShell,
  useCompanionTimelineScroll,
} from "./CompanionShell.jsx";
import CompanionJourneyTimeline from "./CompanionJourneyTimeline.jsx";
import CompanionSectionRecordEditor from "./CompanionSectionRecordEditor.jsx";
import PdfReader from "./PdfReader.jsx";
import ReadingCompanionAvatar from "./ReadingCompanionAvatar.jsx";
import TextBookReader from "./TextBookReader.jsx";
import { getBookPageUnitLabel, isPdfBook } from "../lib/bookFormats.js";
import {
  getBook,
  getBookPages,
  getReadingProgress,
  saveReadingProgress,
  updateBook,
  updateBookCompanionSettings,
} from "../lib/books.js";
import {
  COMPANION_POLICY_OPTIONS,
  COMPANION_SESSION_OVERRIDE_OPTIONS,
  createCompanionMemoryItem,
  getCompanionSettings,
} from "../lib/companionPolicy.js";
import {
  generateReadingGuide,
  getPlanItemKey,
  getReadingGuide,
} from "../lib/readingGuides.js";
import { getReadingChat, sendReadingChatMessage } from "../lib/readingChat.js";
import {
  buildInitialReflectionMessage,
  generateReadingReflectionSummary,
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
import { isAiAbortError } from "../lib/aiCancellation.js";
import {
  buildCompanionJourney,
  COMPANION_JOURNEY_TYPES,
} from "../lib/companionJourney.js";
import { companionEventIdForPayloadRef } from "../lib/companionEvents.js";
import {
  buildCompanionSessionRecord,
  buildGuideClues,
} from "../lib/companionTimeline.js";
import { buildCompanionSectionRecordDraft } from "../lib/companionSectionRecord.js";
import {
  recordCompanionPolicyChange,
  recordCompanionSessionOverride,
  recordCompanionSessionRecord,
  syncCompanionJourneyEvents,
} from "../lib/companionEventStore.js";
import {
  cancelCompanionTransition,
  runCompanionTransition,
} from "../lib/companionTransition.js";
import { toText } from "../lib/text.js";
import {
  buildBookContentMap,
  buildSelectionAnchor,
  getContentBlocksForPage,
} from "../lib/contentMap.js";
import {
  buildAllowedReadingContext,
  updateProgressReadState,
} from "../lib/readingFrontier.js";
import { getReaderPageKeyDirection } from "../lib/readerKeyboard.js";
import { COMPANION_VISUAL_STATES } from "../lib/companionVisualState.js";
import { repairLegacyReadingPlan } from "../lib/readingPlanChunks.js";

const SESSION_STAGES = {
  intro: "intro",
  reading: "reading",
  reflection: "reflection",
  completed: "completed",
};

const READER_VIEW_MODES = {
  scroll: "scroll",
  page: "page",
};
const PAGE_ANIMATION_PREFERENCE_KEY = "duban:reader:page-animation";
const GUIDE_GENERATION_TIMEOUT_MS = 120_000;

const PAGE_TURN_TRANSITION_MS = 1120;
const DEFAULT_READER_COMPANION_PROFILE = {
  name: "读伴",
  color: "cinnabar",
  expression: "gentle",
};

const READER_COMPANION_COLOR_OPTIONS = [
  {
    id: "cinnabar",
    accent: "#b5372b",
    soft: "#f8efe9",
    ribbon: "#91352d",
  },
  {
    id: "sage",
    accent: "#6f8a74",
    soft: "#eff6ed",
    ribbon: "#8a765f",
  },
  {
    id: "amber",
    accent: "#a87543",
    soft: "#fbf0df",
    ribbon: "#b98654",
  },
  {
    id: "rose",
    accent: "#a46f79",
    soft: "#fbedef",
    ribbon: "#b07a84",
  },
  {
    id: "ink",
    accent: "#64788f",
    soft: "#eef3f8",
    ribbon: "#6b7f96",
  },
];

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
    readStateByItemKey: {},
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
  const [companionArrivalActive, setCompanionArrivalActive] = useState(false);
  const progressRef = useRef(progress);
  const pendingOpenModeRef = useRef("default");
  const pageTurnFinishTimeoutRef = useRef(null);
  const guideAbortRef = useRef(null);
  const chatAbortRef = useRef(null);
  const reflectionAbortRef = useRef(null);
  const readingDwellTimeoutRef = useRef(null);
  const currentPageRef = useRef(null);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(
    () => () => {
      if (pageTurnFinishTimeoutRef.current) {
        window.clearTimeout(pageTurnFinishTimeoutRef.current);
      }
      if (readingDwellTimeoutRef.current) {
        window.clearTimeout(readingDwellTimeoutRef.current);
      }
      cancelActiveAiRequests();
    },
    []
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const [storedBook, savedPages, storedProgress] = await Promise.all([
        getBook(bookId),
        getBookPages(bookId),
        getReadingProgress(bookId),
      ]);
      const repaired = repairLegacyReadingPlan(storedBook, storedProgress);
      const savedBook = repaired.book;
      const savedProgress = repaired.progress;

      if (repaired.changed && savedBook?.id) {
        await Promise.all([
          updateBook(savedBook.id, { readingPlan: savedBook.readingPlan }),
          saveReadingProgress(savedBook.id, savedProgress),
        ]);
      }

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
        readStateByItemKey: savedProgress.readStateByItemKey || {},
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
  const contentMap = useMemo(
    () => buildBookContentMap({ book, pages, planItems }),
    [book, pages, planItems]
  );
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
    const reliableBlocks = getContentBlocksForPage(contentMap, pageNumber, currentKey).filter(
      (block) => block.quality !== "unusable"
    );
    return {
      pageNumber,
      text: reliableBlocks.length > 0
        ? reliableBlocks.map((block) => block.text).join("\n\n")
        : "",
      rawTextAvailable: Boolean(toText(page?.text).trim()),
      quality: reliableBlocks.length > 0 ? "usable" : "unusable",
    };
  }, [contentMap, currentItem, currentKey, currentPage, pages]);

  const allowedReadingContext = useMemo(
    () =>
      buildAllowedReadingContext({
        contentMap,
        progress,
        itemKey: currentKey,
        currentPageNumber: currentPageContext?.pageNumber,
      }),
    [contentMap, currentKey, currentPageContext?.pageNumber, progress]
  );

  const reflectionContextStats = useMemo(
    () => buildReflectionContextStats(chatMessages, notes),
    [chatMessages, notes]
  );
  const companionJourney = useMemo(() => {
    if (!book?.id || !currentKey) return [];
    return buildCompanionJourney({
      bookId: book.id,
      planItems,
      guidesByItemKey: guide ? { [currentKey]: guide } : {},
      chatStore: { [currentKey]: chatMessages },
      reflectionStore: { [currentKey]: reflectionMessages },
      notesStore: { [currentKey]: notes },
    });
  }, [book?.id, chatMessages, currentKey, guide, notes, planItems, reflectionMessages]);

  useEffect(() => {
    if (!book?.id || guideLoading || chatLoading || reflectionLoading) return;
    syncCompanionJourneyEvents(book.id, companionJourney).catch(() => {});
  }, [book?.id, chatLoading, companionJourney, guideLoading, reflectionLoading]);

  useEffect(() => {
    if (!book?.id) return;
    const settings = getCompanionSettings(book.readingProfile);
    const timestamp = book.readingProfile?.updatedAt || book.updatedAt;
    recordCompanionPolicyChange({
      bookId: book.id,
      itemKey: null,
      policy: settings.policy,
      memory: settings.memory,
      identity: `snapshot:${timestamp || "legacy"}`,
      timestamp,
      source: "migration",
    }).catch(() => {});
  }, [book?.id, book?.readingProfile?.updatedAt, book?.updatedAt]);

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
    currentPageRef.current = savedPage;
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
          <h2 className="font-serif text-2xl text-ink">未设定读伴</h2>
          <button
            onClick={() => onPlan(book.id)}
            className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
          >
            前往设定读伴
          </button>
        </section>
      </div>
    );
  }

  async function openPlanItem(index, mode = "default") {
    cancelActiveAiRequests();
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

  function changeSessionStage(nextStage, transitionName = "reader-scene") {
    if (nextStage === sessionStage) return;
    runCompanionTransition(() => setSessionStage(nextStage), { name: transitionName });
  }

  async function jumpTo(index, mode = "default") {
    await openPlanItem(index, mode);
  }

  function enterReadingStage(options = {}) {
    cancelGuideGeneration();
    const scrollBehavior = options?.scrollBehavior || "smooth";
    const trackActivity = options?.trackActivity !== false;
    if (options?.sceneTransition === false) {
      setSessionStage(SESSION_STAGES.reading);
    } else {
      changeSessionStage(SESSION_STAGES.reading, "guide-to-reading");
    }
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
      setCompanionArrivalActive(false);
      enterReadingStage({ scrollBehavior: reducedMotion ? "auto" : "smooth" });
      return;
    }

    if (pageTurnActive) return;

    cancelCompanionTransition();
    setCompanionArrivalActive(false);
    setPageTurnActive(true);
    enterReadingStage({
      scrollBehavior: "auto",
      trackActivity: false,
      sceneTransition: false,
    });

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
      setCompanionArrivalActive(true);
    }, PAGE_TURN_TRANSITION_MS);
  }

  function openReflection() {
    cancelChatGeneration();
    const nextMessages =
      reflectionMessages.length === 0 && currentItem
        ? [buildInitialReflectionMessage({ item: currentItem, guide })]
        : null;
    runCompanionTransition(() => {
      if (nextMessages) setReflectionMessages(nextMessages);
      setSessionStage(SESSION_STAGES.reflection);
    }, { name: "reading-to-reflection" });
    if (nextMessages && book?.id && currentKey) {
      saveReadingReflection(book.id, currentKey, nextMessages);
    }
  }

  async function finishToday() {
    cancelActiveAiRequests();
    const key = getPlanItemKey(currentItem, currentIndex);
    const now = new Date().toISOString();
    const nextKeys = completedKeys.includes(key) ? completedKeys : [...completedKeys, key];
    let next = {
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
    next = updateProgressReadState(next, {
      contentMap,
      itemKey: key,
      pageNumber: currentPageRef.current,
      level: "completed",
      timestamp: now,
    });
    persistProgress(addReadingDay(next));
    changeSessionStage(SESSION_STAGES.completed, "reflection-to-record");
    await saveReadingProgress(book.id, progressRef.current);
    await syncCompanionJourneyEvents(book.id, companionJourney)
      .then(() =>
        recordCompanionSessionRecord({
          bookId: book.id,
          itemKey: currentKey,
          summary: buildCompanionSessionRecord(companionJourney, { itemKey: currentKey }),
          record: buildCompanionSectionRecordDraft(companionJourney, {
            itemKey: currentKey,
          }),
          eventIds: companionJourney.map((entry) => entry.id.replace(/^journey:/, "event:")),
        })
      )
      .catch(() => {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startNextItemEarly() {
    cancelActiveAiRequests();
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
    changeSessionStage(SESSION_STAGES.intro, "record-to-guide");
    await saveReadingProgress(book.id, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function markUnfinished() {
    const key = getPlanItemKey(currentItem, currentIndex);
    const nextCompletedAt = { ...(progress.completedAtByItemKey || {}) };
    delete nextCompletedAt[key];
    const next = updateProgressReadState({
      ...progress,
      completedItemKeys: completedKeys.filter((itemKey) => itemKey !== key),
      completedAtByItemKey: nextCompletedAt,
    }, {
      contentMap,
      itemKey: key,
      pageNumber: currentPageRef.current,
      level: "unfinished",
    });
    persistProgress(next);
    await saveReadingProgress(book.id, next);
  }

  function persistProgress(next) {
    progressRef.current = next;
    setProgress(next);
  }

  function recordReadingActivity({ pageNumber, level = "reached" } = {}) {
    if (!book?.id || !currentKey || !currentItem) return;

    const normalizedPage = normalizePageNumber(pageNumber, currentItem);
    const now = new Date().toISOString();
    const base = {
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
    };
    const next = addReadingDay(updateProgressReadState(base, {
      contentMap,
      itemKey: currentKey,
      pageNumber: normalizedPage,
      level,
      timestamp: now,
    }));

    persistProgress(next);
    saveReadingProgress(book.id, next);
  }

  function handleCurrentPageChange(pageNumber) {
    const normalizedPage = normalizePageNumber(pageNumber, currentItem);
    const pageChanged = currentPageRef.current !== normalizedPage;
    currentPageRef.current = normalizedPage;
    setCurrentPage(normalizedPage);
    recordReadingActivity({ pageNumber: normalizedPage });
    if (!pageChanged && readingDwellTimeoutRef.current) return;
    if (readingDwellTimeoutRef.current) window.clearTimeout(readingDwellTimeoutRef.current);
    readingDwellTimeoutRef.current = window.setTimeout(() => {
      readingDwellTimeoutRef.current = null;
      if (document.visibilityState !== "visible" || currentPageRef.current !== normalizedPage) return;
      recordReadingActivity({ pageNumber: normalizedPage, level: "engaged" });
    }, 1800);
  }

  async function handleGenerateGuide(force = false) {
    cancelGuideGeneration();
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, GUIDE_GENERATION_TIMEOUT_MS);
    guideAbortRef.current = controller;
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
        force: Boolean(force),
        signal: controller.signal,
      });
      setGuide(generated);
    } catch (e) {
      if (timedOut) {
        setGuideError("导读生成超过 2 分钟，已自动停止。请稍后重试。");
      } else if (!isAiAbortError(e)) {
        setGuideError(e.message || "导读生成失败，请稍后重试。");
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (guideAbortRef.current === controller) {
        guideAbortRef.current = null;
        setGuideLoading(false);
        setGuideStartedAt(null);
      }
    }
  }

  async function handleSendChat(content, options = {}) {
    const text = toText(content).trim();
    if (!text || chatLoading) return;
    const controller = new AbortController();
    chatAbortRef.current = controller;
    recordReadingActivity({
      pageNumber: options.quote?.pageNumber || currentPageRef.current,
      level: "engaged",
    });

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
        readingContext: allowedReadingContext,
        guide,
        messages: previousMessages,
        content: text,
        quote: options.quote || null,
        sessionOverride: options.sessionOverride || null,
        signal: controller.signal,
        onDelta: (delta) => {
          if (controller.signal.aborted) return;
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
      const userEventType = options.quote
        ? COMPANION_JOURNEY_TYPES.selectionQuestion
        : COMPANION_JOURNEY_TYPES.userQuestion;
      recordCompanionSessionOverride({
        bookId: book.id,
        itemKey: currentKey,
        sessionOverride: options.sessionOverride,
        relatedEventIds: [
          result.user?.id
            ? companionEventIdForPayloadRef({
                store: "bookChat",
                itemKey: currentKey,
                sourceId: result.user.id,
                type: userEventType,
              })
            : null,
          result.assistant?.id
            ? companionEventIdForPayloadRef({
                store: "bookChat",
                itemKey: currentKey,
                sourceId: result.assistant.id,
                type: COMPANION_JOURNEY_TYPES.companionAnswer,
              })
            : null,
        ].filter(Boolean),
      }).catch(() => {});
    } catch (e) {
      setChatMessages(previousMessages);
      if (!isAiAbortError(e)) {
        setChatError(e.message || "回答生成中断，请稍后重试。");
      }
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
        setChatLoading(false);
      }
    }
  }

  async function handleSaveCompanionSettings(settings) {
    const updatedBook = await updateBookCompanionSettings(book.id, settings);
    if (updatedBook) setBook(updatedBook);
    await recordCompanionPolicyChange({
      bookId: book.id,
      itemKey: null,
      policy: settings.policy,
      memory: settings.memory,
      identity: `snapshot:${updatedBook?.readingProfile?.updatedAt || updatedBook?.updatedAt}`,
      timestamp: updatedBook?.readingProfile?.updatedAt || updatedBook?.updatedAt,
    }).catch(() => {});
    return updatedBook;
  }

  async function handleSendReflection(content) {
    const text = toText(content).trim();
    if (!text || reflectionLoading) return;
    const controller = new AbortController();
    reflectionAbortRef.current = controller;

    const openingMessages = (
      reflectionMessages.length > 0
        ? reflectionMessages
        : [buildInitialReflectionMessage({ item: currentItem, guide })]
    ).filter((message) => message.kind !== "summary");
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
        itemCompleted: completed,
        messages: openingMessages,
        content: text,
        signal: controller.signal,
        onDelta: (delta) => {
          if (controller.signal.aborted) return;
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
      if (!isAiAbortError(e)) {
        setReflectionError(e.message || "追问生成中断，请稍后再试。");
      }
    } finally {
      if (reflectionAbortRef.current === controller) {
        reflectionAbortRef.current = null;
        setReflectionLoading(false);
      }
    }
  }

  async function handleGenerateReflectionSummary() {
    if (reflectionLoading) return;
    const controller = new AbortController();
    reflectionAbortRef.current = controller;
    const previousMessages = reflectionMessages;
    const baseMessages = reflectionMessages.filter((message) => message.kind !== "summary");
    const streamingMessage = {
      id: `reflection-summary-stream-${Date.now()}`,
      role: "assistant",
      kind: "summary",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };

    setReflectionError("");
    setReflectionLoading(true);
    setReflectionMessages([...baseMessages, streamingMessage]);

    try {
      const result = await generateReadingReflectionSummary({
        book,
        item: currentItem,
        itemKey: currentKey,
        chapterSections,
        guide,
        readingChatMessages: includeReflectionContext ? chatMessages : [],
        readingNotes: includeReflectionContext ? notes : [],
        messages: baseMessages,
        signal: controller.signal,
        onDelta: (delta) => {
          if (controller.signal.aborted) return;
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
      setReflectionMessages(previousMessages);
      if (!isAiAbortError(e)) {
        setReflectionError(e.message || "本节总结生成中断，请稍后重试。");
      }
    } finally {
      if (reflectionAbortRef.current === controller) {
        reflectionAbortRef.current = null;
        setReflectionLoading(false);
      }
    }
  }

  function cancelActiveAiRequests() {
    cancelGuideGeneration();
    cancelChatGeneration();
    cancelReflectionGeneration();
  }

  function cancelGuideGeneration() {
    const controller = guideAbortRef.current;
    if (!controller) return;
    guideAbortRef.current = null;
    controller.abort();
    setGuideLoading(false);
    setGuideStartedAt(null);
  }

  function cancelChatGeneration() {
    chatAbortRef.current?.abort();
  }

  function cancelReflectionGeneration() {
    reflectionAbortRef.current?.abort();
  }

  function handleAskSelection(selection) {
    const pageUnitLabel = getBookPageUnitLabel(book);
    const anchor = buildSelectionAnchor(contentMap, selection, currentKey);
    recordReadingActivity({ pageNumber: selection?.pageNumber, level: "engaged" });

    if (selection?.action === "ask") {
      setSelectedQuoteDraft({
        id: `quote-${Date.now()}`,
        pageNumber: selection.pageNumber || null,
        pageUnitLabel,
        text: toText(selection.text).trim(),
        rects: normalizeHighlightRects(selection.rects),
        ...anchor,
      });
      return;
    }

    if (selection?.action === "note") {
      if (noteSourceTarget?.id) {
        handleReplaceNoteSource(selection);
        return;
      }

      setPendingNoteDraft({
        ...buildPendingNoteFromSelection(selection, contentMap, currentKey),
        pageUnitLabel,
      });
    }
  }

  async function handleReplaceNoteSource(selection) {
    if (!book?.id || !currentKey || !noteSourceTarget?.id) return;
    const nextSource = buildPendingNoteFromSelection(selection, contentMap, currentKey);
    const saved = await updateReadingNote(book.id, currentKey, noteSourceTarget.id, {
      pageNumber: nextSource.pageNumber,
      text: nextSource.text,
      rects: nextSource.rects,
      anchorSchemaVersion: nextSource.anchorSchemaVersion,
      contentBlockId: nextSource.contentBlockId,
      blockCharRange: nextSource.blockCharRange,
      contentFingerprint: nextSource.contentFingerprint,
      anchorStatus: nextSource.anchorStatus,
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
      anchorSchemaVersion: quote.anchorSchemaVersion,
      contentBlockId: quote.contentBlockId,
      blockCharRange: quote.blockCharRange,
      contentFingerprint: quote.contentFingerprint,
      anchorStatus: quote.anchorStatus,
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

  let stageContent;

  if (sessionStage === SESSION_STAGES.reading) {
    stageContent = (
      <ReadingStage
        itemKey={currentKey}
        openingTransition={pageTurnActive}
        companionArriving={companionArrivalActive}
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
        onIntro={() => changeSessionStage(SESSION_STAGES.intro, "reading-to-guide")}
        onReflection={openReflection}
        onGenerateGuide={handleGenerateGuide}
        onCancelGuide={cancelGuideGeneration}
        onStartGuideNote={handleStartGuideNote}
        onSendChat={handleSendChat}
        onCancelChat={cancelChatGeneration}
        onAskSelection={handleAskSelection}
        onCurrentPageChange={handleCurrentPageChange}
        onJump={jumpTo}
        onMarkUnfinished={markUnfinished}
        onSaveCompanionSettings={handleSaveCompanionSettings}
      />
    );
  } else if (sessionStage === SESSION_STAGES.reflection) {
    stageContent = (
      <ReflectionStage
        itemKey={currentKey}
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
        onGenerateSummary={handleGenerateReflectionSummary}
        onCancel={cancelReflectionGeneration}
        onComplete={finishToday}
      />
    );
  } else if (sessionStage === SESSION_STAGES.completed) {
    stageContent = (
      <DailyCompleteStage
        itemKey={currentKey}
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
        onBookUpdated={setBook}
      />
    );
  } else {
    stageContent = (
      <IntroStage
        itemKey={currentKey}
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
        onCancelGuide={cancelGuideGeneration}
        onJump={jumpTo}
        onMarkUnfinished={markUnfinished}
      />
    );
  }

  return renderWithPageTurn(
    <CompanionShell
      key={`${book.id}:${currentKey}`}
      sessionKey={`${book.id}:${currentKey}`}
      scene={sessionStage}
      journey={companionJourney}
      visualState={getReaderCompanionVisualState({
        sessionStage,
        guideLoading,
        chatLoading,
        reflectionLoading,
        noteNotice,
      })}
      visualError={getReaderCompanionVisualError({
        sessionStage,
        guideError,
        chatError,
        reflectionError,
      })}
    >
      {stageContent}
    </CompanionShell>
  );
}

function IntroStage({
  itemKey,
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
  onCancelGuide,
  onJump,
  onMarkUnfinished,
}) {
  const pageUnitLabel = getBookPageUnitLabel(book);
  const companion = getReaderCompanion(book);
  const guideDisplayState = guideLoading
    ? "loading"
    : guide
      ? "ready"
      : guideError
        ? "error"
        : chapterSections.length === 0
          ? "disabled"
          : "empty";

  return (
    <div className="reader-intro-page px-6 py-8">
      {readingTransitioning && (
        <span className="sr-only" role="status" aria-live="polite">
          正在进入阅读页
        </span>
      )}
      <div className="reader-intro-topbar mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm text-ink-soft">阅读会话</p>
        <button onClick={onBack} className="text-sm text-accent underline">
          退出到书架
        </button>
      </div>

      <main className="reader-intro-main mx-auto flex max-w-4xl flex-col">
        <header className="reader-intro-heading">
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
        </header>

        <section
          className="reader-intro-card reader-companion-guide-card mt-10 rounded-xl border border-line bg-paper-card p-7 shadow-sm"
          style={companion.style}
        >
          <CompanionGuideHeader
            companion={companion}
            title="导读"
            thinking={guideLoading}
          />

          <div
            className={`reader-companion-guide-scroll is-${guideDisplayState}`}
            tabIndex={0}
            aria-label="导读内容"
          >
            <div className="reader-companion-dialogue">
              <TutorBriefing
                guide={guide}
                loading={guideLoading}
                startedAt={guideStartedAt}
                error={guideError}
                disabled={chapterSections.length === 0}
                onGenerate={onGenerateGuide}
                onCancel={onCancelGuide}
              />
            </div>
            <GuideClueStrip guide={guide} />
          </div>
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

function GuideClueStrip({ guide }) {
  const clues = buildGuideClues(guide);
  if (clues.length === 0) return null;

  return (
    <section className="companion-guide-clues" data-companion-shared="record">
      <p>带进正文的线索</p>
      <ol>
        {clues.map((clue, index) => (
          <li key={`${index}:${clue}`}>{clue}</li>
        ))}
      </ol>
    </section>
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
  itemKey,
  openingTransition,
  companionArriving,
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
  onCancelGuide,
  onStartGuideNote,
  onSendChat,
  onCancelChat,
  onAskSelection,
  onCurrentPageChange,
  onJump,
  onMarkUnfinished,
  onSaveCompanionSettings,
}) {
  const readerPaneRef = useRef(null);
  const textReaderRef = useRef(null);
  const {
    sidebarLayoutInitialized,
    sidebarOpen,
    setSidebarLayoutInitialized,
    setSidebarOpen,
  } = useCompanionShell();
  const visibleHighlights = useMemo(
    () => (pendingNoteDraft ? [pendingNoteDraft, ...notes] : notes),
    [notes, pendingNoteDraft]
  );
  const pdfBook = isPdfBook(book);
  const pageUnitLabel = getBookPageUnitLabel(book);
  const [readingMode, setReadingMode] = useState(READER_VIEW_MODES.scroll);
  const [pageAnimationEnabled, setPageAnimationEnabled] = useState(readPageAnimationPreference);
  const [pageTurnDirection, setPageTurnDirection] = useState("none");
  const [scrollAnchorPage, setScrollAnchorPage] = useState(initialPage);
  const [textScreenPagination, setTextScreenPagination] = useState(null);
  const pageMode = readingMode === READER_VIEW_MODES.page;
  const pageRange = useMemo(() => {
    const start = Number(item?.startPage) || 1;
    const end = Math.max(start, Number(item?.endPage) || start);
    return { start, end, total: end - start + 1 };
  }, [item]);
  const activeReaderPage = normalizePageNumber(currentPage || initialPage, item);
  const readerInitialPage = pageMode ? activeReaderPage : scrollAnchorPage || initialPage;
  const canGoPreviousLogicalPage = activeReaderPage > pageRange.start;
  const canGoNextLogicalPage = activeReaderPage < pageRange.end;
  const currentTextPagination =
    textScreenPagination?.pageNumber === activeReaderPage ? textScreenPagination : null;
  const canGoPreviousPage = pdfBook || !pageMode
    ? canGoPreviousLogicalPage
    : Boolean(currentTextPagination?.index > 0 || canGoPreviousLogicalPage);
  const canGoNextPage = pdfBook || !pageMode
    ? canGoNextLogicalPage
    : Boolean(
        (currentTextPagination && currentTextPagination.index < currentTextPagination.count - 1) ||
        canGoNextLogicalPage
      );

  useEffect(() => {
    setScrollAnchorPage(initialPage);
  }, [item?.id, initialPage]);

  useEffect(() => {
    const compactWindow = window.matchMedia("(min-width: 900px) and (max-width: 1180px)");
    const closeSidebarForCompactWindow = () => {
      if (compactWindow.matches) setSidebarOpen(false);
    };

    if (!sidebarLayoutInitialized) {
      closeSidebarForCompactWindow();
      setSidebarLayoutInitialized(true);
    }
    compactWindow.addEventListener("change", closeSidebarForCompactWindow);
    return () => compactWindow.removeEventListener("change", closeSidebarForCompactWindow);
  }, [setSidebarLayoutInitialized, setSidebarOpen, sidebarLayoutInitialized]);

  useEffect(() => {
    if (!selectedQuoteDraft?.text || sidebarOpen) return;
    runCompanionTransition(() => setSidebarOpen(true), {
      name: "companion-quote-wake",
    });
  }, [selectedQuoteDraft?.id, selectedQuoteDraft?.text, setSidebarOpen, sidebarOpen]);

  useEffect(() => {
    if (!pageMode) return undefined;

    function handleKeyDown(event) {
      const direction = getReaderPageKeyDirection(event, { pageMode });
      if (!direction) return;
      event.preventDefault();
      handleReaderPageStep(direction);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeReaderPage, pageMode, pdfBook]);

  function handleReadingModeChange(nextMode) {
    if (!Object.values(READER_VIEW_MODES).includes(nextMode) || nextMode === readingMode) return;
    if (nextMode === READER_VIEW_MODES.scroll) {
      setScrollAnchorPage(activeReaderPage);
    } else {
      resetReaderPaneScroll(readerPaneRef.current);
    }
    setPageTurnDirection("none");
    setTextScreenPagination(null);
    setReadingMode(nextMode);
  }

  function handleReaderPageStep(direction) {
    const normalizedDirection = direction < 0 ? -1 : 1;
    if (!pdfBook && pageMode) {
      const handled = normalizedDirection < 0
        ? textReaderRef.current?.goPrevious?.()
        : textReaderRef.current?.goNext?.();
      if (handled) {
        setPageTurnDirection(normalizedDirection > 0 ? "next" : "previous");
        return;
      }
    }
    handleReaderPageJump(activeReaderPage + normalizedDirection);
  }

  function handleReaderPageJump(pageNumber) {
    const nextPage = normalizePageNumber(pageNumber, item);
    if (nextPage === activeReaderPage) return;
    setPageTurnDirection(nextPage > activeReaderPage ? "next" : "previous");
    setScrollAnchorPage(nextPage);
    onCurrentPageChange(nextPage);
    resetReaderPaneScroll(readerPaneRef.current);
  }

  function handleSidebarVisibility(nextOpen) {
    const normalizedNextOpen = Boolean(nextOpen);
    if (normalizedNextOpen === sidebarOpen) return;
    runCompanionTransition(() => setSidebarOpen(normalizedNextOpen), {
      name: normalizedNextOpen ? "companion-wake" : "companion-rest",
    });
  }

  return (
    <div
      className={`reader-reading-page ${openingTransition ? "is-opening-transition" : ""} ${
        companionArriving ? "is-companion-arriving" : ""
      }`}
    >
      <header className="reader-reading-header">
        <div className="reader-reading-header-inner">
          <div className="reader-reading-title-block">
            <p className="reader-reading-kicker">
              <ChineseIcon name="bookmark" className="h-4 w-4" decorative />
              <span>{toText(book.title)} · Day {item.day}</span>
            </p>
            <h1 className="reader-reading-title">{item.title}</h1>
            {continuing && savedLocation?.pageNumber && (
              <p className="reader-reading-resume">
                继续上次：本节第 {getReadingPagePosition(
                  savedLocation.pageNumber,
                  pageRange.start
                )} 页
                {savedLocation.updatedAt ? ` · ${formatReadingTime(savedLocation.updatedAt)}` : ""}
              </p>
            )}
          </div>
          <div className="reader-reading-actions">
            <ReadingModeControl
              mode={readingMode}
              activePage={activeReaderPage}
              pageRange={pageRange}
              pageUnitLabel={pageUnitLabel}
              canGoPrevious={canGoPreviousPage}
              canGoNext={canGoNextPage}
              onModeChange={handleReadingModeChange}
              onPrevious={() => handleReaderPageStep(-1)}
              onNext={() => handleReaderPageStep(1)}
              screenPagination={!pdfBook ? currentTextPagination : null}
              animationEnabled={pageAnimationEnabled}
              onAnimationEnabledChange={(enabled) => {
                setPageTurnDirection("none");
                setPageAnimationEnabled(enabled);
                writePageAnimationPreference(enabled);
              }}
            />
            {sidebarOpen && (
              <button
                type="button"
                aria-controls="reader-companion-sidebar"
                aria-expanded="true"
                onClick={() => handleSidebarVisibility(false)}
                className="reader-reading-action-button"
              >
                <ChineseIcon name="focus" className="h-4 w-4" decorative />
                <span>专注阅读</span>
              </button>
            )}
            <button
              type="button"
              onClick={onIntro}
              className="reader-reading-action-button"
            >
              <ChineseIcon name="guide" className="h-4 w-4" decorative />
              <span>回到导读</span>
            </button>
            <button
              type="button"
              onClick={onBack}
              className="reader-reading-action-button"
            >
              <ChineseIcon
                name={completed ? "books" : "tea"}
                className="h-4 w-4"
                decorative
              />
              <span>{completed ? "回到书架" : "中途离开"}</span>
            </button>
            <button
              type="button"
              onClick={onReflection}
              className="reader-reading-action-button reader-reading-action-primary"
            >
              <ChineseIcon name="complete" className="h-4 w-4" decorative />
              <span>我读完了</span>
            </button>
          </div>
        </div>
      </header>

      <main className={`reader-reading-layout ${!sidebarOpen ? "is-focus-mode" : ""}`}>
        <article
          ref={readerPaneRef}
          className={`reader-reading-pane ${
            pageMode ? "reader-reading-pane-page" : "reader-reading-pane-scroll"
          }`}
        >
          {pdfBook ? (
            <PdfReader
              bookId={book.id}
              startPage={item.startPage}
              endPage={item.endPage}
              initialPage={readerInitialPage}
              readingMode={readingMode}
              activePage={activeReaderPage}
              canGoPrevious={canGoPreviousPage}
              canGoNext={canGoNextPage}
              onPreviousPage={() => handleReaderPageJump(activeReaderPage - 1)}
              onNextPage={() => handleReaderPageJump(activeReaderPage + 1)}
              pageTurnDirection={pageTurnDirection}
              pageAnimationEnabled={pageAnimationEnabled}
              highlights={visibleHighlights}
              onCurrentPageChange={onCurrentPageChange}
              onAskSelection={onAskSelection}
            />
          ) : (
            <TextBookReader
              ref={textReaderRef}
              pages={pages}
              highlights={visibleHighlights}
              startPage={item.startPage}
              endPage={item.endPage}
              initialPage={readerInitialPage}
              readingMode={readingMode}
              activePage={activeReaderPage}
              canGoPrevious={canGoPreviousLogicalPage}
              canGoNext={canGoNextLogicalPage}
              onRequestPageStep={handleReaderPageStep}
              pageTurnDirection={pageTurnDirection}
              pageAnimationEnabled={pageAnimationEnabled}
              onPaginationChange={setTextScreenPagination}
              onCurrentPageChange={onCurrentPageChange}
              onAskSelection={onAskSelection}
            />
          )}
        </article>

        {sidebarOpen ? (
          <TutorSidebar
            itemKey={itemKey}
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
            onCancelGuide={onCancelGuide}
            onStartGuideNote={onStartGuideNote}
            onSendChat={onSendChat}
            onCancelChat={onCancelChat}
            onJump={onJump}
            onMarkUnfinished={onMarkUnfinished}
            onSaveCompanionSettings={onSaveCompanionSettings}
          />
        ) : (
          <CompanionWakeButton
            companion={getReaderCompanion(book)}
            onWake={() => handleSidebarVisibility(true)}
          />
        )}
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

function readPageAnimationPreference() {
  try {
    return globalThis.localStorage?.getItem(PAGE_ANIMATION_PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

function writePageAnimationPreference(enabled) {
  try {
    globalThis.localStorage?.setItem(PAGE_ANIMATION_PREFERENCE_KEY, enabled ? "on" : "off");
  } catch {
    // Reading remains usable when storage is unavailable.
  }
}

function ReadingModeControl({
  mode,
  activePage,
  pageRange,
  pageUnitLabel,
  canGoPrevious,
  canGoNext,
  onModeChange,
  onPrevious,
  onNext,
  screenPagination,
  animationEnabled,
  onAnimationEnabledChange,
}) {
  const pagePosition = Math.max(1, activePage - pageRange.start + 1);

  return (
    <div className="reader-mode-control">
      <div className="reader-mode-tabs" aria-label="阅读方式">
        <button
          type="button"
          aria-pressed={mode === READER_VIEW_MODES.scroll}
          onClick={() => onModeChange(READER_VIEW_MODES.scroll)}
          className={`reader-mode-button ${
            mode === READER_VIEW_MODES.scroll ? "is-active" : ""
          }`}
        >
          <ChineseIcon name="scroll" className="h-3.5 w-3.5" decorative />
          <span>滚动</span>
        </button>
        <button
          type="button"
          aria-pressed={mode === READER_VIEW_MODES.page}
          onClick={() => onModeChange(READER_VIEW_MODES.page)}
          className={`reader-mode-button ${
            mode === READER_VIEW_MODES.page ? "is-active" : ""
          }`}
        >
          <ChineseIcon name="page" className="h-3.5 w-3.5" decorative />
          <span>翻页</span>
        </button>
      </div>

      {mode === READER_VIEW_MODES.page && (
        <>
          <div className="reader-page-stepper">
            <button
              type="button"
              aria-label="上一页"
              disabled={!canGoPrevious}
              onClick={onPrevious}
              className="reader-page-stepper-button"
            >
              ←
            </button>
            <span className="reader-page-stepper-label">
              {screenPagination?.count > 1
                ? `本页 ${screenPagination.index + 1}/${screenPagination.count} · 本节 ${pagePosition}/${pageRange.total}`
                : `本节 ${pagePosition}/${pageRange.total}`}
            </span>
            <button
              type="button"
              aria-label="下一页"
              disabled={!canGoNext}
              onClick={onNext}
              className="reader-page-stepper-button"
            >
              →
            </button>
          </div>
          <label className="reader-page-animation-toggle">
            <input
              type="checkbox"
              checked={animationEnabled}
              onChange={(event) => onAnimationEnabledChange(event.target.checked)}
            />
            <span className="reader-page-animation-switch" aria-hidden="true" />
            <span>翻页动画</span>
          </label>
        </>
      )}
    </div>
  );
}

function resetReaderPaneScroll(node) {
  if (!node) return;
  window.requestAnimationFrame(() => {
    node.scrollTop = 0;
  });
}

function ReflectionStage({
  itemKey,
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
  onGenerateSummary,
  onCancel,
  onComplete,
}) {
  const {
    journey,
    reflectionDraft: draft,
    scene,
    setReflectionDraft: setDraft,
  } = useCompanionShell();
  const messagesRef = useRef(null);
  const latestMessage = messages[messages.length - 1];
  const timelineRevision = `${messages.length}:${latestMessage?.id || ""}:${
    toText(latestMessage?.content).length
  }:${loading ? "loading" : "idle"}`;
  useCompanionTimelineScroll("reflection", messagesRef, timelineRevision, {
    initialPosition: "bottom",
  });
  const lastItem = currentIndex >= planItems.length - 1;
  const completeLabel = lastItem
    ? completed
      ? "已经完成这本书"
      : "完成这本书"
    : completed
    ? "今天已完成"
    : "完成今天的阅读";
  const answered = messages.some((message) => message.role === "user");
  const summary = messages.find((message) => message.kind === "summary");
  const summarizing = messages.some(
    (message) => message.kind === "summary" && message.streaming
  );
  const hasReadingContext = readingContextStats.total > 0;
  const companion = getReaderCompanion(book);

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
    <div className="reader-reflection-page">
      <header className="reader-reflection-topbar">
        <p>{toText(book.title)} · Day {item.day}</p>
        <button type="button" onClick={onBack}>
          退出到书架
        </button>
      </header>

      <main className="reader-reflection-main">
        <section
          className="reader-reflection-surface"
          style={companion.style}
        >
          <div className="reader-reflection-heading">
            <CompanionPresence className="reader-chat-heading">
              <CompanionAvatarBadge companion={companion} size="tiny" thinking={loading} />
              <CompanionContext>
                <h2>读后记录</h2>
                <p>{answered ? "沿着刚才的记录继续聊。" : "从刚才读到的内容接着聊。"}</p>
              </CompanionContext>
            </CompanionPresence>
            <div className="reader-reflection-heading-actions">
              {loading && (
                <div className="reader-reflection-loading">
                  <span>{summarizing ? "正在整理总结" : "读伴正在回应"}</span>
                  <button
                    type="button"
                    onClick={onCancel}
                  >
                    停止
                  </button>
                </div>
              )}
              <label
                className={`reader-reflection-context-toggle ${
                  hasReadingContext
                    ? ""
                    : "is-disabled"
                }`}
              >
                <input
                  type="checkbox"
                  checked={hasReadingContext && includeReadingContext}
                  disabled={!hasReadingContext || loading}
                  onChange={(event) => onIncludeReadingContextChange(event.target.checked)}
                  className="sr-only"
                />
                <span className="reader-reflection-context-switch" aria-hidden="true" />
                <span>带入阅读记录</span>
                <small>
                  {hasReadingContext
                    ? `${readingContextStats.chatCount} 提问 · ${readingContextStats.noteCount} 笔记`
                    : "暂无"}
                </small>
              </label>
            </div>
          </div>

          <CompanionTimeline
            ref={messagesRef}
            className="reader-reflection-timeline"
            data-companion-shared="timeline"
          >
            <CompanionJourneyTimeline
              entries={journey}
              itemKey={itemKey}
              activeScene={scene}
              emptyMessage="读中留下的线索、问题和笔记会在这里接到本节回想。"
              className="reader-reflection-journey"
            />
            {loading && <ThinkingStatus companion={companion} />}
          </CompanionTimeline>

          {error && <p className="reader-reflection-error">{error}</p>}

          <div className="reader-reflection-bottom">
            <CompanionComposer onSubmit={submitAnswer} className="reader-reflection-composer">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                rows={2}
                disabled={loading}
                placeholder="还有什么想聊的，可以接着聊。"
              />
              <button type="submit" disabled={!draft.trim() || loading}>
                {loading && !summarizing ? "等待回应" : "发送"}
              </button>
            </CompanionComposer>

            <div className="reader-reflection-footer-actions">
              <button type="button" onClick={onReading} className="is-quiet">
                回到正文
              </button>
              <button
                type="button"
                onClick={onGenerateSummary}
                disabled={!answered || loading}
                className="is-summary"
              >
                <ChineseIcon name="ink" className="h-4 w-4" decorative />
                {summary ? "重新整理总结" : "整理本节总结"}
              </button>
              <button
                type="button"
                onClick={onComplete}
                disabled={loading || (completed && lastItem)}
                className="is-primary"
              >
                {completeLabel}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ReflectionMessage({ message, companion }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <CompanionAvatarBadge companion={companion} size="mini" thinking={message.streaming} />
      )}
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
  itemKey,
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
  onBookUpdated,
}) {
  const nextItem = planItems[currentIndex + 1];
  const hasNext = Boolean(nextItem);
  const nextDue = hasNext && isPlanItemDue(nextItem);
  const pageUnitLabel = getBookPageUnitLabel(book);
  const { journey } = useCompanionShell();
  const companion = getReaderCompanion(book);

  return (
    <div className="reader-complete-page">
      <header className="reader-complete-topbar">
        <p>今日阅读完成</p>
        <button onClick={onBack}>
          退回书架
        </button>
      </header>

      <main className="reader-complete-main">
        <section className="reader-complete-primary">
          <div className="reader-complete-intro">
            <p>{toText(book.title)} · Day {item.day}</p>
            <h1>今天这段读完了</h1>
          </div>

          <section className="reader-complete-summary" aria-label="今日阅读概览">
            <div className="reader-complete-stats">
            <Stat label="今日完成" value={`Day ${item.day}`} />
            <Stat label="累计进度" value={`${completedCount} / ${planItems.length} 项`} />
            <Stat label="下一阅读项" value={hasNext ? nextItem.title : "已经没有下一项"} />
            </div>
          </section>

          <CompanionPresence className="companion-complete-presence" style={companion.style}>
            <CompanionAvatarBadge companion={companion} size="tiny" />
            <CompanionContext>
              <CompanionSectionRecordEditor
                book={book}
                itemKey={itemKey}
                journey={journey}
                onBookUpdated={onBookUpdated}
              />
            </CompanionContext>
          </CompanionPresence>

          <div className="reader-complete-actions">
            <button onClick={onBack} className="is-quiet">
              退回书架
            </button>
            <button onClick={onStartNext} disabled={!hasNext} className="is-primary">
              {hasNext
                ? nextDue
                  ? "开始下一项阅读"
                  : "提前开始下一章阅读"
                : "已经完成全部阅读"}
            </button>
          </div>
        </section>

        <section className="reader-complete-directory">
          <div className="reader-complete-directory-heading">
            <p>阅读目录</p>
            <h2>接下来</h2>
          </div>
          <ReadingDirectoryList
            compact
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

function getReaderCompanion(book) {
  const { name, color, expression } = DEFAULT_READER_COMPANION_PROFILE;
  const colorOption =
    READER_COMPANION_COLOR_OPTIONS.find((option) => option.id === color) ||
    READER_COMPANION_COLOR_OPTIONS[0];

  return {
    name,
    color,
    expression,
    style: {
      "--companion-accent": colorOption.accent,
      "--companion-soft": colorOption.soft,
      "--companion-ribbon": colorOption.ribbon,
    },
  };
}

function getReaderCompanionVisualState({
  sessionStage,
  guideLoading,
  chatLoading,
  reflectionLoading,
  noteNotice,
}) {
  if (/^(已添加|已把|笔记已更新|已重新绑定)/.test(toText(noteNotice))) {
    return COMPANION_VISUAL_STATES.recording;
  }
  if (sessionStage === SESSION_STAGES.completed) {
    return COMPANION_VISUAL_STATES.complete;
  }
  if (guideLoading) return COMPANION_VISUAL_STATES.preparing;
  if (chatLoading || reflectionLoading) return COMPANION_VISUAL_STATES.answering;
  if (sessionStage === SESSION_STAGES.reading) return COMPANION_VISUAL_STATES.quiet;
  return COMPANION_VISUAL_STATES.waiting;
}

function getReaderCompanionVisualError({
  sessionStage,
  guideError,
  chatError,
  reflectionError,
}) {
  if (sessionStage === SESSION_STAGES.intro) return Boolean(guideError);
  if (sessionStage === SESSION_STAGES.reading) return Boolean(chatError || guideError);
  if (sessionStage === SESSION_STAGES.reflection) return Boolean(reflectionError);
  return false;
}

function CompanionAvatarBadge({ companion, size = "normal", thinking = false, state }) {
  const shell = useCompanionShell();
  const displayCompanion = companion || DEFAULT_READER_COMPANION_PROFILE;
  const expression = thinking ? "thinking" : displayCompanion.expression;
  const variant = size === "normal" ? "full" : size === "mini" ? "mark" : "standard";
  const visualState = state || shell.visualState || COMPANION_VISUAL_STATES.quiet;

  return (
    <div
      className={`reader-companion-avatar-badge reader-companion-avatar-${size}`}
      style={displayCompanion.style}
      data-companion-shared="presence"
      data-companion-avatar="true"
      aria-hidden="true"
    >
      <ReadingCompanionAvatar
        stage={4}
        expression={expression}
        variant={variant}
        state={visualState}
      />
    </div>
  );
}

function CompanionWakeButton({ companion, onWake }) {
  const { visualState } = useCompanionShell();
  const displayCompanion = companion || getReaderCompanion(null);
  return (
    <button
      type="button"
      className="reader-companion-wake-button"
      style={displayCompanion.style}
      aria-label="打开读伴"
      aria-controls="reader-companion-sidebar"
      aria-expanded="false"
      title="打开读伴"
      data-companion-shared="presence"
      data-companion-flight-target="toolbar"
      onClick={onWake}
    >
      <ReadingCompanionAvatar
        stage={4}
        expression={displayCompanion.expression}
        variant="mark"
        state={visualState}
      />
    </button>
  );
}

function CompanionGuideHeader({ companion, title, subtitle, thinking = false }) {
  return (
    <CompanionPresence className="reader-companion-guide-header">
      <CompanionAvatarBadge companion={companion} thinking={thinking} />
      <CompanionContext className="reader-companion-guide-copy">
        {subtitle && <p>{subtitle}</p>}
        <h2>{title}</h2>
      </CompanionContext>
    </CompanionPresence>
  );
}

function GuideSpeechBubble({ label, tone = "default", className = "", children }) {
  return (
    <div className={`guide-speech-bubble guide-speech-bubble-${tone} ${className}`.trim()}>
      {label && (
        <p className="guide-speech-label">
          {renderBrandNameText(label, `guide-speech-label-${label}`)}
        </p>
      )}
      <div className="guide-speech-body">{children}</div>
    </div>
  );
}

function GuideOverviewBubbles({ overview }) {
  const chunks = splitGuideDialogueChunks(overview);
  if (chunks.length === 0) return null;

  return chunks.map((chunk, index) => (
    <GuideSpeechBubble
      key={`guide-overview-bubble-${index}`}
      label=""
      tone={index === 0 ? "primary" : "default"}
    >
      <GuideMarkdownText value={chunk} />
    </GuideSpeechBubble>
  ));
}

function splitGuideDialogueChunks(value) {
  const text = toText(value).trim();
  if (!text) return [];
  return text
    .split(/\n\s*---\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function TutorBriefing({
  companion,
  guide,
  loading,
  startedAt,
  error,
  disabled,
  onGenerate,
  onCancel,
}) {
  return (
    <div className="guide-briefing">
      {disabled && (
        <GuideSpeechBubble label="缺少章节文本" tone="muted">
          <p>无法生成导读。</p>
        </GuideSpeechBubble>
      )}

      {error && (
        <GuideSpeechBubble label="生成失败" tone="error">
          <p>{error}</p>
        </GuideSpeechBubble>
      )}

      {loading && (
        <GuideSpeechBubble label="生成中" tone="soft">
          <GuideLoading startedAt={startedAt} compact />
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
          >
            停止生成
          </button>
        </GuideSpeechBubble>
      )}

      {!guide && !disabled && !error && !loading && (
        <GuideSpeechBubble tone="soft" className="guide-speech-bubble-action">
          <button
            onClick={() => onGenerate(false)}
            className="guide-primary-button rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
          >
            生成导读
          </button>
        </GuideSpeechBubble>
      )}

      {guide && !loading && (
        <div className="guide-ready guide-dialogue-stack">
          <GuideOverviewBubbles overview={guide.overview} />
          <div className="guide-dialogue-actions">
            <button
              onClick={() => onGenerate(true)}
              disabled={loading || disabled}
              className="guide-secondary-button rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper disabled:opacity-50"
            >
              重新生成导读
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TutorSidebar({
  itemKey,
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
  onCancelGuide,
  onStartGuideNote,
  onSendChat,
  onCancelChat,
  onJump,
  onMarkUnfinished,
  onSaveCompanionSettings,
}) {
  const { activePanel, setActivePanel } = useCompanionShell();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const companion = getReaderCompanion(book);
  const companionThinking = chatLoading || loading;
  const companionStatus = currentPage
    ? `本节第 ${getReadingPagePosition(currentPage, item?.startPage)} 页`
    : "读伴";

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
    <aside id="reader-companion-sidebar" className="reader-sidebar-shell">
      <section
        className="reader-sidebar-panel"
        style={companion.style}
      >
        <CompanionPresence className="reader-companion-sidebar-card">
          <CompanionAvatarBadge companion={companion} size="tiny" thinking={companionThinking} />
          <CompanionContext className="min-w-0">
            <p>页边伴读</p>
            <h2>{companionStatus}</h2>
            {currentPage && (
              <span className="reader-companion-context-status">
                {currentPageHasText ? "参考本页内容与阅读进度中" : "参考阅读进度中"}
              </span>
            )}
          </CompanionContext>
          <button
            type="button"
            className="reader-companion-settings-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="本书读伴设置"
            title="本书读伴设置"
          >
            <ChineseIcon name="settings" className="h-4 w-4" decorative />
          </button>
        </CompanionPresence>

        <SidebarPanelTabs activePanel={activePanel} onChange={setActivePanel} />

        {activePanel === "chat" ? (
          <ChatPanel
            bookId={book.id}
            itemKey={itemKey}
            companion={companion}
            guide={guide}
            messages={chatMessages}
            notes={notes}
            loading={chatLoading}
            error={chatError}
            noteNotice={noteNotice}
            selectedQuoteDraft={selectedQuoteDraft}
            onQuoteDraftUsed={onQuoteDraftUsed}
            onAddMessageToNote={onAddChatMessageToNote}
            disabled={disabled}
            onSend={onSendChat}
            onCancel={onCancelChat}
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
            onCancelGuide={onCancelGuide}
            onJump={onJump}
            onMarkUnfinished={onMarkUnfinished}
          />
        )}
      </section>
      {settingsOpen && (
        <CompanionSettingsDialog
          book={book}
          onClose={() => setSettingsOpen(false)}
          onSave={async (settings) => {
            await onSaveCompanionSettings?.(settings);
            setSettingsOpen(false);
          }}
        />
      )}
    </aside>
  );
}

function CompanionSettingsDialog({ book, onClose, onSave }) {
  const initialSettings = useMemo(
    () => getCompanionSettings(book?.readingProfile),
    [book?.readingProfile]
  );
  const [policy, setPolicy] = useState(initialSettings.policy);
  const [memoryItems, setMemoryItems] = useState(initialSettings.memory.items);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function addMemory() {
    const item = createCompanionMemoryItem(memoryDraft);
    if (!item) return;
    setMemoryItems((current) => [...current, item]);
    setMemoryDraft("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave?.({
        policy,
        memory: {
          schemaVersion: 1,
          initialized: true,
          items: memoryItems,
        },
      });
    } catch (saveError) {
      setError(saveError?.message || "保存失败，请稍后再试。");
      setSaving(false);
    }
  }

  return (
    <div
      className="companion-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <form
        className="companion-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="companion-settings-title"
        onSubmit={handleSubmit}
      >
        <header className="companion-settings-header">
          <div>
            <p>本书设置</p>
            <h2 id="companion-settings-title">本书读伴设置</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭本书读伴设置">
            ×
          </button>
        </header>
        <p className="companion-settings-intro">
          以下设置仅对本书生效，可随时修改。
        </p>

        <div className="companion-settings-policy-grid">
          <CompanionPolicySelect
            label="未读内容处理"
            value={policy.spoiler}
            options={COMPANION_POLICY_OPTIONS.spoiler}
            onChange={(value) => setPolicy((current) => ({ ...current, spoiler: value }))}
          />
          <CompanionPolicySelect
            label="回答详细程度"
            value={policy.answerDepth}
            options={COMPANION_POLICY_OPTIONS.answerDepth}
            onChange={(value) => setPolicy((current) => ({ ...current, answerDepth: value }))}
          />
          <CompanionPolicySelect
            label="回答后是否需要追问"
            value={policy.followUp}
            options={COMPANION_POLICY_OPTIONS.followUp}
            onChange={(value) => setPolicy((current) => ({ ...current, followUp: value }))}
          />
          <CompanionPolicySelect
            label="回答参考范围"
            value={policy.knowledgeBoundary}
            options={COMPANION_POLICY_OPTIONS.knowledgeBoundary}
            onChange={(value) =>
              setPolicy((current) => ({ ...current, knowledgeBoundary: value }))
            }
          />
        </div>

        <section className="companion-memory-editor">
          <div className="companion-memory-heading">
            <div>
              <h3>本书专属偏好</h3>
              <p>可填写表达偏好、阅读目的或需要持续关注的内容。</p>
            </div>
            <span>{memoryItems.length}/20</span>
          </div>
          {memoryItems.length > 0 && (
            <div className="companion-memory-list">
              {memoryItems.map((item) => (
                <div key={item.id} className="companion-memory-row">
                  <input
                    value={item.text}
                    aria-label="编辑本书记忆"
                    onChange={(event) =>
                      setMemoryItems((current) =>
                        current.map((memory) =>
                          memory.id === item.id
                            ? { ...memory, text: event.target.value.slice(0, 240) }
                            : memory
                        )
                      )
                    }
                  />
                  {item.source === "legacy" && <small>旧设置</small>}
                  <button
                    type="button"
                    onClick={() =>
                      setMemoryItems((current) =>
                        current.filter((memory) => memory.id !== item.id)
                      )
                    }
                    aria-label="删除这条本书记忆"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {memoryItems.length < 20 && (
            <div className="companion-memory-add">
              <input
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value.slice(0, 240))}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent?.isComposing) return;
                  event.preventDefault();
                  addMemory();
                }}
                placeholder="例如：遇到生词时先用通俗语言解释"
                aria-label="新增本书记忆"
              />
              <button type="button" onClick={addMemory} disabled={!memoryDraft.trim()}>
                添加
              </button>
            </div>
          )}
        </section>

        {error && <p className="companion-settings-error">{error}</p>}
        <footer className="companion-settings-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" disabled={saving} className="is-primary">
            {saving ? "保存中…" : "保存"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function CompanionPolicySelect({ label, value, options, onChange }) {
  const selectedOption = options.find((option) => option.value === value) || options[0];
  return (
    <label className="companion-policy-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <small>{selectedOption?.description}</small>
    </label>
  );
}

const SIDEBAR_PANEL_OPTIONS = [
  { key: "chat", label: "问读伴" },
  { key: "notes", label: "笔记" },
];

function SidebarPanelTabs({ activePanel, onChange }) {
  return (
    <div className="reader-sidebar-tabs">
      {SIDEBAR_PANEL_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`reader-sidebar-tab ${activePanel === option.key ? "is-active" : ""}`}
        >
          {renderBrandNameText(option.label, `sidebar-tab-${option.key}`)}
        </button>
      ))}
    </div>
  );
}

const GUIDE_TAB_OPTIONS = [
  {
    key: "goals",
    label: "目标",
    kicker: "读完后带走",
    title: "今天要带走",
    promptPrefix: "请围绕这个阅读目标陪我读：",
  },
  {
    key: "questions",
    label: "问题",
    kicker: "读的时候留意",
    title: "问题",
    promptPrefix: "请带着这个问题陪我读：",
  },
];

const LONG_ANSWER_CHARS = 100;

function ChatPanel({
  bookId,
  itemKey,
  companion,
  guide,
  messages,
  notes,
  loading,
  error,
  noteNotice,
  selectedQuoteDraft,
  onQuoteDraftUsed,
  onAddMessageToNote,
  disabled,
  onSend,
  onCancel,
}) {
  const {
    activeQuote,
    chatDraft: draft,
    journey,
    scene,
    sessionOverride,
    setActiveQuote,
    setChatDraft: setDraft,
    setSessionOverride,
  } = useCompanionShell();
  const textareaRef = useRef(null);
  const messagesRef = useRef(null);
  const savedChatNotes = useMemo(() => buildSavedChatNoteLookup(notes), [notes]);
  const latestJourneyEntry = journey[journey.length - 1];
  const timelineRevision = `${journey.length}:${latestJourneyEntry?.id || ""}:${
    JSON.stringify(latestJourneyEntry?.payload || {}).length
  }:${loading ? "loading" : "idle"}`;
  useCompanionTimelineScroll("reading-chat", messagesRef, timelineRevision);

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

  function submitMessage(content = draft) {
    const text = toText(content).trim();
    if ((!text && !activeQuote) || loading || disabled) return;
    setDraft("");
    setActiveQuote(null);
    const quote = activeQuote ? buildQuoteMeta(activeQuote) : null;
    const oneShotOverride = sessionOverride;
    setSessionOverride("default");
    onSend(buildChatMessageWithQuote(text, activeQuote), {
      quote,
      sessionOverride: oneShotOverride,
    });
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

  function bringTimelineCardToComposer(card) {
    const sourceId = card?.sourceEntry?.payloadRef?.sourceId;
    if (card?.type === COMPANION_JOURNEY_TYPES.companionAnswer && sourceId) {
      const messageIndex = messages.findIndex((message) => message.id === sourceId);
      const message = messages[messageIndex];
      if (message && !message.streaming && !isChatMessageSavedToNote(message, savedChatNotes)) {
        onAddMessageToNote?.(message, messages[messageIndex - 1]);
      }
      return;
    }

    setActiveQuote({
      id: `journey-quote-${card.id}`,
      text: card.quoteText || card.body,
      pageNumber: card.sourceEntry?.sourceRef?.pageNumber || null,
      rects: card.sourceEntry?.sourceRef?.rects || [],
      source: "companion-journey",
    });
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function timelineActionLabel(card) {
    if (card.type !== COMPANION_JOURNEY_TYPES.companionAnswer) return "带入对话";
    const sourceId = card.sourceEntry?.payloadRef?.sourceId;
    const message = messages.find((item) => item.id === sourceId);
    if (message?.streaming) return "回答生成中";
    return message && isChatMessageSavedToNote(message, savedChatNotes)
      ? "已记到笔记"
      : "记到笔记";
  }

  function timelineActionDisabled(card) {
    if (card.type !== COMPANION_JOURNEY_TYPES.companionAnswer) return false;
    const sourceId = card.sourceEntry?.payloadRef?.sourceId;
    const message = messages.find((item) => item.id === sourceId);
    return Boolean(message?.streaming || (message && isChatMessageSavedToNote(message, savedChatNotes)));
  }

  return (
    <section
      className="reader-chat-panel"
      style={companion?.style}
    >
      {noteNotice && (
        <p className="rounded-lg bg-paper-card px-3 py-2 text-xs text-accent">
          {noteNotice}
        </p>
      )}

      {loading && (
        <div className="reader-chat-loading-strip">
          <div className="flex items-center gap-1 rounded-full bg-paper-card px-3 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-line bg-paper-card px-3 py-1 text-xs text-ink-soft hover:text-accent"
          >
            停止回答
          </button>
        </div>
      )}

      <CompanionTimeline
        ref={messagesRef}
        className="reader-chat-messages"
        data-companion-shared="timeline"
      >
        {journey.length === 0 ? (
          <AssistantWelcome companion={companion} />
        ) : (
          <CompanionJourneyTimeline
            entries={journey}
            itemKey={itemKey}
            activeScene={scene}
            onCardAction={bringTimelineCardToComposer}
            getActionLabel={timelineActionLabel}
            isActionDisabled={timelineActionDisabled}
            compact
          />
        )}
        {loading && <ThinkingStatus companion={companion} />}
      </CompanionTimeline>

      {error && <p className="mt-3 text-xs leading-5 text-red-600">{error}</p>}

      <CompanionComposer onSubmit={handleSubmit} className="mt-2 shrink-0">
        <label className="companion-session-override">
          <span>本次回答</span>
          <select
            value={sessionOverride}
            onChange={(event) => setSessionOverride(event.target.value)}
            disabled={loading || disabled}
          >
            {COMPANION_SESSION_OVERRIDE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="reader-chat-composer">
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
            placeholder={disabled ? "无可用文本" : "问读伴"}
            className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 text-ink outline-none disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={(!draft.trim() && !activeQuote) || loading || disabled}
          className="reader-chat-submit"
        >
          {loading ? "等待回答…" : "发送"}
        </button>
      </CompanionComposer>
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
        <p className="font-medium">重新划原文</p>
        <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
          「{note.text || note.note || "这条笔记"}」
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
        placeholder={draft.placeholder || "写下理解或疑问。"}
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

function AssistantWelcome({ companion }) {
  return (
    <article className="flex items-start gap-2">
      <CompanionAvatarBadge companion={companion} size="mini" />
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-paper px-4 py-3 text-sm leading-6 text-ink shadow-sm">
        可以问当前页、章节或本书脉络。选中原文后，会带上那一段作为上下文。
      </div>
    </article>
  );
}

function ThinkingStatus({ companion }) {
  return (
    <div className="reader-thinking-status">
      {companion && <CompanionAvatarBadge companion={companion} size="mini" thinking />}
      <p>
        <BrandName />正在整理回答…
      </p>
    </div>
  );
}

function ChatMessage({
  companion,
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
      {!isUser && (
        <CompanionAvatarBadge companion={companion} size="mini" thinking={message.streaming} />
      )}
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
    message.truncated ||
    (usage?.output_tokens &&
      message.maxOutputTokens &&
      usage.output_tokens >= message.maxOutputTokens * 0.98);

  if (!usage && !cost && !message.model && !message.truncated) return null;

  return (
    <p className="mt-2 border-t border-line pt-2 text-[11px] leading-4 text-ink-soft">
      {message.model ? `${message.model} · ` : ""}
      输入 {usage?.input_tokens ?? "未知"} / 输出 {usage?.output_tokens ?? "未知"}
      {cost ? ` · ${formatUsd(cost.totalCost)}` : ""}
      {hitOutputLimit ? ` · ${message.truncated ? "已到输出上限" : "可能已到输出上限"}` : ""}
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
  onCancelGuide,
  onJump,
  onMarkUnfinished,
}) {
  const companion = getReaderCompanion(book);

  if (activePanel === "guide") {
    return (
      <section
        className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded-lg bg-paper p-3 lg:h-auto lg:flex-1"
        style={companion.style}
      >
        <div className="reader-sidebar-guide-heading shrink-0">
          <CompanionAvatarBadge companion={companion} size="tiny" thinking={loading} />
          <div>
            <p className="text-xs text-ink-soft">阅读提示</p>
            <h3 className="mt-1 text-sm font-medium text-ink">导读</h3>
          </div>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {loading && <GuideLoading startedAt={startedAt} compact />}
          {loading && (
            <button
              type="button"
              onClick={onCancelGuide}
              className="mt-3 rounded-lg border border-line px-3 py-2 text-xs text-ink-soft hover:bg-paper-card"
            >
              停止生成
            </button>
          )}
          {error && <p className="text-sm leading-6 text-red-600">{error}</p>}
          {!guide && !loading && (
            <div className="guide-empty-callout rounded-xl border border-line bg-paper-card px-4 py-4 shadow-sm">
              <p className="text-sm font-medium text-ink">暂无导读</p>
              <div className="mt-4 space-y-2">
                <span className="guide-skeleton-bar block h-2.5 w-24 rounded-full bg-line" />
                <span className="guide-skeleton-bar block h-2.5 w-full rounded-full bg-paper" />
                <span className="guide-skeleton-bar block h-2.5 w-10/12 rounded-full bg-paper" />
              </div>
              <button
                onClick={() => onGenerate(false)}
                disabled={disabled}
                className="guide-primary-button mt-4 w-full rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                生成导读
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
          暂无笔记。
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
          </div>
          {editing ? (
            <form onSubmit={onSave} className="mt-2">
              <textarea
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                rows={8}
                placeholder="写下理解或疑问。"
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
            <p className="mt-2 text-sm leading-6 text-ink-soft">暂无。</p>
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
            暂无提示。
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

function buildPendingNoteFromSelection(selection, contentMap, itemKey) {
  return {
    id: `note-draft-${Date.now()}`,
    pageNumber: selection?.pageNumber || null,
    text: toText(selection?.text).trim(),
    rects: normalizeHighlightRects(selection?.rects),
    ...buildSelectionAnchor(contentMap, selection, itemKey),
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
    placeholder: "写下理解或疑问。",
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
    anchorSchemaVersion: quote.anchorSchemaVersion || null,
    contentBlockId: quote.contentBlockId || null,
    blockCharRange: quote.blockCharRange || null,
    contentFingerprint: quote.contentFingerprint || null,
    anchorStatus: quote.anchorStatus || null,
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
  return `原书第 ${pageNumber} 页`;
}

function getReadingPagePosition(pageNumber, startPage = 1) {
  return Math.max(1, Number(pageNumber) - (Number(startPage) || 1) + 1);
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
  const progressWidth = `${useGuideLoadingProgress(startedAt, elapsed)}%`;

  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="guide-loading-compact mt-5 rounded-lg border border-line bg-paper-card px-3 py-3"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-ink">导读生成中</p>
          <p className="shrink-0 text-[11px] text-ink-soft">{elapsed} 秒</p>
        </div>
        <div className="guide-progress-track mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <span
            className="guide-progress-bar block h-full rounded-full bg-accent"
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
          <h3 className="mt-1 font-serif text-xl text-ink">整理导读</h3>
        </div>
        <p className="inline-flex w-fit shrink-0 rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-soft">
          已等待 {elapsed} 秒
        </p>
      </div>
      <div className="guide-progress-track mt-5 h-1.5 overflow-hidden rounded-full bg-line">
        <span
          className="guide-progress-bar block h-full rounded-full bg-accent"
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
    description: "定位章节。",
  },
  {
    title: "梳理提示",
    description: "提取背景。",
  },
  {
    title: "整理问题",
    description: "生成目标。",
  },
  {
    title: "排版",
    description: "生成卡片。",
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

function useGuideLoadingProgress(startedAt, elapsed) {
  const progressRef = useRef(0);
  const previousStartRef = useRef(startedAt);

  if (previousStartRef.current !== startedAt) {
    previousStartRef.current = startedAt;
    progressRef.current = 0;
  }

  const activeStepIndex = Math.min(Math.floor(elapsed / 5), GUIDE_LOADING_STEPS.length - 1);
  const rawProgress = Math.min(90, 18 + activeStepIndex * 22 + (elapsed % 5) * 4);
  progressRef.current = Math.max(progressRef.current, rawProgress);

  return progressRef.current;
}
