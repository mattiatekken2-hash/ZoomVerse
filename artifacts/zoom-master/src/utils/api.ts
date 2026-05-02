const API_BASE = `${window.location.origin}/api`;

/**
 * Tell the server a planet started farming. The server uses this to
 * schedule the "Farm full" Telegram notification 24h later. Fire-and-forget
 * — failures are silently ignored so a network blip never blocks gameplay.
 */
export function notifyFarmStart(telegramId: string, planetId: string, planetType: string, isWhite = false): void {
  if (!telegramId || !planetId) return;
  fetch(`${API_BASE}/farm/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId, planetId, planetType, isWhite }),
    keepalive: true,
  }).catch(() => { /* ignore */ });
}

/**
 * Stamp the planet's cycle as collected so the server's cron skips the
 * "Farm full" notification (the user is clearly still engaged).
 */
export function notifyFarmCollect(telegramId: string, planetId: string): void {
  if (!telegramId || !planetId) return;
  fetch(`${API_BASE}/farm/collect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId, planetId }),
    keepalive: true,
  }).catch(() => { /* ignore */ });
}

/**
 * Cancel a scheduled "Farm full" notification (planet sold/burned/stopped).
 */
export function notifyFarmStop(telegramId: string, planetId: string): void {
  if (!telegramId || !planetId) return;
  fetch(`${API_BASE}/farm/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId, planetId }),
    keepalive: true,
  }).catch(() => { /* ignore */ });
}

/**
 * Permanently consume one bonus-planet entitlement on the server when the
 * user burns a planet that was originally granted by the server (id starts
 * with `bonus-`). Without this, the next /grants sync would re-grant the
 * same planet because the entitlement counter is still > claimed.
 */
export function notifyPlanetBurn(telegramId: string, planetType: "BASIC" | "RARE" | "EPIC" | "GOLD"): void {
  if (!telegramId) return;
  fetch(`${API_BASE}/planets/burn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId, planetType }),
    keepalive: true,
  }).catch(() => { /* ignore */ });
}

// Returns the server's current epoch ms, or null if it can't be obtained.
// We never silently fall back to Date.now() because callers use this value
// to *detect* clock-tampering — substituting the local clock on failure
// would defeat the very check (e.g. the stardust spawn anti-tamper schedule
// would treat the local clock as authoritative whenever /time is briefly
// unreachable, re-opening the exploit). Callers must handle null explicitly
// (typically: skip persistence, or skip honouring a saved timestamp).
export async function fetchServerTime(): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/time?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.serverTime === "number" ? data.serverTime : null;
  } catch {
    return null;
  }
}

export async function debugTelegramContext(data: {
  telegramId: string | null;
  initData: string;
  initDataUnsafe: string;
  startParam: string | null;
  localStorageParam: string | null;
  href?: string;
  hash?: string;
  search?: string;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/referral/debug`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch { /**/ }
}

export async function registerUser(
  telegramId: string,
  referredBy?: string | null,
  firstName?: string | null,
  username?: string | null,
): Promise<{ ok: boolean; isNew: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/referral/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramId,
        referredBy: referredBy ?? undefined,
        firstName: firstName ?? undefined,
        username: username ?? undefined,
      }),
    });
    if (!res.ok) return { ok: false, isNew: false };
    return res.json();
  } catch {
    return { ok: false, isNew: false };
  }
}

export interface ReferralData {
  referralCount: number;
  claimedMilestones: number[];
}

export async function fetchPendingReferral(telegramId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/referral/pending/${encodeURIComponent(telegramId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.referrer || null;
  } catch {
    return null;
  }
}

export async function fetchReferralData(telegramId: string): Promise<ReferralData> {
  try {
    const res = await fetch(`${API_BASE}/referral/${encodeURIComponent(telegramId)}`);
    if (!res.ok) return { referralCount: 0, claimedMilestones: [] };
    const data = await res.json();
    return {
      referralCount: typeof data.referralCount === "number" ? data.referralCount : 0,
      claimedMilestones: Array.isArray(data.claimedMilestones) ? data.claimedMilestones : [],
    };
  } catch {
    return { referralCount: 0, claimedMilestones: [] };
  }
}

export async function fetchReferralCount(telegramId: string): Promise<number> {
  const data = await fetchReferralData(telegramId);
  return data.referralCount;
}

export async function checkMilestones(telegramId: string): Promise<{ credited: number; milestonesClaimed: number[] }> {
  try {
    const res = await fetch(`${API_BASE}/referral/check-milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId }),
    });
    if (!res.ok) return { credited: 0, milestonesClaimed: [] };
    return res.json();
  } catch {
    return { credited: 0, milestonesClaimed: [] };
  }
}

