import { BrandName, LogoMark } from "./BrandLogo.jsx";

export default function SplashScreen({ leaving = false }) {
  return (
    <div
      className={`splash-screen fixed inset-0 z-50 flex items-center justify-center ${
        leaving ? "splash-screen-leaving" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-label="读伴正在打开"
    >
      <div className="splash-logo flex flex-col items-center">
        <LogoMark className="splash-logo-mark h-28 w-28" />
        <div className="splash-wordmark mt-5 flex flex-col items-center">
          <BrandName className="text-5xl leading-none text-ink" />
          <span className="mt-2 text-[11px] font-medium uppercase text-ink-soft">DUBAN</span>
        </div>
      </div>
    </div>
  );
}
