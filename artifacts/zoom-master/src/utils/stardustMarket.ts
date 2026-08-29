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

export const STARDUST_STAKE_BONUS_BPS = 800;

export function stardustStakePayout(staked: number): number {
  const n = Math.max(0, Math.floor(staked));
  if (n <= 0) return 0;
  return Math.floor((n * (10_000 + STARDUST_STAKE_BONUS_BPS)) / 10_000);
}

export function stardustToGramPreview(stardustAmount: number, index: number): number {
  const i = Math.max(0.25, index);
  const nominal = (stardustAmount * i) / STARDUST_PER_GRAM_BASE;
  const gram = nominal * STARDUST_TO_GRAM_SPREAD;
  return Math.max(0, Math.round(gram * 1_000_000) / 1_000_000);
}

/** Wallet/shop index is 1.0–10.0. Guard against leaked micro-units (index * 1e6). */
export function displayStardustIndex(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n) || n <= 0) return 1;
  const index = n >= 1000 ? n / 1_000_000 : n;
  return Math.min(10, Math.max(0.25, index));
}
