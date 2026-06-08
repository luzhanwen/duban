import { useEffect, useState } from "react";
import BookSetup from "./components/BookSetup.jsx";
import Reader from "./components/Reader.jsx";
import ReadingPlanSetup from "./components/ReadingPlanSetup.jsx";
import Settings from "./components/Settings.jsx";
import Shelf from "./components/Shelf.jsx";
import BrandLogo from "./components/BrandLogo.jsx";
import SplashScreen from "./components/SplashScreen.jsx";

// 应用主壳：顶部导航 + 内容区。
// 这里用一个简单的 view 状态来切换页面，不引入路由库，保持项目精简。
// 后续阶段会增加「阅读器」等视图。
export default function App() {
  const [view, setView] = useState("shelf"); // 'shelf' 书架 | 'settings' 设置
  const [currentBookId, setCurrentBookId] = useState(null);
  const [readerRequest, setReaderRequest] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const inReader = view === "reader";

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const leaveDelay = prefersReducedMotion ? 300 : 2050;
    const removeDelay = prefersReducedMotion ? 520 : 2520;
    const leaveTimer = window.setTimeout(() => setSplashLeaving(true), leaveDelay);
    const removeTimer = window.setTimeout(() => setShowSplash(false), removeDelay);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
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
    <div className="min-h-full">
      {showSplash && <SplashScreen leaving={splashLeaving} />}

      {!inReader && (
        <header className="border-b border-line bg-paper-card">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <button
              onClick={() => setView("shelf")}
              className="rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper-card"
            >
              <BrandLogo />
            </button>
            <nav className="flex items-center gap-1 text-sm">
              <NavTab
                active={view === "shelf"}
                onClick={() => setView("shelf")}
              >
                书架
              </NavTab>
              <NavTab
                active={view === "settings"}
                onClick={() => setView("settings")}
              >
                设置
              </NavTab>
            </nav>
          </div>
        </header>
      )}

      {/* 内容区：根据当前 view 渲染不同页面 */}
      <main>
        {view === "settings" && <Settings />}
        {view === "shelf" && (
          <Shelf
            onSetupBook={openBookSetup}
            onPlanBook={openReadingPlan}
            onReadBook={openReader}
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

// 顶部导航的单个标签
function NavTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 transition-colors ${
        active ? "bg-accent text-white" : "text-ink-soft hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}
