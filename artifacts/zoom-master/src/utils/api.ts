const API_BASE = `${window.location.origin}/api`;

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
): Promise<{ ok: boolean; isNew: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/referral/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, referredBy: referredBy ?? undefined }),
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
  zoomBalance: number;
}): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/balance/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return params.zoomBalance;
    const data = await res.json();
    return typeof data.zoomBalance === "number" ? data.zoomBalance : params.zoomBalance;
  } catch {
    return params.zoomBalance;
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
}

const EMPTY_GRANTS: Grants = { bonusSlots: 0, bonusSun: false, sunCount: 0, bonusBasic: 0, bonusRare: 0, bonusEpic: 0, bonusGold: 0 };

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

export async function fetchBalanceRecord(telegramId: string): Promise<{ zoomBalance: number; exists: boolean } | null> {
  try {
    const res = await fetch(`${API_BASE}/balance/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.zoomBalance === "number"
      ? { zoomBalance: data.zoomBalance, exists: data.exists !== false }
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

export async function confirmTonPurchase(telegramId: string, itemId: string, walletAddress: string, tonAmount: number, boc?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/ton/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, itemId, walletAddress, tonAmount, boc }),
    });
    return res.json();
  } catch { return { ok: false, error: "Network error" }; }
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
