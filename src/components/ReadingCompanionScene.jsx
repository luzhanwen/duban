import ReadingCompanionAvatar from "./ReadingCompanionAvatar.jsx";

const VALID_EXPRESSIONS = new Set(["gentle", "curious", "focused", "cheerful", "thinking"]);

export default function ReadingCompanionScene({ stage = 4, expression = "gentle", state = "waiting" }) {
  const normalizedStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const normalizedExpression = VALID_EXPRESSIONS.has(expression) ? expression : "gentle";

  return (
    <div
      className={`reading-companion-scene-art cinnabar-companion-scene is-stage-${normalizedStage} expression-${normalizedExpression}`}
      aria-hidden="true"
    >
      <span className="cinnabar-companion-scene-rule" />
      <div className="cinnabar-companion-scene-mark">
        <ReadingCompanionAvatar stage={4} expression={normalizedExpression} variant="mark" state={state} />
      </div>
      <div className="cinnabar-companion-scene-standard">
        <ReadingCompanionAvatar stage={4} expression={normalizedExpression} variant="standard" state={state} />
      </div>
      <div className="cinnabar-companion-scene-full">
        <ReadingCompanionAvatar stage={4} expression={normalizedExpression} variant="full" state={state} />
      </div>
    </div>
  );
}
