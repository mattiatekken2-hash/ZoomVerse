/**
 * On-chain $ZMC (Jetton) vs off-chain ZOOM Points.
 *
 * ZOOM Points (`users.zoom_balance`) never leave the Mini App. They only
 * size each player's share of the Season 6 / TGE airdrop.
 * $ZMC is the Jetton used for P2P Market, VIP holding, and treasury fees.
 */

export const ZMC_JETTON_ADDRESS = "EQCh6o6l436wdLr7kbR5uBR7eXUGVN0CCJ8MESMgFzGo5Kau";
export const TREASURY_WALLET_ADDRESS = "UQACCgAx0Fj924WvzsoyIDwJiE3nEvIraZuyvCsDnTEf_ZFQ";

export const ZMC_DECIMALS = 9;
export const ZMC_SCALE = 10n ** 9n;

/** Documented total supply (human $ZMC). */
export const ZMC_TOTAL_SUPPLY = 20_000_000;
/** Season airdrop base = 20% of total supply. */
export const ZMC_SEASON_AIRDROP_BASE = 4_000_000;

/** P2P platform fee: 5% of listing price → treasury, 95% → seller. */
export const MARKET_P2P_FEE_BPS = 500;
export const MARKET_P2P_FEE_PERCENT = 5;

/**
 * On-chain VIP holding (human $ZMC). Kept well under total supply so
 * anyone can buy the bag on STON.fi:
 *   BASE = 1,000  (~0.005% of 20M)
 *   PRO  = 10,000 (~0.05% of 20M)
 */
export const VIP_BASE_THRESHOLD = 1_000;
export const VIP_PRO_THRESHOLD = 10_000;

export type VipLevel = "NONE" | "BASE" | "PRO";

export function isVipLevel(v: unknown): v is VipLevel {
  return v === "NONE" || v === "BASE" || v === "PRO";
}

export function parseVipLevel(v: unknown): VipLevel {
  return isVipLevel(v) ? v : "NONE";
}

/** Human $ZMC → jetton nano (9 decimals). Uses string math so 25e6 * 1e9 stays exact. */
export function zmcHumanToNano(human: number): bigint {
  if (!Number.isFinite(human) || human <= 0) return 0n;
  const [intPart, fracRaw = ""] = human.toFixed(ZMC_DECIMALS).split(".");
  const frac = (fracRaw + "000000000").slice(0, ZMC_DECIMALS);
  const sign = intPart.startsWith("-") ? -1n : 1n;
  const whole = BigInt(intPart.replace("-", "") || "0");
  return sign * (whole * ZMC_SCALE + BigInt(frac));
}

export function zmcNanoToHuman(nano: bigint): number {
  const neg = nano < 0n;
  const abs = neg ? -nano : nano;
  const whole = abs / ZMC_SCALE;
  const frac = abs % ZMC_SCALE;
  const n = Number(whole) + Number(frac) / 1e9;
  return neg ? -n : n;
}

export function parseJettonNano(raw: string | number | bigint | null | undefined): bigint {
  if (raw == null) return 0n;
  if (typeof raw === "bigint") return raw < 0n ? 0n : raw;
  const s = String(raw).trim();
  if (!s || !/^\d+$/.test(s)) return 0n;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

export function splitMarketFeeNano(totalNano: bigint): { sellerNano: bigint; feeNano: bigint } {
  if (totalNano <= 0n) return { sellerNano: 0n, feeNano: 0n };
  const feeNano = (totalNano * BigInt(MARKET_P2P_FEE_PERCENT)) / 100n;
  return { sellerNano: totalNano - feeNano, feeNano };
}

export function vipLevelFromNano(balanceNano: bigint): VipLevel {
  const pro = zmcHumanToNano(VIP_PRO_THRESHOLD);
  const base = zmcHumanToNano(VIP_BASE_THRESHOLD);
  if (balanceNano >= pro) return "PRO";
  if (balanceNano >= base) return "BASE";
  return "NONE";
}

/**
 * User_Airdrop_ZMC = (User_ZOOM_Points / Total_Global_ZOOM_Points)
 *                  * (20% of Total Supply + treasury ledger)
 */
export function computeUserAirdropZmc(
  userZoomPoints: number,
  totalGlobalZoomPoints: number,
  treasuryZmc: number,
): number {
  if (!(userZoomPoints > 0) || !(totalGlobalZoomPoints > 0)) return 0;
  const pool = ZMC_SEASON_AIRDROP_BASE + Math.max(0, treasuryZmc);
  return (userZoomPoints / totalGlobalZoomPoints) * pool;
}

export function computeTotalAirdropPool(treasuryZmc: number): number {
  return ZMC_SEASON_AIRDROP_BASE + Math.max(0, treasuryZmc);
}
