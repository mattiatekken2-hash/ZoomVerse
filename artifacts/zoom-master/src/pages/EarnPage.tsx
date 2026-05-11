import { useCallback, useEffect, useRef, useState } from "react";
import { claimDailyReward, fetchTasksState, claimTask, type TasksState, redeemServerCode } from "../utils/api";
import { useGlobalStore, refreshDailyStatus } from "../store/globalStore";
import { useT } from "../i18n/LanguageContext";


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
}

const DAILY_REWARDS_BASE = [50, 100, 200, 400, 800, 1500, 3000];

const MILESTONES = [
  { count: 5, reward: 500 },
  { count: 10, reward: 1000 },
  { count: 20, reward: 2000 },
  { count: 50, reward: 5000 },
  { count: 100, reward: 12000 },
  { count: 200, reward: 30000 },
];

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
const sponsorGateKey = (telegramId: string | null, taskId: string) =>
  `zoom:sponsor-gate-opened-at:${telegramId ?? "_anon"}:${taskId}`;

// Derive a human title from the sponsor URL. Used for sponsor tasks
// that don't carry an explicit label from the server. Kept client-side
// because it's purely cosmetic.
function sponsorTitle(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube")) return "Apri canale YouTube";
    if (u.hostname.includes("t.me")) {
      const path = u.pathname.replace(/^\//, "");
      if (path.startsWith("+")) return "Entra nel canale privato";
      // bot deep link with ?startapp=... → "Apri @botname"
      const handle = path.split("/")[0] ?? path;
      if (handle) return `Apri @${handle}`;
    }
    return `Apri ${u.hostname}`;
  } catch {
    return "Apri il link";
  }
}

