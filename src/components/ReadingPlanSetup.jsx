import { useEffect, useMemo, useRef, useState } from "react";
import { BrandName, renderBrandNameText } from "./BrandLogo.jsx";
import ChineseIcon from "./ChineseIcon.jsx";
import ReadingCompanionScene from "./ReadingCompanionScene.jsx";
import { getBookPageUnitLabel } from "../lib/bookFormats.js";
import { getBook, getBookPages, updateBook } from "../lib/books.js";
import { isChapterIncluded } from "../lib/chapterRoles.js";
import { formatUsd } from "../lib/pricing.js";
import { isAiAbortError } from "../lib/aiCancellation.js";
import {
  READING_PLAN_CHUNKING_VERSION,
  splitChapterIntoPlanChunks,
} from "../lib/readingPlanChunks.js";
import { toText } from "../lib/text.js";
import {
  DEFAULT_FOCUS_OPTIONS,
  generateWholeBookGuide,
  normalizeWholeBookGuide,
} from "../lib/wholeBookGuide.js";

const PACE_OPTIONS = [
  {
    value: "light",
    title: "轻松",
    desc: "每次约 20 分钟，适合先稳定开始。",
    minutesPerSession: 20,
    maxPagesPerSession: 25,
  },
  {
    value: "standard",
    title: "标准",
    desc: "每次约 40 分钟，适合大多数非虚构阅读。",
    minutesPerSession: 40,
    maxPagesPerSession: 45,
  },
  {
    value: "deep",
    title: "深入",
    desc: "每次约 60 分钟，留出追问和笔记时间。",
    minutesPerSession: 60,
    maxPagesPerSession: 70,
  },
];

const WEEKDAYS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

const OPENING_STEPS = [
  {
    id: "guide",
    title: "设定读伴",
    desc: "确定陪读方式",
    icon: "ink",
  },
  {
    id: "pace",
    title: "阅读节奏",
    desc: "决定怎么读",
    icon: "pace",
  },
  {
    id: "plan",
    title: "计划预览",
    desc: "确认并保存",
    icon: "plan",
  },
];

const EMPTY_OPENING_ANSWERS = {
  context: "",
  curiosity: "",
  companion: "",
};

const DEFAULT_COMPANION_PROFILE = {
  name: "读伴",
  color: "sage",
  expression: "gentle",
};

const COMPANION_COLOR_OPTIONS = [
  {
    id: "sage",
    label: "青绿",
    accent: "#6f8a74",
    soft: "#eff6ed",
    ribbon: "#8a765f",
  },
  {
    id: "amber",
    label: "琥珀",
    accent: "#a87543",
    soft: "#fbf0df",
    ribbon: "#b98654",
  },
  {
    id: "rose",
    label: "浅玫",
    accent: "#a46f79",
    soft: "#fbedef",
    ribbon: "#b07a84",
  },
  {
    id: "ink",
    label: "墨蓝",
    accent: "#64788f",
    soft: "#eef3f8",
    ribbon: "#6b7f96",
  },
];

const OPENING_DIALOG_ROUNDS = [
  {
    id: "intro",
    stage: 0,
    title: "开始设置",
    message:
      "你好，我是读伴。回答几个简单的问题，我会按你的需要陪你读这本书。",
    actionLabel: "开始",
  },
  {
    id: "context",
    stage: 1,
    title: "阅读背景",
    message: "在开始阅读前，你对这本书或相关主题已经了解多少？",
    field: "context",
    placeholder:
      "比如：我以前在历史课本里见过这段时期，也听别人推荐过这本书，但一直没真正读进去。",
    suggestions: [
      "我以前听过这本书，但还没有真正读过。",
      "我对这本书相关的时代或话题有一点印象。",
      "我之前读这类书容易被名字、年份和概念劝退。",
    ],
    actionLabel: "继续",
  },
  {
    id: "curiosity",
    stage: 2,
    title: "阅读重点",
    message: "读这本书时，你最想了解或解决什么问题？",
    field: "curiosity",
    placeholder:
      "比如：我想知道这些历史事件和普通人的生活有什么关系，也想看制度为什么会这样运转。",
    suggestions: [
      "我想抓住这本书真正关心的问题。",
      "我想知道它和今天的生活或工作有什么关系。",
      "我想读出能写进笔记或文章里的东西。",
    ],
    actionLabel: "继续",
  },
  {
    id: "companion",
    stage: 3,
    title: "陪读方式",
    message: "阅读过程中，你希望读伴怎样协助你？",
    field: "companion",
    placeholder:
      "比如：少打断我，先帮我抓主线；我卡住时再补背景；读完一节后帮我整理成几句能记住的话。",
    suggestions: [
      "先抓主线，必要时再补背景。",
      "多用白话解释，不要一上来堆概念。",
      "读完后帮我沉淀成笔记和可复述的话。",
    ],
    actionLabel: "确认设置",
  },
  {
    id: "ready",
    stage: 4,
    title: "设置完成",
    message:
      "设置已经完成。保存后，可以继续安排阅读节奏。",
    actionLabel: "保存并继续",
  },
];

