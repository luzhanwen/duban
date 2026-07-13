import BrandLogo from "./BrandLogo.jsx";

export default function SplashScreen({ leaving = false, toSetup = false }) {
  return (
    <div
      className={`splash-screen fixed inset-0 z-50 flex items-center justify-center ${
        leaving ? "splash-screen-leaving" : ""
      } ${toSetup ? "splash-screen-to-setup" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="读伴正在打开"
    >
      <BrandLogo
        variant="vertical"
        className="splash-logo"
        markClassName="splash-logo-mark"
        wordmarkClassName="splash-wordmark"
      />
    </div>
  );
}