export function EarnPage({ referralCode, referralCount, referralSpeedBonus, referredBy, claimedMilestones, telegramId, onRedeemCode }: EarnPageProps) {
  const { t } = useT();
  const firstName = (() => {
    try { return (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.first_name ?? null; } catch { return null; }
  })();
  const [copied, setCopied] = useState(false);
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

  const cycle = daily?.streakCycle ?? 0;
  const cyclePct = Math.round((1 + cycle * 0.01 - 1) * 10000) / 100;
  const rewardsPreview = daily?.rewardsPreview ?? DAILY_REWARDS_BASE;
  const currentDay = daily?.streakDay ?? 0;
  const upcomingDay = daily?.upcomingDay ?? 1;
  const upcomingReward = daily?.upcomingReward ?? DAILY_REWARDS_BASE[0];

  const handleClaimStreak = async () => {
    if (!telegramId || claiming || !canClaim) return;
    setClaiming(true);
    const res = await claimDailyReward(telegramId, firstName ?? undefined);
    setClaiming(false);
    if (res.ok && res.reward) {
      setClaimMsg(t("earn.zoomDay", { n: res.reward.toLocaleString(), d: res.day ?? 0 }));
      window.dispatchEvent(new CustomEvent("zoom-credit-local", { detail: { amount: res.reward } }));
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

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
        // Force the global store to re-pull balances (zoom / stardust / spins).
        window.dispatchEvent(new Event("zoom-admin-refresh"));
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
  const prevMilestone = MILESTONES.filter(m => m.count <= referralCount).pop();

  // ───────────────── Long-term tasks (planet milestones + sponsor) ─────────────────
  const [tasks, setTasks] = useState<TasksState | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
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
    setTasksLoading(true);
    setTasksError(null);
    const s = await fetchTasksState(telegramId);
    if (s) setTasks(s); else setTasksError(t("earn.couldNotLoadTasks"));
    setTasksLoading(false);
  }, [telegramId]);

  useEffect(() => { void reloadTasks(); }, [reloadTasks]);

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
      setTaskMsg(t("earn.thresholdNotMet", { t: String(res.threshold ?? 0), b: String(res.planetsBuilt ?? 0) }));
      await reloadTasks();
    } else if (res.error === "INELIGIBLE") {
      setTaskMsg(res.requirementLabel || "Requisiti non soddisfatti");
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
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-lg tracking-tight">{t("earn.title")}</h2>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{t("earn.subtitle")}</p>
      </div>

      <div className="px-4 pb-4 flex flex-col gap-4">
        {/* 7-Day Streak Daily Reward */}
        <div
          className="rounded-2xl p-4 border"
          style={{ borderColor: "rgba(0,242,254,0.15)", background: "rgba(0,242,254,0.04)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="text-2xl">🎁</div>
              <div>
                <div className="font-black text-base tracking-wide neon-text">{t("earn.dailyStreak")}</div>
                <div className="text-[10px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {t("earn.streakLoop", { n: cycle + 1, pct: cyclePct.toFixed(0) })}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{t("earn.next")}</div>
              <div className="text-sm font-black neon-text">+{Math.round(upcomingReward).toLocaleString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-3">
            {rewardsPreview.map((amt, i) => {
              const dayNum = i + 1;
              const isClaimed = dayNum <= currentDay;
              const isNext = dayNum === upcomingDay && canClaim;
              const isMega = dayNum === 7;
              return (
                <div
                  key={dayNum}
                  className="rounded-lg p-1.5 flex flex-col items-center justify-center border transition-all"
                  style={{
                    aspectRatio: "1 / 1.15",
                    borderColor: isClaimed
                      ? "rgba(0,230,118,0.4)"
                      : isNext
                        ? "#00f2fe"
                        : isMega
                          ? "rgba(255,215,0,0.25)"
                          : "rgba(255,255,255,0.06)",
                    background: isClaimed
                      ? "rgba(0,230,118,0.1)"
                      : isNext
                        ? "rgba(0,242,254,0.12)"
                        : isMega
                          ? "rgba(255,215,0,0.05)"
                          : "rgba(255,255,255,0.02)",
                    boxShadow: isNext ? "0 0 12px rgba(0,242,254,0.5)" : "none",
                  }}
                  data-testid={`day-${dayNum}`}
                >
                  <div className="text-[8px] font-bold tracking-wider" style={{ color: isClaimed ? "#00e676" : isNext ? "#00f2fe" : isMega ? "#ffd700" : "rgba(255,255,255,0.4)" }}>
                    D{dayNum}
                  </div>
                  <div className="text-[10px] font-black leading-tight mt-0.5" style={{ color: isClaimed ? "#00e676" : isNext ? "#fff" : isMega ? "#ffd700" : "rgba(255,255,255,0.55)" }}>
                    {amt >= 1000 ? `${(amt / 1000).toFixed(amt % 1000 === 0 ? 0 : 1)}K` : Math.round(amt)}
                  </div>
                  {isClaimed && <div className="text-[8px]" style={{ color: "#00e676" }}>✓</div>}
                </div>
              );
            })}
          </div>

          <button
            className="w-full py-3.5 rounded-xl font-black text-sm tracking-wider uppercase transition-all active:scale-95 border"
            onClick={handleClaimStreak}
            disabled={!canClaim || claiming}
            style={{
              background: canClaim && !claiming ? "linear-gradient(135deg, #00f2fe, #4facfe)" : "rgba(255,255,255,0.04)",
              color: canClaim && !claiming ? "#060810" : "rgba(255,255,255,0.2)",
              boxShadow: canClaim && !claiming ? "0 0 24px rgba(0,242,254,0.4)" : "none",
              borderColor: canClaim && !claiming ? "transparent" : "rgba(255,255,255,0.06)",
              cursor: canClaim && !claiming ? "pointer" : "not-allowed",
            }}
            data-testid="button-claim-daily"
          >
            {claiming
              ? t("earn.claiming")
              : canClaim
                ? t("earn.claimDayBtn", { n: upcomingDay, r: Math.round(upcomingReward).toLocaleString() })
                : t("earn.nextIn", { h: hLeft, m: mLeft, s: sLeft })}
          </button>

          {claimMsg && (
            <div className="mt-2 text-center text-xs font-bold py-2 rounded-lg" style={{ color: "#00e676", background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)" }}>
              {claimMsg}
            </div>
          )}

          <div className="mt-2 text-[10px] text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
            {t("earn.streakResetHint")}
          </div>
        </div>

        {/* Redeem Code */}
        <div
          className="rounded-2xl p-5 border"
          style={{ borderColor: "rgba(255,179,71,0.2)", background: "rgba(255,179,71,0.03)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xl">🎟️</div>
            <div className="font-black text-base" style={{ color: "#ffb347" }}>{t("earn.redeemCode")}</div>
          </div>
          <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("earn.redeemHint")}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={redeemInput}
              onChange={e => setRedeemInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleRedeem()}
              placeholder=""
              className="flex-1 px-3 py-2.5 rounded-xl text-sm font-mono font-bold uppercase outline-none"
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,179,71,0.2)",
                color: "#ffb347",
                letterSpacing: "0.06em",
              }}
              data-testid="input-redeem-code"
            />
            <button
              onClick={handleRedeem}
              className="px-4 py-2.5 rounded-xl font-black text-sm tracking-wider uppercase transition-all active:scale-95"
              style={{
                background: "rgba(255,179,71,0.12)",
                color: "#ffb347",
                border: "1px solid rgba(255,179,71,0.25)",
              }}
              data-testid="button-redeem"
            >
              {t("earn.go")}
            </button>
          </div>
          {redeemStatus && (
            <div
              className="mt-2.5 text-xs font-bold text-center py-2.5 rounded-xl"
              style={{
                color: redeemStatus.type === "error" ? "#ff5252" : redeemStatus.type === "sun" ? "#ffb347" : "#00e676",
                background: redeemStatus.type === "error" ? "rgba(255,82,82,0.08)" : redeemStatus.type === "sun" ? "rgba(255,179,71,0.1)" : "rgba(0,230,118,0.08)",
                border: `1px solid ${redeemStatus.type === "error" ? "rgba(255,82,82,0.2)" : redeemStatus.type === "sun" ? "rgba(255,179,71,0.25)" : "rgba(0,230,118,0.2)"}`,
              }}
            >
              {redeemStatus.message}
            </div>
          )}
        </div>

        {/* Referral */}
        <div className="rounded-2xl p-5 border" style={{ borderColor: "rgba(255,215,0,0.15)", background: "rgba(255,215,0,0.03)" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="text-xl">🔗</div>
            <div className="font-black text-base gold-text">{t("earn.referralProgram")}</div>
          </div>
          <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
            {t("earn.referralProgramHint")}
          </div>
          <button
            onClick={() => {
              const text = encodeURIComponent("Join Zoom and earn $ZOOM!");
              const url = encodeURIComponent(referralLink);
              window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
            }}
            className="w-full py-3 mb-3 rounded-xl font-black text-sm tracking-wider uppercase transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,179,71,0.1))",
              color: "#ffd700",
              border: "1px solid rgba(255,215,0,0.25)",
            }}
          >
            {t("earn.inviteFriends")}
          </button>
          <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>ID:</span>
            <span className="font-bold font-mono gold-text">{referralCode}</span>
            <span>·</span>
            <span className="font-bold" style={{ color: "#00e676" }}>{t("earn.invitedSuffix", { n: referralCount })}</span>
          </div>
        </div>

        {/* Referral Speed Bonus Banner */}
        {referralSpeedBonus > 0 && (
          <div
            className="rounded-2xl p-4 border flex items-center gap-3"
            style={{ borderColor: "rgba(0,230,118,0.25)", background: "rgba(0,230,118,0.06)" }}
          >
            <div className="text-2xl">⚡</div>
            <div className="flex-1">
              <div className="font-black text-sm" style={{ color: "#00e676" }}>
                {t("earn.speedActive", { n: Math.round(referralSpeedBonus * 100) })}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                {referredBy ? t("earn.speedActiveJoined") : t("earn.speedActiveSub")}
              </div>
            </div>
          </div>
        )}

        {/* Milestones */}
        <div className="rounded-2xl p-4 border" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
          <div className="font-black text-sm tracking-wide mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
            {t("earn.referralMilestones")}
          </div>
          {nextMilestone && (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>
                  {t("earn.nextMilestone", { c: nextMilestone.count, r: nextMilestone.reward.toLocaleString() })}
                </span>
                <span className="font-bold neon-text">{referralCount}/{nextMilestone.count}</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min((referralCount / nextMilestone.count) * 100, 100)}%`,
                    background: "linear-gradient(90deg, #00f2fe, #4facfe)",
                    boxShadow: "0 0 8px rgba(0,242,254,0.6)",
                  }}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {MILESTONES.map(m => {
              const reached = referralCount >= m.count;
              const claimed = claimedMilestones.includes(m.count);
              const isCurrent = m === nextMilestone;
              return (
                <div
                  key={m.count}
                  className="flex items-center justify-between py-2 px-3 rounded-xl border"
                  style={{
                    borderColor: claimed ? "rgba(0,230,118,0.2)" : isCurrent ? "rgba(0,242,254,0.15)" : "rgba(255,255,255,0.05)",
                    background: claimed ? "rgba(0,230,118,0.05)" : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div style={{ fontSize: 14 }}>{claimed ? "✅" : reached ? "🎉" : isCurrent ? "⏳" : "○"}</div>
                    <span className="text-xs font-bold" style={{ color: claimed ? "#00e676" : reached ? "#ffd700" : isCurrent ? "#00f2fe" : "rgba(255,255,255,0.3)" }}>
                      {t("earn.invites", { n: m.count })}
                    </span>
                  </div>
                  <span className="text-xs font-black" style={{ color: claimed ? "#00e676" : "rgba(255,255,255,0.4)" }}>
                    {claimed ? t("earn.claimedTick") : `+${m.reward.toLocaleString()} $ZOOM`}
                  </span>
                </div>
              );
            })}
          </div>
          {claimedMilestones.length > 0 && (
            <div className="mt-2 text-center text-xs" style={{ color: "rgba(0,230,118,0.7)" }}>
              {t(claimedMilestones.length > 1 ? "earn.milestoneClaimedMany" : "earn.milestoneClaimedOne", { n: claimedMilestones.length })}
            </div>
          )}
        </div>

        {/* ───────────── Long-term Tasks ───────────── */}
        <div
          className="rounded-2xl p-4 border"
          style={{ borderColor: "rgba(124,77,255,0.18)", background: "rgba(124,77,255,0.04)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-black text-base tracking-wide" style={{ color: "#b39dff" }}>{t("earn.tasks")}</div>
              <div className="text-[10px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                {t("earn.tasksSub")}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{t("earn.built")}</div>
              <div className="text-sm font-black" style={{ color: "#b39dff" }}>
                {(tasks?.planetsBuilt ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

          {tasksLoading && !tasks && (
            <div className="text-center text-xs py-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              {t("earn.loadingTasks")}
            </div>
          )}
          {tasksError && (
            <div className="text-center text-xs py-2 mb-2 rounded-lg"
              style={{ color: "#ff5252", background: "rgba(255,82,82,0.06)", border: "1px solid rgba(255,82,82,0.18)" }}>
              {tasksError}
            </div>
          )}

          {tasks && (
            <div className="flex flex-col gap-2">
              {tasks.planetTasks.map((task) => {
                const pct = Math.min(100, Math.round((tasks.planetsBuilt / task.threshold) * 100));
                const isClaiming = claimingTaskId === task.id;
                return (
                  <div
                    key={task.id}
                    className="rounded-xl border p-3"
                    style={{
                      borderColor: task.claimed
                        ? "rgba(0,230,118,0.22)"
                        : task.claimable
                          ? "rgba(255,215,0,0.28)"
                          : "rgba(255,255,255,0.06)",
                      background: task.claimed
                        ? "rgba(0,230,118,0.05)"
                        : task.claimable
                          ? "rgba(255,215,0,0.04)"
                          : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-col">
                        <span
                          className="text-xs font-black tracking-wide"
                          style={{
                            color: task.claimed ? "#00e676" : task.claimable ? "#ffd700" : "rgba(255,255,255,0.75)",
                          }}
                        >
                          {t("earn.buildPlanetsN", { n: task.threshold.toLocaleString() })}
                        </span>
                        <span className="text-[10px] font-bold mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {t("earn.rewardZoom", { n: task.rewardZoom.toLocaleString() })}
                        </span>
                      </div>
                      <button
                        onClick={() => void handleClaimTask(task.id)}
                        disabled={task.claimed || !task.claimable || isClaiming}
                        className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase transition-all active:scale-95"
                        style={{
                          background: task.claimed
                            ? "rgba(0,230,118,0.1)"
                            : task.claimable
                              ? "linear-gradient(135deg, #ffd700, #ffb347)"
                              : "rgba(255,255,255,0.04)",
                          color: task.claimed
                            ? "#00e676"
                            : task.claimable
                              ? "#1a0f00"
                              : "rgba(255,255,255,0.25)",
                          border: task.claimed
                            ? "1px solid rgba(0,230,118,0.25)"
                            : task.claimable
                              ? "1px solid transparent"
                              : "1px solid rgba(255,255,255,0.06)",
                          cursor: task.claimed || !task.claimable || isClaiming ? "not-allowed" : "pointer",
                          minWidth: 88,
                        }}
                        data-testid={`button-task-${task.id}`}
                      >
                        {task.claimed ? t("earn.claimedBtn") : isClaiming ? "…" : task.claimable ? t("earn.claimBtn") : t("earn.lockedBtn")}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: task.claimed
                              ? "linear-gradient(90deg, #00e676, #00c853)"
                              : "linear-gradient(90deg, #b39dff, #7c4dff)",
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.5)", minWidth: 70, textAlign: "right" }}>
                        {Math.min(tasks.planetsBuilt, task.threshold).toLocaleString()} / {task.threshold.toLocaleString()}
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

                // Title — first sponsor stays as the legacy hard-coded label
                // for backward compat; everything else derives from URL.
                const title = task.id === "sponsor_coinflip"
                  ? "Join @coinflip_vip"
                  : sponsorTitle(task.url);

                // Reward label varies by reward type. Exactly one of the
                // three reward fields is non-zero per task today.
                const rewardLabel = task.rewardZoom > 0
                  ? `Premio: +${task.rewardZoom.toLocaleString()} $ZOOM`
                  : task.rewardStardust > 0
                    ? `Premio: +${task.rewardStardust.toLocaleString()} Stardust`
                    : t(task.rewardSpins > 1 ? "earn.rewardSpinsMany" : "earn.rewardSpinsOne", { n: task.rewardSpins });

                // Eligibility gate (server-side enforced; UI mirrors it).
                // When ineligible, neither Open nor Claim do anything —
                // we render a disabled "Bloccato" button and the
                // requirement label inline.
                const isLocked = !task.claimed && !task.eligible;

                // Three sequential states for an eligible sponsor task:
                //   1) "Open"   — never tapped Open yet (openedAt = 0)
                //   2) "Wait Ns"— Open tapped, gate timer still running
                //   3) "Claim"  — gate elapsed, server still says not claimed
                const canClaimNow = !task.claimed && task.eligible && gateOpen;
                const showOpen = !task.claimed && task.eligible && openedAt === 0;
                const showWait = !task.claimed && task.eligible && openedAt > 0 && !gateOpen;
                return (
                  <div
                    key={task.id}
                    className="rounded-xl border p-3"
                    style={{
                      borderColor: task.claimed
                        ? "rgba(0,230,118,0.22)"
                        : isLocked
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,242,254,0.2)",
                      background: task.claimed
                        ? "rgba(0,230,118,0.05)"
                        : isLocked
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(0,242,254,0.04)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-col min-w-0 pr-2">
                        <span
                          className="text-xs font-black tracking-wide truncate"
                          style={{ color: task.claimed ? "#00e676" : isLocked ? "rgba(255,255,255,0.45)" : "#00f2fe" }}
                        >
                          {title}
                        </span>
                        <span className="text-[10px] font-bold mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                          {rewardLabel}
                        </span>
                      </div>
                      {task.claimed ? (
                        <button
                          disabled
                          className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase"
                          style={{
                            background: "rgba(0,230,118,0.1)",
                            color: "#00e676",
                            border: "1px solid rgba(0,230,118,0.25)",
                            minWidth: 88,
                          }}
                          data-testid={`button-task-${task.id}`}
                        >
                          {t("earn.claimedBtn")}
                        </button>
                      ) : isLocked ? (
                        <button
                          disabled
                          className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            color: "rgba(255,255,255,0.35)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            minWidth: 88,
                            cursor: "not-allowed",
                          }}
                          data-testid={`button-task-${task.id}-locked`}
                        >
                          Bloccato
                        </button>
                      ) : showOpen ? (
                        <button
                          onClick={() => handleOpenSponsor(task.id, task.url)}
                          className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase transition-all active:scale-95"
                          style={{
                            background: "linear-gradient(135deg, #00f2fe, #4facfe)",
                            color: "#060810",
                            border: "1px solid transparent",
                            minWidth: 88,
                          }}
                          data-testid={`button-task-${task.id}-open`}
                        >
                          {t("earn.openBtn")}
                        </button>
                      ) : showWait ? (
                        <button
                          disabled
                          className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase tabular-nums"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            color: "rgba(255,255,255,0.4)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            minWidth: 88,
                          }}
                          data-testid={`button-task-${task.id}-wait`}
                        >
                          {t("earn.waitSec", { n: remainingS })}
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleClaimTask(task.id)}
                          disabled={isClaiming || !canClaimNow}
                          className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase transition-all active:scale-95"
                          style={{
                            background: "linear-gradient(135deg, #ffd700, #ffb347)",
                            color: "#1a0f00",
                            border: "1px solid transparent",
                            minWidth: 88,
                            cursor: isClaiming ? "not-allowed" : "pointer",
                          }}
                          data-testid={`button-task-${task.id}-claim`}
                        >
                          {isClaiming ? "…" : t("earn.claimBtn")}
                        </button>
                      )}
                    </div>
                    {!task.claimed && (
                      <div className="text-[10px]" style={{ color: isLocked ? "#ff9b6e" : "rgba(255,255,255,0.35)" }}>
                        {isLocked
                          ? (task.requirementLabel || "Requisiti non soddisfatti")
                          : t("earn.sponsorHint")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {taskMsg && (
            <div
              className="mt-3 text-center text-xs font-bold py-2 rounded-lg"
              style={{
                color: "#00e676",
                background: "rgba(0,230,118,0.08)",
                border: "1px solid rgba(0,230,118,0.2)",
              }}
            >
              {taskMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
