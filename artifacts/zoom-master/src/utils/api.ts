export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  `${window.location.origin}/api`;

/**
 * Read the raw Telegram WebApp `initData` query string, which the server
 * verifies via HMAC-SHA256 against the bot's secret token. When the page
 * is opened outside Telegram (e.g. local browser testing) this is empty —
 * the server's `TG_AUTH_MODE=soft` default lets those requests through
 * with a logged warning so we don't break dev or in-flight clients during
 * a deploy. Once we flip to `strict` server-side, those requests will be
 * rejected with 401, but only after we verify in logs that all clients
 * are sending this header reliably.
 */
function getInitData(): string {
  try {
    const w = window as unknown as { Telegram?: { WebApp?: { initData?: string } } };
    return w.Telegram?.WebApp?.initData ?? "";
  } catch {
    return "";
  }
}

/**
 * Build the standard headers for a JSON POST. Always includes
 * `Content-Type: application/json`. When Telegram WebApp `initData` is
 * available, also includes `X-Telegram-Init-Data` so the server can
 * verify the caller's identity. Use this everywhere instead of the bare
 * `{ "Content-Type": "application/json" }` literal.
 */
export function apiHeaders(): Record<string, string> {
  const initData = getInitData();
  return initData
    ? { "Content-Type": "application/json", "X-Telegram-Init-Data": initData }
    : { "Content-Type": "application/json" };
}

/**
 * Build a request body that embeds initData as `_initData`. Used for
 * `navigator.sendBeacon` paths that can't set custom headers — the
 * server middleware accepts this body field as a fallback when the
 * header is absent.
 */
export function withInitData<T extends Record<string, unknown>>(body: T): T & { _initData?: string } {
  const initData = getInitData();
  return initData ? { ...body, _initData: initData } : body;
}

/** Map server JSON errors to user-visible messages (convert, stake, shop, etc.). */
function parseApiError(data: unknown, httpStatus: number, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string" && d.error) {
      if (d.error === "TG_AUTH_REQUIRED") return "Apri di nuovo da Telegram per autorizzare";
      if (d.error === "TG_USER_MISMATCH") return "Sessione non valida — riapri l'app da Telegram";
      if (d.error === "SERVER_ERROR") return "Errore server — riprova tra poco";
      return d.error;
    }
    if (typeof d.reason === "string" && d.reason) return d.reason;
  }
  if (httpStatus === 404) return "Funzione non ancora attiva sul server (404)";
  if (httpStatus === 401 || httpStatus === 403) return "Non autorizzato — riapri da Telegram";
  if (httpStatus === 503) return "Server in aggiornamento — riprova tra 1 minuto";
  return `${fallback} (${httpStatus})`;
}

/**
 * Tell the server a planet started farming. The server uses this to
 * schedule the "Farm full" Telegram notification 24h later. Fire-and-forget
 * — failures are silently ignored so a network blip never blocks gameplay.
 */
export function notifyFarmStart(telegramId: string, planetId: string, planetType: string, isWhite = false, farmDurationHours = 1): void {
  if (!telegramId || !planetId) return;
  fetch(`${API_BASE}/farm/start`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ telegramId, planetId, planetType, isWhite, farmDurationHours }),
    keepalive: true,
  }).catch(() => { /* ignore */ });
}

/**
 * Reactivate an expired planet's farm cycle by spending 1 REDSTAR.
 * Server validates the REDSTAR balance, deducts it, and resets the cycle.
 */
export function notifyFarmReactivate(telegramId: string, planetId: string, planetType: string, farmDurationHours = 1): void {
  if (!telegramId || !planetId) return;
  fetch(`${API_BASE}/farm/reactivate`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ telegramId, planetId, planetType, farmDurationHours }),
    keepalive: true,
  }).catch(() => { /* ignore */ });
}

/**
 * Permanently upgrade a planet's farm duration (stored in planetsJson).
 * Costs the listed GRAM amount from the user's ton_balance deposit.
 */
/**
 * Reactivate `count` collection-planet slots by spending `count` REDSTARs.
 * Validates and deducts server-side; returns the new redStarBalance on success.
 */
/**
 * Permanently upgrade farm-cycle duration for ALL collection planets.
 * Charges GRAM from EARNED GRAM (ton_balance).
 */
export async function upgradeCollectionDuration(
  telegramId: string,
  collectionType: "white" | "earth" | "black" | "supernova" | "stella_rossa",
  durationHours: number,
): Promise<{ ok: boolean; newTonBalance?: number; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/collection/upgrade-duration`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, collectionType, durationHours }),
    });
    return await r.json() as { ok: boolean; newTonBalance?: number; error?: string };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/**
 * Permanently upgrade the SUN's farm-cycle duration. Charges GRAM from the
 * user's EARNED GRAM (ton_balance). Returns the new balance on success.
 */
export async function upgradeSunDuration(
  telegramId: string,
  durationHours: number,
): Promise<{ ok: boolean; newTonBalance?: number; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/sun/upgrade-duration`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, durationHours }),
    });
    return await r.json() as { ok: boolean; newTonBalance?: number; error?: string };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function reactivateCollectionWithRedStar(
  telegramId: string,
  count: number,
): Promise<{ ok: boolean; newRedStarBalance?: number; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/collection/reactivate`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, count }),
    });
    return await r.json() as { ok: boolean; newRedStarBalance?: number; error?: string };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function upgradeFarmDuration(
  telegramId: string,
  planetId: string,
  durationHours: number,
  planet?: Record<string, unknown> | null,
): Promise<{ ok: boolean; newTonBalance?: number; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/farm/upgrade-duration`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, planetId, durationHours, ...(planet ? { planet } : {}) }),
    });
    return await r.json() as { ok: boolean; newTonBalance?: number; error?: string };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/**
 * Stamp the planet's cycle as collected so the server's cron skips the
 * "Farm full" notification (the user is clearly still engaged).
 */
export function notifyFarmCollect(telegramId: string, planetId: string): void {
  if (!telegramId || !planetId) return;
  fetch(`${API_BASE}/farm/collect`, {
    method: "POST",
    headers: apiHeaders(),
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
    headers: apiHeaders(),
    body: JSON.stringify({ telegramId, planetId }),
    keepalive: true,
  }).catch(() => { /* ignore */ });
}

/**
 * Server-authoritative offline farming settlement.
 *
 * Reads the user's persisted planets + SUN cycle on the server and credits
 * any $ZOOM that accrued since the last server-side settle (capped at the
 * standard 24h farm / 24h collect window, exactly like the client-side
 * `settleFarmingState`). Idempotent — the server uses GREATEST() on the
 * watermark so concurrent / repeated calls never double-credit the same
 * elapsed period.
 *
 * Returns `exists:false credited:0` if the user row doesn't exist yet
 * (lazy-created by `/balance/sync` on first sync); the caller should just
 * proceed normally — nothing was changed server-side.
 *
 * `clientLastSettledAtMs` is an OPTIONAL floor for the watermark. It lets
 * legacy devices that have been crediting offline accrual locally pass
 * their own watermark, so the very first server-side settle for that user
 * cannot accidentally credit a period the client has already credited.
 * Migration-safe by construction: no existing balance is ever decreased.
 */
export async function settleOfflineFarming(params: {
  telegramId: string;
  clientLastSettledAtMs?: number;
}): Promise<{
  ok: boolean;
  exists: boolean;
  credited: number;
  balance: number;
  balanceEpoch: number;
  settledAtMs: number;
}> {
  const fallback = {
    ok: false,
    exists: false,
    credited: 0,
    balance: 0,
    balanceEpoch: 0,
    settledAtMs: Date.now(),
  };
  if (!params.telegramId) return fallback;
  try {
    const r = await fetch(`${API_BASE}/farm/settle`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        telegramId: params.telegramId,
        clientLastSettledAtMs: Math.max(0, Math.floor(params.clientLastSettledAtMs ?? 0)),
      }),
    });
    if (!r.ok) return fallback;
    const j = (await r.json()) as Record<string, unknown>;
    return {
      ok: !!j["ok"],
      exists: !!j["exists"],
      credited: Math.max(0, Number(j["credited"] ?? 0)),
      balance: Math.max(0, Number(j["balance"] ?? 0)),
      balanceEpoch: Math.max(0, Number(j["balanceEpoch"] ?? 0)),
      settledAtMs: Math.max(0, Number(j["settledAtMs"] ?? Date.now())),
    };
  } catch {
    return fallback;
  }
}

/**
 * Permanently consume one bonus-planet entitlement on the server when the
 * user burns a planet that was originally granted by the server (id starts
 * with `bonus-`). Without this, the next /grants sync would re-grant the
 * same planet because the entitlement counter is still > claimed.
 */
export function notifyPlanetBurn(telegramId: string, planetType: "BASIC" | "RARE" | "EPIC" | "MYTHIC" | "PLASMA" | "GOLD" | "V1" | "V1_NFT" | "SUN" | "WHITE1" | "WHITE2" | "WHITE3" | "WHITE4" | "EARTH1" | "EARTH2" | "EARTH3" | "EARTH4" | "BLACK1" | "BLACK2" | "BLACK3" | "BLACK4"): void {
  if (!telegramId) return;
  fetch(`${API_BASE}/planets/burn`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ telegramId, planetType }),
    keepalive: true,
  }).catch(() => { /* ignore */ });
}

// ─── Planet rename ────────────────────────────────────────────────────
// Asks the server to set `displayName` on one of the user's regular
// planets and debit the corresponding stardust cost (100 for "random",
// 500 for "custom"). The server is the source of truth: it re-validates
// the name (length, charset, profanity) and atomically applies the
// debit + the planets_json mutation, then returns the new stardust
// balance the client should adopt.
export type RenamePlanetMode = "random" | "custom";
export type RenamePlanetResult =
  | { ok: true; displayName: string; stardustBalance: number; cost: number; mode: RenamePlanetMode }
  | { ok: false; error: string; code?: string; have?: number; need?: number };

export async function renamePlanet(
  telegramId: string,
  planetId: string,
  mode: RenamePlanetMode,
  // `name` is REQUIRED for mode:"custom" and IGNORED for mode:"random"
  // (the server generates the name itself in random mode so users can't
  // buy a custom name at the random price).
  name: string,
): Promise<RenamePlanetResult> {
  try {
    const body = mode === "custom"
      ? { telegramId, planetId, mode, name }
      : { telegramId, planetId, mode };
    const res = await fetch(`${API_BASE}/planets/rename`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        error: typeof json?.error === "string" ? json.error : `HTTP ${res.status}`,
        code: typeof json?.code === "string" ? json.code : undefined,
        have: typeof json?.have === "number" ? json.have : undefined,
        need: typeof json?.need === "number" ? json.need : undefined,
      };
    }
    return {
      ok: true,
      displayName: String(json.displayName),
      stardustBalance: Number(json.stardustBalance ?? 0),
      cost: Number(json.cost ?? 0),
      mode,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
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
      headers: apiHeaders(),
      body: JSON.stringify(data),
    });
  } catch { /**/ }
}

