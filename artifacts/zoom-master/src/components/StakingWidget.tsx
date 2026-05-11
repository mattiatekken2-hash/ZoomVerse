import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  fetchStakingStatus,
  startStaking,
  type StakingStatusResponse,
  type StakingSetStatus,
  type StakingKind,
} from "../utils/api";
import type { Planet } from "../hooks/useGameState";

interface StakingWidgetProps {
  telegramId: string | null;
  // Live planet array — used purely for the locked-state UI before the
  // first server response lands. Server is the source of truth.
  planets: Planet[];
  sunCountClient: number;
  // Live SUN cycle timestamp from client state. We watch this so that the
  // widget refreshes IMMEDIATELY when the user reactivates their SUN
  // (instead of waiting for the next 30s poll). Same idea for any planet
  // farm restart — `planets` already changes when farms restart.
  sunFarmStartedAtClient?: number;
}

const POLL_MS = 30_000;
const TICK_MS = 1_000;
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const REQUIRED = 4;
const FARM_DURATION_MS = 24 * 60 * 60 * 1000;

// Per-rarity rewards (mirror of artifacts/api-server/src/routes/staking.ts).
const REWARD_TON: Record<StakingKind, number> = {
  v1: 0.15, sun: 0.15, mythic: 0.10, gold: 0.07, epic: 0.04, rare: 0.02, basic: 0.01,
};

// Display config per tier — order matches the visual stack in the widget.
interface TierMeta {
  kind: StakingKind;
  label: string;
  color: string;
  glow: string;
}
const TIERS: TierMeta[] = [
  { kind: "v1",     label: "V1",     color: "#ffd700", glow: "rgba(255,215,0,0.45)"  },
  { kind: "sun",    label: "SUN",    color: "#ffb347", glow: "rgba(255,179,71,0.45)" },
  { kind: "mythic", label: "MYTHIC", color: "#ff3b6b", glow: "rgba(255,59,107,0.40)" },
  { kind: "gold",   label: "GOLD",   color: "#ffcc33", glow: "rgba(255,204,51,0.40)" },
  { kind: "epic",   label: "EPIC",   color: "#a855f7", glow: "rgba(168,85,247,0.40)" },
  { kind: "rare",   label: "RARE",   color: "#3b82f6", glow: "rgba(59,130,246,0.40)" },
  { kind: "basic",  label: "BASIC",  color: "#9ca3af", glow: "rgba(156,163,175,0.40)"},
];

function fmtTon(v: number): string {
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.001) return v.toFixed(6);
  return v.toFixed(8);
}

// Mirror of server `isPlanetActivelyFarming` for the locked-state preview
// UI before the first server response lands.
function isActivelyFarming(p: Planet, now: number): boolean {
  if (p.isListedInMarket) return false;
  if (!p.isFarmingActive) return false;
  const start = Math.max(p.farmStartedAt || 0, p.lastCollectedAt || 0);
  if (start <= 0) return false;
  return now - start <= FARM_DURATION_MS;
}

interface SetCardProps {
  meta: TierMeta;
  status: StakingSetStatus;
  hasSun: boolean;
  // Local (now - startedAtMs) drift to avoid waiting 30s for next poll.
  liveAccrued: number;
  busy: boolean;
  onStart: () => void;
}

