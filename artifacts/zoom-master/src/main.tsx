import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hapticLight } from "./utils/haptic";
import { initVersionCheck } from "./utils/appVersion";

// Force-update guard: reloads the app when a newer build has been published,
// defeating Telegram's webview cache. No-op in development.
initVersionCheck();

function configureTelegramViewport() {
  try {
    const webApp = (window as unknown as {
      Telegram?: {
        WebApp?: {
          ready?: () => void;
          expand?: () => void;
          requestFullscreen?: () => void;
          isFullscreen?: boolean;
          setHeaderColor?: (color: string) => void;
          setBackgroundColor?: (color: string) => void;
          setBottomBarColor?: (color: string) => void;
          disableVerticalSwipes?: () => void;
          isVerticalSwipesEnabled?: boolean;
          version?: string;
          onEvent?: (event: string, cb: () => void) => void;
        };
      };
    }).Telegram?.WebApp;
    if (!webApp) return;

    webApp.setHeaderColor?.("#060810");
    webApp.setBackgroundColor?.("#060810");
    webApp.setBottomBarColor?.("#060810");
    webApp.disableVerticalSwipes?.();
    webApp.expand?.();
    webApp.ready?.();

    const tryFullscreen = () => {
      try {
        if (webApp.requestFullscreen && !webApp.isFullscreen) {
          webApp.requestFullscreen();
        }
      } catch { /**/ }
    };

    tryFullscreen();
    requestAnimationFrame(() => { webApp.expand?.(); tryFullscreen(); });
    setTimeout(() => { webApp.expand?.(); tryFullscreen(); }, 300);
    setTimeout(tryFullscreen, 800);
  } catch { /**/ }
}

configureTelegramViewport();

const SCROLL_TAGS = new Set(["HTML", "BODY"]);
const SCROLL_CLASSES = ["overflow-y-auto", "overflow-auto", "overflow-x-auto"];

function isScrollContainer(el: Element): boolean {
  if (SCROLL_TAGS.has(el.tagName)) return false;
  const cls = el.className ?? "";
  if (typeof cls === "string" && SCROLL_CLASSES.some((c) => cls.includes(c))) return true;
  const style = window.getComputedStyle(el);
  return style.overflowY === "auto" || style.overflowY === "scroll";
}

// Fire a soft haptic only on real TAPS — never on scrolls/swipes. We track the
// finger position from touchstart and only buzz on touchend if it didn't move
// (≤ 10px) and was quick (≤ 500ms). Skip when typing in a text field.
const NO_HAPTIC_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const TAP_MAX_MOVE = 10;
const TAP_MAX_MS = 500;

let tapStartX = 0;
let tapStartY = 0;
let tapStartT = 0;
let tapMoved = false;

document.addEventListener(
  "touchstart",
  (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      tapMoved = true;
      return;
    }
    const t = e.touches[0];
    tapStartX = t.clientX;
    tapStartY = t.clientY;
    tapStartT = Date.now();
    tapMoved = false;
  },
  { passive: true },
);

document.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    if (tapMoved || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (
      Math.abs(t.clientX - tapStartX) > TAP_MAX_MOVE ||
      Math.abs(t.clientY - tapStartY) > TAP_MAX_MOVE
    ) {
      tapMoved = true;
    }
  },
  { passive: true },
);

document.addEventListener(
  "touchend",
  (e: TouchEvent) => {
    if (tapMoved) return;
    if (Date.now() - tapStartT > TAP_MAX_MS) return;
    const target = e.target as Element | null;
    if (target && NO_HAPTIC_TAGS.has(target.tagName)) return;
    if (target && (target as HTMLElement).isContentEditable) return;
    hapticLight();
  },
  { passive: true },
);

// Desktop / stylus / Telegram web — pointer events with the same checks.
let pStartX = 0;
let pStartY = 0;
let pStartT = 0;
let pMoved = false;
let pDown = false;

document.addEventListener("pointerdown", (e: PointerEvent) => {
  if (e.pointerType === "touch") return; // touch handled above
  pStartX = e.clientX;
  pStartY = e.clientY;
  pStartT = Date.now();
  pMoved = false;
  pDown = true;
});

document.addEventListener("pointermove", (e: PointerEvent) => {
  if (!pDown || pMoved) return;
  if (
    Math.abs(e.clientX - pStartX) > TAP_MAX_MOVE ||
    Math.abs(e.clientY - pStartY) > TAP_MAX_MOVE
  ) {
    pMoved = true;
  }
});

document.addEventListener("pointerup", (e: PointerEvent) => {
  if (!pDown) return;
  pDown = false;
  if (e.pointerType === "touch") return;
  if (pMoved) return;
  if (Date.now() - pStartT > TAP_MAX_MS) return;
  const target = e.target as Element | null;
  if (target && NO_HAPTIC_TAGS.has(target.tagName)) return;
  if (target && (target as HTMLElement).isContentEditable) return;
  hapticLight();
});

createRoot(document.getElementById("root")!).render(<App />);

// Hide the HTML splash screen once React has mounted and loaded enough.
// React mounts the first components immediately, but data is still fetching.
// We wait 1.2s after mount so the user sees the splash screen briefly even
// on fast connections, then fade it out.
window.addEventListener("load", () => {
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      splash.classList.add("hidden");
      setTimeout(() => splash.remove(), 700);
    }
  }, 1200);
});
