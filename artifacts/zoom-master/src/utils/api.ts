const API_BASE = `${window.location.origin}/api`;

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