export async function syncBalance(params: {
  telegramId: string;
  firstName?: string | null;
  username?: string | null;
  zoomBalance: number;
  tonBalance?: number;
  clientEpoch?: number;
}): Promise<{ zoomBalance: number; tonBalance: number; balanceEpoch: number }> {
  const fallbackTon = typeof params.tonBalance === "number" ? params.tonBalance : 0;
  try {
    const res = await fetch(`${API_BASE}/balance/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return { zoomBalance: params.zoomBalance, tonBalance: fallbackTon, balanceEpoch: params.clientEpoch ?? 0 };
    const data = await res.json();
    return {
      zoomBalance: typeof data.zoomBalance === "number" ? data.zoomBalance : params.zoomBalance,
      tonBalance: typeof data.tonBalance === "number" ? data.tonBalance : fallbackTon,
      balanceEpoch: typeof data.balanceEpoch === "number" ? data.balanceEpoch : (params.clientEpoch ?? 0),
    };
  } catch {
    return { zoomBalance: params.zoomBalance, tonBalance: fallbackTon, balanceEpoch: params.clientEpoch ?? 0 };
  }
}

export interface Grants {
  bonusSlots: number;
  bonusSun: boolean;
  sunCount: number;
  bonusBasic: number;
  bonusRare: number;
  bonusEpic: number;
  bonusGold: number;
  bonusV1: number;
  hasAutoTap: boolean;
  whiteCollectionUnlocked: boolean;
  whiteCollectionBundles: number;
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  tonBalance: number;
  // SUN cycle (24h) — server-side mirror so the cycle survives localStorage
  // loss. 0 means "never started" / fresh state.
  sunFarmStartedAtMs: number;
  sunLastCollectedAtMs: number;
  sunCycleCount: number;
}

const EMPTY_GRANTS: Grants = { bonusSlots: 0, bonusSun: false, sunCount: 0, bonusBasic: 0, bonusRare: 0, bonusEpic: 0, bonusGold: 0, bonusV1: 0, hasAutoTap: false, whiteCollectionUnlocked: false, whiteCollectionBundles: 0, earthCollectionUnlocked: false, earthCollectionBundles: 0, tonBalance: 0, sunFarmStartedAtMs: 0, sunLastCollectedAtMs: 0, sunCycleCount: 0 };

/**
 * Push the current SUN cycle to the server so it persists across
 * localStorage loss. Server merges with GREATEST per field — replaying
 * an older snapshot can never roll back a newer one.
 *
 * Fire-and-forget at the call site: the local state is already updated
 * optimistically. A network failure here just means the user's other
 * devices will see the cycle on the next /grants poll instead of right
 * away — no data loss.
 */
export async function syncSunCycle(params: {
  telegramId: string;
  sunFarmStartedAtMs: number;
  sunLastCollectedAtMs: number;
  sunCycleCount: number;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/sun/cycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch { /* fire-and-forget */ }
}

export interface SunStock {
  sold: number;
  remaining: number;
  max: number;
  maxPerUser: number;
  userCount: number;
}

export async function fetchSunStock(telegramId?: string): Promise<SunStock> {
  try {
    const params = new URLSearchParams({ t: String(Date.now()) });
    if (telegramId) params.set("telegramId", telegramId);
    const res = await fetch(`${API_BASE}/sun/stock?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return { sold: 0, remaining: 50, max: 50, maxPerUser: 5, userCount: 0 };
    return res.json();
  } catch {
    return { sold: 0, remaining: 50, max: 50, maxPerUser: 5, userCount: 0 };
  }
}

export interface TotalPool {
  ton: number;
  stars: number;
  count: number;
}

const EMPTY_TOTAL_POOL: TotalPool = { ton: 0, stars: 0, count: 0 };

/** Aggregated revenue across all confirmed TON + Stars purchases. */
export async function fetchTotalPool(): Promise<TotalPool> {
  try {
    const res = await fetch(`${API_BASE}/total-pool?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return EMPTY_TOTAL_POOL;
    const j = await res.json() as Partial<TotalPool>;
    return {
      ton: Number(j?.ton ?? 0),
      stars: Number(j?.stars ?? 0),
      count: Number(j?.count ?? 0),
    };
  } catch {
    return EMPTY_TOTAL_POOL;
  }
}

export async function fetchGrants(telegramId: string): Promise<Grants> {
  try {
    const res = await fetch(`${API_BASE}/grants/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return EMPTY_GRANTS;
    return res.json();
  } catch {
    return EMPTY_GRANTS;
  }
}

export async function adminCreditZoom(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/credit-zoom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminCreditStardust(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/credit-stardust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveStardust(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-stardust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

// HALL OF FAME — daily-referrals leaderboard.
// Returns top 10 with the prize tier baked in (null for ranks 6-10).
export type HallOfFameEntry = {
  rank: number;
  name: string;
  count: number;
  prize: number | null;
};
export type HallOfFameResponse = {
  dayKey: string;
  prizes: number[];
  entries: HallOfFameEntry[];
};
const EMPTY_HOF: HallOfFameResponse = { dayKey: "", prizes: [100, 75, 50, 25, 25], entries: [] };

export async function fetchHallOfFameDaily(): Promise<HallOfFameResponse> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard/daily-referrals?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return EMPTY_HOF;
    return await res.json();
  } catch {
    return EMPTY_HOF;
  }
}

export async function adminAddPlanets(adminId: string, telegramId: string, count: number, planetType: "BASIC" | "RARE" | "EPIC" | "GOLD" | "SUN"): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/add-planets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, count, planetType }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminUnlockSlots(adminId: string, telegramId: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/unlock-slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, count }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGrantAutoTap(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/grant-auto-tap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminTestWithdrawalChannel(adminId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/test-withdrawal-channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({} as { sent?: boolean }));
    return Boolean(data?.sent);
  } catch { return false; }
}

// === TON Withdrawals (manual processing by admin) ===
export const WITHDRAWAL_MIN_TON = 10;
export const WITHDRAWAL_FEE_TON = 0.02;
export const WITHDRAWAL_COOLDOWN_HOURS = 24;

export interface TonWithdrawal {
  id: number;
  telegramId: string;
  amountTon: number;
  feeTon: number;
  walletAddress: string;
  status: "pending" | "paid" | "rejected";
  txHash: string | null;
  rejectReason: string | null;
  createdAt: string;
  processedAt: string | null;
  processedBy: string | null;
  firstName?: string | null;
  username?: string | null;
}

export async function requestTonWithdrawal(params: { telegramId: string; amountTon: number; walletAddress: string }): Promise<{ ok: boolean; error?: string; newTonBalance?: number; balanceEpoch?: number }> {
  try {
    const res = await fetch(`${API_BASE}/withdrawals/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Errore richiesta" };
    return { ok: true, newTonBalance: data.newTonBalance, balanceEpoch: data.balanceEpoch };
  } catch {
    return { ok: false, error: "Errore di rete" };
  }
}

export async function fetchMyWithdrawals(telegramId: string): Promise<TonWithdrawal[]> {
  try {
    const res = await fetch(`${API_BASE}/withdrawals/me/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.withdrawals) ? data.withdrawals : [];
  } catch { return []; }
}

export async function adminFetchWithdrawals(adminId: string, status: "pending" | "paid" | "rejected" = "pending"): Promise<TonWithdrawal[]> {
  try {
    const res = await fetch(`${API_BASE}/admin/withdrawals?adminId=${encodeURIComponent(adminId)}&status=${status}&t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.withdrawals) ? data.withdrawals : [];
  } catch { return []; }
}

export async function adminApproveWithdrawal(adminId: string, withdrawalId: number, txHash: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/withdrawals/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, withdrawalId, txHash }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Errore" };
    return { ok: true };
  } catch { return { ok: false, error: "Errore di rete" }; }
}

export async function adminRejectWithdrawal(adminId: string, withdrawalId: number, reason?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/withdrawals/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, withdrawalId, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Errore" };
    return { ok: true };
  } catch { return { ok: false, error: "Errore di rete" }; }
}

export async function adminUnlockWhiteCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/unlock-white-collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminUnlockEarthCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/unlock-earth-collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRevokeWhiteCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/revoke-white-collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRevokeEarthCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/revoke-earth-collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGrantV1(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/grant-v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveZoom(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-zoom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemovePlanets(adminId: string, telegramId: string, count: number, planetType: "BASIC" | "RARE" | "EPIC" | "GOLD" | "SUN"): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-planets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, count, planetType }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveSlots(adminId: string, telegramId: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, count }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGlobalBonus(adminId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/global-bonus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminCreditSpins(adminId: string, telegramId: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/credit-spins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, count }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveSpins(adminId: string, telegramId: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-spins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, telegramId, count }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminForceDelist(adminId: string, listingId: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/force-delist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, listingId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminReconcileReferrals(adminId: string): Promise<{ ok: boolean; before?: number; after?: number; delta?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/reconcile-referrals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, before: data?.before, after: data?.after, delta: data?.delta };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function adminResetSeason(adminId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/reset-season`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function fetchSeasonEpoch(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/season/epoch?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data.epoch === "number" ? data.epoch : 0;
  } catch { return 0; }
}

export async function fetchBalance(telegramId: string): Promise<number | null> {
  const data = await fetchBalanceRecord(telegramId);
  return data ? data.zoomBalance : null;
}

export async function fetchBalanceRecord(telegramId: string): Promise<{ zoomBalance: number; exists: boolean; balanceEpoch: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/balance/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.zoomBalance === "number"
      ? { zoomBalance: data.zoomBalance, exists: data.exists !== false, balanceEpoch: typeof data.balanceEpoch === "number" ? data.balanceEpoch : 0 }
      : null;
  } catch {
    return null;
  }
}

export interface LeaderboardEntry {
  rank: number;
  telegramId: string;
  firstName: string;
  zoomBalance: number;
}

export interface StarsCatalogItem {
  id: string;
  title: string;
  description: string;
  starsPrice: number;
  zoomAmount?: number;
  itemType: string;
}

export async function fetchStarsCatalog(): Promise<StarsCatalogItem[]> {
  try {
    const res = await fetch(`${API_BASE}/stars/catalog`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch { return []; }
}

export async function createStarsInvoice(telegramId: string, itemId: string): Promise<{ invoiceUrl?: string; txnId?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/stars/create-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, itemId }),
    });
    return res.json();
  } catch { return { error: "Network error" }; }
}