export async function registerUser(
  telegramId: string,
  referredBy?: string | null,
  firstName?: string | null,
  username?: string | null,
  photoUrl?: string | null,
): Promise<{ ok: boolean; isNew: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/referral/register`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        telegramId,
        referredBy: referredBy ?? undefined,
        firstName: firstName ?? undefined,
        username: username ?? undefined,
        photoUrl: photoUrl ?? undefined,
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

export interface InvitedFriend {
  /** Per-host stable opaque key (sha256 of host_id:friend_id, truncated).
   *  Safe to use as React key and to derive a deterministic palette/spot
   *  on the client. NOT a real telegramId — cannot be reversed. */
  key: string;
  /** Short display name (first_name fallback @username, max 16 chars). */
  name: string;
  /** ISO timestamp of when the friend created their account (server
   *  authoritative). The HOME view uses this to auto-hide the friend
   *  astronaut after a fixed visit window. */
  joinedAt: string;
}

/** List of users who joined via the CALLING user's referral link. Auth
 *  comes from Telegram initData headers attached by apiHeaders(); the
 *  server returns the friends of `req.tgUser.id` only. */
export async function fetchReferralFriends(): Promise<InvitedFriend[]> {
  try {
    const res = await fetch(`${API_BASE}/referral/friends`, {
      cache: "no-store",
      headers: apiHeaders(),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { friends?: InvitedFriend[] };
    return j.friends ?? [];
  } catch {
    return [];
  }
}

// ─── Room invites (peer-to-peer "visit my room" between existing players)
//
// Distinct from the Telegram referral system: referrals onboard NEW
// users via a Telegram start_param link, room invites bring ALREADY
// REGISTERED players into your room for a 30-min visit. Both sources
// are merged client-side and rendered the same way.

export interface RoomInviteInbox {
  /** Server-side row id; pass back to /room-invites/respond. */
  id: number;
  /** Sender's display name (first_name fallback @username). No raw
   *  telegramId or @username is exposed on this endpoint. */
  from: string;
  /** ISO timestamp of when the invite was sent. */
  sentAt: string;
}

export type SendRoomInviteResult =
  | { ok: true; inviteId: number | null }
  | { ok: false; error: "user_not_found" | "ambiguous_username" | "cannot_invite_self" | "cooldown" | "too_many_pending" | "invalid_username" | "network"; waitSeconds?: number };

export async function sendRoomInvite(telegramId: string, toUsername: string): Promise<SendRoomInviteResult> {
  try {
    const res = await fetch(`${API_BASE}/room-invites/send`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, toUsername }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; inviteId?: number | null; error?: string; waitSeconds?: number };
    if (res.ok && j.ok) return { ok: true, inviteId: j.inviteId ?? null };
    const err = (j.error as SendRoomInviteResult extends { error: infer E } ? E : never) || "network";
    return { ok: false, error: err, ...(j.waitSeconds ? { waitSeconds: j.waitSeconds } : {}) };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function fetchRoomInviteInbox(): Promise<RoomInviteInbox[]> {
  try {
    const res = await fetch(`${API_BASE}/room-invites/inbox`, {
      cache: "no-store",
      headers: apiHeaders(),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { invites?: RoomInviteInbox[] };
    return j.invites ?? [];
  } catch {
    return [];
  }
}

export async function respondRoomInvite(telegramId: string, inviteId: number, action: "accept" | "decline"): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/room-invites/respond`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, inviteId, action }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRoomVisitors(): Promise<InvitedFriend[]> {
  try {
    const res = await fetch(`${API_BASE}/room-invites/visitors`, {
      cache: "no-store",
      headers: apiHeaders(),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { visitors?: InvitedFriend[] };
    return j.visitors ?? [];
  } catch {
    return [];
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
      headers: apiHeaders(),
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
  photoUrl?: string | null;
  zoomBalance: number;
  tonBalance?: number;
  stardustBalance?: number;
  redStarBalance?: number;
  clientEpoch?: number;
}): Promise<{ zoomBalance: number; tonBalance: number; stardustBalance: number; redStarBalance: number; balanceEpoch: number }> {
  const fallbackTon = typeof params.tonBalance === "number" ? params.tonBalance : 0;
  try {
    const res = await fetch(`${API_BASE}/balance/sync`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) return { zoomBalance: params.zoomBalance, tonBalance: fallbackTon, stardustBalance: params.stardustBalance ?? 0, redStarBalance: params.redStarBalance ?? 0, balanceEpoch: params.clientEpoch ?? 0 };
    const data = await res.json();
    return {
      zoomBalance: typeof data.zoomBalance === "number" ? data.zoomBalance : params.zoomBalance,
      tonBalance: typeof data.tonBalance === "number" ? data.tonBalance : fallbackTon,
      stardustBalance: typeof data.stardustBalance === "number" ? data.stardustBalance : (params.stardustBalance ?? 0),
      redStarBalance: typeof data.redStarBalance === "number" ? data.redStarBalance : (params.redStarBalance ?? 0),
      balanceEpoch: typeof data.balanceEpoch === "number" ? data.balanceEpoch : (params.clientEpoch ?? 0),
    };
  } catch {
    return { zoomBalance: params.zoomBalance, tonBalance: fallbackTon, stardustBalance: params.stardustBalance ?? 0, redStarBalance: params.redStarBalance ?? 0, balanceEpoch: params.clientEpoch ?? 0 };
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
  bonusMythic: number;
  bonusNova: number;
  bonusPlasma: number;
  bonusV1: number;
  bonusV1NftPlatinum: number;
  hasAutoTap: boolean;
  whiteCollectionUnlocked: boolean;
  whiteCollectionBundles: number;
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  blackCollectionUnlocked: boolean;
  blackCollectionBundles: number;
  supernovaCollectionUnlocked: boolean;
  supernovaCollectionBundles: number;
  stellaRossaCollectionUnlocked: boolean;
  stellaRossaCollectionBundles: number;
  // Total planets ever crafted — used to initialize the client-side
  // craftsCompleted counter so the leaderboard delta is correct after reload.
  totalPlanetsBuilt: number;
  // EARNED TON balance — credited by staking accrual, collection-planet
  // collections, admin /credit-ton, and withdrawal refunds. WITHDRAWABLE.
  tonBalance: number;
  // DEPOSIT TON balance — credited by external TonConnect deposits via
  // /ton/deposit/confirm. SPENDABLE in the Shop ONLY. Never withdrawable.
  depositBalance: number;
  // SUN cycle (24h) — server-side mirror so the cycle survives localStorage
  // loss. 0 means "never started" / fresh state.
  sunFarmStartedAtMs: number;
  sunLastCollectedAtMs: number;
  sunCycleCount: number;
  // Permanent SUN farm-duration upgrade (hours). Defaults to 1 on server.
  sunFarmDurationHours?: number;
  // Shared farm-duration upgrade for ALL collection planets (hours, legacy).
  collectionFarmDurationHours?: number;
  // Per-collection farm-duration upgrades (hours, each independent).
  whiteFarmDurationHours?: number;
  earthFarmDurationHours?: number;
  blackFarmDurationHours?: number;
  supernovaFarmDurationHours?: number;
  stellaRossaFarmDurationHours?: number;
  // Weekly REDSTAR bonus (7-day cycle, 5/day).
  weeklyRedStarDay?: number;
  weeklyRedStarClaimedToday?: boolean;
  weeklyRedStarReward?: number;
}

const EMPTY_GRANTS: Grants = { bonusSlots: 0, bonusSun: false, sunCount: 0, bonusBasic: 0, bonusRare: 0, bonusEpic: 0, bonusGold: 0, bonusMythic: 0, bonusNova: 0, bonusPlasma: 0, bonusV1: 0, bonusV1NftPlatinum: 0, hasAutoTap: false, whiteCollectionUnlocked: false, whiteCollectionBundles: 0, earthCollectionUnlocked: false, earthCollectionBundles: 0, blackCollectionUnlocked: false, blackCollectionBundles: 0, supernovaCollectionUnlocked: false, supernovaCollectionBundles: 0, stellaRossaCollectionUnlocked: false, stellaRossaCollectionBundles: 0, totalPlanetsBuilt: 0, tonBalance: 0, depositBalance: 0, sunFarmStartedAtMs: 0, sunLastCollectedAtMs: 0, sunCycleCount: 0, sunFarmDurationHours: 1, collectionFarmDurationHours: 1, whiteFarmDurationHours: 1, earthFarmDurationHours: 1, blackFarmDurationHours: 1, supernovaFarmDurationHours: 1, stellaRossaFarmDurationHours: 1, weeklyRedStarDay: 1, weeklyRedStarClaimedToday: false, weeklyRedStarReward: 5 };

/**
 * Claim the daily REDSTAR bonus (5 ★ per day, 7-day cycle).
 */
export async function claimWeeklyRedStar(
  telegramId: string,
): Promise<{ ok: boolean; cycleDay?: number; reward?: number; newRedStarBalance?: number; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/earn/weekly-redstar/claim`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId }),
    });
    return await r.json() as { ok: boolean; cycleDay?: number; reward?: number; newRedStarBalance?: number; error?: string };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function fetchWeeklyRedStarStatus(
  telegramId: string,
): Promise<{ ok: boolean; cycleDay?: number; claimedToday?: boolean; canClaim?: boolean; reward?: number; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/earn/weekly-redstar/status?telegramId=${encodeURIComponent(telegramId)}`, {
      headers: apiHeaders(),
    });
    return await r.json() as { ok: boolean; cycleDay?: number; claimedToday?: boolean; canClaim?: boolean; reward?: number; error?: string };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/** @deprecated Ads removed — use claimWeeklyRedStar */
export async function recordAdWatched(
  telegramId: string,
): Promise<{ ok: boolean; newCount?: number; newRedStarBalance?: number; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/ads/watched`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId }),
    });
    return await r.json() as { ok: boolean; newCount?: number; newRedStarBalance?: number; error?: string };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/**
 * Buy a Shop item using the in-game DEPOSIT balance (not on-chain).
 * The server atomically debits depositBalance and grants the entitlement.
 */
export async function buyShopItemFromDeposit(
  telegramId: string,
  itemId: string,
  meta?: unknown,
): Promise<{ ok: boolean; txnId?: number; itemName?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/shop/buy-deposit`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, itemId, meta }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `Purchase failed (${res.status})` };
    return { ok: true, txnId: data.txnId, itemName: data.itemName };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function buyShopItemFromStardust(
  telegramId: string,
  itemId: string,
  meta?: unknown,
): Promise<{ ok: boolean; txnId?: number; itemName?: string; stardustSpent?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/shop/buy-stardust`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(withInitData({ telegramId, itemId, meta })),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `Purchase failed (${res.status})` };
    return { ok: true, txnId: data.txnId, itemName: data.itemName, stardustSpent: data.stardustSpent };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function convertDepositToStardust(
  telegramId: string,
  gramAmount: number,
): Promise<{
  ok: boolean;
  stardustReceived?: number;
  depositBalance?: number;
  tonBalance?: number;
  stardustBalance?: number;
  balanceEpoch?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/stardust/convert-deposit`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(withInitData({ telegramId, gramAmount })),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: parseApiError(data, res.status, "Conversion failed") };
    }
    return {
      ok: true,
      stardustReceived: data.stardustReceived,
      depositBalance: data.depositBalance,
      tonBalance: data.tonBalance,
      stardustBalance: data.stardustBalance,
      balanceEpoch: data.balanceEpoch,
    };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function convertStardustToGram(
  telegramId: string,
  stardustAmount: number,
): Promise<{
  ok: boolean;
  gramReceived?: number;
  stardustSpent?: number;
  depositBalance?: number;
  tonBalance?: number;
  stardustBalance?: number;
  spread?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/stardust/convert-to-gram`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(withInitData({ telegramId, stardustAmount })),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: parseApiError(data, res.status, "Conversion failed") };
    }
    return {
      ok: true,
      gramReceived: data.gramReceived,
      stardustSpent: data.stardustSpent,
      depositBalance: data.depositBalance,
      tonBalance: data.tonBalance,
      stardustBalance: data.stardustBalance,
      spread: data.spread,
    };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/**
 * Push the current SUN cycle to the server so it persists across
 * localStorage loss. Server merges with GREATEST per field — replaying
 * an older snapshot can never roll back a newer one.
 *
 * Fire-and-forget at the call site: the local state is already updated
 * optimistically. We attempt the write up to 3 times (immediate, +3s, +8s)
 * because losing this write silently rolls the cycle back to "Farming
 * paused" the next time the user reopens after a localStorage wipe (e.g.
 * Telegram WebView clears its cache, especially on iOS). The server
 * endpoint uses GREATEST() merge so duplicate writes are fully idempotent
 * — replaying the same payload can never roll back newer state. If a
 * later attempt succeeds after an earlier one, we short-circuit so we
 * don't spam the server unnecessarily.
 */
export async function syncSunCycle(params: {
  telegramId: string;
  sunFarmStartedAtMs: number;
  sunLastCollectedAtMs: number;
  sunCycleCount: number;
}): Promise<void> {
  let succeeded = false;
  const attempt = async (): Promise<void> => {
    if (succeeded) return;
    try {
      const res = await fetch(`${API_BASE}/sun/cycle`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(params),
      });
      if (res.ok) succeeded = true;
    } catch { /* network — let the next retry try */ }
  };
  await attempt();
  if (succeeded) return;
  setTimeout(() => { void attempt(); }, 3000);
  setTimeout(() => { void attempt(); }, 8000);
}

export interface V1NftPlatinumStock {
  sold: number;
  remaining: number;
  max: number;
}

export async function fetchV1NftPlatinumStock(): Promise<V1NftPlatinumStock> {
  try {
    const res = await fetch(`${API_BASE}/v1-nft-platinum/stock?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { sold: 0, remaining: 5, max: 5 };
    return res.json();
  } catch {
    return { sold: 0, remaining: 5, max: 5 };
  }
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

/**
 * Fetch the user's server-side grants (bonus SUN, slot bonuses, autoTap,
 * collection bundles, SUN cycle timestamps, etc).
 *
 * Returns `null` on network/HTTP failure — NOT an empty grants object.
 * This distinction is critical: callers must NOT treat a transient failure
 * as authoritative "user has nothing", because the destructive branches in
 * applyGrants (SUN reset when claimedBonusSun=true but bonusSun=false,
 * collection bundle revoke when server count drops to 0, slot bonus reset,
 * etc) would then silently wipe state that's actually still owned.
 *
 * Callers should `if (grants) applyGrants(grants)` and otherwise leave
 * local state untouched — the next successful poll will re-converge.
 */
export interface SlotPriceInfo {
  bonusSlots: number;
  nextPriceTon: number;
  ladder: number[];
  maxPriceTon: number;
}
export async function fetchSlotPrice(telegramId: string): Promise<SlotPriceInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/shop/slot-price/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as SlotPriceInfo;
  } catch {
    return null;
  }
}

