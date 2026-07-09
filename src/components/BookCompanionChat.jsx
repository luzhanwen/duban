import { useEffect, useMemo, useRef, useState } from "react";
import { BrandName } from "./BrandLogo.jsx";
import ChineseIcon from "./ChineseIcon.jsx";
import ReadingCompanionAvatar from "./ReadingCompanionAvatar.jsx";
import { isAiAbortError } from "../lib/aiCancellation.js";
import {
  BOOK_COMPANION_CHAT_ITEM_KEY,
  getBookCompanionChat,
  saveBookCompanionChat,
  sendBookCompanionChatMessage,
} from "../lib/bookCompanionChat.js";
import { getBookPageUnitLabel } from "../lib/bookFormats.js";
import { getBook, getReadingProgress } from "../lib/books.js";
import { addReadingNote, getAllReadingNotes } from "../lib/notes.js";
import { formatUsd } from "../lib/pricing.js";
import { getPlanItemKey } from "../lib/readingGuides.js";
import { formatLocalDate } from "../lib/readingSchedule.js";
import { toText } from "../lib/text.js";

const DEFAULT_COMPANION_PROFILE = {
  name: "读伴",
  color: "sage",
  expression: "gentle",
};

const COMPANION_COLOR_OPTIONS = [
  { id: "sage", accent: "#6f8a74", soft: "#eff6ed", ribbon: "#8a765f" },
  { id: "amber", accent: "#a87543", soft: "#fbf0df", ribbon: "#b98654" },
  { id: "rose", accent: "#a46f79", soft: "#fbedef", ribbon: "#b07a84" },
  { id: "ink", accent: "#64788f", soft: "#eef3f8", ribbon: "#6b7f96" },
];

