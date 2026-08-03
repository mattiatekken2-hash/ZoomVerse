import { useState, useEffect, useRef, useCallback } from "react";
import { registerUser, fetchReferralData, fetchPendingReferral, debugTelegramContext, syncBalance, fetchGrants, fetchBalanceRecord, fetchServerTime, listOnMarket, delistFromMarket, buyFromMarket, recordCraft, recordObtained, fetchSeasonEpoch, openMarketActivityStream, fetchMarketListings, notifyFarmStart, notifyFarmCollect, notifyFarmStop, notifyPlanetBurn, fetchCollectionPlanets, upsertCollectionPlanet, bulkSeedCollectionPlanets, fetchRegularPlanets, saveRegularPlanets, syncSunCycle, settleOfflineFarming, fetchEquipment, saveEquipment, startEquipmentCycle, collectEquipmentItem as apiCollectEquipment, burnEquipmentItem as apiBurnEquipment, listEquipmentOnMarket, apiHeaders, withInitData, deductCraftStardust, type Grants, type CollectionPlanetState, type ServerMarketListing } from "../utils/api";
import { refreshMarketListings } from "../store/globalStore";
import type { EquipmentItem, EquipmentCategory, EquipmentRarity } from "../utils/equipmentConfig";
import { getEquipmentTotalRate, getEquipmentReactivationFee, EQUIPMENT_CYCLE_MS, makeEquipmentItem, getEquipmentRate, EQUIPMENT_CATEGORY_ORDER } from "../utils/equipmentConfig";

// ─── LAB equipment drop tuning ───────────────────────────────────────
// Each successful planet craft has a small chance to ALSO drop a piece
// of space gear. Category is uniform across the 4 slots; rarity is
// weighted so high-tier gear stays scarce. Cap: at most 2 owned per
// (category, rarity) model — any extra roll is converted to a $ZOOM
// bonus equal to rate × 5 so the player never feels the drop "wasted".
const LAB_EQUIPMENT_DROP_CHANCE = 0.05;
const LAB_EQUIPMENT_CAP_PER_MODEL = 2;
const LAB_EQUIPMENT_RARITY_WEIGHTS: ReadonlyArray<readonly [EquipmentRarity, number]> = [
  ["BASIC", 45],
  ["RARE", 28],
  ["EPIC", 18],
  ["GOLD", 6],
  ["PLASMA", 2.5],
  ["MYTHIC", 0.5],
];

function rollEquipmentRarity(): EquipmentRarity {
  const total = LAB_EQUIPMENT_RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [rar, w] of LAB_EQUIPMENT_RARITY_WEIGHTS) {
    r -= w;
    if (r <= 0) return rar;
  }
  return "BASIC";
}

function rollEquipmentCategory(): EquipmentCategory {
  return EQUIPMENT_CATEGORY_ORDER[Math.floor(Math.random() * EQUIPMENT_CATEGORY_ORDER.length)]!;
}

function countOwnedModel(equipment: ReadonlyArray<EquipmentItem>, category: EquipmentCategory, rarity: EquipmentRarity): number {
  let n = 0;
  for (const e of equipment) {
    if (e.category === category && e.rarity === rarity) n++;
  }
  return n;
}

export type EquipmentDropResult =
  | { item: EquipmentItem; convertedToZoom?: undefined }
  | { item?: undefined; convertedToZoom: number; category: EquipmentCategory; rarity: EquipmentRarity };

// Roll an equipment drop given the current inventory snapshot.
// - With prob LAB_EQUIPMENT_DROP_CHANCE, picks a (category, rarity).
// - If the user already owns LAB_EQUIPMENT_CAP_PER_MODEL of that exact
//   (category, rarity), convert the drop to a $ZOOM bonus (rate × 5)
//   so the player still feels rewarded for the roll.
// - Otherwise mint a new equipment item (dormant cycle).
// Returns null when no drop happened this craft.
function rollLabEquipmentDrop(equipment: ReadonlyArray<EquipmentItem>): EquipmentDropResult | null {
  if (Math.random() >= LAB_EQUIPMENT_DROP_CHANCE) return null;
  const category = rollEquipmentCategory();
  const rarity = rollEquipmentRarity();
  const owned = countOwnedModel(equipment, category, rarity);
  if (owned >= LAB_EQUIPMENT_CAP_PER_MODEL) {
    const rate = getEquipmentRate(category, rarity);
    return { convertedToZoom: Math.max(50, Math.round(rate * 5)), category, rarity };
  }
  return { item: makeEquipmentItem(category, rarity) };
}

import { generateRandomFloat } from "../utils/planetFloat";
import { toast } from "./use-toast";

// Server-authoritative clock: every farming/idle-income time check is computed
// against this value, NOT the device clock. Calibrated against /api/server-time
// so a tampered phone clock cannot accelerate ZOOM/TON accrual.
let _serverOffsetMs = 0;
let _serverOffsetReady = false;

export function serverNow(): number {
  return Date.now() + _serverOffsetMs;
}

export function isServerClockReady(): boolean {
  return _serverOffsetReady;
}

// Returns the calibrated offset, or null if the server time couldn't be
// obtained. Callers must NOT silently treat null as "0 offset" — that would
// flag the clock as ready while it's actually still on the device's local
// clock, defeating any anti-tamper logic that relies on _serverOffsetReady.
async function calibrateServerOffset(): Promise<number | null> {
  try {
    const t0 = Date.now();
    const serverTime = await fetchServerTime();
    if (serverTime == null) return null;
    const t1 = Date.now();
    const rtt = t1 - t0;
    return serverTime - (t0 + rtt / 2);
  } catch {
    return null;
  }
}

async function refreshServerOffset(): Promise<void> {
  try {
    const offset = await calibrateServerOffset();
    if (offset == null) return; // /time unreachable — keep last known state.
    // Sanity check: if RTT-noise produced something insane, ignore it.
    if (Number.isFinite(offset) && Math.abs(offset) < 365 * 24 * 3_600_000) {
      _serverOffsetMs = offset;
      _serverOffsetReady = true;
    }
  } catch { /* keep last known offset */ }
}

export type PlanetType = "BASIC" | "RARE" | "EPIC" | "MYTHIC" | "NOVA" | "PLASMA" | "MUSHROOM" | "GOLD" | "V1" | "V1_NFT" | "WHITE1" | "WHITE2" | "WHITE3" | "WHITE4" | "EARTH1" | "EARTH2" | "EARTH3" | "EARTH4" | "BLACK1" | "BLACK2" | "BLACK3" | "BLACK4" | "SUPERNOVA1" | "SUPERNOVA2" | "SUPERNOVA3" | "SUPERNOVA4" | "STELLA1" | "STELLA2" | "STELLA3" | "STELLA4";

export const WHITE_PLANET_TYPES: PlanetType[] = ["WHITE1", "WHITE2", "WHITE3", "WHITE4"];

export function isWhitePlanet(name: PlanetType): boolean {
  return name === "WHITE1" || name === "WHITE2" || name === "WHITE3" || name === "WHITE4";
}

export const EARTH_PLANET_TYPES: PlanetType[] = ["EARTH1", "EARTH2", "EARTH3", "EARTH4"];

export function isEarthPlanet(name: PlanetType): boolean {
  return name === "EARTH1" || name === "EARTH2" || name === "EARTH3" || name === "EARTH4";
}

export const BLACK_PLANET_TYPES: PlanetType[] = ["BLACK1", "BLACK2", "BLACK3", "BLACK4"];

export function isBlackPlanet(name: PlanetType): boolean {
  return name === "BLACK1" || name === "BLACK2" || name === "BLACK3" || name === "BLACK4";
}

export const SUPERNOVA_PLANET_TYPES: PlanetType[] = ["SUPERNOVA1", "SUPERNOVA2", "SUPERNOVA3", "SUPERNOVA4"];

export function isSupernovaPlanet(name: PlanetType): boolean {
  return name === "SUPERNOVA1" || name === "SUPERNOVA2" || name === "SUPERNOVA3" || name === "SUPERNOVA4";
}

export const STELLA_PLANET_TYPES: PlanetType[] = ["STELLA1", "STELLA2", "STELLA3", "STELLA4"];

export function isStellaPlanet(name: PlanetType): boolean {
  return name === "STELLA1" || name === "STELLA2" || name === "STELLA3" || name === "STELLA4";
}

export interface Planet {
  id: string;
  name: PlanetType;
  rate: number;
  color: string;
  glowColor: string;
  createdAt: number;
  farmStartedAt: number;
  lastCollectedAt: number;
  isListedInMarket: boolean;
  isFarmingActive: boolean;
  marketPrice: number | null;
  craftCost: number;
  serverListingId?: number;
  // Only used by White Collection planets. null = in inventory, 0..3 = placed in that slot (immutable).
  slotIndex?: number | null;
  // Optional explicit name set by the user via the /planets/rename
  // endpoint. When absent the UI derives a stable, id-seeded name via
  // utils/planetNames.ts → getPlanetDisplayName(). White / Earth /
  // SUN planets are NOT renamable, so this only ever appears on the
  // regular planet types (BASIC / RARE / EPIC / GOLD / V1).
  displayName?: string;
  // CS:GO-style cosmetic "Float" value in [0, 1] (3 decimals). Set
  // ONCE at planet creation (truly random) and frozen forever. Only
  // present on regular planet types (BASIC / RARE / EPIC / GOLD / V1).
  // When absent on legacy planets, the UI derives a stable value from
  // the planet id (utils/planetFloat.ts → getDisplayFloat). The server
  // backfills missing floats on the next /save and ignores any change
  // attempt after the first persist (server-merge: first-write-wins).
  float?: number;
  // Server-time (ms) when the planet's farming was paused via market
  // listing. Used by startFarming to advance farmStartedAt /
  // lastCollectedAt by the pause duration so the user gets back exactly
  // the time that was remaining at the moment of pause — no exploit
  // (cycle budget is preserved), no perceived "early expiry" (timer is
  // anchored to the resume moment, not the original start). Cleared
  // (set to 0) on every fresh / resumed start.
  pausedAt?: number;
  // Planet durability (0–100). Starts at 100. Decrements -1% per 24h
  // staking cycle on reactivation and -5% on a PvP defeat. At 0% the
  // planet is frozen: it stops producing $ZOOM and cannot enter PvP.
  // Repaired in the LAB by spending Stardust (per-rarity cost).
  durability?: number;
  // Server-time (ms) when durability was last computed/updated.
  // Used to derive the staking-decay delta on the next reactivation.
  durabilityUpdatedAt?: number;
}

export interface SunState {
  isOwned: boolean;
  isActive: boolean;
  activationCost: number;
  cycleCount: number;
  farmStartedAt: number;
  lastCollectedAt: number;
}

export interface FeedEvent {
  id: string;
  text: string;
  timestamp: number;
}

export interface MarketListing {
  id: string;
  name: PlanetType;
  price: number;
  seller: string;
  rate: number;
  // CS:GO-style cosmetic perfection score in [0, 1] snapshotted from
  // the listing. Optional because the local in-memory listings path
  // (legacy, your-own listings) doesn't carry one — the UI then falls
  // back to a deterministic-from-id value.
  planetFloat?: number | null;
  // User-chosen displayName carried from the seller's planet (set via
  // the paid /planets/rename endpoint). Optional — when absent the UI
  // falls back to the rarity label.
  displayName?: string | null;
}

export interface GameState {
  version: number;
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  maxSlots: number;
  totalEarned: number;
  seasonPoolEarned: number;
  craftsCompleted: number;
  /** Cumulative lifetime LAB taps. Drives the profile XP/level bar. Never
   *  resets (unlike the per-craft `taps`). Grow-only. */
  totalTaps: number;
  totalTonSpent: number;
  referralCode: string;
  referralCount: number;
  lastDailyClaimAt: number;
  feedEvents: FeedEvent[];
  pendingPlanet: Planet | null;
  /** ZOOM tap-cost spent on the planet currently waiting to be claimed
   *  (= goal at completion). Used purely for the personal history log. */
  pendingPlanetCost: number;
  currentCraftRarity: PlanetType | null;
  usedRedeemCodes: string[];
  sun: SunState | null;
  telegramId: string | null;
  referredBy: string | null;
  referralSpeedBonus: number;
  claimedBonusBasic: number;
  claimedBonusRare: number;
  claimedBonusEpic: number;
  claimedBonusGold: number;
  claimedBonusMythic: number;
  claimedBonusNova: number;
  claimedBonusPlasma: number;
  claimedBonusV1: number;
  claimedBonusV1NftPlatinum: number;
  claimedBonusSun: boolean;
  sunCount: number;
  hasAutoTap: boolean;
  whiteCollectionUnlocked: boolean;
  // Number of White Collection bundles this user owns (each bundle = 4 white
  // planets + 4 slots). Global cap of 10 bundles is enforced server-side.
  whiteCollectionBundles: number;
  // Number of bundles already materialized locally (1 bundle = 4 planets
  // appended to whitePlanets). When grants reports a higher bundle count,
  // we materialize the delta. Per-user via storage.
  claimedWhiteCollectionBundles: number;
  // White planets owned by the user. Each bundle adds 4 fresh planets
  // (WHITE1..WHITE4). They live OUTSIDE the regular `planets` array so they
  // never appear on the FarmPage and can't be burned, sold, or listed.
  // `slotIndex` is null while in inventory and becomes 0..(maxSlots-1)
  // (immutable) once placed in the PixelAvatar slot grid.
  whitePlanets: Planet[];
  // Earth Collection — same model as white but with its own bundle counter,
  // claimed counter, and planet inventory (EARTH1..EARTH4).
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  claimedEarthCollectionBundles: number;
  earthPlanets: Planet[];
  // Black Collection — 4 black TON-farming planets per bundle.
  // 40 TON per bundle, max 3 bundles globally. Rate: 0.003472 TON/h each.
  blackCollectionUnlocked: boolean;
  blackCollectionBundles: number;
  claimedBlackCollectionBundles: number;
  blackPlanets: Planet[];
  // Supernova Collection — 4 yellow star TON-farming planets per bundle.
  // 12 TON per bundle, max 50 bundles globally. Combined yield 1.5 TON / 30d.
  // Rate per planet: 0.000520833 TON/h. Reactivation fee: 0.001 TON.
  supernovaCollectionUnlocked: boolean;
  supernovaCollectionBundles: number;
  claimedSupernovaCollectionBundles: number;
  supernovaPlanets: Planet[];
  // Stella Rossa Collection — 4 deep-red TON-farming planets. Admin-granted.
  stellaRossaCollectionUnlocked: boolean;
  stellaRossaCollectionBundles: number;
  claimedStellaRossaCollectionBundles: number;
  stellaPlanets: Planet[];
  // EARNED TON balance. Accumulated TON from White/Earth/Black Collection
  // planet collects, staking accrual, admin credits, leaderboard rewards.
  // ONLY this balance can be withdrawn. Reactivation fees for white planets
  // are deducted from here.
  tonBalance: number;
  // DEPOSIT TON balance. Credited only by external TonConnect deposits.
  // Spendable EXCLUSIVELY in the Shop — never withdrawable. Kept separate
  // from `tonBalance` so deposits never become withdrawable (one-way:
  // deposit → spend in-game).
  depositBalance: number;
  stardustBalance: number;
  // REDSTAR — third in-game currency. Server-authoritative; credited by admin
  // only until future gameplay mechanics are added. Never decremented client-side.
  redStarBalance: number;
  // NFTSTAR — fourth in-game currency. Earned passively by MUSHROOM NFT planets
  // (5 NFTSTAR per planet per day). Displayed in the resource widget.
  nftStarBalance: number;
  // Timestamp (ms) of the last Stella Rossa daily Redstar claim. Set locally
  // immediately after a successful claim so the cooldown countdown is instant.
  lastStellaClaimAt?: number;
  lastFarmingSettledAt: number;
  claimedMilestones: number[];
  lastBalanceEpoch: number;
  defectPlanets: string[];
  // Space equipment inventory (Helmets / Jetpacks / Hats / Scanners).
  // Each item produces $ZOOM/hr passively (always-on, no farming cycle)
  // and is summed into the live rate alongside planets and the SUN.
  // Server-side: jsonb `equipment_json` column on `users`.
  equipment: EquipmentItem[];
}

