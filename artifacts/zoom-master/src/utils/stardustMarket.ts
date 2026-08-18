/** Client mirror of server stardust index pricing (shop + convert). */
export const STARDUST_PER_GRAM_BASE = 100;

export function stardustShopPrice(gramPrice: number, index: number): number {
  const i = Math.max(0.25, index);
  return Math.max(1, Math.ceil(gramPrice * STARDUST_PER_GRAM_BASE * i));
}

export function gramToStardustPreview(gramAmount: number, index: number): number {
  const i = Math.max(0.25, index);
  return Math.max(1, Math.floor((gramAmount * STARDUST_PER_GRAM_BASE) / i));
}

/** Reverse convert spread — users receive 85% of nominal GRAM value. */
export const STARDUST_TO_GRAM_SPREAD = 0.85;

export function stardustToGramPreview(stardustAmount: number, index: number): number {
  const i = Math.max(0.25, index);
  const nominal = (stardustAmount * i) / STARDUST_PER_GRAM_BASE;
  const gram = nominal * STARDUST_TO_GRAM_SPREAD;
  return Math.max(0, Math.round(gram * 1_000_000) / 1_000_000);
}
