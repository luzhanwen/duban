import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BrandName } from "./BrandLogo.jsx";
import { toText } from "../lib/text.js";

const TextBookReader = forwardRef(function TextBookReader({
  pages = [],
  highlights = [],
  startPage,
  endPage,
  initialPage,
  readingMode = "scroll",
  activePage,
  canGoPrevious = false,
  canGoNext = false,
  onRequestPageStep,
  pageTurnDirection = "none",
  pageAnimationEnabled = true,
  onPaginationChange,
  onCurrentPageChange,
  onAskSelection,
}, ref) {
  const containerRef = useRef(null);
  const pageViewportRef = useRef(null);
  const pageMeasureRef = useRef(null);
  const swipeStartRef = useRef(null);
  const wheelDistanceRef = useRef(0);
  const wheelResetTimerRef = useRef(null);
  const wheelLockedUntilRef = useRef(0);
  const screenIndexRef = useRef(0);
  const screenCountRef = useRef(1);
  const screenPaginationRef = useRef({ pageNumber: null, index: 0, count: 1 });
  const activePageRef = useRef(null);
  const [selectionToolbar, setSelectionToolbar] = useState(null);
  const [screenPagination, setScreenPagination] = useState({
    pageNumber: null,
    index: 0,
    count: 1,
  });
  const [screenSegments, setScreenSegments] = useState(null);
  const [screenTransition, setScreenTransition] = useState({ direction: "none", token: 0 });
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  const onPaginationChangeRef = useRef(onPaginationChange);
  const pageMode = readingMode === "page";

  const rangedPages = useMemo(() => {
    const start = Math.max(1, Number(startPage) || 1);
    const end = Math.max(start, Number(endPage) || start);
    return pages.filter((page) => {
      const pageNumber = Number(page.pageNumber);
      return pageNumber >= start && pageNumber <= end;
    });
  }, [pages, startPage, endPage]);

  const visiblePages = useMemo(() => {
    if (!pageMode) return rangedPages;
    const pageNumbers = rangedPages.map((page) => Number(page.pageNumber));
    const pageNumber = getInitialPageInRange(activePage || initialPage, pageNumbers);
    return rangedPages.filter((page) => Number(page.pageNumber) === pageNumber);
  }, [activePage, initialPage, pageMode, rangedPages]);

  useEffect(() => {
    onCurrentPageChangeRef.current = onCurrentPageChange;
  }, [onCurrentPageChange]);

  useEffect(() => {
    onPaginationChangeRef.current = onPaginationChange;
  }, [onPaginationChange]);

  useImperativeHandle(ref, () => ({
    goPrevious() {
      if (!pageMode || screenIndexRef.current <= 0) return false;
      setScreenIndex(screenIndexRef.current - 1, pageAnimationEnabled);
      return true;
    },
    goNext() {
      if (!pageMode || screenIndexRef.current >= screenCountRef.current - 1) return false;
      setScreenIndex(screenIndexRef.current + 1, pageAnimationEnabled);
      return true;
    },
  }), [pageAnimationEnabled, pageMode]);

  useLayoutEffect(() => {
    if (!pageMode || visiblePages.length !== 1) return undefined;
    const viewport = pageViewportRef.current;
    const measureHost = pageMeasureRef.current;
    if (!viewport || !measureHost) return undefined;

    let frame = 0;
    const pageNumber = Number(visiblePages[0]?.pageNumber) || null;

    function measure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const width = Math.max(1, viewport.clientWidth);
        const height = Math.max(1, viewport.clientHeight);
        measureHost.style.width = `${width}px`;
        const segments = paginateParagraphs(
          measureHost,
          getPageParagraphs(visiblePages[0]),
          Math.max(64, height - 4)
        );
        const count = segments.length;
        const enteringFromPrevious =
          activePageRef.current !== null &&
          activePageRef.current !== pageNumber &&
          pageTurnDirection === "previous";
        const pageChanged = activePageRef.current !== pageNumber;
        const nextIndex = pageChanged
          ? (enteringFromPrevious ? count - 1 : 0)
          : Math.min(screenIndexRef.current, count - 1);

        activePageRef.current = pageNumber;
        screenCountRef.current = count;
        screenIndexRef.current = nextIndex;
        const nextPagination = { pageNumber, index: nextIndex, count };
        screenPaginationRef.current = nextPagination;
        setScreenSegments({ pageNumber, items: segments });
        setScreenPagination(nextPagination);
        onPaginationChangeRef.current?.(nextPagination);
        measureHost.replaceChildren();
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [pageMode, pageTurnDirection, visiblePages]);

  useEffect(() => {
    if (!pageMode) {
      activePageRef.current = null;
      screenIndexRef.current = 0;
      screenCountRef.current = 1;
      screenPaginationRef.current = { pageNumber: null, index: 0, count: 1 };
      onPaginationChangeRef.current?.(null);
    }
  }, [pageMode]);

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
  }, [activePage, readingMode, startPage, endPage]);

  useEffect(() => () => {
    window.clearTimeout(wheelResetTimerRef.current);
  }, []);

  function setScreenIndex(nextIndex, animate = false) {
    const count = screenCountRef.current;
    const index = clamp(nextIndex, 0, Math.max(0, count - 1));
    const direction = index > screenIndexRef.current ? "next" : "previous";
    screenIndexRef.current = index;
    const nextPagination = { ...screenPaginationRef.current, index };
    screenPaginationRef.current = nextPagination;
    setScreenPagination(nextPagination);
    onPaginationChangeRef.current?.(nextPagination);
    setScreenTransition((current) => ({
      direction: animate ? direction : "none",
      token: current.token + 1,
    }));
    setSelectionToolbar(null);
    window.getSelection?.()?.removeAllRanges?.();
  }

  function handlePageWheel(event) {
    if (!pageMode || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 4) {
      return;
    }

    event.preventDefault();
    const now = Date.now();
    if (now < wheelLockedUntilRef.current) return;

    wheelDistanceRef.current += event.deltaX;
    window.clearTimeout(wheelResetTimerRef.current);
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelDistanceRef.current = 0;
    }, 180);

    if (Math.abs(wheelDistanceRef.current) < 48) return;
    const direction = wheelDistanceRef.current > 0 ? 1 : -1;
    wheelDistanceRef.current = 0;
    wheelLockedUntilRef.current = now + 420;
    onRequestPageStep?.(direction);
  }

  function handlePagePointerDown(event) {
    if (!pageMode || !["touch", "pen"].includes(event.pointerType)) return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }

  function handlePagePointerUp(event) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    onRequestPageStep?.(deltaX < 0 ? 1 : -1);
  }

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
      className={`text-book-reader reader-prose ${pageMode ? "is-page-mode" : ""}`}
      onWheel={handlePageWheel}
      onPointerDown={handlePagePointerDown}
      onPointerUp={handlePagePointerUp}
      onPointerCancel={() => { swipeStartRef.current = null; }}
      onMouseUp={updateSelectionToolbar}
      onKeyUp={updateSelectionToolbar}
    >
      {visiblePages.length === 0 ? (
        <div className="text-book-empty rounded-xl border border-line bg-paper px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">这一段暂时没有提取到可阅读文本。</p>
        </div>
      ) : (
        <div className="text-book-pages">
          {visiblePages.map((page) => (
            <TextPage
              key={page.pageNumber}
              page={page}
              pageMode={pageMode}
              pageViewportRef={pageViewportRef}
              pageMeasureRef={pageMeasureRef}
              screenSegments={screenSegments}
              screenIndex={screenPagination.index}
              screenTransition={screenTransition}
              highlights={highlights}
              canGoPrevious={screenPagination.index > 0 || canGoPrevious}
              canGoNext={screenPagination.index < screenPagination.count - 1 || canGoNext}
              onRequestPageStep={onRequestPageStep}
            />
          ))}
        </div>
      )}

      {selectionToolbar && (
        <div
          className="text-selection-toolbar reader-selection-toolbar fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-paper-card p-1 text-xs shadow-lg"
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
});

