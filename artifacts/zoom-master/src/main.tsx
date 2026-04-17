import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hapticLight } from "./utils/haptic";

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

// Fire a soft haptic on EVERY touch in the app — only skip when the user is
// actually typing in a text field (where buzzing on every keystroke would feel
// wrong). Everything else — scrolling, swiping, tapping any element — gets the
// gentle vibration so the whole game feels alive.
const NO_HAPTIC_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function tapHandler(e: Event) {
  const target = e.target as Element | null;
  if (target && NO_HAPTIC_TAGS.has(target.tagName)) return;
  if (target && (target as HTMLElement).isContentEditable) return;
  hapticLight();
}

// touchstart for mobile, pointerdown covers desktop / stylus / Telegram web.
document.addEventListener("touchstart", tapHandler, { passive: true });
document.addEventListener("pointerdown", tapHandler, { passive: true });

createRoot(document.getElementById("root")!).render(<App />);
