import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { readFileAsArrayBuffer } from "./fileAdapter.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderPdfFirstPageCover(file, { maxWidth = 520 } = {}) {
  const data = await readFileAsArrayBuffer(file);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / viewport.width);
    const coverViewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) throw new Error("当前浏览器无法生成封面。");

    canvas.width = Math.ceil(coverViewport.width);
    canvas.height = Math.ceil(coverViewport.height);
    await page.render({ canvasContext: context, viewport: coverViewport }).promise;

    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    await pdf.destroy();
  }
}