export const PLANET_CONFIG: Record<PlanetType, {
  rate: number;
  color: string;
  glowColor: string;
  chance: number;
  label: string;
  craftCost: number;
  activationTon: number;
  tapsNeeded: number;
  reactivationFee: number;
  // For White Collection planets only: the rate is in TON/hour and the
  // reactivationFee is in TON. For all other planets these fields are ZOOM.
  isTonFarming?: boolean;
}> = {
  BASIC: {
    rate: 2,
    color: "#8892b0",
    glowColor: "rgba(136,146,176,0.5)",
    // Reduced by 0.00005 to make room for V1 (0.005% drop), by 0.00275 to
    // make room for MYTHIC, by 0.00150 for PLASMA, and by 0.00200 for NOVA,
    // so the cumulative probability sum across all rollable rarities equals 1.
    chance: 0.78820,
    label: "Basic",
    craftCost: 2,
    activationTon: 0.05,
    tapsNeeded: 100,
    reactivationFee: 25,
  },
  RARE: {
    rate: 15,
    color: "#4facfe",
    glowColor: "rgba(79,172,254,0.5)",
    chance: 0.20,
    label: "Rare",
    craftCost: 5,
    activationTon: 0.15,
    tapsNeeded: 100,
    reactivationFee: 200,
  },
  EPIC: {
    rate: 80,
    color: "#c471ed",
    glowColor: "rgba(196,113,237,0.5)",
    chance: 0.005,
    label: "Epic",
    craftCost: 12,
    activationTon: 0.5,
    tapsNeeded: 100,
    reactivationFee: 1000,
  },
  // MYTHIC — new tier between EPIC and GOLD. Drop rate is the midpoint
  // of EPIC (0.5%) and GOLD (0.05%) → 0.275%. Crimson/red-fire styling
  // with a constant red aura that still respects the float grading.
  // Available ONLY through Lab crafting (no wheel / mystery box / merchant).
  MYTHIC: {
    rate: 115,
    color: "#dc143c",
    glowColor: "rgba(255,69,0,0.7)",
    chance: 0.00275,
    label: "Mythic",
    craftCost: 50,
    // No TON activation — MYTHIC starts farming for free and follows the
    // same 24h cycle as all other planets, after which it must be
    // reactivated with ZOOM (reactivationFee).
    activationTon: 0,
    tapsNeeded: 100,
    reactivationFee: 1500,
  },
  // NOVA — dark-theme rarity placed directly above MYTHIC.
  // Abyss Black appearance — total void with a barely-visible deep-violet corona.
  // Rate: 122 ZOOM/h. Drop: 0.20% (between MYTHIC 0.275% and PLASMA 0.15%).
  // Only obtainable through Lab crafting (never from wheel / merchant).
  NOVA: {
    rate: 122,
    color: "#7700ff",
    glowColor: "rgba(100,0,255,0.85)",
    chance: 0.00200,
    label: "Nova",
    craftCost: 60,
    activationTon: 0,
    tapsNeeded: 100,
    reactivationFee: 1600,
  },
  // PLASMA — rarity between NOVA and GOLD. Neon-green styling.
  // Drop rate: 0.15% (between NOVA 0.20% and GOLD 0.05%).
  // Rate: 130 ZOOM/h.
  // Only obtainable through Lab crafting (no wheel / mystery box / merchant).
  PLASMA: {
    rate: 130,
    color: "#00e676",
    glowColor: "rgba(0,230,118,0.7)",
    chance: 0.00150,
    label: "Plasma",
    craftCost: 75,
    activationTon: 0,
    tapsNeeded: 100,
    reactivationFee: 1750,
  },
  // MUSHROOM — NFT rarity between PLASMA and GOLD. Styled as a cosmic mushroom.
  // Drop rate: 0.08% (between PLASMA 0.15% and GOLD 0.05%).
  // Rate: 140 ZOOM/h. Also passively earns 5 NFTSTAR/day per planet.
  // Tradeable on the P2P market (stile NFT V1).
  MUSHROOM: {
    rate: 140,
    color: "#8b3a8b",
    glowColor: "rgba(180,60,180,0.75)",
    chance: 0.0008,
    label: "Mushroom",
    craftCost: 50,
    activationTon: 0,
    tapsNeeded: 100,
    reactivationFee: 1850,
  },
  GOLD: {
    rate: 150,
    color: "#ffd700",
    glowColor: "rgba(255,215,0,0.5)",
    chance: 0.0005,
    label: "Gold",
    craftCost: 25,
    activationTon: 1.0,
    tapsNeeded: 100,
    reactivationFee: 2000,
  },
  // V1 — ultra-rare apex planet. ~10× rarer than Gold (1 in 20,000 forge).
  // Bright white "moon-like" appearance with crater spots (rendered in
  // PlanetOrb). Strongest output and highest costs in the game.
  V1: {
    rate: 400,
    color: "#f5fbff",
    glowColor: "rgba(245,251,255,0.7)",
    chance: 0.00005,
    label: "V1",
    craftCost: 100,
    activationTon: 2.0,
    tapsNeeded: 100,
    reactivationFee: 4000,
  },
  // V1 NFT Platinum Edition — esclusivo NFT vendibile SOLO via shop (20 TON,
  // max 5 globali). chance: 0 ⇒ rollRarity() nel Lab non potrà mai produrlo.
  // Rate intermedio fra GOLD (150) e V1 (400). Stessi costi craft/activation
  // di V1 (anche se craft è disabilitato). Reactivation fee = quella V1.
  V1_NFT: {
    rate: 275,
    color: "#e9f4ff",
    glowColor: "rgba(180,220,255,0.85)",
    chance: 0,
    label: "V1 NFT",
    craftCost: 250,
    activationTon: 2.0,
    tapsNeeded: 1300,
    reactivationFee: 4000,
  },
  // White Collection — only obtainable via the 30 TON shop bundle.
  // chance: 0 ensures rollRarity() in the Lab can never produce them.
  // Each white planet farms TON, not ZOOM. Combined rate of all 4 = 0.00462 TON/h
  // (≈ 0.111 TON/day total). Reactivation fee is paid in TON (deducted from
  // the user's accumulated tonBalance).
  WHITE1: {
    rate: 0.001155,
    color: "#ffffff",
    glowColor: "rgba(255,255,255,0.55)",
    chance: 0,
    label: "White Planet 1",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  WHITE2: {
    rate: 0.001155,
    color: "#f8faff",
    glowColor: "rgba(248,250,255,0.55)",
    chance: 0,
    label: "White Planet 2",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  WHITE3: {
    rate: 0.001155,
    color: "#f0f4ff",
    glowColor: "rgba(240,244,255,0.55)",
    chance: 0,
    label: "White Planet 3",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  WHITE4: {
    rate: 0.001155,
    color: "#e8eeff",
    glowColor: "rgba(232,238,255,0.6)",
    chance: 0,
    label: "White Planet 4",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  // EARTH Collection — 4 earth-themed planets per bundle. Per-planet rate
  // 0.000177 TON/h × 4 planets ≈ 0.017 TON/day combined per bundle.
  // Reactivation fee is 0.001 TON paid on-chain via TonConnect, mirroring
  // the white-planet flow.
  EARTH1: {
    rate: 0.000177,
    color: "#3b82f6",
    glowColor: "rgba(59,130,246,0.55)",
    chance: 0,
    label: "T1",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.001,
    isTonFarming: true,
  },
  EARTH2: {
    rate: 0.000177,
    color: "#22c55e",
    glowColor: "rgba(34,197,94,0.55)",
    chance: 0,
    label: "T2",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.001,
    isTonFarming: true,
  },
  EARTH3: {
    rate: 0.000177,
    color: "#0ea5e9",
    glowColor: "rgba(14,165,233,0.55)",
    chance: 0,
    label: "T3",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.001,
    isTonFarming: true,
  },
  EARTH4: {
    rate: 0.000177,
    color: "#16a34a",
    glowColor: "rgba(22,163,74,0.55)",
    chance: 0,
    label: "T4",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.001,
    isTonFarming: true,
  },
  // BLACK Collection — 40 TON/bundle, max 3 bundles globally.
  // Rate per planet: 10 TON / 30 days / 24h / 4 planets ≈ 0.003472 TON/h.
  // Combined: ~0.333 TON/day. Reactivation fee: 0.01 TON per planet.
  BLACK1: {
    rate: 0.003472,
    color: "#0a0014",
    glowColor: "rgba(123,47,255,0.75)",
    chance: 0,
    label: "B1",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.01,
    isTonFarming: true,
  },
  BLACK2: {
    rate: 0.003472,
    color: "#0d0018",
    glowColor: "rgba(157,78,221,0.75)",
    chance: 0,
    label: "B2",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.01,
    isTonFarming: true,
  },
  BLACK3: {
    rate: 0.003472,
    color: "#0a001a",
    glowColor: "rgba(123,47,255,0.8)",
    chance: 0,
    label: "B3",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.01,
    isTonFarming: true,
  },
  BLACK4: {
    rate: 0.003472,
    color: "#080012",
    glowColor: "rgba(157,78,221,0.8)",
    chance: 0,
    label: "B4",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.01,
    isTonFarming: true,
  },
  // SUPERNOVA Collection — 12 TON/bundle, max 50 bundles globally.
  // Rate per planet: 1.5 TON / 30 days / 24h / 4 planets ≈ 0.000520833 TON/h.
  // Combined: ~0.05 TON/day. Reactivation fee: 0.005 TON per planet.
  SUPERNOVA1: {
    rate: 0.000520833,
    color: "#ffd700",
    glowColor: "rgba(255,215,0,0.85)",
    chance: 0,
    label: "S1",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  SUPERNOVA2: {
    rate: 0.000520833,
    color: "#fcd34d",
    glowColor: "rgba(252,211,77,0.85)",
    chance: 0,
    label: "S2",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  SUPERNOVA3: {
    rate: 0.000520833,
    color: "#facc15",
    glowColor: "rgba(250,204,21,0.85)",
    chance: 0,
    label: "S3",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  SUPERNOVA4: {
    rate: 0.000520833,
    color: "#fbbf24",
    glowColor: "rgba(251,191,36,0.85)",
    chance: 0,
    label: "S4",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  // STELLA ROSSA Collection — 4 deep-red TON-farming planets.
  // Unlockable via Lab widget (60 Stardust). Farms TON, combined
  // rate of all 4 ≈ 15 TON/month (0.000521 TON/h each = 0.002083 TON/h total).
  // Reactivation fee paid in TON (same pattern as White/Supernova collections).
  STELLA1: {
    rate: 0.000521,
    color: "#8b0000",
    glowColor: "rgba(220,20,60,0.75)",
    chance: 0,
    label: "SR1",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  STELLA2: {
    rate: 0.000521,
    color: "#a10000",
    glowColor: "rgba(200,0,50,0.75)",
    chance: 0,
    label: "SR2",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  STELLA3: {
    rate: 0.000521,
    color: "#b30000",
    glowColor: "rgba(180,0,60,0.75)",
    chance: 0,
    label: "SR3",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  STELLA4: {
    rate: 0.000521,
    color: "#c0001a",
    glowColor: "rgba(192,0,26,0.75)",
    chance: 0,
    label: "SR4",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
};

export const SUN_CONFIG = {
  rate: 1000,
  color: "#ffb347",
  glowColor: "rgba(255,179,71,0.6)",
  // SUN is purchased once for 10 TON. Each new 24h cycle requires a
  // reactivation fee in $ZOOM (same model as planets, scaled to its 24,000/cycle output).
  activationCostBase: 0,
  reactivationFee: 12000,
};

const REDEEM_CODES: Record<string, number> = {
  "ZOOMSTART": 500,
  "ZOOMLUCKY": 1000,
  "ZOOMBIG": 2500,
  "ZOOMLAUNCH": 750,
};

const SUN_CODES = ["SUN-ALPHA", "SUN-OMEGA", "SUN-PRIME", "SUN-NOVA", "SUN-CORE"];

const STATE_VERSION = 5;
const STORAGE_KEY = "zoom-master-v5";
const LIVE_EVENT_KEY = "zoom-master-live-activity-event";
const LIVE_EVENT_CHANNEL = "zoom-master-live-activity";
const MAX_FEED_EVENTS = 50;
const PLAYER_NAME = "Username";
const FARM_DURATION_MS = 24 * 60 * 60 * 1000;
const DAILY_COLLECT_MS = 24 * 60 * 60 * 1000;

function makeReferralCode(): string {
  return "ZOOM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getStorageKey(telegramId: string | null): string {
  return telegramId ? `${STORAGE_KEY}:${telegramId}` : STORAGE_KEY;
}

function getTelegramContext(): { telegramId: string | null; startParam: string | null; firstName: string | null; username: string | null; photoUrl: string | null } {
  try {
    const webApp = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string; photo_url?: string }; start_param?: string }; initData?: string } } }).Telegram?.WebApp;
    const unsafe = webApp?.initDataUnsafe;
    const telegramId = unsafe?.user?.id ? String(unsafe.user.id) : null;
    const firstName = unsafe?.user?.first_name ?? null;
    const username = unsafe?.user?.username ?? null;
    const photoUrl = unsafe?.user?.photo_url ?? null;

    let startParam: string | null = unsafe?.start_param || null;

    if (!startParam && webApp?.initData) {
      try {
        const params = new URLSearchParams(webApp.initData);
        startParam = params.get("start_param");
      } catch { /**/ }
    }

    if (!startParam) {
      startParam = localStorage.getItem("zoom-start-param");
    }

    // Market-share deep links (`mkt_<listingId>`) are NOT referral codes — they
    // route the user to a listing (handled in App.tsx). Never let them be
    // consumed as a referrer, or sharers would accidentally "refer" everyone.
    if (startParam && /^mkt_/.test(startParam)) {
      startParam = null;
    }

    return { telegramId, startParam, firstName, username, photoUrl };
  } catch {
    return { telegramId: null, startParam: null, firstName: null, username: null, photoUrl: null };
  }
}

const INITIAL_STATE: GameState = {
  version: STATE_VERSION,
  balance: 300,
  taps: 0,
  goal: 100,
  planets: [],
  maxSlots: 2,
  totalEarned: 0,
  seasonPoolEarned: 0,
  craftsCompleted: 0,
  totalTaps: 0,
  totalTonSpent: 0,
  referralCode: makeReferralCode(),
  referralCount: 0,
  lastDailyClaimAt: 0,
  feedEvents: [],
  pendingPlanet: null,
  pendingPlanetCost: 0,
  currentCraftRarity: null,
  usedRedeemCodes: [],
  sun: null,
  telegramId: null,
  referredBy: null,
  referralSpeedBonus: 0,
  claimedBonusBasic: 0,
  claimedBonusRare: 0,
  claimedBonusEpic: 0,
  claimedBonusGold: 0,
  claimedBonusMythic: 0,
  claimedBonusNova: 0,
  claimedBonusPlasma: 0,
  claimedBonusV1: 0,
  claimedBonusV1NftPlatinum: 0,
  claimedBonusSun: false,
  sunCount: 0,
  hasAutoTap: false,
  whiteCollectionUnlocked: false,
  whiteCollectionBundles: 0,
  claimedWhiteCollectionBundles: 0,
  whitePlanets: [],
  earthCollectionUnlocked: false,
  earthCollectionBundles: 0,
  claimedEarthCollectionBundles: 0,
  earthPlanets: [],
  blackCollectionUnlocked: false,
  blackCollectionBundles: 0,
  claimedBlackCollectionBundles: 0,
  blackPlanets: [],
  supernovaCollectionUnlocked: false,
  supernovaCollectionBundles: 0,
  claimedSupernovaCollectionBundles: 0,
  supernovaPlanets: [],
  stellaRossaCollectionUnlocked: false,
  stellaRossaCollectionBundles: 0,
  claimedStellaRossaCollectionBundles: 0,
  stellaPlanets: [],
  tonBalance: 0,
  depositBalance: 0,
  stardustBalance: 0,
  redStarBalance: 0,
  nftStarBalance: 0,
  // Default to 0 (not serverNow()) so a brand-new device / cleared cache is
  // recognized as "no prior local settle" — the server-side /farm/settle
  // endpoint will then use the per-planet timestamps as the floor and credit
  // the legitimate offline accrual (capped per planet at 24h). The local
  // `settleFarmingState` already handles 0 safely via its `|| now` fallback,
  // so this never causes a spurious instant credit on the client.
  lastFarmingSettledAt: 0,
  claimedMilestones: [],
  defectPlanets: [],
  lastBalanceEpoch: 0,
  equipment: [],
};

/**
 * Daily-collect removal one-shot migration (May 2026), self-healing & idempotent.
 *
 * Pre-deploy state had a "needs daily collect" punishment: planets stopped
 * accruing if the user didn't press COLLECT within 24h of the previous
 * collect. The user explicitly asked that EXISTING members not lose anything:
 * any planet currently stuck in the old expired-due-to-missed-collect state
 * should auto-reactivate as if the user had just pressed collect, free.
 *
 * Detection criterion: `lastCollectedAt > farmStartedAt`. This is true ONLY
 * for planets that received at least one MANUAL collect after their last
 * start — possible only with a pre-deploy build (post-deploy startFarming
 * still sets both timestamps equal, and the COLLECT button no longer exists
 * to drift them). After migration we reset `farmStartedAt = now,
 * lastCollectedAt = 0`, which makes the check naturally false on every
 * subsequent pass — no cross-device free-reactivation loop, no flag needed.
 *
 * Safe to call on every planet load (loadState + server hydration). Brand-new
 * planets and post-migration planets are unchanged; only pre-deploy stuck
 * cycles get the one-time free reactivation.
 */
function applyDailyCollectMigration<T extends Planet>(p: T, nowMs: number): T {
  if (!p.isFarmingActive) return p;
  if (!(p.lastCollectedAt > p.farmStartedAt)) return p;
  if (nowMs - p.lastCollectedAt <= FARM_DURATION_MS) return p;
  return { ...p, farmStartedAt: nowMs, lastCollectedAt: 0 };
}

// Stardust cost to repair a planet to 100% durability, keyed by rarity.
export const REPAIR_STARDUST_COST: Partial<Record<PlanetType, number>> = {
  BASIC: 100, RARE: 300, EPIC: 800, GOLD: 1500, MYTHIC: 3000,
  NOVA: 5000, PLASMA: 5000, MUSHROOM: 4000, V1: 10000, V1_NFT: 10000,
};

function migratePlanet(p: unknown): Planet {
  const raw = p as Partial<Planet>;
  return {
    isFarmingActive: false,
    marketPrice: null,
    slotIndex: null,
    durability: 100,          // default: full health for legacy planets
    durabilityUpdatedAt: 0,
    ...raw,
  } as Planet;
}

// True when loadState() did NOT find a matching localStorage entry for the
// current Telegram user — i.e. this device is opening this account for the
// first time (or after clearing storage). The first server sync uses this to
// snap balance/state to the server values instead of merging with the local
// defaults (which would otherwise resurrect the 300-ZOOM starting balance and
// overwrite the real server-side balance via the next /balance/sync call).
let _lastLoadWasFresh = true;
export function consumeWasFreshLoad(): boolean {
  const v = _lastLoadWasFresh;
  _lastLoadWasFresh = false;
  return v;
}

function loadState(): GameState {
  const { telegramId, startParam, firstName: _firstName } = getTelegramContext();

  try {
    const matchingKey = localStorage.getItem(getStorageKey(telegramId));
    const raw = matchingKey ?? localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed.version === STATE_VERSION) {
        if (telegramId && parsed.telegramId !== telegramId) {
          _lastLoadWasFresh = true;
          const referredBy = startParam ? startParam : null;
          return {
            ...INITIAL_STATE,
            referralCode: telegramId,
            telegramId,
            referredBy,
            referralSpeedBonus: referredBy ? 0.10 : 0,
          };
        }
        // Daily-collect removal migration runs on every load via
        // `applyDailyCollectMigration`; it self-skips post-migration planets
        // (lastCollectedAt = 0 < farmStartedAt), so calling it here AND in
        // the server-hydration path is safe and idempotent. See the
        // function's docstring for the invariant.
        const nowMs = serverNow();
        const migratedPlanets = (parsed.planets || [])
          .map(migratePlanet)
          .map((p) => applyDailyCollectMigration(p, nowMs));
        const base: GameState = {
          ...INITIAL_STATE,
          ...parsed,
          planets: migratedPlanets,
          pendingPlanet: parsed.pendingPlanet ? migratePlanet(parsed.pendingPlanet) : null,
          pendingPlanetCost: typeof parsed.pendingPlanetCost === "number" ? parsed.pendingPlanetCost : 0,
          usedRedeemCodes: parsed.usedRedeemCodes || [],
          sun: parsed.sun || null,
          referralSpeedBonus: parsed.referralSpeedBonus ?? 0,
          referredBy: parsed.referredBy ?? null,
          telegramId: parsed.telegramId ?? null,
          claimedBonusSun: parsed.claimedBonusSun ?? false,
          lastFarmingSettledAt: parsed.lastFarmingSettledAt ?? 0,
          claimedMilestones: parsed.claimedMilestones ?? [],
          lastBalanceEpoch: parsed.lastBalanceEpoch ?? 0,
          whiteCollectionBundles: (parsed as unknown as Record<string, unknown>).whiteCollectionBundles as number ?? (parsed.whiteCollectionUnlocked ? 1 : 0),
          claimedWhiteCollectionBundles:
            (parsed as unknown as Record<string, unknown>).claimedWhiteCollectionBundles as number
            ?? ((parsed as unknown as Record<string, unknown>).claimedWhiteCollection ? 1 : 0),
          whitePlanets: (parsed.whitePlanets || []).map(migratePlanet),
          earthCollectionUnlocked: (parsed as unknown as Record<string, unknown>).earthCollectionUnlocked as boolean ?? false,
          earthCollectionBundles: (parsed as unknown as Record<string, unknown>).earthCollectionBundles as number ?? 0,
          claimedEarthCollectionBundles: (parsed as unknown as Record<string, unknown>).claimedEarthCollectionBundles as number ?? 0,
          earthPlanets: ((parsed as unknown as Record<string, unknown>).earthPlanets as Planet[] | undefined ?? []).map(migratePlanet),
          blackCollectionUnlocked: (parsed as unknown as Record<string, unknown>).blackCollectionUnlocked as boolean ?? false,
          blackCollectionBundles: (parsed as unknown as Record<string, unknown>).blackCollectionBundles as number ?? 0,
          claimedBlackCollectionBundles: (parsed as unknown as Record<string, unknown>).claimedBlackCollectionBundles as number ?? 0,
          blackPlanets: ((parsed as unknown as Record<string, unknown>).blackPlanets as Planet[] | undefined ?? []).map(migratePlanet),
          supernovaCollectionUnlocked: (parsed as unknown as Record<string, unknown>).supernovaCollectionUnlocked as boolean ?? false,
          supernovaCollectionBundles: (parsed as unknown as Record<string, unknown>).supernovaCollectionBundles as number ?? 0,
          claimedSupernovaCollectionBundles: (parsed as unknown as Record<string, unknown>).claimedSupernovaCollectionBundles as number ?? 0,
          supernovaPlanets: ((parsed as unknown as Record<string, unknown>).supernovaPlanets as Planet[] | undefined ?? []).map(migratePlanet),
          stellaRossaCollectionUnlocked: (parsed as unknown as Record<string, unknown>).stellaRossaCollectionUnlocked as boolean ?? false,
          stellaRossaCollectionBundles: (parsed as unknown as Record<string, unknown>).stellaRossaCollectionBundles as number ?? 0,
          claimedStellaRossaCollectionBundles: (parsed as unknown as Record<string, unknown>).claimedStellaRossaCollectionBundles as number ?? 0,
          stellaPlanets: ((parsed as unknown as Record<string, unknown>).stellaPlanets as Planet[] | undefined ?? []).map(migratePlanet),
          tonBalance: parsed.tonBalance ?? 0,
          depositBalance: (parsed as unknown as Record<string, unknown>).depositBalance as number ?? 0,
          stardustBalance: (parsed as unknown as Record<string, unknown>).stardustBalance as number ?? 0,
          redStarBalance: (parsed as unknown as Record<string, unknown>).redStarBalance as number ?? 0,
          nftStarBalance: (parsed as unknown as Record<string, unknown>).nftStarBalance as number ?? 0,
        };
        const resolvedTelegramId = telegramId || base.telegramId;
        // Only treat as "fresh load" when we did NOT find an entry keyed to the
        // current Telegram user. If matchingKey is null we fell back to a
        // legacy un-keyed entry (or someone else's), so still treat as fresh
        // and let server be authoritative on first sync.
        _lastLoadWasFresh = !matchingKey;
        return {
          ...base,
          telegramId: resolvedTelegramId,
          referralCode: resolvedTelegramId || base.referralCode,
        };
      }
    }
  } catch { /**/ }

  _lastLoadWasFresh = true;
  const isNewUser = true;
  const referredBy = (startParam && isNewUser) ? startParam : null;
  const referralSpeedBonus = referredBy ? 0.10 : 0;
  const referralCode = telegramId || makeReferralCode();

  return {
    ...INITIAL_STATE,
    referralCode,
    telegramId,
    referredBy,
    referralSpeedBonus,
  };
}

// Monotonic write counter — incremented every time saveState writes. Used to
// detect "I queued a stale snapshot, but a fresher write happened before me"
// in scheduled/idle persist callbacks so they don't overwrite newer data.
let _writeSeq = 0;
let _lastSavedAt = 0;
function saveState(state: GameState) {
  // Discard any queued idle write — this snapshot is newer and authoritative.
  // Without this, a stale schedulePersist payload (e.g. from a tap a few ms
  // earlier) could fire AFTER us and resurrect items that were just removed
  // (burned planets, sold items, etc.) on the next reload.
  _pendingPersistState = null;
  _persistScheduled = false;
  _writeSeq++;
  _lastSavedAt = Date.now();
  try {
    localStorage.setItem(getStorageKey(state.telegramId), JSON.stringify(state));
  } catch { /**/ }
}

// Non-blocking persistence scheduler. Each call replaces the pending state and
// the actual JSON.stringify + localStorage write happens during the browser's
// idle time (or next animation frame as fallback). This keeps the tap thread
// at 60fps even when state grows large (many planets, feed events, etc).
let _pendingPersistState: GameState | null = null;
let _persistScheduled = false;
type IdleCallback = (cb: () => void, opts?: { timeout?: number }) => number;
const _scheduleIdle: IdleCallback =
  typeof window !== "undefined" && typeof (window as unknown as { requestIdleCallback?: IdleCallback }).requestIdleCallback === "function"
    ? (window as unknown as { requestIdleCallback: IdleCallback }).requestIdleCallback.bind(window)
    : ((cb: () => void) => window.setTimeout(cb, 0)) as IdleCallback;

function schedulePersist(state: GameState) {
  _pendingPersistState = state;
  if (_persistScheduled) return;
  _persistScheduled = true;
  const seqAtSchedule = _writeSeq;
  _scheduleIdle(() => {
    _persistScheduled = false;
    const s = _pendingPersistState;
    _pendingPersistState = null;
    // If anyone wrote authoritatively while we were queued, the snapshot we
    // captured is potentially stale (e.g. user burned/sold/listed an item
    // between schedule and idle). Skip — the authoritative writer already
    // persisted the truth.
    if (_writeSeq !== seqAtSchedule) return;
    if (s) saveState(s);
  }, { timeout: 200 });
}

// Force-flush pending persist (used on page hide / unload to guarantee writes).
function flushPersist() {
  if (_pendingPersistState) {
    const s = _pendingPersistState;
    _pendingPersistState = null;
    _persistScheduled = false;
    saveState(s);
  }
}

let _lastSyncedBalance = -1;
let _lastSyncedTonBalance = -1;
let _syncInFlight = false;
let _pendingSyncBalance = -1;
// Tracks the most recent server balanceEpoch we've observed. Sent on every
// /balance/sync so the server can detect stale clients (e.g. after admin
// mutations) and overwrite their balance instead of merging.
let _currentBalanceEpoch = 0;
export function getCurrentBalanceEpoch(): number { return _currentBalanceEpoch; }
export function setCurrentBalanceEpoch(epoch: number): void {
  if (typeof epoch === "number" && epoch > _currentBalanceEpoch) _currentBalanceEpoch = epoch;
}

// Module-level holder for the hook's stateRef so module-scope helpers like
// `reconcileFromSyncResponse` can mutate the same source-of-truth that the
// in-component periodic doSync reads from. Set once when the hook mounts.
// Without this, the wheel/admin race-condition fix that snaps stateRef
// SYNCHRONOUSLY before bumping the epoch wouldn't compile (and at runtime
// would leave the optimistic update unapplied, losing prizes).
type StateRefHolder = { current: GameState };
let _stateRefHolder: StateRefHolder | null = null;
export function _registerStateRef(ref: StateRefHolder): void {
  _stateRefHolder = ref;
}

// Called after every /balance/sync response. The server is authoritative
// whenever its epoch is higher than the one we sent — that means an
// authoritative balance change happened on the server (admin mutation,
// Stars/TON purchase credit, marketplace buy/sell, wheel/daily/referral
// reward) since our last sync. We snap the local balance to the server
// value ONLY WHEN IT IS HIGHER than the live local balance (USER
// REQUIREMENT, May 2026: visible $ZOOM must never tick downward on
// re-entry or sync). When the server returns a lower value (admin-remove
// race, another-device-spend), we ignore the value but still adopt the
// epoch — the next /balance/sync travels with the right ce, falls into
// the server's GREATEST(0, client) ELSE branch, and re-asserts the local
// value upward. The TON merge (below) is server-authoritative-up only by
// design (server uses GREATEST), so it remains an upward-only snap too.
function reconcileFromSyncResponse(
  sentBalance: number,
  sentEpoch: number,
  res: { zoomBalance: number; balanceEpoch: number; tonBalance?: number; stardustBalance?: number; redStarBalance?: number },
  sentTonBalance?: number,
  sentStardustBalance?: number,
): void {
  // ORDER MATTERS — race fix.
  //
  // The naive ordering (bump _currentBalanceEpoch first, then dispatch the
  // setState-driven balance snap) leaves a window where:
  //   • _currentBalanceEpoch     == new (e.g. 6, just credited by the server)
  //   • stateRef.current.balance == old (still 1000 — React hasn't committed
  //                                       the snap setState yet)
  // Any sync that fires inside that window (periodic doSync, tab-switch
  // throttled doSync, or an immediate sync triggered by a stray tap) reads
  // stateRef.current.balance == 1000 and ce == 6, then sends them to the
  // server. The server's CASE WHEN balance_epoch > clientEpoch THEN keep
  // ELSE GREATEST(0, client) END takes the ELSE branch (epoch == ce, not >),
  // and overwrites the freshly credited 1100 back to 1000 — silently
  // losing the wheel/admin/marketplace prize. Symptom: the YOU WON popup
  // appears but the visible balance never rises.
  //
  // Fix: snap stateRef + _lastSyncedBalance SYNCHRONOUSLY, then bump the
  // epoch. Now any concurrent sync sees the already-snapped (balance, epoch)
  // pair and the server preserves the credit.
  const serverAdvanced = res.balanceEpoch > sentEpoch;
  // When the server has advanced the epoch (admin credit/remove, wheel
  // prize, marketplace sale, offline farming credit), the server value is
  // authoritative. We snap the client balance regardless of direction so
  // that admin removals and cross-device reconciliations are visible.
  // The epoch advance itself is the signal of authority, not the relative
  // balance magnitude.
  if (serverAdvanced) {
    if (_stateRefHolder) {
      _stateRefHolder.current = { ..._stateRefHolder.current, balance: res.zoomBalance };
    }
    _lastSyncedBalance = res.zoomBalance;
    _pendingSyncBalance = -1;
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-balance-snap", {
        detail: { balance: res.zoomBalance, epoch: res.balanceEpoch },
      }));
    } catch { /**/ }
  }
  // For TON we use a non-destructive merge on the server (GREATEST), so the
  // server can return a value HIGHER than what we sent even when the epoch
  // didn't advance (e.g. an earlier session credited TON, or an admin grant
  // bumped the stored balance). Whenever the server reports a strictly
  // higher TON than the client sent, snap local up so the user actually
  // sees the credited amount. Same synchronous-stateRef-first ordering as
  // the ZOOM snap above, for the same race-window reason.
  if (
    typeof res.tonBalance === "number" &&
    typeof sentTonBalance === "number" &&
    (res.tonBalance ?? 0) - (sentTonBalance ?? 0) > 1e-9
  ) {
    if (_stateRefHolder) {
      _stateRefHolder.current = { ..._stateRefHolder.current, tonBalance: res.tonBalance };
    }
    _lastSyncedTonBalance = res.tonBalance;
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-ton-snap", {
        detail: { tonBalance: res.tonBalance, epoch: res.balanceEpoch },
      }));
    } catch { /**/ }
  }
  // Stardust: always server-authoritative-up only (same as TON). If the server
  // reports a higher value than the client sent, snap local up so admin
  // grants or cross-device stardust collect are visible immediately.
  if (
    typeof res.stardustBalance === "number" &&
    typeof sentStardustBalance === "number" &&
    (res.stardustBalance ?? 0) - (sentStardustBalance ?? 0) > 0
  ) {
    if (_stateRefHolder) {
      _stateRefHolder.current = { ..._stateRefHolder.current, stardustBalance: res.stardustBalance };
    }
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-stardust-snap", {
        detail: { stardustBalance: res.stardustBalance, epoch: res.balanceEpoch },
      }));
    } catch { /**/ }
  }
  // REDSTAR: server-authoritative-up only. Snap local state whenever the
  // server returns a value higher than what we currently hold (admin credits
  // or future gameplay mechanics). Never decremented client-side.
  if (
    typeof res.redStarBalance === "number" &&
    _stateRefHolder &&
    res.redStarBalance > (_stateRefHolder.current.redStarBalance ?? 0)
  ) {
    _stateRefHolder.current = { ..._stateRefHolder.current, redStarBalance: res.redStarBalance };
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-redstar-snap", {
        detail: { redStarBalance: res.redStarBalance },
      }));
    } catch { /**/ }
  }
  // Bump the epoch LAST so any sync that fires after this point already sees
  // the snapped balance/TON in stateRef + _lastSyncedBalance.
  setCurrentBalanceEpoch(res.balanceEpoch);
}

function immediateSyncToServer(state: GameState) {
  const { telegramId } = getTelegramContext();
  if (!telegramId) return;
  const balance = Math.floor(state.balance);
  const tonNow = Math.max(0, state.tonBalance || 0);
  // Sync if EITHER currency changed since the last sync — TON-only changes
  // (collect/reactivate of white planets) must persist promptly too.
  const tonChanged = Math.abs(tonNow - _lastSyncedTonBalance) > 1e-9;
  if (balance === _lastSyncedBalance && !tonChanged) return;

  if (_syncInFlight) {
    _pendingSyncBalance = balance;
    return;
  }

  _lastSyncedBalance = balance;
  _lastSyncedTonBalance = tonNow;
  _syncInFlight = true;
  const ctx_ = getTelegramContext();
  const firstName = ctx_.firstName;
  const username = ctx_.username;
  const photoUrl = ctx_.photoUrl;
  const sentEpoch = _currentBalanceEpoch;
  const sentTon = Math.max(0, state.tonBalance || 0);
  const sentStardust = Math.floor(state.stardustBalance || 0);
  const sentRedStar = Math.floor(state.redStarBalance || 0);
  syncBalance({ telegramId, firstName, username, photoUrl, zoomBalance: balance, tonBalance: sentTon, stardustBalance: sentStardust, redStarBalance: sentRedStar, clientEpoch: sentEpoch })
    .then((res) => {
      reconcileFromSyncResponse(balance, sentEpoch, res, sentTon, sentStardust);
      _syncInFlight = false;
      if (_pendingSyncBalance >= 0 && _pendingSyncBalance !== _lastSyncedBalance) {
        const nextBalance = _pendingSyncBalance;
        _pendingSyncBalance = -1;
        const { telegramId: tid, firstName: fn, username: un, photoUrl: pu } = getTelegramContext();
        if (tid) {
          _lastSyncedBalance = nextBalance;
          _syncInFlight = true;
          const sentEpoch2 = _currentBalanceEpoch;
          // Re-send the same TON value we just sent: this follow-up sync is
          // only chasing the deferred ZOOM update; tonBalance state is owned
          // by setState callbacks and we don't have access to it here.
          const sentTon2 = sentTon;
          const sentStardust2 = sentStardust;
          const sentRedStar2 = sentRedStar;
          syncBalance({ telegramId: tid, firstName: fn, username: un, photoUrl: pu, zoomBalance: nextBalance, tonBalance: sentTon2, stardustBalance: sentStardust2, redStarBalance: sentRedStar2, clientEpoch: sentEpoch2 })
            .then((r2) => { reconcileFromSyncResponse(nextBalance, sentEpoch2, r2, sentTon2, sentStardust2); _syncInFlight = false; })
            .catch(() => { _syncInFlight = false; });
        }
      }
    })
    .catch(() => { _syncInFlight = false; });
}