export async function fetchGrants(telegramId: string): Promise<Grants | null> {
  try {
    const res = await fetch(`${API_BASE}/grants/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function adminCreditZoom(adminId: string, telegramId: string, amount: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/credit-zoom`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(withInitData({ adminId, telegramId, amount })),
    });
    const json = await res.json().catch(() => ({} as { error?: string; reason?: string }));
    if (!res.ok) return { ok: false, error: json.error || json.reason || `HTTP ${res.status}` };
    return { ok: true };
  } catch { return { ok: false, error: "Network error" }; }
}

export async function adminDisableUser(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/disable-user`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminEnableUser(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/enable-user`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminBulkDisable(
  adminId: string,
  telegramIds: string[],
): Promise<{ ok: boolean; disabled: number }> {
  try {
    const res = await fetch(`${API_BASE}/admin/bulk-disable`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramIds }),
    });
    if (!res.ok) return { ok: false, disabled: 0 };
    const data = await res.json() as { ok: boolean; disabled: number };
    return { ok: !!data.ok, disabled: Number(data.disabled) || 0 };
  } catch { return { ok: false, disabled: 0 }; }
}

export async function adminCreditStardust(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/credit-stardust`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminCreditTon(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/credit-ton`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveTon(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-ton`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveStardust(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-stardust`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminCreditLabPoints(adminId: string, telegramId: string, points: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/lab-rank/credit-points`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, points }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveLabPoints(adminId: string, telegramId: string, points: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/lab-rank/remove-points`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, points }),
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

// ─── PvP DAILY LEADERBOARD ────────────────────────────────────────────
export type PvpLeaderboardEntry = {
  rank: number;
  telegramId: string;
  name: string;
  photoUrl: string | null;
  points: number;
  prize: number | null;
};
export type PvpLeaderboardMe = {
  rank: number | null;
  points: number;
};
export type PvpLeaderboardResponse = {
  dayKey: string;
  prizes: number[];
  entries: PvpLeaderboardEntry[];
  me: PvpLeaderboardMe | null;
};
const PVP_LB_PRIZES = [10, 7, 5, 4, 3, 2, 2, 1, 1, 1];
const EMPTY_PVP_LB: PvpLeaderboardResponse = { dayKey: "", prizes: PVP_LB_PRIZES, entries: [], me: null };

export interface PvpLobbyEntry {
  telegramId: string;
  username?: string;
  planet: { id: string; name: string; rarity: string; rate: number; float?: number | null };
  joinedAt: number;
}
export interface PvpLobbyResponse {
  ok: boolean;
  count: number;
  entries: PvpLobbyEntry[];
}

export async function fetchPvpLobby(): Promise<PvpLobbyResponse> {
  try {
    const res = await fetch(`${API_BASE}/pvp/lobby?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, count: 0, entries: [] };
    return await res.json();
  } catch {
    return { ok: false, count: 0, entries: [] };
  }
}

export async function fetchPvpLeaderboard(telegramId?: string | null): Promise<PvpLeaderboardResponse> {
  try {
    const q = telegramId ? `telegramId=${encodeURIComponent(telegramId)}&` : "";
    const res = await fetch(`${API_BASE}/pvp/leaderboard?${q}t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return EMPTY_PVP_LB;
    return await res.json();
  } catch {
    return EMPTY_PVP_LB;
  }
}

export async function adminAddPlanets(adminId: string, telegramId: string, count: number, planetType: "BASIC" | "RARE" | "EPIC" | "MYTHIC" | "NOVA" | "PLASMA" | "GOLD" | "MUSHROOM" | "SUN"): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/add-planets`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, count, planetType }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminUnlockSlots(adminId: string, telegramId: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/unlock-slots`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, count }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGrantEquipment(adminId: string, telegramId: string, category: "HELMET" | "JETPACK" | "HAT" | "SCANNER", rarity: "BASIC" | "RARE" | "EPIC" | "GOLD" | "PLASMA" | "MYTHIC"): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/grant-equipment`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, category, rarity }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGrantAutoTap(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/grant-auto-tap`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

// === LOTTO STELLARE ===

export interface LottoBundle {
  id: "lotto_ticket_1" | "lotto_ticket_15" | "lotto_ticket_40";
  tickets: number;
  tonPrice: number;
}

export interface LottoStateResponse {
  roundId: number;
  jackpotTon: number;
  totalCollectedTon: number;
  totalTickets: number;
  userTickets: number;
  winChancePct: number;
  // ISO timestamp della prossima estrazione automatica (cron settimanale).
  nextDrawAt: string;
  bundles: LottoBundle[];
}

export interface LottoTopBuyer {
  telegramId: string;
  tickets: number;
  ton: number;
  username: string | null;
  firstName: string | null;
}

export interface LottoHistoryRound {
  id: number;
  status: string;
  totalCollectedTon: number;
  totalTickets: number;
  winnerTelegramId: string | null;
  winnerTickets: number | null;
  prizeTon: number | null;
  profitTon: number | null;
  drawnAt: string | null;
  createdAt: string;
}

export interface LottoAdminDashboard {
  round: { id: number; createdAt: string; nextDrawAt: string; totalTickets: number; participants: number };
  totalCollectedTon: number;
  prizeToPayTon: number;
  myNetProfitTon: number;
  topBuyers: LottoTopBuyer[];
  history: LottoHistoryRound[];
}

export interface LottoDrawResult {
  ok: boolean;
  roundId?: number;
  winnerTelegramId?: string;
  winnerTickets?: number;
  winnerName?: string | null;
  totalCollectedTon?: number;
  prizeTon?: number;
  profitTon?: number;
  nextRoundId?: number;
  error?: string;
}

export async function fetchLottoState(telegramId: string): Promise<LottoStateResponse | null> {
  try {
    // IMPORTANT: il server `/lottery/state` legge SOLO `req.tgUser?.id`
    // dall'initData verificato, ignorando la query string per privacy.
    // Senza apiHeaders() (che inietta `X-Telegram-Init-Data`) il server
    // non riconosce l'utente e ritorna `userTickets: 0`. Bug confermato
    // in produzione: ticket comprato e accreditato in DB ma il widget
    // mostrava 0 perché mancava questo header.
    const res = await fetch(`${API_BASE}/lottery/state?telegramId=${encodeURIComponent(telegramId)}&t=${Date.now()}`, {
      cache: "no-store",
      headers: apiHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────
// MONTHLY LAB LEADERBOARD
// ─────────────────────────────────────────────────────────────────────
export interface LabRankPrize {
  label: string;
  ton: number;
}

export interface LabRankState {
  roundId: number;
  participants: number;
  poolTon: number;
  endsAt: string | null;
  prizes: LabRankPrize[];
  userPoints: number;
  userRank: number | null;
  top100: Array<{ rank: number; telegramId: string; name: string; labPoints: number; photoUrl: string | null; tonPrize: number }>;
}

export async function fetchLabRankState(telegramId: string): Promise<LabRankState | null> {
  try {
    const res = await fetch(
      `${API_BASE}/lab-rank/state?telegramId=${encodeURIComponent(telegramId)}&t=${Date.now()}`,
      { cache: "no-store", headers: apiHeaders() },
    );
    if (!res.ok) return null;
    return (await res.json()) as LabRankState;
  } catch {
    return null;
  }
}

export interface LabRankAdminDashboard {
  round: { id: number; createdAt: string; endsAt: string | null; participants: number };
  poolTon: number;
  prizes: LabRankPrize[];
  currentLeader: { telegramId: string; name: string; labPoints: number } | null;
  top30: Array<{ rank: number; telegramId: string; name: string; labPoints: number; tonPrize: number }>;
  history: Array<{
    id: number;
    winnerTelegramId: string | null;
    winnerLabPoints: number | null;
    prizeTon: number | null;
    profitTon: number | null;
    poolTon: number | null;
    closedAt: string | null;
  }>;
}

export async function adminFetchLabRankDashboard(adminId: string): Promise<LabRankAdminDashboard | null> {
  try {
    const res = await fetch(
      `${API_BASE}/admin/lab-rank/dashboard?adminId=${encodeURIComponent(adminId)}&t=${Date.now()}`,
      { cache: "no-store", headers: apiHeaders() },
    );
    if (!res.ok) return null;
    return (await res.json()) as LabRankAdminDashboard;
  } catch {
    return null;
  }
}

export interface LabRankCloseResult {
  ok: boolean;
  error?: string;
  roundId?: number;
  newRoundId?: number;
  winner?: { telegramId: string; name: string; labPoints: number } | null;
  poolTon?: number;
  prizeTon?: number;
  profitTon?: number;
  credited?: Array<{ rank: number; telegramId: string; ton: number }>;
}

export async function buyLabTicket(telegramId: string, costTon: number): Promise<{ ok: boolean; newLabPoints?: number; newStardustBalance?: number; newDepositBalance?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/lab-rank/buy-ticket`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, costTon }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : `HTTP ${res.status}` };
    }
    return {
      ok: true,
      newLabPoints: Number(data?.newLabPoints ?? 0),
      newStardustBalance: Number(data?.newStardustBalance ?? 0),
      newDepositBalance: Number(data?.newDepositBalance ?? 0),
    };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function adminResetLabPoints(adminId: string): Promise<{ ok: boolean; resetCount?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/lab-rank/reset-points`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, resetCount: data?.resetCount };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function adminCloseLabRank(adminId: string, roundId: number): Promise<LabRankCloseResult> {
  try {
    const res = await fetch(`${API_BASE}/admin/lab-rank/close`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, roundId }),
    });
    return (await res.json()) as LabRankCloseResult;
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function adminFetchLottoDashboard(adminId: string): Promise<LottoAdminDashboard | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/lottery/dashboard?adminId=${encodeURIComponent(adminId)}&t=${Date.now()}`, { cache: "no-store", headers: apiHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function adminLottoDraw(adminId: string): Promise<LottoDrawResult> {
  try {
    const res = await fetch(`${API_BASE}/admin/lottery/draw`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    return await res.json();
  } catch { return { ok: false, error: "Network error" }; }
}

export async function adminTestWithdrawalChannel(adminId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/test-withdrawal-channel`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({} as { sent?: boolean }));
    return Boolean(data?.sent);
  } catch { return false; }
}

// === TON Deposit via TonConnect ===
export const DEPOSIT_MIN_TON = 0.25;

export async function depositTonConfirm(params: {
  telegramId: string;
  walletAddress: string;
  boc: string;
  amountTon: number;
}): Promise<{ ok: boolean; pending?: boolean; txnId?: number; alreadyCredited?: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/ton/deposit/confirm`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    return { ...data, ok: res.ok || res.status === 202 };
  } catch { return { ok: false, error: "Network error" }; }
}

// === TON Withdrawals (manual processing by admin) ===
export const WITHDRAWAL_MIN_TON = 0.1;
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
      headers: apiHeaders(),
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
    const res = await fetch(`${API_BASE}/admin/withdrawals?adminId=${encodeURIComponent(adminId)}&status=${status}&t=${Date.now()}`, { cache: "no-store", headers: apiHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.withdrawals) ? data.withdrawals : [];
  } catch { return []; }
}

export async function adminApproveWithdrawal(adminId: string, withdrawalId: number, txHash: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/withdrawals/approve`, {
      method: "POST",
      headers: apiHeaders(),
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
      headers: apiHeaders(),
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
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminUnlockEarthCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/unlock-earth-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRevokeWhiteCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/revoke-white-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRevokeEarthCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/revoke-earth-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminUnlockBlackCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/unlock-black-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRevokeBlackCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/revoke-black-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminUnlockSupernovaCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/unlock-supernova-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRevokeSupernovaCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/revoke-supernova-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminUnlockStellaRossaCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/unlock-stella-rossa-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRevokeStellaRossaCollection(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/revoke-stella-rossa-collection`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGrantV1(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/grant-v1`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGrantV1Nft(adminId: string, telegramId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/grant-v1-nft`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminCreditRedStar(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/credit-redstar`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveRedStar(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-redstar`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveZoom(adminId: string, telegramId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-zoom`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemovePlanets(adminId: string, telegramId: string, count: number, planetType: "BASIC" | "RARE" | "EPIC" | "MYTHIC" | "NOVA" | "PLASMA" | "GOLD" | "MUSHROOM" | "SUN"): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-planets`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, count, planetType }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveSlots(adminId: string, telegramId: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-slots`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, count }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGlobalBonus(adminId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/global-bonus`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGlobalRemove(adminId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/global-remove`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGlobalStardust(adminId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/global-stardust`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGlobalTon(adminId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/global-ton`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminGlobalRedStar(adminId: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/global-redstar`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, amount }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRepairTasks(adminId: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/repair-tasks`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.affected === "number" ? data.affected : 0;
  } catch { return null; }
}

export async function adminCreditSpins(adminId: string, telegramId: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/credit-spins`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, count }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveSpins(adminId: string, telegramId: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/remove-spins`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, telegramId, count }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminForceDelist(adminId: string, listingId: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/force-delist`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, listingId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminFetchMerchantStatus(adminId: string): Promise<{ active: boolean; expiresAt?: string; nextAt?: string; remainingSec?: number }> {
  try {
    const res = await fetch(`${API_BASE}/admin/merchant-status?adminId=${encodeURIComponent(adminId)}`, { cache: "no-store", headers: apiHeaders() });
    if (!res.ok) return { active: false };
    return await res.json();
  } catch { return { active: false }; }
}

export async function adminForceMerchantSpawn(adminId: string): Promise<{ ok: boolean; expiresAt?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/force-merchant-spawn`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false };
    return { ok: true, expiresAt: data?.expiresAt };
  } catch { return { ok: false }; }
}

export async function adminClearEquipmentMarket(adminId: string): Promise<{ ok: boolean; cleared?: number }> {
  try {
    const res = await fetch(`${API_BASE}/admin/clear-equipment-market`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false };
    return { ok: true, cleared: data?.cleared ?? 0 };
  } catch { return { ok: false }; }
}

export async function adminClearPlanetMarket(adminId: string): Promise<{ ok: boolean; cleared?: number }> {
  try {
    const res = await fetch(`${API_BASE}/admin/clear-planet-market`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false };
    return { ok: true, cleared: data?.cleared ?? 0 };
  } catch { return { ok: false }; }
}

export async function adminReconcileReferrals(adminId: string): Promise<{ ok: boolean; before?: number; after?: number; delta?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/reconcile-referrals`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, before: data?.before, after: data?.after, delta: data?.delta };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ReferralAudit {
  ok: boolean;
  targetTelegramId?: string;
  username?: string | null;
  firstName?: string | null;
  dailyReferralCount?: number;
  referralCount?: number;
  dailyReferralDayKey?: string | null;
  counts?: { total_refs: number; today_refs: number; total_fake: number; today_fake: number };
  error?: string;
}

export async function adminAuditReferrals(adminId: string, target: string): Promise<ReferralAudit> {
  try {
    const res = await fetch(`${API_BASE}/admin/referrals/audit`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, target }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function adminPurgeFakeReferrals(
  adminId: string,
  target: string,
  scope: "today" | "all",
): Promise<{ ok: boolean; unlinked?: number; decrementedTotal?: number; decrementedDaily?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/referrals/purge-fakes`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, target, scope }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, unlinked: data?.unlinked, decrementedTotal: data?.decrementedTotal, decrementedDaily: data?.decrementedDaily };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Nuclear option: zero out the target user's HoF counters directly, bypassing
 * the strict "fake" heuristic of /referrals/purge-fakes (which only matches
 * referred accounts with zoom_balance=0 AND balance_epoch=0 — bot accounts
 * that opened the WebApp once already have balance_epoch>=1 and slip past).
 * Calls /admin/anti-cheat-purge-referrals which atomically sets
 * daily_referral_count = 0 (and optionally referral_count = 0) on the target.
 */
export async function adminForceZeroReferrals(
  adminId: string,
  telegramId: string,
  opts: { zeroDaily?: boolean; zeroTotal?: boolean },
): Promise<{ ok: boolean; unlinked?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/anti-cheat-purge-referrals`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        adminId,
        telegramId,
        zeroDaily: !!opts.zeroDaily,
        zeroTotal: !!opts.zeroTotal,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, unlinked: data?.unlinked };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function adminReconcileStars(adminId: string): Promise<{ ok: boolean; scanned?: number; credited?: number; alreadyDone?: number; notFound?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/reconcile-stars`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return {
      ok: true,
      scanned: data?.starTxnsScanned,
      credited: data?.credited,
      alreadyDone: data?.alreadyDone,
      notFound: data?.notFound,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function adminWebhookInfo(adminId: string): Promise<{ ok: boolean; info?: unknown; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/webhook-info?adminId=${encodeURIComponent(adminId)}`, {
      method: "GET",
      headers: apiHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, info: data?.info };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function adminResetSeason(adminId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/reset-season`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminBroadcast(adminId: string, text: string): Promise<{ ok: boolean; sent?: number; skipped?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/broadcast`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, text }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error ?? "Errore server" };
    return { ok: true, sent: data.sent, skipped: data.skipped };
  } catch { return { ok: false, error: "Network error" }; }
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
  photoUrl: string | null;
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
      headers: apiHeaders(),
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
      headers: apiHeaders(),
      body: JSON.stringify({ txnId, telegramId }),
    });
    return res.json();
  } catch { return { ok: false, error: "Network error" }; }
}

export interface TonConfirmReactMeta {
  kind: "white" | "earth" | "black" | "supernova" | "stella";
  bundleIndex: number;
  subIndex: number;
  slotIndex?: number | null;
}

export async function confirmTonPurchase(
  telegramId: string,
  itemId: string,
  walletAddress: string,
  tonAmount: number,
  boc?: string,
  meta?: TonConfirmReactMeta,
): Promise<{ ok: boolean; error?: string; pending?: boolean; txnId?: number; alreadyCredited?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/ton/confirm`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, itemId, walletAddress, tonAmount, boc, ...(meta ? { meta } : {}) }),
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
  crafted?: { BASIC: number; RARE: number; EPIC: number; MYTHIC: number; PLASMA: number; GOLD: number; V1?: number };
}

export async function fetchProfile(telegramId: string): Promise<UserProfile> {
  try {
    const res = await fetch(`${API_BASE}/profile/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { exists: false };
    return res.json();
  } catch { return { exists: false }; }
}

export async function recordCraft(telegramId: string, planetType: string, cost?: number): Promise<void> {
  const body = JSON.stringify({ telegramId, planetType, ...(typeof cost === "number" && cost > 0 ? { cost } : {}) });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/craft/record`, {
        method: "POST",
        headers: apiHeaders(),
        body,
      });
      if (res.ok) return;
      // Log non-ok responses so we can see server-side errors in Sentry/devtools
      console.warn(`[recordCraft] attempt ${attempt} non-ok:`, res.status, await res.text().catch(() => ""));
    } catch (err) {
      console.warn(`[recordCraft] attempt ${attempt} error:`, err);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  console.error(`[recordCraft] failed after 3 attempts for ${telegramId} ${planetType}`);
}

export async function recordObtained(telegramId: string, planetType: string): Promise<void> {
  const body = JSON.stringify({ telegramId, planetType });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/obtained/record`, {
        method: "POST",
        headers: apiHeaders(),
        body,
      });
      if (res.ok) return;
      console.warn(`[recordObtained] attempt ${attempt} non-ok:`, res.status, await res.text().catch(() => ""));
    } catch (err) {
      console.warn(`[recordObtained] attempt ${attempt} error:`, err);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  console.error(`[recordObtained] failed after 3 attempts for ${telegramId} ${planetType}`);
}

/**
 * Public read-only feed for the global $ZOOM price index. Returns the
 * current price and the chart history (~10s granularity, last ~240 points).
 * No auth required; the price is a public signal driven by gameplay
 * actions (market trades, farming cycles, crafts).
 */
export interface EconomyPriceResponse {
  priceMicro: number;
  price: number;
  /** Highest price reached so far during the current UTC day. */
  dailyHighPrice?: number;
  genesisPrice: number;
  updatedAt: number;
}

export interface EconomyChartPoint {
  t: number;
  p: number;
  price: number;
}

export interface EconomyHistoryResponse {
  points: EconomyChartPoint[];
  genesisPrice: number;
}

export async function fetchEconomyPrice(): Promise<EconomyPriceResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/economy/price`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as EconomyPriceResponse;
  } catch { return null; }
}

export async function fetchEconomyHistory(): Promise<EconomyHistoryResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/economy/history`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as EconomyHistoryResponse;
  } catch { return null; }
}

export interface StardustMarketPriceResponse {
  indexMicro: number;
  index: number;
  genesisIndex: number;
  totalStaked: number;
  updatedAt: number;
}

export interface StardustChartPoint {
  t: number;
  p: number;
  index: number;
}

export interface StardustMarketHistoryResponse {
  points: StardustChartPoint[];
  genesisIndex: number;
}

export interface StardustStakeStateResponse {
  balance: number;
  staked: number;
  stakeIndexMicro: number;
  stakedValue: number;
  index: number;
  pnl: number;
  lockedUntilMs?: number;
  canWithdraw?: boolean;
  lockDaysRemaining?: number;
}

export async function fetchStardustMarketPrice(): Promise<StardustMarketPriceResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/stardust/market/price`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as StardustMarketPriceResponse;
  } catch { return null; }
}

export async function fetchStardustMarketHistory(): Promise<StardustMarketHistoryResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/stardust/market/history`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as StardustMarketHistoryResponse;
  } catch { return null; }
}

export async function fetchStardustStakeState(telegramId: string): Promise<StardustStakeStateResponse | null> {
  try {
    const res = await fetch(
      `${API_BASE}/stardust/stake/state?telegramId=${encodeURIComponent(telegramId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as StardustStakeStateResponse;
  } catch { return null; }
}

export async function stakeStardust(
  telegramId: string,
  amount: number,
): Promise<{ ok: boolean; balance?: number; staked?: number; stakedValue?: number; balanceEpoch?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/stardust/stake`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(withInitData({ telegramId, amount })),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: parseApiError(data, res.status, "Stake failed") };
    }
    return data as { ok: boolean; balance?: number; staked?: number; stakedValue?: number; balanceEpoch?: number };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function unstakeStardust(
  telegramId: string,
  amount?: number,
): Promise<{ ok: boolean; balance?: number; staked?: number; payout?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/stardust/unstake`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(withInitData({ telegramId, ...(amount ? { amount } : {}) })),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: parseApiError(data, res.status, "Unstake failed") };
    }
    return data as { ok: boolean; balance?: number; staked?: number; payout?: number };
  } catch {
    return { ok: false, error: "Network error" };
  }
}


