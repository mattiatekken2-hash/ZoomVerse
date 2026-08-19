import { useT } from "../i18n/LanguageContext";

/** Boot splash — Season 3 spinner shown while Telegram mini-app initializes. */
export function SplashScreen() {
  const { t } = useT();
  return (
    <div
      className="zoom-splash-screen"
      role="status"
      aria-live="polite"
      aria-label={t("splash.loadingAria")}
    >
      <div className="zoom-splash-inner">
        <div className="zoom-splash-spinner" aria-hidden />
        <div className="zoom-splash-title">{t("splash.title")}</div>
        <div className="zoom-splash-sub">{t("splash.sub")}</div>
      </div>
    </div>
  );
}

/** Fade out and remove the pre-React HTML splash (index.html). */
export function hideHtmlSplash() {
  const splash = document.getElementById("splash-screen");
  if (!splash || splash.classList.contains("hidden")) return;
  splash.classList.add("hidden");
  window.setTimeout(() => splash.remove(), 700);
}
