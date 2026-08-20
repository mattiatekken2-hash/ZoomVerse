import { useCallback, useEffect, useRef, useState } from "react";
import { claimDailyReward, fetchTasksState, peekTasksState, prefetchTasksState, claimTask, type TasksState, redeemServerCode, claimWeeklyRedStar, fetchWeeklyRedStarStatus } from "../utils/api";
import { useGlobalStore, refreshDailyStatus, applyDailyClaimResult } from "../store/globalStore";
import { useT } from "../i18n/LanguageContext";
import { SpaceTicketIcon, SpeedBoltIcon } from "../components/icons/GameIcons";


interface EarnPageProps {
  referralCode: string;
  referralCount: number;
  lastDailyClaimAt: number;
  referralSpeedBonus: number;
  referredBy: string | null;
  claimedMilestones: number[];
  telegramId: string | null;
  onClaimDaily: () => void;
  onRedeemCode: (code: string) => { success: boolean; amount?: number; isSun?: boolean; error?: string };
  /** Weekly REDSTAR bonus day (1–7). */
  weeklyRedStarDay?: number;
  weeklyRedStarClaimedToday?: boolean;
  /** Called after a successful claim so the parent can update redStarBalance. */
  onRedStarUpdate?: (newBalance: number) => void;
}

const WEEKLY_CYCLE_DAYS = 7;
const WEEKLY_REDSTAR_REWARD = 5;

const DAILY_REWARDS_BASE = [1, 1, 2, 2, 3, 4, 5];

// Must match artifacts/api-server/src/routes/referral.ts
const MILESTONES = [
  { count: 5, reward: 40 },
  { count: 10, reward: 70 },
  { count: 20, reward: 100 },
  { count: 50, reward: 180 },
  { count: 100, reward: 300 },
  { count: 200, reward: 500 },
];

const REFERRAL_STARDUST_PER_INVITE = 2;

// Client-side cooldown after the user opens the sponsor channel before
// the Claim button enables. The honor-system 10s gate exists so a user
// can't tap "Open" and "Claim" back-to-back without ever leaving the
// app — the server has no way to verify channel membership without an
// admin bot in the partner channel.
const SPONSOR_GATE_MS = 10_000;
// Per-user + per-task storage key so a shared device (e.g. family iPad
// with two Telegram accounts) can't have one account's "I opened the
// channel" timestamp unlock the Claim button on a second account, AND
// so opening one sponsor task doesn't unlock the Claim button on every
// other sponsor task in the list.
const CYAN_WHITE = "#9EC5E8";
const sponsorGateKey = (telegramId: string | null, taskId: string) =>
  `zoom:sponsor-gate-opened-at:${telegramId ?? "_anon"}:${taskId}`;

// Derive a localized human title from the sponsor URL. Used for sponsor
// tasks that don't carry an explicit label from the server. Kept
// client-side because it's purely cosmetic.
function sponsorTitle(t: (k: string, p?: Record<string, string | number>) => string, url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube")) return t("earn.sponsorOpenYouTube");
    if (u.hostname.includes("t.me")) {
      const path = u.pathname.replace(/^\//, "");
      if (path.startsWith("+")) return t("earn.sponsorJoinPrivate");
      // bot deep link with ?startapp=... → "Open @botname"
      const handle = path.split("/")[0] ?? path;
      if (handle) return t("earn.sponsorOpenHandle", { h: handle });
    }
    return t("earn.sponsorOpenLink", { h: u.hostname });
  } catch {
    return t("earn.sponsorOpenLink", { h: "" });
  }
}

// Translated requirement description per known sponsor task id. The
// server returns an Italian-only `requirementLabel` for logging /
// debugging; the client overrides it with the user's current language
// based on the task id so non-IT players see the right text.
const SPONSOR_REQ_KEY: Record<string, string> = {
  sponsor_giftkombat: "earn.reqGiftkombat",
  sponsor_izimoney: "earn.reqIzimoney",
  sponsor_yt_miketamago: "earn.reqMiketamago",
};