export async function deductCraftStardust(telegramId: string, amount: number): Promise<{ ok: boolean; newBalance?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/stardust/deduct`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, amount }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      return { ok: false, error: String(j["error"] ?? "SERVER_ERROR") };
    }
    const j = await res.json().catch(() => ({} as Record<string, unknown>));
    return { ok: true, newBalance: Number(j["newBalance"] ?? 0) };
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}
// ─────────────────────────────────────────────────────────────────────
// TON STAKING — 7 tiers. V1/SUN keep continuous accrual; BASIC..GOLD
// require SUN in inventory + 8 ACTIVE farms of that rarity.
//   • SUN       → 2.50 TON / 30d   (continuous, 5 planets)
//   • V1        → 1.60 TON / 30d   (continuous, 5 planets)
//   • PLASMA    → 2.00 TON / 30d   (gated on active farming)
//   • MYTHIC    → 1.30 TON / 30d   (gated on active farming)
//   • GOLD      → 0.65 TON / 30d   (gated on active farming)
//   • EPIC      → 0.30 TON / 30d   (gated on active farming)
//   • RARE      → 0.12 TON / 30d   (gated on active farming)
//   • BASIC     → 0.05 TON / 30d   (gated on active farming)
// ─────────────────────────────────────────────────────────────────────
export type StakingKind = "v1" | "sun" | "basic" | "rare" | "epic" | "mythic" | "plasma" | "gold";

export interface StakingSetStatus {
  eligible: boolean;
  count: number;
  activeCount: number;
  required: number;
  startedAtMs: number;
  accruedTon: number;
  isAccruing: boolean;
  rewardTonPerMonth: number;
  requiresSunInInventory: boolean;
}
export interface StakingStatusResponse {
  v1: StakingSetStatus;
  sun: StakingSetStatus;
  basic: StakingSetStatus;
  rare: StakingSetStatus;
  epic: StakingSetStatus;
  mythic: StakingSetStatus;
  plasma: StakingSetStatus;
  gold: StakingSetStatus;
  hasSun: boolean;
  nowMs: number;
}

export async function fetchStakingStatus(telegramId: string): Promise<StakingStatusResponse | null> {
  if (!telegramId) return null;
  try {
    const res = await fetch(`${API_BASE}/staking/status?telegramId=${encodeURIComponent(telegramId)}`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as StakingStatusResponse;
  } catch { return null; }
}

export async function startStaking(telegramId: string, kind: StakingKind): Promise<{ ok: boolean; startedAtMs?: number; reason?: string }> {
  if (!telegramId) return { ok: false, reason: "NO_USER" };
  try {
    const res = await fetch(`${API_BASE}/staking/start`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, kind }),
    });
    const data = await res.json().catch(() => null) as { startedAtMs?: number; error?: string } | null;
    if (!res.ok || !data) return { ok: false, reason: data?.error ?? "ERROR" };
    return { ok: true, startedAtMs: data.startedAtMs ?? 0 };
  } catch { return { ok: false, reason: "NETWORK" }; }
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

export interface WheelPendingClaim {
  token: string;
  prizeIndex: number;
  prize: WheelSpinResult["prize"];
  createdAt: number;
}

export interface WheelStatus {
  spins: number;
  canClaimDaily: boolean;
  nextClaimAt: number;
  // Set when the previous /wheel/spin reserved a prize but the client never
  // got to call /wheel/spin/claim (e.g. tab closed mid-animation). The
  // client should auto-resume the animation and finalize the claim so the
  // user actually receives the prize they were promised.
  pendingPrize?: WheelPendingClaim | null;
}

export async function fetchWheelStatus(telegramId: string): Promise<WheelStatus> {
  try {
    const res = await fetch(`${API_BASE}/wheel/status/${encodeURIComponent(telegramId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { spins: 0, canClaimDaily: false, nextClaimAt: 0, pendingPrize: null };
    return res.json();
  } catch { return { spins: 0, canClaimDaily: false, nextClaimAt: 0, pendingPrize: null }; }
}

export async function claimWheelDaily(telegramId: string): Promise<{ ok: boolean; spins?: number; nextClaimAt?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/wheel/claim-daily`, {
      method: "POST",
      headers: apiHeaders(),
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
  // Required for the follow-up /wheel/spin/claim call that actually credits
  // the prize. The server holds the prize in `pending_wheel_claim` until
  // this token is presented back, so a tab-crash mid-animation can be
  // recovered (see /wheel/status -> pendingPrize).
  claimToken: string;
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

export async function fetchMaintenanceStatus(): Promise<MaintenanceStatus | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${API_BASE}/maintenance/status?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as MaintenanceStatus;
    return {
      enabled: !!data.enabled,
      message: data.message || "",
      updatedAt: Number(data.updatedAt) || 0,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function adminSetMaintenance(adminId: string, enabled: boolean, message?: string): Promise<{ ok: boolean; enabled?: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/maintenance`, {
      method: "POST",
      headers: apiHeaders(),
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

export async function spinWheel(telegramId: string): Promise<{ ok: boolean; result?: WheelSpinResult; error?: string; pendingPrize?: WheelPendingClaim }> {
  try {
    const res = await fetch(`${API_BASE}/wheel/spin`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || "Spin failed", pendingPrize: data.pendingPrize };
    }
    return { ok: true, result: await res.json() };
  } catch { return { ok: false, error: "Network error" }; }
}

/**
 * Finalizes a spin by presenting the `claimToken` returned by
 * `spinWheel`. The server validates the token, credits the prize
 * (zoom balance bump or planet-bonus increment) and pushes the public
 * feed entry. Idempotent: a second call with the same token (or after
 * a tab-crash recovery) returns `{ ok: true, alreadyClaimed: true }`
 * with no double credit.
 */
export async function claimWheelSpin(telegramId: string, claimToken: string): Promise<{ ok: boolean; alreadyClaimed?: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/wheel/spin/claim`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, claimToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Claim failed" };
    return { ok: true, alreadyClaimed: !!data.alreadyClaimed };
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

export async function claimDailyReward(telegramId: string, firstName?: string): Promise<{ ok: boolean; reward?: number; day?: number; cycle?: number; stardustBalance?: number; balanceEpoch?: number; error?: string } & Partial<DailyStatus>> {
  try {
    const res = await fetch(`${API_BASE}/daily/claim`, {
      method: "POST",
      headers: apiHeaders(),
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
  // CS:GO-style perfection score snapshotted from the listing. Null for
  // non-floatable types (Earth/SUN/V1_NFT) or legacy sales without a
  // stored snapshot — in that case the UI falls back to the
  // deterministic-from-id helper.
  planetFloat?: number | null;
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
  // 'planet' (default for legacy rows), 'equipment', or 'item'. Discriminates
  // which set of typed fields below is populated.
  kind?: "planet" | "equipment" | "item" | null;
  // Planet-listing fields. Null on equipment listings.
  planetType: string | null;
  planetRate: number | null;
  // Equipment-listing fields. Null on planet listings.
  equipmentId?: string | null;
  equipmentCategory?: string | null;
  equipmentRarity?: string | null;
  equipmentRate?: number | null;
  // The seller's local planet id at listing time. Nullable on the very
  // oldest listings created before the column was added. Used by the
  // marketplace UI to compute a deterministic procedural name as a
  // fallback when the seller never renamed (paid action).
  planetId?: string | null;
  // CS:GO-style cosmetic perfection score in [0, 1]. Snapshotted at
  // listing time. Nullable on legacy listings created before the
  // schema column shipped — UI falls back to a deterministic value
  // derived from the listing id (utils/planetFloat.ts).
  planetFloat?: number | null;
  // Snapshotted user-chosen displayName from the seller's rename
  // (paid action). Nullable for legacy listings and for planets that
  // were never renamed — UI then falls back to the rarity label.
  planetDisplayName?: string | null;
  // Snapshotted farm-duration upgrade (hours). Null / missing = 1h (default).
  planetFarmDurationHours?: number | null;
  // Lab-forged 3D object. Present when the listed planet was crafted in the Lab.
  modelId?: string | null;
  shapeId?: string | null;
  price: number;
  status: string;
  createdAt: string;
}

export async function fetchMarketListings(): Promise<ServerMarketListing[]> {
  // Throws on network/HTTP/parse failure so callers can distinguish a
  // confirmed-empty market from a transient outage. Previously this
  // swallowed all errors and returned [] — which made the periodic
  // "orphan listing reconcile" in useGameState delete every locally-listed
  // planet on a single network blip (root cause of vanishing-planet
  // reports). Callers that prefer the old behavior must explicitly catch
  // and substitute [].
  const res = await fetch(`${API_BASE}/market/listings?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`market/listings HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.listings)) throw new Error("market/listings malformed response");
  return data.listings as ServerMarketListing[];
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
      headers: apiHeaders(),
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

export async function buyFromMarket(buyerTelegramId: string, listingId: number): Promise<{
  ok: boolean;
  // Distinguishes planet vs equipment so the client knows which local
  // state slice to mint into. Older server builds omit this; treat
  // missing as 'planet' for backwards compatibility.
  kind?: "planet" | "equipment" | "item";
  planetType?: string | null;
  planetRate?: number | null;
  // For kind='equipment'/'item' responses, the server-side minted item details.
  equipmentId?: string | null;
  equipmentCategory?: string | null;
  equipmentRarity?: string | null;
  equipmentRate?: number | null;
  pricePaid?: number;
  planetFloat?: number | null;
  modelId?: string | null;
  shapeId?: string | null;
  modelName?: string | null;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/market/buy`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ buyerTelegramId, listingId }),
    });
    return res.json();
  } catch {
    return { ok: false, error: "Network error" };
  }
}

