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

export async function fetchServerTime(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/time?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return Date.now();
    const data = await res.json();
    return typeof data.serverTime === "number" ? data.serverTime : Date.now();
  } catch {
    return Date.now();
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
  hasAutoTap: boolean;
  whiteCollectionUnlocked: boolean;
  whiteCollectionBundles: number;
  tonBalance: number;
}

const EMPTY_GRANTS: Grants = { bonusSlots: 0, bonusSun: false, sunCount: 0, bonusBasic: 0, bonusRare: 0, bonusEpic: 0, bonusGold: 0, hasAutoTap: false, whiteCollectionUnlocked: false, whiteCollectionBundles: 0, tonBalance: 0 };

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
  crafted?: { BASIC: number; RARE: number; EPIC: number; GOLD: number };
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
  planetType: string;
  planetRate: number;
  price: number;
}): Promise<{ ok: boolean; listing?: ServerMarketListing }> {
  try {
    const res = await fetch(`${API_BASE}/market/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  } catch {
    return { ok: false };
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