export async function checkStarsTransaction(txnId: number): Promise<{ status: string; itemId?: string; itemName?: string }> {
  try {
    const res = await fetch(`${API_BASE}/stars/txn/${txnId}`);
    if (!res.ok) return { status: "unknown" };
    return res.json();
  } catch { return { status: "unknown" }; }
}

export async function confirmStarsPurchase(txnId: number, telegramId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/stars/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txnId, telegramId }),
    });
    return res.json();
  } catch { return { ok: false, error: "Network error" }; }
}

export async function confirmTonPurchase(telegramId: string, itemId: string, walletAddress: string, tonAmount: number, boc?: string): Promise<{ ok: boolean; error?: string; pending?: boolean; txnId?: number; alreadyCredited?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/ton/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, itemId, walletAddress, tonAmount, boc }),
    });
    const data = await res.json();
    return { ...data, ok: res.ok || res.status === 202 };
  } catch { return { ok: false, error: "Network error" }; }
}

export interface MysteryBoxStock { sunsAwarded: number; sunsCap: number; sunsRemaining: number }
export interface MysteryBoxActivityItem { id: number; userName: string; award: string; awardLabel: string; openedAt: number }

export async function fetchMysteryBoxStock(): Promise<MysteryBoxStock | null> {
  try {
    const res = await fetch(`${API_BASE}/mystery-box/stock`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function fetchMysteryBoxActivity(limit = 30): Promise<MysteryBoxActivityItem[]> {
  try {
    const res = await fetch(`${API_BASE}/mystery-box/activity?limit=${limit}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch { return []; }
}

export function openMysteryBoxStream(onEvent: (ev: MysteryBoxActivityItem) => void): () => void {
  const url = `${API_BASE}/mystery-box/activity/stream`;
  const es = new EventSource(url);
  es.addEventListener("open", (e: MessageEvent) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ignore */ }
  });
  return () => { try { es.close(); } catch { /* ignore */ } };
}

export async function fetchTxnStatus(txnId: number, telegramId?: string): Promise<{ status: string; itemId?: string; itemName?: string; award?: string | null } | null> {
  try {
    const qs = telegramId ? `?telegramId=${encodeURIComponent(telegramId)}` : "";
    const res = await fetch(`${API_BASE}/stars/txn/${txnId}${qs}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function pollTxnUntilFinal(txnId: number, opts: { maxMs?: number; intervalMs?: number } = {}): Promise<{ status: string; itemName?: string } | null> {
  const maxMs = opts.maxMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 4_000;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = await fetchTxnStatus(txnId);
    if (s && (s.status === "completed" || s.status === "failed")) return s;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export interface UserProfile {
  exists: boolean;
  createdAt?: string;
  crafted?: { BASIC: number; RARE: number; EPIC: number; GOLD: number; V1?: number };
}

export async function fetchProfile(telegramId: string): Promise<UserProfile> {
  try {
    const res = await fetch(`${API_BASE}/profile/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { exists: false };
    return res.json();
  } catch { return { exists: false }; }
}

export async function recordCraft(telegramId: string, planetType: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/craft/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, planetType }),
    });
  } catch { /**/ }
}

export interface WheelPrizeConfig {
  index: number;
  type: "zoom" | "planet" | "stars" | "ton";
  zoomAmount?: number;
  planetType?: "BASIC" | "RARE" | "EPIC";
  starsAmount?: number;
  tonAmount?: number;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
}

export async function fetchWheelConfig(): Promise<WheelPrizeConfig[]> {
  try {
    const res = await fetch(`${API_BASE}/wheel/config`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.prizes) ? data.prizes : [];
  } catch { return []; }
}

export interface WheelStatus {
  spins: number;
  canClaimDaily: boolean;
  nextClaimAt: number;
}

export async function fetchWheelStatus(telegramId: string): Promise<WheelStatus> {
  try {
    const res = await fetch(`${API_BASE}/wheel/status/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { spins: 0, canClaimDaily: false, nextClaimAt: 0 };
    return res.json();
  } catch { return { spins: 0, canClaimDaily: false, nextClaimAt: 0 }; }
}

export async function claimWheelDaily(telegramId: string): Promise<{ ok: boolean; spins?: number; nextClaimAt?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/wheel/claim-daily`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Claim failed", ...data };
    return { ok: true, ...data };
  } catch { return { ok: false, error: "Network error" }; }
}

export interface WheelSpinResult {
  prizeIndex: number;
  prize: {
    type: "zoom" | "planet" | "stars" | "ton";
    zoomAmount?: number;
    planetType?: "BASIC" | "RARE" | "EPIC";
    starsAmount?: number;
    tonAmount?: number;
    label: string;
    color: string;
    icon: string;
  };
  spinsRemaining: number;
}

export interface WheelFeedEntry {
  ts: number;
  name: string;
  prizeLabel: string;
  prizeIcon: string;
  prizeColor: string;
  prizeType: "zoom" | "planet" | "stars" | "ton";
}

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  updatedAt: number;
}

export async function fetchMaintenanceStatus(): Promise<MaintenanceStatus> {
  try {
    const res = await fetch(`${API_BASE}/maintenance/status?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { enabled: false, message: "", updatedAt: 0 };
    return res.json();
  } catch { return { enabled: false, message: "", updatedAt: 0 }; }
}

export async function adminSetMaintenance(adminId: string, enabled: boolean, message?: string): Promise<{ ok: boolean; enabled?: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/maintenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, enabled, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Failed" };
    return { ok: true, ...data };
  } catch { return { ok: false, error: "Network error" }; }
}

export async function fetchWheelFeed(): Promise<WheelFeedEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/wheel/feed?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  } catch { return []; }
}

export async function spinWheel(telegramId: string): Promise<{ ok: boolean; result?: WheelSpinResult; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/wheel/spin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || "Spin failed" };
    }
    return { ok: true, result: await res.json() };
  } catch { return { ok: false, error: "Network error" }; }
}

export interface DailyStatus {
  streakDay: number;
  streakCycle: number;
  lastClaimAt: number;
  nextAvailableAt: number;
  hardResetAt: number;
  canClaim: boolean;
  willHardReset: boolean;
  upcomingDay: number;
  upcomingReward: number;
  cycleMultiplier: number;
  rewardsPreview: number[];
}

export async function fetchDailyStatus(telegramId: string): Promise<DailyStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/daily/status/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function claimDailyReward(telegramId: string, firstName?: string): Promise<{ ok: boolean; reward?: number; day?: number; cycle?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/daily/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, firstName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Claim failed" };
    return { ok: true, ...data };
  } catch { return { ok: false, error: "Network error" }; }
}