// Ask the server to post a listing to the community group (looping planet
// animation + stats + deep-link button). Returns ok plus the generated deep
// link, or an error string the UI surfaces in a toast.
export async function shareListing(telegramId: string, listingId: number): Promise<{
  ok: boolean;
  deepLink?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/market/share`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, listingId }),
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
      headers: apiHeaders(),
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
      headers: apiHeaders(),
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
      headers: apiHeaders(),
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
// spawn cadence (4–6 h) and the 15-minute visit window.
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
  maxFusions: 0,
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

export interface MerchantScrapResult {
  ok: boolean;
  reward?: number;
  planetType?: string;
  reason?: "EXPIRED" | "INTERNAL" | "BAD_REQUEST" | "NETWORK" | "USER_NOT_FOUND" | "PLANET_NOT_FOUND";
}

// ─────────────────────────────────────────────────────────────────
// COLLECTION PLANETS — server-side persistence of slot placements and
// per-planet farming timers for White & Earth collection planets. Without
// this, a localStorage wipe (PWA reinstall, cache clear, device switch)
// would dump every placed planet back into inventory and erase any
// uncollected farm earnings, which is exactly the bug we're closing.
// ─────────────────────────────────────────────────────────────────
export type CollectionKind = "white" | "earth" | "black" | "supernova";

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
    return j.planets
      .map((p: Record<string, unknown>) => {
        const k = p.kind;
        const kind: CollectionKind | null =
          k === "white" || k === "earth" || k === "black" || k === "supernova" ? k : null;
        if (!kind) return null;
        return {
          kind,
          bundleIndex: Number(p.bundleIndex ?? 0),
          subIndex: Number(p.subIndex ?? 0),
          slotIndex: p.slotIndex == null ? null : Number(p.slotIndex),
          isFarmingActive: !!p.isFarmingActive,
          farmStartedAtMs: Number(p.farmStartedAtMs ?? 0),
          lastCollectedAtMs: Number(p.lastCollectedAtMs ?? 0),
        } as CollectionPlanetState;
      })
      .filter((p: CollectionPlanetState | null): p is CollectionPlanetState => p !== null);
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
      headers: apiHeaders(),
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
      headers: apiHeaders(),
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
  claimedBonusMythic: number;
  claimedBonusPlasma: number;
  claimedBonusV1: number;
  claimedBonusV1NftPlatinum: number;
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
    claimedBonusMythic: 0,
    claimedBonusPlasma: 0,
    claimedBonusV1: 0,
    claimedBonusV1NftPlatinum: 0,
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
      claimedBonusMythic: Number(j.claimedBonusMythic ?? 0),
      claimedBonusPlasma: Number(j.claimedBonusPlasma ?? 0),
      claimedBonusV1: Number(j.claimedBonusV1 ?? 0),
      claimedBonusV1NftPlatinum: Number(j.claimedBonusV1NftPlatinum ?? 0),
    };
  } catch {
    return failure;
  }
}

// ───────────────── Equipment inventory ─────────────────
//
// Equipment items (Helmets / Jetpacks / Hats / Scanners) live in their own
// JSONB column on `users` and follow the same write pattern as planets:
// a debounced client save with a monotonic stale-write fence.

import type { EquipmentItem } from "./equipmentConfig";

export interface EquipmentState {
  ok: boolean;
  exists: boolean;
  equipment: EquipmentItem[];
}

export async function fetchEquipment(telegramId: string): Promise<EquipmentState> {
  const failure: EquipmentState = { ok: false, exists: false, equipment: [] };
  if (!telegramId) return failure;
  try {
    const res = await fetch(
      `${API_BASE}/equipment/${encodeURIComponent(telegramId)}?t=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!res.ok) return failure;
    const j = await res.json();
    if (!j?.ok) return failure;
    return {
      ok: true,
      exists: !!j.exists,
      equipment: Array.isArray(j.equipment) ? (j.equipment as EquipmentItem[]) : [],
    };
  } catch {
    return failure;
  }
}

