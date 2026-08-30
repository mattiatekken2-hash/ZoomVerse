/**
 * On-chain $ZMC (Jetton) vs off-chain ZOOM Points.
 *
 * Supply (human $ZMC, matches the minted jetton):
 *   100M total
 *    20M locked forever in the STON.fi DEX pool — never used for airdrop
 *     4M reserved in the project treasury wallet for the TGE airdrop
 *
 * ZOOM Points (`users.zoom_balance`) never leave the Mini App. They only
 * size each player's share of that 4M (+ later treasury-ledger inflows).
 * $ZMC is the Jetton used for P2P Market, VIP holding, and treasury fees.
 */

export const ZMC_JETTON_ADDRESS = "EQCh6o6l436wdLr7kbR5uBR7eXUGVN0CCJ8MESMgFzGo5Kau";
export const TREASURY_WALLET_ADDRESS = "UQACCgAx0Fj924WvzsoyIDwJiE3nEvIraZuyvCsDnTEf_ZFQ";

export const ZMC_DECIMALS = 9;
export const ZMC_SCALE = 10n ** 9n;

/** On-chain minted supply (human $ZMC). */
export const ZMC_TOTAL_SUPPLY = 100_000_000;
/** Permanently locked in the DEX LP — not part of the airdrop. */
export const ZMC_DEX_LOCKED_SUPPLY = 20_000_000;
/**
 * TGE airdrop base held in the treasury wallet (4% of total supply).
 * Paid manually at TGE from that wallet; the Mini App only estimates shares.
 */
export const ZMC_SEASON_AIRDROP_BASE = 4_000_000;

/** P2P platform fee: 5% of listing price → treasury, 95% → seller. */
export const MARKET_P2P_FEE_BPS = 500;
export const MARKET_P2P_FEE_PERCENT = 5;

/** Lab task airdrop (first tranche). Claim is on-chain $ZMC from treasury. */
export const ZMC_TASK_AIRDROP_POOL = 200_000;
export const ZMC_TASK_AIRDROP_CLAIM = 10_000;
export const ZMC_TASK_AIRDROP_FEE_BPS = 500;
export const ZMC_TASK_HOLD_MIN = 10_000;
export const ZMC_TASK_HOLD_DAYS = 15;
export const ZMC_TASK_CHECKIN_DAYS = 7;
export const ZMC_TASK_CRAFTS_MIN = 50;
export const ZMC_TASK_SALES_MIN = 10;

export function zmcTaskAirdropSplit(gross: number): { payout: number; fee: number } {
  const g = Math.max(0, Math.floor(gross));
  const fee = Math.floor((g * ZMC_TASK_AIRDROP_FEE_BPS) / 10_000);
  return { payout: g - fee, fee };
}

/**
 * On-chain VIP holding (human $ZMC). Fixed bags, not a % of supply:
 *   BASE = 1,000  (~0.001% of 100M)
 *   PRO  = 10,000 (~0.01% of 100M)
 */
export const VIP_BASE_THRESHOLD = 1_000;
export const VIP_PRO_THRESHOLD = 10_000;

/** Shop item: 7-day unlimited farm repairs. Paid in on-chain ZMC → treasury. */
export const VIP_PRO_PASS_ITEM_ID = "vip_pro_pass";
export const VIP_PRO_PASS_ZMC = 10_000;
export const VIP_PRO_PASS_MS = 7 * 24 * 60 * 60 * 1000;
/** app_settings key: eligibility window end (ms) for the launch gift. */
export const VIP_PRO_PASS_GIFT_UNTIL_KEY = "vip_pro_pass_gift_until_ms";
export const VIP_PRO_PASS_LAUNCH_GIFTED_KEY = "vip_pro_pass_launch_gifted";

export function isVipProPassActive(untilMs: number | null | undefined, nowMs = Date.now()): boolean {
  const until = Number(untilMs);
  return Number.isFinite(until) && until > nowMs;
}

/** Linked-wallet ZMC required to expose a Studio piece on the in-app board. */
export const STUDIO_GALLERY_HOLD_ZMC = 100_000;

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
 *                  * (4M treasury airdrop reserve + treasury ledger fees)
 * The 20M DEX lock is never added to this pool.
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
