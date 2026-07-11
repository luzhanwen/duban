const ICON_PATHS = {
  books: (
    <>
      <path d="M5.5 6.5h6.2c1.2 0 2.1.3 2.8.9.7-.6 1.6-.9 2.8-.9h1.2v11.2h-1.2c-1.4 0-2.3.3-2.8.9-.5-.6-1.4-.9-2.8-.9H5.5V6.5Z" />
      <path d="M14.5 7.4v11.2" />
      <path d="M7.7 9.4h3.9M7.7 12h3.4M16.8 9.4h2.2M16.8 12h2.2" />
    </>
  ),
  seal: (
    <>
      <rect x="5.3" y="5.3" width="13.4" height="13.4" rx="2.4" />
      <path d="M8.4 9.2h7.2M9.2 12h5.6M8.4 14.8h7.2" />
      <path d="M16.2 16.1l1.2 1.2" />
    </>
  ),
  upload: (
    <>
      <path d="M6.2 17.8h11.6a1.5 1.5 0 0 0 1.5-1.5v-3" />
      <path d="M12 5.2v8.2M8.8 8.5 12 5.2l3.2 3.3" />
      <path d="M7.8 14.8h8.4" />
    </>
  ),
  sample: (
    <>
      <path d="M7.2 5.8h7.6a2 2 0 0 1 2 2v10.4H9.1a2 2 0 0 1-2-2V5.8Z" />
      <path d="M9.6 8.6h4.7M9.6 11.2h3.8" />
      <path d="M16.8 7.8h1.4v8.6a1.8 1.8 0 0 1-1.8 1.8" />
      <path d="M14.5 5.8v4l-1.2-.8-1.2.8v-4" />
    </>
  ),
  scroll: (
    <>
      <path d="M7.2 6.8h8.9a2.3 2.3 0 0 1 2.3 2.3v.4h-3.1V9a2.2 2.2 0 0 0-2.2-2.2H7.2Z" />
      <path d="M7.2 6.8v9.1a2.3 2.3 0 0 0 2.3 2.3h7.2" />
      <path d="M10 10.4h3.6M10 13h5.2M10 15.6h4" />
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
      <path d="M7 6.2h10v12.2H7V6.2Z" />
      <path d="M9.2 9h5.6M9.2 12h5.6M9.2 15h3.4" />
      <path d="M16.9 16.4l1.4 1.4" />
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
