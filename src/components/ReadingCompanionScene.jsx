const VALID_EXPRESSIONS = new Set(["gentle", "curious", "focused", "cheerful", "thinking"]);

const SCENE_ASSETS = [
  {
    key: "lamp",
    src: "/companion-assets/lamp-cutout.png",
    className: "reading-companion-scene-layer-lamp",
    revealStage: 3,
  },
  {
    key: "notes",
    src: "/companion-assets/back-notes-cutout.png",
    className: "reading-companion-scene-layer-notes",
    revealStage: 4,
  },
  {
    key: "character",
    src: "/companion-assets/page-character-cutout.png",
    className: "reading-companion-scene-layer-character",
    revealStage: 0,
  },
  {
    key: "book",
    src: "/companion-assets/open-book-cutout.png",
    className: "reading-companion-scene-layer-book",
    revealStage: 2,
  },
];

export default function ReadingCompanionScene({ stage = 4, expression = "gentle" }) {
  const normalizedStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const normalizedExpression = VALID_EXPRESSIONS.has(expression) ? expression : "gentle";

  return (
    <div
      className={`reading-companion-scene-art is-stage-${normalizedStage} expression-${normalizedExpression}`}
      aria-hidden="true"
    >
      <div className="reading-companion-scene-paper" />
      <div className="reading-companion-scene-warmth" />
      {SCENE_ASSETS.map((asset) => (
        <img
          key={asset.key}
          className={`reading-companion-scene-layer ${asset.className} ${
            normalizedStage >= asset.revealStage ? "is-visible" : ""
          }`}
          src={asset.src}
          alt=""
          draggable="false"
        />
      ))}
    </div>
  );
}
