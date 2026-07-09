const VALID_EXPRESSIONS = new Set(["gentle", "curious", "focused", "cheerful", "thinking"]);

export default function ReadingCompanionAvatar({ stage = 4, expression = "gentle" }) {
  const normalizedStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const normalizedExpression = VALID_EXPRESSIONS.has(expression) ? expression : "gentle";

  return (
    <div
      className={`reading-companion-avatar-art is-stage-${normalizedStage} expression-${normalizedExpression}`}
      aria-hidden="true"
    >
      <div className="reading-companion-avatar-paper" />
      <img
        className="reading-companion-avatar-image"
        src="/companion-assets/page-character-cutout.png"
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