export default function ReadingPlanSetup({ bookId, onBack, onDone }) {
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [wholeBookGuide, setWholeBookGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideStartedAt, setGuideStartedAt] = useState(null);
  const [guideError, setGuideError] = useState("");
  const [guideNotice, setGuideNotice] = useState("");
  const [userIntent, setUserIntent] = useState("");
  const [openingAnswers, setOpeningAnswers] = useState(EMPTY_OPENING_ANSWERS);
  const [openingRound, setOpeningRound] = useState(0);
  const [companionProfile, setCompanionProfile] = useState(DEFAULT_COMPANION_PROFILE);
  const [paceMode, setPaceMode] = useState("standard");
  const [startDate, setStartDate] = useState(today());
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [splitLongChapters, setSplitLongChapters] = useState(true);
  const [focusType, setFocusType] = useState("mainline");
  const [customFocus, setCustomFocus] = useState("");
  const [activeStep, setActiveStep] = useState("guide");
  const [message, setMessage] = useState(null);
  const guideAbortRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const [savedBook, savedPages] = await Promise.all([getBook(bookId), getBookPages(bookId)]);
      if (!alive || !savedBook) return;

      const savedGuide = normalizeWholeBookGuide(savedBook.wholeBookGuide);
      const usableGuide = savedGuide?.status === "failed" ? null : savedGuide;
      const profile = savedBook.readingProfile || {};
      const profilePace = normalizePace(profile.pace);
      const profileFocus = profile.companionFocus || null;
      const guideAdvice = usableGuide?.planAdvice || {};
      const guideFocus = usableGuide?.companionFocusOptions?.[0] || null;

      setBook(savedBook);
      setPages(savedPages);
      setWholeBookGuide(usableGuide);
      setGuideError(savedGuide?.status === "failed" ? savedGuide.errorMessage : "");
      setPaceMode(profilePace.mode || guideAdvice.recommendedPace || "standard");
      setStartDate(profilePace.startDate || profile.startDate || today());
      setWeekdays(profilePace.weekdays || profile.weekdays || [1, 2, 3, 4, 5]);
      setSplitLongChapters(
        profilePace.splitLongChapters ?? guideAdvice.splitLongChapters ?? true
      );
      setFocusType(profileFocus?.type || guideFocus?.type || "mainline");
      setCustomFocus(profileFocus?.customFocus || "");
      const savedOpeningMessage = profileFocus?.openingMessage || profileFocus?.userText || "";
      const savedOpeningAnswers = normalizeOpeningAnswers(
        profileFocus?.openingAnswers,
        savedOpeningMessage
      );
      setOpeningAnswers(savedOpeningAnswers);
      setUserIntent(buildOpeningMessage(savedOpeningAnswers));
      setOpeningRound(savedOpeningMessage ? OPENING_DIALOG_ROUNDS.length - 1 : 0);
      setCompanionProfile(normalizeCompanionProfile(profileFocus?.companionProfile));
    }

    load();
    return () => {
      alive = false;
      cancelGuideGeneration();
    };
  }, [bookId]);

  const focusOptions = useMemo(() => {
    const options = wholeBookGuide?.companionFocusOptions?.length
      ? wholeBookGuide.companionFocusOptions
      : DEFAULT_FOCUS_OPTIONS;
    if (options.some((option) => option.type === "custom")) return options;
    return [
      ...options,
      {
        type: "custom",
        label: "我自己指定",
        description: "用一句话说明这本书主要想解决什么。",
        promptInstruction: "后续回答要围绕用户自定义的阅读目标展开。",
      },
    ];
  }, [wholeBookGuide]);

  const selectedFocus =
    focusOptions.find((option) => option.type === focusType) || focusOptions[0] || DEFAULT_FOCUS_OPTIONS[0];

  const selectedPace =
    PACE_OPTIONS.find((option) => option.value === paceMode) || PACE_OPTIONS[1];

  const planPreview = useMemo(() => {
    if (!book) return null;
    return buildPlanPreview({
      book,
      wholeBookGuide,
      pace: selectedPace,
      startDate,
      weekdays,
      splitLongChapters,
      selectedFocus,
    });
  }, [book, wholeBookGuide, selectedPace, startDate, weekdays, splitLongChapters, selectedFocus]);

  if (!book || !planPreview) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-ink-soft">
        正在读取书籍信息…
      </div>
    );
  }

  const pageUnitLabel = getBookPageUnitLabel(book);

  function toggleWeekday(value) {
    setWeekdays((current) => {
      if (current.includes(value) && current.length === 1) return current;
      if (current.includes(value)) return current.filter((day) => day !== value);
      return [...current, value].sort((a, b) => weekdayOrder(a) - weekdayOrder(b));
    });
  }

  async function handleGenerateGuide() {
    cancelGuideGeneration();
    const controller = new AbortController();
    const previousGuide = wholeBookGuide;
    const openingMessage = buildOpeningMessage(openingAnswers) || userIntent;
    guideAbortRef.current = controller;
    setGuideError("");
    setGuideNotice("");
    setMessage(null);
    setGuideLoading(true);
    setGuideStartedAt(Date.now());
    try {
      const generated = await generateWholeBookGuide({
        book,
        pages,
        userIntent: openingMessage,
        signal: controller.signal,
      });
      const normalized = normalizeWholeBookGuide(generated);
      setWholeBookGuide(normalized);
      setBook((current) => (current ? { ...current, wholeBookGuide: normalized } : current));
      if (normalized?.planAdvice?.recommendedPace) {
        setPaceMode(normalized.planAdvice.recommendedPace);
      }
      setSplitLongChapters(normalized?.planAdvice?.splitLongChapters ?? true);
      if (normalized?.companionFocusOptions?.[0]?.type) {
        setFocusType(normalized.companionFocusOptions[0].type);
      }
      setGuideNotice("读伴地图已准备好，后续陪读会参考它。");
    } catch (e) {
      if (isAiAbortError(e)) {
        setWholeBookGuide(previousGuide);
      } else {
        setGuideError(e.message || "整本书导读生成失败，请稍后重试。");
      }
    } finally {
      if (guideAbortRef.current === controller) {
        guideAbortRef.current = null;
        setGuideLoading(false);
        setGuideStartedAt(null);
      }
    }
  }

  function cancelGuideGeneration() {
    guideAbortRef.current?.abort();
  }

  async function handleSave() {
    const now = new Date().toISOString();
    const openingMessage = buildOpeningMessage(openingAnswers) || userIntent;
    const companionFocus = buildCompanionFocus({
      selectedFocus,
      customFocus,
      openingMessage,
      openingAnswers,
      companionProfile,
      now,
      fromGuide: Boolean(wholeBookGuide),
    });
    const existingProfile = book.readingProfile || null;
    const readingProfile = {
      schemaVersion: 2,
      onboardingMode: "ai_book_opening",
      purpose: legacyPurposeFromFocus(companionFocus.type),
      pace: {
        mode: selectedPace.value,
        minutesPerSession: selectedPace.minutesPerSession,
        sessionsPerWeek: weekdays.length,
        weekdays,
        startDate,
        targetFinishDate: null,
        splitLongChapters,
        maxPagesPerSession: selectedPace.maxPagesPerSession,
      },
      startDate,
      weekdays,
      companionFocus,
      wholeBookGuide: {
        status: wholeBookGuide ? "ready" : "missing",
        generatedAt: wholeBookGuide?.generatedAt || null,
      },
      legacy: existingProfile?.schemaVersion === 2 ? existingProfile.legacy || null : existingProfile,
      updatedAt: now,
    };

    const readingPlan = {
      status: "draft",
      chunkingVersion: READING_PLAN_CHUNKING_VERSION,
      generatedBy: wholeBookGuide ? "local_opening" : "local_fallback",
      summary: planPreview.summary,
      items: planPreview.items,
      updatedAt: now,
    };

    await updateBook(book.id, {
      readingProfile,
      readingPlan,
      wholeBookGuide: wholeBookGuide || book.wholeBookGuide || null,
      status: "planned",
    });

    setMessage({ type: "ok", text: "读伴设定已保存，阅读计划也准备好了。" });
    if (onDone) onDone(book.id);
  }

  const activeStepIndex = Math.max(
    0,
    OPENING_STEPS.findIndex((step) => step.id === activeStep)
  );
  const canGoBackStep = activeStepIndex > 0;
  const canGoNextStep = activeStepIndex < OPENING_STEPS.length - 1;

  function goToStep(stepId) {
    setMessage(null);
    setActiveStep(stepId);
  }

  function updateOpeningAnswer(field, value) {
    setOpeningAnswers((current) => {
      const next = { ...current, [field]: value };
      setUserIntent(buildOpeningMessage(next));
      if (field === "companion" && focusType === "custom") {
        setCustomFocus(value);
      }
      return next;
    });
  }

  function addOpeningSuggestion(field, text) {
    updateOpeningAnswer(field, appendOpeningAnswer(openingAnswers[field], text));
  }

  function goPreviousOpeningRound() {
    setOpeningRound((current) => Math.max(0, current - 1));
  }

  function goNextOpeningRound() {
    setOpeningRound((current) =>
      Math.min(OPENING_DIALOG_ROUNDS.length - 1, current + 1)
    );
  }

  function goPreviousStep() {
    if (!canGoBackStep) return;
    goToStep(OPENING_STEPS[activeStepIndex - 1].id);
  }

  function goNextStep() {
    if (!canGoNextStep) return;
    goToStep(OPENING_STEPS[activeStepIndex + 1].id);
  }

  const isCompanionOpening = activeStep === "guide";

  return (
    <div
      className={`opening-page mx-auto px-6 py-10 ${
        isCompanionOpening ? "opening-page-companion max-w-5xl" : "max-w-6xl"
      }`}
    >
      <button
        onClick={onBack}
        className={
          isCompanionOpening
            ? "opening-companion-back"
            : "text-sm text-accent underline"
        }
      >
        返回书籍信息
      </button>

      {!isCompanionOpening && (
        <>
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm text-ink-soft">设定读伴</p>
              <h2 className="mt-1 font-serif text-3xl text-ink">{toText(book.title)}</h2>
              {toText(book.author) && (
                <p className="mt-2 text-sm text-ink-soft">{toText(book.author)}</p>
              )}
            </div>
            <div className="opening-summary-grid">
              <OpeningSummaryTile label="正文" value={`${planPreview.mainCount} 章`} />
              <OpeningSummaryTile label="计划" value={`${planPreview.items.length} 个阅读日`} />
              <OpeningSummaryTile
                label="地图"
                value={guideLoading ? "准备中" : wholeBookGuide ? "已准备" : "可选"}
              />
            </div>
          </div>

          <OpeningStepTabs
            steps={OPENING_STEPS}
            activeStep={activeStep}
            activeStepIndex={activeStepIndex}
            guideLoading={guideLoading}
            hasGuide={Boolean(wholeBookGuide)}
            onChange={goToStep}
          />
        </>
      )}

      <section
        className={isCompanionOpening ? "opening-companion-panel mt-5" : "opening-panel mt-6"}
        key={activeStep}
      >
        {activeStep === "guide" && (
          <div>
            <OpeningCompanionIntro
              bookTitle={toText(book.title)}
              openingAnswers={openingAnswers}
              openingRound={openingRound}
              onChangeAnswer={updateOpeningAnswer}
              onAddSuggestion={addOpeningSuggestion}
              companionProfile={companionProfile}
              onPreviousRound={goPreviousOpeningRound}
              onNextRound={goNextOpeningRound}
              onFinish={goNextStep}
            />
          </div>
        )}

        {activeStep === "pace" && (
          <>
            <StepHeading
              index="2"
              title="确定阅读节奏"
              desc="先选一个大致节奏，长章节可以自动拆成多个阅读日。"
            />

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {PACE_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  active={paceMode === option.value}
                  title={option.title}
                  desc={`${option.desc} · 建议单次不超过 ${option.maxPagesPerSession} ${pageUnitLabel}`}
                  onClick={() => setPaceMode(option.value)}
                />
              ))}
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-[220px_1fr]">
              <label className="block text-sm font-medium text-ink">
                开始日期
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 font-normal text-ink outline-none focus:border-accent"
                />
              </label>

              <div>
                <p className="text-sm font-medium text-ink">每周阅读日</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day.value}
                      onClick={() => toggleWeekday(day.value)}
                      className={`h-10 w-10 rounded-full border text-sm transition ${
                        weekdays.includes(day.value)
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-paper text-ink-soft hover:border-accent"
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg bg-paper px-4 py-3">
              <input
                type="checkbox"
                checked={splitLongChapters}
                onChange={(event) => setSplitLongChapters(event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-ink">长章节可以拆开读</span>
                <span className="mt-1 block text-xs leading-5 text-ink-soft">
                  如果单章{pageUnitLabel}数明显超过当前节奏，会拆成多个阅读日，避免一天塞太满。
                </span>
              </span>
            </label>

            <OpeningPanelActions
              onBack={goPreviousStep}
              backLabel="上一步"
              onNext={goNextStep}
              nextLabel="下一步：预览计划"
            />
          </>
        )}

        {activeStep === "plan" && (
          <>
            <StepHeading
              index="3"
              title="确认阅读计划"
              desc={planPreview.summary}
            />

            {planPreview.riskNotes.length > 0 && (
              <div className="mt-4 rounded-lg bg-paper px-4 py-3">
                <p className="text-xs font-medium text-ink-soft">生成计划时的提醒</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-ink-soft">
                  {planPreview.riskNotes.map((note, index) => (
                    <li key={`${note}-${index}`}>- {note}</li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="mt-5 space-y-2">
              {planPreview.items.slice(0, 10).map((item) => (
                <li key={item.id} className="rounded-lg bg-paper px-4 py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-ink">
                      Day {item.day} · {item.title}
                    </p>
                    <p className="text-xs text-ink-soft">{item.date}</p>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {item.type === "guide" ? "准备阅读" : "正文章节"} ·{" "}
                    {formatPlanPageRange(item.startPage, item.endPage, pageUnitLabel)}
                    {item.wholeBookRole ? ` · ${item.wholeBookRole}` : ""}
                  </p>
                </li>
              ))}
            </ol>

            {planPreview.items.length > 10 && (
              <p className="mt-3 text-xs text-ink-soft">
                还有 {planPreview.items.length - 10} 个阅读日会在保存后一起记录。
              </p>
            )}

            {message && <Hint message={message} />}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={handleSave}
                disabled={planPreview.mainCount === 0}
                className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                保存读伴设定并生成计划
              </button>
              <button
                onClick={goPreviousStep}
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
              >
                上一步
              </button>
              <button
                onClick={onBack}
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
              >
                返回修改章节
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function OpeningSummaryTile({ label, value }) {
  return (
    <div className="opening-summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OpeningStepTabs({
  steps,
  activeStep,
  activeStepIndex,
  guideLoading,
  hasGuide,
  onChange,
}) {
  return (
    <nav className="opening-step-tabs" aria-label="设定读伴步骤">
      {steps.map((step, index) => {
        const active = step.id === activeStep;
        const done =
          index < activeStepIndex ||
          (step.id === "guide" && hasGuide && !guideLoading);
        const loading = step.id === "guide" && guideLoading;

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onChange(step.id)}
            className={`opening-step-tab ${active ? "is-active" : ""} ${
              done ? "is-done" : ""
            } ${loading ? "is-loading" : ""}`}
          >
            <span className="opening-step-index">
              {loading ? "…" : done ? "✓" : <ChineseIcon name={step.icon} className="h-3.5 w-3.5" decorative />}
            </span>
            <span>
              <span className="opening-step-title">
                {renderBrandNameText(step.title, `opening-step-title-${step.id}`)}
              </span>
              <span className="opening-step-desc">{step.desc}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function OpeningPanelActions({ onBack, backLabel, onNext, nextLabel }) {
  return (
    <div className="opening-panel-actions">
      <button
        type="button"
        onClick={onBack}
        className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper"
      >
        {backLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function StepHeading({ index, title, desc }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm text-white">
        {index}
      </span>
      <div>
        <h3 className="text-base font-medium text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-ink-soft">{desc}</p>
      </div>
    </div>
  );
}

function OpeningCompanionIntro({
  bookTitle,
  openingAnswers,
  openingRound,
  onChangeAnswer,
  onAddSuggestion,
  companionProfile,
  onPreviousRound,
  onNextRound,
  onFinish,
}) {
  const round = OPENING_DIALOG_ROUNDS[openingRound] || OPENING_DIALOG_ROUNDS[0];
  const isIntro = round.id === "intro";
  const isReady = round.id === "ready";
  const answerValue = round.field ? openingAnswers[round.field] || "" : "";
  const progress = Math.round((round.stage / (OPENING_DIALOG_ROUNDS.length - 1)) * 100);
  const colorOption = getCompanionColorOption(companionProfile.color);
  const companionStyle = {
    "--companion-accent": colorOption.accent,
    "--companion-soft": colorOption.soft,
    "--companion-ribbon": colorOption.ribbon,
  };

  return (
    <div className="opening-companion-shell" data-stage={round.stage} style={companionStyle}>
      <div className="opening-companion-stage">
        <div
          className={`opening-companion-avatar is-stage-${round.stage} expression-${companionProfile.expression}`}
          aria-hidden="true"
        >
          <ReadingCompanionScene
            stage={round.stage}
            expression={companionProfile.expression}
          />
        </div>

        <div className="opening-chat-area">
          <div className="opening-chat-progress" aria-label="读伴设置进度">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="opening-chat-meta">
            <span>{renderBrandNameText(round.title, `opening-round-title-${round.id}`)}</span>
            <span>{round.stage} / {OPENING_DIALOG_ROUNDS.length - 1}</span>
          </div>

          <div className="opening-chat-bubble opening-chat-bubble-assistant">
            <p className="opening-chat-kicker">
              {renderBrandNameText(
                isIntro ? "准备开始" : isReady ? "设置完成" : `第 ${round.stage} 步`,
                `opening-round-kicker-${round.id}`
              )}
            </p>
            <p>{renderBrandNameText(round.message, `opening-round-${round.id}`)}</p>
            {isIntro && toText(bookTitle) && (
              <p className="opening-chat-book-title">这一次，我会陪你读《{bookTitle}》。</p>
            )}
          </div>

          {round.field && (
            <>
              <label className="opening-chat-composer">
                <span>你的回答</span>
                <textarea
                  value={answerValue}
                  onChange={(event) => onChangeAnswer(round.field, event.target.value)}
                  rows={4}
                  placeholder={round.placeholder}
                />
              </label>

              <div className="opening-suggestion-row" aria-label="回答灵感">
                {round.suggestions.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => onAddSuggestion(round.field, text)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </>
          )}

          {isReady && (
            <div className="opening-formed-note">
              <span>准备保存</span>
              <p>
                <BrandName className="opening-companion-brand" />
                已记录你的阅读背景、关注问题和陪读方式。
              </p>
            </div>
          )}

          <div className="opening-dialog-actions">
            {openingRound > 0 && (
              <button type="button" className="opening-dialog-secondary" onClick={onPreviousRound}>
                上一轮
              </button>
            )}
            {isReady ? (
              <button type="button" className="opening-dialog-primary" onClick={onFinish}>
                {renderBrandNameText(round.actionLabel, `opening-action-${round.id}`)}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="opening-dialog-primary"
                  onClick={onNextRound}
                >
                    {renderBrandNameText(round.actionLabel, `opening-action-${round.id}`)}
                </button>
                {!isIntro && (
                  <button
                    type="button"
                    className="opening-dialog-quiet"
                    onClick={onNextRound}
                  >
                    这一轮先空着
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ active, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-28 rounded-xl border p-4 text-left transition ${
        active
          ? "border-accent bg-paper shadow-sm"
          : "border-line bg-paper hover:border-accent"
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
          active ? "border-accent bg-accent" : "border-line bg-paper-card"
        }`}
      >
        {active && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{desc}</p>
    </button>
  );
}