export interface MarketSale {
  id: number;
  planetType: "BASIC" | "RARE" | "EPIC" | "GOLD";
  planetRate: number;
  price: number;
  sellerName: string;
  buyerName: string;
  soldAt: number;
}

export async function fetchMarketSales(): Promise<MarketSale[]> {
  try {
    const res = await fetch(`${API_BASE}/market/sales?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.sales) ? data.sales : [];
  } catch { return []; }
}

export function openMarketActivityStream(onSale: (sale: MarketSale) => void): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    try {
      es = new EventSource(`${API_BASE}/market/activity/stream`);
      es.addEventListener("sale", (e) => {
        try { onSale(JSON.parse((e as MessageEvent).data)); } catch { /* */ }
      });
      es.onerror = () => {
        try { es?.close(); } catch { /* */ }
        es = null;
        if (!closed) retry = setTimeout(connect, 3000);
      };
    } catch { if (!closed) retry = setTimeout(connect, 3000); }
  };
  connect();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    try { es?.close(); } catch { /* */ }
  };
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.leaderboard) ? data.leaderboard : [];
  } catch {
    return [];
  }
}

export async function fetchGlobalPool(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/global-pool?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data.totalPool === "number" ? data.totalPool : 0;
  } catch {
    return 0;
  }
}

export interface ServerMarketListing {
  id: number;
  sellerTelegramId: string;
  sellerName: string | null;
  planetType: string;
  planetRate: number;
  price: number;
  status: string;
  createdAt: string;
}

export async function fetchMarketListings(): Promise<ServerMarketListing[]> {
  try {
    const res = await fetch(`${API_BASE}/market/listings?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.listings) ? data.listings : [];
  } catch {
    return [];
  }
}

