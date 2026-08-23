/** Coerce to a finite number. NaN / Infinity / non-numeric → fallback. */
export function finiteNumber(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Integer ZOOM (or similar) for headers — never paints "NaN". */
export function formatZoomInt(n: unknown): string {
  return Math.floor(Math.max(0, finiteNumber(n))).toLocaleString();
}