function SetCard({ meta, status, hasSun, liveAccrued, busy, onStart }: SetCardProps) {
  const isStaking = (status.startedAtMs ?? 0) > 0;
  const eligible = status.eligible;
  const count = status.count;
  const activeCount = status.activeCount;
  const requiresSun = status.requiresSunInInventory;
  const reward = status.rewardTonPerMonth ?? REWARD_TON[meta.kind];
  // Production stopped because the underlying source went inactive AFTER
  // staking started. Applies to all 7 tiers now (V1, SUN, BASIC..GOLD):
  // if the server says we're not currently accruing, we're paused.
  const stalled = isStaking && !status.isAccruing;
  // V1 + dynamic tiers BOTH require an active SUN cycle (24h). When that's
  // the missing piece, surface that explicitly instead of blaming the
  // tier's own farm count — otherwise the user reads "only 4/4 V1 active"
  // and is rightfully confused why production is paused.
  const sunIsTheBlocker = stalled && meta.kind !== "sun" && !hasSun;
  const pausedReason = stalled
    ? (sunIsTheBlocker
        ? `⏸ Production paused — your SUN cycle is not active. Reactivate your SUN (24h) to resume.`
        : meta.kind === "v1"
          ? `⏸ Production paused — only ${activeCount}/${REQUIRED} V1 NFT farms active. Reactivate to resume.`
          : meta.kind === "sun"
            ? `⏸ Production paused — SUN cycle expired. Reactivate your SUN to resume.`
            : `⏸ Production paused — only ${activeCount}/${REQUIRED} ${meta.label} farms active. Reactivate to resume.`)
    : "";

  return (
    <div
      className="rounded-xl p-3 border relative overflow-hidden"
      style={{
        borderColor: isStaking ? meta.glow : "rgba(255,255,255,0.08)",
        background: isStaking
          ? `linear-gradient(135deg, ${meta.glow.replace("0.45", "0.10").replace("0.40", "0.10")} 0%, rgba(0,0,0,0.2) 100%)`
          : "rgba(255,255,255,0.03)",
        boxShadow: isStaking ? `0 0 14px ${meta.glow.replace("0.45", "0.18").replace("0.40", "0.18")}` : "none",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-black text-sm tracking-wide" style={{ color: meta.color }}>{meta.label} STAKING</span>
          <span
            className="text-[9px] font-black px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,242,254,0.12)", color: "#00f2fe", border: "1px solid rgba(0,242,254,0.3)" }}
          >
            {reward} TON / 30d
          </span>
        </div>
        {isStaking && (
          <span
            className={status.isAccruing ? "w-2 h-2 rounded-full pulse-soft" : "w-2 h-2 rounded-full"}
            style={{
              background: status.isAccruing ? "#00e676" : "#ff8c00",
              boxShadow: status.isAccruing ? "0 0 6px #00e676" : "0 0 6px #ff8c00",
            }}
          />
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
          {stalled ? (
            <div className="text-[10px] mt-1 font-bold" style={{ color: "rgba(255,140,0,0.95)" }}>
              {pausedReason}
            </div>
          ) : (
            <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              {requiresSun ? `${REQUIRED} ${meta.label} active · accruing in real time` : `${REQUIRED} ${meta.label} locked · accruing in real time`}
            </div>
          )}
        </>
      ) : eligible ? (
        <>
          <div className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.7)" }}>
            {requiresSun
              ? `${activeCount} ${meta.label} active — ready to stake.`
              : `You have ${count} ${meta.label} — ready to stake ${REQUIRED} of them.`}
          </div>
          <button
            onClick={onStart}
            disabled={busy}
            className="btn-widget w-full text-xs font-black tracking-wider"
            style={{
              background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)`,
              color: "#001a2e",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Starting..." : `STAKING TON`}
          </button>
        </>
      ) : (
        <>
          {requiresSun && !hasSun ? (
            <div className="text-[11px] font-bold mb-1" style={{ color: "rgba(255,179,71,0.95)" }}>
              ☀ Activate your SUN (24h cycle) to unlock {meta.label} staking
            </div>
          ) : requiresSun && count >= REQUIRED && activeCount < REQUIRED ? (
            <div className="text-[11px] font-bold mb-1" style={{ color: "rgba(255,140,0,0.95)" }}>
              Activate {REQUIRED} {meta.label} farms ({activeCount}/{REQUIRED} active) to unlock TON staking
            </div>
          ) : requiresSun && count < REQUIRED ? (
            <div className="text-[11px] font-bold mb-1" style={{ color: "rgba(255,82,82,0.85)" }}>
              Collect {REQUIRED} {meta.label} Planets ({count}/{REQUIRED} owned · {activeCount}/{REQUIRED} actively farming)
            </div>
          ) : (
            <div className="text-[11px] font-bold mb-1" style={{ color: "rgba(255,82,82,0.85)" }}>
              Collect {REQUIRED} {meta.label} Planets to unlock TON farming
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                style={{
                  width: `${Math.min(100, ((requiresSun ? Math.max(activeCount, Math.min(count, REQUIRED)) : count) / REQUIRED) * 100)}%`,
                  height: "100%",
                  background: meta.color,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span className="text-[10px] font-black tabular-nums" style={{ color: "rgba(255,255,255,0.7)" }}>
              {Math.min(requiresSun ? Math.max(activeCount, Math.min(count, REQUIRED)) : count, REQUIRED)}/{REQUIRED}
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

export function StakingWidget({ telegramId, planets, sunCountClient, sunFarmStartedAtClient }: StakingWidgetProps) {
  const [status, setStatus] = useState<StakingStatusResponse | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [busy, setBusy] = useState<StakingKind | null>(null);
  const [open, setOpen] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!telegramId) return;
    const data = await fetchStakingStatus(telegramId);
    if (data && mountedRef.current) setStatus(data);
  }, [telegramId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const poll = window.setInterval(() => { void refresh(); }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => { mountedRef.current = false; window.clearInterval(poll); window.clearInterval(tick); };
  }, [refresh]);

  // Trigger an immediate refresh whenever the SUN inventory or cycle
  // changes — covers two cases:
  //   1. user reactivates SUN → `sunFarmStartedAtClient` jumps; banner
  //      "Production paused — SUN cycle expired" must clear within a
  //      frame instead of after the next 30s poll.
  //   2. admin removes the SUN from inventory → `sunCountClient` drops
  //      to 0; all dynamic-tier staking (BASIC..GOLD) and SUN staking
  //      must show as paused immediately.
  useEffect(() => {
    if (!telegramId) return;
    // Two-shot, same race as the planet-farm fingerprint below: SUN
    // reactivation pushes /sun/cycle fire-and-forget while the client
    // state already shows a fresh 24h cycle. An immediate /staking/status
    // can race that write and come back with sunCycleActive=false →
    // every dynamic tier flips to "Activate your SUN (24h cycle)" until
    // the next 30s poll. The 1.5s second-shot covers the slow-write case.
    void refresh();
    const t = window.setTimeout(() => { void refresh(); }, 1500);
    return () => window.clearTimeout(t);
  }, [telegramId, sunFarmStartedAtClient, sunCountClient, refresh]);

  // Also refresh when farm timestamps change (planet farm restart). We
  // intentionally key off a cheap fingerprint of the farm-state vector
  // so unrelated planet-array mutations don't spam /staking/status.
  const farmFingerprint = useMemo(() => {
    let s = 0;
    for (const p of planets) {
      s += (p.farmStartedAt ?? 0) + (p.lastCollectedAt ?? 0);
    }
    return s;
  }, [planets]);
  useEffect(() => {
    if (!telegramId) return;
    // Two-shot refresh: the planet save in useGameState is debounced by
    // 1.2s, so an immediate /staking/status would still see the OLD
    // planets_json on the server (activeCount = 0) and the user would
    // be stuck on "Activate 4 RARE farms" until the next 30s poll. We
    // refresh once now (covers cases where the save already flushed,
    // e.g. an immediate save path) and once after the debounce window
    // (covers the normal path).
    void refresh();
    const t = window.setTimeout(() => { void refresh(); }, 1500);
    return () => window.clearTimeout(t);
    // farmFingerprint intentionally drives this effect — we don't want
    // refresh to refire on every render.
  }, [telegramId, farmFingerprint, refresh]);

  // Locked-state fallback counts derived from the client planets array.
  // Server status overrides these the moment it lands.
  const fallbackCounts = useMemo(() => {
    const total = (k: StakingKind): number => {
      if (k === "sun") return sunCountClient;
      if (k === "v1") return planets.filter(p => p.name === "V1" || p.name === "V1_NFT").length;
      const rarity = k.toUpperCase();
      return planets.filter(p => p.name === rarity).length;
    };
    const active = (k: StakingKind, t: number): number => {
      if (k === "sun" || k === "v1") return total(k);
      const rarity = k.toUpperCase();
      return planets.filter(p => p.name === rarity && isActivelyFarming(p, t)).length;
    };
    return { total, active };
  }, [planets, sunCountClient]);

  const hasSun = status?.hasSun ?? sunCountClient >= 1;

  const tiersWithStatus = TIERS.map(meta => {
    const fromServer = status?.[meta.kind];
    const t = fromServer ?? {
      eligible: false,
      count: fallbackCounts.total(meta.kind),
      activeCount: fallbackCounts.active(meta.kind, now),
      required: REQUIRED,
      startedAtMs: 0,
      accruedTon: 0,
      isAccruing: false,
      rewardTonPerMonth: REWARD_TON[meta.kind],
      requiresSunInInventory: meta.kind !== "v1" && meta.kind !== "sun",
    } as StakingSetStatus;
    // Live-ticking display, GATED on isAccruing.
    //   • If the server says we're not currently accruing (SUN missing,
    //     cycle expired, farms inactive, etc.) → show the snapshot
    //     unchanged; it never grows while paused.
    //   • If we ARE accruing → extrapolate from the snapshot using
    //     `serverNowMs` as the anchor (NOT startedAtMs), so we add
    //     only the seconds elapsed since the last server settle. This
    //     restores the "live numbers" feel without ever drifting past
    //     reality when production is paused.
    const serverNowMs = status?.nowMs ?? now;
    const liveAccrued = (() => {
      if (!t.isAccruing) return t.accruedTon;
      const deltaMs = Math.max(0, now - serverNowMs);
      const rate = t.rewardTonPerMonth ?? REWARD_TON[meta.kind];
      return t.accruedTon + (deltaMs / PERIOD_MS) * rate;
    })();
    return { meta, status: t, liveAccrued };
  });

  const handleStart = async (kind: StakingKind) => {
    if (!telegramId || busy) return;
    setBusy(kind);
    const res = await startStaking(telegramId, kind);
    setBusy(null);
    if (res.ok) await refresh();
  };

  const totalLive = tiersWithStatus.reduce((s, t) => s + t.liveAccrued, 0);
  const anyStaking = tiersWithStatus.some(t => t.status.startedAtMs > 0);
  const anyEligible = tiersWithStatus.some(t => t.status.eligible);

  return (
    <div
      className="rounded-2xl p-3 border"
      style={{
        borderColor: anyStaking ? "rgba(0,242,254,0.35)" : "rgba(255,255,255,0.08)",
        background: "linear-gradient(135deg, rgba(0,136,255,0.06) 0%, rgba(0,242,254,0.03) 100%)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between mb-2 px-1"
        aria-expanded={open}
      >
        <span className="font-black text-xs tracking-widest" style={{ color: "#00f2fe" }}>
          TON STAKING {anyEligible && !anyStaking ? "· READY" : ""}
        </span>
        <span className="flex items-center gap-2">
          {anyStaking && (
            <span className="text-[10px] font-black tabular-nums" style={{ color: "#0088ff" }}>
              Total: {fmtTon(totalLive)} TON
            </span>
          )}
          <span style={{ color: "rgba(0,242,254,0.7)", fontSize: 12 }}>{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2">
          {tiersWithStatus.map(({ meta, status: s, liveAccrued }) => (
            <SetCard
              key={meta.kind}
              meta={meta}
              status={s}
              hasSun={hasSun}
              liveAccrued={liveAccrued}
              busy={busy === meta.kind}
              onStart={() => handleStart(meta.kind)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
