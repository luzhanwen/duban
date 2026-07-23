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
  return buildDiagnosticEntryDetails(entry, "读伴 AI 调用错误详情");
}

export function buildDiagnosticEntryDetails(entry, heading = "读伴 AI 调用诊断摘要") {
  if (!entry) return "";
  const lines = [
    heading,
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
  appendContextDetails(lines, entry.context);
  lines.push("说明：以上内容为脱敏摘要，不包含 API Key、prompt、正文、笔记或聊天全文。");

  return lines.filter(Boolean).join("\n");
}

function appendContextDetails(lines, context) {
  if (!context) return;
  lines.push("", "本次上下文");
  lines.push(`场景：${formatScene(context.scene)}`);
  lines.push(`缓存：${formatCache(context.cache)}`);
  lines.push(
    `选入材料：${Number(context.budget?.sourceCount) || 0} 项，${Number(context.budget?.usedContextChars) || 0} / ${Number(context.budget?.maxContextChars) || 0} 字符`
  );
  lines.push(
    `排除材料：${Number(context.budget?.excludedCount) || 0} 项；输出上限：${Number(context.budget?.maxOutputTokens) || 0} token`
  );
  lines.push(`阅读规则：${formatPolicy(context.policy)}`);
  for (const source of context.sources || []) {
    lines.push(
      `- ${formatSourceKind(source.kind)}${formatSourcePage(source)}，${Number(source.charCount) || 0} 字符${source.compacted ? "，已压缩" : ""}${source.truncated ? "，已截短" : ""}`
    );
  }
  for (const excluded of context.exclusions || []) {
    lines.push(
      `- 未带入：${formatSourceKind(excluded.kind)}，原因 ${formatExclusionReason(excluded.reason)}，${Number(excluded.count) || 0} 项`
    );
  }
}

function formatScene(value) {
  return {
    readingGuide: "章节导读",
    readingChat: "伴读问答",
    readingReflection: "读后交流",
  }[value] || "未记录";
}

function formatCache(cache) {
  if (!cache?.kind) return "未记录";
  if (!cache.hit) return "未命中，已重新整理材料";
  return cache.kind === "guide-artifact" ? "命中已生成导读" : "命中上下文缓存";
}

function formatPolicy(policy = {}) {
  const spoiler = { avoid: "仅使用已读内容", hint: "不透露后文", allow: "允许讨论后文" }[
    policy.spoiler
  ];
  const depth = { concise: "简要回答", balanced: "标准回答", deep: "详细回答" }[
    policy.answerDepth
  ];
  const followUp = { never: "不追问", helpful: "信息不足时追问", always: "回答后追问" }[
    policy.followUp
  ];
  const boundary = { book: "仅限书中", text_first: "以书为主", open: "可补充外部知识" }[
    policy.knowledgeBoundary
  ];
  return [spoiler, depth, followUp, boundary].filter(Boolean).join("；") || "未记录";
}

function formatSourceKind(value) {
  return {
    selection: "用户选中的原文",
    current_page: "当前页",
    prior_reading: "已读内容",
    target_item: "当前阅读项",
    open_item: "允许带入的当前阅读项",
    completed_item: "已完成阅读项",
    guide: "导读",
    history_user: "用户历史提问",
    history_assistant: "读伴历史回答",
    reading_chat_user: "伴读提问",
    reading_chat_assistant: "伴读回答",
    reading_note: "阅读笔记",
    memory: "用户确认的本书记忆",
    unread_item: "未读正文",
    assistant_history: "旧模型回答",
    contract_key_turn: "全书关键转折",
    contract_reading_path: "全书阅读路径",
  }[value] || "其他材料";
}

function formatSourcePage(source) {
  if (!source?.pageNumber) return "";
  if (source.pageEnd && source.pageEnd !== source.pageNumber) {
    return `（第 ${source.pageNumber}-${source.pageEnd} 页）`;
  }
  return `（第 ${source.pageNumber} 页）`;
}

function formatExclusionReason(value) {
  return {
    "spoiler-policy": "阅读边界限制",
    "reading-frontier": "尚未确认读到",
    "context-budget": "超过上下文预算",
    "memory-scope": "与本次问题或阅读位置不符",
    "empty-source": "没有可用文本",
  }[value] || "未满足本次选材条件";
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