export async function listOnMarket(params: {
  sellerTelegramId: string;
  sellerName?: string;
  // REQUIRED — the server uses this to verify that the seller actually
  // owns the planet they're trying to list. Sending a wrong/missing id
  // will be rejected with 400 "Planet not found in your inventory".
  planetId: string;
  planetType: string;
  planetRate: number;
  price: number;
}): Promise<{ ok: boolean; listing?: ServerMarketListing; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/market/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    // Surface the server error so the caller can revert local state and
    // show the user a meaningful message ("Planet already listed", "This
    // planet was previously sold", etc) instead of a silent failure.
    if (!res.ok) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : `HTTP ${res.status}` };
    }
    return data;
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function buyFromMarket(buyerTelegramId: string, listingId: number): Promise<{ ok: boolean; planetType?: string; planetRate?: number; pricePaid?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/market/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyerTelegramId, listingId }),
    });
    return res.json();
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function delistFromMarket(sellerTelegramId: string, listingId: number): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/market/delist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellerTelegramId, listingId }),
    });
    return res.json();
  } catch {
    return { ok: false };
  }
}

export async function fetchUserLanguage(telegramId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/user/${encodeURIComponent(telegramId)}/language`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data?.language === "string" ? data.language : null;
  } catch { return null; }
}

export async function setUserLanguage(telegramId: string, language: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/user/language`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, language }),
    });
    return res.ok;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────
