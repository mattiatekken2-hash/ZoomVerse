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

document.addEventListener(
  "touchstart",
  (e) => {
    let el = e.target as Element | null;
    while (el && el !== document.body) {
      if (isScrollContainer(el)) return;
      const tag = el.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "SELECT" || tag === "LABEL") {
        hapticLight();
        return;
      }
      if (el.getAttribute("role") === "button" || el.getAttribute("tabindex") === "0") {
        hapticLight();
        return;
      }
      const style = window.getComputedStyle(el);
      if (style.cursor === "pointer") {
        hapticLight();
        return;
      }
      el = el.parentElement;
    }
  },
  { passive: true },
);

createRoot(document.getElementById("root")!).render(<App />);