export async function startEquipmentCycle(telegramId: string, equipmentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!telegramId || !equipmentId) return { ok: false, error: "Missing arg" };
  try {
    const res = await fetch(`${API_BASE}/equipment/start`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, equipmentId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof j?.error === "string" ? j.error : `HTTP ${res.status}` };
    return { ok: !!j?.ok };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function collectEquipmentItem(telegramId: string, equipmentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!telegramId || !equipmentId) return { ok: false, error: "Missing arg" };
  try {
    const res = await fetch(`${API_BASE}/equipment/collect`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, equipmentId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof j?.error === "string" ? j.error : `HTTP ${res.status}` };
    return { ok: !!j?.ok };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function burnEquipmentItem(telegramId: string, equipmentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!telegramId || !equipmentId) return { ok: false, error: "Missing arg" };
  try {
    const res = await fetch(`${API_BASE}/equipment/burn`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, equipmentId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof j?.error === "string" ? j.error : `HTTP ${res.status}` };
    return { ok: !!j?.ok };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function listEquipmentOnMarket(params: {
  sellerTelegramId: string;
  sellerName?: string;
  equipmentId: string;
  price: number;
}): Promise<{ ok: boolean; listing?: ServerMarketListing; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/market/list-equipment`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : `HTTP ${res.status}` };
    }
    return data;
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function saveEquipment(
  telegramId: string,
  equipment: ReadonlyArray<EquipmentItem>,
): Promise<{ ok: boolean; accepted: boolean }> {
  if (!telegramId) return { ok: false, accepted: false };
  try {
    const res = await fetch(`${API_BASE}/equipment/save`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        telegramId,
        equipment,
        clientWriteAtMs: Date.now(),
      }),
      keepalive: true,
    });
    if (!res.ok) return { ok: false, accepted: false };
    const j = await res.json().catch(() => ({}));
    return { ok: !!j?.ok, accepted: !!j?.accepted };
  } catch {
    return { ok: false, accepted: false };
  }
}

// ───────────────── Earn-page long-term tasks ─────────────────
// GET /tasks/state/:telegramId — returns the user's planet-build counter,
// claimed-task ids, and the catalog of available tasks (planet milestones
// + sponsor tasks). The catalog lives on the server so client and server
// can never disagree on thresholds / rewards / sponsor URLs.
export interface PlanetTaskInfo {
  id: string;
  threshold: number;
  rewardZoom: number;
  claimed: boolean;
  claimable: boolean;
}
export interface SponsorTaskInfo {
  id: string;
  url: string;
  rewardSpins: number;
  rewardZoom: number;
  rewardStardust: number;
  claimed: boolean;
  eligible: boolean;
  ineligibleReason: string | null;
  requirementLabel: string | null;
}
export interface TasksState {
  planetsBuilt: number;
  claimedTasks: string[];
  planetTasks: PlanetTaskInfo[];
  sponsorTasks: SponsorTaskInfo[];
}

const TASKS_CACHE_KEY = "zoom:tasks-state-v3";
let tasksMemoryCache: { telegramId: string; state: TasksState; at: number } | null = null;
let tasksInflight: { telegramId: string; promise: Promise<TasksState | null> } | null = null;

/** Authoritative Lab forge rewards — must match api-server labv3_* (never show legacy planets_* 5k–200k). */
export const LAB_FORGE_TASK_CATALOG: ReadonlyArray<{ id: string; threshold: number; rewardZoom: number }> = [
  { id: "labv3_5", threshold: 5, rewardZoom: 5 },
  { id: "labv3_15", threshold: 15, rewardZoom: 10 },
  { id: "labv3_40", threshold: 40, rewardZoom: 15 },
  { id: "labv3_100", threshold: 100, rewardZoom: 25 },
  { id: "labv3_250", threshold: 250, rewardZoom: 40 },
  { id: "labv3_500", threshold: 500, rewardZoom: 60 },
];

/** Rebuild planet tasks from the Lab catalog so stale/prod APIs can't paint 25k–200k ZOOM. */
export function normalizeLabTasksState(raw: {
  planetsBuilt?: number;
  claimedTasks?: string[];
  planetTasks?: PlanetTaskInfo[];
  sponsorTasks?: SponsorTaskInfo[];
} | null | undefined): TasksState {
  const built = Math.max(0, Number(raw?.planetsBuilt ?? 0));
  const claimed = new Set(Array.isArray(raw?.claimedTasks) ? raw!.claimedTasks : []);
  // Also honour claim flags from a lab-catalog payload if present.
  for (const t of raw?.planetTasks ?? []) {
    if (t?.claimed && typeof t.id === "string") claimed.add(t.id);
  }
  return {
    planetsBuilt: built,
    claimedTasks: [...claimed],
    planetTasks: LAB_FORGE_TASK_CATALOG.map((t) => ({
      id: t.id,
      threshold: t.threshold,
      rewardZoom: t.rewardZoom,
      claimed: claimed.has(t.id),
      claimable: !claimed.has(t.id) && built >= t.threshold,
    })),
    sponsorTasks: Array.isArray(raw?.sponsorTasks) ? raw!.sponsorTasks : [],
  };
}

/** Static catalog — shown instantly before the network returns. */
export const TASKS_CATALOG_FALLBACK: TasksState = normalizeLabTasksState({
  planetsBuilt: 0,
  claimedTasks: [],
  sponsorTasks: [],
});

function readTasksSession(telegramId: string): TasksState | null {
  try {
    const raw = sessionStorage.getItem(`${TASKS_CACHE_KEY}:${telegramId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TasksState;
    if (!parsed || !Array.isArray(parsed.planetTasks)) return null;
    return normalizeLabTasksState(parsed);
  } catch {
    return null;
  }
}

function writeTasksSession(telegramId: string, state: TasksState): void {
  try {
    sessionStorage.setItem(`${TASKS_CACHE_KEY}:${telegramId}`, JSON.stringify(state));
  } catch { /**/ }
}

/** Instant paint — memory → session → static catalog. */
export function peekTasksState(telegramId: string | null | undefined): TasksState {
  if (!telegramId) return TASKS_CATALOG_FALLBACK;
  if (tasksMemoryCache?.telegramId === telegramId) {
    return normalizeLabTasksState(tasksMemoryCache.state);
  }
  const session = readTasksSession(telegramId);
  if (session) {
    tasksMemoryCache = { telegramId, state: session, at: Date.now() };
    return session;
  }
  return TASKS_CATALOG_FALLBACK;
}

function rememberTasksState(telegramId: string, state: TasksState): void {
  const normalized = normalizeLabTasksState(state);
  tasksMemoryCache = { telegramId, state: normalized, at: Date.now() };
  writeTasksSession(telegramId, normalized);
}

export async function fetchTasksState(telegramId: string): Promise<TasksState | null> {
  if (tasksInflight?.telegramId === telegramId) {
    return tasksInflight.promise;
  }
  const promise = (async (): Promise<TasksState | null> => {
    try {
      const res = await fetch(`${API_BASE}/tasks/state/${encodeURIComponent(telegramId)}`, {
        headers: apiHeaders(),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.ok) return null;
      const state = normalizeLabTasksState({
        planetsBuilt: Number(json.planetsBuilt ?? 0),
        claimedTasks: Array.isArray(json.claimedTasks) ? json.claimedTasks : [],
        planetTasks: Array.isArray(json.planetTasks) ? json.planetTasks : [],
        sponsorTasks: Array.isArray(json.sponsorTasks) ? json.sponsorTasks : [],
      });
      rememberTasksState(telegramId, state);
      return state;
    } catch {
      return null;
    } finally {
      if (tasksInflight?.telegramId === telegramId) tasksInflight = null;
    }
  })();
  tasksInflight = { telegramId, promise };
  return promise;
}

/** Warm the cache early so Earn opens already filled. */
export function prefetchTasksState(telegramId: string | null | undefined): void {
  if (!telegramId) return;
  void fetchTasksState(telegramId);
}

export interface ClaimTaskResult {
  ok: boolean;
  error?: string;
  reason?: string;
  requirementLabel?: string | null;
  rewardZoom?: number;
  rewardSpins?: number;
  rewardStardust?: number;
  planetsBuilt?: number;
  threshold?: number;
}

export async function claimTask(telegramId: string, taskId: string): Promise<ClaimTaskResult> {
  try {
    const res = await fetch(`${API_BASE}/tasks/claim`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(withInitData({ telegramId, taskId })),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        error: json?.error || "CLAIM_FAILED",
        reason: typeof json?.reason === "string" ? json.reason : undefined,
        requirementLabel: typeof json?.requirementLabel === "string" ? json.requirementLabel : null,
        planetsBuilt: typeof json?.planetsBuilt === "number" ? json.planetsBuilt : undefined,
        threshold: typeof json?.threshold === "number" ? json.threshold : undefined,
      };
    }
    return {
      ok: true,
      rewardZoom: Number(json.rewardZoom ?? 0),
      rewardSpins: Number(json.rewardSpins ?? 0),
      rewardStardust: Number(json.rewardStardust ?? 0),
      planetsBuilt: Number(json.totalPlanetsBuilt ?? 0),
    };
  } catch {
    return { ok: false, error: "NETWORK" };
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
    mythic: number;
    plasma: number;
    v1: number;
    v1NftPlatinum: number;
  },
  craftsCompleted?: number,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/regular-planets/save`, {
      method: "POST",
      headers: apiHeaders(),
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
        claimedBonusMythic: claimed.mythic,
        claimedBonusPlasma: claimed.plasma,
        claimedBonusV1: claimed.v1,
        claimedBonusV1NftPlatinum: claimed.v1NftPlatinum,
        ...(craftsCompleted != null ? { craftsCompleted } : {}),
      }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function merchantScrap(
  telegramId: string,
  planetId: string,
  planetType: string,
): Promise<MerchantScrapResult> {
  try {
    const res = await fetch(`${API_BASE}/merchant/scrap`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, planetId, planetType }),
    });
    const j = await res.json().catch(() => ({}));
    return {
      ok: !!j?.ok,
      reward: typeof j?.reward === "number" ? j.reward : undefined,
      planetType: typeof j?.planetType === "string" ? j.planetType : undefined,
      reason: j?.reason,
    };
  } catch {
    return { ok: false, reason: "NETWORK" };
  }
}

// ─────────────────────────────────────────────────────────────────────
// HOME — Comfort Zone (pixel-art room with display slots & computer).
// Server is the source of truth for unlock state, slot placements and
// the computer's 24h farming cooldown — none of this is trusted from
// localStorage so a cache wipe / device switch never loses progress.
// ─────────────────────────────────────────────────────────────────────

export interface HomeState {
  ok: boolean;
  unlocked: boolean;
  hasSun: boolean;
  stardustBalance: number;
  unlockCost: number;
  slots: { A: string | null; B: string | null; C: string | null };
  computer: {
    owned: boolean;
    ownedAt: string | null;
    lastClaimAt: string | null;
    nextReadyAt: number;
    secondsToReady: number;
    claimable: boolean;
    cost: number;
    rewardPerClaim: number;
    cooldownMs: number;
    zoomBonusReward: number;
    zoomBonusCooldownMs: number;
    zoomBonusNextReadyAt: number;
    zoomBonusSecondsToReady: number;
    zoomBonusReady: boolean;
  };
  plant: {
    owned: boolean;
    level: number;
    xp: number;
    xpPerLevel: number;
    xpPerWater: number;
    maxLevel: number;
    ownedAt: string | null;
    lastWaterAt: string | null;
    lastClaimAt: string | null;
    waterNextReadyAt: number;
    secondsToWater: number;
    waterReady: boolean;
    waterCost: number;
    waterCooldownMs: number;
    claimNextReadyAt: number;
    secondsToClaim: number;
    claimReady: boolean;
    tonPerClaim: number;
    claimCooldownMs: number;
    tonPerSecond: number;
    seedCost: number;
  };
}

export async function fetchHomeState(telegramId: string): Promise<HomeState | null> {
  if (!telegramId) return null;
  try {
    const res = await fetch(`${API_BASE}/home/state/${encodeURIComponent(telegramId)}?t=${Date.now()}`, {
      cache: "no-store",
      headers: apiHeaders(),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j?.ok) return null;
    return j as HomeState;
  } catch {
    return null;
  }
}

export interface HomeActionResult {
  ok: boolean;
  error?: string;
  have?: number;
  need?: number;
  secondsToReady?: number;
  reward?: number;
  stardustBalance?: number;
  tonBalance?: number;
  plantLevel?: number;
  plantXp?: number;
  leveledUp?: boolean;
  maxedOut?: boolean;
  slots?: { A: string | null; B: string | null; C: string | null };
}

async function homePost(path: string, body: Record<string, unknown>): Promise<HomeActionResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({} as Record<string, unknown>));
    return j as HomeActionResult;
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

export function unlockHome(telegramId: string): Promise<HomeActionResult> {
  return homePost("/home/unlock", { telegramId });
}
export function buyComputer(telegramId: string): Promise<HomeActionResult> {
  return homePost("/home/computer/buy", { telegramId });
}
export function claimComputer(telegramId: string): Promise<HomeActionResult> {
  return homePost("/home/computer/claim", { telegramId });
}
export function claimComputerZoomBonus(telegramId: string): Promise<HomeActionResult> {
  return homePost("/home/computer/zoom-bonus", { telegramId });
}

export interface V1NftStardustStatus {
  ok: boolean;
  owned: boolean;
  secondsToReady: number;
  claimable: boolean;
  rewardPerClaim: number;
  cooldownMs: number;
}

export async function fetchV1NftStardustStatus(telegramId: string): Promise<V1NftStardustStatus> {
  const fallback: V1NftStardustStatus = {
    ok: false, owned: false, secondsToReady: 0, claimable: false, rewardPerClaim: 25, cooldownMs: 86_400_000,
  };
  try {
    const res = await fetch(`${API_BASE}/home/v1-nft/stardust-status/${encodeURIComponent(telegramId)}?t=${Date.now()}`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) return fallback;
    return {
      ok: true,
      owned: !!j.owned,
      secondsToReady: Number(j.secondsToReady) || 0,
      claimable: !!j.claimable,
      rewardPerClaim: Number(j.rewardPerClaim) || 25,
      cooldownMs: Number(j.cooldownMs) || 86_400_000,
    };
  } catch {
    return fallback;
  }
}

export function claimV1NftStardust(telegramId: string): Promise<HomeActionResult> {
  return homePost("/home/v1-nft/claim-stardust", { telegramId });
}
export function buyPlantSeed(telegramId: string): Promise<HomeActionResult> {
  return homePost("/home/plant/buy", { telegramId });
}
export function waterPlant(telegramId: string): Promise<HomeActionResult> {
  return homePost("/home/plant/water", { telegramId });
}
export function claimPlant(telegramId: string): Promise<HomeActionResult> {
  return homePost("/home/plant/claim", { telegramId });
}
export function placeHomeSlot(telegramId: string, slot: "A" | "B" | "C", itemId: string): Promise<HomeActionResult> {
  return homePost("/home/slot/place", { telegramId, slot, itemId });
}
export function clearHomeSlot(telegramId: string, slot: "A" | "B" | "C"): Promise<HomeActionResult> {
  return homePost("/home/slot/clear", { telegramId, slot });
}

// ─── PvP Battle — Planet-to-Planet Duels ──────────────────────────────

export interface PvPQueueResult {
  ok: boolean;
  status?: "queue" | "match";
  battleId?: string;
  message?: string;
  error?: string;
  player?: { telegramId: string; planet: unknown; username?: string };
  opponent?: { telegramId: string; planet: unknown; username?: string };
  confirmDeadline?: number;
  winProbability?: number;
}

export async function pvpQueue(
  telegramId: string,
  planetId: string,
  planetName: string,
  planetRarity: string,
  planetRate: number,
  planetFloat?: number | null,
): Promise<PvPQueueResult> {
  try {
    const res = await fetch(`${API_BASE}/pvp/queue`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        telegramId,
        planetId,
        planetName,
        planetRarity,
        planetRate,
        planetFloat,
      }),
    });
    const j = await res.json().catch(() => ({}));
    return j as PvPQueueResult;
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

export async function pvpLeaveQueue(telegramId: string): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/pvp/leave-queue`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: !!j.ok };
  } catch {
    return { ok: false };
  }
}

export interface PvPStatus {
  ok: boolean;
  inBattle?: boolean;
  inQueue?: boolean;
  battleId?: string;
  status?: string;
  player?: { telegramId: string; planet: unknown; confirmed: boolean; username?: string };
  opponent?: { telegramId: string; planet: unknown; confirmed: boolean; username?: string };
  confirmDeadline?: number;
  winProbability?: number;
  winnerTelegramId?: string;
  loserTelegramId?: string;
  resultTimestamp?: number;
  joinedAt?: number;
}

export async function fetchPvPStatus(telegramId: string): Promise<PvPStatus> {
  try {
    const res = await fetch(`${API_BASE}/pvp/status/${encodeURIComponent(telegramId)}?t=${Date.now()}`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    return j as PvPStatus;
  } catch {
    return { ok: false };
  }
}

export async function fetchPvPBattle(battleId: string, telegramId?: string): Promise<PvPStatus> {
  try {
    // telegramId is required for the server to compute caller-relative
    // player/opponent and the perspective-adjusted winProbability. Without it
    // the server defaults to player2's perspective for everyone, which inverts
    // player1's win odds and desyncs the roulette landing.
    const tid = telegramId ? `&telegramId=${encodeURIComponent(telegramId)}` : "";
    const res = await fetch(`${API_BASE}/pvp/battle/${encodeURIComponent(battleId)}?t=${Date.now()}${tid}`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    return j as PvPStatus;
  } catch {
    return { ok: false };
  }
}

export async function pvpConfirm(telegramId: string, battleId: string): Promise<{ ok: boolean; error?: string; battle?: unknown }> {
  try {
    const res = await fetch(`${API_BASE}/pvp/confirm`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, battleId }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: !!j.ok, error: j.error, battle: j.battle };
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

export async function pvpDecline(telegramId: string, battleId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/pvp/decline`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, battleId }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: !!j.ok, error: j.error };
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

// ─── HOME — Global Chat (Phase 5b) ────────────────────────────────────
export interface ChatMessage {
  id: number;
  telegramId: string;
  username: string;
  text: string;
  createdAt: string;
}

/** Initial load: most recent N messages (oldest→newest). */
export async function fetchChatMessages(limit = 50): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`${API_BASE}/chat/messages?limit=${limit}&t=${Date.now()}`, {
      cache: "no-store",
      headers: apiHeaders(),
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j?.messages) ? (j.messages as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

/** Delta poll: messages newer than the highest id we already have. */
export async function fetchChatSince(sinceId: number): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`${API_BASE}/chat/messages?since=${sinceId}&t=${Date.now()}`, {
      cache: "no-store",
      headers: apiHeaders(),
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j?.messages) ? (j.messages as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export interface SendChatResult {
  ok: boolean;
  error?: string;
  retryAfterMs?: number;
  message?: ChatMessage;
}

export async function sendChatMessage(
  telegramId: string,
  username: string,
  text: string,
): Promise<SendChatResult> {
  try {
    const res = await fetch(`${API_BASE}/chat/send`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, username, text }),
    });
    const j = await res.json().catch(() => ({} as Record<string, unknown>));
    return j as SendChatResult;
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

// ───────────────── Redeem Codes (admin-generated 24h promos) ─────────────────
export type RedeemKind = "zoom" | "stardust" | "spins";

export interface AdminRedeemCode {
  code: string;
  rewardType: RedeemKind;
  rewardAmount: number;
  expiresAt: string;
  createdAt: string;
}

export interface AdminCreateRedeemCodeResult {
  ok: boolean;
  error?: string;
  code?: string;
  rewardType?: RedeemKind;
  rewardAmount?: number;
  expiresAt?: string;
}

export async function adminCreateRedeemCode(
  adminId: string,
  kind: RedeemKind,
): Promise<AdminCreateRedeemCodeResult> {
  try {
    const res = await fetch(`${API_BASE}/admin/redeem-codes/create`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId, kind }),
    });
    const j = await res.json().catch(() => ({} as Record<string, unknown>));
    return j as AdminCreateRedeemCodeResult;
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

export async function adminListRedeemCodes(adminId: string): Promise<AdminRedeemCode[]> {
  try {
    const res = await fetch(`${API_BASE}/admin/redeem-codes/list`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ adminId }),
    });
    const j = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!j || !(j as { ok?: boolean }).ok) return [];
    return ((j as { codes?: AdminRedeemCode[] }).codes ?? []);
  } catch {
    return [];
  }
}

export interface RedeemServerResult {
  ok: boolean;
  error?: string; // "NOT_FOUND" | "EXPIRED" | "ALREADY_USED" | "BAD_REQUEST" | "DB_ERROR" | "NETWORK"
  rewardType?: RedeemKind;
  rewardAmount?: number;
}

export async function redeemServerCode(telegramId: string, code: string): Promise<RedeemServerResult> {
  try {
    const res = await fetch(`${API_BASE}/redeem-codes/redeem`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, code }),
    });
    const j = await res.json().catch(() => ({} as Record<string, unknown>));
    return j as RedeemServerResult;
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

// ─── Cronologia personale ──────────────────────────────────────────────
// Eventi monetari (zoom/ton/stardust/stars/spins/planet) degli ultimi 48h
// per l'utente loggato. Il server applica già il filtro 48h e l'ordine
// (più recente prima); il cron pulisce poi le righe oltre il limite.
export type HistoryCurrency =
  | "zoom" | "ton" | "stardust" | "redstar" | "stars" | "spins" | "planet" | "none";

export interface HistoryEntry {
  id: number;
  kind: string;
  delta: number;
  currency: HistoryCurrency;
  createdAt: number; // unix ms
  meta?: Record<string, unknown> | null;
}

export async function claimDailyStellaRedstar(telegramId: string): Promise<{
  ok: boolean;
  awarded?: number;
  newRedStarBalance?: number;
  nextClaimAt?: number;
  cooldownRemainingMs?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/stella-rossa/claim-daily`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...apiHeaders() },
      body: JSON.stringify({ telegramId }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function fetchHistory(telegramId: string): Promise<HistoryEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/history/list/${encodeURIComponent(telegramId)}`, {
      headers: apiHeaders(),
    });
    if (!res.ok) return [];
    const j = await res.json().catch(() => ({} as { entries?: HistoryEntry[] }));
    return Array.isArray(j.entries) ? j.entries : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
//  COLLECTIBLE ITEMS
// ─────────────────────────────────────────────────────────────────

export interface CollectibleItemApiShape {
  id: string;
  type: string;
  rarity: string;
  rate: number;
  emoji: string;
  color: string;
  glowColor: string;
  createdAt: number;
  isListedInMarket: boolean;
  serverListingId?: number;
  marketPrice?: number | null;
}

/** GET /items/:telegramId — fetch the user's collectible items. */
export async function fetchItems(telegramId: string): Promise<{ ok: boolean; exists: boolean; items: CollectibleItemApiShape[] }> {
  const failure = { ok: false, exists: false, items: [] };
  if (!telegramId) return failure;
  try {
    const res = await fetch(
      `${API_BASE}/items/${encodeURIComponent(telegramId)}?t=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!res.ok) return failure;
    const j = await res.json();
    if (!j?.ok) return failure;
    return { ok: true, exists: !!j.exists, items: Array.isArray(j.items) ? (j.items as CollectibleItemApiShape[]) : [] };
  } catch {
    return failure;
  }
}

/** POST /items/save — persist the user's items array. */
export async function saveItems(
  telegramId: string,
  items: ReadonlyArray<CollectibleItemApiShape>,
): Promise<{ ok: boolean; stale?: boolean }> {
  if (!telegramId) return { ok: false };
  try {
    const res = await fetch(`${API_BASE}/items/save`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, items, clientWriteAtMs: Date.now() }),
      keepalive: true,
    });
    if (!res.ok) return { ok: false };
    const j = await res.json().catch(() => ({}));
    return { ok: !!j?.ok, stale: !!j?.stale };
  } catch {
    return { ok: false };
  }
}

