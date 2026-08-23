const RATE_KEY = "zoom-wallet-locked-ton-usd-v3";
const USDT_KEY = "zoom-wallet-frozen-gram-usdt-v3";

let lockedTonUsd: number | null = null;

function readStoredRate(): number | null {
  try {
    const v = parseFloat(sessionStorage.getItem(RATE_KEY) || "");
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeStoredRate(usd: number) {
  try {
    sessionStorage.setItem(RATE_KEY, String(usd));
  } catch { /**/ }
}

function bootLocked(): number | null {
  if (lockedTonUsd != null) return lockedTonUsd;
  const stored = readStoredRate();
  if (stored != null) lockedTonUsd = stored;
  return lockedTonUsd;
}

/** Locked TON/USD for wallet USDT. Once set, never changes this session. */
export function getLockedTonUsd(): number | null {
  return bootLocked();
}

/**
 * First valid Binance quote wins. Later CoinGecko/Binance ticks are ignored
 * so Rank↔Wallet cannot paint $127 then $135.
 */
export function lockTonUsd(usd: number): number | null {
  const existing = bootLocked();
  if (existing != null) return existing;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  lockedTonUsd = usd;
  writeStoredRate(usd);
  return usd;
}

export function pickWalletTonUsd(): number | null {
  return bootLocked();
}

function gramKey(gram: number): number {
  return Math.round(gram * 1e8) / 1e8;
}

function readFrozenUsdt(gram: number): string | null {
  try {
    const raw = sessionStorage.getItem(USDT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { g?: number; u?: string };
    if (typeof parsed.g !== "number" || typeof parsed.u !== "string" || !parsed.u) return null;
    if (Math.abs(parsed.g - gramKey(gram)) > 1e-8) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

function writeFrozenUsdt(gram: number, usd: string) {
  try {
    sessionStorage.setItem(USDT_KEY, JSON.stringify({ g: gramKey(gram), u: usd }));
  } catch { /**/ }
}

/**
 * GRAM card USDT: once painted for a GRAM amount, keep that string until
 * the GRAM balance actually changes (spend/credit). Rank↔Wallet remounts
 * and FX ticks cannot jump $127.59 → $135.20.
 */
export function paintFrozenGramUsdt(gram: number, rate: number | null): string | null {
  if (!Number.isFinite(gram) || gram <= 0) return null;
  const frozen = readFrozenUsdt(gram);
  if (frozen) return frozen;
  const r = rate ?? bootLocked();
  if (r == null || !Number.isFinite(r) || r <= 0) return null;
  const usd = (gram * r).toFixed(2);
  writeFrozenUsdt(gram, usd);
  return usd;
}
