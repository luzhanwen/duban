const VALID_EXPRESSIONS = new Set(["gentle", "curious", "focused", "cheerful", "thinking"]);

export default function ReadingCompanionAvatar({ stage = 4, expression = "gentle" }) {
  const normalizedStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const normalizedExpression = VALID_EXPRESSIONS.has(expression) ? expression : "gentle";

  return (
    <svg
      className={`reading-companion-avatar-svg is-stage-${normalizedStage} expression-${normalizedExpression}`}
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
    >
      <g className="reading-companion-layer reading-companion-bg">
        <rect className="reading-companion-bg-panel" x="22" y="22" width="212" height="212" rx="46" />
        <ellipse className="reading-companion-bg-glow" cx="128" cy="139" rx="82" ry="76" />
        <path className="reading-companion-bg-desk" d="M64 203 C90 214 165 214 194 203" />
      </g>

      <g className="reading-companion-character" transform="translate(0 -2)">
        <g className="reading-companion-layer reading-companion-page">
          <path
            className="reading-companion-page-shadow"
            d="M82 55 H161 L192 86 V191 C192 199 186 205 178 205 H85 C77 205 71 199 71 191 V66 C71 60 76 55 82 55 Z"
          />
          <path
            className="reading-companion-page-body"
            d="M78 50 H159 C166 50 172 53 177 58 L193 75 C198 80 201 87 201 94 V188 C201 197 194 204 185 204 H78 C69 204 62 197 62 188 V66 C62 57 69 50 78 50 Z"
          />
          <path
            className="reading-companion-page-highlight"
            d="M80 58 H151 C120 63 88 80 72 117 V69 C72 63 75 58 80 58 Z"
          />
          <path className="reading-companion-page-fold" d="M160 51 L199 88 H171 C164 88 160 84 160 77 Z" />
          <path className="reading-companion-page-fold-line" d="M162 54 C171 68 183 78 198 87" />
        </g>

        <g className="reading-companion-layer reading-companion-bookmark">
          <path className="reading-companion-bookmark-shadow" d="M94 50 H116 V116 L105 106 L94 116 Z" />
          <path className="reading-companion-bookmark-fill" d="M90 48 H114 V111 L102 99 L90 111 Z" />
        </g>

        <g className="reading-companion-layer reading-companion-expression">
          <path className="reading-companion-brow reading-companion-brow-left" d="M100 130 C105 128 110 128 115 130" />
          <path className="reading-companion-brow reading-companion-brow-right" d="M145 130 C150 128 155 128 160 130" />

          <g className="reading-companion-eye reading-companion-eye-left">
            <ellipse cx="108" cy="148" rx="5.5" ry="9.5" />
            <circle className="reading-companion-eye-shine" cx="106" cy="144" r="1.7" />
          </g>
          <g className="reading-companion-eye reading-companion-eye-right">
            <ellipse cx="152" cy="148" rx="5.5" ry="9.5" />
            <circle className="reading-companion-eye-shine" cx="150" cy="144" r="1.7" />
          </g>
          <path className="reading-companion-thinking-eye-crease" d="M161 140 C168 145 169 155 165 161" />

          <path className="reading-companion-mouth reading-companion-mouth-gentle" d="M122 165 C125 170 134 170 138 165" />
          <path className="reading-companion-mouth reading-companion-mouth-curious" d="M127 167 C127 164 132 164 132 167 C132 170 127 170 127 167 Z" />
          <path className="reading-companion-mouth reading-companion-mouth-focused" d="M124 167 L136 167" />
          <path className="reading-companion-mouth reading-companion-mouth-cheerful" d="M120 164 C123 173 136 173 140 164" />
          <path className="reading-companion-mouth reading-companion-mouth-thinking" d="M122 171 C126 165 135 165 139 171" />
        </g>

        <g className="reading-companion-layer reading-companion-margin-notes">
          <path className="reading-companion-note-line reading-companion-note-line-long" d="M174 126 V162" />
          <g className="reading-companion-note-sprig">
            <path className="reading-companion-sprig-stem" d="M177 160 C178 149 182 140 188 133" />
            <path className="reading-companion-sprig-leaf" d="M179 152 C174 151 172 146 173 142 C178 143 181 147 179 152 Z" />
            <path className="reading-companion-sprig-leaf" d="M183 144 C188 143 191 139 192 135 C187 135 183 139 183 144 Z" />
          </g>
        </g>
      </g>
    </svg>
  );
}