function publishFeedEvent(event: FeedEvent) {
  try {
    localStorage.setItem(LIVE_EVENT_KEY, JSON.stringify(event));
  } catch { /**/ }
  try {
    const channel = new BroadcastChannel(LIVE_EVENT_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } catch { /**/ }
}

function withFeedEvent(state: GameState, text: string): GameState {
  const event: FeedEvent = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
    text,
    timestamp: Date.now(),
  };
  publishFeedEvent(event);
  return {
    ...state,
    feedEvents: [event, ...state.feedEvents].slice(0, MAX_FEED_EVENTS),
  };
}

function rollRarity(): PlanetType {
  const r = Math.random();
  let cumulative = 0;
  for (const [type, cfg] of Object.entries(PLANET_CONFIG) as [PlanetType, typeof PLANET_CONFIG[PlanetType]][]) {
    cumulative += cfg.chance;
    if (r <= cumulative) return type;
  }
  return "BASIC";
}

function makeWhiteCollectionPlanets(bundleIndex = 0): Planet[] {
  const now = serverNow();
  return WHITE_PLANET_TYPES.map((type, i) => {
    const cfg = PLANET_CONFIG[type];
    return {
      id: `white-${type}-b${bundleIndex}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
      name: type,
      rate: cfg.rate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: 0,
      slotIndex: null,
    };
  });
}

function makeEarthCollectionPlanets(bundleIndex = 0): Planet[] {
  const now = serverNow();
  return EARTH_PLANET_TYPES.map((type, i) => {
    const cfg = PLANET_CONFIG[type];
    return {
      id: `earth-${type}-b${bundleIndex}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
      name: type,
      rate: cfg.rate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: 0,
      slotIndex: null,
    };
  });
}

function makeSupernovaCollectionPlanets(bundleIndex = 0): Planet[] {
  const now = serverNow();
  return SUPERNOVA_PLANET_TYPES.map((type, i) => {
    const cfg = PLANET_CONFIG[type];
    return {
      id: `supernova-${type}-b${bundleIndex}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
      name: type,
      rate: cfg.rate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: 0,
      slotIndex: null,
    };
  });
}

function makeStellaRossaCollectionPlanets(bundleIndex = 0): Planet[] {
  const now = serverNow();
  return STELLA_PLANET_TYPES.map((type, i) => {
    const cfg = PLANET_CONFIG[type];
    return {
      id: `stella-${type}-b${bundleIndex}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
      name: type,
      rate: cfg.rate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: 0,
      slotIndex: null,
    };
  });
}

