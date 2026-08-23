/** Heuristic for older phones / tight GPU budgets (Telegram WebView). */
export function isLowEndDevice(): boolean {
  if (typeof window === "undefined") return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 4 || mem <= 2;
}

export function planetThumbGlBudget(): number {
  // Desktop Chrome dies around 8 WebGL contexts (white/gray canvases).
  // Farm grid only needs the on-screen orbs.
  return isLowEndDevice() ? 4 : 8;
}
