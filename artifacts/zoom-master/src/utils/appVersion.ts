// Forced auto-update for Telegram Mini App.
//
// Telegram caches the Mini App bundle aggressively inside its in-app webview,
// so a fresh publish often is NOT picked up by a plain reload. To work around
// this, every build is stamped with a unique `__BUILD_VERSION__` (injected by
// Vite `define`) and the same value is written to `version.json` in the build
// output. At runtime we fetch `version.json` (cache-busted) and, when it
// differs from the bundle we are currently running, force a reload with a
// cache-busting query param that defeats the webview's document cache.

declare const __BUILD_VERSION__: string;

const CURRENT_VERSION =
  typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "dev";

const RELOADED_KEY = "zoom-app-reloaded-version";

// In-memory latch: survives even when sessionStorage is unavailable, so a
// single page session never triggers more than one reload per target version.
let reloadedInMemory: string | null = null;

function forceReload(latest: string): void {
  // Guard against reload loops: if we already reloaded for this exact version
  // and the webview STILL served the old bundle (cache truly stuck), don't
  // loop forever — leave the user on the current version until the cache
  // clears on its own.
  if (reloadedInMemory === latest) return;

  // If the URL already carries this target version, a reload won't help.
  try {
    if (new URL(window.location.href).searchParams.get("v") === latest) return;
  } catch { /* malformed URL — fall through */ }

  try {
    if (sessionStorage.getItem(RELOADED_KEY) === latest) return;
    sessionStorage.setItem(RELOADED_KEY, latest);
  } catch { /* sessionStorage unavailable — in-memory latch still applies */ }

  reloadedInMemory = latest;

  try {
    const url = new URL(window.location.href);
    // A changing query string makes Telegram's webview treat this as a new
    // document and re-request index.html from the network (Telegram passes
    // initData via the URL hash, which we leave untouched).
    url.searchParams.set("v", latest);
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

async function checkOnce(): Promise<void> {
  try {
    const url = `${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    const latest = data?.version;
    if (latest && latest !== CURRENT_VERSION) {
      forceReload(latest);
    }
  } catch {
    /* offline / network blip — ignore, try again later */
  }
}

let started = false;

/**
 * Start watching for new published versions. Checks on load, whenever the app
 * regains focus (Telegram re-open), and on a slow periodic timer. No-op in dev.
 */
export function initVersionCheck(): void {
  if (started) return;
  started = true;
  if (!import.meta.env.PROD) return;

  void checkOnce();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void checkOnce();
  });
  window.addEventListener("focus", () => void checkOnce());
  setInterval(() => {
    if (!document.hidden) void checkOnce();
  }, 60_000);
}
