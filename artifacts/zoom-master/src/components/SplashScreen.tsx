/** Boot splash — full-screen overlay for a fixed duration, then the game appears. */

import { useEffect, useState } from "react";
import { subscribeSplashProgress } from "../utils/bootSplash";

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
  window.setTimeout(() => splash.remove(), 400);
}

interface BootSplashOverlayProps {
  subtitle?: string;
}

/** Full-screen loading overlay — rendered inline (no portal) for WebView reliability. */
export function BootSplashOverlay({ subtitle = "Season 3" }: Omit<BootSplashOverlayProps, "onComplete">) {
  const [progress, setProgress] = useState(0);

  useEffect(() => subscribeSplashProgress(setProgress), []);

  return (
    <div
      className="zoom-splash-screen"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="Loading game"
      style={{ zIndex: 2147483646 }}
    >
      <div className="zoom-splash-inner">
        <div className="zoom-splash-spinner" aria-hidden />
        <div className="zoom-splash-title">Season 3</div>
        <div className="zoom-splash-sub">{subtitle}</div>
      </div>

      <div className="zoom-splash-bar-wrap" aria-hidden>
        <div className="zoom-splash-bar-track">
          <div
            className="zoom-splash-bar-fill"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      </div>
    </div>
  );
}

export { SPLASH_MS } from "../utils/bootSplash";