/** POST /items/craft — spend stardust and roll a random item of the requested type. */
export async function craftItemApi(
  telegramId: string,
  itemType: string,
): Promise<{ ok: boolean; won: boolean; item?: CollectibleItemApiShape; newStardustBalance?: number; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/items/craft`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, itemType }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, won: false, error: typeof j?.error === "string" ? j.error : `HTTP ${res.status}` };
    return { ok: true, won: !!j?.won, item: j?.item, newStardustBalance: j?.newStardustBalance, message: j?.message };
  } catch {
    return { ok: false, won: false, error: "Network error" };
  }
}

/** POST /market/list-item — list a collectible item on the marketplace. */
export async function listItemOnMarket(params: {
  sellerTelegramId: string;
  sellerName?: string;
  itemId: string;
  price: number;
}): Promise<{ ok: boolean; listing?: ServerMarketListing; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/market/list-item`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data?.error === "string" ? data.error : `HTTP ${res.status}` };
    return data;
  } catch {
    return { ok: false, error: "Network error" };
  }
}

// ─────────────────────────────────────────────────────────────────
//  LAB MYSTERY MODELS (100-model catalog)
// ─────────────────────────────────────────────────────────────────

export interface ZoomModelApiShape {
  id: string;
  modelId: string;
  name: string;
  category: string;
  rarity: string;
  rate: number;
  float: number;
  primaryColor: string;
  accentColor: string;
  shapeId?: string;
  createdAt: number;
  isListedInMarket: boolean;
  serverListingId?: number | null;
  marketPrice?: number | null;
}

