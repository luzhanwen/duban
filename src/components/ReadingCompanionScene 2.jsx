const VALID_EXPRESSIONS = new Set(["gentle", "curious", "focused", "cheerful", "thinking"]);

export default function ReadingCompanionScene({ stage = 4, expression = "gentle" }) {
  const normalizedStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const normalizedExpression = VALID_EXPRESSIONS.has(expression) ? expression : "gentle";

  return (
    <svg
      className={`reading-companion-scene-svg is-stage-${normalizedStage} expression-${normalizedExpression}`}
      viewBox="0 0 560 560"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="reading-companion-scene-paper-grain" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" seed="12" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0.7 0 0 0 0.16  0 0.58 0 0 0.11  0 0 0.36 0 0.04  0 0 0 0.16 0"
            result="warmGrain"
          />
          <feBlend in="SourceGraphic" in2="warmGrain" mode="multiply" />
        </filter>
      </defs>
      <g className="reading-companion-scene-bg">
        <rect x="20" y="20" width="520" height="520" rx="108" />
        <ellipse cx="282" cy="294" rx="198" ry="166" />
        <g className="reading-companion-scene-bg-grain">
          <circle cx="128" cy="121" r="1.2" />
          <circle cx="409" cy="132" r="1" />
          <circle cx="466" cy="240" r="1.4" />
          <circle cx="102" cy="338" r="1.1" />
          <circle cx="328" cy="473" r="1" />
        </g>
      </g>

      <g className="reading-companion-scene-lamp">
        <path className="scene-lamp-stand" d="M108 432 C108 334 114 261 172 225" />
        <path className="scene-lamp-base" d="M78 450 H144 C153 450 160 458 160 467 V474 H62 V467 C62 458 69 450 78 450 Z" />
        <path className="scene-lamp-neck" d="M153 222 C165 203 191 199 211 212" />
        <path className="scene-lamp-shade" d="M153 224 C166 190 232 194 250 228 C247 252 228 266 196 267 C170 267 153 251 153 224 Z" />
        <ellipse className="scene-lamp-light" cx="211" cy="248" rx="39" ry="23" />
        <path className="scene-lamp-glow" d="M150 262 C199 282 236 294 257 344 C205 346 158 325 130 285 Z" />
      </g>

      <g className="reading-companion-scene-note">
        <path d="M391 301 L474 323 L451 435 L368 411 Z" />
        <path d="M412 333 C425 329 437 331 449 338" />
        <path d="M408 351 C424 347 439 351 453 359" />
        <path d="M404 371 C419 367 433 370 446 378" />
      </g>

      <g className="reading-companion-scene-character">
        <g className="scene-page">
          <path
            className="scene-page-shadow"
            d="M193 122 H323 C334 122 344 126 352 134 L397 177 C406 186 411 198 411 211 V407 C411 424 398 437 381 437 H195 C178 437 165 424 165 407 V150 C165 134 178 122 193 122 Z"
          />
          <path
            className="scene-page-body"
            d="M184 114 H321 C333 114 344 118 353 127 L401 174 C411 184 417 198 417 212 V398 C417 417 402 432 383 432 H184 C165 432 150 417 150 398 V148 C150 129 165 114 184 114 Z"
          />
          <path className="scene-page-fold" d="M329 118 L414 202 H358 C342 202 329 189 329 173 Z" />
          <path className="scene-page-fold-line" d="M332 123 C351 154 377 181 413 201" />
          <path className="scene-page-highlight" d="M190 127 H304 C242 140 190 190 170 278 V151 C170 138 177 127 190 127 Z" />
        </g>

        <g className="scene-bookmark">
          <path d="M184 113 H224 V214 L204 194 L184 214 Z" />
        </g>

        <g className="scene-page-notes">
          <path d="M386 254 V286" />
          <path d="M374 345 H398" />
          <g className="scene-leaf-sprig">
            <path className="scene-sprig-stem" d="M384 323 C385 302 392 282 403 265" />
            <path className="scene-sprig-leaf" d="M383 304 C376 302 373 296 375 290 C382 291 386 297 383 304 Z" />
            <path className="scene-sprig-leaf" d="M392 290 C399 288 403 283 405 276 C398 277 393 283 392 290 Z" />
            <path className="scene-sprig-leaf" d="M381 316 C374 315 369 311 368 305 C376 305 381 310 381 316 Z" />
          </g>
        </g>

        <g className="scene-face">
          <path className="scene-brow scene-brow-left" d="M207 290 C216 287 224 287 232 290" />
          <path className="scene-brow scene-brow-right" d="M296 290 C304 287 313 287 322 290" />
          <ellipse className="scene-eye scene-eye-left" cx="218" cy="316" rx="8.5" ry="15" />
          <ellipse className="scene-eye scene-eye-right" cx="310" cy="316" rx="8.5" ry="15" />
          <path className="scene-mouth scene-mouth-gentle" d="M260 345 C268 353 282 353 290 345" />
          <path className="scene-mouth scene-mouth-curious" d="M271 347 C271 342 279 342 279 347 C279 352 271 352 271 347 Z" />
          <path className="scene-mouth scene-mouth-focused" d="M263 348 H288" />
          <path className="scene-mouth scene-mouth-cheerful" d="M255 343 C264 360 286 360 295 343" />
          <path className="scene-mouth scene-mouth-thinking" d="M257 353 C266 342 284 342 293 353" />
        </g>
      </g>

      <g className="reading-companion-scene-book">
        <path className="scene-book-cover-left" d="M90 417 C162 414 224 427 278 464 L272 498 C211 471 148 465 84 470 Z" />
        <path className="scene-book-cover-right" d="M278 464 C335 428 401 415 475 419 L482 472 C416 465 351 472 286 499 Z" />
        <path className="scene-book-page-left" d="M105 386 C177 384 235 407 278 455 C220 430 158 420 96 424 Z" />
        <path className="scene-book-page-right" d="M278 455 C327 410 390 386 462 389 L471 424 C407 419 344 430 286 455 Z" />
        <path className="scene-book-center" d="M268 456 C273 448 283 448 290 456 C290 472 286 486 279 496 C272 486 268 472 268 456 Z" />
        <path className="scene-book-lines-left" d="M128 398 C177 399 220 413 253 434" />
        <path className="scene-book-lines-right" d="M309 434 C347 412 391 401 439 400" />
      </g>

      <g className="reading-companion-scene-front-note">
        <path d="M351 417 H405 V486 H351 Z" />
        <g className="scene-leaf-sprig scene-front-note-sprig">
          <path className="scene-sprig-stem" d="M379 462 C380 449 384 439 391 431" />
          <path className="scene-sprig-leaf" d="M381 450 C375 449 371 444 371 439 C378 439 383 444 381 450 Z" />
          <path className="scene-sprig-leaf" d="M385 440 C391 438 395 434 396 429 C390 429 385 434 385 440 Z" />
        </g>
        <path d="M374 475 C383 475 391 478 398 482" />
      </g>
    </svg>
  );
}
