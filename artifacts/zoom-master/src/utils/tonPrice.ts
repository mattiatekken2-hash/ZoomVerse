const CACHE_KEY = "zoom-ton-usd";
const CACHE_TS_KEY = "zoom-ton-usd-ts";
const CACHE_TTL_MS = 120_000;

export function readCachedTonPrice(): number | null {
  try {
    const ts = parseInt(sessionStorage.getItem(CACHE_TS_KEY) || "0", 10);
    if (!ts || Date.now() - ts > CACHE_TTL_MS) return null;
    const v = parseFloat(sessionStorage.getItem(CACHE_KEY) || "");
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Last known TON/USD — used for instant wallet paint while refreshing. */
export function readCachedTonPriceAllowStale(): number | null {
  try {
    const v = parseFloat(sessionStorage.getItem(CACHE_KEY) || "");
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeCachedTonPrice(price: number) {
  try {
    sessionStorage.setItem(CACHE_KEY, String(price));
    sessionStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch { /**/ }
}

/** Fetch live TON/USD price from CoinGecko. Returns null on failure. */
export async function fetchTonPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return readCachedTonPrice();
    const data = await res.json() as { "the-open-network"?: { usd?: number } };
    const price = data["the-open-network"]?.usd ?? null;
    if (price != null && Number.isFinite(price) && price > 0) {
      writeCachedTonPrice(price);
      return price;
    }
    return readCachedTonPrice();
  } catch {
    return readCachedTonPrice();
  }
}
