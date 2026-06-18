import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { getBookFile } from "../lib/books.js";
import { getLocalFileAssetUrl, readFileAsArrayBuffer } from "../lib/fileAdapter.js";
import { BrandName } from "./BrandLogo.jsx";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfReader({
  bookId,
  startPage,
  endPage,
  initialPage,
  readingMode = "scroll",
  activePage,
  highlights = [],
  onCurrentPageChange,
  onAskSelection,
}) {
  const containerRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectionToolbar, setSelectionToolbar] = useState(null);
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  const pageMode = readingMode === "page";

  const allPageNumbers = useMemo(() => {
    if (!pdf) return [];
    const start = Math.max(1, Number(startPage) || 1);
    const end = Math.min(pdf.numPages, Math.max(start, Number(endPage) || start));
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [pdf, startPage, endPage]);

  const pagedPageNumber = useMemo(
    () => getInitialPageInRange(activePage || initialPage, allPageNumbers),
    [activePage, allPageNumbers, initialPage]
  );

  const pageNumbers = useMemo(
    () => (pageMode ? (Number.isFinite(pagedPageNumber) ? [pagedPageNumber] : []) : allPageNumbers),
    [allPageNumbers, pageMode, pagedPageNumber]
  );

  const highlightsByPage = useMemo(() => {
    return highlights.reduce((groups, highlight) => {
      const pageNumber = Number(highlight.pageNumber);
      if (!Number.isFinite(pageNumber)) return groups;
      groups[pageNumber] = [...(groups[pageNumber] || []), highlight];
      return groups;
    }, {});
  }, [highlights]);

  useEffect(() => {
    onCurrentPageChangeRef.current = onCurrentPageChange;
  }, [onCurrentPageChange]);

  useEffect(() => {
    let alive = true;
    let loadingTask = null;

    async function loadPdf() {
      setLoading(true);
      setError("");
      setPdf(null);

      try {
        const file = await getBookFile(bookId);
        if (!file) throw new Error("没有找到原始 PDF 文件。");

        const url = getLocalFileAssetUrl(file);
        loadingTask = url
          ? pdfjsLib.getDocument({ url })
          : pdfjsLib.getDocument({ data: await readFileAsArrayBuffer(file) });
        const loadedPdf = await loadingTask.promise;
        if (alive) setPdf(loadedPdf);
      } catch (e) {
        if (alive) setError(e.message || "PDF 渲染失败，请稍后重试。");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadPdf();
    return () => {
      alive = false;
      loadingTask?.destroy?.();
    };
  }, [bookId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    function updateWidth() {
      setContainerWidth(Math.max(320, node.clientWidth));
    }

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || pageNumbers.length === 0 || !onCurrentPageChangeRef.current) return undefined;

    const firstVisiblePage = getInitialPageInRange(initialPage, pageNumbers);
    onCurrentPageChangeRef.current(firstVisiblePage);

    const visiblePages = new Map();
    const root = getScrollParent(node);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number(entry.target.getAttribute("data-page-number"));
          if (!Number.isFinite(pageNumber)) continue;

          if (entry.isIntersecting) {
            visiblePages.set(pageNumber, entry.intersectionRect.height);
          } else {
            visiblePages.delete(pageNumber);
          }
        }

        const best = [...visiblePages.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) onCurrentPageChangeRef.current?.(best[0]);
      },
      {
        root,
        rootMargin: "-10% 0px -35% 0px",
        threshold: [0, 0.15, 0.35, 0.55, 0.75, 1],
      }
    );

    const pageNodes = pageNumbers
      .map((pageNumber) => node.querySelector(`[data-page-number="${pageNumber}"]`))
      .filter(Boolean);
    pageNodes.forEach((pageNode) => observer.observe(pageNode));

    return () => observer.disconnect();
  }, [pageNumbers, initialPage]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || pageNumbers.length === 0 || !initialPage) return;

    const pageNumber = getInitialPageInRange(initialPage, pageNumbers);
    const target = node.querySelector(`[data-page-number="${pageNumber}"]`);
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
    });
  }, [pageNumbers, initialPage]);

  useEffect(() => {
    setSelectionToolbar(null);
  }, [activePage, bookId, readingMode, startPage, endPage]);

  function updateSelectionToolbar(event) {
    if (event?.target?.closest?.(".pdf-selection-toolbar")) return;

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
      const startPageNode = findClosestPageNode(range.startContainer);
      const endPageNode = findClosestPageNode(range.endContainer);
      if (!startPageNode || !node.contains(startPageNode) || !node.contains(endPageNode)) {
        setSelectionToolbar(null);
        return;
      }

      const textLayer =
        findClosestElement(range.commonAncestorContainer, ".textLayer") ||
        findClosestElement(range.startContainer, ".textLayer");
      if (!textLayer && !findClosestElement(range.startContainer, ".textLayer")) {
        setSelectionToolbar(null);
        return;
      }

      const rect = getUsefulSelectionRect(range);
      if (!rect) {
        setSelectionToolbar(null);
        return;
      }

      const pageNumber = Number(startPageNode.getAttribute("data-page-number")) || null;
      setSelectionToolbar({
        text,
        pageNumber,
        rects: getSelectionHighlightRects(range, textLayer),
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
      rects: selectionToolbar.rects,
    });
    setSelectionToolbar(null);
    window.getSelection?.()?.removeAllRanges?.();
  }

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-5xl"
      onMouseUp={updateSelectionToolbar}
      onKeyUp={updateSelectionToolbar}
    >
      {loading && (
        <div className="rounded-xl border border-line bg-paper px-6 py-12 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="mt-4 text-sm text-ink-soft">正在打开 PDF 原版页面…</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-line bg-paper px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-8 pb-8">
          {pageNumbers.map((pageNumber) => (
            <PdfPage
              key={pageNumber}
              pdf={pdf}
              pageNumber={pageNumber}
              containerWidth={containerWidth}
              highlights={highlightsByPage[pageNumber] || []}
            />
          ))}
        </div>
      )}

      {selectionToolbar && (
        <div
          className="pdf-selection-toolbar fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-paper-card p-1 text-xs shadow-lg"
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

function normalizeSelectedText(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1200);
}

function findClosestElement(node, selector) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest?.(selector) || null;
}