function makeBlackCollectionPlanets(bundleIndex = 0): Planet[] {
  const now = serverNow();
  return BLACK_PLANET_TYPES.map((type, i) => {
    const cfg = PLANET_CONFIG[type];
    return {
      id: `black-${type}-b${bundleIndex}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
      name: type,
      rate: cfg.rate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: 0,
      slotIndex: null,
    };
  });
}

// Parse the (kind, bundleIndex, subIndex) tuple out of a White or Earth
// collection planet id. Returns null for any other planet id (regular,
// bonus, marketplace, etc.). Format produced by makeWhiteCollectionPlanets
// / makeEarthCollectionPlanets:
//   `${kind}-${type}-b${bundleIndex}-${now}-${i}-${random}`
//
// `now` is `serverNow()` which can be a float (server-time offset includes
// half-RTT calibration), so the timestamp segment must allow `.<digits>`.
export function parseCollectionPlanetKey(
  id: string,
): { kind: "white" | "earth" | "black" | "supernova"; bundleIndex: number; subIndex: number } | null {
  const m = /^(white|earth|black|supernova|stella)-[A-Z0-9]+-b(\d+)-\d+(?:\.\d+)?-(\d+)-/.exec(id);
  if (!m) return null;
  return {
    kind: m[1] as "white" | "earth" | "black" | "supernova",
    bundleIndex: parseInt(m[2]!, 10),
    subIndex: parseInt(m[3]!, 10),
  };
}

// Snapshot the server-persisted state for a collection planet (used by the
// upsert calls below). Returns null when the planet id can't be parsed,
// which means the upsert should be skipped.
function snapshotCollectionPlanet(p: Planet): CollectionPlanetState | null {
  const key = parseCollectionPlanetKey(p.id);
  if (!key) return null;
  return {
    kind: key.kind,
    bundleIndex: key.bundleIndex,
    subIndex: key.subIndex,
    slotIndex: p.slotIndex ?? null,
    isFarmingActive: !!p.isFarmingActive,
    farmStartedAtMs: p.farmStartedAt ?? 0,
    lastCollectedAtMs: p.lastCollectedAt ?? 0,
  };
}

// Merge server-persisted slot/farming state into a freshly materialized (or
// already-loaded) array of collection planets. Planets that have a matching
// server record adopt the server values for slotIndex / isFarmingActive /
// farmStartedAt / lastCollectedAt — every other field stays as-is.
function applyServerOverrides(
  planets: Planet[],
  serverByKey: Map<string, CollectionPlanetState>,
): Planet[] {
  if (planets.length === 0 || serverByKey.size === 0) return planets;
  return planets.map((p) => {
    const key = parseCollectionPlanetKey(p.id);
    if (!key) return p;
    const sp = serverByKey.get(`${key.kind}-${key.bundleIndex}-${key.subIndex}`);
    if (!sp) return p;
    return {
      ...p,
      slotIndex: sp.slotIndex ?? null,
      isFarmingActive: sp.isFarmingActive,
      farmStartedAt: sp.farmStartedAtMs,
      lastCollectedAt: sp.lastCollectedAtMs,
    };
  });
}

function indexServerCollectionPlanets(
  serverPlanets: CollectionPlanetState[],
): Map<string, CollectionPlanetState> {
  const map = new Map<string, CollectionPlanetState>();
  for (const sp of serverPlanets) {
    map.set(`${sp.kind}-${sp.bundleIndex}-${sp.subIndex}`, sp);
  }
  return map;
}

// Fire-and-forget upsert of a single collection planet's server state. All
// collection-planet mutations (place, collect, reactivate, mark-reactivated)
// call this so the server stays in lockstep with the client.
function persistCollectionPlanet(telegramId: string | null | undefined, planet: Planet): void {
  if (!telegramId) return;
  const snap = snapshotCollectionPlanet(planet);
  if (!snap) return;
  void upsertCollectionPlanet(telegramId, snap);
}

function makePlanet(rarity: PlanetType): Planet {
  const cfg = PLANET_CONFIG[rarity];
  const now = serverNow();
  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
    name: rarity,
    rate: cfg.rate,
    color: cfg.color,
    glowColor: cfg.glowColor,
    createdAt: now,
    // farmStartedAt and lastCollectedAt remain 0 until the user actually
    // presses START for the first time. This is what lets startFarming
    // distinguish "never been started" from "mid-cycle, just paused" —
    // which in turn closes the marketplace cooldown-reset exploit
    // (list → delist → START would otherwise grant a free fresh cycle).
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: false,
    isFarmingActive: false,
    marketPrice: null,
    craftCost: cfg.craftCost,
    // Cosmetic CS:GO-style perfection score, generated once at craft
    // and frozen forever (server preserves first-write via server-merge).
    float: generateRandomFloat(),
  };
}

/**
 * Hard cutoff for the legacy never-started migration. Planets created on or
 * after this instant always use the new init scheme (farmStartedAt = 0), so
 * the migration is irrelevant to them and we refuse to touch them. Anything
 * created before this instant predates the fix and is eligible for the
 * migration check below.
 *
 * Set to the deploy moment of this fix (April 27, 2026 UTC). This bound is
 * what eliminates any theoretical risk of misclassifying a planet that was
 * (somehow) started in the same millisecond as its creation under the old
 * code — such a planet, by definition, was created before the cutoff, but
 * also we further require strict timestamp equality below, and the cutoff
 * guarantees the migration cannot run forever / on future planets.
 */
const LEGACY_PLANET_MIGRATION_CUTOFF_MS = Date.UTC(2026, 3, 27, 0, 0, 0);

/**
 * One-time migration for legacy planets stored with farmStartedAt = createdAt.
 *
 * Before the cooldown-reset fix, every newly created planet (craft, bonus
 * grant, buyer copy) was initialized with farmStartedAt = lastCollectedAt =
 * createdAt = now, AND startFarming reset both timestamps to "now" on every
 * call. After the fix, never-started planets must start at 0 so that the
 * very first START opens a fresh 24h cycle. Legacy planets already in the
 * user's local/server snapshot would otherwise be misclassified as
 * "mid-cycle, just paused" and either resume from craft time or, if more
 * than 24h have passed since craft, demand a reactivation fee for a cycle
 * the user never actually got to use.
 *
 * The detection is conservative on multiple axes:
 *   - Active or listed planets are skipped (they are clearly in use).
 *   - farmStartedAt must be > 0 (new planets already use 0).
 *   - farmStartedAt and lastCollectedAt must both exactly equal createdAt
 *     (the unique fingerprint of the legacy "just-crafted-never-started"
 *     state under the old init code).
 *   - createdAt must be strictly before the deploy cutoff. Combined with
 *     the inits-as-zero rule, this guarantees no future planet can ever
 *     match the migration fingerprint, so the migration ages out naturally.
 *
 * After the very first START under the new code, farmStartedAt no longer
 * equals createdAt (start time > craft time), so the migration self-
 * disables for that planet too.
 *
 * Documented residual ambiguity (accepted tradeoff):
 *   The migration cannot mathematically distinguish a true never-started
 *   pre-cutoff planet from one that was started in the same millisecond as
 *   its creation under the old code. A "false positive" here would gift a
 *   single fresh 24h cycle to a single legacy planet. We accept this for
 *   two reasons: (a) sub-millisecond human reaction time is physically
 *   impossible (>16ms render frames, ~100ms minimum human reaction), and
 *   the craft → render → tap pipeline forces multiple ticks between craft
 *   time and any START click, so in practice no real planet ever has
 *   farmStartedAt === createdAt unless it was truly never started; (b) the
 *   alternative (no migration) charges real users a reactivation fee in
 *   TON for cycles they never actually used, which is a far worse
 *   real-money outcome than the theoretical false positive.
 */
function migrateLegacyNeverStartedPlanet<T extends Planet>(p: T): T {
  if (p.isFarmingActive) return p;
  if (p.isListedInMarket) return p;
  if (p.farmStartedAt <= 0) return p;
  if (p.farmStartedAt !== p.createdAt) return p;
  if (p.lastCollectedAt !== p.createdAt) return p;
  if (p.createdAt >= LEGACY_PLANET_MIGRATION_CUTOFF_MS) return p;
  return { ...p, farmStartedAt: 0, lastCollectedAt: 0 };
}

/**
 * "Effective" farm start timestamp.
 *
 * As of the daily-collect removal, the 24h farming cycle is anchored to a
 * single timestamp. For brand-new cycles this is just `farmStartedAt`. For
 * planets that existed BEFORE the daily-collect removal and had already
 * been collected at least once, `lastCollectedAt` may be more recent than
 * `farmStartedAt`. Using the max of the two means those planets get a fresh
 * 24h window starting from the last time the user pressed COLLECT — exactly
 * the "riattiva automaticamente, come se avessi appena cliccato collect"
 * migration the user asked for. Idempotent and zero-cost: for new planets
 * (lastCollectedAt = 0) it collapses to `farmStartedAt`.
 */
export function effectiveFarmStart(planet: Planet): number {
  return Math.max(planet.farmStartedAt || 0, planet.lastCollectedAt || 0);
}

export function isFarmActive(planet: Planet): boolean {
  if (!planet.isFarmingActive) return false;
  if (planet.isListedInMarket) return false;
  if ((planet.durability ?? 100) <= 0) return false;  // frozen — durability depleted
  const start = effectiveFarmStart(planet);
  if (start <= 0) return false;
  return serverNow() - start <= FARM_DURATION_MS;
}

export function isSunActive(sun: SunState): boolean {
  if (!sun.isActive) return false;
  const now = serverNow();
  if (now - sun.farmStartedAt > FARM_DURATION_MS) return false;
  if (now - sun.lastCollectedAt > DAILY_COLLECT_MS) return false;
  return true;
}

export function getFarmTimeRemaining(planet: Planet): number {
  const start = effectiveFarmStart(planet);
  if (start <= 0) return 0;
  return Math.max(0, start + FARM_DURATION_MS - serverNow());
}

/**
 * Planet's 24h farming cycle has elapsed and the user must pay a reactivation
 * fee to start a new cycle. Excludes never-started planets and listed planets.
 */
export function isFarmExpired(planet: Planet): boolean {
  if (planet.isListedInMarket) return false;
  const start = effectiveFarmStart(planet);
  if (start <= 0) return false;
  return serverNow() - start > FARM_DURATION_MS;
}

export function getReactivationFee(planet: Planet): number {
  return PLANET_CONFIG[planet.name].reactivationFee;
}

/**
 * Real-time TON pending on a single placed white planet (uncollected since
 * lastCollectedAt, capped to the 24h DAILY_COLLECT_MS window). Used by the UI
 * to show a live-ticking TON balance in the Pixel-Avatar modal.
 */
export function getWhitePlanetPendingTon(planet: Planet, now: number = serverNow()): number {
  if (planet.slotIndex == null || !planet.isFarmingActive) return 0;
  const cfg = PLANET_CONFIG[planet.name];
  if (!cfg.isTonFarming) return 0;
  // Defensive: if a TON-farming planet somehow lingers in state after the
  // admin revoked the underlying collection, we still don't credit anything.
  // Callers should also strip the planets from state, but this guard ensures
  // the live balance display can never re-credit a revoked collection.
  if (cfg.isTonFarming && !planet.farmStartedAt) return 0;
  const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
  const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
  if (end <= start) return 0;
  return (cfg.rate / 3_600_000) * (end - start);
}

/**
 * SUN cycle (24h) has elapsed since the last activation and a $ZOOM
 * reactivation fee is required to start a new cycle.
 */
export function isSunExpired(sun: SunState | null): boolean {
  if (!sun?.isOwned) return false;
  if (sun.farmStartedAt <= 0) return false;
  return serverNow() - sun.farmStartedAt > FARM_DURATION_MS;
}

// Reactivation fee scales with how many SUNs the user owns: each SUN multiplies
// the per-cycle yield (1000/hr * sunCount), so each SUN must also pay its share
// of the fee — otherwise multi-SUN owners would reactivate for a fraction of
// what they earn. With sunCount=1 this is the historical 12,000 ZOOM.
// If the user owns no SUN, the fee is 0 (nothing to reactivate).
export function getSunReactivationFee(sunCount: number = 1): number {
  const n = Math.max(0, sunCount || 0);
  if (n <= 0) return 0;
  return SUN_CONFIG.reactivationFee * n;
}

export function getSunTimeRemaining(sun: SunState): number {
  if (!sun.isActive) return 0;
  const expiry = sun.farmStartedAt + FARM_DURATION_MS;
  return Math.max(0, expiry - serverNow());
}

/**
 * DEPRECATED — daily collect was removed. Planets now farm autonomously for
 * the full 24h cycle and then need a $ZOOM reactivation, with no manual
 * intermediate step. Kept exported as a no-op so any cached client code or
 * re-export site keeps compiling; always returns false so no UI ever renders
 * the old COLLECT button. Safe to delete in a future cleanup pass.
 */
export function needsCollect(_planet: Planet): boolean {
  return false;
}

export function sunNeedsCollect(sun: SunState): boolean {
  return isSunActive(sun) && serverNow() - sun.lastCollectedAt > DAILY_COLLECT_MS * 0.9;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const DEFECT_CHANCE = 0.04;
const DYNAMIC_BONUS_MAX = 10;
// Server's deterministic bonus is the AVERAGE of the old random range
// (artifacts/api-server/src/routes/farm-settle.ts → DYNAMIC_BONUS_AVG =
// DYNAMIC_BONUS_MAX / 2 = 5). Mirroring the same constant here keeps the
// client's offline-earnings preview EXACTLY equal to what the server credits,
// so the visible balance never bounces on app open.
const DYNAMIC_BONUS_AVG = DYNAMIC_BONUS_MAX / 2;

function settleFarmingState(state: GameState, now: number): GameState {
  const from = state.lastFarmingSettledAt || now;
  if (now <= from) return state;

  const speedMultiplier = 1 + (state.referralSpeedBonus || 0);
  let earned = 0;

  for (const planet of state.planets) {
    if (!planet.isFarmingActive || planet.isListedInMarket) continue;
    // Daily-collect removed: cycle window is the single 24h block starting at
    // effectiveFarmStart (= max(farmStartedAt, lastCollectedAt) so pre-deploy
    // planets that had already been collected get fresh 24h from the last
    // collect — see effectiveFarmStart() docstring).
    const eff = effectiveFarmStart(planet);
    if (eff <= 0) continue;
    const start = Math.max(from, eff);
    const end = Math.min(now, eff + FARM_DURATION_MS);
    if (end > start) {
      // IMPORTANT: must stay deterministic and EXACTLY match the server formula
      // in artifacts/api-server/src/routes/farm-settle.ts (line 188:
      // `effectiveRate = rate + DYNAMIC_BONUS_AVG`). Previously this used
      // `planet.rate + Math.random() * DYNAMIC_BONUS_MAX`, which made the
      // client over-estimate offline earnings on app open: balance jumped
      // (e.g. 59662 → 60500), then `/farm/settle` returned the deterministic
      // server total (60362) and the epoch-advance snap pulled the UI DOWN.
      // Using the same `+ DYNAMIC_BONUS_AVG` constant on both sides keeps the
      // preview exactly equal to the credit, so the visible balance never
      // moves backwards on open.
      const effectiveRate = planet.rate + DYNAMIC_BONUS_AVG;
      earned += (effectiveRate / 3_600_000) * (end - start) * speedMultiplier;
    }
  }

  // White Collection planets earn TON (not ZOOM) and accumulate into tonBalance
  // when the user presses COLLECT. Real-time pending TON for display is computed
  // separately via getWhitePlanetPendingTon(); here we only need to update the
  // settle timestamp — actual TON crediting happens on collectWhitePlanet().

  if (state.sun?.isActive) {
    const start = Math.max(from, state.sun.farmStartedAt, state.sun.lastCollectedAt);
    const end = Math.min(now, state.sun.farmStartedAt + FARM_DURATION_MS, state.sun.lastCollectedAt + DAILY_COLLECT_MS);
    if (end > start) {
      const sunMultiplier = Math.max(1, state.sunCount || 1);
      earned += (SUN_CONFIG.rate * sunMultiplier / 3_600_000) * (end - start) * speedMultiplier;
    }
  }

  // Equipment items follow the same 24h farming-cycle window as planets:
  // user activates, item earns for 24h, then needs Reactivate. Mirrors
  // the server formula in farm-settle.ts (no DYNAMIC_BONUS since
  // equipment has no per-tick random bonus on the client).
  for (const item of state.equipment || []) {
    if (!item.isFarmingActive || item.isListedInMarket) continue;
    const eff = Math.max(item.farmStartedAt || 0, item.lastCollectedAt || 0);
    if (eff <= 0) continue;
    const start = Math.max(from, eff);
    const end = Math.min(now, eff + FARM_DURATION_MS);
    if (end > start && item.rate > 0) {
      earned += (item.rate / 3_600_000) * (end - start) * speedMultiplier;
    }
  }

  if (earned <= 0) return { ...state, lastFarmingSettledAt: now };

  return {
    ...state,
    balance: state.balance + earned,
    totalEarned: state.totalEarned + earned,
    seasonPoolEarned: state.seasonPoolEarned + earned,
    lastFarmingSettledAt: now,
  };
}

export function useGameState() {
  const [state, setState] = useState<GameState>(loadState);
  const stateRef = useRef(state);
  // Expose stateRef to module-scope helpers (`reconcileFromSyncResponse`)
  // so they can perform the synchronous wheel/admin race-fix snap into
  // the same source-of-truth that the periodic doSync reads from. The
  // hook's `stateRef.current = state` line below keeps it fresh on every
  // React commit; this single registration only re-points the holder once
  // (on mount) — re-registering on every render would be harmless but is
  // unnecessary, the ref's `.current` updates flow through automatically.
  if (_stateRefHolder !== stateRef) {
    _registerStateRef(stateRef);
  }
  const serverOffsetRef = useRef(0);
  // Becomes true once the initial flow has hydrated state from the server
  // (or confirmed there's nothing to hydrate). Until then we suppress the
  // regular-planets server save effect so we never overwrite the server
  // copy with a stale local snapshot during the brief window between the
  // first React render and the async fetch completing.
  const regularPlanetsHydratedRef = useRef(false);
  // Same gate, but for the equipment inventory. Set to true only after
  // fetchEquipment has succeeded so the debounced save effect cannot push
  // an empty local default over a populated server array on cold start.
  const equipmentHydratedRef = useRef(false);
  // Monotonic counter bumped from inside applyGrants whenever a bonus
  // planet is materialized. The debounced save effect compares this to
  // `lastImmediateBonusSaveTickRef` and, if they differ, fires
  // saveRegularPlanets IMMEDIATELY (in addition to the debounced one)
  // so the freshly-minted planet reaches the server BEFORE the user
  // can close the Mini App. See "ghost RARE" comment in applyGrants.
  const bonusMintTickRef = useRef(0);
  const lastImmediateBonusSaveTickRef = useRef(0);
  stateRef.current = state;

  // Seed the module-scope epoch tracker from the persisted balance epoch on
  // first mount. `_currentBalanceEpoch` starts at 0; without this seed, the
  // first debounced /balance/sync (fired ~400ms after the cold-start
  // farming-settle setState, before the async init flow has run
  // setCurrentBalanceEpoch) travels with clientEpoch=0. The server then takes
  // its `balance_epoch > clientEpoch` branch, treats this client as stale,
  // returns the stored server value with an advanced epoch — and
  // reconcileFromSyncResponse snaps the VISIBLE balance DOWN a few seconds
  // after open (USER REPORT, June 2026: "per un attimo è giusto, dopo qualche
  // secondo scende"). Seeding the last-known epoch makes the cold-start sync
  // carry the correct `ce`, so the server only snaps us down on a GENUINE
  // authoritative change (real admin remove / cross-device spend), never on
  // every re-entry.
  const epochSeededRef = useRef(false);
  if (!epochSeededRef.current) {
    epochSeededRef.current = true;
    if (state.lastBalanceEpoch) setCurrentBalanceEpoch(state.lastBalanceEpoch);
  }

  // Throttle save+sync: writes & network traffic are expensive on every state change.
  // Debounce 400ms so rapid taps coalesce into one save+sync. Always flush on hide/unload.
  useEffect(() => {
    const t = setTimeout(() => {
      saveState(stateRef.current);
      immediateSyncToServer(stateRef.current);
    }, 400);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const flush = () => {
      flushPersist();
      // If a destructive op (burn/sell/list/buy) just persisted authoritatively
      // within the last 250ms, stateRef.current may still be the PRE-op value
      // because React hasn't yet committed the new state. Writing it here
      // would resurrect burned/sold items on the next reload. Skip — the
      // destructive op already saved the truth.
      if (Date.now() - _lastSavedAt > 250) {
        saveState(stateRef.current);
      }
      immediateSyncToServer(stateRef.current);
    };
    const onVisibility = () => { if (document.hidden) flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  // Season-epoch sync: if admin reset the season, wipe client-side counters
  useEffect(() => {
    let cancelled = false;
    const SEASON_EPOCH_KEY = "zoom-season-epoch";
    const check = async () => {
      const serverEpoch = await fetchSeasonEpoch();
      if (cancelled || !serverEpoch) return;
      let localEpoch = 0;
      try { localEpoch = Number(localStorage.getItem(SEASON_EPOCH_KEY) || "0"); } catch { /**/ }
      if (serverEpoch > localEpoch) {
        try { localStorage.setItem(SEASON_EPOCH_KEY, String(serverEpoch)); } catch { /**/ }
        setState((prev) => ({
          ...prev,
          balance: 0,
          totalEarned: 0,
          seasonPoolEarned: 0,
          totalTonSpent: 0,
          claimedMilestones: [],
        }));
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const { telegramId, startParam, firstName, username, photoUrl } = getTelegramContext();

    const webApp = (window as unknown as { Telegram?: { WebApp?: { initData?: string; initDataUnsafe?: unknown } } }).Telegram?.WebApp;
    const rawInitData = webApp?.initData ?? "";
    const rawUnsafe = webApp?.initDataUnsafe ? JSON.stringify(webApp.initDataUnsafe) : "";
    const lsParam = (() => { try { return localStorage.getItem("zoom-start-param"); } catch { return null; } })();

    debugTelegramContext({
      telegramId,
      initData: rawInitData,
      initDataUnsafe: rawUnsafe,
      startParam,
      localStorageParam: lsParam,
      href: window.location.href,
      hash: window.location.hash,
      search: window.location.search,
    });

    if (!telegramId) return;

    (async () => {
      // Calibrate server clock BEFORE settling so the first balance
      // computation already uses server-authoritative time.
      await refreshServerOffset();
      const offset = _serverOffsetMs;
      serverOffsetRef.current = offset;

      setState((prev) => settleFarmingState(prev, serverNow()));

      let referrer = startParam;
      if (!referrer) {
        const pending = await fetchPendingReferral(telegramId);
        if (pending) {
          referrer = pending;
        }
      }

      const result = await registerUser(telegramId, referrer ?? undefined, firstName, username, photoUrl);

      if (result.isNew && referrer) {
        try { localStorage.removeItem("zoom-start-param"); } catch { /**/ }
      }

      // Server-authoritative offline accrual. Runs in parallel with the
      // other fetches; uses the local watermark as a floor so legacy
      // devices that have been crediting offline accrual locally are
      // protected from a one-off double-credit on the very first
      // server-side settle. See settleOfflineFarming() doc for details.
      const _initClientFloor = Math.floor(stateRef.current.lastFarmingSettledAt || 0);
      const [refData, grantsResult, balanceRecord, serverCollectionPlanets, serverRegular, settleRes, serverEquipment] = await Promise.all([
        fetchReferralData(telegramId),
        fetchGrants(telegramId),
        fetchBalanceRecord(telegramId),
        fetchCollectionPlanets(telegramId),
        fetchRegularPlanets(telegramId),
        settleOfflineFarming({ telegramId, clientLastSettledAtMs: _initClientFloor }),
        fetchEquipment(telegramId),
      ]);
      // grantsResult is `null` when /grants failed (network/HTTP). We must
      // NOT treat that as "user has nothing": doing so would trip the
      // destructive branches below (SUN reset, slot bonus reset, collection
      // bundle revoke) and silently wipe owned state. We use EMPTY_GRANTS
      // only as a placeholder for the few non-destructive read sites and
      // gate the entire grants-derived block on grantsOk.
      const grantsOk = grantsResult !== null;
      const grants = grantsResult ?? { bonusSlots: 0, bonusSun: false, sunCount: 0, bonusBasic: 0, bonusRare: 0, bonusEpic: 0, bonusGold: 0, bonusMythic: 0, bonusNova: 0, bonusPlasma: 0, bonusV1: 0, bonusV1NftPlatinum: 0, hasAutoTap: false, whiteCollectionUnlocked: false, whiteCollectionBundles: 0, earthCollectionUnlocked: false, earthCollectionBundles: 0, blackCollectionUnlocked: false, blackCollectionBundles: 0, supernovaCollectionUnlocked: false, supernovaCollectionBundles: 0, stellaRossaCollectionUnlocked: false, stellaRossaCollectionBundles: 0, tonBalance: 0, depositBalance: 0, sunFarmStartedAtMs: 0, sunLastCollectedAtMs: 0, sunCycleCount: 0 };
      const serverCollectionByKey = indexServerCollectionPlanets(serverCollectionPlanets);

      // Prefer the post-credit balance returned by /farm/settle when the
      // user row exists; it always supersedes balanceRecord (which was
      // fetched in parallel and may pre-date the credit by a few ms).
      const serverBalance = settleRes.exists
        ? settleRes.balance
        : balanceRecord?.exists ? balanceRecord.zoomBalance : 0;
      // Use the freshest epoch available — settleRes can be a step ahead of
      // balanceRecord when /farm/settle just bumped it (epochBump on credit).
      const serverEpoch = Math.max(balanceRecord?.balanceEpoch ?? 0, settleRes.balanceEpoch ?? 0);
      const localEpoch = stateRef.current.lastBalanceEpoch ?? 0;
      const localBalance = Math.floor(stateRef.current.balance);
      const wasFreshLoad = consumeWasFreshLoad();
      // USER REQUIREMENT (May 2026): "Quando rientro non deve scendere, ma
      // soltanto salire e aggiornarsi con la produzione passiva di zoom."
      // On normal app re-entry (same device, localStorage present) the
      // visible $ZOOM balance must NEVER decrease — it may only grow from
      // offline-farming credit, admin grant, wheel/marketplace win, etc.
      // Strategy:
      //  • CROSS-DEVICE / FRESH STORAGE (`wasFreshLoad && balanceRecord
      //    exists`): localBalance is just the 300-ZOOM default and cannot
      //    be trusted. Snap to the server value — this also closes the
      //    "clear-localStorage to revive 300" inflation exploit.
      //  • NORMAL RE-ENTRY: take Math.max(local, server). Offline credits
      //    always land (server > local), and any transient lower-server
      //    read (race with admin write, stale `balanceRecord`, beacon flush
      //    not yet processed) cannot rob the user of locally-banked ZOOM.
      //    Per the user's explicit request, this intentionally lets a
      //    locally-higher balance overwrite a freshly admin-removed lower
      //    server balance on re-entry — admin can re-apply if needed.
      const epochAdvanced = serverEpoch > localEpoch;
      void epochAdvanced;
      const serverUserExists = !!balanceRecord?.exists || !!settleRes.exists;
      const finalBalance = wasFreshLoad && serverUserExists
        ? serverBalance
        : Math.max(localBalance, serverBalance);

      setCurrentBalanceEpoch(serverEpoch);
      // Pull authoritative TON balance from /grants and seed local state with
      // it before syncing back, so other devices' TON earnings/spends are
      // reflected immediately on this device.
      const serverTonBalance = Math.max(0, grants.tonBalance ?? 0);
      const serverDepositBalance = Math.max(0, grants.depositBalance ?? 0);
      const sentTon = serverTonBalance;
      const syncRes = await syncBalance({ telegramId, firstName, username, photoUrl, zoomBalance: Math.floor(finalBalance), tonBalance: sentTon, clientEpoch: serverEpoch });
      setCurrentBalanceEpoch(syncRes.balanceEpoch);

      setState((prev) => {
        // Same rule as finalBalance above (USER REQUIREMENT, May 2026):
        // on normal re-entry the visible balance must never decrease.
        // EXCEPTION: cross-device first load (wasFreshLoad && balanceRecord
        // exists) MUST snap to the server value verbatim — otherwise a user
        // could clear localStorage to revive the 300-ZOOM default and
        // overwrite a lower authoritative server balance via the next
        // /balance/sync (epoch-equal CASE branch takes the client value).
        void serverEpoch;
        const newBalance = (wasFreshLoad && serverUserExists)
          ? finalBalance
          : Math.max(prev.balance, finalBalance);
        let updated = {
          ...prev,
          referralCount: refData.referralCount,
          claimedMilestones: refData.claimedMilestones,
          balance: newBalance,
          // Server is the source of truth for TON balance on app load (it
          // captures collects/spends from other devices). After this seeding,
          // the local client becomes authoritative under epoch fencing.
          tonBalance: serverTonBalance,
          // Deposit balance is server-authoritative on app load (the only
          // mutations are server-side: TonConnect deposit credits and
          // /shop/buy-deposit debits). Replace local value verbatim.
          depositBalance: serverDepositBalance,
          lastBalanceEpoch: syncRes.balanceEpoch,
          // Adopt the server's settle watermark so subsequent client-side
          // ticks (and the next /farm/settle call) compute deltas from the
          // exact instant the server just authoritatively credited from.
          // Monotonic max ensures we never roll the watermark backwards if
          // the local one happened to be ahead (clock skew, race).
          lastFarmingSettledAt: settleRes.exists
            ? Math.max(prev.lastFarmingSettledAt || 0, settleRes.settledAtMs)
            : (prev.lastFarmingSettledAt || 0),
          // Equipment inventory: server is the source of truth on app load.
          // Replace the local array verbatim when the server responded ok;
          // otherwise (network failure) keep the local copy so we don't
          // wipe inventory on a transient blip.
          equipment: serverEquipment.ok ? serverEquipment.equipment : (prev.equipment ?? []),
        };

        // ─── GRANTS-DERIVED HYDRATION (gated on a successful /grants fetch) ───
        // Wrapping this entire block in `if (grantsOk)` is the second half of
        // the SUN-paused fix (the first being syncSunCycle's retry). If
        // /grants returned a transient error, we leave local state intact
        // and let the 30s poll re-converge. Without this gate, an
        // EMPTY_GRANTS payload would trip destructive branches below
        // (SUN reset when claimedBonusSun=true but bonusSun=false,
        // slot/autoTap reset, collection bundle revoke) and silently wipe
        // state the user actually still owns.
        if (grantsOk) {
        // Apply bonus sun from server (grant sun if not already owned)
        if (grants.bonusSun) {
          updated = {
            ...updated,
            claimedBonusSun: true,
            sunCount: Math.max(1, grants.sunCount || 1),
            sun: updated.sun?.isOwned ? updated.sun : {
              isOwned: true,
              isActive: false,
              activationCost: SUN_CONFIG.activationCostBase,
              cycleCount: 0,
              farmStartedAt: 0,
              lastCollectedAt: 0,
            },
          };
        } else if (updated.claimedBonusSun) {
          updated = { ...updated, sun: null, claimedBonusSun: false, sunCount: 0 };
        }

        // ─── SUN CYCLE — server is source of truth when ahead ───
        // The 24h cycle (started/collected timestamps + cycleCount) used to
        // live only in localStorage. Losing localStorage (cache wipe, new
        // device, certain Telegram WebView clears) silently reset the cycle
        // and forced the user to press FARM again. Now the server mirrors
        // these fields and we merge with max() — newer-on-server values win
        // (e.g. cycle started on another device); newer-on-local values are
        // preserved and will be pushed up on the next /sun/cycle write.
        if (updated.sun?.isOwned) {
          const srvStarted = Math.max(0, Number(grants.sunFarmStartedAtMs ?? 0));
          const srvCollected = Math.max(0, Number(grants.sunLastCollectedAtMs ?? 0));
          const srvCycleCount = Math.max(0, Number(grants.sunCycleCount ?? 0));
          const localStarted = updated.sun.farmStartedAt ?? 0;
          const localCollected = updated.sun.lastCollectedAt ?? 0;
          const localCycleCount = updated.sun.cycleCount ?? 0;
          const mergedStarted = Math.max(localStarted, srvStarted);
          const mergedCollected = Math.max(localCollected, srvCollected);
          const mergedCycleCount = Math.max(localCycleCount, srvCycleCount);
          updated = {
            ...updated,
            sun: {
              ...updated.sun,
              farmStartedAt: mergedStarted,
              lastCollectedAt: mergedCollected,
              cycleCount: mergedCycleCount,
              // Treat the cycle as active whenever a non-zero start exists.
              // The is-active gate is enforced separately by isSunActive()
              // (which also checks the 24h window), so this is just the
              // "user has activated at some point" flag.
              isActive: mergedStarted > 0 ? true : updated.sun.isActive,
            },
          };
          // Self-heal: if the local SUN cycle is AHEAD of the server (start
          // or collect timestamp), the original /sun/cycle write must have
          // been lost (network blip, 500, app closed mid-flight). Re-push
          // now so the server catches up — otherwise BASIC..GOLD staking
          // stays permanently locked with "Activate your SUN" until the
          // user reactivates manually. /sun/cycle uses GREATEST() so this
          // is idempotent and safe to fire on every hydration.
          //
          // Compare on the SAME integer space we send to the server (we
          // POST Math.round(...)). serverNow() can be fractional from
          // RTT/2 calibration, so a raw `local > srv` check would stay
          // true forever (1234.4 > 1234) and re-fire on every grants poll.
          const tid = updated.telegramId;
          const localStartedInt = Math.round(mergedStarted);
          const localCollectedInt = Math.round(mergedCollected);
          if (tid && (localStartedInt > srvStarted || localCollectedInt > srvCollected || mergedCycleCount > srvCycleCount)) {
            void syncSunCycle({
              telegramId: tid,
              sunFarmStartedAtMs: localStartedInt,
              sunLastCollectedAtMs: localCollectedInt,
              sunCycleCount: mergedCycleCount,
            });
          }
        }

        // ─── REGULAR PLANETS — server is source of truth ───
        // Only act on a SUCCESSFUL fetch (serverRegular.ok). On a network
        // failure we leave local state alone AND keep the save gate closed
        // (handled below) — otherwise a flaky network would let us push
        // an empty/stale local snapshot over the real server inventory.
        // When the fetch succeeds and the server has a non-empty stored
        // array, we override local planets[] with it. The per-rarity
        // claimed-bonus counters use Math.max(local, server) so a stale
        // server value can never double-count by being smaller than what
        // the local app already materialized.
        if (serverRegular.ok) {
          if (serverRegular.exists && (serverRegular.planets.length > 0 || stateRef.current.planets.length === 0)) {
            // Apply BOTH migrations as we hydrate so server-stored pianeti
            // arrive normalized for the rest of the app:
            //   1) `migrateLegacyNeverStartedPlanet` — fix old never-started
            //      planets that had spurious non-zero timestamps.
            //   2) `applyDailyCollectMigration` — daily-collect removal:
            //      pre-deploy planets stuck "expired due to missed collect"
            //      get a free 24h reactivation exactly once. Self-healing
            //      via the `lastCollectedAt > farmStartedAt` check, so it's
            //      safe to run here even though loadState already ran it on
            //      the local snapshot — server data is authoritative and
            //      may still hold pre-migration timestamps. The 1.2s
            //      debounced `saveRegularPlanets` below will then push the
            //      migrated values back to the server.
            const nowMs = serverNow();
            updated = {
              ...updated,
              planets: (serverRegular.planets as unknown as Planet[])
                .map(migrateLegacyNeverStartedPlanet)
                .map((p) => applyDailyCollectMigration(p, nowMs))
                .map((serverP) => {
                  // Race-condition guard: the debounced save (1.2s) may not
                  // have reached the server yet when this sync fires.
                  // Preserve client-side listing state so a listed planet
                  // doesn't flash back into inventory on the next sync.
                  const clientP = stateRef.current.planets.find(
                    (cp) => cp.id === serverP.id,
                  );
                  if (
                    clientP?.isListedInMarket &&
                    clientP?.serverListingId != null
                  ) {
                    return {
                      ...serverP,
                      isListedInMarket: true,
                      isFarmingActive: false,
                      marketPrice: clientP.marketPrice,
                      serverListingId: clientP.serverListingId,
                      pausedAt: clientP.pausedAt,
                    };
                  }
                  return serverP;
                }),
            };
          }
          updated = {
            ...updated,
            claimedBonusBasic: Math.max(updated.claimedBonusBasic ?? 0, serverRegular.claimedBonusBasic),
            claimedBonusRare:  Math.max(updated.claimedBonusRare  ?? 0, serverRegular.claimedBonusRare),
            claimedBonusEpic:  Math.max(updated.claimedBonusEpic  ?? 0, serverRegular.claimedBonusEpic),
            claimedBonusGold:  Math.max(updated.claimedBonusGold  ?? 0, serverRegular.claimedBonusGold),
            claimedBonusMythic: Math.max(updated.claimedBonusMythic ?? 0, serverRegular.claimedBonusMythic),
            claimedBonusNova: Math.max((updated as any).claimedBonusNova ?? 0, (serverRegular as any).claimedBonusNova ?? 0),
            claimedBonusPlasma: Math.max(updated.claimedBonusPlasma ?? 0, serverRegular.claimedBonusPlasma),
            claimedBonusV1:    Math.max(updated.claimedBonusV1    ?? 0, serverRegular.claimedBonusV1),
            claimedBonusV1NftPlatinum: Math.max(updated.claimedBonusV1NftPlatinum ?? 0, serverRegular.claimedBonusV1NftPlatinum),
          };
        }

        const serverBundles = Math.max(0, Number(grants.whiteCollectionBundles ?? 0));
        const serverEarthBundles = Math.max(0, Number(grants.earthCollectionBundles ?? 0));
        const serverBlackBundles = Math.max(0, Number(grants.blackCollectionBundles ?? 0));
        const serverSupernovaBundles = Math.max(0, Number(grants.supernovaCollectionBundles ?? 0));
        const serverStellaBundles = Math.max(0, Number(grants.stellaRossaCollectionBundles ?? 0));
        updated = {
          ...updated,
          maxSlots: Math.max(INITIAL_STATE.maxSlots, INITIAL_STATE.maxSlots + grants.bonusSlots),
          hasAutoTap: !!grants.hasAutoTap,
          whiteCollectionUnlocked: !!grants.whiteCollectionUnlocked || serverBundles > 0,
          whiteCollectionBundles: serverBundles,
          earthCollectionUnlocked: !!grants.earthCollectionUnlocked || serverEarthBundles > 0,
          earthCollectionBundles: serverEarthBundles,
          blackCollectionUnlocked: !!grants.blackCollectionUnlocked || serverBlackBundles > 0,
          blackCollectionBundles: serverBlackBundles,
          supernovaCollectionUnlocked: !!grants.supernovaCollectionUnlocked || serverSupernovaBundles > 0,
          supernovaCollectionBundles: serverSupernovaBundles,
          stellaRossaCollectionUnlocked: !!grants.stellaRossaCollectionUnlocked || serverStellaBundles > 0,
          stellaRossaCollectionBundles: serverStellaBundles,
        };

        // White Collection: each owned bundle materializes 4 fresh white
        // planets exactly once. We track how many bundles have already been
        // materialized via claimedWhiteCollectionBundles so re-grants never
        // duplicate. When the server count drops (admin revoke), we strip
        // any bundles beyond the new server count so generation stops at
        // once and the live TON balance no longer credits revoked planets.
        const claimedBundles = Math.max(0, updated.claimedWhiteCollectionBundles ?? 0);
        if (serverBundles > claimedBundles) {
          const toMaterialize = serverBundles - claimedBundles;
          const newWhitePlanets: Planet[] = [];
          for (let b = 0; b < toMaterialize; b++) {
            newWhitePlanets.push(...makeWhiteCollectionPlanets(claimedBundles + b));
          }
          updated = {
            ...updated,
            claimedWhiteCollectionBundles: serverBundles,
            whitePlanets: [...(updated.whitePlanets || []), ...newWhitePlanets],
          };
        } else if (serverBundles < claimedBundles) {
          // Keep only planets whose bundle index (encoded as `…-b<N>-…` in
          // the planet id by makeWhiteCollectionPlanets) is below the new
          // server count. Anything else is removed instantly.
          const keep = (p: Planet) => {
            const m = /-b(\d+)-/.exec(p.id);
            const idx = m ? parseInt(m[1]!, 10) : 0;
            return idx < serverBundles;
          };
          updated = {
            ...updated,
            claimedWhiteCollectionBundles: serverBundles,
            whitePlanets: (updated.whitePlanets || []).filter(keep),
          };
        }

        // Earth Collection: same materialization model as white, with the
        // same admin-revoke handling.
        const claimedEarthBundles = Math.max(0, updated.claimedEarthCollectionBundles ?? 0);
        if (serverEarthBundles > claimedEarthBundles) {
          const toMaterializeEarth = serverEarthBundles - claimedEarthBundles;
          const newEarthPlanets: Planet[] = [];
          for (let b = 0; b < toMaterializeEarth; b++) {
            newEarthPlanets.push(...makeEarthCollectionPlanets(claimedEarthBundles + b));
          }
          updated = {
            ...updated,
            claimedEarthCollectionBundles: serverEarthBundles,
            earthPlanets: [...(updated.earthPlanets || []), ...newEarthPlanets],
          };
        } else if (serverEarthBundles < claimedEarthBundles) {
          const keepEarth = (p: Planet) => {
            const m = /-b(\d+)-/.exec(p.id);
            const idx = m ? parseInt(m[1]!, 10) : 0;
            return idx < serverEarthBundles;
          };
          updated = {
            ...updated,
            claimedEarthCollectionBundles: serverEarthBundles,
            earthPlanets: (updated.earthPlanets || []).filter(keepEarth),
          };
        }

        // Black Collection bundle materialization (initial hydration).
        const claimedBlackBundles = Math.max(0, updated.claimedBlackCollectionBundles ?? 0);
        if (serverBlackBundles > claimedBlackBundles) {
          const toMaterializeBlack = serverBlackBundles - claimedBlackBundles;
          const newBlackPlanets: Planet[] = [];
          for (let b = 0; b < toMaterializeBlack; b++) {
            newBlackPlanets.push(...makeBlackCollectionPlanets(claimedBlackBundles + b));
          }
          updated = {
            ...updated,
            claimedBlackCollectionBundles: serverBlackBundles,
            blackPlanets: [...(updated.blackPlanets || []), ...newBlackPlanets],
          };
        } else if (serverBlackBundles < claimedBlackBundles) {
          const keepBlack = (p: Planet) => {
            const m = /-b(\d+)-/.exec(p.id);
            const idx = m ? parseInt(m[1]!, 10) : 0;
            return idx < serverBlackBundles;
          };
          updated = {
            ...updated,
            claimedBlackCollectionBundles: serverBlackBundles,
            blackPlanets: (updated.blackPlanets || []).filter(keepBlack),
          };
        }

        // Supernova Collection bundle materialization (initial hydration).
        const claimedSupernovaBundles = Math.max(0, updated.claimedSupernovaCollectionBundles ?? 0);
        if (serverSupernovaBundles > claimedSupernovaBundles) {
          const toMaterializeSupernova = serverSupernovaBundles - claimedSupernovaBundles;
          const newSupernovaPlanets: Planet[] = [];
          for (let b = 0; b < toMaterializeSupernova; b++) {
            newSupernovaPlanets.push(...makeSupernovaCollectionPlanets(claimedSupernovaBundles + b));
          }
          updated = {
            ...updated,
            claimedSupernovaCollectionBundles: serverSupernovaBundles,
            supernovaPlanets: [...(updated.supernovaPlanets || []), ...newSupernovaPlanets],
          };
        } else if (serverSupernovaBundles < claimedSupernovaBundles) {
          const keepSupernova = (p: Planet) => {
            const m = /-b(\d+)-/.exec(p.id);
            const idx = m ? parseInt(m[1]!, 10) : 0;
            return idx < serverSupernovaBundles;
          };
          updated = {
            ...updated,
            claimedSupernovaCollectionBundles: serverSupernovaBundles,
            supernovaPlanets: (updated.supernovaPlanets || []).filter(keepSupernova),
          };
        }
        // Stella Rossa Collection bundle materialization (initial hydration).
        const claimedStellaBundles = Math.max(0, updated.claimedStellaRossaCollectionBundles ?? 0);
        if (serverStellaBundles > claimedStellaBundles) {
          const toMaterializeStella = serverStellaBundles - claimedStellaBundles;
          const newStellaPlanets: Planet[] = [];
          for (let b = 0; b < toMaterializeStella; b++) {
            newStellaPlanets.push(...makeStellaRossaCollectionPlanets(claimedStellaBundles + b));
          }
          updated = {
            ...updated,
            claimedStellaRossaCollectionBundles: serverStellaBundles,
            stellaPlanets: [...(updated.stellaPlanets || []), ...newStellaPlanets],
          };
        } else if (serverStellaBundles < claimedStellaBundles) {
          const keepStella = (p: Planet) => {
            const m = /-b(\d+)-/.exec(p.id);
            const idx = m ? parseInt(m[1]!, 10) : 0;
            return idx < serverStellaBundles;
          };
          updated = {
            ...updated,
            claimedStellaRossaCollectionBundles: serverStellaBundles,
            stellaPlanets: (updated.stellaPlanets || []).filter(keepStella),
          };
        }
        } // end of `if (grantsOk)` — grants-derived hydration block

        // ─── SERVER COLLECTION-PLANET STATE — single source of truth ───
        // After (re)materializing white/earth planets, override slot index
        // and farming timers with whatever the server has on file. This is
        // what survives a localStorage wipe: even if every white planet was
        // just freshly minted with `slotIndex=null`, the server still knows
        // which one was in slot #2 and when its farming timer started.
        if (serverCollectionByKey.size > 0) {
          updated = {
            ...updated,
            whitePlanets: applyServerOverrides(updated.whitePlanets || [], serverCollectionByKey),
            earthPlanets: applyServerOverrides(updated.earthPlanets || [], serverCollectionByKey),
            blackPlanets: applyServerOverrides(updated.blackPlanets || [], serverCollectionByKey),
            supernovaPlanets: applyServerOverrides(updated.supernovaPlanets || [], serverCollectionByKey),
            stellaPlanets: applyServerOverrides(updated.stellaPlanets || [], serverCollectionByKey),
          };
        }

        // One-shot migration: if the local state has placed/farming planets
        // but the server doesn't know about them yet (existing users from
        // before this feature shipped), push them up. This runs at most
        // once per session and is a no-op for new users / fresh installs.
        const toSeed: CollectionPlanetState[] = [];
        for (const p of updated.whitePlanets || []) {
          const snap = snapshotCollectionPlanet(p);
          if (!snap) continue;
          const k = `${snap.kind}-${snap.bundleIndex}-${snap.subIndex}`;
          if (serverCollectionByKey.has(k)) continue;
          // Only seed planets that actually carry state worth preserving
          // — leaving inventory/inactive planets to be created on first
          // mutation keeps the seed payload tiny.
          if (snap.slotIndex != null || snap.isFarmingActive || snap.lastCollectedAtMs > 0) {
            toSeed.push(snap);
          }
        }
        for (const p of updated.earthPlanets || []) {
          const snap = snapshotCollectionPlanet(p);
          if (!snap) continue;
          const k = `${snap.kind}-${snap.bundleIndex}-${snap.subIndex}`;
          if (serverCollectionByKey.has(k)) continue;
          if (snap.slotIndex != null || snap.isFarmingActive || snap.lastCollectedAtMs > 0) {
            toSeed.push(snap);
          }
        }
        for (const p of updated.blackPlanets || []) {
          const snap = snapshotCollectionPlanet(p);
          if (!snap) continue;
          const k = `${snap.kind}-${snap.bundleIndex}-${snap.subIndex}`;
          if (serverCollectionByKey.has(k)) continue;
          if (snap.slotIndex != null || snap.isFarmingActive || snap.lastCollectedAtMs > 0) {
            toSeed.push(snap);
          }
        }
        for (const p of updated.supernovaPlanets || []) {
          const snap = snapshotCollectionPlanet(p);
          if (!snap) continue;
          const k = `${snap.kind}-${snap.bundleIndex}-${snap.subIndex}`;
          if (serverCollectionByKey.has(k)) continue;
          if (snap.slotIndex != null || snap.isFarmingActive || snap.lastCollectedAtMs > 0) {
            toSeed.push(snap);
          }
        }
        for (const p of updated.stellaPlanets || []) {
          const snap = snapshotCollectionPlanet(p);
          if (!snap) continue;
          const k = `${snap.kind}-${snap.bundleIndex}-${snap.subIndex}`;
          if (serverCollectionByKey.has(k)) continue;
          if (snap.slotIndex != null || snap.isFarmingActive || snap.lastCollectedAtMs > 0) {
            toSeed.push(snap);
          }
        }
        if (toSeed.length > 0) {
          void bulkSeedCollectionPlanets(telegramId, toSeed);
        }

        // Apply pending bonus planets per type (only new ones not yet claimed)
        const bonusTypes: Array<{ key: "bonusBasic" | "bonusRare" | "bonusEpic" | "bonusGold" | "bonusMythic" | "bonusNova" | "bonusPlasma" | "bonusV1" | "bonusV1NftPlatinum"; claimedKey: "claimedBonusBasic" | "claimedBonusRare" | "claimedBonusEpic" | "claimedBonusGold" | "claimedBonusMythic" | "claimedBonusNova" | "claimedBonusPlasma" | "claimedBonusV1" | "claimedBonusV1NftPlatinum"; type: PlanetType }> = [
          { key: "bonusBasic", claimedKey: "claimedBonusBasic", type: "BASIC" },
          { key: "bonusRare", claimedKey: "claimedBonusRare", type: "RARE" },
          { key: "bonusEpic", claimedKey: "claimedBonusEpic", type: "EPIC" },
          { key: "bonusMythic", claimedKey: "claimedBonusMythic", type: "MYTHIC" },
          { key: "bonusNova", claimedKey: "claimedBonusNova", type: "NOVA" },
          { key: "bonusPlasma", claimedKey: "claimedBonusPlasma", type: "PLASMA" },
          { key: "bonusGold", claimedKey: "claimedBonusGold", type: "GOLD" },
          { key: "bonusV1",   claimedKey: "claimedBonusV1",   type: "V1" },
          { key: "bonusV1NftPlatinum", claimedKey: "claimedBonusV1NftPlatinum", type: "V1_NFT" },
        ];
        const now = serverNow();
        const newPlanets: Planet[] = [];
        const claimedUpdates: Partial<GameState> = {};
        const blockedByFullSlots: Array<{ type: PlanetType; count: number }> = [];

        for (const { key, claimedKey, type } of bonusTypes) {
          const serverCount = (grants as unknown as Record<string, number>)[key] ?? 0;
          const claimedCount = (updated[claimedKey] as number) ?? 0;
          const existingBonusCount = updated.planets.filter((planet) => planet.name === type && planet.id.startsWith(`bonus-${type}-`)).length;
          const toAdd = serverCount - Math.max(claimedCount, existingBonusCount);
          if (toAdd > 0) {
            const availableSlots = updated.maxSlots - updated.planets.length - newPlanets.length;
            const actuallyAdd = Math.min(toAdd, Math.max(0, availableSlots));
            const blocked = toAdd - actuallyAdd;
            if (blocked > 0) blockedByFullSlots.push({ type, count: blocked });
            const cfg = PLANET_CONFIG[type];
            for (let i = 0; i < actuallyAdd; i++) {
              newPlanets.push({
                id: `bonus-${type}-${now}-${i}`,
                name: type,
                rate: cfg.rate,
                color: cfg.color,
                glowColor: cfg.glowColor,
                createdAt: now,
                // Never-started until first user-triggered START — see makePlanet.
                farmStartedAt: 0,
                lastCollectedAt: 0,
                isListedInMarket: false,
                isFarmingActive: false,
                marketPrice: null,
                craftCost: cfg.craftCost,
                float: generateRandomFloat(),
              });
            }
            // Only mark as claimed what we actually added — the rest stays
            // pending on the server until the user frees a slot.
            if (actuallyAdd > 0) {
              claimedUpdates[claimedKey] = Math.max(claimedCount, existingBonusCount) + actuallyAdd;
              // Lifetime obtained tracking (profile rank page). Fire-and-forget.
              if (updated.telegramId && type !== "V1_NFT") {
                void recordObtained(updated.telegramId, type);
              }
            }
          }
          // NOTE: we intentionally do NOT delete planets when toAdd < 0
          // (server bonus counter is below the local materialized count).
          // Real money is at stake — silently destroying user planets due
          // to a counter desync (admin reset, race with /planets/burn,
          // GREATEST high-water-mark on claimed_bonus_*) caused the
          // "10 RARE planets disappeared" complaint from @lektig.
          // Grow-only reconciliation: bonus planets can only be created
          // here, never removed. Burns/sales are the only legitimate
          // ways for a bonus planet to leave the inventory.
        }

        if (newPlanets.length > 0 || Object.keys(claimedUpdates).length > 0) {
          updated = {
            ...updated,
            ...claimedUpdates,
            planets: [...updated.planets, ...newPlanets],
          };
        }

        if (blockedByFullSlots.length > 0) {
          const parts = blockedByFullSlots.map((b) => `${b.count} ${PLANET_CONFIG[b.type].label}`).join(", ");
          setTimeout(() => {
            toast({
              title: "Slots full",
              description: `Free up a slot to receive your bonus: ${parts}`,
            });
          }, 0);
        }

        {
          const sent = Math.floor(updated.balance);
          const sentTon = Math.max(0, updated.tonBalance || 0);
          const sentStardust = Math.floor(updated.stardustBalance || 0);
          {const sentEpoch = _currentBalanceEpoch; syncBalance({ telegramId, firstName, username, photoUrl, zoomBalance: sent, tonBalance: sentTon, stardustBalance: sentStardust, clientEpoch: sentEpoch })
            .then((r) => reconcileFromSyncResponse(sent, sentEpoch, r, sentTon, sentStardust));}
        }
        return updated;
      });
      // Server hydration is done ONLY if the fetch actually succeeded.
      // On a transient failure we keep the gate closed so the debounced
      // save effect doesn't push our possibly-stale local snapshot over
      // the (still good) server inventory. The next page load will retry.
      if (serverRegular.ok) {
        regularPlanetsHydratedRef.current = true;
      }
      if (serverEquipment.ok) {
        equipmentHydratedRef.current = true;
      }
    })();
  }, []);

  // ─── Debounced server save for equipment ───
  // Mirrors the regular-planets save: 1.2s coalescing window, gated on
  // first successful hydration. Anti-shrink + stale-write fence live on
  // the server (see /equipment/save).
  useEffect(() => {
    if (!equipmentHydratedRef.current) return;
    const tid = state.telegramId;
    if (!tid) return;
    const snapshot = state.equipment ?? [];
    const t = setTimeout(() => {
      void saveEquipment(tid, snapshot);
    }, 1200);
    return () => clearTimeout(t);
  }, [state.telegramId, state.equipment]);

  // ─── Debounced server save for regular planets ───
  // Watches state.planets and the per-rarity claimed-bonus counters; when
  // any of them change, schedules a single PUT to the server 1.2s later.
  // Coalescing is on purpose: rapid taps (collect/start farm) update
  // farmStartedAt/lastCollectedAt many times per second and we don't want
  // to hammer the API. Save is suppressed until the initial flow has
  // hydrated state from the server (see regularPlanetsHydratedRef).
  useEffect(() => {
    if (!regularPlanetsHydratedRef.current) return;
    const tid = state.telegramId;
    if (!tid) return;
    const claimedSnap = {
      basic: state.claimedBonusBasic ?? 0,
      rare:  state.claimedBonusRare  ?? 0,
      epic:  state.claimedBonusEpic  ?? 0,
      gold:  state.claimedBonusGold  ?? 0,
      mythic: state.claimedBonusMythic ?? 0,
      plasma: state.claimedBonusPlasma ?? 0,
      v1:    state.claimedBonusV1    ?? 0,
      v1NftPlatinum: state.claimedBonusV1NftPlatinum ?? 0,
    };
    // Ghost-RARE guard: if applyGrants just minted a bonus planet, fire
    // an extra save NOW so the new planet reaches the server before the
    // user can close the Mini App (the debounced save below could miss
    // its 1.2s window). Both saves are idempotent server-side.
    if (bonusMintTickRef.current !== lastImmediateBonusSaveTickRef.current) {
      lastImmediateBonusSaveTickRef.current = bonusMintTickRef.current;
      void saveRegularPlanets(
        tid,
        state.planets as unknown as Array<Record<string, unknown>>,
        claimedSnap,
        state.craftsCompleted,
      );
    }
    const t = setTimeout(() => {
      void saveRegularPlanets(
        tid,
        state.planets as unknown as Array<Record<string, unknown>>,
        claimedSnap,
        state.craftsCompleted,
      );
    }, 1200);
    return () => clearTimeout(t);
  }, [
    state.telegramId,
    state.planets,
    state.claimedBonusBasic,
    state.claimedBonusRare,
    state.claimedBonusEpic,
    state.claimedBonusGold,
    state.claimedBonusMythic,
    state.claimedBonusPlasma,
    state.claimedBonusV1,
    state.claimedBonusV1NftPlatinum,
    state.craftsCompleted,
  ]);

  useEffect(() => {
    const applyGrants = (grants: Grants) => {
      // When applyGrants materializes a bonus planet, we must force an
      // IMMEDIATE (non-debounced) server save. Otherwise: server's
      // claimed_bonus_* counter is bumped by the very next save, but if
      // the user closes the Mini App within the 1.2s debounce window
      // BEFORE the planets array reaches the server, applyGrants on next
      // launch sees toAdd = serverCount(N) - max(claimedCount(N), 0) = 0
      // and the planet is permanently orphaned (the "ghost RARE" bug).
      //
      // We bump a ref-counter inside the (pure) updater; the post-commit
      // save effect below reads the ref and fires saveRegularPlanets
      // immediately when the counter advanced. This pattern is safe
      // under React 18 StrictMode double-invoke because:
      //   - the ref bump is monotonic and idempotent
      //   - the actual network call lives in a useEffect that only runs
      //     after the committed render, so it sees the canonical state
      //   - the server-side stale-write fence + GREATEST counter make
      //     duplicate saves harmless.
      let mintedBonusCount = 0;
      setState((prev) => {
        let updated = { ...prev };

        if (grants.bonusSun) {
          updated = {
            ...updated,
            claimedBonusSun: true,
            sunCount: Math.max(1, grants.sunCount || 1),
            sun: updated.sun?.isOwned ? updated.sun : {
              isOwned: true,
              isActive: false,
              activationCost: SUN_CONFIG.activationCostBase,
              cycleCount: 0,
              farmStartedAt: 0,
              lastCollectedAt: 0,
            },
          };
        } else if (updated.claimedBonusSun) {
          updated = { ...updated, sun: null, claimedBonusSun: false, sunCount: 0 };
        }

        // Same SUN-cycle merge as the initial hydration above. See the long
        // comment there for why this exists; this branch covers periodic
        // /grants polls that may pick up cycle changes from another device.
        if (updated.sun?.isOwned) {
          const srvStarted = Math.max(0, Number(grants.sunFarmStartedAtMs ?? 0));
          const srvCollected = Math.max(0, Number(grants.sunLastCollectedAtMs ?? 0));
          const srvCycleCount = Math.max(0, Number(grants.sunCycleCount ?? 0));
          const localStarted = updated.sun.farmStartedAt ?? 0;
          const localCollected = updated.sun.lastCollectedAt ?? 0;
          const localCycleCount = updated.sun.cycleCount ?? 0;
          const mergedStarted = Math.max(localStarted, srvStarted);
          const mergedCollected = Math.max(localCollected, srvCollected);
          const mergedCycleCount = Math.max(localCycleCount, srvCycleCount);
          updated = {
            ...updated,
            sun: {
              ...updated.sun,
              farmStartedAt: mergedStarted,
              lastCollectedAt: mergedCollected,
              cycleCount: mergedCycleCount,
              isActive: mergedStarted > 0 ? true : updated.sun.isActive,
            },
          };
          // Self-heal lost /sun/cycle writes — same rationale as the
          // hydration block above. Idempotent (server uses GREATEST).
          // Compare integer-normalised values so fractional serverNow()
          // drift doesn't keep firing on every poll.
          const tid = updated.telegramId;
          const localStartedInt = Math.round(mergedStarted);
          const localCollectedInt = Math.round(mergedCollected);
          if (tid && (localStartedInt > srvStarted || localCollectedInt > srvCollected || mergedCycleCount > srvCycleCount)) {
            void syncSunCycle({
              telegramId: tid,
              sunFarmStartedAtMs: localStartedInt,
              sunLastCollectedAtMs: localCollectedInt,
              sunCycleCount: mergedCycleCount,
            });
          }
        }

        const serverBundles2 = Math.max(0, Number(grants.whiteCollectionBundles ?? 0));
        const serverEarthBundles2 = Math.max(0, Number(grants.earthCollectionBundles ?? 0));
        updated = {
          ...updated,
          maxSlots: Math.max(INITIAL_STATE.maxSlots, INITIAL_STATE.maxSlots + grants.bonusSlots),
          hasAutoTap: !!grants.hasAutoTap,
          whiteCollectionUnlocked: !!grants.whiteCollectionUnlocked || serverBundles2 > 0,
          whiteCollectionBundles: serverBundles2,
          earthCollectionUnlocked: !!grants.earthCollectionUnlocked || serverEarthBundles2 > 0,
          earthCollectionBundles: serverEarthBundles2,
        };

        const claimedBundles2 = Math.max(0, updated.claimedWhiteCollectionBundles ?? 0);
        if (serverBundles2 > claimedBundles2) {
          const toMaterialize2 = serverBundles2 - claimedBundles2;
          const newWhitePlanets2: Planet[] = [];
          for (let b = 0; b < toMaterialize2; b++) {
            newWhitePlanets2.push(...makeWhiteCollectionPlanets(claimedBundles2 + b));
          }
          updated = {
            ...updated,
            claimedWhiteCollectionBundles: serverBundles2,
            whitePlanets: [...(updated.whitePlanets || []), ...newWhitePlanets2],
          };
        }
        // Grow-only: never delete white-collection planets when the server
        // bundle counter is below the local claimed count. Same protection
        // as bonus-planet reconciliation — real money is at stake.

        const claimedEarthBundles2 = Math.max(0, updated.claimedEarthCollectionBundles ?? 0);
        if (serverEarthBundles2 > claimedEarthBundles2) {
          const toMaterializeEarth2 = serverEarthBundles2 - claimedEarthBundles2;
          const newEarthPlanets2: Planet[] = [];
          for (let b = 0; b < toMaterializeEarth2; b++) {
            newEarthPlanets2.push(...makeEarthCollectionPlanets(claimedEarthBundles2 + b));
          }
          updated = {
            ...updated,
            claimedEarthCollectionBundles: serverEarthBundles2,
            earthPlanets: [...(updated.earthPlanets || []), ...newEarthPlanets2],
          };
        }
        // Grow-only: never delete earth-collection planets when the server
        // bundle counter is below the local claimed count.

        const serverBlackBundles2 = Math.max(0, Number(grants.blackCollectionBundles ?? 0));
        updated = {
          ...updated,
          blackCollectionUnlocked: !!grants.blackCollectionUnlocked || serverBlackBundles2 > 0,
          blackCollectionBundles: serverBlackBundles2,
        };
        const claimedBlackBundles2 = Math.max(0, updated.claimedBlackCollectionBundles ?? 0);
        if (serverBlackBundles2 > claimedBlackBundles2) {
          const toMaterializeBlack2 = serverBlackBundles2 - claimedBlackBundles2;
          const newBlackPlanets2: Planet[] = [];
          for (let b = 0; b < toMaterializeBlack2; b++) {
            newBlackPlanets2.push(...makeBlackCollectionPlanets(claimedBlackBundles2 + b));
          }
          updated = {
            ...updated,
            claimedBlackCollectionBundles: serverBlackBundles2,
            blackPlanets: [...(updated.blackPlanets || []), ...newBlackPlanets2],
          };
        }
        // Grow-only: never delete black-collection planets when the server
        // bundle counter is below the local claimed count.

        const serverSupernovaBundles2 = Math.max(0, Number(grants.supernovaCollectionBundles ?? 0));
        updated = {
          ...updated,
          supernovaCollectionUnlocked: !!grants.supernovaCollectionUnlocked || serverSupernovaBundles2 > 0,
          supernovaCollectionBundles: serverSupernovaBundles2,
        };
        const claimedSupernovaBundles2 = Math.max(0, updated.claimedSupernovaCollectionBundles ?? 0);
        if (serverSupernovaBundles2 > claimedSupernovaBundles2) {
          const toMaterializeSupernova2 = serverSupernovaBundles2 - claimedSupernovaBundles2;
          const newSupernovaPlanets2: Planet[] = [];
          for (let b = 0; b < toMaterializeSupernova2; b++) {
            newSupernovaPlanets2.push(...makeSupernovaCollectionPlanets(claimedSupernovaBundles2 + b));
          }
          updated = {
            ...updated,
            claimedSupernovaCollectionBundles: serverSupernovaBundles2,
            supernovaPlanets: [...(updated.supernovaPlanets || []), ...newSupernovaPlanets2],
          };
        }
        // Grow-only for supernova too.

        const serverStellaBundles2 = Math.max(0, Number(grants.stellaRossaCollectionBundles ?? 0));
        updated = {
          ...updated,
          stellaRossaCollectionUnlocked: !!grants.stellaRossaCollectionUnlocked || serverStellaBundles2 > 0,
          stellaRossaCollectionBundles: serverStellaBundles2,
        };
        const claimedStellaBundles2 = Math.max(0, updated.claimedStellaRossaCollectionBundles ?? 0);
        if (serverStellaBundles2 > claimedStellaBundles2) {
          const toMaterializeStella2 = serverStellaBundles2 - claimedStellaBundles2;
          const newStellaPlanets2: Planet[] = [];
          for (let b = 0; b < toMaterializeStella2; b++) {
            newStellaPlanets2.push(...makeStellaRossaCollectionPlanets(claimedStellaBundles2 + b));
          }
          updated = {
            ...updated,
            claimedStellaRossaCollectionBundles: serverStellaBundles2,
            stellaPlanets: [...(updated.stellaPlanets || []), ...newStellaPlanets2],
          };
        }
        // Grow-only for stella rossa too.

        const bonusTypes: Array<{ key: keyof Grants; claimedKey: keyof GameState; type: PlanetType }> = [
          { key: "bonusBasic", claimedKey: "claimedBonusBasic", type: "BASIC" },
          { key: "bonusRare",  claimedKey: "claimedBonusRare",  type: "RARE" },
          { key: "bonusEpic",  claimedKey: "claimedBonusEpic",  type: "EPIC" },
          { key: "bonusMythic", claimedKey: "claimedBonusMythic", type: "MYTHIC" },
          { key: "bonusNova", claimedKey: "claimedBonusNova" as keyof GameState, type: "NOVA" },
          { key: "bonusPlasma", claimedKey: "claimedBonusPlasma", type: "PLASMA" },
          { key: "bonusGold",  claimedKey: "claimedBonusGold",  type: "GOLD" },
          { key: "bonusV1",    claimedKey: "claimedBonusV1",    type: "V1" },
          { key: "bonusV1NftPlatinum", claimedKey: "claimedBonusV1NftPlatinum", type: "V1_NFT" },
        ];
        const now = serverNow();
        const newPlanets: Planet[] = [];
        const claimedUpdates: Partial<GameState> = {};
        const blockedByFullSlots: Array<{ type: PlanetType; count: number }> = [];

        for (const { key, claimedKey, type } of bonusTypes) {
          const serverCount = (grants[key] as number) ?? 0;
          const claimedCount = (updated[claimedKey] as number) ?? 0;
          const existingBonusCount = updated.planets.filter((planet) => planet.name === type && planet.id.startsWith(`bonus-${type}-`)).length;
          const toAdd = serverCount - Math.max(claimedCount, existingBonusCount);
          if (toAdd > 0) {
            const availableSlots = updated.maxSlots - updated.planets.length - newPlanets.length;
            const actuallyAdd = Math.min(toAdd, Math.max(0, availableSlots));
            const blocked = toAdd - actuallyAdd;
            if (blocked > 0) blockedByFullSlots.push({ type, count: blocked });
            const cfg = PLANET_CONFIG[type];
            for (let i = 0; i < actuallyAdd; i++) {
              newPlanets.push({
                id: `bonus-${type}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
                name: type,
                rate: cfg.rate,
                color: cfg.color,
                glowColor: cfg.glowColor,
                createdAt: now,
                // Never-started until first user-triggered START — see makePlanet.
                farmStartedAt: 0,
                lastCollectedAt: 0,
                isListedInMarket: false,
                isFarmingActive: false,
                marketPrice: null,
                craftCost: cfg.craftCost,
                float: generateRandomFloat(),
              });
            }
            if (actuallyAdd > 0) {
              claimedUpdates[claimedKey] = (Math.max(claimedCount, existingBonusCount) + actuallyAdd) as never;
            }
          }
          // See companion block above: NEVER delete planets via grant
          // reconciliation. Grow-only — protects against counter desync
          // wiping real-money assets.
        }

        if (newPlanets.length > 0 || Object.keys(claimedUpdates).length > 0) {
          updated = { ...updated, ...claimedUpdates, planets: [...updated.planets, ...newPlanets] };
        }

        // Track minted bonus count locally; we bump the ref AFTER setState
        // returns so a StrictMode double-invoke of this pure updater
        // doesn't double-bump the ref. The post-commit save effect reads
        // the ref and fires an immediate save (see ghost-RARE guard).
        if (newPlanets.length > mintedBonusCount) {
          mintedBonusCount = newPlanets.length;
        }

        if (blockedByFullSlots.length > 0) {
          const parts = blockedByFullSlots.map((b) => `${b.count} ${PLANET_CONFIG[b.type].label}`).join(", ");
          setTimeout(() => {
            toast({
              title: "Slots full",
              description: `Free up a slot to receive your bonus: ${parts}`,
            });
          }, 0);
        }

        // DEPOSIT TON balance — server is the SOLE source of truth (the only
        // mutations are server-side: /ton/deposit/confirm credits, and
        // /shop/buy-deposit debits). Adopt it verbatim on every grants refresh
        // so deposit confirmations and shop purchases converge immediately
        // without a full reload. Never merged with a local value — the client
        // has no authority over this column.
        if (typeof grants.depositBalance === "number") {
          updated = { ...updated, depositBalance: Math.max(0, grants.depositBalance) };
        }

        return updated;
      });

      // Bump the mint tick AFTER setState returns so a StrictMode
      // double-invoke of the (pure) updater above doesn't double-count.
      // The save effect (deps include state.planets) will fire on commit
      // and notice tick !== lastImmediateSavedTick → immediate save.
      if (mintedBonusCount > 0) {
        bonusMintTickRef.current += 1;
      }
    };

    const doSync = async () => {
      const { telegramId, firstName, username, photoUrl } = getTelegramContext();
      if (!telegramId) return;

      // SEQUENTIAL ORDERING (race fix, May 2026): /farm/settle runs FIRST,
      // then /balance/sync. If we ran them in parallel, /balance/sync would
      // send the *pre-credit* localBalance and — since /balance/sync writes
      //   CASE WHEN server_epoch > clientEpoch THEN server ELSE client
      // — could overwrite a freshly server-side credited amount the moment
      // the epoch race went the wrong way. /farm/settle now bumps the
      // server's `balance_epoch` whenever it credits, so by the time we
      // call /balance/sync below the local epoch tracker is already
      // advanced and the value we send is the post-credit one.
      const _doSyncClientFloor = Math.floor(stateRef.current.lastFarmingSettledAt || 0);
      const settleRes = await settleOfflineFarming({
        telegramId,
        clientLastSettledAtMs: _doSyncClientFloor,
      });

      if (settleRes.exists && settleRes.credited > 0) {
        // Apply the server credit locally + advance both watermark and
        // epoch trackers BEFORE the syncBalance below, so the sync sends
        // the post-credit balance with the post-credit epoch. The server
        // CASE check then matches (epoch == sent) and falls through to the
        // client value — no overwrite possible.
        setState((prev) => {
          const next = {
            ...prev,
            balance: prev.balance + settleRes.credited,
            totalEarned: prev.totalEarned + settleRes.credited,
            seasonPoolEarned: prev.seasonPoolEarned + settleRes.credited,
            lastFarmingSettledAt: Math.max(prev.lastFarmingSettledAt || 0, settleRes.settledAtMs),
            lastBalanceEpoch: Math.max(prev.lastBalanceEpoch || 0, settleRes.balanceEpoch),
          };
          stateRef.current = next;
          return next;
        });
        setCurrentBalanceEpoch(settleRes.balanceEpoch);
      } else if (settleRes.exists && settleRes.settledAtMs > _doSyncClientFloor) {
        // Heartbeat path: no credit but server's watermark advanced. Mirror
        // it locally so the next /farm/settle short-circuits cleanly.
        setState((prev) => {
          const next = {
            ...prev,
            lastFarmingSettledAt: Math.max(prev.lastFarmingSettledAt || 0, settleRes.settledAtMs),
          };
          stateRef.current = next;
          return next;
        });
      }

      // Now sync the (possibly-credited) balance + epoch.
      const localBalance = Math.floor(stateRef.current.balance);
      const sentEpoch = _currentBalanceEpoch;
      const sentTon = Math.max(0, stateRef.current.tonBalance || 0);
      const sentStardust = Math.floor(stateRef.current.stardustBalance || 0);
      const [syncRes, grants] = await Promise.all([
        syncBalance({ telegramId, firstName, username, photoUrl, zoomBalance: localBalance, tonBalance: sentTon, stardustBalance: sentStardust, clientEpoch: sentEpoch }),
        fetchGrants(telegramId),
      ]);
      reconcileFromSyncResponse(localBalance, sentEpoch, syncRes, sentTon, sentStardust);

      // Skip on transient /grants failure — applying an empty payload would
      // trip the destructive branches inside applyGrants (SUN reset,
      // collection revoke, slot/autoTap reset) and silently wipe owned state.
      if (grants) applyGrants(grants);
    };

    const interval = setInterval(doSync, 30_000);

    const handleAdminRefresh = async () => {
      const { telegramId } = getTelegramContext();
      if (!telegramId) return;

      const balanceRecord = await fetchBalanceRecord(telegramId);
      if (balanceRecord?.exists) {
        const serverBal = Math.floor(balanceRecord.zoomBalance);
        const localBal = Math.floor(stateRef.current.balance);
        if (serverBal !== localBal) {
          // ORDER MATTERS — see the long comment in reconcileFromSyncResponse.
          // Briefly: we snap stateRef + _lastSyncedBalance SYNCHRONOUSLY
          // BEFORE adopting the server's new epoch, so any concurrent sync
          // (periodic doSync, throttled tab-switch refresh, immediate sync
          // from a tap) sees the new (balance, epoch) pair atomically and
          // can't echo the stale local balance back to the server with the
          // new epoch — which would cause the server's CASE WHEN epoch>ce
          // ELSE GREATEST(0, client) merge to clobber a freshly credited
          // wheel/admin/marketplace prize. Symptom of getting this wrong:
          // YOU WON popup appears but the visible balance never rises.
          stateRef.current = { ...stateRef.current, balance: serverBal, lastBalanceEpoch: balanceRecord.balanceEpoch };
          _lastSyncedBalance = serverBal;
          _pendingSyncBalance = -1;
          setCurrentBalanceEpoch(balanceRecord.balanceEpoch);
          setState((prev) => ({ ...prev, balance: serverBal, lastBalanceEpoch: balanceRecord.balanceEpoch }));
        } else {
          // Even when balances already agree, keep the stateRef + epoch
          // ordering consistent so any concurrent sync sees a coherent pair.
          stateRef.current = { ...stateRef.current, lastBalanceEpoch: balanceRecord.balanceEpoch };
          setCurrentBalanceEpoch(balanceRecord.balanceEpoch);
          setState((prev) => ({ ...prev, lastBalanceEpoch: balanceRecord.balanceEpoch }));
        }
      }

      const grants = await fetchGrants(telegramId);
      if (grants) applyGrants(grants);
    };
    const handleLocalCredit = (e: Event) => {
      const detail = (e as CustomEvent<{ amount: number }>).detail;
      const amount = detail?.amount;
      if (!amount || amount <= 0) return;
      const { telegramId, firstName, username, photoUrl } = getTelegramContext();
      setState((prev) => {
        const newBal = prev.balance + amount;
        if (telegramId) {
          const sent = Math.floor(newBal);
          const sentTon = Math.max(0, prev.tonBalance || 0);
          const sentStardust = Math.floor(prev.stardustBalance || 0);
          {const sentEpoch = _currentBalanceEpoch; syncBalance({ telegramId, firstName, username, photoUrl, zoomBalance: sent, tonBalance: sentTon, stardustBalance: sentStardust, clientEpoch: sentEpoch })
            .then((r) => reconcileFromSyncResponse(sent, sentEpoch, r, sentTon, sentStardust));}
        }
        return { ...prev, balance: newBal, totalEarned: prev.totalEarned + amount };
      });
    };
    const handleServerSnap = (e: Event) => {
      const detail = (e as CustomEvent<{ balance: number; epoch: number }>).detail;
      if (!detail || typeof detail.balance !== "number") return;
      // Server rejected our merge (admin mutation in progress) — snap local
      // state down to the authoritative server value so the next sync doesn't
      // re-send the stale higher value.
      setState((prev) => ({
        ...prev,
        balance: detail.balance,
        lastBalanceEpoch: Math.max(prev.lastBalanceEpoch ?? 0, detail.epoch ?? 0),
      }));
    };
    const handleServerTonSnap = (e: Event) => {
      const detail = (e as CustomEvent<{ tonBalance: number; epoch: number }>).detail;
      if (!detail || typeof detail.tonBalance !== "number") return;
      setState((prev) => ({
        ...prev,
        tonBalance: Math.max(0, detail.tonBalance),
        lastBalanceEpoch: Math.max(prev.lastBalanceEpoch ?? 0, detail.epoch ?? 0),
      }));
    };
    const handleServerStardustSnap = (e: Event) => {
      const detail = (e as CustomEvent<{ stardustBalance: number; epoch: number }>).detail;
      if (!detail || typeof detail.stardustBalance !== "number") return;
      setState((prev) => ({
        ...prev,
        stardustBalance: Math.max(0, detail.stardustBalance),
        lastBalanceEpoch: Math.max(prev.lastBalanceEpoch ?? 0, detail.epoch ?? 0),
      }));
    };
    // Admin self-remove: explicit local decrement that bypasses the
    // grow-only protections in applyGrants/handleAdminRefresh. This is
    // safe because it only fires when the admin button itself is the
    // trigger AND the target is the operating device's own user — never
    // from background polling or cross-device reconciliation.
    const handleAdminSelfDecrement = (e: Event) => {
      const detail = (e as CustomEvent<{ type: string; amount: number; planetType?: string }>).detail;
      if (!detail) return;
      const { type, amount, planetType } = detail;
      const n = Math.max(0, Math.floor(amount || 0));
      if (n <= 0 && type !== "planets") return;

      if (type === "zoom") {
        setState((prev) => {
          const newBal = Math.max(0, Math.floor(prev.balance) - n);
          stateRef.current = { ...stateRef.current, balance: newBal };
          _lastSyncedBalance = newBal;
          _pendingSyncBalance = -1;
          return { ...prev, balance: newBal };
        });
        // Push the lower value to the server immediately so the next
        // doSync doesn't echo a stale higher local balance back. The
        // server's epoch was already bumped by /admin/remove-zoom, so
        // our send (clientEpoch < server) takes the server's authoritative
        // value via the CASE branch — and our local is already in sync.
        const { telegramId, firstName, username, photoUrl } = getTelegramContext();
        if (telegramId) {
          const sentEpoch = _currentBalanceEpoch;
          const sentTon = Math.max(0, stateRef.current.tonBalance || 0);
          const sentStardust = Math.floor(stateRef.current.stardustBalance || 0);
          void syncBalance({ telegramId, firstName, username, photoUrl, zoomBalance: Math.floor(stateRef.current.balance), tonBalance: sentTon, stardustBalance: sentStardust, clientEpoch: sentEpoch })
            .then((r) => reconcileFromSyncResponse(Math.floor(stateRef.current.balance), sentEpoch, r, sentTon, sentStardust));
        }
        return;
      }

      // stardust / ton admin decrements are handled exclusively in
      // App.tsx (HMR-safe listener) so the state stays consistent without
      // double-application from this mount-once effect.

      if (type === "slots") {
        setState((prev) => {
          const newMax = Math.max(INITIAL_STATE.maxSlots, (prev.maxSlots || INITIAL_STATE.maxSlots) - n);
          return { ...prev, maxSlots: newMax };
        });
        return;
      }

      if (type === "planets" && planetType) {
        setState((prev) => {
          if (planetType === "SUN") {
            return { ...prev, sun: null, claimedBonusSun: false, sunCount: 0 };
          }
          // Remove up to N bonus planets of the given type. Prefer planets
          // that are NOT placed in a slot and NOT actively farming, so the
          // user's running production is least disturbed.
          const isBonusOfType = (p: Planet) =>
            p.name === planetType && typeof p.id === "string" && p.id.startsWith(`bonus-${planetType}-`);
          const candidates = prev.planets.filter(isBonusOfType);
          if (candidates.length === 0) return prev;
          const sorted = [...candidates].sort((a, b) => {
            const aActive = a.isFarmingActive ? 1 : 0;
            const bActive = b.isFarmingActive ? 1 : 0;
            if (aActive !== bActive) return aActive - bActive;
            return (a.createdAt || 0) - (b.createdAt || 0);
          });
          const toRemove = new Set(sorted.slice(0, n).map((p) => p.id));
          if (toRemove.size === 0) return prev;
          const newPlanets = prev.planets.filter((p) => !toRemove.has(p.id));
          const claimedKey = (
            planetType === "BASIC"  ? "claimedBonusBasic"  :
            planetType === "RARE"   ? "claimedBonusRare"   :
            planetType === "EPIC"   ? "claimedBonusEpic"   :
            planetType === "MYTHIC" ? "claimedBonusMythic" :
            planetType === "PLASMA" ? "claimedBonusPlasma" :
            planetType === "GOLD"   ? "claimedBonusGold"   : null
          ) as keyof GameState | null;
          const updated: GameState = { ...prev, planets: newPlanets };
          if (claimedKey) {
            const cur = (prev[claimedKey] as number) ?? 0;
            (updated as unknown as Record<string, unknown>)[claimedKey] = Math.max(0, cur - toRemove.size);
          }
          return updated;
        });
        return;
      }
    };

    // Admin self-credit: explicit local mint that mirrors handleAdminSelfDecrement
    // for the "add" side. Same scope/safety rationale — only fires from the
    // admin button when targeting the operating user. This guarantees the
    // first click reflects on the device without waiting for the /grants
    // poll, which can lose a race against in-flight syncs.
    const handleAdminSelfIncrement = (e: Event) => {
      const detail = (e as CustomEvent<{ type: string; amount: number; planetType?: string }>).detail;
      if (!detail) return;
      const { type, amount, planetType } = detail;
      const n = Math.max(0, Math.floor(amount || 0));
      if (n <= 0) return;

      if (type === "zoom") {
        // Reuse the existing local-credit pipeline: mutates balance and
        // immediately syncs to server with the current epoch.
        window.dispatchEvent(new CustomEvent("zoom-credit-local", { detail: { amount: n } }));
        return;
      }

      // stardust / ton admin increments are handled exclusively in
      // App.tsx (HMR-safe listener) so the state stays consistent without
      // double-application from this mount-once effect.

      if (type === "slots") {
        setState((prev) => ({ ...prev, maxSlots: (prev.maxSlots || INITIAL_STATE.maxSlots) + n }));
        return;
      }

      if (type === "planets" && planetType) {
        setState((prev) => {
          if (planetType === "SUN") {
            if (prev.sun?.isOwned) return { ...prev, claimedBonusSun: true, sunCount: Math.max(1, prev.sunCount || 1) };
            return {
              ...prev,
              claimedBonusSun: true,
              sunCount: 1,
              sun: {
                isOwned: true,
                isActive: false,
                activationCost: SUN_CONFIG.activationCostBase,
                cycleCount: 0,
                farmStartedAt: 0,
                lastCollectedAt: 0,
              },
            };
          }
          const cfg = PLANET_CONFIG[planetType as PlanetType];
          if (!cfg) return prev;
          const now = serverNow();
          const availableSlots = (prev.maxSlots || INITIAL_STATE.maxSlots) - prev.planets.length;
          const actuallyAdd = Math.min(n, Math.max(0, availableSlots));
          if (actuallyAdd <= 0) {
            setTimeout(() => {
              toast({ title: "Slots full", description: `Free up a slot to receive your bonus: ${n} ${cfg.label}` });
            }, 0);
            return prev;
          }
          const newPlanets: Planet[] = [];
          for (let i = 0; i < actuallyAdd; i++) {
            newPlanets.push({
              id: `bonus-${planetType}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
              name: planetType as PlanetType,
              rate: cfg.rate,
              color: cfg.color,
              glowColor: cfg.glowColor,
              createdAt: now,
              farmStartedAt: 0,
              lastCollectedAt: 0,
              isListedInMarket: false,
              isFarmingActive: false,
              marketPrice: null,
              craftCost: cfg.craftCost,
              float: generateRandomFloat(),
            });
          }
          const claimedKey = (
            planetType === "BASIC"  ? "claimedBonusBasic"  :
            planetType === "RARE"   ? "claimedBonusRare"   :
            planetType === "EPIC"   ? "claimedBonusEpic"   :
            planetType === "MYTHIC" ? "claimedBonusMythic" :
            planetType === "PLASMA" ? "claimedBonusPlasma" :
            planetType === "GOLD"   ? "claimedBonusGold"   : null
          ) as keyof GameState | null;
          const updated: GameState = { ...prev, planets: [...prev.planets, ...newPlanets] };
          if (claimedKey) {
            const cur = (prev[claimedKey] as number) ?? 0;
            (updated as unknown as Record<string, unknown>)[claimedKey] = cur + actuallyAdd;
          }
          // Trigger the immediate (non-debounced) save so the new bonus
          // planets reach the server before any close — same guard the
          // applyGrants minting path uses.
          bonusMintTickRef.current += 1;
          return updated;
        });
        return;
      }
    };

    window.addEventListener("zoom-admin-refresh", handleAdminRefresh);
    window.addEventListener("zoom-admin-self-decrement", handleAdminSelfDecrement as EventListener);
    window.addEventListener("zoom-admin-self-increment", handleAdminSelfIncrement as EventListener);
    window.addEventListener("zoom-data-refresh", doSync);
    window.addEventListener("zoom-credit-local", handleLocalCredit as EventListener);
    window.addEventListener("zoom-server-balance-snap", handleServerSnap as EventListener);
    window.addEventListener("zoom-server-ton-snap", handleServerTonSnap as EventListener);
    window.addEventListener("zoom-server-stardust-snap", handleServerStardustSnap as EventListener);

    return () => {
      clearInterval(interval);
      window.removeEventListener("zoom-admin-refresh", handleAdminRefresh);
      window.removeEventListener("zoom-admin-self-decrement", handleAdminSelfDecrement as EventListener);
      window.removeEventListener("zoom-admin-self-increment", handleAdminSelfIncrement as EventListener);
      window.removeEventListener("zoom-data-refresh", doSync);
      window.removeEventListener("zoom-credit-local", handleLocalCredit as EventListener);
      window.removeEventListener("zoom-server-balance-snap", handleServerSnap as EventListener);
      window.removeEventListener("zoom-server-ton-snap", handleServerTonSnap as EventListener);
      window.removeEventListener("zoom-server-stardust-snap", handleServerStardustSnap as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;

      const localNow = serverNow();
      setState((prev) => settleFarmingState(prev, localNow));
      stateRef.current = settleFarmingState(stateRef.current, localNow);

      const { telegramId, firstName, username, photoUrl } = getTelegramContext();

      if (telegramId) {
        (async () => {
          setState((prev) => {
            const settled = settleFarmingState(prev, serverNow());
            stateRef.current = settled;
            {
              const sent = Math.floor(settled.balance);
              const sentTon = Math.max(0, settled.tonBalance || 0);
              const sentStardust = Math.floor(settled.stardustBalance || 0);
              {const sentEpoch = _currentBalanceEpoch; syncBalance({ telegramId, firstName, username, photoUrl, zoomBalance: sent, tonBalance: sentTon, stardustBalance: sentStardust, clientEpoch: sentEpoch })
                .then((r) => reconcileFromSyncResponse(sent, sentEpoch, r, sentTon, sentStardust));}
            }
            return settled;
          });

          // Bump the server-side watermark right after a visibility resume
          // (which may have been preceded by hours of throttled / paused
          // background timers in the Telegram WebView). Without this, the
          // server still thinks "lastSettled = before-background" and the
          // next /farm/settle from a different device would recredit a
          // period the client just credited locally above.
          void settleOfflineFarming({
            telegramId,
            clientLastSettledAtMs: Math.floor(stateRef.current.lastFarmingSettledAt || 0),
          });

          window.dispatchEvent(new Event("zoom-data-refresh"));
        })();

        fetchReferralData(telegramId).then((refData) => {
          setState((prev) => ({
            ...prev,
            referralCount: refData.referralCount,
            claimedMilestones: refData.claimedMilestones,
          }));
        });
      }
    };

    const handleBeforeUnload = () => {
      const settled = settleFarmingState(stateRef.current, serverNow());
      // If a destructive op (burn/sell/list) just persisted authoritatively
      // (within the last 250ms) and React hasn't yet committed the new state
      // to stateRef, writing stateRef here would clobber the authoritative
      // write with the pre-op snapshot. Skip the redundant write — the
      // destructive op already saved the truth.
      if (Date.now() - _lastSavedAt > 250) {
        saveState(settled);
      }
      const { telegramId, firstName, username, photoUrl } = getTelegramContext();
      if (telegramId) {
        const balance = Math.floor(settled.balance);
        const tonBalance = Math.max(0, settled.tonBalance || 0);
        // Embed initData in the body — sendBeacon can't set custom headers,
        // so the server middleware accepts `_initData` as a fallback. The
        // fallback fetch() also includes the X-Telegram-Init-Data header
        // via apiHeaders() for belt-and-suspenders.
        const beaconBody = withInitData({ telegramId, firstName, username, zoomBalance: balance, tonBalance, clientEpoch: _currentBalanceEpoch });
        const payload = JSON.stringify(beaconBody);
        const url = `${window.location.origin}/api/balance/sync`;
        const sent = navigator.sendBeacon?.(url, new Blob([payload], { type: "application/json" }));
        if (!sent) {
          fetch(url, { method: "POST", headers: apiHeaders(), body: payload, keepalive: true }).catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const addIncomingEvent = (event: FeedEvent) => {
      setState((prev) => {
        if (!event?.id || prev.feedEvents.some((item) => item.id === event.id)) return prev;
        return {
          ...prev,
          feedEvents: [event, ...prev.feedEvents].slice(0, MAX_FEED_EVENTS),
        };
      });
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LIVE_EVENT_CHANNEL) : null;
    if (channel) {
      channel.onmessage = (message) => addIncomingEvent(message.data as FeedEvent);
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LIVE_EVENT_KEY || !event.newValue) return;
      try {
        addIncomingEvent(JSON.parse(event.newValue) as FeedEvent);
      } catch { /**/ }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => settleFarmingState(prev, serverNow()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Re-calibrate the server clock periodically and on resume so a phone that
  // sleeps for hours (or a tampered system clock that drifts mid-session)
  // can't accumulate fake earnings against the local Date.now().
  useEffect(() => {
    void refreshServerOffset();
    const interval = setInterval(() => { void refreshServerOffset(); }, 5 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) void refreshServerOffset(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const craft = useCallback((availableStardust?: number): { completed: boolean; planet?: Planet; tapsLeft?: number; broken?: boolean; brokenRarity?: PlanetType; equipmentDrop?: EquipmentDropResult } => {
    const current = stateRef.current;
    if (current.pendingPlanet) return { completed: false };
    if (current.planets.length >= current.maxSlots) return { completed: false };

    let rarity = current.currentCraftRarity;
    let goal = current.goal;

    if (rarity === null) {
      rarity = rollRarity();
      const config = PLANET_CONFIG[rarity];
      const stardustBalance = availableStardust ?? current.stardustBalance;
      // Stardust cost check at forge start — block if insufficient.
      if (stardustBalance < config.craftCost) {
        return { completed: false };
      }
      // Deduct Stardust immediately so the balance counter updates live.
      setState((prev) => ({
        ...prev,
        stardustBalance: prev.stardustBalance - config.craftCost,
      }));
      // Also deduct on the server (fire-and-forget). The local state is
      // authoritative for the UI; the server sync corrects on next refresh.
      if (current.telegramId) {
        void deductCraftStardust(current.telegramId, config.craftCost);
      }
      // Random goal between 100 and 200 taps for all rarities
      goal = 100 + Math.floor(Math.random() * 101);
    }

    const newTaps = current.taps + 1;

    if (newTaps >= goal) {
      const config = PLANET_CONFIG[rarity];
      const craftCost = config.craftCost;

      // 15% chance the planet shatters during construction. The player loses
      // the Stardust cost, but no planet is added to the inventory.
      const BREAK_CHANCE = 0.15;
      const isBroken = Math.random() < BREAK_CHANCE;

      if (isBroken) {
        const brokenRarity = rarity;
        setState((prev) => {
          const next: GameState = {
            ...prev,
            taps: 0,
            goal: 100,
            totalTaps: (prev.totalTaps || 0) + 1,
            currentCraftRarity: null,
            pendingPlanet: null,
            pendingPlanetCost: 0,
          };
          schedulePersist(next);
          return next;
        });
        return { completed: true, broken: true, brokenRarity };
      }

      const planet = makePlanet(rarity);
      // Pre-roll OUTSIDE setState: all randomness (Math.random,
      // makeEquipmentItem's id+timestamp) must happen exactly once per
      // craft, even under React strict-mode dev double-invocation.
      // The cap COMPARISON is done atomically inside the updater against
      // `prev.equipment` so concurrent /equipment writes can't allow a
      // 3rd item to slip in past the 2-per-model cap.
      const willDrop = Math.random() < LAB_EQUIPMENT_DROP_CHANCE;
      const dropCategory = willDrop ? rollEquipmentCategory() : null;
      const dropRarity = willDrop ? rollEquipmentRarity() : null;
      const candidateItem = (willDrop && dropCategory && dropRarity)
        ? makeEquipmentItem(dropCategory, dropRarity)
        : null;
      const consolationBonus = (willDrop && dropCategory && dropRarity)
        ? Math.max(50, Math.round(getEquipmentRate(dropCategory, dropRarity) * 5))
        : 0;
      let equipmentDrop: EquipmentDropResult | null = null;
      setState((prev) => {
        let droppedItem: EquipmentItem | undefined;
        let zoomBonus = 0;
        if (candidateItem && dropCategory && dropRarity) {
          const owned = countOwnedModel(prev.equipment || [], dropCategory, dropRarity);
          if (owned >= LAB_EQUIPMENT_CAP_PER_MODEL) {
            zoomBonus = consolationBonus;
            equipmentDrop = { convertedToZoom: zoomBonus, category: dropCategory, rarity: dropRarity };
          } else {
            droppedItem = candidateItem;
            equipmentDrop = { item: droppedItem };
          }
        }
        const next: GameState = {
          ...(planet.name === "GOLD"
            ? withFeedEvent(prev, `${PLAYER_NAME} just forged a GOLD planet!`)
            : prev),
          balance: prev.balance + zoomBonus,
          taps: 0,
          goal: 100,
          totalTaps: (prev.totalTaps || 0) + 1,
          currentCraftRarity: null,
          pendingPlanet: planet,
          pendingPlanetCost: craftCost,
          craftsCompleted: prev.craftsCompleted + 1,
          equipment: droppedItem ? [...(prev.equipment || []), droppedItem] : (prev.equipment || []),
          // Bump the balance epoch when a duplicate-equipment ZOOM bonus is
          // credited so /balance/sync's CASE-branch picks up the new local
          // value instead of overwriting it with the older server snapshot.
          lastBalanceEpoch: zoomBonus > 0 ? (prev.lastBalanceEpoch || 0) + 1 : (prev.lastBalanceEpoch || 0),
        };
        // Persist in idle time so the tap stays at 60fps. Page-hide and unload
        // listeners flush this synchronously to guarantee durability.
        schedulePersist(next);
        // Immediate, non-debounced save of the equipment array when a real
        // item dropped — the 1.2s debounce can lose the drop if the user
        // closes the app right after crafting, and on next hydration the
        // server snapshot would silently overwrite the unsaved local item.
        if (droppedItem && next.telegramId) {
          void saveEquipment(next.telegramId, next.equipment ?? []);
        }
        return next;
      });
      return { completed: true, planet, ...(equipmentDrop ? { equipmentDrop } : {}) };
    } else {
      setState((prev) => {
        const next: GameState = {
          ...prev,
          taps: newTaps,
          goal,
          totalTaps: (prev.totalTaps || 0) + 1,
          currentCraftRarity: rarity,
        };
        schedulePersist(next);
        return next;
      });
      return { completed: false, tapsLeft: goal - newTaps };
    }
  }, []);

  const claimCraft = useCallback((): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    let claimedName: PlanetType | null = null;
    let claimedCost = 0;
    setState((prev) => {
      if (!prev.pendingPlanet) { outcome = { ok: false, reason: "No planet to claim" }; return prev; }
      // Hard slot guard: between the moment the planet finished forging and
      // the moment the user taps "claim", they may have received planets from
      // other sources (mystery box, market buy, bonus). Refuse and keep the
      // pendingPlanet so the user can free a slot and try again.
      if (prev.planets.length >= prev.maxSlots) {
        outcome = { ok: false, reason: "Slots full" };
        try { window.dispatchEvent(new CustomEvent("zoom-toast", { detail: { text: "Slots full", ok: false } })); } catch { /**/ }
        return prev;
      }
      claimedName = prev.pendingPlanet.name;
      claimedCost = prev.pendingPlanetCost || 0;
      return {
        ...prev,
        planets: [...prev.planets, prev.pendingPlanet],
        pendingPlanet: null,
        pendingPlanetCost: 0,
      };
    });
    // Increment the leaderboard counter ONLY after the planet is committed
    // to inventory (fire-and-forget). Previously this was called at forge
    // time, which inflated total_crafted_X when users closed the app before
    // claiming (pendingPlanet is local-only and didn't survive reload).
    if (outcome.ok && claimedName) {
      const { telegramId: tid } = getTelegramContext();
      if (tid) {
        // Fire the server counter update, then immediately refresh the
        // global profile so that the "My Profile" panel in RankPage
        // reflects the new craft in real-time (otherwise the user would
        // have to wait up to 15s for the next periodic poll).
        void recordCraft(tid, claimedName, claimedCost).then(() => {
          try { window.dispatchEvent(new Event("zoom-data-refresh")); } catch { /**/ }
        });
      }
    }
    return outcome;
  }, []);

  const redeemCode = useCallback((code: string): { success: boolean; amount?: number; isSun?: boolean; error?: string } => {
    const upperCode = code.trim().toUpperCase();
    const current = stateRef.current;
    if (current.usedRedeemCodes.includes(upperCode)) {
      return { success: false, error: "Code already used" };
    }
    if (SUN_CODES.includes(upperCode)) {
      if (current.sun?.isOwned) {
        return { success: false, error: "You already own THE SUN" };
      }
      setState((prev) => ({
        ...prev,
        usedRedeemCodes: [...prev.usedRedeemCodes, upperCode],
        sun: {
          isOwned: true,
          isActive: false,
          activationCost: SUN_CONFIG.activationCostBase,
          cycleCount: 0,
          farmStartedAt: 0,
          lastCollectedAt: 0,
        },
      }));
      return { success: true, isSun: true };
    }
    const amount = REDEEM_CODES[upperCode];
    if (!amount) return { success: false, error: "Invalid code" };
    setState((prev) => ({
      ...prev,
      balance: prev.balance + amount,
      usedRedeemCodes: [...prev.usedRedeemCodes, upperCode],
    }));
    return { success: true, amount };
  }, []);

  const activateSun = useCallback(() => {
    const now = serverNow();
    let newCycleCount = 0;
    let telegramId: string | null = null;
    setState((prev) => {
      if (!prev.sun?.isOwned) return prev;
      // No activation cost — SUN was paid for once at purchase (10 TON).
      // Each new cycle simply resets the timer for free.
      newCycleCount = (prev.sun.cycleCount || 0) + 1;
      telegramId = prev.telegramId;
      return {
        ...prev,
        sun: {
          ...prev.sun,
          isActive: true,
          cycleCount: newCycleCount,
          activationCost: 0,
          farmStartedAt: now,
          lastCollectedAt: now,
        },
      };
    });
    // Persist the new cycle to the server so it survives a localStorage
    // wipe / device switch. Fire-and-forget — local state is already correct;
    // server merges with GREATEST so a slow/failed write can't roll us back.
    if (telegramId) {
      void syncSunCycle({
        telegramId,
        sunFarmStartedAtMs: Math.round(now),
        sunLastCollectedAtMs: Math.round(now),
        sunCycleCount: newCycleCount,
      });
    }
  }, []);

  const startSunFarming = useCallback((): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    let pushTelegramId: string | null = null;
    let pushNow = 0;
    let pushCycleCount = 0;
    setState((prev) => {
      if (!prev.sun?.isOwned) {
        outcome = { ok: false, reason: "SUN not owned" };
        return prev;
      }
      const now = serverNow();
      // First start (right after purchase) is free; subsequent reactivations
      // after the 24h cycle elapsed cost a $ZOOM fee.
      const wasStarted = prev.sun.farmStartedAt > 0;
      const expired = wasStarted && now - prev.sun.farmStartedAt > FARM_DURATION_MS;
      // Fee scales with how many SUNs are owned (each SUN multiplies the
      // per-cycle yield, so each SUN must also pay its share).
      const fee = expired ? getSunReactivationFee(prev.sunCount) : 0;
      if (fee > 0 && prev.balance < fee) {
        outcome = { ok: false, reason: `Need ${fee.toLocaleString()} $ZOOM to reactivate SUN` };
        return prev;
      }
      const updated: GameState = {
        ...prev,
        balance: prev.balance - fee,
        sun: {
          ...prev.sun,
          isActive: true,
          farmStartedAt: now,
          lastCollectedAt: now,
        },
      };
      saveState(updated);
      pushTelegramId = prev.telegramId;
      pushNow = now;
      // updated.sun is non-null here: we just constructed it above with
      // `sun: { ...prev.sun, ... }` after the prev.sun?.isOwned guard.
      pushCycleCount = updated.sun?.cycleCount ?? 0;
      return updated;
    });
    // Mirror the cycle to the server (see activateSun for rationale).
    if (pushTelegramId) {
      void syncSunCycle({
        telegramId: pushTelegramId,
        sunFarmStartedAtMs: Math.round(pushNow),
        sunLastCollectedAtMs: Math.round(pushNow),
        sunCycleCount: pushCycleCount,
      });
    }
    return outcome;
  }, []);

  const stopSunFarming = useCallback(() => {
    setState((prev) => {
      if (!prev.sun) return prev;
      return {
        ...prev,
        sun: {
          ...prev.sun,
          isActive: false,
        },
      };
    });
  }, []);

  const burnSun = useCallback(() => {
    setState((prev) => {
      if (!prev.sun) return prev;
      return {
        ...prev,
        sun: null,
      };
    });
  }, []);

  const acquireSun = useCallback(() => {
    setState((prev) => {
      if (prev.sun?.isOwned) return prev;
      return withFeedEvent({
        ...prev,
        sun: {
          isOwned: true,
          isActive: false,
          activationCost: SUN_CONFIG.activationCostBase,
          cycleCount: 0,
          farmStartedAt: 0,
          lastCollectedAt: 0,
        },
      }, `${PLAYER_NAME} just acquired the SUN!`);
    });
  }, []);

  const collectSun = useCallback(() => {
    let pushTelegramId: string | null = null;
    let pushNow = 0;
    let pushStarted = 0;
    let pushCycleCount = 0;
    setState((prev) => {
      if (!prev.sun) return prev;
      const now = serverNow();
      pushTelegramId = prev.telegramId;
      pushNow = now;
      pushStarted = prev.sun.farmStartedAt ?? 0;
      pushCycleCount = prev.sun.cycleCount ?? 0;
      return {
        ...prev,
        sun: { ...prev.sun, lastCollectedAt: now },
      };
    });
    if (pushTelegramId) {
      void syncSunCycle({
        telegramId: pushTelegramId,
        sunFarmStartedAtMs: Math.round(pushStarted),
        sunLastCollectedAtMs: Math.round(pushNow),
        sunCycleCount: pushCycleCount,
      });
    }
  }, []);

  /**
   * DEPRECATED — daily collect was removed. The orange COLLECT button no
   * longer exists in the UI; planets farm autonomously for 24h and then
   * require a $ZOOM reactivation. This callback is kept exported only so
   * existing wiring (`App.tsx` passes it as `onCollect={collectPlanet}` to
   * `FarmPage`) continues to typecheck. It is now an inert no-op:
   * no setState, no balance mutation, no `lastCollectedAt` refresh, no
   * server notification. Defect-roll removed too — that punishment was tied
   * to the manual collect step which no longer exists. Safe to remove the
   * entire wiring chain in a future cleanup.
   */
  const collectPlanet = useCallback((_id: string): { defect: boolean } => {
    return { defect: false };
  }, []);

  const burnPlanet = useCallback((id: string, stardustReward?: number) => {
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (!planet) return prev;
      if (prev.telegramId) notifyFarmStop(prev.telegramId, id);
      // If this planet was a server-granted bonus (referral milestone, wheel
      // reward, mystery box, starter pack, etc) we MUST permanently consume
      // one entitlement on the server. Otherwise the next /grants poll will
      // see entitlement > claimed and silently re-add the burned planet.
      const isBonusPlanet = planet.id.startsWith(`bonus-${planet.name}-`);
      if (isBonusPlanet && prev.telegramId && (planet.name === "BASIC" || planet.name === "RARE" || planet.name === "EPIC" || planet.name === "MYTHIC" || planet.name === "PLASMA" || planet.name === "GOLD")) {
        notifyPlanetBurn(prev.telegramId, planet.name);
      }
      const refund = Math.floor(planet.craftCost * 0.15);
      // When burning a bonus planet, we MUST decrement the local "claimed"
      // counter by exactly 1 so it stays in lockstep with the server-side
      // entitlement counter (which notifyPlanetBurn just decremented). If we
      // don't, the next /grants poll computes
      //   toAdd = serverCount − max(claimedCount, existingBonusCount)
      // which becomes negative (because claimedCount is still the pre-burn
      // value but serverCount and existingBonusCount have both gone down by 1)
      // and the reconciliation branch removes an EXTRA bonus planet to "fix"
      // the perceived drift — silently deleting a sibling planet the user
      // never asked to burn. Crafted (non-bonus) planets don't touch any
      // counter and only the single matching id is filtered out.
      const updated = {
        ...prev,
        balance: prev.balance + refund,
        stardustBalance: prev.stardustBalance + (stardustReward ?? 0),
        planets: prev.planets.filter((p) => p.id !== id),
        claimedBonusBasic: isBonusPlanet && planet.name === "BASIC" ? Math.max(0, prev.claimedBonusBasic - 1) : prev.claimedBonusBasic,
        claimedBonusRare:  isBonusPlanet && planet.name === "RARE"  ? Math.max(0, prev.claimedBonusRare  - 1) : prev.claimedBonusRare,
        claimedBonusEpic:  isBonusPlanet && planet.name === "EPIC"  ? Math.max(0, prev.claimedBonusEpic  - 1) : prev.claimedBonusEpic,
        claimedBonusMythic: isBonusPlanet && planet.name === "MYTHIC" ? Math.max(0, prev.claimedBonusMythic - 1) : prev.claimedBonusMythic,
        claimedBonusPlasma: isBonusPlanet && planet.name === "PLASMA" ? Math.max(0, prev.claimedBonusPlasma - 1) : prev.claimedBonusPlasma,
        claimedBonusGold:  isBonusPlanet && planet.name === "GOLD"  ? Math.max(0, prev.claimedBonusGold  - 1) : prev.claimedBonusGold,
      };
      // Sync stateRef synchronously: if the user closes the app within a few
      // ms of pressing burn (before React commits), the visibility/unload
      // flush handler reads stateRef.current. Without this line, that handler
      // would write the PRE-burn snapshot and resurrect the planet on reload.
      stateRef.current = updated;
      saveState(updated);
      // CRITICAL — same reason as burnTwoOfType: push the post-burn planets
      // array to the server IMMEDIATELY (not via 1.2s debounce). Otherwise a
      // burn followed by a fast app-close resurrects the planet on the next
      // launch because the server still holds the pre-burn planets_json.
      // `saveRegularPlanets` uses `keepalive: true` so the request survives
      // page-hide / Mini App close.
      if (updated.telegramId) {
        void saveRegularPlanets(
          updated.telegramId,
          updated.planets as unknown as Array<Record<string, unknown>>,
          {
            basic: updated.claimedBonusBasic ?? 0,
            rare:  updated.claimedBonusRare  ?? 0,
            epic:  updated.claimedBonusEpic  ?? 0,
            gold:  updated.claimedBonusGold  ?? 0,
            mythic: updated.claimedBonusMythic ?? 0,
            plasma: updated.claimedBonusPlasma ?? 0,
            v1:    updated.claimedBonusV1    ?? 0,
            v1NftPlatinum: updated.claimedBonusV1NftPlatinum ?? 0,
          },
          updated.craftsCompleted,
        );
      }
      return updated;
    });
  }, []);

  const startFarming = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (!planet || planet.isListedInMarket) {
        outcome = { ok: false, reason: "Planet unavailable" };
        return prev;
      }
      const now = serverNow();
      // A planet is "expired" if its 24h cycle elapsed AND it had been started before.
      // First-time start (right after craft) is free; subsequent reactivations cost
      // a rarity-based $ZOOM fee.
      // Daily-collect removed: anchor expiry on `effectiveFarmStart` so the
      // fee logic stays in lockstep with `isFarmExpired` / `isFarmActive` /
      // server `farm/settle`. Without this, a pre-deploy planet whose
      // `lastCollectedAt > farmStartedAt` would still be wrongfully charged
      // a reactivation fee even though the rest of the system considers it
      // active for another full window.
      const eff = effectiveFarmStart(planet);
      const wasStarted = eff > 0;
      const expired = wasStarted && now - eff > FARM_DURATION_MS;
      const fee = expired ? PLANET_CONFIG[planet.name].reactivationFee : 0;
      if (fee > 0 && prev.balance < fee) {
        outcome = { ok: false, reason: `Need ${fee.toLocaleString()} $ZOOM to reactivate` };
        return prev;
      }
      // Cooldown-reset exploit guard:
      // We must ONLY reset farmStartedAt / lastCollectedAt when the user is
      // truly starting a fresh 24h cycle. That is:
      //   (a) the planet has never been started (first start after craft), OR
      //   (b) the previous cycle has already expired AND the user paid the
      //       reactivation fee above.
      // In every other case (the planet is mid-cycle but currently paused —
      // e.g. just delisted from the marketplace, or stopped some other way)
      // we MUST keep the original farmStartedAt and lastCollectedAt. Without
      // this guard, listing → delisting → pressing START would silently
      // grant a free fresh 24h cycle, bypassing the reactivation fee and
      // the daily-collect window. Earnings calculations elsewhere in the
      // code rely on these timestamps as the authoritative cycle anchor.
      const startsFreshCycle = !wasStarted || expired;
      // Pause-preserving resume: if the planet was paused via a market
      // listing while mid-cycle (pausedAt > 0) and we're not starting a
      // fresh cycle, advance farmStartedAt + lastCollectedAt by the
      // pause duration. This preserves the exact remaining time the
      // user had at the moment of pause — without granting any free
      // extra time (the 24h budget is unchanged, just shifted forward).
      // Mathematical invariant: new effectiveFarmStart - originalEff
      // = (now - pausedAt), so remaining = 24h - (pausedAt - originalEff)
      // which equals what was left at pause.
      const pauseShift = (!startsFreshCycle && planet.pausedAt && planet.pausedAt > 0)
        ? Math.max(0, now - planet.pausedAt)
        : 0;

      // Apply staking decay on reactivation: -1% durability per 24h elapsed
      // since durabilityUpdatedAt. Only applies when starting a fresh cycle
      // (first start or reactivation — not a mid-cycle resume).
      const currentDurability = planet.durability ?? 100;
      let nextDurability = currentDurability;
      let nextDurabilityUpdatedAt = planet.durabilityUpdatedAt ?? 0;
      if (startsFreshCycle) {
        if (wasStarted) {
          // Reactivation: apply decay for every 24h that elapsed since
          // durabilityUpdatedAt (or farmStartedAt as fallback).
          const durRef = nextDurabilityUpdatedAt > 0 ? nextDurabilityUpdatedAt : (planet.farmStartedAt ?? now);
          const elapsed24h = Math.floor((now - durRef) / (24 * 60 * 60 * 1000));
          if (elapsed24h > 0) {
            nextDurability = Math.max(0, currentDurability - elapsed24h);
          }
        }
        nextDurabilityUpdatedAt = now;
      }

      const updated: GameState = {
        ...prev,
        balance: prev.balance - fee,
        planets: prev.planets.map((p) =>
          p.id === id
            ? startsFreshCycle
              ? { ...p, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now, pausedAt: 0,
                  durability: nextDurability, durabilityUpdatedAt: nextDurabilityUpdatedAt }
              : {
                  ...p,
                  isFarmingActive: true,
                  farmStartedAt: p.farmStartedAt + pauseShift,
                  lastCollectedAt: p.lastCollectedAt + pauseShift,
                  pausedAt: 0,
                }
            : p
        ),
      };
      saveState(updated);
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, false);
      return updated;
    });
    return outcome;
  }, []);

  const stopFarming = useCallback((id: string) => {
    setState((prev) => {
      if (prev.telegramId) notifyFarmStop(prev.telegramId, id);
      return {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id ? { ...p, isFarmingActive: false } : p
        ),
      };
    });
  }, []);

  const listPlanet = useCallback((id: string, price: number) => {
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (!planet) return prev;
      // Tutte le rarità sono tradeabili sul marketplace globale P2P in TON,
      // incluso V1 (precedentemente soulbound, ora abilitato).
      // Capture the pre-optimistic state BEFORE the .then closure runs
      // so the rejection rollback can restore the exact prior values
      // instead of inferring from `pausedAt`. Inferring is wrong when
      // the planet was already paused (isFarmingActive=false,
      // pausedAt>0 from a previous list/delist) and the user lists
      // again: a rollback should keep the planet paused, not silently
      // re-activate farming.
      const prevIsFarmingActive = !!planet.isFarmingActive;
      const prevPausedAt = planet.pausedAt ?? 0;
      const { telegramId, firstName, username, photoUrl } = getTelegramContext();
      if (telegramId) {
        // Flush planets to the server BEFORE sending the listing request.
        // This prevents a 400 "Planet not found in your inventory" when the
        // planet was just crafted and the debounced save hasn't fired yet.
        const claimedSnap = {
          basic: prev.claimedBonusBasic ?? 0,
          rare: prev.claimedBonusRare ?? 0,
          epic: prev.claimedBonusEpic ?? 0,
          gold: prev.claimedBonusGold ?? 0,
          mythic: prev.claimedBonusMythic ?? 0,
          plasma: prev.claimedBonusPlasma ?? 0,
          v1: prev.claimedBonusV1 ?? 0,
          v1NftPlatinum: prev.claimedBonusV1NftPlatinum ?? 0,
        };
        saveRegularPlanets(
          telegramId,
          prev.planets as unknown as Array<Record<string, unknown>>,
          claimedSnap,
          prev.craftsCompleted,
        ).then(() => listOnMarket({
          sellerTelegramId: telegramId,
          sellerName: firstName ?? undefined,
          // Pass the local planet id so the server can verify ownership
          // against users.planets_json. Without it the server will reject
          // the listing with 400 "Planet not found in your inventory".
          planetId: planet.id,
          planetType: planet.name,
          planetRate: planet.rate,
          price,
        })).then((result) => {
          if (result.ok && result.listing) {
            setState((s) => ({
              ...s,
              planets: s.planets.map((p) =>
                p.id === id ? { ...p, serverListingId: result.listing!.id } : p
              ),
            }));
          } else {
            // Server rejected the listing (e.g. 409 "already listed",
            // 409 "previously sold", 400 "type/rate mismatch"). Revert
            // the optimistic local mark to the EXACT pre-listing
            // values (isFarmingActive + pausedAt) so the planet
            // returns to the same state it had before the user tapped
            // "list" — whether that was actively farming, paused mid-
            // cycle, never-started, or expired.
            setState((s) => ({
              ...s,
              planets: s.planets.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      isListedInMarket: false,
                      marketPrice: null,
                      serverListingId: undefined,
                      isFarmingActive: prevIsFarmingActive,
                      pausedAt: prevPausedAt,
                    }
                  : p,
              ),
            }));
            toast({
              title: "Listing rejected",
              description: result.error ?? "The server refused to list this planet.",
              variant: "destructive",
            });
          }
        }).catch(() => {
          // Network error or save failure — revert the optimistic listing
          setState((s) => ({
            ...s,
            planets: s.planets.map((p) =>
              p.id === id
                ? {
                    ...p,
                    isListedInMarket: false,
                    marketPrice: null,
                    serverListingId: undefined,
                    isFarmingActive: prevIsFarmingActive,
                    pausedAt: prevPausedAt,
                  }
                : p
            ),
          }));
        });
      }
      // Snapshot the pause moment ONLY if the cycle was actually
      // running (mid-cycle pause). For never-started, expired, or
      // already-paused planets we leave pausedAt at its prior value —
      // startFarming uses startsFreshCycle / pausedAt together to
      // decide the correct resume math.
      const pauseStamp = prevIsFarmingActive ? serverNow() : prevPausedAt;
      const updated = {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id
            ? { ...p, isListedInMarket: true, isFarmingActive: false, marketPrice: price, pausedAt: pauseStamp }
            : p
        ),
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
  }, []);

  // Repair a planet to 100% durability by spending Stardust.
  const repairPlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (!planet) { outcome = { ok: false, reason: "Planet not found" }; return prev; }
      const dur = planet.durability ?? 100;
      if (dur >= 100) { outcome = { ok: false, reason: "Already at full durability" }; return prev; }
      const cost = REPAIR_STARDUST_COST[planet.name] ?? 500;
      if (prev.stardustBalance < cost) {
        outcome = { ok: false, reason: `Need ${cost.toLocaleString()} ⭐ Stardust to repair` };
        return prev;
      }
      const updated: GameState = {
        ...prev,
        stardustBalance: prev.stardustBalance - cost,
        planets: prev.planets.map((p) =>
          p.id === id ? { ...p, durability: 100, durabilityUpdatedAt: serverNow() } : p
        ),
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
    return outcome;
  }, []);

  const unlistPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (planet?.serverListingId) {
        const { telegramId } = getTelegramContext();
        if (telegramId) {
          delistFromMarket(telegramId, planet.serverListingId);
        }
      }
      const updated = {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id ? { ...p, isListedInMarket: false, marketPrice: null, serverListingId: undefined } : p
        ),
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
  }, []);

  const buyPlanet = useCallback((listing: MarketListing): { success: boolean; reason?: string } => {
    const current = stateRef.current;
    if (current.planets.length >= current.maxSlots) {
      return { success: false, reason: "No free slots available" };
    }
    // Marketplace globale P2P in TON: debit from depositBalance, no fee.
    if (current.depositBalance < listing.price) {
      return { success: false, reason: "TON deposit insufficient" };
    }
    const isOwnListing = current.planets.some(p => p.id === listing.id && p.isListedInMarket);
    if (isOwnListing) {
      return { success: false, reason: "Cannot buy your own listing" };
    }
    const cfg = PLANET_CONFIG[listing.name];
    const now = serverNow();
    const newPlanet: Planet = {
      id: `bought-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      name: listing.name,
      rate: cfg.rate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      // The buyer just paid — they get a fresh 24h cycle when they press
      // START for the first time. Until then, the planet is in the
      // never-started state (see makePlanet for the rationale).
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: listing.price,
      // Local in-memory listing path (legacy, pre-server marketplace).
      // Use the listing's snapshotted float when available, otherwise
      // fresh random — buyer sees a unique perfection score on the new
      // planet either way.
      float: typeof listing.planetFloat === "number"
        ? listing.planetFloat
        : generateRandomFloat(),
    };
    setState((prev) => {
      const updated = {
        ...prev,
        depositBalance: +(prev.depositBalance - listing.price).toFixed(6),
        planets: [...prev.planets, newPlanet],
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
    return { success: true };
  }, []);

  const serverBuyComplete = useCallback((planetType: PlanetType, planetRate: number, pricePaid: number, planetFloat?: number | null) => {
    const cfg = PLANET_CONFIG[planetType];
    const now = serverNow();
    const newPlanet: Planet = {
      id: `bought-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      name: planetType,
      rate: planetRate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      // Same as buyPlanet — never-started until first user-triggered START.
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: pricePaid,
      // Carry the listing's snapshotted float onto the buyer's new
      // planet so the perfection score the buyer saw on the marketplace
      // card persists (CS:GO-style: you bought THIS specific float).
      // Fall back to a fresh random if the listing didn't carry one.
      float: typeof planetFloat === "number" && Number.isFinite(planetFloat)
        ? planetFloat
        : generateRandomFloat(),
    };
    setState((prev) => {
      // 50/50 split: buyer pays half from deposit_balance and half from
      // earned_balance (tonBalance), mirroring the server-side debit.
      const half = +(pricePaid * 0.5).toFixed(6);
      const updated = {
        ...prev,
        depositBalance: +((prev.depositBalance || 0) - half).toFixed(6),
        tonBalance: +(Math.max(0, (prev.tonBalance || 0) - half)).toFixed(6),
        planets: [...prev.planets, newPlanet],
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
  }, []);

  // ---- ANTI-DUPLICATION RECONCILIATION ----
  // When a planet I listed gets bought (or admin-delisted), the asset must
  // leave my local inventory immediately. The server is already the source of
  // truth (status='sold' on market_listings, balance credited atomically) — we
  // just need to mirror that here so the same logical asset never coexists in
  // both seller and buyer inventories.
  useEffect(() => {
    // 1) Live channel: SSE broadcasts every successful sale. If the listingId
    //    matches one of my listed planets, drop it from my array.
    const close = openMarketActivityStream((sale) => {
      setState((prev) => {
        const idx = prev.planets.findIndex(
          (p) => p.isListedInMarket && p.serverListingId === sale.id,
        );
        if (idx === -1) return prev;
        const next = prev.planets.slice();
        next.splice(idx, 1);
        return { ...prev, planets: next };
      });
    });

    // 2) Reconcile on resume / periodic poll: if any of my listed planets are
    //    no longer present in the active listings on the server (because they
    //    were sold while I was offline, or force-delisted by admin), remove
    //    them locally. This catches anything the SSE missed.
    let cancelled = false;
    const reconcile = async () => {
      const myListed = stateRef.current.planets.filter(
        (p) => p.isListedInMarket && typeof p.serverListingId === "number",
      );
      if (myListed.length === 0) return;
      try {
        const active = await fetchMarketListings();
        if (cancelled) return;
        // Safety guard: if the server returns ZERO active listings while
        // we have ANY locally-listed planet, treat the response as
        // suspicious (transient server issue, query bug, pagination
        // truncation) and skip the reconcile. The probability of every
        // single one of a user's listings being legitimately sold/delisted
        // between two 30s polls — AND no other player having ANY active
        // listing in the entire market — is effectively zero. Real money
        // is at stake; we'd rather miss a sync than destroy a planet.
        if (active.length === 0) return;
        const activeIds = new Set(active.map((l) => l.id));
        const goneIds = new Set(
          myListed
            .filter((p) => !activeIds.has(p.serverListingId as number))
            .map((p) => p.serverListingId as number),
        );
        if (goneIds.size === 0) return;
        // Second safety guard: if more than half of our listings would be
        // wiped in a single reconcile, bail out. A genuine "I sold 5 of my
        // 6 listings while offline" is rare; a buggy/partial response
        // returning a truncated list is more likely. Forces a manual
        // refresh by the user, which is preferable to silent destruction.
        if (myListed.length >= 2 && goneIds.size > myListed.length / 2) {
          // eslint-disable-next-line no-console
          console.warn("[market reconcile] suspicious: would remove", goneIds.size, "of", myListed.length, "— skipping");
          return;
        }
        setState((prev) => ({
          ...prev,
          planets: prev.planets.filter(
            (p) =>
              !(
                p.isListedInMarket &&
                typeof p.serverListingId === "number" &&
                goneIds.has(p.serverListingId)
              ),
          ),
        }));
      } catch { /* network/parse error — keep planets, retry next poll */ }
    };
    void reconcile();
    const onVisible = () => { if (!document.hidden) void reconcile(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(reconcile, 30_000);

    return () => {
      cancelled = true;
      close();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  const unlockSlot = useCallback(() => {
    setState((prev) => ({ ...prev, maxSlots: prev.maxSlots + 1 }));
  }, []);

  const claimDaily = useCallback(() => {
    const now = serverNow();
    setState((prev) => {
      if (now - prev.lastDailyClaimAt < DAILY_COLLECT_MS) return prev;
      return { ...prev, balance: prev.balance + 50, lastDailyClaimAt: now };
    });
  }, []);

  // ---- WHITE COLLECTION ACTIONS ----
  // Place an unplaced (slotIndex == null) white planet into a specific slot.
  // Once placed, the planet is permanently bound to that slot — there is no
  // unplace, no burn, no sell. Placement also auto-starts its first farming
  // cycle (free, like a freshly-crafted regular planet).
  const placeWhitePlanet = useCallback((id: string, slotIndex: number): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const target = prev.whitePlanets.find((p) => p.id === id);
      if (!target) {
        outcome = { ok: false, reason: "Planet not found" };
        return prev;
      }
      if (target.slotIndex != null) {
        outcome = { ok: false, reason: "Already placed" };
        return prev;
      }
      const maxWhiteSlots = (prev.whiteCollectionBundles || (prev.whiteCollectionUnlocked ? 1 : 0)) * 4;
      if (slotIndex < 0 || slotIndex >= maxWhiteSlots) {
        outcome = { ok: false, reason: "Invalid slot" };
        return prev;
      }
      const occupied = prev.whitePlanets.some((p) => p.slotIndex === slotIndex);
      if (occupied) {
        outcome = { ok: false, reason: "Slot occupied" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, target.name, true);
      const updatedPlanet: Planet = { ...target, slotIndex, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        whitePlanets: prev.whitePlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  // Flip a white planet back to active without touching tonBalance. Used after
  // the user pays the reactivation fee on-chain via TonConnect (same flow as
  // SUN/shop purchases). The fee is collected by the project wallet directly,
  // not deducted from the in-game tonBalance — so this method must NOT debit.
  const markWhitePlanetReactivated = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.whitePlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      // Auto-collect any pending TON earnings from the just-finished cycle
      // before resetting the timers. This removes the need for a separate
      // COLLECT button — earnings always land in tonBalance the moment the
      // user pays the reactivation fee.
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        whitePlanets: prev.whitePlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  // Legacy reactivate path. The reactivation fee is paid on-chain via
  // TonConnect to the project wallet — the in-game tonBalance is reserved
  // for withdrawals and must NEVER be debited here. This function is kept
  // as an alias of markWhitePlanetReactivated to avoid silent regressions
  // if any caller still wires it up.
  const reactivateWhitePlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.whitePlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        whitePlanets: prev.whitePlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  // Collect TON earnings from a placed white planet. Computes the pending TON
  // accumulated since lastCollectedAt (capped to 24h) and credits it to
  // tonBalance, then resets the per-planet collect timestamp.
  const collectWhitePlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.whitePlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null || !planet.isFarmingActive) return prev;
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (earnedTon <= 0) return prev;
      if (prev.telegramId) notifyFarmCollect(prev.telegramId, id);
      const updatedPlanet: Planet = { ...planet, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        whitePlanets: prev.whitePlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
  }, []);

  // ───── Earth Collection — mirrors the white-planet API exactly. Earth
  // planets occupy their own slot grid (size = bundles × 4) and accumulate TON
  // at 0.000177 TON/h each. Reactivation fee is 0.001 TON paid on-chain.
  const placeEarthPlanet = useCallback((id: string, slotIndex: number): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const target = prev.earthPlanets.find((p) => p.id === id);
      if (!target) {
        outcome = { ok: false, reason: "Planet not found" };
        return prev;
      }
      if (target.slotIndex != null) {
        outcome = { ok: false, reason: "Already placed" };
        return prev;
      }
      const maxEarthSlots = (prev.earthCollectionBundles || (prev.earthCollectionUnlocked ? 1 : 0)) * 4;
      if (slotIndex < 0 || slotIndex >= maxEarthSlots) {
        outcome = { ok: false, reason: "Invalid slot" };
        return prev;
      }
      const occupied = prev.earthPlanets.some((p) => p.slotIndex === slotIndex);
      if (occupied) {
        outcome = { ok: false, reason: "Slot occupied" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, target.name, true);
      const updatedPlanet: Planet = { ...target, slotIndex, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        earthPlanets: prev.earthPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const markEarthPlanetReactivated = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.earthPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        earthPlanets: prev.earthPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const reactivateEarthPlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.earthPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        earthPlanets: prev.earthPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const collectEarthPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.earthPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null || !planet.isFarmingActive) return prev;
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (earnedTon <= 0) return prev;
      if (prev.telegramId) notifyFarmCollect(prev.telegramId, id);
      const updatedPlanet: Planet = { ...planet, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        earthPlanets: prev.earthPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
  }, []);

  // ───── Black Collection — mirrors the earth-planet API exactly.
  const placeBlackPlanet = useCallback((id: string, slotIndex: number): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const target = prev.blackPlanets.find((p) => p.id === id);
      if (!target) {
        outcome = { ok: false, reason: "Planet not found" };
        return prev;
      }
      if (target.slotIndex != null) {
        outcome = { ok: false, reason: "Already placed" };
        return prev;
      }
      const maxBlackSlots = (prev.blackCollectionBundles || (prev.blackCollectionUnlocked ? 1 : 0)) * 4;
      if (slotIndex < 0 || slotIndex >= maxBlackSlots) {
        outcome = { ok: false, reason: "Invalid slot" };
        return prev;
      }
      const occupied = prev.blackPlanets.some((p) => p.slotIndex === slotIndex);
      if (occupied) {
        outcome = { ok: false, reason: "Slot occupied" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, target.name, true);
      const updatedPlanet: Planet = { ...target, slotIndex, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        blackPlanets: prev.blackPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const markBlackPlanetReactivated = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.blackPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        blackPlanets: prev.blackPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const reactivateBlackPlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.blackPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        blackPlanets: prev.blackPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const collectBlackPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.blackPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null || !planet.isFarmingActive) return prev;
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (earnedTon <= 0) return prev;
      if (prev.telegramId) notifyFarmCollect(prev.telegramId, id);
      const updatedPlanet: Planet = { ...planet, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        blackPlanets: prev.blackPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
  }, []);

  // ───── Supernova Collection — mirrors the black-planet API exactly.
  const placeSupernovaPlanet = useCallback((id: string, slotIndex: number): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const target = prev.supernovaPlanets.find((p) => p.id === id);
      if (!target) { outcome = { ok: false, reason: "Planet not found" }; return prev; }
      if (target.slotIndex != null) { outcome = { ok: false, reason: "Already placed" }; return prev; }
      const maxSlots = (prev.supernovaCollectionBundles || (prev.supernovaCollectionUnlocked ? 1 : 0)) * 4;
      if (slotIndex < 0 || slotIndex >= maxSlots) { outcome = { ok: false, reason: "Invalid slot" }; return prev; }
      const occupied = prev.supernovaPlanets.some((p) => p.slotIndex === slotIndex);
      if (occupied) { outcome = { ok: false, reason: "Slot occupied" }; return prev; }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, target.name, true);
      const updatedPlanet: Planet = { ...target, slotIndex, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        supernovaPlanets: prev.supernovaPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const markSupernovaPlanetReactivated = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.supernovaPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) { outcome = { ok: false, reason: "Planet not placed" }; return prev; }
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        supernovaPlanets: prev.supernovaPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const reactivateSupernovaPlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.supernovaPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) { outcome = { ok: false, reason: "Planet not placed" }; return prev; }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        supernovaPlanets: prev.supernovaPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const collectSupernovaPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.supernovaPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null || !planet.isFarmingActive) return prev;
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (earnedTon <= 0) return prev;
      if (prev.telegramId) notifyFarmCollect(prev.telegramId, id);
      const updatedPlanet: Planet = { ...planet, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        supernovaPlanets: prev.supernovaPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
  }, []);

  // ───── Stella Rossa Collection — mirrors the supernova API exactly.
  const placeStellaRossaPlanet = useCallback((id: string, slotIndex: number): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const target = prev.stellaPlanets.find((p) => p.id === id);
      if (!target) { outcome = { ok: false, reason: "Planet not found" }; return prev; }
      if (target.slotIndex != null) { outcome = { ok: false, reason: "Already placed" }; return prev; }
      const maxSlots = (prev.stellaRossaCollectionBundles || (prev.stellaRossaCollectionUnlocked ? 1 : 0)) * 4;
      if (slotIndex < 0 || slotIndex >= maxSlots) { outcome = { ok: false, reason: "Invalid slot" }; return prev; }
      const occupied = prev.stellaPlanets.some((p) => p.slotIndex === slotIndex);
      if (occupied) { outcome = { ok: false, reason: "Slot occupied" }; return prev; }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, target.name, true);
      const updatedPlanet: Planet = { ...target, slotIndex, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        stellaPlanets: prev.stellaPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const markStellaRossaPlanetReactivated = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.stellaPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) { outcome = { ok: false, reason: "Planet not placed" }; return prev; }
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        stellaPlanets: prev.stellaPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const reactivateStellaRossaPlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.stellaPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) { outcome = { ok: false, reason: "Planet not placed" }; return prev; }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        stellaPlanets: prev.stellaPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const collectStellaRossaPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.stellaPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null || !planet.isFarmingActive) return prev;
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (earnedTon <= 0) return prev;
      if (prev.telegramId) notifyFarmCollect(prev.telegramId, id);
      const updatedPlanet: Planet = { ...planet, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        stellaPlanets: prev.stellaPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // SPACE MERCHANT helpers — burn N planets of a given type, mint a
  // freshly-crafted (non-bonus) planet on success. Bonus planets that
  // get burned must call notifyPlanetBurn to keep the server-side
  // entitlement counter in lockstep, exactly like burnPlanet does.
  // ─────────────────────────────────────────────────────────────────
  const burnTwoOfType = useCallback((type: PlanetType): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      // Pick 2 idle, non-listed planets of the requested rarity. Prefer
      // non-bonus first so we don't drain server-granted entitlements
      // when the player has crafted alternatives available.
      const candidates = prev.planets.filter(
        (p) => p.name === type && !p.isFarmingActive && !p.isListedInMarket,
      );
      if (candidates.length < 2) {
        outcome = { ok: false, reason: `Need 2 idle ${PLANET_CONFIG[type].label} planets` };
        return prev;
      }
      const sorted = [...candidates].sort((a, b) => {
        const aBonus = a.id.startsWith(`bonus-${a.name}-`) ? 1 : 0;
        const bBonus = b.id.startsWith(`bonus-${b.name}-`) ? 1 : 0;
        return aBonus - bBonus; // non-bonus (0) first
      });
      const toBurn = sorted.slice(0, 2);
      const burnIds = new Set(toBurn.map((p) => p.id));

      let cBasic = prev.claimedBonusBasic;
      let cRare = prev.claimedBonusRare;
      let cEpic = prev.claimedBonusEpic;
      let cMythic = prev.claimedBonusMythic;
      let cPlasma = prev.claimedBonusPlasma;
      let cGold = prev.claimedBonusGold;
      for (const p of toBurn) {
        const isBonus = p.id.startsWith(`bonus-${p.name}-`);
        if (isBonus && prev.telegramId && (p.name === "BASIC" || p.name === "RARE" || p.name === "EPIC" || p.name === "MYTHIC" || p.name === "PLASMA" || p.name === "GOLD")) {
          notifyPlanetBurn(prev.telegramId, p.name);
          if (p.name === "BASIC") cBasic = Math.max(0, cBasic - 1);
          else if (p.name === "RARE") cRare = Math.max(0, cRare - 1);
          else if (p.name === "EPIC") cEpic = Math.max(0, cEpic - 1);
          else if (p.name === "MYTHIC") cMythic = Math.max(0, cMythic - 1);
          else if (p.name === "PLASMA") cPlasma = Math.max(0, cPlasma - 1);
          else if (p.name === "GOLD") cGold = Math.max(0, cGold - 1);
        }
      }

      const updated: GameState = {
        ...prev,
        planets: prev.planets.filter((p) => !burnIds.has(p.id)),
        claimedBonusBasic: cBasic,
        claimedBonusRare: cRare,
        claimedBonusEpic: cEpic,
        claimedBonusMythic: cMythic,
        claimedBonusPlasma: cPlasma,
        claimedBonusGold: cGold,
      };
      stateRef.current = updated;
      saveState(updated);
      // CRITICAL — push the post-burn planets array to the server IMMEDIATELY,
      // not via the 1.2s debounce. If the user closes the Mini App within
      // that window (very likely after a satisfying merchant fusion), the
      // debounce never fires, the server keeps the pre-burn planets_json,
      // and the next launch resurrects the burned planets when local state
      // gets overwritten by the server hydration. `keepalive: true` inside
      // saveRegularPlanets keeps the request alive even past page-hide.
      if (updated.telegramId) {
        void saveRegularPlanets(
          updated.telegramId,
          updated.planets as unknown as Array<Record<string, unknown>>,
          {
            basic: updated.claimedBonusBasic ?? 0,
            rare:  updated.claimedBonusRare  ?? 0,
            epic:  updated.claimedBonusEpic  ?? 0,
            gold:  updated.claimedBonusGold  ?? 0,
            mythic: updated.claimedBonusMythic ?? 0,
            plasma: updated.claimedBonusPlasma ?? 0,
            v1:    updated.claimedBonusV1    ?? 0,
            v1NftPlatinum: updated.claimedBonusV1NftPlatinum ?? 0,
          },
          updated.craftsCompleted,
        );
      }
      return updated;
    });
    return outcome;
  }, []);

  const addCraftedPlanet = useCallback((type: PlanetType): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      if (prev.planets.length >= prev.maxSlots) {
        outcome = { ok: false, reason: "Slots full" };
        return prev;
      }
      const planet = makePlanet(type);
      const updated: GameState = {
        ...prev,
        planets: [...prev.planets, planet],
        craftsCompleted: prev.craftsCompleted + 1,
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
    return outcome;
  }, []);

  // Patches the `displayName` field of one regular planet in local
  // state. Called by the FarmPage rename modal AFTER the server
  // confirmed the rename + debited stardust. The /regular-planets/save
  // debounce will mirror the new name to the server inside the next
  // ~1s so cross-device sync stays consistent.
  const renamePlanetLocal = useCallback((planetId: string, displayName: string) => {
    setState((prev) => {
      const idx = prev.planets.findIndex((p) => p.id === planetId);
      if (idx < 0) return prev;
      const next = prev.planets.slice();
      next[idx] = { ...next[idx]!, displayName };
      return { ...prev, planets: next };
    });
  }, []);

  // ─── Equipment actions ───────────────────────────────────────────
  //
  // Mirror planet patterns: optimistic local mutation, then fire the
  // server endpoint. The server is the source of truth for the cycle
  // timestamps (server.start sets farmStartedAt=now on its row, etc),
  // and the periodic /equipment fetch eventually heals any drift.

  const activateEquipment = useCallback((id: string) => {
    const tid = stateRef.current.telegramId;
    if (!tid) return;
    setState((prev) => {
      const idx = (prev.equipment || []).findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      const item = prev.equipment[idx]!;
      if (item.isListedInMarket) return prev;
      const now = serverNow();
      const next = prev.equipment.slice();
      next[idx] = {
        ...item,
        farmStartedAt: now,
        lastCollectedAt: 0,
        isFarmingActive: true,
        pausedAt: 0,
      };
      return { ...prev, equipment: next };
    });
    void startEquipmentCycle(tid, id);
  }, []);

  const collectEquipmentAction = useCallback((id: string) => {
    const tid = stateRef.current.telegramId;
    if (!tid) return;
    setState((prev) => {
      const idx = (prev.equipment || []).findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      const item = prev.equipment[idx]!;
      if (item.isListedInMarket) return prev;
      const eff = Math.max(item.farmStartedAt || 0, item.lastCollectedAt || 0);
      if (eff <= 0) return prev;
      const now = serverNow();
      const capped = Math.min(now, eff + FARM_DURATION_MS);
      const next = prev.equipment.slice();
      next[idx] = {
        ...item,
        lastCollectedAt: capped,
        isFarmingActive: true,
      };
      return { ...prev, equipment: next };
    });
    void apiCollectEquipment(tid, id);
  }, []);

  // Reactivate an expired (or never-started) equipment item by paying a
  // $ZOOM fee. Mirrors planet reactivation: client-authoritative debit,
  // server /equipment/start resets the cycle to now. Balance reconciles
  // via /sync. Refuses if insufficient balance or item is listed.
  const reactivateEquipmentAction = useCallback((id: string): { ok: boolean; reason?: string } => {
    const tid = stateRef.current.telegramId;
    if (!tid) return { ok: false, reason: "Not logged in" };
    const item = (stateRef.current.equipment || []).find((e) => e.id === id);
    if (!item) return { ok: false, reason: "Equipment not found" };
    if (item.isListedInMarket) return { ok: false, reason: "Item is listed on the market" };
    // Defensive expiry guard — UI only renders this button for expired
    // items, but a stray caller (keyboard shortcut, future code path)
    // must not silently re-debit a still-active cycle. Mirrors the
    // planet reactivate flow which is a no-op when not expired.
    const nowGuard = serverNow();
    const effGuard = Math.max(item.farmStartedAt || 0, item.lastCollectedAt || 0);
    const isExpired = effGuard > 0 && nowGuard - effGuard > EQUIPMENT_CYCLE_MS;
    const isNeverStarted = effGuard <= 0;
    if (!isExpired && !isNeverStarted) {
      return { ok: false, reason: "Cycle still active" };
    }
    const fee = getEquipmentReactivationFee(item);
    if (stateRef.current.balance < fee) {
      return { ok: false, reason: `Need ${fee.toLocaleString()} $ZOOM to reactivate` };
    }
    setState((prev) => {
      const idx = (prev.equipment || []).findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      const cur = prev.equipment[idx]!;
      if (cur.isListedInMarket) return prev;
      const now = serverNow();
      const next = prev.equipment.slice();
      next[idx] = {
        ...cur,
        farmStartedAt: now,
        lastCollectedAt: 0,
        isFarmingActive: true,
        pausedAt: 0,
      };
      return {
        ...prev,
        balance: Math.max(0, prev.balance - fee),
        lastBalanceEpoch: (prev.lastBalanceEpoch || 0) + 1,
        equipment: next,
      };
    });
    void startEquipmentCycle(tid, id);
    return { ok: true };
  }, []);

  const burnEquipmentAction = useCallback((id: string) => {
    const tid = stateRef.current.telegramId;
    if (!tid) return;
    setState((prev) => {
      const item = (prev.equipment || []).find((e) => e.id === id);
      if (!item || item.isListedInMarket) return prev;
      return { ...prev, equipment: prev.equipment.filter((e) => e.id !== id) };
    });
    void apiBurnEquipment(tid, id);
  }, []);

  const listEquipmentAction = useCallback((id: string, price: number) => {
    const tid = stateRef.current.telegramId;
    if (!tid) return;
    const { firstName } = getTelegramContext();
    let prevState: { isFarmingActive: boolean; pausedAt: number } | null = null;
    setState((prev) => {
      const idx = (prev.equipment || []).findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      const item = prev.equipment[idx]!;
      if (item.isListedInMarket) return prev;
      prevState = {
        isFarmingActive: !!item.isFarmingActive,
        pausedAt: item.pausedAt ?? 0,
      };
      const pauseStamp = item.isFarmingActive ? serverNow() : (item.pausedAt ?? 0);
      const next = prev.equipment.slice();
      next[idx] = {
        ...item,
        isListedInMarket: true,
        isFarmingActive: false,
        marketPrice: price,
        pausedAt: pauseStamp,
      };
      return { ...prev, equipment: next };
    });
    listEquipmentOnMarket({
      sellerTelegramId: tid,
      sellerName: firstName ?? undefined,
      equipmentId: id,
      price,
    }).then((res) => {
      if (res.ok && res.listing) {
        setState((s) => ({
          ...s,
          equipment: s.equipment.map((e) =>
            e.id === id ? { ...e, serverListingId: res.listing!.id } : e,
          ),
        }));
        void refreshMarketListings();
      } else {
        // Roll back to pre-list state.
        setState((s) => ({
          ...s,
          equipment: s.equipment.map((e) =>
            e.id === id
              ? {
                  ...e,
                  isListedInMarket: false,
                  marketPrice: undefined,
                  serverListingId: undefined,
                  isFarmingActive: prevState?.isFarmingActive ?? false,
                  pausedAt: prevState?.pausedAt ?? 0,
                }
              : e,
          ),
        }));
      }
    });
  }, []);

  const unlistEquipmentAction = useCallback((id: string) => {
    const tid = stateRef.current.telegramId;
    if (!tid) return;
    const item = (stateRef.current.equipment || []).find((e) => e.id === id);
    if (item?.serverListingId) {
      void delistFromMarket(tid, item.serverListingId).then(() => {
        void refreshMarketListings();
      });
    }
    setState((prev) => {
      const next = prev.equipment.map((e) => {
        if (e.id !== id) return e;
        // Resume the timer with the same time-remaining the item had
        // when listed. pausedAt was set at list-time to either the
        // moment we paused (mid-cycle) or carried over from a prior
        // pause. The "was live when paused" predicate is anchored at
        // pausedAt (NOT at now) — otherwise an item listed >24h ago
        // would look expired today and lose its preserved remaining
        // time, even though it was still mid-cycle at the moment we
        // paused it. Mirrors planet pauseShift semantics.
        const now = serverNow();
        const eff = Math.max(e.farmStartedAt || 0, e.lastCollectedAt || 0);
        const pausedAt = e.pausedAt || 0;
        const wasLiveAtPause = eff > 0 && pausedAt > 0 && pausedAt - eff <= EQUIPMENT_CYCLE_MS;
        const pauseShift = wasLiveAtPause ? Math.max(0, now - pausedAt) : 0;
        const wasMidCycle = wasLiveAtPause;
        return {
          ...e,
          isListedInMarket: false,
          marketPrice: undefined,
          serverListingId: undefined,
          // Resume farming only if there was a live cycle when we paused.
          isFarmingActive: wasMidCycle,
          // Shift both anchors forward so effectiveStart advances by
          // the pause duration → time-left is preserved.
          farmStartedAt: wasMidCycle && e.farmStartedAt
            ? e.farmStartedAt + pauseShift
            : (e.farmStartedAt || 0),
          lastCollectedAt: wasMidCycle && e.lastCollectedAt
            ? e.lastCollectedAt + pauseShift
            : (e.lastCollectedAt || 0),
          pausedAt: 0,
        };
      });
      const updated = { ...prev, equipment: next };
      // Persist the new anchors so /farm/settle reads the shifted
      // timestamps on its next tick. Without this, the server would
      // accrue against the original (pre-pause) farmStartedAt and
      // mis-credit the listing window.
      void saveEquipment(tid, next);
      return updated;
    });
  }, []);

  // Buy an equipment listing from the marketplace. The server mints the
  // item server-side and returns its identity; we mint a matching row
  // locally so the FarmPage shows it immediately.
  const buyEquipmentFromMarket = useCallback(async (listing: ServerMarketListing): Promise<{ success: boolean; reason?: string }> => {
    const tid = stateRef.current.telegramId;
    if (!tid) return { success: false, reason: "Not logged in" };
    if (listing.kind !== "equipment") return { success: false, reason: "Not an equipment listing" };
    // Equipment buys go through the same TON marketplace endpoint as planets:
    // buyer pays 50% from deposit_balance and 50% from earned_balance (tonBalance).
    const half = +(listing.price * 0.5).toFixed(6);
    if ((stateRef.current.depositBalance || 0) < half || (stateRef.current.tonBalance || 0) < half) {
      return { success: false, reason: "Insufficient balance: need 50% deposit + 50% earned" };
    }
    const result = await buyFromMarket(tid, listing.id);
    if (!result.ok) return { success: false, reason: result.error ?? "Purchase failed" };
    const cat = result.equipmentCategory as EquipmentItem["category"] | null | undefined;
    const rar = result.equipmentRarity as EquipmentItem["rarity"] | null | undefined;
    const rate = result.equipmentRate;
    const equipmentId = result.equipmentId;
    if (!cat || !rar || typeof rate !== "number" || !equipmentId) {
      // Server accepted but didn't echo identity — refetch will heal it.
      return { success: true };
    }
    const newItem: EquipmentItem = {
      id: equipmentId,
      category: cat,
      rarity: rar,
      rate,
      createdAt: Date.now(),
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isFarmingActive: false,
    };
    setState((prev) => {
      // 50/50 split: half from deposit_balance, half from earned_balance
      // (tonBalance), mirroring the server-side debit. Use the price actually
      // charged by the server when echoed back.
      const paidHalf = +((result.pricePaid ?? listing.price) * 0.5).toFixed(6);
      return {
        ...prev,
        depositBalance: +((prev.depositBalance || 0) - paidHalf).toFixed(6),
        tonBalance: +(Math.max(0, (prev.tonBalance || 0) - paidHalf)).toFixed(6),
        equipment: [...(prev.equipment || []), newItem],
      };
    });
    void refreshMarketListings();
    return { success: true };
  }, []);

  // ─── PvP local inventory mutations ─────────────────────────────────
  // After a PvP battle resolves the server has already moved the planet
  // (atomic transfer in pvpEngine.transferPlanet). The client is
  // authoritative for the planets array, so we MUST mirror that change
  // locally — otherwise the debounced /regular-planets/save re-uploads the
  // loser's stale planet (loser keeps it) or strips the winner's new planet
  // (winner never receives it). These two helpers keep client + server in
  // sync; the debounced save then persists them.
  const pvpAddPlanet = useCallback((raw: { id: string; name: string; rate?: number; float?: number | null }) => {
    setState((prev) => {
      if (prev.planets.some((p) => p.id === raw.id)) return prev; // already have it
      const type = raw.name as PlanetType;
      const cfg = PLANET_CONFIG[type] ?? PLANET_CONFIG.BASIC;
      const now = Date.now();
      const newPlanet: Planet = {
        id: raw.id,
        name: type,
        rate: typeof raw.rate === "number" ? raw.rate : cfg.rate,
        color: cfg.color,
        glowColor: cfg.glowColor,
        createdAt: now,
        farmStartedAt: 0,
        lastCollectedAt: 0,
        isListedInMarket: false,
        isFarmingActive: false,
        marketPrice: null,
        craftCost: cfg.craftCost,
        slotIndex: null,
        ...(typeof raw.float === "number" ? { float: raw.float } : {}),
      };
      return { ...prev, planets: [...prev.planets, newPlanet] };
    });
  }, []);
  const pvpRemovePlanet = useCallback((planetId: string) => {
    setState((prev) => ({ ...prev, planets: prev.planets.filter((p) => p.id !== planetId) }));
  }, []);

  return {
    state, setState, craft, claimCraft, redeemCode,
    pvpAddPlanet, pvpRemovePlanet,
    collectPlanet, burnPlanet, renamePlanetLocal,
    startFarming, stopFarming, repairPlanet,
    listPlanet, unlistPlanet, buyPlanet, serverBuyComplete,
    unlockSlot, claimDaily,
    activateSun, acquireSun, collectSun,
    startSunFarming, stopSunFarming, burnSun,
    placeWhitePlanet, reactivateWhitePlanet, markWhitePlanetReactivated, collectWhitePlanet,
    placeEarthPlanet, reactivateEarthPlanet, markEarthPlanetReactivated, collectEarthPlanet,
    placeBlackPlanet, reactivateBlackPlanet, markBlackPlanetReactivated, collectBlackPlanet,
    placeSupernovaPlanet, reactivateSupernovaPlanet, markSupernovaPlanetReactivated, collectSupernovaPlanet,
    placeStellaRossaPlanet, reactivateStellaRossaPlanet, markStellaRossaPlanetReactivated, collectStellaRossaPlanet,
    equipment: state.equipment ?? [],
    activateEquipment,
    collectEquipment: collectEquipmentAction,
    reactivateEquipment: reactivateEquipmentAction,
    burnEquipment: burnEquipmentAction,
    listEquipment: listEquipmentAction,
    unlistEquipment: unlistEquipmentAction,
    buyEquipmentFromMarket,
  };
}
