const API_BASE = `${window.location.origin}/api`;

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

export async function fetchReferralCount(telegramId: string): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/referral/${encodeURIComponent(telegramId)}`);
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data.referralCount === "number" ? data.referralCount : 0;
  } catch {
    return 0;
  }
}

export async function syncBalance(params: {
  telegramId: string;
  firstName?: string | null;
  zoomBalance: number;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/balance/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch { /**/ }
}

export interface Grants {
  bonusSlots: number;
  bonusSun: boolean;
  bonusBasic: number;
  bonusRare: number;
  bonusEpic: number;
  bonusGold: number;
}

const EMPTY_GRANTS: Grants = { bonusSlots: 0, bonusSun: false, bonusBasic: 0, bonusRare: 0, bonusEpic: 0, bonusGold: 0 };

export async function fetchGrants(telegramId: string): Promise<Grants> {
  try {
    const res = await fetch(`${API_BASE}/grants/${encodeURIComponent(telegramId)}`);
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

export interface LeaderboardEntry {
  rank: number;
  telegramId: string;
  firstName: string;
  zoomBalance: number;
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
