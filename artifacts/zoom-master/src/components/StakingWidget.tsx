import { useEffect, useState, useRef, useCallback } from "react";
import { fetchStakingStatus, startStaking, type StakingStatusResponse, type StakingSetStatus } from "../utils/api";

interface StakingWidgetProps {
  telegramId: string | null;
  // Live counts from the client state — used purely for the locked-state
  // progress display (e.g. "2/4 V1 collected"). The server re-validates
  // counts on /staking/start so a tampered client cannot bypass the cap.
  v1CountClient: number;
  sunCountClient: number;
}

const POLL_MS = 30_000;
const TICK_MS = 1_000;
// Mirror of artifacts/api-server/src/routes/staking.ts constants.
const REWARD_TON = 0.5;
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const REQUIRED = 4;

function fmtTon(v: number): string {
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.001) return v.toFixed(6);
  return v.toFixed(8);
}

interface SetCardProps {
  kind: "v1" | "sun";
  label: string;
  color: string;
  glow: string;
  status: StakingSetStatus;
  // Local (now - startedAtMs) drift to avoid waiting 30s for next poll.
  liveAccrued: number;
  busy: boolean;
  onStart: () => void;
}

function SetCard({ kind, label, color, glow, status, liveAccrued, busy, onStart }: SetCardProps) {
  const isStaking = (status.startedAtMs ?? 0) > 0;
  const eligible = status.eligible;
  const count = status.count;

  return (
    <div
      className="rounded-xl p-3 border relative overflow-hidden"
      style={{
        borderColor: isStaking ? glow : "rgba(255,255,255,0.08)",
        background: isStaking
          ? `linear-gradient(135deg, ${glow.replace("0.45", "0.10").replace("0.6", "0.10")} 0%, rgba(0,0,0,0.2) 100%)`
          : "rgba(255,255,255,0.03)",
        boxShadow: isStaking ? `0 0 14px ${glow.replace("0.45", "0.18").replace("0.6", "0.18")}` : "none",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-black text-sm tracking-wide" style={{ color }}>{label} STAKING</span>
          <span
            className="text-[9px] font-black px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,242,254,0.12)", color: "#00f2fe", border: "1px solid rgba(0,242,254,0.3)" }}
          >
            {REWARD_TON} TON / 30d
          </span>
        </div>
        {isStaking && (
          <span className="w-2 h-2 rounded-full pulse-soft" style={{ background: "#00e676", boxShadow: "0 0 6px #00e676" }} />
        )}
      </div>

      {isStaking ? (
        <>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>
            TON generated
          </div>
          <div className="font-black text-2xl" style={{ color: "#0088ff" }}>
            {fmtTon(liveAccrued)} <span className="text-sm font-bold" style={{ color: "rgba(0,136,255,0.65)" }}>TON</span>
          </div>
          <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            4 {label} locked · accruing in real time
          </div>
        </>
      ) : eligible ? (
        <>
          <div className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.7)" }}>
            You have {count} {label} — ready to stake 4 of them.
          </div>
          <button
            onClick={onStart}
            disabled={busy}
            className="btn-widget w-full text-xs font-black tracking-wider"
            style={{
              background: `linear-gradient(135deg, ${color}, ${color}cc)`,
              color: "#001a2e",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Starting..." : `STAKING TON`}
          </button>
        </>
      ) : (
        <>
          <div className="text-[11px] font-bold mb-1" style={{ color: "rgba(255,82,82,0.85)" }}>
            Collect {REQUIRED} {label} Planets to unlock TON farming
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                style={{
                  width: `${Math.min(100, (count / REQUIRED) * 100)}%`,
                  height: "100%",
                  background: color,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span className="text-[10px] font-black tabular-nums" style={{ color: "rgba(255,255,255,0.7)" }}>
              {Math.min(count, REQUIRED)}/{REQUIRED}
            </span>
          </div>
          <button disabled className="btn-widget w-full text-xs font-black tracking-wider mt-2" style={{ opacity: 0.35, cursor: "not-allowed" }}>
            STAKING TON
          </button>
        </>
      )}
    </div>
  );
}

export function StakingWidget({ telegramId, v1CountClient, sunCountClient }: StakingWidgetProps) {
  const [status, setStatus] = useState<StakingStatusResponse | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [busy, setBusy] = useState<"v1" | "sun" | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!telegramId) return;
    const data = await fetchStakingStatus(telegramId);
    if (data && mountedRef.current) setStatus(data);
  }, [telegramId]);

  // Poll status every 30s; tick a local "now" every 1s for live counter.
  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const poll = window.setInterval(() => { void refresh(); }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => { mountedRef.current = false; window.clearInterval(poll); window.clearInterval(tick); };
  }, [refresh]);

  // Use server status if present; otherwise fall back to client counts so
  // the locked-state UI still renders before the first response lands.
  const v1: StakingSetStatus = status?.v1 ?? {
    eligible: v1CountClient >= REQUIRED, count: v1CountClient, required: REQUIRED,
    startedAtMs: 0, accruedTon: 0, rewardTonPerMonth: REWARD_TON,
  };
  const sun: StakingSetStatus = status?.sun ?? {
    eligible: sunCountClient >= REQUIRED, count: sunCountClient, required: REQUIRED,
    startedAtMs: 0, accruedTon: 0, rewardTonPerMonth: REWARD_TON,
  };

  const liveV1 = v1.startedAtMs > 0 ? Math.max(0, (now - v1.startedAtMs) / PERIOD_MS) * REWARD_TON : 0;
  const liveSun = sun.startedAtMs > 0 ? Math.max(0, (now - sun.startedAtMs) / PERIOD_MS) * REWARD_TON : 0;

  const handleStart = async (kind: "v1" | "sun") => {
    if (!telegramId || busy) return;
    setBusy(kind);
    const res = await startStaking(telegramId, kind);
    setBusy(null);
    if (res.ok) await refresh();
  };

  const totalLive = liveV1 + liveSun;
  const anyStaking = v1.startedAtMs > 0 || sun.startedAtMs > 0;

  return (
    <div
      className="rounded-2xl p-3 border"
      style={{
        borderColor: anyStaking ? "rgba(0,242,254,0.35)" : "rgba(255,255,255,0.08)",
        background: "linear-gradient(135deg, rgba(0,136,255,0.06) 0%, rgba(0,242,254,0.03) 100%)",
      }}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="font-black text-xs tracking-widest" style={{ color: "#00f2fe" }}>TON STAKING</span>
        {anyStaking && (
          <span className="text-[10px] font-black tabular-nums" style={{ color: "#0088ff" }}>
            Total: {fmtTon(totalLive)} TON
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <SetCard
          kind="v1"
          label="V1"
          color="#ffd700"
          glow="rgba(255,215,0,0.45)"
          status={v1}
          liveAccrued={liveV1}
          busy={busy === "v1"}
          onStart={() => handleStart("v1")}
        />
        <SetCard
          kind="sun"
          label="SUN"
          color="#ffb347"
          glow="rgba(255,179,71,0.45)"
          status={sun}
          liveAccrued={liveSun}
          busy={busy === "sun"}
          onStart={() => handleStart("sun")}
        />
      </div>
    </div>
  );
}
