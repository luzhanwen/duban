import { useState } from "react";
import BookSetup from "./components/BookSetup.jsx";
import Reader from "./components/Reader.jsx";
import ReadingPlanSetup from "./components/ReadingPlanSetup.jsx";
import Settings from "./components/Settings.jsx";
import Shelf from "./components/Shelf.jsx";

// 应用主壳：顶部导航 + 内容区。
// 这里用一个简单的 view 状态来切换页面，不引入路由库，保持项目精简。
// 后续阶段会增加「阅读器」等视图。
export default function App() {
  const [view, setView] = useState("shelf"); // 'shelf' 书架 | 'settings' 设置
  const [currentBookId, setCurrentBookId] = useState(null);
  const inReader = view === "reader";

  function openBookSetup(bookId) {
    setCurrentBookId(bookId);
    setView("bookSetup");
  }

  function openReadingPlan(bookId) {
    setCurrentBookId(bookId);
    setView("readingPlan");
  }

  function openReader(bookId) {
    setCurrentBookId(bookId);
    setView("reader");
  }

  return (
    <div className="min-h-full">
      {!inReader && (
        <header className="border-b border-line bg-paper-card">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <button
              onClick={() => setView("shelf")}
              className="font-serif text-xl text-ink"
            >
              读伴
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
