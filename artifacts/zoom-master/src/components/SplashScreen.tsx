/** Boot splash helpers — HTML splash in index.html stays visible until App dismisses it. */

/** Fade out and remove the pre-React HTML splash (index.html). */
export function hideHtmlSplash() {
  try {
    const w = window as unknown as { __hideHtmlSplash?: () => void };
    if (typeof w.__hideHtmlSplash === "function") {
      w.__hideHtmlSplash();
      return;
    }
  } catch { /**/ }
  const splash = document.getElementById("splash-screen");
  if (!splash || splash.classList.contains("hidden")) return;
  splash.classList.add("hidden");
  window.setTimeout(() => splash.remove(), 500);
}

/** @deprecated HTML splash is used during boot; React overlay is not rendered. */
export function SplashScreen() {
  return null;
}
