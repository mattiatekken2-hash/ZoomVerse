/** Boot splash — HTML preloader in index.html + React overlay until min display time. */

import { createPortal } from "react-dom";
import { isSplashMinElapsed } from "../utils/bootSplash";

/** Fade out and remove the pre-React HTML splash (index.html). */
export function hideHtmlSplash() {
  if (!isSplashMinElapsed()) return;
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

function BootSplashOverlayInner({ subtitle = "Season 3" }: BootSplashOverlayProps) {
  return (
    <div
      className="zoom-splash-screen"
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{ zIndex: 2147483646 }}
    >
      <div className="zoom-splash-inner">
        <div className="zoom-splash-spinner" aria-hidden />
        <div className="zoom-splash-title">Season 3</div>
        <div className="zoom-splash-sub">{subtitle}</div>
      </div>
    </div>
  );
}

/** Full-screen loading overlay — portaled above the entire app until boot timer completes. */
export function BootSplashOverlay(props: BootSplashOverlayProps) {
  if (typeof document === "undefined") return null;
  return createPortal(<BootSplashOverlayInner {...props} />, document.body);
}

/** @deprecated Use BootSplashOverlay during boot. */
export function SplashScreen() {
  return null;
}