function findClosestPageNode(node) {
  return findClosestElement(node, "[data-page-number]");
}

function getUsefulSelectionRect(range) {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0
  );
  return rects[0] || (range.getBoundingClientRect?.().width ? range.getBoundingClientRect() : null);
}

function getSelectionHighlightRects(range, textLayer) {
  if (!range || !textLayer) return [];

  const layerRect = textLayer.getBoundingClientRect();
  if (!layerRect.width || !layerRect.height) return [];

  return mergeHighlightRects(
    Array.from(range.getClientRects())
    .map((rect) => {
      const left = clamp(rect.left - layerRect.left, 0, layerRect.width);
      const right = clamp(rect.right - layerRect.left, 0, layerRect.width);
      const top = clamp(rect.top - layerRect.top, 0, layerRect.height);
      const bottom = clamp(rect.bottom - layerRect.top, 0, layerRect.height);
      return {
        x: left / layerRect.width,
        y: top / layerRect.height,
        width: (right - left) / layerRect.width,
        height: (bottom - top) / layerRect.height,
      };
    })
    .filter((rect) => rect.width > 0.001 && rect.height > 0.001)
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getInitialPageInRange(initialPage, pageNumbers) {
  const fallback = pageNumbers[0];
  const pageNumber = Number(initialPage);
  if (!Number.isFinite(pageNumber)) return fallback;
  const min = pageNumbers[0];
  const max = pageNumbers[pageNumbers.length - 1];
  return clamp(pageNumber, min, max);
}

function getScrollParent(node) {
  let current = node?.parentElement;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function PdfPage({ pdf, pageNumber, containerWidth, highlights }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [pageSize, setPageSize] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let renderTask = null;
    let textLayer = null;

    async function renderPage() {
      if (!pdf || !canvasRef.current || !textLayerRef.current) return;

      setStatus("loading");
      setError("");
      setPageSize(null);
      textLayerRef.current.textContent = "";

      try {
        const page = await pdf.getPage(pageNumber);
        if (!alive || !canvasRef.current || !textLayerRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const horizontalPadding = 32;
        const cssWidth = Math.max(280, containerWidth - horizontalPadding);
        const scale = cssWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        const textLayerNode = textLayerRef.current;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        textLayerNode.style.setProperty("--scale-factor", viewport.scale);
        setPageSize({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
        });

        const textContentSource = page.streamTextContent({
          includeMarkedContent: true,
          disableNormalization: true,
        });
        textLayer = new pdfjsLib.TextLayer({
          textContentSource,
          container: textLayerNode,
          viewport,
        });

        await Promise.all([renderTask.promise, textLayer.render()]);
        if (!alive || !textLayerRef.current) return;

        const endOfContent = document.createElement("div");
        endOfContent.className = "endOfContent";
        textLayerRef.current.append(endOfContent);

        applyPageHighlights(textLayerRef.current, highlights);
        if (alive) setStatus("ready");
      } catch (e) {
        if (!alive || e?.name === "RenderingCancelledException") return;
        setStatus("error");
        setError(e.message || "这一页渲染失败。");
      }
    }

    renderPage();
    return () => {
      alive = false;
      renderTask?.cancel?.();
      textLayer?.cancel?.();
    };
  }, [pdf, pageNumber, containerWidth]);

  useEffect(() => {
    if (!textLayerRef.current || status !== "ready") return;
    applyPageHighlights(textLayerRef.current, highlights);
  }, [highlights, status]);

  return (
    <section
      id={`pdf-page-${pageNumber}`}
      data-page-number={pageNumber}
      aria-label={`第 ${pageNumber} 页`}
      className="scroll-mt-6"
    >
      <div className="mb-3 text-center text-xs text-ink-soft">第 {pageNumber} 页</div>
      <div className="relative min-h-60 overflow-x-auto rounded-lg bg-white p-3 shadow-sm ring-1 ring-line">
        <div
          className="relative mx-auto"
          style={{
            width: pageSize ? `${pageSize.width}px` : "100%",
            height: pageSize ? `${pageSize.height}px` : "10rem",
          }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 block" />
          <div ref={textLayerRef} className="textLayer" />
        </div>
        {status === "loading" && (
          <div className="absolute inset-3 flex min-h-40 items-center justify-center rounded bg-white/80">
            <p className="text-sm text-ink-soft">正在渲染第 {pageNumber} 页…</p>
          </div>
        )}
        {status === "error" && (
          <p className="px-6 py-8 text-center text-sm text-red-600">{error}</p>
        )}
      </div>
    </section>
  );
}

function applyPageHighlights(textLayerNode, highlights) {
  if (!textLayerNode) return;

  textLayerNode.querySelectorAll(".reading-highlight-mark").forEach((mark) => mark.remove());

  const spans = Array.from(textLayerNode.querySelectorAll("span")).filter((span) =>
    normalizeForHighlight(span.textContent)
  );

  for (const span of spans) {
    span.classList.remove("reading-highlight");
  }

  const index = buildTextLayerIndex(spans);
  const rectHighlights = [];
  for (const highlight of highlights) {
    if (highlight.highlightDisabled) continue;

    if (Array.isArray(highlight.rects) && highlight.rects.length > 0) {
      rectHighlights.push(...highlight.rects);
      continue;
    }

    const text = normalizeForHighlight(highlight.text);
    if (!text) continue;

    const start = findHighlightStart(index.fullText, text);
    if (start < 0) continue;

    const end = start + text.length;
    for (const item of index.ranges) {
      if (item.end <= start || item.start >= end) continue;
      item.span.classList.add("reading-highlight");
    }
  }

  renderHighlightRects(textLayerNode, rectHighlights);
}

function renderHighlightRects(textLayerNode, rects) {
  for (const rect of mergeHighlightRects(rects)) {
    const markRect = insetHighlightRect(rect);
    const mark = document.createElement("div");
    mark.className = "reading-highlight-mark";
    mark.style.left = `${clampRatio(markRect.x) * 100}%`;
    mark.style.top = `${clampRatio(markRect.y) * 100}%`;
    mark.style.width = `${clampRatio(markRect.width) * 100}%`;
    mark.style.height = `${clampRatio(markRect.height) * 100}%`;
    textLayerNode.append(mark);
  }
}

function insetHighlightRect(rect) {
  const height = clampRatio(rect.height);
  const verticalInset = Math.min(height * 0.2, 0.004);
  return {
    x: rect.x,
    y: rect.y + verticalInset,
    width: rect.width,
    height: Math.max(0.001, height - verticalInset * 2),
  };
}

function mergeHighlightRects(rects) {
  const normalized = rects
    .map((rect) => ({
      x: clampRatio(rect.x),
      y: clampRatio(rect.y),
      width: clampRatio(rect.width),
      height: clampRatio(rect.height),
    }))
    .filter((rect) => rect.width > 0.001 && rect.height > 0.001)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  const merged = [];
  const lineTolerance = 0.01;
  const gapTolerance = 0.008;

  for (const rect of normalized) {
    const previous = findMergeTarget(merged, rect, lineTolerance, gapTolerance);
    if (
      previous
    ) {
      const left = Math.min(previous.x, rect.x);
      const right = Math.max(previous.x + previous.width, rect.x + rect.width);
      const top = Math.min(previous.y, rect.y);
      const bottom = Math.max(previous.y + previous.height, rect.y + rect.height);
      previous.x = left;
      previous.y = top;
      previous.width = right - left;
      previous.height = bottom - top;
    } else {
      merged.push({ ...rect });
    }
  }

  return merged;
}

function findMergeTarget(rects, rect, lineTolerance, gapTolerance) {
  return rects.find((candidate) => {
    const sameLine =
      Math.abs(candidate.y - rect.y) <= lineTolerance ||
      rangesOverlap(candidate.y, candidate.y + candidate.height, rect.y, rect.y + rect.height);
    if (!sameLine) return false;

    const candidateRight = candidate.x + candidate.width;
    const rectRight = rect.x + rect.width;
    return rect.x <= candidateRight + gapTolerance && rectRight + gapTolerance >= candidate.x;
  });
}

function rangesOverlap(startA, endA, startB, endB) {
  return Math.min(endA, endB) - Math.max(startA, startB) > 0;
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function buildTextLayerIndex(spans) {
  let fullText = "";
  const ranges = [];

  for (const span of spans) {
    const text = normalizeForHighlight(span.textContent);
    if (!text) continue;
    if (fullText) fullText += " ";
    const start = fullText.length;
    fullText += text;
    ranges.push({ span, start, end: fullText.length });
  }

  return { fullText, ranges };
}

function findHighlightStart(fullText, selectedText) {
  const direct = fullText.indexOf(selectedText);
  if (direct >= 0) return direct;

  const snippet = selectedText.slice(0, 80).trim();
  return snippet ? fullText.indexOf(snippet) : -1;
}

function normalizeForHighlight(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
