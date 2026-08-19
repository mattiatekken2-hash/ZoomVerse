/** Heuristic for older phones / tight GPU budgets (Telegram WebView). */
export function isLowEndDevice(): boolean {
  if (typeof window === "undefined") return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return window.innerWidth <= 430 || cores <= 4 || mem <= 4;
}

export function planetThumbGlBudget(): number {
  return isLowEndDevice() ? 12 : 24;
}
