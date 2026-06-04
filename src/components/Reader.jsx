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
  const [currentPage, setCurrentPage] = useState(null);
  const [selectedQuoteDraft, setSelectedQuoteDraft] = useState(null);
  const [loading, setLoading] = useState(true);

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
    setReflectionAnswer("");
    setCurrentPage(Number(currentItem?.startPage) || null);
    setSelectedQuoteDraft(null);
    setSessionStage(SESSION_STAGES.intro);
    if (!book?.id || !currentKey) return;

    getReadingGuide(book.id, currentKey).then((saved) => {
      if (alive) setGuide(saved);
    });
    getReadingChat(book.id, currentKey).then((saved) => {
      if (alive) setChatMessages(saved);
    });

    return () => {
      alive = false;
    };
  }, [book?.id, currentKey]);

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
    setProgress(next);
    setSessionStage(SESSION_STAGES.intro);
    await saveReadingProgress(book.id, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startReading() {
    setSessionStage(SESSION_STAGES.reading);
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
      completedItemKeys: nextKeys,
      currentItemIndex: nextIndex,
    };
    setProgress(next);
    setReflectionAnswer("");
    setSessionStage(
      currentIndex >= planItems.length - 1 ? SESSION_STAGES.reflection : SESSION_STAGES.intro
    );
    await saveReadingProgress(book.id, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function markUnfinished() {
    const key = getPlanItemKey(currentItem, currentIndex);
    const next = {
      ...progress,
      completedItemKeys: completedKeys.filter((itemKey) => itemKey !== key),
    };
    setProgress(next);
    await saveReadingProgress(book.id, next);
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

  async function handleSendChat(content) {
    const text = toText(content).trim();
    if (!text || chatLoading) return;

    const optimisticMessage = {
      id: `chat-local-${Date.now()}`,
      role: "user",
      content: text,
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
      });
      return;
    }

    handleSendChat(buildSelectedTextPrompt(selection, currentItem));
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
        currentPage={currentPageContext?.pageNumber || null}
        currentPageHasText={Boolean(currentPageContext?.text)}
        guide={guide}
        guideLoading={guideLoading}
        guideStartedAt={guideStartedAt}
        guideError={guideError}
        chatMessages={chatMessages}
        chatLoading={chatLoading}
        chatError={chatError}
        selectedQuoteDraft={selectedQuoteDraft}
        onQuoteDraftUsed={() => setSelectedQuoteDraft(null)}
        onBack={onBack}
        onIntro={() => setSessionStage(SESSION_STAGES.intro)}
        onReflection={openReflection}
        onGenerateGuide={handleGenerateGuide}
        onSendChat={handleSendChat}
        onAskSelection={handleAskSelection}
        onCurrentPageChange={setCurrentPage}
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
  guide,
  guideLoading,
  guideStartedAt,
  guideError,
  chatMessages,
  chatLoading,
  chatError,
  selectedQuoteDraft,
  currentPage,
  currentPageHasText,
  onQuoteDraftUsed,
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
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper">
      <header className="shrink-0 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs text-ink-soft">
              {toText(book.title)} · Day {item.day} · {item.date}
            </p>
            <h1 className="mt-1 font-serif text-2xl text-ink">{item.title}</h1>
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
              退出
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

      <main className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 gap-5 overflow-y-auto px-6 py-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
        <article className="min-h-[70vh] overflow-y-auto rounded-xl border border-line bg-paper-card px-6 py-7 shadow-sm sm:px-10 lg:min-h-0">
          <PdfReader
            bookId={book.id}
            startPage={item.startPage}
            endPage={item.endPage}
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
          selectedQuoteDraft={selectedQuoteDraft}
          onQuoteDraftUsed={onQuoteDraftUsed}
          currentPage={currentPage}
          currentPageHasText={currentPageHasText}
          disabled={chapterSections.length === 0 && !currentPageHasText}
          onGenerate={onGenerateGuide}
          onSendChat={onSendChat}
          onJump={onJump}
          onMarkUnfinished={onMarkUnfinished}
        />
      </main>
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
            <div className="space-y-4 rounded-lg bg-paper px-5 py-4 text-base leading-8 text-ink">
              {splitOverview(guide.overview).map((paragraph, index) => (
                <p key={`overview-${index}`}>{paragraph}</p>
              ))}
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
  selectedQuoteDraft,
  onQuoteDraftUsed,
  currentPage,
  currentPageHasText,
  disabled,
  onGenerate,
  onSendChat,
  onJump,
  onMarkUnfinished,
}) {
  const [activeGuideTab, setActiveGuideTab] = useState("goals");

  return (
    <aside className="h-full min-h-[70vh] overflow-hidden lg:min-h-0">
      <section className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-paper-card p-3 shadow-sm">
        {loading && <GuideLoading startedAt={startedAt} compact />}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {!guide && !loading && (
          <button
            onClick={onGenerate}
            disabled={disabled}
            className="mt-5 w-full rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper disabled:opacity-50"
          >
            生成阅读目标
          </button>
        )}

        <ChatPanel
          guide={guide}
          messages={chatMessages}
          loading={chatLoading}
          error={chatError}
          selectedQuoteDraft={selectedQuoteDraft}
          onQuoteDraftUsed={onQuoteDraftUsed}
          currentPage={currentPage}
          currentPageHasText={currentPageHasText}
          disabled={disabled}
          onSend={onSendChat}
        />

        <SidebarTools
          guide={guide}
          activeGuideTab={activeGuideTab}
          onTabChange={setActiveGuideTab}
          onAsk={onSendChat}
          disabled={disabled || chatLoading}
          currentIndex={currentIndex}
          planItems={planItems}
          completed={completed}
          onJump={onJump}
          onMarkUnfinished={onMarkUnfinished}
        />
      </section>
    </aside>
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
  selectedQuoteDraft,
  onQuoteDraftUsed,
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
    onSend(buildChatMessageWithQuote(text, activeQuote));
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
    <section className="flex min-h-0 flex-1 basis-0 flex-col rounded-xl border border-line bg-paper p-3">
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

      <div
        ref={messagesRef}
        className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg bg-paper-card px-3 py-3"
      >
        {messages.length === 0 ? (
          <AssistantWelcome />
        ) : (
          messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              latest={index === messages.length - 1}
            />
          ))
        )}
        {loading && (
          <ThinkingBubble />
        )}
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