// STARDUST — second currency. Backend is source of truth: balance,
// today-counter, daily cap, and global total all live server-side.
// ─────────────────────────────────────────────────────────────────
export interface StardustState {
  balance: number;
  today: number;
  dayKey: string;
  dailyCap: number;
  globalTotal: number;
  hasSun: boolean;
}

const EMPTY_STARDUST: StardustState = {
  balance: 0,
  today: 0,
  dayKey: "",
  dailyCap: 25,
  globalTotal: 0,
  hasSun: false,
};

export async function fetchStardustState(telegramId: string): Promise<StardustState> {
  try {
    const res = await fetch(`${API_BASE}/stardust/state?telegramId=${encodeURIComponent(telegramId)}&t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return EMPTY_STARDUST;
    const j = await res.json();
    return {
      balance: Number(j?.balance ?? 0),
      today: Number(j?.today ?? 0),
      dayKey: String(j?.dayKey ?? ""),
      dailyCap: Number(j?.dailyCap ?? 25),
      globalTotal: Number(j?.globalTotal ?? 0),
      hasSun: !!j?.hasSun,
    };
  } catch {
    return EMPTY_STARDUST;
  }
}

export interface StardustLeaderboardEntry {
  name: string;
  balance: number;
}

export async function fetchStardustLeaderboard(): Promise<StardustLeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/stardust/leaderboard?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json();
    if (!Array.isArray(j?.entries)) return [];
    return j.entries.map((e: any) => ({
      name: String(e?.name ?? "Player"),
      balance: Number(e?.balance ?? 0),
    }));
  } catch {
    return [];
  }
}

export interface StardustCollectResult {
  ok: boolean;
  reason?: "NO_SUN" | "DAILY_CAP" | "USER_NOT_FOUND" | "BAD_REQUEST" | "SERVER_ERROR" | "NETWORK";
  balance: number;
  today: number;
  dailyCap: number;
  globalTotal: number;
}

export async function collectStardustOnServer(telegramId: string): Promise<StardustCollectResult> {
  try {
    const res = await fetch(`${API_BASE}/stardust/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId }),
    });
    const j = await res.json().catch(() => ({}));
    return {
      ok: !!j?.ok,
      reason: j?.reason,
      balance: Number(j?.balance ?? 0),
      today: Number(j?.today ?? 0),
      dailyCap: Number(j?.dailyCap ?? 25),
      globalTotal: Number(j?.globalTotal ?? 0),
    };
  } catch {
    return { ok: false, reason: "NETWORK", balance: 0, today: 0, dailyCap: 25, globalTotal: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────
// SPACE MERCHANT — random alien encounter; backend authoritative for
// spawn cadence (20–50 min) and the 3-fusion-per-visit cap.
// ─────────────────────────────────────────────────────────────────
export interface MerchantState {
  active: boolean;
  expiresAt: string | null;
  fusionsUsed: number;
  maxFusions: number;
  justSpawned?: boolean;
}

const EMPTY_MERCHANT: MerchantState = {
  active: false,
  expiresAt: null,
  fusionsUsed: 0,
  maxFusions: 3,
};

export async function fetchMerchantState(telegramId: string): Promise<MerchantState> {
  try {
    const res = await fetch(`${API_BASE}/merchant/state/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return EMPTY_MERCHANT;
    const j = await res.json();
    return {
      active: !!j?.active,
      expiresAt: typeof j?.expiresAt === "string" ? j.expiresAt : null,
      fusionsUsed: Number(j?.fusionsUsed ?? 0),
      maxFusions: Number(j?.maxFusions ?? 3),
      justSpawned: !!j?.justSpawned,
    };
  } catch {
    return EMPTY_MERCHANT;
  }
}

export type MerchantOutcome = "EXPLOSION" | "BASIC" | "RARE" | "EPIC" | "GOLD" | "V1" | "DOWNGRADE";

export interface MerchantFuseResult {
  ok: boolean;
  outcome?: MerchantOutcome;
  reason?: "EXPIRED_OR_MAX" | "INTERNAL" | "BAD_REQUEST" | "NETWORK";
  fusionsUsed: number;
  fusionsRemaining: number;
  maxFusions: number;
}

// ─────────────────────────────────────────────────────────────────
// COLLECTION PLANETS — server-side persistence of slot placements and
// per-planet farming timers for White & Earth collection planets. Without
// this, a localStorage wipe (PWA reinstall, cache clear, device switch)
// would dump every placed planet back into inventory and erase any
// uncollected farm earnings, which is exactly the bug we're closing.
// ─────────────────────────────────────────────────────────────────
export type CollectionKind = "white" | "earth";

export interface CollectionPlanetState {
  kind: CollectionKind;
  bundleIndex: number;
  subIndex: number;
  slotIndex: number | null;
  isFarmingActive: boolean;
  farmStartedAtMs: number;
  lastCollectedAtMs: number;
}

export async function fetchCollectionPlanets(
  telegramId: string,
): Promise<CollectionPlanetState[]> {
  try {
    const res = await fetch(
      `${API_BASE}/collection-planets/${encodeURIComponent(telegramId)}?t=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const j = await res.json();
    if (!j?.ok || !Array.isArray(j.planets)) return [];
    return j.planets.map((p: Record<string, unknown>) => ({
      kind: p.kind === "earth" ? "earth" : "white",
      bundleIndex: Number(p.bundleIndex ?? 0),
      subIndex: Number(p.subIndex ?? 0),
      slotIndex:
        p.slotIndex == null ? null : Number(p.slotIndex),
      isFarmingActive: !!p.isFarmingActive,
      farmStartedAtMs: Number(p.farmStartedAtMs ?? 0),
      lastCollectedAtMs: Number(p.lastCollectedAtMs ?? 0),
    })) as CollectionPlanetState[];
  } catch {
    return [];
  }
}

export async function upsertCollectionPlanet(
  telegramId: string,
  planet: CollectionPlanetState,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/collection-planets/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, planet }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function bulkSeedCollectionPlanets(
  telegramId: string,
  planets: CollectionPlanetState[],
): Promise<boolean> {
  if (planets.length === 0) return true;
  try {
    const res = await fetch(`${API_BASE}/collection-planets/bulk-seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, planets }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Regular planets (FarmPage main grid) — server-side persistence ───
// Lets the user's planet inventory follow them across devices and survive
// any localStorage wipe. The server stores the array as opaque JSONB and
// also mirrors the per-rarity claimed-bonus counters so applyGrants on a
// fresh device doesn't re-mint bonus planets that were already burned.
export interface RegularPlanetsState {
  // `ok` distinguishes a SUCCESSFUL fetch (with possibly empty/missing data)
  // from a transient FAILURE (network error, 5xx). Callers must NOT enable
  // their server-write gate when ok is false — otherwise a flaky network
  // could silently clobber the server inventory with a stale local snapshot.
  ok: boolean;
  // True if the user row exists on the server. False both for new users and
  // for failed fetches (check `ok` first to disambiguate).
  exists: boolean;
  // Uses `unknown` here so we don't pull the full Planet type into the
  // utils layer; the caller (useGameState) re-shapes these into Planet[].
  planets: Array<Record<string, unknown>>;
  claimedBonusBasic: number;
  claimedBonusRare: number;
  claimedBonusEpic: number;
  claimedBonusGold: number;
  claimedBonusV1: number;
}

export async function fetchRegularPlanets(
  telegramId: string,
): Promise<RegularPlanetsState> {
  const failure: RegularPlanetsState = {
    ok: false,
    exists: false,
    planets: [],
    claimedBonusBasic: 0,
    claimedBonusRare: 0,
    claimedBonusEpic: 0,
    claimedBonusGold: 0,
    claimedBonusV1: 0,
  };
  try {
    const res = await fetch(
      `${API_BASE}/regular-planets/${encodeURIComponent(telegramId)}?t=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!res.ok) return failure;
    const j = await res.json();
    if (!j?.ok) return failure;
    return {
      ok: true,
      exists: !!j.exists,
      planets: Array.isArray(j.planets) ? j.planets : [],
      claimedBonusBasic: Number(j.claimedBonusBasic ?? 0),
      claimedBonusRare: Number(j.claimedBonusRare ?? 0),
      claimedBonusEpic: Number(j.claimedBonusEpic ?? 0),
      claimedBonusGold: Number(j.claimedBonusGold ?? 0),
      claimedBonusV1: Number(j.claimedBonusV1 ?? 0),
    };
  } catch {
    return failure;
  }
}

export async function saveRegularPlanets(
  telegramId: string,
  planets: Array<Record<string, unknown>>,
  claimed: {
    basic: number;
    rare: number;
    epic: number;
    gold: number;
    v1: number;
  },
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/regular-planets/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramId,
        planets,
        // Monotonic write-time the server uses to fence stale saves. Date.now()
        // within a single client session is strictly increasing; across
        // devices the millisecond resolution is enough to order writes
        // correctly in practice.
        clientWriteAtMs: Date.now(),
        claimedBonusBasic: claimed.basic,
        claimedBonusRare: claimed.rare,
        claimedBonusEpic: claimed.epic,
        claimedBonusGold: claimed.gold,
        claimedBonusV1: claimed.v1,
      }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function merchantFuse(telegramId: string, level: 1 | 2): Promise<MerchantFuseResult> {
  try {
    const res = await fetch(`${API_BASE}/merchant/fuse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, level }),
    });
    const j = await res.json().catch(() => ({}));
    return {
      ok: !!j?.ok,
      outcome: j?.outcome,
      reason: j?.reason,
      fusionsUsed: Number(j?.fusionsUsed ?? 0),
      fusionsRemaining: Number(j?.fusionsRemaining ?? 0),
      maxFusions: Number(j?.maxFusions ?? 3),
    };
  } catch {
    return { ok: false, reason: "NETWORK", fusionsUsed: 0, fusionsRemaining: 0, maxFusions: 3 };
  }
}