export function EarnPage({ referralCode, referralCount, referralSpeedBonus, referredBy, claimedMilestones, telegramId, onRedeemCode, weeklyRedStarDay = 1, weeklyRedStarClaimedToday = false, onRedStarUpdate }: EarnPageProps) {
  const { t } = useT();
  const firstName = (() => {
    try { return (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.first_name ?? null; } catch { return null; }
  })();
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<{ type: "success" | "error" | "sun"; message: string } | null>(null);
  const daily = useGlobalStore((s) => s.daily);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const nextAvailable = daily?.nextAvailableAt ?? 0;
  void tick;
  const canClaim = !!daily?.canClaim;
  const remainingMs = Math.max(0, nextAvailable - Date.now());
  const hLeft = Math.floor(remainingMs / 3600000);
  const mLeft = Math.floor((remainingMs % 3600000) / 60000);
  const sLeft = Math.floor((remainingMs % 60000) / 1000);

  const rewardsPreview = daily?.rewardsPreview ?? DAILY_REWARDS_BASE;
  const currentDay = daily?.streakDay ?? 0;
  const willHardReset = !!daily?.willHardReset;
  const streakRestart = canClaim && (willHardReset || currentDay >= 7);
  const displayDay = streakRestart ? 0 : currentDay;
  const upcomingDay = daily?.upcomingDay ?? 1;
  const upcomingReward = daily?.upcomingReward ?? DAILY_REWARDS_BASE[0];

  const handleClaimStreak = async () => {
    if (!telegramId || claiming || !canClaim) return;
    setClaiming(true);
    const res = await claimDailyReward(telegramId, firstName ?? undefined);
    setClaiming(false);
    if (res.ok && res.reward) {
      applyDailyClaimResult(res as Parameters<typeof applyDailyClaimResult>[0]);
      setClaimMsg(t("earn.stardustDay", { n: res.reward.toLocaleString(), d: res.day ?? 0 }));
      if (typeof res.stardustBalance === "number" && typeof res.balanceEpoch === "number") {
        window.dispatchEvent(new CustomEvent("zoom-server-stardust-snap", {
          detail: { stardustBalance: res.stardustBalance, epoch: res.balanceEpoch },
        }));
      }
      window.dispatchEvent(new Event("stardust-refresh"));
      window.dispatchEvent(new Event("zoom-data-refresh"));
      await refreshDailyStatus();
      setTimeout(() => setClaimMsg(null), 3500);
    } else {
      setClaimMsg(res.error || t("earn.claimFailed"));
      setTimeout(() => setClaimMsg(null), 3500);
    }
  };

  // IMPORTANT: this MUST be `?startapp=` (not `?start=`).
  //
  // `?start=<param>` only opens the bot's chat and sends `/start <param>`
  // as a message — Telegram does NOT pass that param into the Mini App's
  // initData, so the WebApp loads with WebApp.initDataUnsafe.start_param
  // = undefined and the referral code is lost. Production logs prior to
  // this fix showed every single user opening the app with
  // `startParam=null`, which is exactly why the inviter was never being
  // credited.
  //
  // `?startapp=<param>` is the Mini-App-specific deep link: it launches
  // the bot's main Mini App directly and exposes <param> through
  // WebApp.initDataUnsafe.start_param, where /referral/register picks it
  // up and credits the inviter (+20 ZOOM, +1 referralCount, milestones).
  const referralLink = `https://t.me/ZoomVerse_bot?startapp=${referralCode}`;

  const handleRedeem = async () => {
    const raw = redeemInput.trim();
    if (!raw) return;

    // 1) Try server-issued promo codes first (24h admin codes). On
    //    NOT_FOUND we fall through to the legacy local SUN/promo table
    //    so old hard-coded codes (SUN-****, etc.) keep working.
    if (telegramId) {
      const srv = await redeemServerCode(telegramId, raw);
      if (srv.ok) {
        let msg: string;
        if (srv.rewardType === "stardust") {
          msg = t("earn.stardustCredited", { n: (srv.rewardAmount ?? 0).toLocaleString() });
        } else if (srv.rewardType === "spins") {
          msg = t("earn.spinsCredited", { n: (srv.rewardAmount ?? 0).toLocaleString() });
        } else {
          msg = t("earn.zoomCredited", { n: (srv.rewardAmount ?? 0).toLocaleString() });
        }
        setRedeemStatus({ type: "success", message: msg });
        setRedeemInput("");
        // Trigger a full sync so stardust / spins / zoom balances refresh
        // immediately from the server (not just zoom via zoom-admin-refresh).
        window.dispatchEvent(new Event("zoom-data-refresh"));
        setTimeout(() => setRedeemStatus(null), 4000);
        return;
      }
      if (srv.error === "EXPIRED") {
        setRedeemStatus({ type: "error", message: t("earn.codeExpired") });
        setTimeout(() => setRedeemStatus(null), 4000);
        return;
      }
      if (srv.error === "ALREADY_USED") {
        setRedeemStatus({ type: "error", message: t("earn.codeAlreadyUsed") });
        setTimeout(() => setRedeemStatus(null), 4000);
        return;
      }
      // Only fall back to the legacy local table on NOT_FOUND so SUN
      // codes & old hard-coded promos still work. NETWORK / DB_ERROR /
      // BAD_REQUEST are transient server problems — surfacing them as
      // "invalid code" via the legacy fallback would mislead the user
      // into thinking a valid code is bad.
      if (srv.error && srv.error !== "NOT_FOUND") {
        setRedeemStatus({ type: "error", message: t("earn.codeServerError") });
        setTimeout(() => setRedeemStatus(null), 4000);
        return;
      }
    }

    const result = onRedeemCode(raw);
    if (result.success) {
      if (result.isSun) {
        setRedeemStatus({ type: "sun", message: t("earn.sunAdded") });
      } else {
        setRedeemStatus({ type: "success", message: t("earn.zoomCredited", { n: result.amount?.toLocaleString() ?? "0" }) });
      }
      setRedeemInput("");
    } else {
      setRedeemStatus({ type: "error", message: result.error || t("earn.invalidCode") });
    }
    setTimeout(() => setRedeemStatus(null), 4000);
  };

  const nextMilestone = MILESTONES.find(m => m.count > referralCount);

  // ───────────────── Long-term tasks (planet milestones + sponsor) ─────────────────
  // Paint instantly from cache/catalog — never flash a loading screen on tab open.
  const [tasks, setTasks] = useState<TasksState>(() => peekTasksState(telegramId));
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);

  // ── Weekly REDSTAR bonus (5/day × 7 days, then repeats) ──
  const [cycleDay, setCycleDay] = useState(weeklyRedStarDay);
  const [claimedToday, setClaimedToday] = useState(weeklyRedStarClaimedToday);
  const [claimingRedStar, setClaimingRedStar] = useState(false);
  const [redStarMsg, setRedStarMsg] = useState<string | null>(null);

  useEffect(() => {
    setCycleDay(weeklyRedStarDay);
    setClaimedToday(weeklyRedStarClaimedToday);
  }, [weeklyRedStarDay, weeklyRedStarClaimedToday]);

  useEffect(() => {
    if (!telegramId) return;
    void fetchWeeklyRedStarStatus(telegramId).then((res) => {
      if (res.ok && typeof res.cycleDay === "number") {
        setCycleDay(res.cycleDay);
        setClaimedToday(!!res.claimedToday);
      }
    });
  }, [telegramId]);

  const handleClaimWeeklyRedStar = async () => {
    if (!telegramId || claimingRedStar || claimedToday) return;
    setClaimingRedStar(true);
    try {
      const res = await claimWeeklyRedStar(telegramId);
      if (res.ok) {
        if (typeof res.cycleDay === "number") setCycleDay(res.cycleDay);
        setClaimedToday(true);
        if (typeof res.newRedStarBalance === "number") {
          onRedStarUpdate?.(res.newRedStarBalance);
        }
        setRedStarMsg(`+${res.reward ?? WEEKLY_REDSTAR_REWARD} ★ REDSTAR · Day ${res.cycleDay ?? cycleDay}/${WEEKLY_CYCLE_DAYS}`);
      } else {
        setRedStarMsg(res.error === "Already claimed today" ? t("earn.alreadyClaimedToday") : (res.error ?? t("earn.claimFailed")));
      }
    } finally {
      setClaimingRedStar(false);
      setTimeout(() => setRedStarMsg(null), 3500);
    }
  };

  // Per-task "channel opened at" timestamps. Persisted per (user, taskId)
  // so the 10s countdown survives a reload AND opening one sponsor task
  // doesn't accidentally unlock the Claim button on every other sponsor
  // task. Hydrated from localStorage whenever the visible sponsor task
  // list (or the user) changes.
  const [sponsorOpenedAt, setSponsorOpenedAt] = useState<Record<string, number>>({});
  const sponsorTaskIds = (tasks?.sponsorTasks ?? []).map((t) => t.id).join(",");
  useEffect(() => {
    if (!sponsorTaskIds) return;
    const next: Record<string, number> = {};
    for (const id of sponsorTaskIds.split(",")) {
      if (!id) continue;
      try {
        const raw = localStorage.getItem(sponsorGateKey(telegramId, id));
        const n = raw ? Number(raw) : 0;
        next[id] = Number.isFinite(n) && n > 0 ? n : 0;
      } catch { next[id] = 0; }
    }
    setSponsorOpenedAt(next);
  }, [telegramId, sponsorTaskIds]);
  const tasksTickRef = useRef(0);
  void tasksTickRef;

  const reloadTasks = useCallback(async () => {
    if (!telegramId) return;
    setTasksError(null);
    // Keep current UI; refresh silently in the background.
    const s = await fetchTasksState(telegramId);
    if (s) setTasks(s);
    else if (!peekTasksState(telegramId).planetTasks.length) {
      setTasksError(t("earn.couldNotLoadTasks"));
    }
  }, [telegramId, t]);

  useEffect(() => {
    setTasks(peekTasksState(telegramId));
    void reloadTasks();
  }, [telegramId, reloadTasks]);

  useEffect(() => {
    const handler = () => { void reloadTasks(); };
    window.addEventListener("zoom-data-refresh", handler);
    return () => { window.removeEventListener("zoom-data-refresh", handler); };
  }, [reloadTasks]);

  const handleClaimTask = async (taskId: string) => {
    if (!telegramId || claimingTaskId) return;
    setClaimingTaskId(taskId);
    const res = await claimTask(telegramId, taskId);
    setClaimingTaskId(null);
    if (res.ok) {
      const parts: string[] = [];
      if (res.rewardZoom && res.rewardZoom > 0) {
        parts.push(`+${res.rewardZoom.toLocaleString()} $ZOOM`);
        // Mirror the daily-claim UX: optimistic balance bump via the
        // global event the header listens to, plus a refresh ping.
        window.dispatchEvent(new CustomEvent("zoom-credit-local", { detail: { amount: res.rewardZoom } }));
      }
      if (res.rewardSpins && res.rewardSpins > 0) {
        parts.push(t(res.rewardSpins > 1 ? "earn.spinsCreditedMany" : "earn.spinsCreditedOne", { n: res.rewardSpins }));
      }
      if (res.rewardStardust && res.rewardStardust > 0) {
        parts.push(`+${res.rewardStardust.toLocaleString()} Stardust`);
      }
      setTaskMsg(parts.join(" · ") || t("earn.claimedBtn"));
      window.dispatchEvent(new Event("zoom-data-refresh"));
      await reloadTasks();
    } else if (res.error === "ALREADY_CLAIMED") {
      setTaskMsg(t("earn.alreadyClaimed"));
      await reloadTasks();
    } else if (res.error === "THRESHOLD_NOT_MET") {
      setTaskMsg(t("earn.thresholdNotMet", { need: String(res.threshold ?? 0), t: String(res.threshold ?? 0), b: String(res.planetsBuilt ?? 0) }));
      await reloadTasks();
    } else if (res.error === "INELIGIBLE") {
      const reqKey = SPONSOR_REQ_KEY[taskId];
      setTaskMsg(reqKey ? t(reqKey) : (res.requirementLabel || t("earn.requirementFallback")));
      await reloadTasks();
    } else {
      setTaskMsg(t("earn.claimFailed"));
    }
    setTimeout(() => setTaskMsg(null), 4500);
  };

  const handleOpenSponsor = (taskId: string, url: string) => {
    const now = Date.now();
    setSponsorOpenedAt((prev) => ({ ...prev, [taskId]: now }));
    try { localStorage.setItem(sponsorGateKey(telegramId, taskId), String(now)); } catch {}
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.openTelegramLink && url.startsWith("https://t.me/")) {
        tg.openTelegramLink(url);
        return;
      }
      if (tg?.openLink) {
        tg.openLink(url);
        return;
      }
    } catch {}
    window.open(url, "_blank");
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto earn-page">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-2xl tracking-tight" style={{ color: "var(--earn-ink)" }}>{t("earn.title")}</h2>
        <p className="text-[12px] mt-1 leading-snug" style={{ color: "var(--earn-muted)" }}>
          {t("earn.subtitleLabFirst")}
        </p>
      </div>

      <div className="px-4 pb-7 flex flex-col gap-4">
        {/* How to earn */}
        <div className="earn-hero">
          <div className="earn-section-kicker mb-2.5" style={{ color: "var(--earn-cyan)" }}>
            {t("earn.howTitle")}
          </div>
          <p className="text-[11px] font-semibold leading-snug mb-2.5" style={{ color: "var(--earn-muted)" }}>
            {t("earn.howLead")}
          </p>
          <div className="earn-steps">
            {[
              { n: "1", text: t("earn.how1"), accent: "var(--earn-gold)" },
              { n: "2", text: t("earn.how2"), accent: "#ff3355" },
              { n: "3", text: t("earn.how3"), accent: "var(--earn-cyan)" },
              { n: "4", text: t("earn.how4"), accent: "#b8d4ee" },
            ].map((step) => (
              <div key={step.n} className="earn-step">
                <div className="earn-step__num" style={{ color: step.accent, border: `1px solid ${step.accent}` }}>
                  {step.n}
                </div>
                <p className="text-[12px] font-semibold leading-snug pt-0.5" style={{ color: "rgba(232,236,244,0.9)" }}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Daily */}
        <section className="earn-panel">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="earn-section-kicker" style={{ color: "rgba(255,215,64,0.85)" }}>{t("earn.stepDaily")}</div>
              <div className="font-black text-[17px] tracking-wide mt-0.5" style={{ color: "var(--earn-ink)" }}>{t("earn.dailyStreak")}</div>
            </div>
            <div className="earn-reward-chip earn-reward-chip--gold" aria-label={`+${Math.round(upcomingReward)} stardust`}>
              +{Math.round(upcomingReward)} ★
            </div>
          </div>

          {streakRestart && (
            <div
              className="mb-3 rounded-xl px-3 py-2 text-[11px] font-bold text-center"
              style={{ color: "#ffb347", background: "rgba(255,179,71,0.08)", border: "1px solid rgba(255,179,71,0.22)" }}
            >
              {willHardReset ? t("earn.streakExpiredReset") : t("earn.streakWeekComplete")}
            </div>
          )}

          <div className="grid grid-cols-7 gap-1.5 mb-3">
            {rewardsPreview.map((amt, i) => {
              const dayNum = i + 1;
              const isClaimed = dayNum <= displayDay;
              const isNext = dayNum === upcomingDay && canClaim;
              return (
                <div
                  key={dayNum}
                  className={`earn-day p-1.5 flex flex-col items-center justify-center border ${isNext ? "earn-day--next" : ""}`}
                  style={{
                    aspectRatio: "1 / 1.12",
                    borderColor: isClaimed ? "rgba(0,230,118,0.4)" : isNext ? "rgba(158,197,232,0.65)" : "rgba(255,255,255,0.07)",
                    background: isClaimed ? "rgba(0,230,118,0.12)" : isNext ? "rgba(158,197,232,0.14)" : "rgba(255,255,255,0.025)",
                  }}
                  data-testid={`day-${dayNum}`}
                >
                  <div className="text-[8px] font-bold" style={{ color: isClaimed ? "#00e676" : isNext ? "#9EC5E8" : "rgba(255,255,255,0.4)" }}>
                    D{dayNum}
                  </div>
                  <div className="text-[11px] font-black mt-0.5 tabular-nums" style={{ color: isClaimed ? "#00e676" : isNext ? "#fff" : "rgba(255,255,255,0.6)" }}>
                    {Math.round(amt)}
                    <span style={{ color: "#ffd740", fontSize: 9 }}>★</span>
                  </div>
                  {isClaimed && <div className="text-[8px] leading-none" style={{ color: "#00e676" }}>✓</div>}
                </div>
              );
            })}
          </div>

          <button
            className={`earn-cta ${canClaim && !claiming ? "earn-cta--primary" : ""}`}
            onClick={handleClaimStreak}
            disabled={!canClaim || claiming}
            data-testid="button-claim-daily"
          >
            {claiming
              ? t("earn.claiming")
              : canClaim
                ? `${t("earn.claimBtn")} · D${upcomingDay} · +${Math.round(upcomingReward)} ★`
                : t("earn.nextIn", { h: hLeft, m: mLeft, s: sLeft })}
          </button>
          {claimMsg && (
            <div className="mt-2 text-center text-xs font-bold py-2 rounded-lg" style={{ color: "#00e676", background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)" }}>
              {claimMsg}
            </div>
          )}
          <p className="mt-2.5 text-[10px] text-center leading-snug" style={{ color: "rgba(255,255,255,0.34)" }}>
            {t("earn.dailyPizzaHint")}
          </p>
        </section>

        {/* Weekly REDSTAR */}
        <section className="earn-panel">
          <div className="earn-section-kicker mb-2" style={{ color: "rgba(255,51,85,0.9)" }}>{t("earn.stepRedStar")}</div>
          <div className="flex items-center gap-3 mb-3">
            <div style={{ fontSize: 22, lineHeight: 1, color: "#ff3355" }}>★</div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-[15px] tracking-wide" style={{ color: "var(--earn-ink)" }}>{t("earn.watchAndEarn")}</div>
              <p className="text-[11px] font-semibold mt-1 leading-snug" style={{ color: "var(--earn-muted)" }}>
                {t("earn.redStarHint")}
              </p>
              <div className="mt-1.5">
                <span className="earn-reward-chip">+{WEEKLY_REDSTAR_REWARD} ★ REDSTAR / day</span>
              </div>
            </div>
            <div
              className="flex flex-col items-center justify-center rounded-lg px-2.5 py-1 border font-black tabular-nums"
              style={{
                background: claimedToday ? "rgba(0,230,118,0.08)" : "rgba(158,197,232,0.08)",
                borderColor: claimedToday ? "rgba(0,230,118,0.28)" : "rgba(158,197,232,0.22)",
                color: claimedToday ? "#00e676" : "#E8ECF4",
                minWidth: 48,
              }}
            >
              <div style={{ fontSize: 14 }}>{cycleDay}/{WEEKLY_CYCLE_DAYS}</div>
            </div>
          </div>
          <div className="flex gap-1.5 mb-3">
            {Array.from({ length: WEEKLY_CYCLE_DAYS }, (_, i) => {
              const dayNum = i + 1;
              const done = claimedToday ? dayNum <= cycleDay : dayNum < cycleDay;
              const active = dayNum === cycleDay;
              return (
                <div
                  key={dayNum}
                  className="flex-1 h-1.5 rounded-full"
                  style={{
                    background: done
                      ? "linear-gradient(90deg, #c62828, #ff3355)"
                      : active
                        ? "linear-gradient(90deg, #ff6b81, #ff3355)"
                        : "rgba(255,51,85,0.12)",
                    boxShadow: active ? "0 0 8px rgba(255,51,85,0.45)" : "none",
                  }}
                />
              );
            })}
          </div>
          <button
            onClick={() => void handleClaimWeeklyRedStar()}
            disabled={claimingRedStar || claimedToday || !telegramId}
            className={`earn-cta ${!claimedToday && !claimingRedStar && telegramId ? "earn-cta--primary" : ""}`}
          >
            {claimedToday
              ? t("earn.claimedTodayReturn")
              : claimingRedStar
                ? t("earn.claimingRedStar")
                : `${t("earn.claimBtn")} · +${WEEKLY_REDSTAR_REWARD} ★ REDSTAR`}
          </button>
          {redStarMsg && (
            <div
              className="mt-2 text-center text-xs font-bold py-2 rounded-lg"
              style={{
                color: redStarMsg.startsWith("+") ? "#00e676" : "#ffb347",
                background: redStarMsg.startsWith("+") ? "rgba(0,230,118,0.08)" : "rgba(255,183,71,0.08)",
                border: `1px solid ${redStarMsg.startsWith("+") ? "rgba(0,230,118,0.2)" : "rgba(255,183,71,0.2)"}`,
              }}
            >
              {redStarMsg}
            </div>
          )}
        </section>

        {/* Lab tasks */}
        <section className="earn-panel">
          <div className="flex items-end justify-between mb-3">
            <div className="min-w-0 pr-2">
              <div className="earn-section-kicker" style={{ color: "rgba(158,197,232,0.85)" }}>{t("earn.stepLab")}</div>
              <div className="font-black text-[17px] tracking-wide mt-0.5" style={{ color: "var(--earn-ink)" }}>{t("earn.tasks")}</div>
              <div className="text-[10px] font-bold mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{t("earn.tasksSub")}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{t("earn.built")}</div>
              <div className="text-lg font-black tabular-nums" style={{ color: "var(--earn-cyan)" }}>
                {tasks.planetsBuilt.toLocaleString()}
              </div>
            </div>
          </div>

          {tasksError && (
            <div className="text-center text-xs py-2 mb-2 rounded-lg" style={{ color: "#ff5252", background: "rgba(255,82,82,0.06)", border: "1px solid rgba(255,82,82,0.18)" }}>
              {tasksError}
            </div>
          )}

          <div className="flex flex-col gap-2">
              {tasks.planetTasks.map((task) => {
                const pct = Math.min(100, Math.round((tasks.planetsBuilt / task.threshold) * 100));
                const isClaiming = claimingTaskId === task.id;
                const rewardN = Number(task.rewardZoom ?? 0);
                return (
                  <div
                    key={task.id}
                    className={`earn-row flex-col !items-stretch ${task.claimed ? "earn-row--done" : task.claimable ? "earn-row--ready" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-[12px] font-black tracking-wide" style={{ color: task.claimed ? "#00e676" : "var(--earn-ink)" }}>
                          {t("earn.buildPlanetsN", { n: task.threshold.toLocaleString() })}
                        </div>
                        <div className="mt-1">
                          <span className={`earn-reward-chip ${task.claimed ? "earn-reward-chip--ok" : ""}`}>
                            +{rewardN.toLocaleString()} $ZOOM
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => void handleClaimTask(task.id)}
                        disabled={task.claimed || !task.claimable || isClaiming}
                        className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase shrink-0"
                        style={{
                          background: task.claimed ? "rgba(0,230,118,0.1)" : task.claimable ? "linear-gradient(135deg, #F2F5FA, #9EC5E8)" : "rgba(255,255,255,0.04)",
                          color: task.claimed ? "#00e676" : task.claimable ? "#0a1220" : "rgba(255,255,255,0.28)",
                          border: task.claimed ? "1px solid rgba(0,230,118,0.25)" : "1px solid rgba(255,255,255,0.06)",
                          cursor: task.claimed || !task.claimable || isClaiming ? "not-allowed" : "pointer",
                          minWidth: 84,
                        }}
                        data-testid={`button-task-${task.id}`}
                      >
                        {task.claimed ? t("earn.claimedBtn") : isClaiming ? "…" : task.claimable ? t("earn.claimBtn") : t("earn.lockedBtn")}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="earn-progress flex-1">
                        <i style={{ width: `${pct}%`, background: task.claimed ? "linear-gradient(90deg,#00e676,#00c853)" : undefined }} />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.5)", minWidth: 64, textAlign: "right" }}>
                        {Math.min(tasks.planetsBuilt, task.threshold).toLocaleString()}/{task.threshold.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}

              {tasks.sponsorTasks.map((task) => {
                const isClaiming = claimingTaskId === task.id;
                const openedAt = sponsorOpenedAt[task.id] ?? 0;
                const gateRemainingMs = openedAt > 0
                  ? Math.max(0, SPONSOR_GATE_MS - (Date.now() - openedAt))
                  : SPONSOR_GATE_MS;
                const gateOpen = openedAt > 0 && gateRemainingMs === 0;
                const remainingS = Math.ceil(gateRemainingMs / 1000);
                const title = task.id === "sponsor_coinflip"
                  ? t("earn.sponsorJoinHandle", { h: "coinflip_vip" })
                  : sponsorTitle(t, task.url);
                const isLocked = !task.claimed && !task.eligible;
                const canClaimNow = !task.claimed && task.eligible && gateOpen;
                const showOpen = !task.claimed && task.eligible && openedAt === 0;
                const showWait = !task.claimed && task.eligible && openedAt > 0 && !gateOpen;
                const zoomN = Number(task.rewardZoom ?? 0);
                const dustN = Number(task.rewardStardust ?? 0);
                const spinsN = Number(task.rewardSpins ?? 0);
                return (
                  <div key={task.id} className={`earn-row flex-col !items-stretch ${task.claimed ? "earn-row--done" : ""}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="min-w-0 pr-2">
                        <div className="text-[12px] font-black truncate" style={{ color: task.claimed ? "#00e676" : isLocked ? "rgba(255,255,255,0.45)" : "var(--earn-ink)" }}>
                          {title}
                        </div>
                        <div className="mt-1">
                          {zoomN > 0 && <span className="earn-reward-chip">+{zoomN.toLocaleString()} $ZOOM</span>}
                          {dustN > 0 && <span className="earn-reward-chip earn-reward-chip--gold">+{dustN.toLocaleString()} ★</span>}
                          {spinsN > 0 && <span className="earn-reward-chip">+{spinsN} spins</span>}
                        </div>
                      </div>
                      {task.claimed ? (
                        <button disabled className="px-3 py-2 rounded-lg font-black text-[11px] uppercase" style={{ background: "rgba(0,230,118,0.1)", color: "#00e676", border: "1px solid rgba(0,230,118,0.25)", minWidth: 84 }} data-testid={`button-task-${task.id}`}>
                          {t("earn.claimedBtn")}
                        </button>
                      ) : isLocked ? (
                        <button disabled className="px-3 py-2 rounded-lg font-black text-[11px] uppercase" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.06)", minWidth: 84 }} data-testid={`button-task-${task.id}-locked`}>
                          {t("earn.lockedBtn")}
                        </button>
                      ) : showOpen ? (
                        <button onClick={() => handleOpenSponsor(task.id, task.url)} className="px-3 py-2 rounded-lg font-black text-[11px] uppercase" style={{ background: "rgba(158,197,232,0.16)", color: CYAN_WHITE, border: "1px solid rgba(158,197,232,0.3)", minWidth: 84 }} data-testid={`button-task-${task.id}-open`}>
                          {t("earn.openBtn")}
                        </button>
                      ) : showWait ? (
                        <button disabled className="px-3 py-2 rounded-lg font-black text-[11px] uppercase tabular-nums" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 84 }} data-testid={`button-task-${task.id}-wait`}>
                          {remainingS}s
                        </button>
                      ) : (
                        <button onClick={() => void handleClaimTask(task.id)} disabled={!canClaimNow || isClaiming} className="px-3 py-2 rounded-lg font-black text-[11px] uppercase" style={{ background: canClaimNow ? "linear-gradient(135deg,#F2F5FA,#9EC5E8)" : "rgba(255,255,255,0.04)", color: canClaimNow ? "#0a1220" : "rgba(255,255,255,0.25)", border: "1px solid transparent", minWidth: 84 }} data-testid={`button-task-${task.id}-claim`}>
                          {isClaiming ? "…" : t("earn.claimBtn")}
                        </button>
                      )}
                    </div>
                    {!task.claimed && (() => {
                      const reqKey = SPONSOR_REQ_KEY[task.id];
                      const hintText = isLocked
                        ? (reqKey ? t(reqKey) : (task.requirementLabel || t("earn.requirementFallback")))
                        : (reqKey ? t(reqKey) : t("earn.sponsorHint"));
                      return <div className="text-[10px]" style={{ color: isLocked ? "#ff9b6e" : "rgba(255,255,255,0.35)" }}>{hintText}</div>;
                    })()}
                  </div>
                );
              })}
            </div>
          {taskMsg && (
            <div className="mt-3 text-center text-xs font-bold py-2 rounded-lg" style={{ color: "#00e676", background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)" }}>
              {taskMsg}
            </div>
          )}
        </section>

        {/* Invite */}
        <section className="earn-panel">
          <div className="mb-3">
            <div className="earn-section-kicker" style={{ color: "rgba(158,197,232,0.75)" }}>{t("earn.stepInvite")}</div>
            <div className="font-black text-[17px] tracking-wide mt-0.5" style={{ color: "var(--earn-ink)" }}>{t("earn.referralProgram")}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="earn-reward-chip earn-reward-chip--gold">+{REFERRAL_STARDUST_PER_INVITE} ★ / invite</span>
              <span className="earn-reward-chip">+0.1 TON</span>
            </div>
          </div>

          <button
            onClick={() => {
              const text = encodeURIComponent(t("earn.shareInviteText"));
              const url = encodeURIComponent(referralLink);
              window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
            }}
            className="earn-cta earn-cta--ghost mb-2"
          >
            {t("earn.inviteFriends")}
          </button>
          <div className="flex items-center gap-2 text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>{t("earn.idLabel")}</span>
            <span className="font-bold font-mono" style={{ color: "var(--earn-cyan)" }}>{referralCode}</span>
            <span>·</span>
            <span className="font-bold" style={{ color: "#00e676" }}>{referralCount.toLocaleString()} invited</span>
          </div>

          {referralSpeedBonus > 0 && (
            <div className="mb-3 rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ border: "1px solid rgba(0,230,118,0.22)", background: "rgba(0,230,118,0.05)" }}>
              <SpeedBoltIcon size={20} />
              <div className="flex-1 min-w-0">
                <div className="font-black text-xs" style={{ color: "#00e676" }}>+{Math.round(referralSpeedBonus * 100)}% speed</div>
                <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{referredBy ? t("earn.speedActiveJoined") : t("earn.speedActiveSub")}</div>
              </div>
            </div>
          )}

          <div className="earn-section-kicker mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>{t("earn.referralMilestones")}</div>
          {nextMilestone && (
            <div className="mb-3">
              <div className="flex justify-between text-[11px] mb-1.5">
                <span style={{ color: "rgba(232,236,244,0.6)" }}>
                  {nextMilestone.count} invites → +{nextMilestone.reward.toLocaleString()} $ZOOM
                </span>
                <span className="font-bold tabular-nums" style={{ color: "var(--earn-cyan)" }}>{referralCount}/{nextMilestone.count}</span>
              </div>
              <div className="earn-progress">
                <i style={{ width: `${Math.min((referralCount / nextMilestone.count) * 100, 100)}%` }} />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {MILESTONES.map((m) => {
              const reached = referralCount >= m.count;
              const claimed = claimedMilestones.includes(m.count);
              const isCurrent = m === nextMilestone;
              return (
                <div
                  key={m.count}
                  className="flex items-center justify-between py-2 px-3 rounded-xl"
                  style={{
                    border: `1px solid ${claimed ? "rgba(0,230,118,0.22)" : isCurrent ? "rgba(158,197,232,0.22)" : "rgba(255,255,255,0.05)"}`,
                    background: claimed ? "rgba(0,230,118,0.05)" : isCurrent ? "rgba(158,197,232,0.04)" : "transparent",
                  }}
                >
                  <span className="text-xs font-bold" style={{ color: claimed ? "#00e676" : reached ? "#C9D6E8" : isCurrent ? "#9EC5E8" : "rgba(255,255,255,0.32)" }}>
                    {m.count} invites
                  </span>
                  {claimed ? (
                    <span className="earn-reward-chip earn-reward-chip--ok">{t("earn.claimedTick")}</span>
                  ) : (
                    <span className="earn-reward-chip">+{m.reward.toLocaleString()} $ZOOM</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Redeem */}
        <section className="earn-panel">
          <div className="flex items-center gap-2 mb-3">
            <SpaceTicketIcon size={22} />
            <div className="font-black text-[15px]" style={{ color: "var(--earn-ink)" }}>{t("earn.redeemCode")}</div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
              placeholder=""
              className="flex-1 px-3 py-2.5 rounded-xl text-sm font-mono font-bold uppercase outline-none"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(158,197,232,0.2)", color: "var(--earn-cyan)", letterSpacing: "0.06em" }}
              data-testid="input-redeem-code"
            />
            <button onClick={handleRedeem} className="earn-cta earn-cta--ghost !w-auto px-4" data-testid="button-redeem">
              {t("earn.go")}
            </button>
          </div>
          {redeemStatus && (
            <div
              className="mt-2 text-xs font-bold text-center py-2.5 rounded-xl"
              style={{
                color: redeemStatus.type === "error" ? "#ff5252" : redeemStatus.type === "sun" ? "#ffb347" : "#00e676",
                background: redeemStatus.type === "error" ? "rgba(255,82,82,0.08)" : redeemStatus.type === "sun" ? "rgba(255,179,71,0.1)" : "rgba(0,230,118,0.08)",
                border: `1px solid ${redeemStatus.type === "error" ? "rgba(255,82,82,0.2)" : redeemStatus.type === "sun" ? "rgba(255,179,71,0.25)" : "rgba(0,230,118,0.2)"}`,
              }}
            >
              {redeemStatus.message}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