export default function BookCompanionChat({ bookId, onBack, onReadBook, onPlanBook, onOpenSalon }) {
  const [book, setBook] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [noteNotice, setNoteNotice] = useState("");
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [savedNoteMessageIds, setSavedNoteMessageIds] = useState(() => new Set());
  const chatAbortRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const [savedBook, savedProgress, savedChat, savedNotes] = await Promise.all([
        getBook(bookId),
        getReadingProgress(bookId),
        getBookCompanionChat(bookId),
        getAllReadingNotes(bookId),
      ]);
      if (!alive) return;
      setBook(savedBook);
      setProgress(savedProgress);
      setChatMessages(savedChat);
      setSavedNoteMessageIds(buildSavedBookCompanionNoteLookup(savedNotes));
      setChatError("");
      setNoteNotice("");
      setConfirmClearChat(false);
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
      chatAbortRef.current?.abort();
    };
  }, [bookId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages, chatLoading]);

  const context = useMemo(
    () => buildBookCompanionContext(book, progress),
    [book, progress]
  );
  const companion = useMemo(() => getBookCompanion(book), [book]);
  const messages = useMemo(
    () => [
      {
        id: "welcome",
        role: "assistant",
        content: buildWelcomeMessage(book, context),
      },
      ...chatMessages,
    ],
    [book, context, chatMessages]
  );

  async function sendMessage(text) {
    const content = toText(text).trim();
    if (!content || chatLoading || !book?.id) return;

    const controller = new AbortController();
    chatAbortRef.current = controller;
    const now = Date.now();
    const optimisticMessage = {
      id: `book-chat-local-${now}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const streamingMessage = {
      id: `book-chat-stream-${now}`,
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };
    const previousMessages = chatMessages;

    setChatError("");
    setNoteNotice("");
    setConfirmClearChat(false);
    setChatLoading(true);
    setChatMessages([...previousMessages, optimisticMessage, streamingMessage]);
    setDraft("");

    try {
      const result = await sendBookCompanionChatMessage({
        book,
        progress,
        messages: previousMessages,
        content,
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
    } catch (error) {
      setChatMessages(previousMessages);
      if (!isAiAbortError(error)) {
        setChatError(error.message || "读伴这次没接上话，可以稍后再试一次。");
      }
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
        setChatLoading(false);
      }
    }
  }

  function cancelChatGeneration() {
    chatAbortRef.current?.abort();
  }

  async function handleAddMessageToNote(message, previousMessage) {
    const content = toText(message?.content).trim();
    if (!book?.id || !content || savedNoteMessageIds.has(message.id)) return;

    const noteItemKey = context.currentKey || BOOK_COMPANION_CHAT_ITEM_KEY;
    await addReadingNote(book.id, noteItemKey, {
      note: buildBookCompanionNoteTitle(previousMessage),
      assistantContent: content,
      sourceMessageId: message.id,
      source: "book-companion-chat",
    });

    setSavedNoteMessageIds((current) => new Set([...current, message.id]));
    setNoteNotice(
      context.currentKey
        ? "已记到当前阅读项笔记。"
        : "已记到本书读伴笔记。"
    );
    setConfirmClearChat(false);
  }

  async function handleClearChat() {
    if (!book?.id || chatLoading || chatMessages.length === 0) return;
    if (!confirmClearChat) {
      setConfirmClearChat(true);
      setNoteNotice("");
      return;
    }

    await saveBookCompanionChat(book.id, []);
    setChatMessages([]);
    setChatError("");
    setConfirmClearChat(false);
    setNoteNotice("已清空本书聊天记录；已经记到笔记的内容会继续保留。");
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(draft);
  }

  function handleTextareaKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendMessage(draft);
  }

  if (loading) {
    return (
      <main className="book-companion-page mx-auto max-w-[1280px] px-6 py-8 sm:px-10 lg:px-16">
        <section className="book-companion-loading">正在铺开这本书的读伴小案。</section>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="book-companion-page mx-auto max-w-[1280px] px-6 py-8 sm:px-10 lg:px-16">
        <button type="button" onClick={onBack} className="book-companion-back">
          返回藏书
        </button>
        <section className="book-companion-empty">
          <h2>没有找到这本书</h2>
          <p>回到藏书页后可以重新选择一本书。</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="book-companion-page mx-auto max-w-[1280px] px-6 py-8 sm:px-10 lg:px-16"
      style={companion.style}
    >
      <button type="button" onClick={onBack} className="book-companion-back">
        返回藏书
      </button>

      <section className="book-companion-layout">
        <aside className="book-companion-aside">
          <div className="book-companion-card">
            <div className="book-companion-avatar">
              <ReadingCompanionAvatar stage={4} expression={companion.expression} />
            </div>
            <p className="book-companion-kicker">本书读伴</p>
            <h1>{toText(book.title) || "未命名书籍"}</h1>
            <p className="book-companion-author">{toText(book.author) || "佚名"}</p>
          </div>

          <div className="book-companion-context-card">
            <div className="book-companion-section-title">
              <ChineseIcon name="scroll" className="h-4 w-4" decorative />
              <span>读到这里</span>
            </div>
            <strong>{context.positionTitle}</strong>
            <p>{context.positionDetail}</p>
            <div className="book-companion-progress">
              <span style={{ width: `${context.percent}%` }} />
            </div>
            <dl>
              <div>
                <dt>进度</dt>
                <dd>{context.percent}%</dd>
              </div>
              <div>
                <dt>上次阅读</dt>
                <dd>{context.lastReadText}</dd>
              </div>
            </dl>
          </div>

          <div className="book-companion-context-card">
            <div className="book-companion-section-title">
              <ChineseIcon name="seal" className="h-4 w-4" decorative />
              <span>读伴会参考</span>
            </div>
            <ul className="book-companion-context-list">
              {context.memoryHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="book-companion-chat-panel">
          <header className="book-companion-chat-header">
            <div>
              <p><BrandName />在这本书旁边</p>
              <h2>和本书读伴聊聊</h2>
            </div>
            <div className="book-companion-header-actions">
              <button type="button" onClick={() => onOpenSalon?.(book.id)} className="book-companion-secondary">
                整理这本书
              </button>
              {context.canRead ? (
                <button type="button" onClick={() => onReadBook(book.id)} className="book-companion-secondary">
                  继续阅读
                </button>
              ) : (
                <button type="button" onClick={() => onPlanBook(book.id)} className="book-companion-secondary">
                  设定读伴
                </button>
              )}
              {chatMessages.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleClearChat}
                    disabled={chatLoading}
                    className="book-companion-secondary book-companion-secondary-muted"
                  >
                    {confirmClearChat ? "确认清空" : "清空聊天"}
                  </button>
                  {confirmClearChat && (
                    <button
                      type="button"
                      onClick={() => setConfirmClearChat(false)}
                      className="book-companion-secondary book-companion-secondary-plain"
                    >
                      取消
                    </button>
                  )}
                </>
              )}
            </div>
          </header>

          <div className="book-companion-messages" aria-live="polite">
            {messages.map((message, index) => (
              <BookCompanionMessage
                key={message.id}
                message={message}
                previousMessage={messages[index - 1]}
                companion={companion}
                savedToNote={savedNoteMessageIds.has(message.id)}
                onAddToNote={handleAddMessageToNote}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="book-companion-suggestions">
            {context.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setDraft(suggestion)}
                disabled={chatLoading}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {chatError && <p className="book-companion-error">{chatError}</p>}
          {noteNotice && <p className="book-companion-notice">{noteNotice}</p>}
          {confirmClearChat && (
            <p className="book-companion-notice book-companion-notice-warning">
              只会清空本书聊天历史，不会删除书籍、阅读进度或已经保存的笔记。
            </p>
          )}

          <form className="book-companion-composer" onSubmit={handleSubmit}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={chatLoading}
              placeholder="和这本书的读伴说点什么。Enter 发送，Shift+Enter 换行。"
              rows={3}
            />
            <button
              type={chatLoading ? "button" : "submit"}
              onClick={chatLoading ? cancelChatGeneration : undefined}
              disabled={!chatLoading && !draft.trim()}
            >
              {chatLoading ? "停止" : "发送"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function BookCompanionMessage({
  message,
  previousMessage,
  companion,
  savedToNote = false,
  onAddToNote,
}) {
  const isAssistant = message.role === "assistant";
  const content = toText(message.content).trim();
  const canSaveToNote = isAssistant && !message.streaming && message.id !== "welcome" && content;

  return (
    <article className={`book-companion-message ${isAssistant ? "is-assistant" : "is-user"}`}>
      {isAssistant && (
        <div className="book-companion-message-avatar" style={companion.style}>
          <ReadingCompanionAvatar stage={4} expression={companion.expression} />
        </div>
      )}
      <div className="book-companion-message-bubble">
        {content || (message.streaming ? "正在把你的问题放回这本书里…" : "")}
        {isAssistant && !message.streaming && <BookCompanionUsage message={message} />}
        {canSaveToNote && (
          <div className="book-companion-message-actions">
            <button
              type="button"
              disabled={savedToNote}
              onClick={() => onAddToNote?.(message, previousMessage)}
            >
              {savedToNote ? "已记到笔记" : "记到笔记"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function BookCompanionUsage({ message }) {
  const usage = message.usage;
  const cost = message.cost;
  const hitOutputLimit =
    message.truncated ||
    (usage?.output_tokens &&
      message.maxOutputTokens &&
      usage.output_tokens >= message.maxOutputTokens * 0.98);

  if (!usage && !cost && !message.model && !message.truncated) return null;

  return (
    <p className="book-companion-usage">
      {message.model ? `${message.model} · ` : ""}
      输入 {usage?.input_tokens ?? "未知"} / 输出 {usage?.output_tokens ?? "未知"}
      {cost ? ` · ${formatUsd(cost.totalCost)}` : ""}
      {hitOutputLimit ? ` · ${message.truncated ? "已到输出上限" : "可能已到输出上限"}` : ""}
    </p>
  );
}

function buildBookCompanionContext(book, progress = {}) {
  if (!book) {
    return {
      canRead: false,
      currentKey: "",
      percent: 0,
      positionTitle: "尚未选择书籍",
      positionDetail: "读伴会在这里显示当前阅读位置。",
      lastReadText: "暂无",
      memoryHints: ["书籍信息", "读伴设定", "阅读位置"],
      suggestions: ["这本书现在读到哪里了？"],
    };
  }

  const planItems = book.readingPlan?.items || [];
  const totalCount = planItems.length;
  const completedKeys = progress?.completedItemKeys || [];
  const completedCount = completedKeys.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentIndex = clampIndex(progress?.currentItemIndex || 0, totalCount);
  const currentItem = planItems[currentIndex] || null;
  const currentKey = getPlanItemKey(currentItem, currentIndex);
  const savedLocation = progress?.currentPageByItemKey?.[currentKey] || null;
  const pageUnitLabel = getBookPageUnitLabel(book);
  const pageNumber = savedLocation?.pageNumber || currentItem?.startPage || null;
  const pageText = pageNumber ? formatBookPageLabel(pageNumber, pageUnitLabel) : "还没开始";
  const itemTitle = currentItem?.title || "还没有阅读计划";
  const canRead = book.status === "planned" && totalCount > 0;

  return {
    canRead,
    currentKey: canRead ? currentKey : "",
    percent,
    positionTitle: canRead ? itemTitle : "未设置读伴",
    positionDetail: canRead
      ? `${pageText} · 第 ${currentIndex + 1}/${totalCount} 个阅读日`
      : "先设定读伴和阅读计划，这里会显示读到哪里。",
    lastReadText: formatLastReadTime(progress?.lastReadAt),
    memoryHints: [
      "这本书的读伴设定",
      canRead ? `当前阅读项：${itemTitle}` : "尚未生成阅读计划",
      canRead ? `当前位置：${pageText}` : "尚未开始阅读",
      percent > 0 ? `已完成 ${percent}%` : "还没有完成的阅读日",
    ],
    suggestions: canRead
      ? [
          "我现在读到哪里了？",
          "帮我接上上次阅读的思路",
          "接下来这一段应该留意什么？",
          "把目前为止的主线整理一下",
        ]
      : [
          "这本书适合怎么开始？",
          "设定读伴前我应该先想什么？",
          "帮我准备一条阅读问题",
        ],
  };
}

function buildSavedBookCompanionNoteLookup(notes) {
  const ids = new Set();
  (Array.isArray(notes) ? notes : []).forEach((note) => {
    if (note?.source !== "book-companion-chat") return;
    const messageId = toText(note.sourceMessageId).trim();
    if (messageId) ids.add(messageId);
  });
  return ids;
}

function buildBookCompanionNoteTitle(previousMessage) {
  const question = toText(previousMessage?.role === "user" ? previousMessage.content : "").trim();
  if (!question) return "本书读伴聊天";
  return `本书读伴聊天：${question.slice(0, 80)}${question.length > 80 ? "..." : ""}`;
}

function buildWelcomeMessage(book, context) {
  if (!book) return "";
  if (!context.canRead) {
    return "我还没有拿到这本书的读伴设定和阅读计划。你可以先告诉我为什么想读它，也可以先去设定读伴。";
  }

  return `我知道你现在在「${context.positionTitle}」，${context.positionDetail}。你可以从这里问我，也可以让我帮你接上前面的阅读线索。`;
}

function getBookCompanion(book) {
  const profile = book?.readingProfile?.companionFocus?.companionProfile || {};
  const name = toText(profile.name) || DEFAULT_COMPANION_PROFILE.name;
  const color = toText(profile.color) || DEFAULT_COMPANION_PROFILE.color;
  const expression = toText(profile.expression) || DEFAULT_COMPANION_PROFILE.expression;
  const colorOption =
    COMPANION_COLOR_OPTIONS.find((option) => option.id === color) ||
    COMPANION_COLOR_OPTIONS[0];

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

function formatBookPageLabel(pageNumber, pageUnitLabel = "页") {
  if (pageUnitLabel === "文本页") return `文本页 ${pageNumber}`;
  return `第 ${pageNumber} 页`;
}

function formatLastReadTime(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
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
