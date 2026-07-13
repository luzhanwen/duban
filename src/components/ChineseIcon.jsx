const ICON_PATHS = {
  books: (
    <>
      <path d="M4.8 6.8c2.8-.8 5.1-.4 7.2 1.2v10c-2.1-1.6-4.4-2-7.2-1.2v-10Z" />
      <path d="M19.2 6.8c-2.8-.8-5.1-.4-7.2 1.2v10c2.1-1.6 4.4-2 7.2-1.2v-10Z" />
    </>
  ),
  seal: (
    <>
      <path d="M9.2 5.2h5.6v2.6c0 1.7.6 3.2 1.8 4.4l.8.8v1.6H6.6V13l.8-.8a6.2 6.2 0 0 0 1.8-4.4V5.2Z" />
      <path d="M5.6 16.8h12.8v2H5.6v-2Z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.2v-10" />
      <path d="m8.3 8.9 3.7-3.7 3.7 3.7" />
      <path d="M5.3 14.5v3.2c0 1 .8 1.8 1.8 1.8h9.8c1 0 1.8-.8 1.8-1.8v-3.2" />
    </>
  ),
  test: (
    <>
      <path d="M9.1 5.2h5.8M10 5.2v4.1l-4 7.4a1.5 1.5 0 0 0 1.3 2.2h9.4a1.5 1.5 0 0 0 1.3-2.2l-4-7.4V5.2" />
      <path d="M8.2 14.1h7.6" />
    </>
  ),
  page: (
    <>
      <path d="M7 5.2h7l3 3v10.6H7V5.2Z" />
      <path d="M14 5.2v3h3M9.5 12.1h5M9.5 15h3.5" />
    </>
  ),
  bookmark: (
    <>
      <path d="M8 5.3h8v13.4L12 16l-4 2.7V5.3Z" />
      <path d="M10.2 8.5h3.6M10.2 11.2h2.4" />
    </>
  ),
  guide: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="m15 9-1.8 4.2L9 15l1.8-4.2L15 9Z" />
      <path d="M12 5V3.8M12 20.2V19M5 12H3.8M20.2 12H19" />
    </>
  ),
  settings: (
    <>
      <path d="M5 7h5M14 7h5M5 12h9M18 12h1M5 17h2M11 17h8" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  config: (
    <>
      <path d="M9 5.2H8a2 2 0 0 0-2 2v2.1c0 1.1-.9 2-2 2 1.1 0 2 .9 2 2v2.1a2 2 0 0 0 2 2h1" />
      <path d="M15 5.2h1a2 2 0 0 1 2 2v2.1c0 1.1.9 2 2 2-1.1 0-2 .9-2 2v2.1a2 2 0 0 1-2 2h-1" />
      <circle cx="12" cy="8.2" r=".7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="11.3" r=".7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.4" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  scroll: (
    <>
      <path d="M12 5v14" />
      <path d="m8.6 8.4 3.4-3.4 3.4 3.4M8.6 15.6 12 19l3.4-3.4" />
    </>
  ),
  focus: (
    <>
      <path d="M9 5H6a1 1 0 0 0-1 1v3M15 5h3a1 1 0 0 1 1 1v3M19 15v3a1 1 0 0 1-1 1h-3M9 19H6a1 1 0 0 1-1-1v-3" />
      <path d="M9 12h6" />
    </>
  ),
  ink: (
    <>
      <path d="M7.1 15.6c1.4-3 3.2-5.5 5.4-7.5l2.9 2.9c-2 2.2-4.5 4-7.5 5.4l-.8-.8Z" />
      <path d="M13.8 6.9 16 4.7l3.3 3.3-2.2 2.2" />
      <path d="M5.3 19c2.6-.4 5-.5 7.2-.1" />
    </>
  ),
  archive: (
    <>
      <path d="M5.8 8.4h12.4v10H5.8v-10Z" />
      <path d="M7.1 5.6h9.8l1.3 2.8H5.8l1.3-2.8Z" />
      <path d="M9.2 11.3h5.6M9.2 14h3.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 4.9 18 7v4.7c0 3.3-2.2 5.7-6 7.4-3.8-1.7-6-4.1-6-7.4V7l6-2.1Z" />
      <path d="M9.4 12.1 11.2 14l3.5-4" />
    </>
  ),
  pulse: (
    <>
      <path d="M5.2 12h3.2l1.4-4.2 3.1 8.4 1.5-4.2h4.4" />
      <path d="M7 6.8a7 7 0 0 1 10 0M7 17.2a7 7 0 0 0 10 0" />
    </>
  ),
  update: (
    <>
      <path d="M12 5.2a6.8 6.8 0 0 1 6.2 4" />
      <path d="m18.3 6.3-.1 2.9-2.9-.2" />
      <path d="M12 18.8a6.8 6.8 0 0 1-6.2-4" />
      <path d="m5.7 17.7.1-2.9 2.9.2" />
      <path d="M12 8.4v7.2M9.4 13l2.6 2.6 2.6-2.6" />
    </>
  ),
  clear: (
    <>
      <path d="M8.1 8.5h7.8l-.6 9.2H8.7l-.6-9.2Z" />
      <path d="M6.8 8.5h10.4M10 8.5V6.4h4v2.1" />
      <path d="M10.2 11.3v3.8M13.8 11.3v3.8" />
    </>
  ),
  pace: (
    <>
      <path d="M12 6.2a6.2 6.2 0 1 1 0 12.4 6.2 6.2 0 0 1 0-12.4Z" />
      <path d="M12 8.8v3.7l2.5 1.5" />
      <path d="M7.7 5.5 6.2 7M16.3 5.5 17.8 7" />
    </>
  ),
  plan: (
    <>
      <rect x="5.3" y="6.7" width="13.4" height="12" rx="2" />
      <path d="M8.5 4.8v3.6M15.5 4.8v3.6M5.3 10.2h13.4" />
      <path d="M8.6 13h2M13.5 13h1.9M8.6 16h2" />
    </>
  ),
};

export default function ChineseIcon({
  name,
  className = "",
  title = "",
  decorative = true,
}) {
  const paths = ICON_PATHS[name] || ICON_PATHS.seal;
  const accessibilityProps = decorative
    ? { "aria-hidden": "true" }
    : { role: "img", "aria-label": title || name };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`chinese-icon ${className}`}
      {...accessibilityProps}
    >
      {paths}
    </svg>
  );
}
