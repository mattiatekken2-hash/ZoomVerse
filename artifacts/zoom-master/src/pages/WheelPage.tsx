import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fetchWheelConfig,
  fetchWheelStatus,
  spinWheel,
  claimWheelDaily,
  createStarsInvoice,
  confirmStarsPurchase,
  type WheelPrizeConfig,
  type WheelSpinResult,
} from "../utils/api";

interface WheelPageProps {
  telegramId?: string | null;
}

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

export function WheelPage({ telegramId }: WheelPageProps) {
  const [prizes, setPrizes] = useState<WheelPrizeConfig[]>([]);
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
  const [pointerPulse, setPointerPulse] = useState(false);
  const particleId = useRef(0);

  const refreshStatus = useCallback(async () => {
    if (!telegramId) return;
    const s = await fetchWheelStatus(telegramId);
    setSpins(s.spins);
    setCanClaimDaily(s.canClaimDaily);
    setNextClaimAt(s.nextClaimAt);
  }, [telegramId]);

  useEffect(() => { fetchWheelConfig().then(setPrizes); }, []);
  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Live countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const segments = prizes.length;
  const segAngle = segments > 0 ? 360 / segments : 0;

  // Pointer ticks during spin (visual only)
  useEffect(() => {
    if (!spinning) return;
    const start = performance.now();
    const duration = 5200;
    let lastSeg = -1;
    let raf = 0;
    const loop = (t: number) => {
      const elapsed = t - start;
      if (elapsed >= duration) return;
      const progress = elapsed / duration;
      // Ease-out cubic for current rotation snapshot
      const eased = 1 - Math.pow(1 - progress, 3);
      const totalDelta = rotation - (rotation - (rotation % 360));
      const currentRot = (rotation - totalDelta) + totalDelta * eased;
      const segIdx = Math.floor(((360 - ((currentRot % 360) + 360) % 360 + segAngle / 2) % 360) / segAngle);
      if (segIdx !== lastSeg) {
        lastSeg = segIdx;
        setPointerPulse(true);
        setTimeout(() => setPointerPulse(false), 60);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
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
    if (!telegramId || spinning || spins <= 0 || segments === 0) return;
    setResult(null);
    setHighlightIdx(null);
    setSpinning(true);

    const res = await spinWheel(telegramId);
    if (!res.ok || !res.result) {
      setSpinning(false);
      setMessage(res.error || "Spin failed");
      return;
    }
    const r = res.result;

    const prizeCenter = r.prizeIndex * segAngle + segAngle / 2;
    const jitter = (Math.random() - 0.5) * (segAngle * 0.5);
    const turns = 7;
    const currentMod = ((rotation % 360) + 360) % 360;
    const targetMod = (360 - prizeCenter + jitter + 360) % 360;
    const delta = ((targetMod - currentMod) + 360) % 360;
    const newRotation = rotation + turns * 360 + delta;
    setRotation(newRotation);

    window.setTimeout(() => {
      setSpinning(false);
      setResult(r);
      setHighlightIdx(r.prizeIndex);
      setSpins(r.spinsRemaining);
      setWinFlash(true);
      spawnParticles(r.prize.color);
      setTimeout(() => setWinFlash(false), 2500);
    }, 5200);
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

  // Wheel geometry
  const SIZE = 300;
  const RADIUS = SIZE / 2;
  const CENTER = RADIUS;

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

          {/* 3D wheel */}
          <div
            className="absolute"
            style={{
              top: 35,
              left: 30,
              width: SIZE,
              height: SIZE,
              transformStyle: "preserve-3d",
              transform: "rotateX(20deg)",
            }}
          >
            {/* Base disc layers (thickness illusion) */}
            {[10, 8, 6, 4, 2].map((d) => (
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

            {/* Rotating outer rim shimmer */}
            <div
              className="absolute pointer-events-none"
              style={{
                inset: -8,
                borderRadius: "50%",
                background: "conic-gradient(from 0deg, rgba(255,215,0,0.4) 0%, rgba(255,215,0,0) 25%, rgba(0,242,254,0.4) 50%, rgba(0,242,254,0) 75%, rgba(255,215,0,0.4) 100%)",
                filter: "blur(4px)",
                animation: spinning ? "rimRotate 1.2s linear infinite" : "rimRotate 8s linear infinite",
                opacity: 0.8,
              }}
            />

            {/* Spinning wheel SVG */}
            <div
              className="absolute inset-0"
              style={{
                transform: `rotateZ(${rotation}deg)`,
                transition: spinning ? "transform 5.2s cubic-bezier(0.17, 0.85, 0.18, 1)" : "transform 0.4s ease-out",
                transformOrigin: "50% 50%",
                willChange: "transform",
              }}
            >
              <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block", filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.8))" }}>
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

                {/* Segments */}
                {prizes.map((p, i) => {
                  const isHi = highlightIdx === p.index;
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
                      {/* Inner shine band */}
                      <path
                        d={buildSegmentPath(i)}
                        fill="url(#hubGrad)"
                        opacity={0.08}
                      />
                      {/* Label + icon */}
                      {(() => {
                        const mid = i * segAngle + segAngle / 2;
                        const lpIcon = polar(mid, RADIUS * 0.78);
                        const lpText = polar(mid, RADIUS * 0.5);
                        const rotLabel = mid;
                        return (
                          <g>
                            <text
                              x={lpIcon.x}
                              y={lpIcon.y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize={16}
                              transform={`rotate(${rotLabel} ${lpIcon.x} ${lpIcon.y})`}
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
                              transform={`rotate(${rotLabel} ${lpText.x} ${lpText.y})`}
                              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)", letterSpacing: "0.04em" }}
                            >
                              {p.shortLabel}
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}

                {/* Outer rim */}
                <circle cx={CENTER} cy={CENTER} r={RADIUS - 1} fill="none" stroke="url(#rimGrad)" strokeWidth={7} />
                <circle cx={CENTER} cy={CENTER} r={RADIUS - 5} fill="none" stroke="rgba(255,215,0,0.3)" strokeWidth={1} />

                {/* Studs around the rim */}
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

                {/* Inner divider ring */}
                <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.35} fill="none" stroke="rgba(255,215,0,0.5)" strokeWidth={2} />
                <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.35 - 2} fill="rgba(10,14,26,0.85)" />

                {/* Center hub */}
                <circle cx={CENTER} cy={CENTER} r={28} fill="url(#hubGrad)" />
                <circle cx={CENTER} cy={CENTER} r={22} fill="#0a0e1a" />
                <circle cx={CENTER} cy={CENTER} r={18} fill="url(#centerJewel)" />
                <circle cx={CENTER - 4} cy={CENTER - 4} r={5} fill="rgba(255,255,255,0.7)" />
              </svg>

              {/* Pulsing center overlay (HTML for animation) */}
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
                  animation: spinning ? "none" : "hubPulse 2.4s ease-in-out infinite",
                }}
              />
            </div>

            {/* Pointer (top, fixed) */}
            <div
              className="absolute left-1/2 z-20 pointer-events-none"
              style={{
                top: -14,
                width: 0,
                height: 0,
                borderLeft: "18px solid transparent",
                borderRight: "18px solid transparent",
                borderTop: "32px solid #ff3366",
                filter: `drop-shadow(0 4px 10px rgba(255,51,102,0.7)) ${pointerPulse ? "brightness(1.4)" : ""}`,
                transformOrigin: "50% 0%",
                transform: `translateX(-50%) ${pointerPulse ? "translateY(2px)" : ""}`,
                animation: !spinning ? "pointerBob 2.5s ease-in-out infinite" : "none",
                transition: "filter 0.05s",
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
