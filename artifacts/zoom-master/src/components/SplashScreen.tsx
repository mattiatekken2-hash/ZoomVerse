/** Boot splash — full-screen overlay for a fixed duration, then the game appears. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SPLASH_MS } from "../utils/bootSplash";

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
  onComplete: () => void;
}

function BootSplashOverlayInner({ subtitle = "Season 3", onComplete }: BootSplashOverlayProps) {
  const [progress, setProgress] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let raf = 0;
    let done = false;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / SPLASH_MS);
      setProgress(pct);

      if (elapsed >= SPLASH_MS) {
        if (!done) {
          done = true;
          onCompleteRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

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

/** Full-screen loading overlay — portaled above the entire app. */
export function BootSplashOverlay(props: BootSplashOverlayProps) {
  if (typeof document === "undefined") return null;
  return createPortal(<BootSplashOverlayInner {...props} />, document.body);
}

export { SPLASH_MS };
