/** Rolling 24h % change — legacy UTC-day baseline (GRAM uses real chart via gramMarket). */
const PREFIX = "zoom-wallet-24h-";

interface Snapshot {
  value: number;
  dayUtc: number;
}

function utcDayIndex(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

function readSnapshot(key: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!Number.isFinite(parsed.value) || !Number.isFinite(parsed.dayUtc)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(key: string, snap: Snapshot) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(snap));
  } catch { /**/ }
}

/** Returns % change vs the value at the start of the current UTC day (0 right after reset). */
export function getRolling24hChange(key: string, current: number): number | null {
  if (!Number.isFinite(current) || current <= 0) return null;

  const dayUtc = utcDayIndex();
  const prev = readSnapshot(key);

  if (!prev || prev.dayUtc !== dayUtc) {
    writeSnapshot(key, { value: current, dayUtc });
    return 0;
  }

  if (prev.value <= 0) return null;
  return ((current - prev.value) / prev.value) * 100;
}

export function formatGramValue(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 0.0001) return n.toFixed(6);
  if (n < 1) return n.toFixed(4);
  if (n < 10_000) return n.toFixed(2);
  if (n < 1_000_000) return (n / 1_000).toFixed(2) + "K";
  return (n / 1_000_000).toFixed(2) + "M";
}

/** Full GRAM amount — never abbreviated with K/M. */
export function formatGramValueFull(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 0.000001) return n.toFixed(10);
  if (n < 0.0001) return n.toFixed(8);
  if (n < 0.01) return n.toFixed(6);
  if (n < 1) return n.toFixed(4);
  if (n < 10_000) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatChangePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * @deprecated Icons must stay fixed size — % change is shown as text only.
 * Kept returning 1 so any leftover callers don't resize emojis.
 */
export function chartIconScale(_changePct?: number | null): number {
  return 1;
}

/**
 * Live ZOOM price in GRAM. Wallet under-icon uses a fixed 8dp so ticks
 * match the chart instead of collapsing to a frozen 0.000001.
 */
export function formatZoomChartPrice(p: number | null | undefined, compact = false): string {
  if (p == null || !Number.isFinite(p) || p <= 0) return "—";
  if (p < 0.0001) {
    return p.toFixed(compact ? 8 : 10);
  }
  if (p < 1) return p.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return p.toFixed(2);
}

/** Stardust chart index — genesis is 1.000000. */
export function formatStardustChartIndex(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "1.000000";
  return n.toFixed(6);
}

/** GRAM (= TON) USD spot for the wallet GRAM chart. */
export function formatGramChartUsd(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p) || p <= 0) return "—";
  if (p < 1) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(2)}`;
}
