import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  fetchWheelConfig,
  fetchWheelStatus,
  fetchWheelFeed,
  spinWheel,
  claimWheelSpin,
  claimWheelDaily,
  createStarsInvoice,
  confirmStarsPurchase,
  type WheelPrizeConfig,
  type WheelSpinResult,
  type WheelFeedEntry,
} from "../utils/api";

interface WheelPageProps {
  telegramId?: string | null;
}

/**
 * Static prize layout, mirrored from `WHEEL_PRIZES` in
 * `artifacts/api-server/src/routes/wheel.ts`. Used as the *initial* state for
 * `prizes` so the entire wheel — segments, colors, labels, icons — paints
 * instantly on the very first render of the tab. The async `fetchWheelConfig`
 * still runs in the background and replaces this with the server payload, so
 * if the catalog ever changes server-side the UI catches up automatically;
 * but the user never sees an empty/half-built wheel while waiting on the
 * network. The server remains authoritative for prize selection (`/wheel/spin`),
 * this constant is purely for visual rendering.
 */
const DEFAULT_WHEEL_PRIZES: WheelPrizeConfig[] = [
  { index: 0,  type: "zoom",   zoomAmount: 100,   label: "100 $ZOOM",   shortLabel: "100",   icon: "🪐", color: "#8892b0" },
  { index: 1,  type: "stars",  starsAmount: 100,  label: "100 STARS",   shortLabel: "100",   icon: "⭐", color: "#ffd700" },
  { index: 2,  type: "zoom",   zoomAmount: 500,   label: "500 $ZOOM",   shortLabel: "500",   icon: "🪐", color: "#4facfe" },
  { index: 3,  type: "ton",    tonAmount: 1,      label: "1 TON",       shortLabel: "1",     icon: "💎", color: "#0098ea" },
  { index: 4,  type: "zoom",   zoomAmount: 1000,  label: "1K $ZOOM",    shortLabel: "1K",    icon: "🪐", color: "#00f2fe" },
  { index: 5,  type: "planet", planetType: "BASIC", label: "BASIC PLANET", shortLabel: "BASIC", icon: "◇", color: "#a0aec0" },
  { index: 6,  type: "zoom",   zoomAmount: 2500,  label: "2.5K $ZOOM",  shortLabel: "2.5K",  icon: "🪐", color: "#43e97b" },
  { index: 7,  type: "stars",  starsAmount: 200,  label: "200 STARS",   shortLabel: "200",   icon: "⭐", color: "#ffb347" },
  { index: 8,  type: "planet", planetType: "RARE",  label: "RARE PLANET",  shortLabel: "RARE",  icon: "◈", color: "#4facfe" },
  { index: 9,  type: "ton",    tonAmount: 10,     label: "10 TON",      shortLabel: "10",    icon: "💎", color: "#00d4ff" },
  { index: 10, type: "zoom",   zoomAmount: 5000,  label: "5K $ZOOM",    shortLabel: "5K",    icon: "🪐", color: "#f093fb" },
  { index: 11, type: "planet", planetType: "EPIC",  label: "EPIC PLANET",  shortLabel: "EPIC",  icon: "⬡", color: "#c471ed" },
];

const SPIN_PACKS = [
  { id: "wheel_spin_1",  spins: 1,  stars: 50,  badge: "" },
  { id: "wheel_spin_5",  spins: 5,  stars: 200, badge: "-20%" },
  { id: "wheel_spin_10", spins: 10, stars: 350, badge: "-30%" },
];

interface TgWebApp {
  openInvoice?: (url: string, callback: (status: string) => void) => void;
}
function getTg(): TgWebApp | null {
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null;
}

interface Particle { id: number; x: number; y: number; dx: number; dy: number; color: string; size: number; }