function ThinkingBubble() {
  return (
    <article className="flex items-start gap-2">
      <Avatar label="导" />
      <div className="rounded-2xl rounded-tl-sm bg-paper px-4 py-3 text-xs leading-5 text-ink-soft shadow-sm">
        导师正在根据当前章节整理回答…
      </div>
    </article>
  );
}

function ChatMessage({ message, latest = false }) {
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

function SidebarTools({
  guide,
  activeGuideTab,
  onTabChange,
  onAsk,
  disabled,
  currentIndex,
  planItems,
  completed,
  onJump,
  onMarkUnfinished,
}) {
  return (
    <details className="mt-3 shrink-0 rounded-xl border border-line bg-paper">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">
        阅读提示与操作
      </summary>
      <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
        {guide && (
          <GuideInsightPanel
            guide={guide}
            activeTab={activeGuideTab}
            onTabChange={onTabChange}
            onAsk={onAsk}
            disabled={disabled}
          />
        )}

        <div>
          <p className="text-xs font-medium text-ink-soft">阅读项</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
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
          {completed && (
            <button
              onClick={onMarkUnfinished}
              className="mt-2 w-full rounded-lg border border-accent px-4 py-2 text-sm text-accent hover:bg-paper-card"
            >
              标记未完成
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

function GuideInsightPanel({ guide, activeTab, onTabChange, onAsk, disabled }) {
  const activeOption =
    GUIDE_TAB_OPTIONS.find((option) => option.key === activeTab) || GUIDE_TAB_OPTIONS[0];
  const items = toList(guide?.[activeOption.key]).slice(0, 3);

  return (
    <section>
      <p className="text-xs font-medium text-ink-soft">阅读提示</p>
      <div className="mt-2">
        <div className="flex rounded-lg bg-paper-card p-1">
          {GUIDE_TAB_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => onTabChange(option.key)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
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

function buildSelectedTextPrompt(selection, item) {
  const text = toText(selection?.text).trim();
  const pageNumber = selection?.pageNumber ? `第 ${selection.pageNumber} 页` : "当前页";
  const title = item?.title ? `「${item.title}」` : "当前章节";

  return [
    `我在${pageNumber}选中了这句/这段：`,
    `> ${text}`,
    "",
    `请用通俗的话解释它是什么意思，并说明它和${title}的关系。`,
  ].join("\n");
}

function clampIndex(index, length) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
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
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function splitOverview(value) {
  const text = toText(value).trim();
  if (!text) return [];

  const explicitParagraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (explicitParagraphs.length > 1) return explicitParagraphs;
  return splitLongChineseParagraph(text);
}

function splitLongChineseParagraph(text) {
  if (text.length < 220) return [text];

  const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [text];
  const paragraphs = [];
  let current = "";

  for (const sentence of sentences) {
    const next = `${current}${sentence}`.trim();
    if (current && next.length > 180 && paragraphs.length < 2) {
      paragraphs.push(current.trim());
      current = sentence.trim();
    } else {
      current = next;
    }
  }

  if (current) paragraphs.push(current.trim());
  return paragraphs;
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
