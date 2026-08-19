/** Boot splash timing — fixed duration from first HTML paint. */

export const SPLASH_DURATION_MS = 2400;
/** Absolute cap so the splash never blocks longer than ~3s. */
export const SPLASH_HARD_MAX_MS = 3000;

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

/** 0 → 1 loading progress (reaches 1 at SPLASH_DURATION_MS). */
export function splashProgress(): number {
  return Math.min(1, splashElapsedMs() / SPLASH_DURATION_MS);
}

export function msUntilSplashEnd(): number {
  const untilBar = SPLASH_DURATION_MS - splashElapsedMs();
  const untilCap = SPLASH_HARD_MAX_MS - splashElapsedMs();
  return Math.max(0, Math.min(untilBar, untilCap));
}

export function isSplashComplete(): boolean {
  return splashElapsedMs() >= SPLASH_DURATION_MS || splashElapsedMs() >= SPLASH_HARD_MAX_MS;
}
