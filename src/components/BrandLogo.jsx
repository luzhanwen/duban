export default function BrandLogo({ className = "", showWordmark = true }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-ink ${className}`}>
      <LogoMark className="h-9 w-9 shrink-0" />
      {showWordmark && (
        <span className="flex flex-col items-start leading-none">
          <BrandName className="text-xl leading-none text-ink" />
          <span className="mt-1 text-[10px] font-medium uppercase text-ink-soft">Duban</span>
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
      <rect className="logo-frame-fill" x="5" y="5" width="54" height="54" rx="14" fill="#FFFDF8" />
      <rect
        className="logo-frame-line"
        x="5"
        y="5"
        width="54"
        height="54"
        rx="14"
        stroke="#E6DDCF"
        strokeWidth="2"
      />
      <path
        className="logo-page-left"
        d="M18 20.5C23.1 18.2 28 18.8 32 22.3V47C28 43.6 23 42.9 18 45.2V20.5Z"
        fill="#F7F3EC"
        stroke="#2B2622"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <path
        className="logo-page-right"
        d="M46 20.5C40.9 18.2 36 18.8 32 22.3V47C36 43.6 41 42.9 46 45.2V20.5Z"
        fill="#F7F3EC"
        stroke="#2B2622"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <path
        className="logo-page-lines logo-page-lines-left"
        d="M23 27.5H27.8M23 33H28.8"
        stroke="#9C6B3F"
        strokeLinecap="round"
        strokeWidth="2.3"
      />
      <path
        className="logo-page-lines logo-page-lines-right"
        d="M39.8 27.5H41.2M36.3 33H41.2"
        stroke="#9C6B3F"
        strokeLinecap="round"
        strokeWidth="2.3"
      />
      <path
        className="logo-bubble"
        d="M39.3 16.5C44.9 16.5 49.5 20.1 49.5 24.6C49.5 27.5 47.6 30 44.8 31.4L45.4 36L40.9 32.6H39.3C33.6 32.6 29 29 29 24.6C29 20.1 33.6 16.5 39.3 16.5Z"
        fill="#9C6B3F"
        stroke="#FFFDF8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <circle className="logo-bubble-dot logo-bubble-dot-1" cx="36.2" cy="24.7" r="1.35" fill="#FFFDF8" />
      <circle className="logo-bubble-dot logo-bubble-dot-2" cx="40.2" cy="24.7" r="1.35" fill="#FFFDF8" />
      <circle className="logo-bubble-dot logo-bubble-dot-3" cx="44.2" cy="24.7" r="1.35" fill="#FFFDF8" />
    </svg>
  );
}
