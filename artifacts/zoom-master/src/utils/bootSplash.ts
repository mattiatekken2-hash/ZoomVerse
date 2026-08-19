/** Splash visible duration once React is ready — always from React mount, not page load. */

export const SPLASH_VISIBLE_MS = 2500;

let sessionStartMs: number | null = null;

/** Call once when the app shell mounts; returns the session start timestamp. */
export function beginSplashSession(): number {
  if (sessionStartMs === null) {
    sessionStartMs = Date.now();
  }
  return sessionStartMs;
}

export function splashSessionElapsedMs(startMs: number): number {
  return Date.now() - startMs;
}

export function splashSessionProgress(startMs: number): number {
  return Math.min(1, splashSessionElapsedMs(startMs) / SPLASH_VISIBLE_MS);
}

export function splashSessionRemainingMs(startMs: number): number {
  return Math.max(0, SPLASH_VISIBLE_MS - splashSessionElapsedMs(startMs));
}

export function isSplashSessionComplete(startMs: number): boolean {
  return splashSessionElapsedMs(startMs) >= SPLASH_VISIBLE_MS;
}
