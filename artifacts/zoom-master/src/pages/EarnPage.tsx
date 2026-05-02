import { useCallback, useEffect, useRef, useState } from "react";
import { claimDailyReward, fetchTasksState, claimTask, type TasksState } from "../utils/api";
import { useGlobalStore, refreshDailyStatus } from "../store/globalStore";


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
// Per-user storage key so a shared device (e.g. family iPad with two
// Telegram accounts) can't have one account's "I opened the channel"
// timestamp unlock the Claim button on a second account that never
// actually tapped Open.
const sponsorGateKey = (telegramId: string | null) =>
  `zoom:sponsor-gate-opened-at:${telegramId ?? "_anon"}`;

export function EarnPage({ referralCode, referralCount, referralSpeedBonus, referredBy, claimedMilestones, telegramId, onRedeemCode }: EarnPageProps) {
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
      setClaimMsg(`+${res.reward.toLocaleString()} $ZOOM (Day ${res.day})`);
      window.dispatchEvent(new CustomEvent("zoom-credit-local", { detail: { amount: res.reward } }));
      window.dispatchEvent(new Event("zoom-data-refresh"));
      await refreshDailyStatus();
      setTimeout(() => setClaimMsg(null), 3500);
    } else {
      setClaimMsg(res.error || "Claim failed");
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

  const handleRedeem = () => {
    if (!redeemInput.trim()) return;
    const result = onRedeemCode(redeemInput);
    if (result.success) {
      if (result.isSun) {
        setRedeemStatus({ type: "sun", message: "☀️ THE SUN added to your inventory! Go to Farm to activate." });
      } else {
        setRedeemStatus({ type: "success", message: `+${result.amount?.toLocaleString()} $ZOOM credited!` });
      }
      setRedeemInput("");
    } else {
      setRedeemStatus({ type: "error", message: result.error || "Invalid code" });
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
  // Read the persisted "channel opened at" timestamp once on mount so the
  // 10s countdown survives a page reload (otherwise an over-eager user
  // could just refresh to bypass the wait).
  const [sponsorOpenedAt, setSponsorOpenedAt] = useState<number>(0);
  // Re-read the per-user gate timestamp whenever telegramId changes so an
  // account switch on the same device doesn't carry over the previous
  // user's "Open" tap.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sponsorGateKey(telegramId));
      const n = raw ? Number(raw) : 0;
      setSponsorOpenedAt(Number.isFinite(n) && n > 0 ? n : 0);
    } catch { setSponsorOpenedAt(0); }
  }, [telegramId]);
  const tasksTickRef = useRef(0);
  void tasksTickRef;

  const reloadTasks = useCallback(async () => {
    if (!telegramId) return;
    setTasksLoading(true);
    setTasksError(null);
    const s = await fetchTasksState(telegramId);
    if (s) setTasks(s); else setTasksError("Could not load tasks");
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
        parts.push(`+${res.rewardSpins} Wheel Spin${res.rewardSpins > 1 ? "s" : ""}`);
      }
      setTaskMsg(parts.join(" · ") || "Claimed");
      window.dispatchEvent(new Event("zoom-data-refresh"));
      await reloadTasks();
    } else if (res.error === "ALREADY_CLAIMED") {
      setTaskMsg("Already claimed");
      await reloadTasks();
    } else if (res.error === "THRESHOLD_NOT_MET") {
      setTaskMsg(`Need ${res.threshold} planets (you have ${res.planetsBuilt ?? 0})`);
      await reloadTasks();
    } else {
      setTaskMsg("Claim failed");
    }
    setTimeout(() => setTaskMsg(null), 3500);
  };

  const handleOpenSponsor = (url: string) => {
    const now = Date.now();
    setSponsorOpenedAt(now);
    try { localStorage.setItem(sponsorGateKey(telegramId), String(now)); } catch {}
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
        return;
      }
    } catch {}
    window.open(url, "_blank");
  };

  const sponsorGateRemainingMs = sponsorOpenedAt > 0
    ? Math.max(0, SPONSOR_GATE_MS - (Date.now() - sponsorOpenedAt))
    : SPONSOR_GATE_MS;
  const sponsorGateOpen = sponsorOpenedAt > 0 && sponsorGateRemainingMs === 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-lg tracking-tight">Earn</h2>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Daily rewards & referrals</p>
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
                <div className="font-black text-base tracking-wide neon-text">Daily Streak</div>
                <div className="text-[10px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                  7-DAY LOOP · CYCLE {cycle + 1} · +{cyclePct.toFixed(0)}% BONUS
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>NEXT</div>
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
              ? "CLAIMING..."
              : canClaim
                ? `CLAIM DAY ${upcomingDay} — +${Math.round(upcomingReward).toLocaleString()} $ZOOM`
                : `NEXT IN ${hLeft}h ${mLeft}m ${sLeft}s`}
          </button>

          {claimMsg && (
            <div className="mt-2 text-center text-xs font-bold py-2 rounded-lg" style={{ color: "#00e676", background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)" }}>
              {claimMsg}
            </div>
          )}

          <div className="mt-2 text-[10px] text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
            Miss 24h after available → streak resets to Day 1
          </div>
        </div>

        {/* Redeem Code */}
        <div
          className="rounded-2xl p-5 border"
          style={{ borderColor: "rgba(255,179,71,0.2)", background: "rgba(255,179,71,0.03)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xl">🎟️</div>
            <div className="font-black text-base" style={{ color: "#ffb347" }}>Redeem Code</div>
          </div>
          <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
            Enter a promo or SUN code (SUN-****) to claim instant rewards
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
              GO
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
            <div className="font-black text-base gold-text">Referral Program</div>
          </div>
          <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
            +20 $ZOOM per new user who joins via your link. Milestone bonuses auto-credited!
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
            INVITE FRIENDS
          </button>
          <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>ID:</span>
            <span className="font-bold font-mono gold-text">{referralCode}</span>
            <span>·</span>
            <span className="font-bold" style={{ color: "#00e676" }}>{referralCount} invited</span>
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
                +{Math.round(referralSpeedBonus * 100)}% Farming Speed Active
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                {referredBy
                  ? `You joined via a friend's invite — enjoy the speed boost!`
                  : "Referral speed bonus active"}
              </div>
            </div>
          </div>
        )}

        {/* Milestones */}
        <div className="rounded-2xl p-4 border" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
          <div className="font-black text-sm tracking-wide mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
            Referral Milestones
          </div>
          {nextMilestone && (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>
                  Next: {nextMilestone.count} invites → {nextMilestone.reward.toLocaleString()} $ZOOM
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
                      {m.count} invites
                    </span>
                  </div>
                  <span className="text-xs font-black" style={{ color: claimed ? "#00e676" : "rgba(255,255,255,0.4)" }}>
                    {claimed ? "✓ Claimed" : `+${m.reward.toLocaleString()} $ZOOM`}
                  </span>
                </div>
              );
            })}
          </div>
          {claimedMilestones.length > 0 && (
            <div className="mt-2 text-center text-xs" style={{ color: "rgba(0,230,118,0.7)" }}>
              {claimedMilestones.length} milestone{claimedMilestones.length > 1 ? "s" : ""} claimed ✓
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
              <div className="font-black text-base tracking-wide" style={{ color: "#b39dff" }}>Tasks</div>
              <div className="text-[10px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                BUILD PLANETS · OPEN PARTNER CHANNELS
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>BUILT</div>
              <div className="text-sm font-black" style={{ color: "#b39dff" }}>
                {(tasks?.planetsBuilt ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

          {tasksLoading && !tasks && (
            <div className="text-center text-xs py-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              Loading tasks…
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
              {tasks.planetTasks.map((t) => {
                const pct = Math.min(100, Math.round((tasks.planetsBuilt / t.threshold) * 100));
                const isClaiming = claimingTaskId === t.id;
                return (
                  <div
                    key={t.id}
                    className="rounded-xl border p-3"
                    style={{
                      borderColor: t.claimed
                        ? "rgba(0,230,118,0.22)"
                        : t.claimable
                          ? "rgba(255,215,0,0.28)"
                          : "rgba(255,255,255,0.06)",
                      background: t.claimed
                        ? "rgba(0,230,118,0.05)"
                        : t.claimable
                          ? "rgba(255,215,0,0.04)"
                          : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-col">
                        <span
                          className="text-xs font-black tracking-wide"
                          style={{
                            color: t.claimed ? "#00e676" : t.claimable ? "#ffd700" : "rgba(255,255,255,0.75)",
                          }}
                        >
                          Build {t.threshold.toLocaleString()} planets
                        </span>
                        <span className="text-[10px] font-bold mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                          Reward: +{t.rewardZoom.toLocaleString()} $ZOOM
                        </span>
                      </div>
                      <button
                        onClick={() => void handleClaimTask(t.id)}
                        disabled={t.claimed || !t.claimable || isClaiming}
                        className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase transition-all active:scale-95"
                        style={{
                          background: t.claimed
                            ? "rgba(0,230,118,0.1)"
                            : t.claimable
                              ? "linear-gradient(135deg, #ffd700, #ffb347)"
                              : "rgba(255,255,255,0.04)",
                          color: t.claimed
                            ? "#00e676"
                            : t.claimable
                              ? "#1a0f00"
                              : "rgba(255,255,255,0.25)",
                          border: t.claimed
                            ? "1px solid rgba(0,230,118,0.25)"
                            : t.claimable
                              ? "1px solid transparent"
                              : "1px solid rgba(255,255,255,0.06)",
                          cursor: t.claimed || !t.claimable || isClaiming ? "not-allowed" : "pointer",
                          minWidth: 88,
                        }}
                        data-testid={`button-task-${t.id}`}
                      >
                        {t.claimed ? "Claimed" : isClaiming ? "…" : t.claimable ? "Claim" : "Locked"}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: t.claimed
                              ? "linear-gradient(90deg, #00e676, #00c853)"
                              : "linear-gradient(90deg, #b39dff, #7c4dff)",
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.5)", minWidth: 70, textAlign: "right" }}>
                        {Math.min(tasks.planetsBuilt, t.threshold).toLocaleString()} / {t.threshold.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}

              {tasks.sponsorTasks.map((t) => {
                const isClaiming = claimingTaskId === t.id;
                const remainingS = Math.ceil(sponsorGateRemainingMs / 1000);
                // Three sequential states for a sponsor task:
                //   1) "Open"   — never tapped Open yet (sponsorOpenedAt = 0)
                //   2) "Wait Ns"— Open tapped, gate timer still running
                //   3) "Claim"  — gate elapsed, server still says not claimed
                const canClaimNow = !t.claimed && sponsorGateOpen;
                const showOpen = !t.claimed && sponsorOpenedAt === 0;
                const showWait = !t.claimed && sponsorOpenedAt > 0 && !sponsorGateOpen;
                return (
                  <div
                    key={t.id}
                    className="rounded-xl border p-3"
                    style={{
                      borderColor: t.claimed ? "rgba(0,230,118,0.22)" : "rgba(0,242,254,0.2)",
                      background: t.claimed ? "rgba(0,230,118,0.05)" : "rgba(0,242,254,0.04)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-col">
                        <span
                          className="text-xs font-black tracking-wide"
                          style={{ color: t.claimed ? "#00e676" : "#00f2fe" }}
                        >
                          Join @coinflip_vip
                        </span>
                        <span className="text-[10px] font-bold mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                          Reward: +{t.rewardSpins} Wheel Spin{t.rewardSpins > 1 ? "s" : ""}
                        </span>
                      </div>
                      {t.claimed ? (
                        <button
                          disabled
                          className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase"
                          style={{
                            background: "rgba(0,230,118,0.1)",
                            color: "#00e676",
                            border: "1px solid rgba(0,230,118,0.25)",
                            minWidth: 88,
                          }}
                          data-testid={`button-task-${t.id}`}
                        >
                          Claimed
                        </button>
                      ) : showOpen ? (
                        <button
                          onClick={() => handleOpenSponsor(t.url)}
                          className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase transition-all active:scale-95"
                          style={{
                            background: "linear-gradient(135deg, #00f2fe, #4facfe)",
                            color: "#060810",
                            border: "1px solid transparent",
                            minWidth: 88,
                          }}
                          data-testid={`button-task-${t.id}-open`}
                        >
                          Open
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
                          data-testid={`button-task-${t.id}-wait`}
                        >
                          Wait {remainingS}s
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleClaimTask(t.id)}
                          disabled={isClaiming || !canClaimNow}
                          className="px-3 py-2 rounded-lg font-black text-[11px] tracking-wider uppercase transition-all active:scale-95"
                          style={{
                            background: "linear-gradient(135deg, #ffd700, #ffb347)",
                            color: "#1a0f00",
                            border: "1px solid transparent",
                            minWidth: 88,
                            cursor: isClaiming ? "not-allowed" : "pointer",
                          }}
                          data-testid={`button-task-${t.id}-claim`}
                        >
                          {isClaiming ? "…" : "Claim"}
                        </button>
                      )}
                    </div>
                    {!t.claimed && (
                      <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Tap Open, join the channel, then return here to claim.
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
