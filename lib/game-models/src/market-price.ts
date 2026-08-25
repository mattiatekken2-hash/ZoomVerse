/** P2P listing currencies and bounds for Lab models. */

export const MARKET_PRICE_CURRENCIES = ["zmc", "gram", "zoom", "stardust"] as const;
export type MarketPriceCurrency = (typeof MARKET_PRICE_CURRENCIES)[number];

export const MARKET_PRICE_BOUNDS: Record<MarketPriceCurrency, { min: number; max: number; step: number }> = {
  /** P2P listings are $ZMC. No GRAM 0.05–2 cap. */
  zmc: { min: 1, max: 20_000_000, step: 1 },
  gram: { min: 1, max: 20_000_000, step: 1 },
  zoom: { min: 1, max: 20_000_000, step: 1 },
  stardust: { min: 1, max: 20_000_000, step: 1 },
};

export function isMarketPriceCurrency(v: unknown): v is MarketPriceCurrency {
  return v === "zmc" || v === "gram" || v === "zoom" || v === "stardust";
}

export function parseMarketPriceCurrency(v: unknown): MarketPriceCurrency {
  return isMarketPriceCurrency(v) ? v : "zmc";
}

export function marketPriceLabel(currency: MarketPriceCurrency): string {
  if (currency === "zmc") return "$ZMC";
  if (currency === "zoom") return "$ZOOM";
  if (currency === "stardust") return "★";
  return "GRAM";
}

export function formatMarketListingPrice(price: number, currency: MarketPriceCurrency): string {
  const n = Number(price);
  if (!Number.isFinite(n)) return "—";
  if (currency === "zmc") return `${Math.round(n).toLocaleString()} $ZMC`;
  if (currency === "gram") return `${n.toFixed(2)} GRAM`;
  if (currency === "zoom") return `${Math.round(n).toLocaleString()} $ZOOM`;
  return `${Math.round(n)} ★`;
}

export function isMarketPriceInRange(price: number, currency: MarketPriceCurrency): boolean {
  const b = MARKET_PRICE_BOUNDS[currency];
  return Number.isFinite(price) && price >= b.min && price <= b.max;
}

export function suggestMarketPrice(rate: number, currency: MarketPriceCurrency): number {
  const b = MARKET_PRICE_BOUNDS[currency];
  let raw: number;
  if (currency === "zmc") raw = Math.round(Math.max(b.min, Math.min(b.max, rate * 50)));
  else if (currency === "gram") raw = Math.round(Math.max(b.min, Math.min(b.max, rate * 50)));
  else if (currency === "zoom") raw = Math.round(Math.max(b.min, Math.min(b.max, rate * 18)));
  else raw = Math.round(Math.max(b.min, Math.min(b.max, rate >= 1 ? 5 : rate * 40)));
  return Math.min(b.max, Math.max(b.min, raw));
}
