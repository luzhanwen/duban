import { normalizeCompanionVisualState } from "../lib/companionVisualState.js";

const VALID_EXPRESSIONS = new Set(["gentle", "curious", "focused", "cheerful", "thinking"]);
const VALID_VARIANTS = new Set(["full", "standard", "mark"]);
const VARIANT_ASSETS = {
  full: "/companion-assets/cinnabar-companion-full-v2.png",
  standard: "/companion-assets/cinnabar-companion-standard-v2.png",
  mark: "/companion-assets/cinnabar-companion-mark-v2.png",
};

export default function ReadingCompanionAvatar({
  stage = 4,
  expression = "gentle",
  variant = "standard",
  state = "quiet",
}) {
  const normalizedStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const normalizedExpression = VALID_EXPRESSIONS.has(expression) ? expression : "gentle";
  const normalizedVariant = VALID_VARIANTS.has(variant) ? variant : "standard";
  const normalizedState = normalizeCompanionVisualState(state);

  return (
    <div
      className={`reading-companion-avatar-art is-stage-${normalizedStage} expression-${normalizedExpression} variant-${normalizedVariant} state-${normalizedState}`}
      data-companion-state={normalizedState}
      aria-hidden="true"
    >
      <img
        className="reading-companion-avatar-image"
        src={VARIANT_ASSETS[normalizedVariant]}
        alt=""
        draggable="false"
      />
      <span className="reading-companion-avatar-thought" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
