import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { getBookFile } from "../lib/books.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfReader({
  bookId,
  startPage,
  endPage,
  onCurrentPageChange,
  onAskSelection,
}) {
  const containerRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectionToolbar, setSelectionToolbar] = useState(null);

  const pageNumbers = useMemo(() => {
    if (!pdf) return [];
    const start = Math.max(1, Number(startPage) || 1);
    const end = Math.min(pdf.numPages, Math.max(start, Number(endPage) || start));
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [pdf, startPage, endPage]);

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

        const data = await file.arrayBuffer();
        loadingTask = pdfjsLib.getDocument({ data });
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
    if (!node || pageNumbers.length === 0 || !onCurrentPageChange) return undefined;

    onCurrentPageChange(pageNumbers[0]);

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
        if (best) onCurrentPageChange(best[0]);
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
  }, [pageNumbers, onCurrentPageChange]);

  useEffect(() => {
    setSelectionToolbar(null);
  }, [bookId, startPage, endPage]);

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

      const textLayer = findClosestElement(range.commonAncestorContainer, ".textLayer");
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
            onClick={() => handleSelectionAction("explain")}
            className="rounded-full bg-accent px-3 py-1.5 text-white hover:opacity-90"
          >
            解释这句
          </button>
          <button
            type="button"
            onClick={() => handleSelectionAction("ask")}
            className="rounded-full px-3 py-1.5 text-ink-soft hover:bg-paper"
          >
            问导师
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function PdfPage({ pdf, pageNumber, containerWidth }) {
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
