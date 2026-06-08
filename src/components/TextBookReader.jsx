import { useEffect, useMemo, useRef, useState } from "react";
import { BrandName } from "./BrandLogo.jsx";
import { toText } from "../lib/text.js";

export default function TextBookReader({
  pages = [],
  startPage,
  endPage,
  initialPage,
  onCurrentPageChange,
  onAskSelection,
}) {
  const containerRef = useRef(null);
  const [selectionToolbar, setSelectionToolbar] = useState(null);
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);

  const visiblePages = useMemo(() => {
    const start = Math.max(1, Number(startPage) || 1);
    const end = Math.max(start, Number(endPage) || start);
    return pages.filter((page) => {
      const pageNumber = Number(page.pageNumber);
      return pageNumber >= start && pageNumber <= end;
    });
  }, [pages, startPage, endPage]);

  useEffect(() => {
    onCurrentPageChangeRef.current = onCurrentPageChange;
  }, [onCurrentPageChange]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || visiblePages.length === 0 || !onCurrentPageChangeRef.current) return undefined;

    const pageNumbers = visiblePages.map((page) => Number(page.pageNumber));
    const firstVisiblePage = getInitialPageInRange(initialPage, pageNumbers);
    onCurrentPageChangeRef.current(firstVisiblePage);

    const visibleEntries = new Map();
    const root = getScrollParent(node);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNumber = Number(entry.target.getAttribute("data-page-number"));
          if (!Number.isFinite(pageNumber)) return;

          if (entry.isIntersecting) {
            visibleEntries.set(pageNumber, entry.intersectionRect.height);
          } else {
            visibleEntries.delete(pageNumber);
          }
        });

        const best = [...visibleEntries.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) onCurrentPageChangeRef.current?.(best[0]);
      },
      {
        root,
        rootMargin: "-10% 0px -35% 0px",
        threshold: [0, 0.15, 0.35, 0.55, 0.75, 1],
      }
    );

    visiblePages
      .map((page) => node.querySelector(`[data-page-number="${page.pageNumber}"]`))
      .filter(Boolean)
      .forEach((pageNode) => observer.observe(pageNode));

    return () => observer.disconnect();
  }, [visiblePages, initialPage]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || visiblePages.length === 0 || !initialPage) return;

    const pageNumbers = visiblePages.map((page) => Number(page.pageNumber));
    const pageNumber = getInitialPageInRange(initialPage, pageNumbers);
    const target = node.querySelector(`[data-page-number="${pageNumber}"]`);
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
    });
  }, [visiblePages, initialPage]);

  useEffect(() => {
    setSelectionToolbar(null);
  }, [startPage, endPage]);

  function updateSelectionToolbar(event) {
    if (event?.target?.closest?.(".text-selection-toolbar")) return;

    window.setTimeout(() => {
      const selection = window.getSelection?.();
      const node = containerRef.current;
      if (!selection || !node || selection.rangeCount === 0) {
        setSelectionToolbar(null);
        return;
      }

      const text = normalizeSelectedText(selection.toString());
      if (!text) {
        setSelectionToolbar(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const pageNode = findClosestPageNode(range.startContainer);
      if (!pageNode || !node.contains(pageNode)) {
        setSelectionToolbar(null);
        return;
      }

      const rect = getUsefulSelectionRect(range);
      if (!rect) {
        setSelectionToolbar(null);
        return;
      }

      const pageNumber = Number(pageNode.getAttribute("data-page-number")) || null;
      setSelectionToolbar({
        text,
        pageNumber,
        top: Math.max(12, rect.top - 44),
        left: clamp(rect.left + rect.width / 2, 112, window.innerWidth - 112),
      });
    }, 0);
  }

  function handleSelectionAction(action) {
    if (!selectionToolbar || !onAskSelection) return;
    onAskSelection({
      action,
      text: selectionToolbar.text,
      pageNumber: selectionToolbar.pageNumber,
      rects: [],
    });
    setSelectionToolbar(null);
    window.getSelection?.()?.removeAllRanges?.();
  }

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-3xl"
      onMouseUp={updateSelectionToolbar}
      onKeyUp={updateSelectionToolbar}
    >
      {visiblePages.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">这一段暂时没有提取到可阅读文本。</p>
        </div>
      ) : (
        <div className="pb-8">
          {visiblePages.map((page) => (
            <TextPage key={page.pageNumber} page={page} />
          ))}
        </div>
      )}

      {selectionToolbar && (
        <div
          className="text-selection-toolbar fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-paper-card p-1 text-xs shadow-lg"
          style={{ top: `${selectionToolbar.top}px`, left: `${selectionToolbar.left}px` }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={() => handleSelectionAction("ask")}
            className="inline-flex items-baseline gap-1 rounded-full bg-accent px-3 py-1.5 text-white hover:opacity-90"
          >
            问<BrandName />
          </button>
          <button
            type="button"
            onClick={() => handleSelectionAction("note")}
            className="rounded-full px-3 py-1.5 text-ink-soft hover:bg-paper"
          >
            添加笔记
          </button>
        </div>
      )}
    </div>
  );
}

function TextPage({ page }) {
  const paragraphs = toText(page.text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <section
      id={`text-page-${page.pageNumber}`}
      data-page-number={page.pageNumber}
      className="scroll-mt-6 border-b border-line/70 py-8 first:pt-0 last:border-b-0"
    >
      <p className="text-xs font-medium text-ink-soft">文本页 {page.pageNumber}</p>
      <div className="mt-5 space-y-5">
        {paragraphs.map((paragraph, index) => (
          <p key={`${page.pageNumber}-${index}`} className="text-[17px] leading-8 text-ink">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

function normalizeSelectedText(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1200);
}

function findClosestPageNode(node) {
  return findClosestElement(node, "[data-page-number]");
}

function findClosestElement(node, selector) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest?.(selector) || null;
}

function getUsefulSelectionRect(range) {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 1 && rect.height > 1
  );
  return rects[0] || null;
}

function getScrollParent(node) {
  let current = node.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(`${style.overflow}${style.overflowY}`)) return current;
    current = current.parentElement;
  }
  return null;
}

function getInitialPageInRange(initialPage, pageNumbers) {
  if (pageNumbers.length === 0) return null;
  const requested = Number(initialPage);
  if (pageNumbers.includes(requested)) return requested;
  return pageNumbers[0];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}
