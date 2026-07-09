export default function BrandLogo({ className = "", showWordmark = true }) {
  return (
    <span className={`inline-flex items-center gap-3 text-ink ${className}`}>
      <LogoMark className="h-10 w-10 shrink-0" />
      {showWordmark && (
        <span className="flex flex-col items-start leading-none">
          <BrandName className="text-[1.65rem] leading-none text-ink" />
          <span className="mt-1.5 text-[10px] font-medium uppercase text-ink-soft">DUBAN</span>
        </span>
      )}
    </span>
  );
}

export function BrandName({ className = "" }) {
  return <span className={`brand-script inline-block whitespace-nowrap align-baseline ${className}`}>读伴</span>;
}

export function BrandText({ children, className = "" }) {
  return <span className={className}>{renderBrandNameText(children, "brand-text")}</span>;
}

export function renderBrandNameText(value, keyPrefix = "brand-name") {
  const text = String(value ?? "");
  if (!text.includes("读伴")) return text;

  const segments = text.split("读伴");
  return segments.flatMap((part, index) => {
    const nodes = [];
    if (part) nodes.push(part);
    if (index < segments.length - 1) {
      nodes.push(<BrandName key={`${keyPrefix}-${index}`} />);
    }
    return nodes;
  });
}

export function LogoMark({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="logo-seal-soften" x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="9" />
          <feDisplacementMap in="SourceGraphic" scale="0.28" />
        </filter>
      </defs>
      <g
        className="logo-seal"
        filter="url(#logo-seal-soften)"
        stroke="#C64B37"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect className="logo-seal-frame" x="7.5" y="7.5" width="49" height="49" rx="8.5" strokeWidth="4.4" />
        <path className="logo-book-spread" d="M11.6 45.5C18.8 43.2 26.2 43.8 32 49.2C37.8 43.8 45.2 43.2 52.4 45.5" strokeWidth="4" />
        <path className="logo-book-gutter" d="M32 49.2V41.8" strokeWidth="2.8" />

        <g className="logo-cat" transform="translate(6.4 0)">
          <path
            className="logo-cat-head"
            d="M17.1 19.4L18.5 14.4L23.1 18.1C24.6 17.6 26.1 17.6 27.6 18.1L32.2 14.4L33.6 19.4C35.3 21.1 36.1 23.2 35.6 25.7C34.8 30.2 30.9 32.6 25.4 32.6C19.9 32.6 16 30.2 15.2 25.7C14.8 23.2 15.5 21.1 17.1 19.4Z"
            fill="#C64B37"
            strokeWidth="0"
          />
          <path className="logo-cat-face" d="M21.5 24.2C22.5 25.3 24.1 25.3 25.1 24.2M28.1 24.2C29.1 25.3 30.7 25.3 31.7 24.2M26.6 27.1C26 28.2 24.8 28.7 23.6 28.2M27.1 27.1C27.7 28.2 28.9 28.7 30.1 28.2" stroke="#FFF9EE" strokeWidth="1.65" />
          <path className="logo-cat-whiskers" d="M13.7 24.6H18.1M13.5 28L18.4 27.2M36.9 24.6H32.6M37.1 28L32.2 27.2" strokeWidth="1.8" />
          <path
            className="logo-cat-book"
            d="M17.2 34.2C21.1 32.4 24.8 33 27.2 35.6V44.3C24.4 42 20.6 41.5 17.2 43.1V34.2ZM27.2 35.6C30 33.1 33.7 32.8 37 34.2V43.1C33.5 41.5 29.8 42 27.2 44.3V35.6Z"
            fill="#C64B37"
            strokeWidth="0"
          />
          <path className="logo-cat-book-gutter" d="M27.2 35.8V44.2" stroke="#FFF9EE" strokeWidth="1.55" />
          <path className="logo-cat-tail" d="M18 42.5C13.1 43.7 12.2 38.9 14.9 36.9C17.4 35 20.2 37.7 17.5 39.9" strokeWidth="3" />
          <path className="logo-cat-paw-left" d="M18.6 34.7C17.1 33.3 15.4 33.7 15.2 35.7C15 37.5 16.1 38.8 17.8 39.2" strokeWidth="2.2" />
          <path className="logo-cat-paw-right" d="M35.2 34.7C36.6 33.3 38.2 33.8 38.4 35.8C38.6 37.5 37.5 38.8 35.9 39.2" strokeWidth="2.2" />
        </g>

      </g>
    </svg>
  );
}
