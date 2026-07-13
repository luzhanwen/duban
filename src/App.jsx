import { useEffect, useState } from "react";
import AiSetupWizard from "./components/AiSetupWizard.jsx";
import BookCompanionChat from "./components/BookCompanionChat.jsx";
import BookSalon from "./components/BookSalon.jsx";
import BookSetup from "./components/BookSetup.jsx";
import Reader from "./components/Reader.jsx";
import ReadingPlanSetup from "./components/ReadingPlanSetup.jsx";
import Settings from "./components/Settings.jsx";
import Shelf from "./components/Shelf.jsx";
import BrandLogo from "./components/BrandLogo.jsx";
import ChineseIcon from "./components/ChineseIcon.jsx";
import Privacy from "./components/Privacy.jsx";
import SplashScreen from "./components/SplashScreen.jsx";
import { initializeDesktopWindowIcon } from "./lib/desktopIcon.js";
import { APP_RUNTIME } from "./lib/runtime.js";
import { getSettings, normalizeSettings } from "./lib/storage.js";

const DESKTOP_DOWNLOAD_URL =
  import.meta.env.VITE_DESKTOP_DOWNLOAD_URL?.trim() ||
  "https://github.com/luzhanwen/duban/releases/latest";

// 应用主壳：顶部导航 + 内容区。
// 这里用一个简单的 view 状态来切换页面，不引入路由库，保持项目精简。
// 后续阶段会增加「阅读器」等视图。
export default function App() {
  const [view, setView] = useState("shelf"); // 'shelf' 书架 | 'settings' 设置
  const [currentBookId, setCurrentBookId] = useState(null);
  const [readerRequest, setReaderRequest] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [aiSetup, setAiSetup] = useState({ status: "loading", settings: null });
  const inReader = view === "reader";

  useEffect(() => {
    initializeDesktopWindowIcon();

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const leaveDelay = prefersReducedMotion ? 300 : 2050;
    const removeDelay = prefersReducedMotion ? 520 : 2640;
    const leaveTimer = window.setTimeout(() => setSplashLeaving(true), leaveDelay);
    const removeTimer = window.setTimeout(() => setShowSplash(false), removeDelay);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    getSettings()
      .then((settings) => {
        if (!active) return;
        setAiSetup({
          status: hasConfiguredAi(settings) ? "configured" : "needed",
          settings,
        });
      })
      .catch(() => {
        if (active) setAiSetup({ status: "unavailable", settings: null });
      });
    return () => {
      active = false;
    };
  }, []);

  function openBookSetup(bookId) {
    setCurrentBookId(bookId);
    setView("bookSetup");
  }

  function openReadingPlan(bookId) {
    setCurrentBookId(bookId);
    setView("readingPlan");
  }

  function openBookCompanionChat(bookId) {
    setCurrentBookId(bookId);
    setView("bookCompanionChat");
  }

  function openBookSalon(bookId) {
    setCurrentBookId(bookId);
    setView("bookSalon");
  }

  function openReader(bookId, options = {}) {
    setCurrentBookId(bookId);
    setReaderRequest({
      bookId,
      itemIndex: Number.isInteger(options.itemIndex) ? options.itemIndex : null,
      mode: options.mode || "default",
      requestedAt: Date.now(),
    });
    setView("reader");
  }

  return (
    <div className="app-root min-h-full">
      {showSplash && (
        <SplashScreen leaving={splashLeaving} toSetup={aiSetup.status === "needed"} />
      )}

      {(splashLeaving || !showSplash) && aiSetup.status === "needed" && (
        <AiSetupWizard
          initialSettings={aiSetup.settings}
          transitioningFromSplash={splashLeaving}
          onDismiss={() => setAiSetup((current) => ({ ...current, status: "dismissed" }))}
          onComplete={() => setAiSetup((current) => ({ ...current, status: "configured" }))}
        />
      )}

      {!inReader && (
        <header className="border-b border-line bg-paper-card/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1480px] items-center justify-between px-6 py-3 sm:px-10 lg:px-16">
            <button
              onClick={() => setView("shelf")}
              className="rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper-card"
            >
              <BrandLogo variant="horizontal" />
            </button>
            <nav className="literary-ui flex items-center gap-1 text-sm">
              <NavTab
                icon="books"
                active={view === "shelf"}
                onClick={() => setView("shelf")}
              >
                藏书
              </NavTab>
              <NavTab
                icon="settings"
                active={view === "settings"}
                onClick={() => setView("settings")}
              >
                设置
              </NavTab>
              <DesktopDownloadLink />
            </nav>
          </div>
        </header>
      )}

      {/* 内容区：根据当前 view 渲染不同页面 */}
      <main>
        {view === "settings" && <Settings onOpenPrivacy={() => setView("privacy")} />}
        {view === "privacy" && <Privacy onBack={() => setView("settings")} />}
        {view === "shelf" && (
          <Shelf
            onSetupBook={openBookSetup}
            onPlanBook={openReadingPlan}
            onReadBook={openReader}
            onChatBook={openBookCompanionChat}
            onOpenSalon={openBookSalon}
          />
        )}
        {view === "bookCompanionChat" && currentBookId && (
          <BookCompanionChat
            bookId={currentBookId}
            onBack={() => setView("shelf")}
            onReadBook={openReader}
            onPlanBook={openReadingPlan}
            onOpenSalon={openBookSalon}
          />
        )}
        {view === "bookSalon" && currentBookId && (
          <BookSalon
            bookId={currentBookId}
            onBack={() => setView("shelf")}
            onReadBook={openReader}
            onPlanBook={openReadingPlan}
            onChatBook={openBookCompanionChat}
          />
        )}
        {view === "bookSetup" && currentBookId && (
          <BookSetup
            bookId={currentBookId}
            onBack={() => setView("shelf")}
            onSaved={(book) => openReadingPlan(book.id)}
          />
        )}
        {view === "readingPlan" && currentBookId && (
          <ReadingPlanSetup
            bookId={currentBookId}
            onBack={() => openBookSetup(currentBookId)}
            onDone={() => setView("shelf")}
          />
        )}
        {view === "reader" && currentBookId && (
          <Reader
            bookId={currentBookId}
            initialItemIndex={
              readerRequest?.bookId === currentBookId ? readerRequest.itemIndex : null
            }
            initialMode={
              readerRequest?.bookId === currentBookId ? readerRequest.mode : "default"
            }
            requestId={readerRequest?.requestedAt || 0}
            onBack={() => setView("shelf")}
            onPlan={openReadingPlan}
          />
        )}
      </main>
    </div>
  );
}

function DesktopDownloadLink() {
  if (!APP_RUNTIME.isBrowser) return null;

  return (
    <a
      href={DESKTOP_DOWNLOAD_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="下载读伴桌面版"
      className="relative rounded-lg px-3 py-1.5 text-ink-soft transition-colors hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper-card"
    >
      <span className="hidden sm:inline">下载桌面版</span>
      <span className="sm:hidden">桌面版</span>
    </a>
  );
}

// 顶部导航的单个标签
function NavTab({ icon, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors after:absolute after:inset-x-3 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-accent after:content-[''] ${
        active
          ? "bg-paper-muted/70 text-ink after:opacity-100"
          : "text-ink-soft hover:bg-paper-muted hover:text-ink after:opacity-0"
      }`}
    >
      {icon && <ChineseIcon name={icon} className="h-4 w-4" decorative />}
      {children}
    </button>
  );
}

function hasConfiguredAi(settings) {
  const normalized = normalizeSettings(settings);
  return Boolean(
    normalized.anthropic.apiKey ||
      normalized.anthropic.hasApiKey ||
      normalized.openaiCompatible.apiKey ||
      normalized.openaiCompatible.hasApiKey
  );
}