function WholeBookGuideLoading({ startedAt }) {
  const [now, setNow] = useState(Date.now());
  const elapsedSeconds = Math.max(
    1,
    Math.floor((now - (startedAt || now)) / 1000)
  );
  const loadingSteps = [
    "读取章节结构",
    "抽样正文与导读章节",
    "整理这本书在问什么",
    "压缩成后续陪读会用的地图",
  ];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="whole-book-loading mt-5">
      <div className="whole-book-loading-visual" aria-hidden="true">
        <span className="whole-book-page whole-book-page-left" />
        <span className="whole-book-page whole-book-page-right" />
        <span className="whole-book-glow" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">正在整理整本书的读法</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              你可以先继续定节奏。地图整理好以后，会自动带到后续导读和问答里。
            </p>
          </div>
          <span className="whole-book-loading-time">已等待 {elapsedSeconds}s</span>
        </div>
        <div className="whole-book-loading-track mt-4">
          <span className="whole-book-loading-bar" />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {loadingSteps.map((step, index) => (
            <div
              key={step}
              className="whole-book-loading-step"
              style={{ "--opening-step-delay": `${index * 120}ms` }}
            >
              <span />
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WholeBookGuideView({ guide }) {
  const [showGuideDetails, setShowGuideDetails] = useState(false);
  const hasFullOverview =
    cleanGuideDisplayText(guide.fullOverview) &&
    cleanGuideDisplayText(guide.fullOverview) !== cleanGuideDisplayText(guide.overview);

  return (
    <div className="mt-4">
      <section className="opening-map-preview">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-ink-soft">读伴小纸条</p>
          <button
            type="button"
            onClick={() => setShowGuideDetails((current) => !current)}
            className="rounded-lg border border-line px-3 py-1 text-xs text-ink-soft hover:bg-paper-card"
          >
            {showGuideDetails ? "收起读伴地图" : "查看读伴地图"}
          </button>
        </div>
        <GuideMarkdown value={guide.overview} />
        {showGuideDetails && (
          <div className="mt-5 space-y-5 border-t border-line pt-5">
            {hasFullOverview && (
              <section>
                <p className="mb-3 text-xs font-medium text-ink-soft">完整导读</p>
                <GuideMarkdown value={guide.fullOverview} />
              </section>
            )}
            <GuideQuestionPanel guide={guide} />
            <GuideRoute items={guide.structureMap || []} />
            <GuideSupportList items={guide.difficultyMap || []} />
            {guide.sourceLimitations && (
              <p className="rounded-lg bg-paper-card px-3 py-2 text-xs leading-5 text-ink-soft">
                {cleanGuideDisplayText(guide.sourceLimitations)}
              </p>
            )}
            <GuideUsage guide={guide} />
          </div>
        )}
      </section>
    </div>
  );
}

function GuideQuestionPanel({ guide }) {
  const bookProblem = toText(guide.bookProblem);
  const coreQuestion = toText(guide.coreQuestion);
  if (!bookProblem && !coreQuestion) return null;

  return (
    <section className="rounded-xl border border-line bg-paper-card px-5 py-4">
      <p className="text-xs font-medium text-ink-soft">先看这本书在问什么</p>
      <div className="mt-4 space-y-4">
        {bookProblem && (
          <GuidePlainRow
            label="这本书在追问"
            value={bookProblem}
          />
        )}
        {coreQuestion && (
          <GuidePlainRow
            label="你可以带着它读"
            value={coreQuestion}
          />
        )}
      </div>
    </section>
  );
}

function GuidePlainRow({ label, value }) {
  return (
    <div className="border-l-2 border-accent pl-4">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-sm leading-7 text-ink">{value}</p>
    </div>
  );
}

function GuideRoute({ items }) {
  const route = items.filter(Boolean).slice(0, 5);
  if (route.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-paper-card px-5 py-4">
      <div>
        <p className="text-xs font-medium text-ink-soft">阅读路线</p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          不用预先记住所有章节，先看问题大致如何推进。
        </p>
      </div>
      <ol className="mt-5 space-y-0">
        {route.map((item, index) => (
          <li
            key={`${item.title}-${index}`}
            className="relative border-l border-line pb-5 pl-6 last:border-l-transparent last:pb-0"
          >
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-accent bg-paper-card text-xs text-accent">
              {index + 1}
            </span>
            <p className="text-sm font-medium leading-6 text-ink">{toText(item.title)}</p>
            {toText(item.role || item.summary) && (
              <p className="mt-1 text-sm leading-6 text-ink-soft">
                {toText(item.role || item.summary)}
              </p>
            )}
            {toText(item.readingHint) && (
              <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs leading-5 text-ink">
                读到这里，留心：{toText(item.readingHint)}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function GuideSupportList({ items }) {
  const supportItems = items.filter(Boolean).slice(0, 4);
  if (supportItems.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-paper-card px-5 py-4">
      <div>
        <p className="text-xs font-medium text-ink-soft">阅读时容易卡住的地方</p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          把这些地方当作阅读提醒即可；读到中途多留意，方向会更稳。
        </p>
      </div>
      <div className="mt-4 divide-y divide-line">
        {supportItems.map((item, index) => (
          <div key={`${item.topic}-${index}`} className="grid gap-2 py-4 first:pt-0 last:pb-0 md:grid-cols-[220px_1fr]">
            <p className="text-sm font-medium leading-6 text-ink">{toText(item.topic)}</p>
            <div className="space-y-2 text-sm leading-6">
              {toText(item.whyHard || item.where) && (
                <p className="text-ink-soft">{toText(item.whyHard || item.where)}</p>
              )}
              {toText(item.supportStrategy) && (
                <p className="text-ink">处理方式：{formatSupportStrategy(item.supportStrategy)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatSupportStrategy(value) {
  return toText(value)
    .trim()
    .replace(/^读伴(后续)?(会|将|可以)?(帮助|帮)(用户|你)[:：]?\s*/, "")
    .replace(/^帮助(用户|你)[:：]?\s*/, "")
    .replace(/^帮用户/, "帮你");
}

function GuideMarkdown({ value }) {
  const lines = cleanGuideDisplayText(value).split(/\n+/);
  return (
    <div className="space-y-3 text-sm leading-7 text-ink">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed === "---") return <hr key={index} className="border-line" />;
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={index} className="pt-1 font-serif text-xl leading-8 text-ink">
              {renderInlineMarkdown(trimmed.replace(/^###\s+/, ""), `guide-h-${index}`)}
            </h4>
          );
        }
        if (trimmed.startsWith(">")) {
          return (
            <blockquote key={index} className="border-l-2 border-accent pl-3 text-ink-soft">
              {renderInlineMarkdown(trimmed.replace(/^>\s?/, ""), `guide-q-${index}`)}
            </blockquote>
          );
        }
        return <p key={index}>{renderInlineMarkdown(trimmed, `guide-p-${index}`)}</p>;
      })}
    </div>
  );
}

function cleanGuideDisplayText(value) {
  return toText(value).replace(/\\n/g, "\n").replace(/\\r/g, "\n").replace(/\\t/g, " ");
}

function renderInlineMarkdown(text, keyPrefix) {
  const parts = [];
  const pattern = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(...asArray(renderBrandNameText(text.slice(lastIndex, match.index), `${keyPrefix}-${lastIndex}`)));
    }
    parts.push(
      <strong key={`${keyPrefix}-strong-${match.index}`} className="font-medium text-ink">
        {renderBrandNameText(match[1], `${keyPrefix}-strong-text-${match.index}`)}
      </strong>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...asArray(renderBrandNameText(text.slice(lastIndex), `${keyPrefix}-tail`)));
  }

  return parts;
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function GuideUsage({ guide }) {
  if (!guide.usage && !guide.cost && !guide.model) return null;
  return (
    <p className="mt-4 border-t border-line pt-3 text-[11px] leading-5 text-ink-soft">
      {guide.model ? `${guide.model} · ` : ""}
      输入 {guide.usage?.input_tokens ?? "未知"} / 输出 {guide.usage?.output_tokens ?? "未知"}
      {guide.cost ? ` · ${formatUsd(guide.cost.totalCost)}` : ""}
    </p>
  );
}

function Hint({ message }) {
  const color = message.type === "ok" ? "text-green-700" : "text-red-600";
  return <p className={`mt-4 text-sm ${color}`}>{message.text}</p>;
}

function buildPlanPreview({
  book,
  wholeBookGuide,
  pace,
  startDate,
  weekdays,
  splitLongChapters,
  selectedFocus,
}) {
  const includedChapters = book.chapters.filter(isChapterIncluded);
  const guideChapters = includedChapters.filter((chapter) => chapter.role === "guide");
  const mainChapters = includedChapters.filter((chapter) => chapter.role !== "guide");
  const items = [];
  let nextDate = parseDate(startDate);

  if (guideChapters.length > 0) {
    nextDate = nextReadingDate(nextDate, weekdays);
    items.push({
      id: makePlanItemId("guide", guideChapters),
      day: items.length + 1,
      date: formatDate(nextDate),
      type: "guide",
      title: "开始前准备",
      startPage: Math.min(...guideChapters.map((chapter) => chapter.startPage)),
      endPage: Math.max(...guideChapters.map((chapter) => chapter.endPage)),
      chapterIds: guideChapters.map((chapter) => chapter.id),
      focusHint: selectedFocus?.label || "",
    });
    nextDate = addDays(nextDate, 1);
  }

  mainChapters.forEach((chapter) => {
    const chunks = splitChapterIntoPlanChunks(chapter, {
      splitLongChapters,
      maxPagesPerSession: pace.maxPagesPerSession,
    });

    chunks.forEach((chunk) => {
      nextDate = nextReadingDate(nextDate, weekdays);
      items.push({
        id: makePlanItemId("main", [chapter], chunk.startPage, chunk.endPage),
        day: items.length + 1,
        date: formatDate(nextDate),
        type: "main",
        title: chunk.title,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        chapterIds: [chapter.id],
        focusHint: selectedFocus?.label || "",
        wholeBookRole: findWholeBookRole(wholeBookGuide, chapter),
      });
      nextDate = addDays(nextDate, 1);
    });
  });

  const summary =
    mainChapters.length === 0
      ? "请先回到书籍信息页，至少打开一个章节的阅读开关。"
      : `${pace.title}节奏，每次约 ${pace.minutesPerSession} 分钟，按正文 ${mainChapters.length} 章安排，预计 ${items.length} 个阅读日完成。`;

  return {
    guideCount: guideChapters.length,
    mainCount: mainChapters.length,
    summary,
    riskNotes: wholeBookGuide?.planAdvice?.riskNotes || [],
    items,
  };
}

function findWholeBookRole(guide, chapter) {
  const title = toText(chapter.title);
  const section = guide?.structureMap?.find((item) =>
    Array.isArray(item.chapterTitles)
      ? item.chapterTitles.some((chapterTitle) => title && toText(chapterTitle).includes(title))
      : false
  );
  return toText(section?.role);
}

function buildCompanionFocus({
  selectedFocus,
  customFocus,
  openingMessage,
  openingAnswers,
  companionProfile,
  now,
  fromGuide,
}) {
  const openingText = toText(openingMessage).trim();
  const normalizedOpeningAnswers = normalizeOpeningAnswers(openingAnswers, openingText);
  const normalizedCompanionProfile = normalizeCompanionProfile(companionProfile);
  const customText =
    selectedFocus.type === "custom"
      ? toText(customFocus || normalizedOpeningAnswers.companion).trim()
      : "";
  const userText = [openingText, customText && customText !== openingText ? customText : ""]
    .filter(Boolean)
    .join("\n\n");
  const aiSummary = buildCompanionMemorySummary({
    selectedFocus,
    openingText,
    customText,
  });
  const promptInstruction = buildCompanionPromptInstruction({
    selectedFocus,
    openingText,
    customText,
  });

  return {
    schemaVersion: 1,
    type: selectedFocus.type || "mainline",
    label: selectedFocus.label || "帮我抓主线",
    openingMessage: openingText,
    openingAnswers: normalizedOpeningAnswers,
    companionProfile: normalizedCompanionProfile,
    customFocus: customText,
    userText,
    aiSummary,
    promptInstruction,
    selectedFromWholeBookGuide: fromGuide,
    updatedAt: now,
  };
}

function normalizeOpeningAnswers(value, fallbackText = "") {
  const fallback = toText(fallbackText).trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...EMPTY_OPENING_ANSWERS,
      context: fallback,
    };
  }

  const answers = {
    context: toText(value.context).trim(),
    curiosity: toText(value.curiosity).trim(),
    companion: toText(value.companion).trim(),
  };

  if (!answers.context && !answers.curiosity && !answers.companion && fallback) {
    return {
      ...answers,
      context: fallback,
    };
  }

  return answers;
}

function normalizeCompanionProfile() {
  return { ...DEFAULT_COMPANION_PROFILE };
}

function getCompanionColorOption(color) {
  return (
    COMPANION_COLOR_OPTIONS.find((option) => option.id === color) ||
    COMPANION_COLOR_OPTIONS[0]
  );
}

function buildOpeningMessage(answers = EMPTY_OPENING_ANSWERS) {
  const normalized = normalizeOpeningAnswers(answers);
  const sections = [
    ["我带着这些来读", normalized.context],
    ["我想在书里寻找", normalized.curiosity],
    ["我希望读伴这样陪我", normalized.companion],
  ]
    .filter(([, value]) => toText(value).trim())
    .map(([label, value]) => `${label}：${toText(value).trim()}`);

  return sections.join("\n");
}

function appendOpeningAnswer(current, text) {
  const previous = toText(current).trim();
  const next = toText(text).trim();
  if (!next || previous.includes(next)) return previous;
  return previous ? `${previous}\n${next}` : next;
}

function buildCompanionMemorySummary({ selectedFocus, openingText, customText }) {
  const focusSummary = toText(selectedFocus.description).trim();
  const customSummary = customText ? `特别关注：${customText}` : "";
  if (!openingText && !customSummary) return focusSummary;
  return [openingText ? `设定读伴时用户捎来的话：${openingText}` : "", customSummary, focusSummary]
    .filter(Boolean)
    .join("\n");
}

function buildCompanionPromptInstruction({
  selectedFocus,
  openingText,
  customText,
}) {
  return [
    toText(selectedFocus.promptInstruction).trim(),
    openingText
      ? `后续导读、问答和读后交流都要把这段设定读伴时捎来的话当作本书记忆：${openingText}`
      : "",
    customText ? `用户还特别指定了这本书的陪读目标：${customText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function legacyPurposeFromFocus(type) {
  if (type === "argument") return "deep";
  if (type === "output") return "research";
  if (type === "mainline") return "overview";
  return "study";
}

function normalizePace(value) {
  if (!value) return {};
  if (typeof value === "string") {
    return { mode: value };
  }
  if (typeof value === "object") {
    return {
      mode: value.mode || value.value || "",
      startDate: value.startDate || "",
      weekdays: Array.isArray(value.weekdays) ? value.weekdays : null,
      splitLongChapters: value.splitLongChapters,
    };
  }
  return {};
}

function today() {
  return formatDate(new Date());
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPlanPageRange(startPage, endPage, pageUnitLabel = "页") {
  if (pageUnitLabel === "文本页") return `文本页 ${startPage}-${endPage}`;
  return `第 ${startPage}-${endPage} 页`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextReadingDate(date, weekdays) {
  let current = new Date(date);
  const allowed = weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5];
  for (let guard = 0; guard < 14; guard += 1) {
    if (allowed.includes(current.getDay())) return current;
    current = addDays(current, 1);
  }
  return current;
}

function weekdayOrder(value) {
  return value === 0 ? 7 : value;
}

function makePlanItemId(type, chapters, startPage = "", endPage = "") {
  const chapterKey = chapters.map((chapter) => chapter.id).join("+");
  const pageKey = startPage && endPage ? `:${startPage}-${endPage}` : "";
  return `${type}:${chapterKey}${pageKey}`;
}