/** GET /models/:telegramId */
export async function fetchModels(telegramId: string): Promise<{ ok: boolean; exists: boolean; models: ZoomModelApiShape[] }> {
  const failure = { ok: false, exists: false, models: [] };
  if (!telegramId) return failure;
  try {
    const res = await fetch(
      `${API_BASE}/models/${encodeURIComponent(telegramId)}?t=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!res.ok) return failure;
    const j = await res.json();
    if (!j?.ok) return failure;
    return { ok: true, exists: !!j.exists, models: Array.isArray(j.models) ? (j.models as ZoomModelApiShape[]) : [] };
  } catch {
    return failure;
  }
}

/** POST /forge/mystery-model — server roll from 100-model pool. */
export async function forgeMysteryModel(
  telegramId: string,
): Promise<{ ok: boolean; model?: ZoomModelApiShape; error?: string }> {
  if (!telegramId) return { ok: false, error: "Missing telegramId" };
  try {
    const res = await fetch(`${API_BASE}/forge/mystery-model`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof j?.error === "string" ? j.error : `HTTP ${res.status}` };
    return { ok: true, model: j?.model as ZoomModelApiShape | undefined };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/** POST /models/claim — persist a forged model to inventory. */
export async function claimModelApi(
  telegramId: string,
  model: ZoomModelApiShape,
): Promise<{ ok: boolean; duplicate?: boolean; model?: ZoomModelApiShape }> {
  if (!telegramId) return { ok: false };
  try {
    const res = await fetch(`${API_BASE}/models/claim`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, model }),
      keepalive: true,
    });
    if (!res.ok) return { ok: false };
    const j = await res.json().catch(() => ({}));
    return { ok: !!j?.ok, duplicate: !!j?.duplicate, model: j?.model as ZoomModelApiShape | undefined };
  } catch {
    return { ok: false };
  }
}

/** POST /models/save — mutable marketplace fields only. */
export async function saveModels(
  telegramId: string,
  models: ReadonlyArray<Pick<ZoomModelApiShape, "id" | "isListedInMarket" | "serverListingId" | "marketPrice">>,
): Promise<{ ok: boolean; stale?: boolean }> {
  if (!telegramId) return { ok: false };
  try {
    const res = await fetch(`${API_BASE}/models/save`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, models, clientWriteAtMs: Date.now() }),
      keepalive: true,
    });
    if (!res.ok) return { ok: false };
    const j = await res.json().catch(() => ({}));
    return { ok: !!j?.ok, stale: !!j?.stale };
  } catch {
    return { ok: false };
  }
}
