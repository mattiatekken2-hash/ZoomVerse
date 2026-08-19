/** Boot splash — Season 3 spinner shown while Telegram mini-app initializes. */
import { useEffect } from "react";

export function SplashScreen() {
  useEffect(() => {
    hideHtmlSplash();
  }, []);

  return (
    <div
      className="zoom-splash-screen"
      role="status"
      aria-live="polite"
      aria-label="Season 3 loading"
    >
      <div className="zoom-splash-inner">
        <div className="zoom-splash-spinner" aria-hidden />
        <div className="zoom-splash-title">Season 3</div>
        <div className="zoom-splash-sub">Entra in gioco</div>
      </div>
    </div>
  );
}

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
