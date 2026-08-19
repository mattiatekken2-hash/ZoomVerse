/** Fixed splash duration — timer lives outside React so remounts cannot cancel it. */
export const SPLASH_MS = 2000;

type SplashListener = (progress: number) => void;
type SplashDoneListener = () => void;

let startedAt = 0;
let timerStarted = false;
let finished = false;
const progressListeners = new Set<SplashListener>();
const doneListeners = new Set<SplashDoneListener>();
let rafId = 0;
let timeoutId = 0;
let pollId = 0;

function splashStartMs(): number {
  try {
    const pinned = (window as unknown as { __zoomSplashStart?: number }).__zoomSplashStart;
    if (typeof pinned === "number" && Number.isFinite(pinned)) return pinned;
  } catch { /**/ }
  return performance.now();
}

function markFinishedGlobal(): void {
  try {
    (window as unknown as { __zoomSplashFinished?: boolean }).__zoomSplashFinished = true;
  } catch { /**/ }
}

function readFinishedGlobal(): boolean {
  try {
    return !!(window as unknown as { __zoomSplashFinished?: boolean }).__zoomSplashFinished;
  } catch {
    return false;
  }
}

function elapsedMs(): number {
  return performance.now() - startedAt;
}

function currentProgress(): number {
  return Math.min(1, elapsedMs() / SPLASH_MS);
}

function notifyProgress() {
  const progress = finished ? 1 : currentProgress();
  progressListeners.forEach((fn) => fn(progress));
}

export function finishSplashTimer(): void {
  if (finished) return;
  finished = true;
  markFinishedGlobal();
  if (rafId) cancelAnimationFrame(rafId);
  if (timeoutId) window.clearTimeout(timeoutId);
  if (pollId) window.clearInterval(pollId);
  progressListeners.forEach((fn) => fn(1));
  doneListeners.forEach((fn) => {
    try { fn(); } catch { /**/ }
  });
  progressListeners.clear();
  doneListeners.clear();
  try {
    window.dispatchEvent(new Event("zoom-splash-done"));
  } catch { /**/ }
}

function tick(): void {
  if (finished) return;
  notifyProgress();
  if (elapsedMs() >= SPLASH_MS) {
    finishSplashTimer();
    return;
  }
  rafId = requestAnimationFrame(tick);
}

/** Start the one-shot splash clock (safe to call multiple times). */
export function ensureSplashTimer(): void {
  if (finished || readFinishedGlobal()) {
    finished = true;
    return;
  }
  if (timerStarted) return;
  timerStarted = true;
  startedAt = splashStartMs();

  if (elapsedMs() >= SPLASH_MS) {
    finishSplashTimer();
    return;
  }

  rafId = requestAnimationFrame(tick);
  timeoutId = window.setTimeout(finishSplashTimer, Math.max(0, SPLASH_MS - elapsedMs()));
  // Backup for WebViews that throttle rAF/setTimeout (Telegram iOS).
  pollId = window.setInterval(() => {
    if (elapsedMs() >= SPLASH_MS) finishSplashTimer();
  }, 100);
}

export function subscribeSplashProgress(fn: SplashListener): () => void {
  ensureSplashTimer();
  fn(finished ? 1 : currentProgress());
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

export function subscribeSplashDone(fn: SplashDoneListener): () => void {
  if (finished || readFinishedGlobal()) {
    finished = true;
    fn();
    return () => {};
  }
  ensureSplashTimer();
  doneListeners.add(fn);
  return () => doneListeners.delete(fn);
}

export function isSplashFinished(): boolean {
  if (finished || readFinishedGlobal()) return true;
  ensureSplashTimer();
  return elapsedMs() >= SPLASH_MS;
}

declare global {
  interface Window {
    __zoomSplashStart?: number;
    __zoomSplashFinished?: boolean;
    __onZoomSplashDone?: () => void;
  }
}

/** Called from index.html when the inline 2s timer fires (backup path). */
export function wireHtmlSplashDoneHook(): void {
  window.__onZoomSplashDone = finishSplashTimer;
}

wireHtmlSplashDoneHook();