export default TextBookReader;

function TextPage({
  page,
  pageMode,
  pageViewportRef,
  pageMeasureRef,
  screenSegments,
  screenIndex,
  screenTransition,
  highlights,
  canGoPrevious,
  canGoNext,
  onRequestPageStep,
}) {
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const paragraphs = useMemo(() => getPageParagraphs(page), [page]);
  const highlightRanges = useMemo(
    () => buildPageHighlightRanges(paragraphs, highlights, page.pageNumber),
    [highlights, page.pageNumber, paragraphs]
  );
  const visibleParagraphs =
    pageMode && screenSegments?.pageNumber === Number(page.pageNumber)
      ? screenSegments.items[screenIndex] || []
      : paragraphs;

  function handleViewportMouseMove(event) {
    if (!pageMode || event.buttons) {
      setHoveredEdge(null);
      return;
    }
    setHoveredEdge(getAvailablePageEdge(event.currentTarget, event.clientX, {
      canGoPrevious,
      canGoNext,
    }));
  }

  function handleViewportMouseUp(event) {
    if (!pageMode || event.button !== 0) return;
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed && normalizeSelectedText(selection.toString())) return;

    const edge = getAvailablePageEdge(event.currentTarget, event.clientX, {
      canGoPrevious,
      canGoNext,
    });
    if (edge === "previous") onRequestPageStep?.(-1);
    if (edge === "next") onRequestPageStep?.(1);
  }

  return (
    <section
      id={`text-page-${page.pageNumber}`}
      data-page-number={page.pageNumber}
      className="text-book-page scroll-mt-6"
    >
      <p className="text-book-page-label">文本页 {page.pageNumber}</p>
      <div
        ref={pageMode ? pageViewportRef : null}
        className="text-book-page-viewport"
        onMouseMove={handleViewportMouseMove}
        onMouseLeave={() => setHoveredEdge(null)}
        onMouseUp={handleViewportMouseUp}
      >
        <div
          key={`${page.pageNumber}-${screenIndex}-${screenTransition.token}`}
          className={`text-book-page-body ${
            pageMode && screenTransition.direction !== "none"
              ? `is-turning-${screenTransition.direction}`
              : ""
          }`}
        >
          {visibleParagraphs.map((paragraph) => (
            <p
              key={`${page.pageNumber}-${paragraph.paragraphIndex}-${paragraph.startOffset}`}
              className="text-book-paragraph"
            >
              {renderHighlightedParagraph(paragraph, highlightRanges)}
            </p>
          ))}
        </div>
        {pageMode && (
          <div ref={pageMeasureRef} className="text-book-page-measure" aria-hidden="true" />
        )}
        {pageMode && canGoPrevious && (
          <span
            aria-hidden="true"
            className={`text-page-edge-button is-previous ${
              hoveredEdge === "previous" ? "is-active" : ""
            }`}
          >
            <span aria-hidden="true">‹</span>
          </span>
        )}
        {pageMode && canGoNext && (
          <span
            aria-hidden="true"
            className={`text-page-edge-button is-next ${
              hoveredEdge === "next" ? "is-active" : ""
            }`}
          >
            <span aria-hidden="true">›</span>
          </span>
        )}
      </div>
    </section>
  );
}

