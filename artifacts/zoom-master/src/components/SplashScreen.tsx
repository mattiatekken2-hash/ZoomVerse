/** Fade out and remove the pre-React HTML splash (index.html). */
export function hideHtmlSplash() {
  try {
    const w = window as unknown as { __hideHtmlSplash?: () => void };
    if (typeof w.__hideHtmlSplash === "function") {
      w.__hideHtmlSplash();
    }
  } catch { /**/ }

  const splash = document.getElementById("splash-screen");
  if (!splash) return;
  splash.classList.add("hidden");
  splash.style.display = "none";
  try { splash.remove(); } catch { /**/ }
}

export const SPLASH_MS = 2000;
