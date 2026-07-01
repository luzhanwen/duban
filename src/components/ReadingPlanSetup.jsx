import { useEffect, useMemo, useState } from "react";
import { renderBrandNameText } from "./BrandLogo.jsx";
import { getBookPageUnitLabel } from "../lib/bookFormats.js";
import { getBook, getBookPages, updateBook } from "../lib/books.js";
import { formatUsd } from "../lib/pricing.js";
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
    title: "开书地图",
    desc: "先理解整本书",
  },
  {
    id: "pace",
    title: "阅读节奏",
    desc: "决定怎么读",
  },
  {
    id: "focus",
    title: "读伴记忆",
    desc: "设定陪读方向",
  },
  {
    id: "plan",
    title: "计划预览",
    desc: "确认并保存",
  },
];

export default function ReadingPlanSetup({ bookId, onBack, onDone }) {
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [wholeBookGuide, setWholeBookGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideStartedAt, setGuideStartedAt] = useState(null);
  const [guideError, setGuideError] = useState("");
  const [userIntent, setUserIntent] = useState("");
  const [paceMode, setPaceMode] = useState("standard");
  const [startDate, setStartDate] = useState(today());
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [splitLongChapters, setSplitLongChapters] = useState(true);
  const [focusType, setFocusType] = useState("mainline");
  const [customFocus, setCustomFocus] = useState("");
  const [activeStep, setActiveStep] = useState("guide");
  const [message, setMessage] = useState(null);

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
      setCustomFocus(profileFocus?.userText || "");
      setUserIntent(profileFocus?.userText || "");
    }

    load();
    return () => {
      alive = false;
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
        promptInstruction: "后续回答要围绕用户自定义的阅读目标收束。",
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
    setGuideError("");
    setMessage(null);
    setGuideLoading(true);
    setGuideStartedAt(Date.now());
    setWholeBookGuide(null);
    try {
      const generated = await generateWholeBookGuide({ book, pages, userIntent });
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
    } catch (e) {
      setGuideError(e.message || "整本书导读生成失败，请稍后重试。");
    } finally {
      setGuideLoading(false);
      setGuideStartedAt(null);
    }
  }

  async function handleSave() {
    const now = new Date().toISOString();
    const companionFocus = buildCompanionFocus({
      selectedFocus,
      customFocus,
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

    setMessage({ type: "ok", text: "开书设置已保存，阅读计划也准备好了。" });
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

  function goPreviousStep() {
    if (!canGoBackStep) return;
    goToStep(OPENING_STEPS[activeStepIndex - 1].id);
  }

  function goNextStep() {
    if (!canGoNextStep) return;
    goToStep(OPENING_STEPS[activeStepIndex + 1].id);
  }

  return (
    <div className="opening-page mx-auto max-w-6xl px-6 py-10">
      <button onClick={onBack} className="text-sm text-accent underline">
        返回书籍信息
      </button>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-ink-soft">开书分析</p>
          <h2 className="mt-1 font-serif text-3xl text-ink">{toText(book.title)}</h2>
          {toText(book.author) && (
            <p className="mt-2 text-sm text-ink-soft">{toText(book.author)}</p>
          )}
        </div>
        <div className="opening-summary-grid">
          <OpeningSummaryTile label="正文" value={`${planPreview.mainCount} 章`} />
          <OpeningSummaryTile label="计划" value={`${planPreview.items.length} 个阅读日`} />
          <OpeningSummaryTile
            label="导读"
            value={guideLoading ? "生成中" : wholeBookGuide ? "已生成" : "可跳过"}
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

      <section className="opening-panel mt-6" key={activeStep}>
        {activeStep === "guide" && (
          <>
            <StepHeading
              index="1"
              title="先整理整本书的读法"
              desc="全书导读会整理核心问题、结构推进、阅读难点和建议节奏。它不是必填项，但生成后后续陪读会更有方向。"
            />

            <textarea
              value={userIntent}
              onChange={(event) => setUserIntent(event.target.value)}
              rows={3}
              placeholder="可选：你为什么想读这本书？比如：想抓主线、写文章、补背景、准备分享……"
              className="mt-5 w-full resize-none rounded-lg border border-line bg-paper px-4 py-3 text-sm leading-7 text-ink outline-none focus:border-accent"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerateGuide}
                disabled={guideLoading}
                className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                {guideLoading ? "正在整理…" : wholeBookGuide ? "重新整理这本书" : "整理这本书"}
              </button>
              {wholeBookGuide?.generatedAt && (
                <span className="text-xs text-ink-soft">
                  已生成 · {formatDateTime(wholeBookGuide.generatedAt)}
                </span>
              )}
            </div>

            {guideError && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                {guideError}
              </p>
            )}

            {guideLoading && <WholeBookGuideLoading startedAt={guideStartedAt} />}

            {wholeBookGuide ? (
              <WholeBookGuideView guide={wholeBookGuide} />
            ) : (
              !guideLoading && (
                <div className="mt-5 rounded-lg bg-paper px-4 py-3 text-sm leading-6 text-ink-soft">
                  没有生成整本书导读也可以继续设置计划；后续进入这本书时还可以再补生成。
                </div>
              )
            )}

            <OpeningPanelActions
              onBack={onBack}
              backLabel="返回书籍信息"
              onNext={goNextStep}
              nextLabel={wholeBookGuide ? "下一步：阅读节奏" : "先跳过，设置节奏"}
            />
          </>
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
              nextLabel="下一步：读伴记忆"
            />
          </>
        )}

        {activeStep === "focus" && (
          <>
            <StepHeading
              index="3"
              title="选择这本书的阅读侧重"
              desc="这个选择会影响后续导读、问答和读后交流，让提示更贴近你的目的。"
            />

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {focusOptions.map((option) => (
                <ChoiceCard
                  key={option.type}
                  active={focusType === option.type}
                  title={option.label}
                  desc={option.description}
                  onClick={() => setFocusType(option.type)}
                />
              ))}
            </div>

            {focusType === "custom" && (
              <textarea
                value={customFocus}
                onChange={(event) => setCustomFocus(event.target.value)}
                rows={3}
                placeholder="我读这本书，主要想解决……"
                className="mt-4 w-full resize-none rounded-lg border border-line bg-paper px-4 py-3 text-sm leading-7 text-ink outline-none focus:border-accent"
              />
            )}

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
              index="4"
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
                保存开书设置并生成计划
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
    <nav className="opening-step-tabs" aria-label="开书设置步骤">
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
              {loading ? "…" : done ? "✓" : index + 1}
            </span>
            <span>
              <span className="opening-step-title">{step.title}</span>
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
    "整理全书问题和路线",
    "压缩成可用的开书地图",
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
              全书导读会参考章节结构、导读章节和正文抽样，通常比章节导读更久一点。
              现在不是卡住，只是在等待模型返回。
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
  const [showFullOverview, setShowFullOverview] = useState(false);
  const hasFullOverview =
    toText(guide.fullOverview) && toText(guide.fullOverview) !== toText(guide.overview);

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl bg-paper px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-ink-soft">快速导读</p>
          {hasFullOverview && (
            <button
              onClick={() => setShowFullOverview((current) => !current)}
              className="rounded-lg border border-line px-3 py-1 text-xs text-ink-soft hover:bg-paper-card"
            >
              {showFullOverview ? "收起完整导读" : "展开完整导读"}
            </button>
          )}
        </div>
        <GuideMarkdown value={guide.overview} />
        {hasFullOverview && showFullOverview && (
          <div className="mt-5 rounded-lg border border-line bg-paper-card px-4 py-3">
            <p className="mb-3 text-xs font-medium text-ink-soft">完整导读底稿</p>
            <GuideMarkdown value={guide.fullOverview} />
          </div>
        )}
        {guide.sourceLimitations && (
          <p className="mt-4 rounded-lg bg-paper-card px-3 py-2 text-xs leading-5 text-ink-soft">
            {guide.sourceLimitations}
          </p>
        )}
        <GuideUsage guide={guide} />
      </section>

      <GuideQuestionPanel guide={guide} />
      <GuideRoute items={guide.structureMap || []} />
      <GuideSupportList items={guide.difficultyMap || []} />
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
          这些不是考试重点，而是读到中途容易失去方向的位置。
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
  const lines = toText(value).split(/\n+/);
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
  const guideChapters = book.chapters.filter((chapter) => chapter.role === "guide");
  const mainChapters = book.chapters.filter((chapter) => !chapter.role || chapter.role === "main");
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
      ? "还没有标记为正文的章节，请回到书籍信息页调整章节用途。"
      : `${pace.title}节奏，每次约 ${pace.minutesPerSession} 分钟，按正文 ${mainChapters.length} 章安排，预计 ${items.length} 个阅读日完成。`;

  return {
    guideCount: guideChapters.length,
    mainCount: mainChapters.length,
    summary,
    riskNotes: wholeBookGuide?.planAdvice?.riskNotes || [],
    items,
  };
}

function splitChapterIntoPlanChunks(chapter, { splitLongChapters, maxPagesPerSession }) {
  const startPage = Number(chapter.startPage);
  const endPage = Number(chapter.endPage);
  const pageCount = Math.max(1, endPage - startPage + 1);

  if (!splitLongChapters || pageCount <= maxPagesPerSession) {
    return [
      {
        title: chapter.title,
        startPage,
        endPage,
      },
    ];
  }

  const chunks = [];
  let cursor = startPage;
  while (cursor <= endPage) {
    const chunkEnd = Math.min(endPage, cursor + maxPagesPerSession - 1);
    chunks.push({
      title: `${chapter.title}（第 ${chunks.length + 1} 段）`,
      startPage: cursor,
      endPage: chunkEnd,
    });
    cursor = chunkEnd + 1;
  }
  return chunks;
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

function buildCompanionFocus({ selectedFocus, customFocus, now, fromGuide }) {
  const userText = selectedFocus.type === "custom" ? customFocus.trim() : "";
  return {
    schemaVersion: 1,
    type: selectedFocus.type || "mainline",
    label: selectedFocus.label || "帮我抓主线",
    userText,
    aiSummary: userText || selectedFocus.description || "",
    promptInstruction: selectedFocus.promptInstruction || "",
    selectedFromWholeBookGuide: fromGuide,
    updatedAt: now,
  };
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

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
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
