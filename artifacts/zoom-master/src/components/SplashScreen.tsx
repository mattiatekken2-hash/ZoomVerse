/** Boot splash — HTML preloader in index.html + React overlay until min display time. */

/** Fade out and remove the pre-React HTML splash (index.html). */
export function hideHtmlSplash() {
  try {
    const w = window as unknown as { __hideHtmlSplash?: () => void };
    if (typeof w.__hideHtmlSplash === "function") {
      w.__hideHtmlSplash();
      return;
    }
  } catch { /**/ }
  const splash = document.getElementById("splash-screen");
  if (!splash || splash.classList.contains("hidden")) return;
  splash.classList.add("hidden");
  window.setTimeout(() => splash.remove(), 500);
}

interface BootSplashOverlayProps {
  subtitle?: string;
}

/** Full-screen loading overlay — stays above the app until boot timer completes. */
export function BootSplashOverlay({ subtitle = "Season 3" }: BootSplashOverlayProps) {
  return (
    <div
      className="zoom-splash-screen"
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{ zIndex: 100000 }}
    >
      <div className="zoom-splash-inner">
        <div className="zoom-splash-spinner" aria-hidden />
        <div className="zoom-splash-title">Season 3</div>
        <div className="zoom-splash-sub">{subtitle}</div>
      </div>
    </div>
  );
}

/** @deprecated Use BootSplashOverlay during boot. */
export function SplashScreen() {
  return null;
}
