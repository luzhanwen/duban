import { isTauriRuntime } from "./runtime.js";
import { sanitizeDiagnosticText } from "./aiDiagnostics.js";

export function isDesktopDiagnosticsAvailable() {
  return isTauriRuntime();
}

export async function runDiagnosticHealthCheck() {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持桌面诊断健康检查。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("duban_diagnostics_health_check");
}

export async function exportDiagnosticPackage() {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持导出桌面诊断包。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("duban_diagnostics_export_package");
}

export function isDiagnosticIssueEntry(entry) {
  return Boolean(
    entry &&
      (entry.status !== "success" ||
        entry.errorCode ||
        entry.errorMessage ||
        entry.httpStatus ||
        entry.truncated)
  );
}

export function findLatestDiagnosticIssueEntry(diagnostics) {
  const entries = Array.isArray(diagnostics?.entries) ? diagnostics.entries : [];
  return entries.find(isDiagnosticIssueEntry) || null;
}

export function buildDiagnosticErrorDetails(entry) {
  if (!entry) return "";
  const lines = [
    "读伴 AI 调用错误详情",
    `时间：${sanitizeDiagnosticText(entry.startedAt || entry.endedAt || "未记录", 80)}`,
    `任务：${sanitizeDiagnosticText(entry.taskLabel || entry.taskType || "AI 请求", 80)}`,
    `状态：${sanitizeDiagnosticText(entry.status || "unknown", 40)}`,
    `供应商：${sanitizeDiagnosticText(entry.provider || "未记录", 80)}`,
    `模型：${sanitizeDiagnosticText(entry.model || "未记录", 120)}`,
  ];

  if (entry.baseUrlOrigin) {
    lines.push(`Base URL origin：${sanitizeDiagnosticText(entry.baseUrlOrigin, 180)}`);
  }
  if (entry.errorCode) {
    lines.push(`错误码：${sanitizeDiagnosticText(entry.errorCode, 80)}`);
  }
  if (entry.errorKind) {
    lines.push(`错误类型：${sanitizeDiagnosticText(entry.errorKind, 80)}`);
  }
  if (entry.httpStatus) {
    lines.push(`HTTP 状态：${Number(entry.httpStatus) || ""}`);
  }
  if (entry.retryable) {
    lines.push("可重试：是");
  }
  if (entry.finishReason) {
    lines.push(`结束原因：${sanitizeDiagnosticText(entry.finishReason, 80)}`);
  }
  if (entry.truncated) {
    lines.push("输出截断：是");
  }
  if (entry.errorMessage) {
    lines.push(`错误文案：${sanitizeDiagnosticText(entry.errorMessage, 180)}`);
  }

  lines.push(`耗时：${Number(entry.durationMs) || 0}ms`);
  lines.push(`输入 token：${Number(entry.inputTokens) || 0}`);
  lines.push(`输出 token：${Number(entry.outputTokens) || 0}`);
  lines.push(`费用估算：${Number(entry.actualCost || entry.estimatedCost || 0) || 0}`);
  lines.push(`尝试次数：${Number(entry.attempts) || 0}`);
  lines.push("说明：以上内容为脱敏摘要，不包含 API Key、prompt、正文、笔记或聊天全文。");

  return lines.filter(Boolean).join("\n");
}

export async function copyDiagnosticText(text) {
  if (!text) {
    throw new Error("没有可复制的诊断内容。");
  }
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}
