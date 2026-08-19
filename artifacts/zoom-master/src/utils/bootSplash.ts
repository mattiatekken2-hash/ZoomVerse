/** Minimum splash duration from first HTML paint — not from React mount. */

export const SPLASH_MIN_MS = 2600;
export const SPLASH_MAX_MS = 6000;

declare global {
  interface Window {
    __zoomBootStart?: number;
  }
}

function bootStartMs(): number {
  if (typeof window === "undefined") return Date.now();
  if (typeof window.__zoomBootStart !== "number") {
    window.__zoomBootStart = Date.now();
  }
  return window.__zoomBootStart;
}

export function splashElapsedMs(): number {
  return Date.now() - bootStartMs();
}

export function splashRemainingMs(): number {
  return Math.max(0, SPLASH_MIN_MS - splashElapsedMs());
}

export function isSplashMinElapsed(): boolean {
  return splashRemainingMs() <= 0;
}