// ─────────────────────────────────────────────────────────────────────────────
// Memoized wheel disc. Re-renders ONLY when prizes or highlightIdx change.
// Insulates the heavy SVG (12 segments + 24 studs + gradients) from the
// per-second countdown ticker and the feed polling that happen in the parent.
// ─────────────────────────────────────────────────────────────────────────────
interface WheelDiscProps {
  prizes: WheelPrizeConfig[];
  highlightIdx: number | null;
  size: number;
}
const WheelDisc = memo(function WheelDisc({ prizes, highlightIdx, size }: WheelDiscProps) {
  const RADIUS = size / 2;
  const CENTER = RADIUS;
  const segments = prizes.length;
  const segAngle = segments > 0 ? 360 / segments : 0;
  const polar = (angleDeg: number, r: number) => {
    const a = (angleDeg - 90) * (Math.PI / 180);
    return { x: CENTER + r * Math.cos(a), y: CENTER + r * Math.sin(a) };
  };
  const buildSegmentPath = (i: number) => {
    const start = i * segAngle;
    const end = (i + 1) * segAngle;
    const p1 = polar(start, RADIUS);
    const p2 = polar(end, RADIUS);
    const large = segAngle > 180 ? 1 : 0;
    return `M ${CENTER} ${CENTER} L ${p1.x} ${p1.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <defs>
        {prizes.map((p) => (
          <radialGradient key={p.index} id={`segGrad${p.index}`} cx="50%" cy="50%" r="80%">
            <stop offset="0%" stopColor={p.color} stopOpacity="1" />
            <stop offset="60%" stopColor={p.color} stopOpacity="0.75" />
            <stop offset="100%" stopColor={p.color} stopOpacity="0.45" />
          </radialGradient>
        ))}
        <radialGradient id="rimGrad" cx="50%" cy="50%" r="50%">
          <stop offset="92%" stopColor="rgba(0,0,0,0)" />
          <stop offset="95%" stopColor="#fff5cc" />
          <stop offset="97%" stopColor="#ffd700" />
          <stop offset="100%" stopColor="#7a5a00" />
        </radialGradient>
        <radialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="40%" stopColor="#ffd700" />
          <stop offset="100%" stopColor="#a87b00" />
        </radialGradient>
        <radialGradient id="centerJewel" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#00f2fe" />
          <stop offset="100%" stopColor="#0066aa" />
        </radialGradient>
      </defs>
      {prizes.map((p, i) => {
        const isHi = highlightIdx === p.index;
        const mid = i * segAngle + segAngle / 2;
        const lpIcon = polar(mid, RADIUS * 0.78);
        const lpText = polar(mid, RADIUS * 0.5);
        return (
          <g key={p.index}>
            <path
              d={buildSegmentPath(i)}
              fill={`url(#segGrad${p.index})`}
              stroke="rgba(255,215,0,0.55)"
              strokeWidth={1.5}
              style={{
                filter: isHi ? `drop-shadow(0 0 18px ${p.color}) drop-shadow(0 0 6px #fff)` : "none",
                transition: "filter 0.4s",
              }}
            />
            <path d={buildSegmentPath(i)} fill="url(#hubGrad)" opacity={0.08} />
            <text
              x={lpIcon.x}
              y={lpIcon.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={16}
              transform={`rotate(${mid} ${lpIcon.x} ${lpIcon.y})`}
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))" }}
            >
              {p.icon}
            </text>
            <text
              x={lpText.x}
              y={lpText.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize={p.shortLabel.length > 3 ? 9 : 11}
              fontWeight={900}
              transform={`rotate(${mid} ${lpText.x} ${lpText.y})`}
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)", letterSpacing: "0.04em" }}
            >
              {p.shortLabel}
            </text>
          </g>
        );
      })}
      <circle cx={CENTER} cy={CENTER} r={RADIUS - 1} fill="none" stroke="url(#rimGrad)" strokeWidth={7} />
      <circle cx={CENTER} cy={CENTER} r={RADIUS - 5} fill="none" stroke="rgba(255,215,0,0.3)" strokeWidth={1} />
      {Array.from({ length: 24 }).map((_, k) => {
        const a = (k / 24) * 360;
        const sp = polar(a, RADIUS - 9);
        return (
          <g key={k}>
            <circle cx={sp.x} cy={sp.y} r={2.8} fill="#ffd700" />
            <circle cx={sp.x - 0.5} cy={sp.y - 0.5} r={1} fill="#fffbe6" opacity={0.9} />
          </g>
        );
      })}
      <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.35} fill="none" stroke="rgba(255,215,0,0.5)" strokeWidth={2} />
      <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.35 - 2} fill="rgba(10,14,26,0.85)" />
      <circle cx={CENTER} cy={CENTER} r={28} fill="url(#hubGrad)" />
      <circle cx={CENTER} cy={CENTER} r={22} fill="#0a0e1a" />
      <circle cx={CENTER} cy={CENTER} r={18} fill="url(#centerJewel)" />
      <circle cx={CENTER - 4} cy={CENTER - 4} r={5} fill="rgba(255,255,255,0.7)" />
    </svg>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Live spin feed marquee. Self-contained: owns its polling + scroll animation.