function getAvailablePageEdge(node, clientX, { canGoPrevious, canGoNext }) {
  const rect = node.getBoundingClientRect();
  const edgeWidth = Math.min(80, Math.max(44, rect.width * 0.12));
  const offsetX = clientX - rect.left;
  if (canGoPrevious && offsetX <= edgeWidth) return "previous";
  if (canGoNext && offsetX >= rect.width - edgeWidth) return "next";
  return null;
}

function getPageParagraphs(page) {
  return toText(page?.text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((text, paragraphIndex) => ({ text, paragraphIndex, startOffset: 0 }));
}

function paginateParagraphs(measureHost, paragraphs, maxHeight) {
  if (paragraphs.length === 0) return [[]];
  const pages = [];
  let currentPage = [];

  for (const paragraph of paragraphs) {
    if (fitsPage(measureHost, [...currentPage, paragraph], maxHeight)) {
      currentPage.push(paragraph);
      continue;
    }

    if (currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
    }

    let remaining = Array.from(paragraph.text);
    let consumedOffset = 0;
    while (remaining.length > 0) {
      const fittingLength = findFittingPrefixLength(measureHost, remaining, maxHeight);
      if (fittingLength >= remaining.length) {
        currentPage = [{
          ...paragraph,
          text: remaining.join(""),
          startOffset: paragraph.startOffset + consumedOffset,
        }];
        remaining = [];
        break;
      }

      const breakLength = findNaturalBreakLength(remaining, fittingLength);
      const rawText = remaining.slice(0, breakLength).join("");
      pages.push([{
        ...paragraph,
        text: rawText.trimEnd(),
        startOffset: paragraph.startOffset + consumedOffset,
      }]);
      consumedOffset += rawText.length;
      remaining = remaining.slice(breakLength);
      while (/^\s$/.test(remaining[0] || "")) {
        consumedOffset += remaining.shift().length;
      }
    }
  }

  if (currentPage.length > 0) pages.push(currentPage);
  return pages.length > 0 ? pages : [[]];
}

function findFittingPrefixLength(measureHost, characters, maxHeight) {
  let low = 1;
  let high = characters.length;
  let best = 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (fitsPage(measureHost, [{ text: characters.slice(0, middle).join("") }], maxHeight)) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function findNaturalBreakLength(characters, fittingLength) {
  const minimum = Math.max(1, fittingLength - 32);
  for (let index = fittingLength - 1; index >= minimum; index -= 1) {
    if (/[\s，。！？；：、,.!?;:）】》]/.test(characters[index])) return index + 1;
  }
  return Math.max(1, fittingLength);
}

function fitsPage(measureHost, paragraphs, maxHeight) {
  measureHost.replaceChildren(
    ...paragraphs.map((paragraph) => {
      const node = document.createElement("p");
      node.className = "text-book-paragraph";
      node.textContent = paragraph.text;
      return node;
    })
  );
  return measureHost.scrollHeight <= maxHeight;
}

function buildPageHighlightRanges(paragraphs, highlights, pageNumber) {
  const activeHighlights = highlights.filter(
    (highlight) =>
      Number(highlight?.pageNumber) === Number(pageNumber) &&
      !highlight?.highlightDisabled &&
      normalizeSelectedText(toText(highlight?.text))
  );
  if (activeHighlights.length === 0) return new Map();

  const normalizedParagraphs = [];
  let pageText = "";

  paragraphs.forEach((paragraph) => {
    const normalized = normalizeTextWithOffsets(paragraph.text);
    if (!normalized.text) return;
    if (pageText) pageText += " ";
    const pageStart = pageText.length;
    pageText += normalized.text;
    normalizedParagraphs.push({
      ...normalized,
      paragraphIndex: paragraph.paragraphIndex,
      pageStart,
      pageEnd: pageText.length,
    });
  });

  const rangesByParagraph = new Map();
  activeHighlights.forEach((highlight) => {
    const quote = normalizeSelectedText(toText(highlight.text));
    const matchStart = pageText.indexOf(quote);
    if (matchStart < 0) return;
    const matchEnd = matchStart + quote.length;

    normalizedParagraphs.forEach((paragraph) => {
      const overlapStart = Math.max(matchStart, paragraph.pageStart);
      const overlapEnd = Math.min(matchEnd, paragraph.pageEnd);
      if (overlapStart >= overlapEnd) return;

      const localStart = overlapStart - paragraph.pageStart;
      const localEnd = overlapEnd - paragraph.pageStart;
      const start = paragraph.starts[localStart];
      const end = paragraph.ends[localEnd - 1];
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return;

      const ranges = rangesByParagraph.get(paragraph.paragraphIndex) || [];
      ranges.push({ start, end });
      rangesByParagraph.set(paragraph.paragraphIndex, ranges);
    });
  });

  rangesByParagraph.forEach((ranges, paragraphIndex) => {
    rangesByParagraph.set(paragraphIndex, mergeHighlightRanges(ranges));
  });
  return rangesByParagraph;
}

function normalizeTextWithOffsets(value) {
  const source = toText(value);
  let text = "";
  const starts = [];
  const ends = [];
  let pendingSpace = null;

  for (let index = 0; index < source.length;) {
    const character = String.fromCodePoint(source.codePointAt(index));
    const end = index + character.length;
    if (/\s/.test(character)) {
      if (text && !pendingSpace) pendingSpace = { start: index, end };
      else if (pendingSpace) pendingSpace.end = end;
    } else {
      if (pendingSpace) {
        text += " ";
        starts.push(pendingSpace.start);
        ends.push(pendingSpace.end);
        pendingSpace = null;
      }
      text += character;
      starts.push(index);
      ends.push(end);
    }
    index = end;
  }

  return { text, starts, ends };
}

function mergeHighlightRanges(ranges) {
  return [...ranges]
    .sort((left, right) => left.start - right.start)
    .reduce((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);
}

function renderHighlightedParagraph(paragraph, rangesByParagraph) {
  const segmentStart = paragraph.startOffset;
  const segmentEnd = segmentStart + paragraph.text.length;
  const ranges = (rangesByParagraph.get(paragraph.paragraphIndex) || [])
    .map((range) => ({
      start: Math.max(range.start, segmentStart) - segmentStart,
      end: Math.min(range.end, segmentEnd) - segmentStart,
    }))
    .filter((range) => range.start < range.end);
  if (ranges.length === 0) return paragraph.text;

  const content = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (cursor < range.start) content.push(paragraph.text.slice(cursor, range.start));
    content.push(
      <mark key={`${range.start}-${range.end}-${index}`} className="text-reading-highlight">
        {paragraph.text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < paragraph.text.length) content.push(paragraph.text.slice(cursor));
  return content;
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
