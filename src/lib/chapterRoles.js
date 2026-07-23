import { cleanText } from "./text.js";

export function guessChapterRole(title) {
  const normalized = normalizeChapterTitle(title).toLowerCase();
  const compact = normalized.replace(/\s+/g, "");

  if (
    /^(copyright(?:\s+(?:information|page|notice))?|contents|table of contents|colophon)$/.test(
      normalized
    ) ||
    /^(目录(?:页)?|版权(?:信息|页|声明|说明)?|出版信息|书名页|扉页)$/.test(compact)
  ) {
    return "ignore";
  }

  if (
    /^(preface|foreword|prologue|welcome|about this publication|about this book|introduction to)/.test(
      normalized
    ) ||
    /^(导读|前言|序言|序|自序|代序|译序|编者序|作者序|引言|内容简介)/.test(compact) ||
    /(?:出版说明|出版缘起|再版说明|修订说明|增订说明)$/.test(compact)
  ) {
    return "guide";
  }

  if (
    /^(appendix|appendices|glossary|references|bibliography|index|acknowledg(e)?ments)/.test(
      normalized
    ) ||
    /^(附录|术语表|参考文献|参考书目|参考资料|文献目录|索引|致谢|后记|跋)/.test(compact)
  ) {
    return "appendix";
  }

  return "main";
}

export function defaultChapterIncluded(role) {
  return role === "guide" || role === "main";
}

export function isChapterIncluded(chapter) {
  if (typeof chapter?.includeInReading === "boolean") return chapter.includeInReading;
  return defaultChapterIncluded(chapter?.role || guessChapterRole(chapter?.title));
}

export function normalizeChapterReadingChoice(chapter = {}) {
  const guessedRole = guessChapterRole(chapter.title);
  const savedRole = chapter.role || "";
  const shouldRepairAutomaticRole =
    !chapter.roleConfirmed &&
    chapter.source !== "manual" &&
    (!savedRole || (savedRole === "main" && guessedRole !== "main"));
  const role = shouldRepairAutomaticRole ? guessedRole : savedRole || guessedRole;
  const shouldRepairAutomaticInclusion =
    shouldRepairAutomaticRole && !chapter.includeInReadingConfirmed;

  return {
    ...chapter,
    role,
    includeInReading:
      shouldRepairAutomaticInclusion
        ? defaultChapterIncluded(role)
        : typeof chapter.includeInReading === "boolean"
        ? chapter.includeInReading
        : defaultChapterIncluded(role),
  };
}

export function normalizeChapterReadingChoices(chapters = []) {
  let reachedAppendix = false;

  return chapters.map((chapter) => {
    let normalized = normalizeChapterReadingChoice(chapter);
    const shouldStayInBackMatter =
      reachedAppendix &&
      normalized.role === "main" &&
      !chapter.roleConfirmed &&
      chapter.source !== "manual";

    if (shouldStayInBackMatter) {
      normalized = {
        ...normalized,
        role: "appendix",
        includeInReading: chapter.includeInReadingConfirmed
          ? normalized.includeInReading
          : false,
      };
    }

    if (normalized.role === "appendix") reachedAppendix = true;
    return normalized;
  });
}

function normalizeChapterTitle(value) {
  return cleanText(value)
    .replace(/[·•●]+/g, "")
    .trim();
}