// Keeps the parent's render tree small so the wheel never re-renders for it.
// ─────────────────────────────────────────────────────────────────────────────
const WheelFeedTicker = memo(function WheelFeedTicker() {
  const [entries, setEntries] = useState<WheelFeedEntry[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const e = await fetchWheelFeed();
      if (alive) setEntries(e);
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 6000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // Repeat entries to make the marquee seamless when there are few items.
  const display = useMemo(() => {
    if (entries.length === 0) return [];
    const reps = entries.length < 6 ? Math.ceil(8 / entries.length) : 2;
    const out: WheelFeedEntry[] = [];
    for (let i = 0; i < reps; i++) out.push(...entries);
    return out;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div
        className="rounded-xl px-3 py-2 mb-2 flex items-center gap-2"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(0,242,254,0.15)",
        }}
      >
        <span className="text-[10px] font-black tracking-widest" style={{ color: "rgba(0,242,254,0.7)" }}>
          ● LIVE
        </span>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          Waiting for the next spin…
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl mb-2 relative overflow-hidden"
      style={{
        background: "linear-gradient(90deg, rgba(0,242,254,0.08), rgba(196,113,237,0.05))",
        border: "1px solid rgba(0,242,254,0.2)",
        height: 36,
      }}
    >
      <style>{`
        @keyframes feedScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-2"
        style={{
          background: "linear-gradient(90deg, rgba(10,14,26,0.95) 60%, rgba(10,14,26,0))",
          paddingRight: 14,
        }}
      >
        <span
          className="text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded"
          style={{ color: "#00f2fe", background: "rgba(0,242,254,0.12)", border: "1px solid rgba(0,242,254,0.35)" }}
        >
          ● LIVE
        </span>
      </div>
      <div
        className="flex items-center gap-5 absolute top-0 bottom-0 whitespace-nowrap"
        style={{
          paddingLeft: 70,
          animation: `feedScroll ${Math.max(18, display.length * 3)}s linear infinite`,
          willChange: "transform",
        }}
      >
        {display.map((e, idx) => (
          <div key={`${e.ts}-${idx}`} className="flex items-center gap-1.5 text-xs">
            <span style={{ color: "rgba(255,255,255,0.55)" }}>{e.name}</span>
            <span style={{ color: "rgba(255,255,255,0.35)" }}>won</span>
            <span style={{ fontSize: 13 }}>{e.prizeIcon}</span>
            <span className="font-black" style={{ color: e.prizeColor }}>{e.prizeLabel}</span>
            <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export function WheelPage({ telegramId }: WheelPageProps) {
  // Seed with the static catalog so the wheel structure is in the DOM on the
  // first frame (no opacity gate, no skeleton). The fetch below upgrades it
  // silently if the server config differs.
  const [prizes, setPrizes] = useState<WheelPrizeConfig[]>(DEFAULT_WHEEL_PRIZES);
  const [spins, setSpins] = useState(0);
  const [canClaimDaily, setCanClaimDaily] = useState(false);
  const [nextClaimAt, setNextClaimAt] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelSpinResult | null>(null);
  const [winFlash, setWinFlash] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleId = useRef(0);
  // Direct-DOM refs to avoid React re-renders on every wheel tick during spin.
  const pointerRef = useRef<HTMLDivElement | null>(null);
  // Captured at the moment a spin starts so the pulse-tick RAF can compute the
  // true rotation along the full multi-turn path (target − previous, NOT
  // `rotation - (rotation % 360)` which would collapse 7+ turns into <360°).
  const spinFromRef = useRef(0);
  const spinToRef = useRef(0);
  // Synchronous guard against double-tap spin races. The `spinning` React
  // state is set asynchronously, so a quick second tap (especially while the
  // wheel's heavy SVG is still settling its first render) can sneak past the
  // `if (spinning) return;` closure check and fire `spinWheel(telegramId)`
  // a second time — which the server happily accepts as another spin,
  // decrementing spins and granting a SECOND prize. The user sees only the
  // first prize popup but their balance jumps by 2× the won amount
  // ("Double Zoom"). A useRef flag flips synchronously, so any reentry
  // within the same tick is rejected.
  const spinInFlightRef = useRef(false);
  // Token returned by /wheel/spin that the post-animation /wheel/spin/claim
  // call must present back. Holds the contract "the prize the wheel is
  // currently animating toward". Cleared after a successful claim.
  const pendingClaimTokenRef = useRef<string | null>(null);
  // Marks that a server-side pending claim has already been picked up by
  // the auto-resume effect, so we don't re-trigger the animation every
  // time `refreshStatus` polls (every 8s + on focus/visibility).
  const resumedTokensRef = useRef<Set<string>>(new Set());

  /**
   * Drives the visual animation for a known prize and finalizes the claim
   * once the wheel stops. Used by both the normal spin handler and the
   * auto-resume path (when /wheel/status reports a pendingPrize from a
   * previous session that never got claimed). All side effects (rotation,
   * particles, balance refresh, claim API call) live here so the two
   * entry points stay in sync.
   */
  const animateAndClaim = useCallback((prizeIndex: number, prize: WheelSpinResult["prize"], claimToken: string, spinsAfter?: number) => {
    if (!telegramId) return;
    pendingClaimTokenRef.current = claimToken;
    setResult(null);
    setHighlightIdx(null);
    setSpinning(true);

    setRotation((prevRot) => {
      const segs = prizes.length;
      const segA = segs > 0 ? 360 / segs : 0;
      const prizeCenter = prizeIndex * segA + segA / 2;
      const jitter = (Math.random() - 0.5) * (segA * 0.5);
      const turns = 7;
      const currentMod = ((prevRot % 360) + 360) % 360;
      const targetMod = (360 - prizeCenter + jitter + 360) % 360;
      const delta = ((targetMod - currentMod) + 360) % 360;
      const next = prevRot + turns * 360 + delta;
      spinFromRef.current = prevRot;
      spinToRef.current = next;
      return next;
    });

    window.setTimeout(async () => {
      // Finalize on the server FIRST so the credit lands before we ask the
      // app for its new balance via the admin-refresh broadcast. The user's
      // contract: nothing is credited until the wheel stops on the prize.
      const claimRes = await claimWheelSpin(telegramId, claimToken);
      pendingClaimTokenRef.current = null;
      setSpinning(false);
      setResult({
        prizeIndex,
        prize,
        spinsRemaining: typeof spinsAfter === "number" ? spinsAfter : spins,
        claimToken,
      });
      setHighlightIdx(prizeIndex);
      if (typeof spinsAfter === "number") setSpins(spinsAfter);
      setWinFlash(true);
      spawnParticles(prize.color);
      setTimeout(() => setWinFlash(false), 2500);
      // Now pull the authoritative balance & grants. Done unconditionally
      // (even if the claim returned alreadyClaimed) so the UI matches the
      // server in either case.
      window.dispatchEvent(new Event("zoom-admin-refresh"));
      if (!claimRes.ok) {
        // Network failure on the claim. The prize is still safe in
        // `pending_wheel_claim` server-side. We REMOVE the token from
        // the resumed-set so the next /wheel/status poll (every 8s)
        // sees the still-pending claim as unresumed and auto-retries
        // the claim — without this the same-session retry never fires
        // and the user would have to reload the page.
        resumedTokensRef.current.delete(claimToken);
        setMessage("Conferma premio fallita: riproveremo automaticamente.");
      }
      spinInFlightRef.current = false;
    }, 5200);
  // `prizes` and `spins` are intentionally read fresh each call; including
  // them in deps would not change behavior since we use closure values
  // captured at call time, and the function is small.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId]);

  const refreshStatus = useCallback(async () => {
    if (!telegramId) return;
    const s = await fetchWheelStatus(telegramId);
    setSpins(s.spins);
    setCanClaimDaily(s.canClaimDaily);
    setNextClaimAt(s.nextClaimAt);
    // Auto-resume: if the server is holding a prize that the previous
    // session reserved but never finalized (tab crash, network drop, app
    // backgrounded right after /wheel/spin returned), play out the wheel
    // animation now and call /wheel/spin/claim at the end so the user
    // actually receives the prize that was reserved for them.
    const pending = s.pendingPrize;
    if (
      pending && pending.token && !spinInFlightRef.current &&
      !resumedTokensRef.current.has(pending.token)
    ) {
      resumedTokensRef.current.add(pending.token);
      spinInFlightRef.current = true;
      animateAndClaim(pending.prizeIndex, pending.prize, pending.token, s.spins);
    }
  }, [telegramId, animateAndClaim]);

  // Background sync: only replace seed if server actually returned a non-empty
  // catalog (otherwise an early/failed fetch would blank the wheel). We also
  // skip the replacement if the wheel is currently spinning — swapping
  // `prizes` mid-rotation would invalidate the WheelDisc memo and force a
  // full re-render of the heavy SVG (12 segments + 24 studs + gradients)
  // right while the GPU is composing the rotation, causing a visible stutter.
  useEffect(() => {
    fetchWheelConfig().then((cfg) => {
      if (!Array.isArray(cfg) || cfg.length === 0) return;
      if (spinInFlightRef.current) return;
      // Cheap structural diff: same length AND same id sequence ⇒ no need
      // to replace the array reference at all (would still bust memo).
      const sameShape =
        cfg.length === prizes.length &&
        cfg.every((p, i) => p.index === prizes[i]?.index && p.label === prizes[i]?.label);
      if (sameShape) return;
      setPrizes(cfg);
    });
  // We intentionally read `prizes` from closure for the diff but do NOT want
  // this effect to re-run on every state change — it should fire once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Auto-refresh spins (admin credits + visibility/focus)
  useEffect(() => {
    if (!telegramId) return;
    const onRefresh = () => { refreshStatus(); };
    const onVisible = () => { if (document.visibilityState === "visible") refreshStatus(); };
    window.addEventListener("zoom-admin-refresh", onRefresh);
    window.addEventListener("zoom-data-refresh", onRefresh);
    window.addEventListener("focus", onRefresh);
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => { if (!document.hidden) refreshStatus(); }, 8000);
    return () => {
      window.removeEventListener("zoom-admin-refresh", onRefresh);
      window.removeEventListener("zoom-data-refresh", onRefresh);
      window.removeEventListener("focus", onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
    };
  }, [telegramId, refreshStatus]);

  // Live countdown — paused during spin so we don't trigger any parent
  // re-render while the wheel is rotating (every state churn risks the
  // browser re-evaluating the rotating layer's transform/style).
  useEffect(() => {
    if (spinning) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [spinning]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const segments = prizes.length;
  const segAngle = segments > 0 ? 360 / segments : 0;

  // Pointer ticks during spin — direct DOM updates only (no React re-renders).
  // We never call setState from this loop so the entire wheel stays on the
  // GPU compositor at 60fps. Brightness is applied as a CSS custom property
  // and decays automatically.
  useEffect(() => {
    if (!spinning) return;
    const pointerEl = pointerRef.current;
    if (!pointerEl) return;

    const start = performance.now();
    const duration = 5200;
    // True spin path captured by handleSpin BEFORE setRotation. The wheel
    // travels from `spinFromRef` to `spinToRef` along ~7+ full turns, so we
    // must use those endpoints (not the post-state `rotation` modulo) to get
    // accurate per-segment ticks across the entire spin.
    const startRot = spinFromRef.current;
    const totalDelta = spinToRef.current - startRot;
    let lastSeg = -1;
    let raf = 0;
    let resetTimer: number | null = null;

    const loop = (t: number) => {
      const elapsed = t - start;
      if (elapsed >= duration) return;
      const progress = elapsed / duration;
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentRot = startRot + totalDelta * eased;
      const segIdx = segAngle > 0
        ? Math.floor(((360 - ((currentRot % 360) + 360) % 360 + segAngle / 2) % 360) / segAngle)
        : -1;
      if (segIdx !== lastSeg) {
        lastSeg = segIdx;
        // Direct style touch — no state, no re-render.
        pointerEl.style.filter = "drop-shadow(0 4px 10px rgba(255,51,102,0.7)) brightness(1.45)";
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => {
          pointerEl.style.filter = "drop-shadow(0 4px 10px rgba(255,51,102,0.7))";
        }, 70);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (resetTimer) clearTimeout(resetTimer);
      if (pointerEl) pointerEl.style.filter = "drop-shadow(0 4px 10px rgba(255,51,102,0.7))";
    };
  }, [spinning, rotation, segAngle]);

  const spawnParticles = (color: string) => {
    const burst: Particle[] = [];
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      const speed = 80 + Math.random() * 90;
      burst.push({
        id: particleId.current++,
        x: 0, y: 0,
        dx: Math.cos(ang) * speed,
        dy: Math.sin(ang) * speed,
        color: i % 3 === 0 ? "#ffd700" : color,
        size: 4 + Math.random() * 4,
      });
    }
    setParticles(burst);
    setTimeout(() => setParticles([]), 1400);
  };

  const handleSpin = async () => {
    // Synchronous re-entry guard. The React `spinning` state is set
    // asynchronously, so a fast double-tap can sneak past `if (spinning)`
    // and cause two `spinWheel` calls — the server would reserve two
    // prizes back-to-back. The 409 "Pending spin not yet claimed" gate on
    // the server is a second line of defense; this ref is the first.
    if (spinInFlightRef.current) return;
    if (!telegramId || spinning || spins <= 0 || segments === 0) return;
    spinInFlightRef.current = true;

    const res = await spinWheel(telegramId);
    if (!res.ok || !res.result) {
      // If the server replied with a stale pending prize (409), pick it up
      // via the auto-resume path so the user still sees & receives it.
      if (res.pendingPrize && res.pendingPrize.token && !resumedTokensRef.current.has(res.pendingPrize.token)) {
        resumedTokensRef.current.add(res.pendingPrize.token);
        animateAndClaim(res.pendingPrize.prizeIndex, res.pendingPrize.prize, res.pendingPrize.token);
        return;
      }
      spinInFlightRef.current = false;
      setMessage(res.error || "Spin failed");
      return;
    }
    const r = res.result;
    // The token must be known to the auto-resume guard so the next
    // /wheel/status refresh (which still sees the pending until the claim
    // lands) doesn't try to start a second animation in parallel.
    resumedTokensRef.current.add(r.claimToken);
    animateAndClaim(r.prizeIndex, r.prize, r.claimToken, r.spinsRemaining);
  };

  const handleClaimDaily = async () => {
    if (!telegramId || !canClaimDaily || claiming) return;
    setClaiming(true);
    const res = await claimWheelDaily(telegramId);
    setClaiming(false);
    if (res.ok) {
      setMessage("🎁 +1 free spin claimed!");
      await refreshStatus();
    } else {
      setMessage(res.error || "Claim failed");
      await refreshStatus();
    }
  };

  const handleBuy = async (packId: string) => {
    if (!telegramId) { setMessage("Telegram ID missing"); return; }
    setBuying(packId);
    try {
      const inv = await createStarsInvoice(telegramId, packId);
      if (inv.error || !inv.invoiceUrl || !inv.txnId) {
        setMessage(inv.error || "Failed to create invoice");
        setBuying(null);
        return;
      }
      const tg = getTg();
      if (tg?.openInvoice) {
        tg.openInvoice(inv.invoiceUrl, async (status: string) => {
          if (status === "paid") {
            const c = await confirmStarsPurchase(inv.txnId!, telegramId);
            if (c.ok) { setMessage("✓ Spins added!"); await refreshStatus(); }
            else setMessage(c.error || "Confirmation failed");
          } else if (status === "failed") setMessage("Payment failed");
          else if (status === "cancelled") setMessage("Payment cancelled");
          setBuying(null);
        });
      } else {
        window.open(inv.invoiceUrl, "_blank");
        setTimeout(async () => {
          const c = await confirmStarsPurchase(inv.txnId!, telegramId);
          if (c.ok) { setMessage("✓ Spins added!"); await refreshStatus(); }
          setBuying(null);
        }, 4000);
      }
    } catch {
      setMessage("Error opening invoice");
      setBuying(null);
    }
  };

  // Wheel geometry — only the size is needed at the parent level; all path
  // math now lives inside the memoized <WheelDisc /> child.
  const SIZE = 300;
  const RADIUS = SIZE / 2;

  const countdown = useMemo(() => {
    if (canClaimDaily || !nextClaimAt) return "";
    const ms = Math.max(0, nextClaimAt - now);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [canClaimDaily, nextClaimAt, now]);

  const totalSpinSources = spins + (canClaimDaily ? 1 : 0);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-black text-2xl tracking-wider neon-text">FORTUNE WHEEL</div>
            <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              Spin to win mega prizes
            </div>
          </div>
          <div
            className="px-3 py-1.5 rounded-full text-xs font-black"
            style={{
              background: "linear-gradient(135deg, rgba(0,242,254,0.2), rgba(79,172,254,0.15))",
              color: "#00f2fe",
              border: "1px solid rgba(0,242,254,0.4)",
              boxShadow: "0 0 14px rgba(0,242,254,0.2)",
            }}
          >
            {totalSpinSources} {totalSpinSources === 1 ? "SPIN" : "SPINS"}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ touchAction: "pan-y" }}>
        {/* Live spin feed (memoized + self-polling — does NOT trigger wheel re-render) */}
        <WheelFeedTicker />

        {/* Wheel stage */}
        <div
          className="relative mx-auto my-2"
          style={{
            width: SIZE + 60,
            height: SIZE + 80,
            perspective: "1200px",
            perspectiveOrigin: "50% 25%",
          }}
        >
          {/* Outer aura */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 35,
              left: 30,
              width: SIZE,
              height: SIZE,
              borderRadius: "50%",
              background: winFlash
                ? "radial-gradient(circle, rgba(255,215,0,0.6) 0%, rgba(255,215,0,0) 60%)"
                : "radial-gradient(circle, rgba(0,242,254,0.35) 0%, rgba(0,242,254,0) 65%)",
              filter: "blur(36px)",
              opacity: winFlash ? 1 : 0.7,
              transition: "opacity 0.4s, background 0.4s",
              animation: !spinning && !winFlash ? "wheelGlow 4s ease-in-out infinite" : "none",
            }}
          />

          <style>{`
            @keyframes wheelGlow {
              0%, 100% { opacity: 0.5; }
              50% { opacity: 0.85; }
            }
            @keyframes rimRotate {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes hubPulse {
              0%, 100% { transform: scale(1); filter: brightness(1); }
              50% { transform: scale(1.08); filter: brightness(1.4); }
            }
            @keyframes pointerBob {
              0%, 100% { transform: translateX(-50%) translateY(0px); }
              50% { transform: translateX(-50%) translateY(-3px); }
            }
            @keyframes winPulse {
              0%, 100% { box-shadow: 0 0 24px var(--winColor); transform: scale(1); }
              50% { box-shadow: 0 0 40px var(--winColor); transform: scale(1.05); }
            }
          `}</style>

          {/* Static drop shadow under the wheel. Lives on its OWN non-rotating
              layer so the browser doesn't have to re-rasterize the soft
              shadow every animation frame while the wheel rotates — that
              previously caused stutter on mid-tier mobile GPUs. */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 35,
              left: 30,
              width: SIZE,
              height: SIZE,
              borderRadius: "50%",
              boxShadow: "0 12px 28px rgba(0,0,0,0.8)",
            }}
          />

          {/* 3D wheel.
              While idle we keep the cosmetic `preserve-3d` + `rotateX(20deg)`
              tilt for depth. During spin we collapse to a flat 2D context
              (`transformStyle: flat`, no `rotateX`) so the rotating layer
              composites on a single, cheap GPU plane instead of the more
              expensive nested-3D context — the slight loss of perspective
              is invisible while the disc is spinning. */}
          <div
            className="absolute"
            style={{
              top: 35,
              left: 30,
              width: SIZE,
              height: SIZE,
              transformStyle: spinning ? "flat" : "preserve-3d",
              transform: spinning ? "none" : "rotateX(20deg)",
            }}
          >
            {/* Base disc layers (thickness illusion). Hidden during spin to
                eliminate their per-frame compositing cost — the rotating
                disc fully covers them anyway. */}
            {!spinning && [10, 8, 6, 4, 2].map((d) => (
              <div
                key={d}
                className="absolute rounded-full"
                style={{
                  inset: 0,
                  background: "linear-gradient(180deg, #050810 0%, #1a1f2e 100%)",
                  transform: `translateZ(-${d}px)`,
                  border: "1px solid rgba(255,215,0,0.06)",
                }}
              />
            ))}

            {/* Rotating outer rim shimmer — completely hidden during spin
                because conic-gradient + blur(4px) is a notorious mobile
                compositor offender that causes per-frame paint cost while
                the heavy SVG rotation is also in flight. */}
            {!spinning && (
              <div
                className="absolute pointer-events-none"
                style={{
                  inset: -8,
                  borderRadius: "50%",
                  background: "conic-gradient(from 0deg, rgba(255,215,0,0.4) 0%, rgba(255,215,0,0) 25%, rgba(0,242,254,0.4) 50%, rgba(0,242,254,0) 75%, rgba(255,215,0,0.4) 100%)",
                  filter: "blur(4px)",
                  animation: "rimRotate 8s linear infinite",
                  opacity: 0.8,
                }}
              />
            )}

            {/* Spinning wheel SVG.
                The whole rotation lives on a single GPU-promoted layer:
                - `translateZ(0)` + `backface-visibility: hidden` force its own
                  compositor layer so the browser doesn't repaint the SVG on
                  every frame, only re-composites the rotated layer.
                - `contain: paint` isolates the layout/paint scope.
                - NO box-shadow / filter on this element — those are pixel
                  effects that recompute every frame during rotation. The
                  soft drop shadow lives on a separate static sibling
                  (above) so it renders once. */}
            <div
              className="absolute inset-0"
              style={{
                transform: `translateZ(0) rotateZ(${rotation}deg)`,
                transition: spinning ? "transform 5.2s cubic-bezier(0.17, 0.85, 0.18, 1)" : "transform 0.4s ease-out",
                transformOrigin: "50% 50%",
                willChange: "transform",
                backfaceVisibility: "hidden",
                contain: "layout paint size",
                borderRadius: "50%",
              }}
            >
              <WheelDisc prizes={prizes} highlightIdx={highlightIdx} size={SIZE} />

              {/* Pulsing center overlay (HTML for animation) — removed during
                  spin so its own animation doesn't compete with the wheel
                  rotation on the compositor. */}
              {!spinning && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: "50%",
                    top: "50%",
                    width: 36,
                    height: 36,
                    marginLeft: -18,
                    marginTop: -18,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(0,242,254,0.5) 0%, rgba(0,242,254,0) 70%)",
                    animation: "hubPulse 2.4s ease-in-out infinite",
                  }}
                />
              )}
            </div>

            {/* Pointer (top, fixed). The brightness pulse during spin is
                applied via a direct ref (no React state churn). */}
            <div
              ref={pointerRef}
              className="absolute left-1/2 z-20 pointer-events-none"
              style={{
                top: -14,
                width: 0,
                height: 0,
                borderLeft: "18px solid transparent",
                borderRight: "18px solid transparent",
                borderTop: "32px solid #ff3366",
                filter: "drop-shadow(0 4px 10px rgba(255,51,102,0.7))",
                transformOrigin: "50% 0%",
                transform: "translateX(-50%)",
                animation: !spinning ? "pointerBob 2.5s ease-in-out infinite" : "none",
                transition: "filter 0.07s linear",
                willChange: "filter",
              }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 z-20 rounded-full pointer-events-none"
              style={{
                top: 16,
                width: 14,
                height: 14,
                background: "radial-gradient(circle at 35% 35%, #fff 0%, #ff3366 70%, #aa1144 100%)",
                boxShadow: "0 0 14px rgba(255,51,102,0.9), inset 0 -2px 4px rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.4)",
              }}
            />
          </div>

          {/* Particles */}
          {particles.length > 0 && (
            <div
              className="absolute pointer-events-none"
              style={{ top: 35 + RADIUS, left: 30 + RADIUS, width: 0, height: 0 }}
            >
              {particles.map((p) => (
                <div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    left: 0,
                    top: 0,
                    width: p.size,
                    height: p.size,
                    background: p.color,
                    boxShadow: `0 0 8px ${p.color}`,
                    ["--dx" as string]: `${p.dx}px`,
                    ["--dy" as string]: `${p.dy}px`,
                    animation: `particleFly 1.2s ease-out forwards`,
                  } as React.CSSProperties}
                />
              ))}
              <style>{`
                @keyframes particleFly {
                  0% { opacity: 1; transform: translate(0,0) scale(1); }
                  100% { opacity: 0; transform: translate(var(--dx, 0px), var(--dy, 0px)) scale(0.4); }
                }
              `}</style>
            </div>
          )}
        </div>

        {/* Result strip */}
        <div className="text-center mb-3" style={{ minHeight: 38 }}>
          {spinning ? (
            <div className="text-sm font-black tracking-widest" style={{ color: "rgba(0,242,254,0.7)" }}>
              ✦ SPINNING... ✦
            </div>
          ) : result ? (
            <div
              className="inline-block px-5 py-2 rounded-full font-black text-sm tracking-wider"
              style={{
                background: `linear-gradient(135deg, ${result.prize.color}40, ${result.prize.color}15)`,
                color: result.prize.color,
                border: `1px solid ${result.prize.color}cc`,
                animation: "winPulse 1.4s ease-in-out infinite",
                ["--winColor" as string]: `${result.prize.color}99`,
              } as React.CSSProperties}
            >
              {result.prize.icon} YOU WON {result.prize.label}!
            </div>
          ) : null}
        </div>

        {/* Spin button */}
        <button
          onClick={handleSpin}
          disabled={spinning || spins <= 0}
          className="w-full py-4 rounded-2xl font-black text-base tracking-widest transition-all active:scale-95 mb-3"
          style={{
            background: spins > 0 && !spinning
              ? "linear-gradient(135deg, #00f2fe 0%, #4facfe 50%, #c471ed 100%)"
              : "rgba(255,255,255,0.05)",
            color: spins > 0 && !spinning ? "#0a0e1a" : "rgba(255,255,255,0.3)",
            boxShadow: spins > 0 && !spinning ? "0 0 32px rgba(0,242,254,0.5), inset 0 1px 0 rgba(255,255,255,0.4)" : "none",
            border: "1px solid rgba(0,242,254,0.4)",
            cursor: spins > 0 && !spinning ? "pointer" : "not-allowed",
            textShadow: spins > 0 && !spinning ? "0 1px 0 rgba(255,255,255,0.4)" : "none",
          }}
        >
          {spinning ? "SPINNING..." : spins > 0 ? `🎯 SPIN — ${spins} LEFT` : "NO SPINS"}
        </button>

        {/* Daily free spin */}
        <div
          className="rounded-2xl p-4 mb-4 relative overflow-hidden"
          style={{
            background: canClaimDaily
              ? "linear-gradient(135deg, rgba(67,233,123,0.15), rgba(56,249,215,0.08))"
              : "rgba(255,255,255,0.04)",
            border: `1px solid ${canClaimDaily ? "rgba(67,233,123,0.4)" : "rgba(255,255,255,0.08)"}`,
            boxShadow: canClaimDaily ? "0 0 22px rgba(67,233,123,0.15)" : "none",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
              style={{
                background: canClaimDaily ? "rgba(67,233,123,0.2)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${canClaimDaily ? "rgba(67,233,123,0.4)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              🎁
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm tracking-wider" style={{ color: canClaimDaily ? "#43e97b" : "rgba(255,255,255,0.7)" }}>
                DAILY FREE SPIN
              </div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                {canClaimDaily ? "Ready to claim!" : `Next in ${countdown}`}
              </div>
            </div>
            <button
              onClick={handleClaimDaily}
              disabled={!canClaimDaily || claiming}
              className="px-4 py-2 rounded-full font-black text-xs tracking-wider transition-all active:scale-95"
              style={{
                background: canClaimDaily && !claiming ? "linear-gradient(135deg, #43e97b, #38f9d7)" : "rgba(255,255,255,0.06)",
                color: canClaimDaily && !claiming ? "#0a0e1a" : "rgba(255,255,255,0.3)",
                cursor: canClaimDaily && !claiming ? "pointer" : "not-allowed",
                boxShadow: canClaimDaily && !claiming ? "0 0 18px rgba(67,233,123,0.4)" : "none",
              }}
            >
              {claiming ? "..." : canClaimDaily ? "CLAIM" : "WAIT"}
            </button>
          </div>
        </div>

        {/* Buy spins */}
        <div className="font-black text-sm tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
          Buy Spins with ⭐
        </div>
        <div className="flex flex-col gap-2 mb-4">
          {SPIN_PACKS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleBuy(p.id)}
              disabled={buying === p.id}
              className="w-full flex items-center justify-between rounded-xl px-4 py-3 transition-all active:scale-98"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                border: "1px solid rgba(255,215,0,0.15)",
                opacity: buying === p.id ? 0.6 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-lg"
                  style={{
                    background: "radial-gradient(circle, rgba(0,242,254,0.2), rgba(0,242,254,0.05))",
                    border: "1px solid rgba(0,242,254,0.3)",
                  }}
                >
                  🎡
                </div>
                <div className="text-left">
                  <div className="font-black text-sm">{p.spins} {p.spins === 1 ? "Spin" : "Spins"}</div>
                  {p.badge && (
                    <div className="text-xs font-bold" style={{ color: "#43e97b" }}>{p.badge} OFF</div>
                  )}
                </div>
              </div>
              <div className="font-black text-sm flex items-center gap-1" style={{ color: "#ffd700" }}>
                <span>⭐</span>
                <span>{p.stars}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Prize legend */}
        <div className="font-black text-xs tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
          Possible Prizes
        </div>
        <div className="grid grid-cols-2 gap-2 pb-2">
          {prizes.map((p) => (
            <div
              key={p.index}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${p.color}33` }}
            >
              <span style={{ fontSize: 14 }}>{p.icon}</span>
              <div className="text-xs font-bold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
                {p.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {message && (
        <div
          className="absolute left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-bold z-40"
          style={{
            bottom: 14,
            background: "rgba(20,30,50,0.95)",
            border: "1px solid rgba(0,242,254,0.3)",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
