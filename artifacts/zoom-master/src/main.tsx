import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hapticLight } from "./utils/haptic";
import { BootErrorBoundary } from "./components/BootErrorBoundary";
import { clearLabForgeTestPizzaFlag } from "@workspace/game-models";
import { hideHtmlSplash } from "./components/SplashScreen";
import { SPLASH_MS } from "./utils/bootSplash";

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

try { clearLabForgeTestPizzaFlag(); } catch { /**/ }

{
  const start =
    (window as unknown as { __zoomSplashStart?: number }).__zoomSplashStart ??
    performance.now();
  const remaining = Math.max(0, SPLASH_MS - (performance.now() - start));
  window.setTimeout(hideHtmlSplash, remaining);
}

const SCROLL_TAGS = new Set(["HTML", "BODY"]);
const SCROLL_CLASSES = ["overflow-y-auto", "overflow-auto", "overflow-x-auto"];

function isScrollContainer(el: Element): boolean {
  if (SCROLL_TAGS.has(el.tagName)) return false;
  const cls = el.className ?? "";
  if (typeof cls === "string" && SCROLL_CLASSES.some((c) => cls.includes(c))) return true;
  const style = window.getComputedStyle(el);
  return style.overflowY === "auto" || style.overflowY === "scroll";
}

// Soft haptic on real taps (buttons, cards, canvas thumbs). Skip scrolls/swipes
// and typing. Canvas is included so Farm/Market/studio taps buzz; Lab START BUILD
// and Auto Tap opt out with data-no-global-haptic because they call hapticLight.
const NO_HAPTIC_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const TAP_MAX_MOVE = 22;
const TAP_MAX_MS = 700;
const INTERACTIVE_SEL =
  "button, a, [role='button'], [role='tab'], [role='menuitem'], summary, label, input[type='button'], input[type='submit'], input[type='checkbox'], input[type='radio']";

function shouldSkipGlobalHaptic(target: Element | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  if (NO_HAPTIC_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  if (el.closest("[data-no-global-haptic]")) return true;
  return false;
}

function isInteractiveTap(target: Element | null): boolean {
  if (!target) return false;
  return !!(target as HTMLElement).closest(INTERACTIVE_SEL);
}

let pStartX = 0;
let pStartY = 0;
let pStartT = 0;
let pMoved = false;
let pDown = false;
let pBuzzed = false;

document.addEventListener(
  "pointerdown",
  (e: PointerEvent) => {
    if (!e.isPrimary) return;
    pStartX = e.clientX;
    pStartY = e.clientY;
    pStartT = Date.now();
    pMoved = false;
    pDown = true;
    pBuzzed = false;
    const target = e.target as Element | null;
    if (shouldSkipGlobalHaptic(target)) return;
    if (!isInteractiveTap(target)) return;
    pBuzzed = true;
    hapticLight();
  },
  { passive: true },
);

document.addEventListener(
  "pointermove",
  (e: PointerEvent) => {
    if (!pDown || pMoved || !e.isPrimary) return;
    if (
      Math.abs(e.clientX - pStartX) > TAP_MAX_MOVE ||
      Math.abs(e.clientY - pStartY) > TAP_MAX_MOVE
    ) {
      pMoved = true;
    }
  },
  { passive: true },
);

document.addEventListener(
  "pointerup",
  (e: PointerEvent) => {
    if (!pDown || !e.isPrimary) return;
    pDown = false;
    if (pBuzzed || pMoved) return;
    if (Date.now() - pStartT > TAP_MAX_MS) return;
    const target = e.target as Element | null;
    if (shouldSkipGlobalHaptic(target)) return;
    hapticLight();
  },
  { passive: true },
);

document.addEventListener(
  "pointercancel",
  (e: PointerEvent) => {
    if (!e.isPrimary) return;
    pDown = false;
  },
  { passive: true },
);

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Missing #root element");
  createRoot(rootEl).render(
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>,
  );
  (window as unknown as { __zoomReactBooted?: boolean }).__zoomReactBooted = true;
} catch (err) {
  console.error("[boot] React mount failed:", err);
  try {
    (window as unknown as { __hideHtmlSplash?: () => void }).__hideHtmlSplash?.();
    const rootEl = document.getElementById("root");
    if (rootEl) {
      rootEl.innerHTML =
        '<div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:#060810;color:#e0e6ff;font-family:system-ui,sans-serif;text-align:center">' +
        '<div style="font-size:17px;font-weight:800">Errore di avvio</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.55)">Chiudi e riapri da Telegram</div>' +
        '<button type="button" onclick="location.reload()" style="margin-top:8px;padding:12px 24px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-weight:700">Riprova</button>' +
        "</div>";
    }
  } catch { /**/ }
}

