/** Rolling 24h % change — baseline resets every UTC day. */
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
