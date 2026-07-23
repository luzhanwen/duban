import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import ChineseIcon from "./ChineseIcon.jsx";
import CompanionMarkdown from "./CompanionMarkdown.jsx";
import {
  buildCompanionSessionRecord,
  buildCompanionTimelineCards,
  getDefaultExpandedTimelineCardIds,
  getCompanionTimelineCardLayout,
  isCompanionTimelineCardCollapsible,
} from "../lib/companionTimeline.js";

export default function CompanionJourneyTimeline({
  entries,
  itemKey = null,
  includeBook = false,
  activeScene = "",
  emptyMessage = "这一节的陪读脉络会从这里展开。",
  onQuote,
  onCardAction,
  getActionLabel,
  isActionDisabled,
  compact = false,
  className = "",
}) {
  const cards = useMemo(
    () =>
      buildCompanionTimelineCards(entries, {
        itemKey,
        includeBook,
      }),
    [entries, includeBook, itemKey]
  );
  const defaultExpandedIds = getDefaultExpandedTimelineCardIds(cards);
  const defaultExpandedKey = defaultExpandedIds.join("\u001f");
  const [expandedCardIds, setExpandedCardIds] = useState(() => new Set(defaultExpandedIds));
  const [enteringCardIds, setEnteringCardIds] = useState(() => new Set());
  const timelineId = useId().replace(/:/g, "");
  const timelineContextKey = `${itemKey || "book"}:${includeBook ? "book" : "item"}`;
  const knownCardIdsRef = useRef(new Set(cards.map((card) => card.id)));
  const knownContextKeyRef = useRef(timelineContextKey);

  useEffect(() => {
    setExpandedCardIds(new Set(defaultExpandedIds));
  }, [defaultExpandedKey]);

  useLayoutEffect(() => {
    const nextCardIds = new Set(cards.map((card) => card.id));
    if (knownContextKeyRef.current !== timelineContextKey) {
      knownContextKeyRef.current = timelineContextKey;
      knownCardIdsRef.current = nextCardIds;
      setEnteringCardIds(new Set());
      return undefined;
    }

    const addedCardIds = cards
      .map((card) => card.id)
      .filter((cardId) => !knownCardIdsRef.current.has(cardId));
    knownCardIdsRef.current = nextCardIds;
    if (addedCardIds.length === 0) return undefined;

    setEnteringCardIds(new Set(addedCardIds));
    const timer = window.setTimeout(() => setEnteringCardIds(new Set()), 460);
    return () => window.clearTimeout(timer);
  }, [cards, timelineContextKey]);

  if (cards.length === 0) {
    return <p className={`companion-journey-empty ${className}`.trim()}>{emptyMessage}</p>;
  }

  return (
    <ol className={`companion-journey-list ${compact ? "is-compact" : ""} ${className}`.trim()}>
      {cards.map((card, index) => {
        const latest = index === cards.length - 1;
        const layout = getCompanionTimelineCardLayout(card);
        const collapsible = isCompanionTimelineCardCollapsible(card, { compact });
        const expanded = !collapsible || expandedCardIds.has(card.id);
        const contentId = `${timelineId}-card-${index}`;
        const toggleCard = () => {
          if (!collapsible) return;
          setExpandedCardIds((current) => {
            const next = new Set(current);
            if (next.has(card.id)) next.delete(card.id);
            else next.add(card.id);
            return next;
          });
        };
        return (
          <li
            key={card.id}
            className={`companion-journey-card is-${card.tone} ${card.role === "user" ? "is-user" : ""} ${collapsible ? "is-collapsible" : ""} ${expanded ? "is-expanded" : "is-collapsed"} ${enteringCardIds.has(card.id) ? "is-entering" : ""}`}
            data-companion-card-type={card.type}
            data-companion-card-scene={card.scene}
            data-companion-card-layout={layout}
            data-companion-card-kind={card.kind || undefined}
            data-companion-shared={latest ? "record" : undefined}
          >
            <div className="companion-journey-marker" aria-hidden="true">
              <ChineseIcon name={iconForCard(card)} className="h-3.5 w-3.5" decorative />
            </div>
            <div
              id={contentId}
              className="companion-journey-card-body"
              onClick={(event) => {
                if (event.target.closest?.("button, a, input, textarea, select")) return;
                toggleCard();
              }}
            >
              <div className="companion-journey-card-meta">
                <span>{card.label}</span>
                {card.scene === activeScene && <span className="companion-journey-current">当前</span>}
                {collapsible && (
                  <button
                    type="button"
                    className="companion-journey-expand"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    onClick={toggleCard}
                  >
                    {expanded ? "收起" : "展开"}
                  </button>
                )}
              </div>
              {card.title && <strong className="companion-journey-card-title">{card.title}</strong>}
              <CompanionMarkdown content={card.body} />
              {card.detail && <small>{card.detail}</small>}
              {(onQuote || onCardAction) && (
                <div className="companion-journey-card-actions">
                  {onQuote && card.quoteText && (
                    <button type="button" onClick={() => onQuote(card)}>
                      引用
                    </button>
                  )}
                  {onCardAction && (
                    <button
                      type="button"
                      disabled={isActionDisabled?.(card)}
                      onClick={() => onCardAction(card)}
                    >
                      {getActionLabel?.(card) || "带入对话"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CompanionSessionRecord({ entries, itemKey, className = "" }) {
  const record = buildCompanionSessionRecord(entries, { itemKey });
  return (
    <section
      className={`companion-session-record ${className}`.trim()}
      data-companion-shared="record"
    >
      <div>
        <p>本节记录</p>
        <strong>{record.takeaway}</strong>
      </div>
      <dl>
        <div><dt>线索</dt><dd>{record.counts.clues}</dd></div>
        <div><dt>提问</dt><dd>{record.counts.questions}</dd></div>
        <div><dt>笔记</dt><dd>{record.counts.notes}</dd></div>
        <div><dt>回想</dt><dd>{record.counts.reflections}</dd></div>
      </dl>
    </section>
  );
}

function iconForCard(card) {
  if (card.tone === "guide") return "guide";
  if (card.tone === "note") return "bookmark";
  if (card.tone === "summary") return "ink";
  if (
    card.tone === "reflection" ||
    card.tone === "reflection-user" ||
    card.tone === "reflection-answer" ||
    card.tone === "record"
  ) return "seal";
  if (card.tone === "book") return "books";
  return "companion";
}
