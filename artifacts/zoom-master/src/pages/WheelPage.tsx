import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchWheelConfig,
  fetchWheelSpins,
  spinWheel,
  createStarsInvoice,
  confirmStarsPurchase,
  type WheelPrizeConfig,
  type WheelSpinResult,
} from "../utils/api";

interface WheelPageProps {
  telegramId?: string | null;
  onPrizeWon?: (zoom?: number) => void;
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

export function WheelPage({ telegramId, onPrizeWon }: WheelPageProps) {
  const [prizes, setPrizes] = useState<WheelPrizeConfig[]>([]);
  const [spins, setSpins] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelSpinResult | null>(null);
  const [winFlash, setWinFlash] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const tickerRef = useRef<HTMLAudioElement | null>(null);

  const refreshSpins = useCallback(async () => {
    if (!telegramId) return;
    setSpins(await fetchWheelSpins(telegramId));
  }, [telegramId]);

  useEffect(() => {
    fetchWheelConfig().then(setPrizes);
  }, []);

  useEffect(() => { refreshSpins(); }, [refreshSpins]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const segments = prizes.length;
  const segAngle = segments > 0 ? 360 / segments : 0;

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

    // Compute target rotation: pointer is at TOP (12 o'clock).
    // Each segment center sits at: i * segAngle + segAngle/2 (clockwise from top).
    // We rotate the wheel by -prizeCenter so that segment is under the pointer.
    // Add 6 full turns for drama + tiny random jitter for natural feel.
    const prizeCenter = r.prizeIndex * segAngle + segAngle / 2;
    const jitter = (Math.random() - 0.5) * (segAngle * 0.55);
    const turns = 6;
    const currentMod = ((rotation % 360) + 360) % 360;
    const targetMod = (360 - prizeCenter + jitter + 360) % 360;
    const delta = ((targetMod - currentMod) + 360) % 360;
    const newRotation = rotation + turns * 360 + delta;
    setRotation(newRotation);

    // Try to play soft tick sound
    try { tickerRef.current?.play().catch(() => {}); } catch { /**/ }

    // Wait for spin animation, then reveal prize
    window.setTimeout(() => {
      setSpinning(false);
      setResult(r);
      setHighlightIdx(r.prizeIndex);
      setSpins(r.spinsRemaining);
      setWinFlash(true);
      setTimeout(() => setWinFlash(false), 2200);
      if (onPrizeWon) onPrizeWon(r.prize.zoomAmount);
    }, 5200);
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
            if (c.ok) {
              setMessage("Spins added!");
              await refreshSpins();
            } else {
              setMessage(c.error || "Confirmation failed");
            }
          } else if (status === "failed") {
            setMessage("Payment failed");
          } else if (status === "cancelled") {
            setMessage("Payment cancelled");
          }
          setBuying(null);
        });
      } else {
        window.open(inv.invoiceUrl, "_blank");
        // Poll-style fallback: confirm shortly after
        setTimeout(async () => {
          const c = await confirmStarsPurchase(inv.txnId!, telegramId);
          if (c.ok) { setMessage("Spins added!"); await refreshSpins(); }
          setBuying(null);
        }, 4000);
      }
    } catch {
      setMessage("Error opening invoice");
      setBuying(null);
    }
  };

  // Build segment paths
  const SIZE = 280;
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

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="px-5 pt-5 pb-2 flex-shrink-0">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-black text-2xl tracking-wider neon-text">FORTUNE WHEEL</div>
            <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              Spin to win $ZOOM and rare planets
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-full text-xs font-black" style={{ background: "rgba(0,242,254,0.12)", color: "#00f2fe", border: "1px solid rgba(0,242,254,0.3)" }}>
            {spins} SPINS
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ touchAction: "pan-y" }}>
        {/* 3D Wheel Stage */}
        <div
          className="relative mx-auto my-4"
          style={{
            width: SIZE + 60,
            height: SIZE + 80,
            perspective: "1100px",
            perspectiveOrigin: "50% 30%",
          }}
        >
          {/* Glow disc behind */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              top: 40,
              left: 30,
              width: SIZE,
              height: SIZE,
              background: "radial-gradient(circle, rgba(0,242,254,0.35) 0%, rgba(0,242,254,0) 65%)",
              filter: "blur(28px)",
              opacity: winFlash ? 1 : 0.55,
              transition: "opacity 0.5s",
            }}
          />

          {/* Wheel */}
          <div
            className="absolute"
            style={{
              top: 40,
              left: 30,
              width: SIZE,
              height: SIZE,
              transformStyle: "preserve-3d",
              transform: `rotateX(22deg)`,
            }}
          >
            {/* Disc shadow / depth layers (simulate thickness) */}
            {[6, 5, 4, 3, 2, 1].map((d) => (
              <div
                key={d}
                className="absolute rounded-full"
                style={{
                  inset: 0,
                  background: "linear-gradient(180deg, #0a0e1a 0%, #1a1f2e 100%)",
                  transform: `translateZ(-${d * 2}px)`,
                  boxShadow: `0 0 0 1px rgba(255,255,255,0.02)`,
                }}
              />
            ))}

            {/* Spinning wheel */}
            <div
              className="absolute inset-0"
              style={{
                transform: `rotateZ(${rotation}deg)`,
                transition: spinning ? "transform 5.2s cubic-bezier(0.17, 0.85, 0.18, 1)" : "transform 0.4s ease-out",
                transformOrigin: "50% 50%",
                willChange: "transform",
              }}
            >
              <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block", filter: "drop-shadow(0 8px 22px rgba(0,0,0,0.7))" }}>
                <defs>
                  {prizes.map((p) => (
                    <radialGradient key={p.index} id={`segGrad${p.index}`} cx="50%" cy="50%" r="80%">
                      <stop offset="0%" stopColor={p.color} stopOpacity="0.95" />
                      <stop offset="100%" stopColor={p.color} stopOpacity="0.55" />
                    </radialGradient>
                  ))}
                  <radialGradient id="rimGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="92%" stopColor="rgba(0,0,0,0)" />
                    <stop offset="96%" stopColor="#ffd700" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#7a5a00" />
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
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth={1.5}
                        style={{
                          filter: isHi ? `drop-shadow(0 0 14px ${p.color})` : "none",
                          transition: "filter 0.4s",
                        }}
                      />
                      {/* Label */}
                      {(() => {
                        const mid = i * segAngle + segAngle / 2;
                        const lp = polar(mid, RADIUS * 0.62);
                        const rotLabel = mid;
                        return (
                          <text
                            x={lp.x}
                            y={lp.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="white"
                            fontSize={p.label.length > 8 ? 10 : 12}
                            fontWeight={900}
                            transform={`rotate(${rotLabel} ${lp.x} ${lp.y})`}
                            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)", letterSpacing: "0.04em" }}
                          >
                            {p.label}
                          </text>
                        );
                      })()}
                    </g>
                  );
                })}

                {/* Outer rim */}
                <circle cx={CENTER} cy={CENTER} r={RADIUS - 1} fill="none" stroke="url(#rimGrad)" strokeWidth={6} />
                <circle cx={CENTER} cy={CENTER} r={RADIUS - 4} fill="none" stroke="rgba(255,215,0,0.25)" strokeWidth={1} />

                {/* Studs around the rim */}
                {Array.from({ length: 16 }).map((_, k) => {
                  const a = (k / 16) * 360;
                  const sp = polar(a, RADIUS - 8);
                  return <circle key={k} cx={sp.x} cy={sp.y} r={2.2} fill="#ffd700" opacity={0.9} />;
                })}

                {/* Center hub */}
                <circle cx={CENTER} cy={CENTER} r={22} fill="#0a0e1a" stroke="#00f2fe" strokeWidth={2} />
                <circle cx={CENTER} cy={CENTER} r={14} fill="url(#rimGrad)" opacity={0.4} />
                <circle cx={CENTER} cy={CENTER} r={6} fill="#00f2fe" />
              </svg>
            </div>

            {/* Pointer (top, fixed) */}
            <div
              className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none"
              style={{
                top: -8,
                width: 0,
                height: 0,
                borderLeft: "16px solid transparent",
                borderRight: "16px solid transparent",
                borderTop: "28px solid #ff3366",
                filter: "drop-shadow(0 4px 8px rgba(255,51,102,0.6))",
                transformOrigin: "50% 0%",
                transform: spinning ? "translateX(-50%) rotate(0deg)" : "translateX(-50%)",
              }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 z-10 rounded-full pointer-events-none"
              style={{
                top: 16,
                width: 12,
                height: 12,
                background: "radial-gradient(circle, #fff 0%, #ff3366 70%)",
                boxShadow: "0 0 12px rgba(255,51,102,0.8)",
              }}
            />
          </div>
        </div>

        {/* Result strip */}
        <div className="text-center mb-3" style={{ minHeight: 36 }}>
          {spinning ? (
            <div className="text-sm font-bold tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
              SPINNING...
            </div>
          ) : result ? (
            <div
              className="inline-block px-4 py-2 rounded-full font-black text-sm tracking-wider animate-pulse"
              style={{
                background: `linear-gradient(135deg, ${result.prize.color}30, ${result.prize.color}10)`,
                color: result.prize.color,
                border: `1px solid ${result.prize.color}80`,
                boxShadow: `0 0 22px ${result.prize.color}60`,
              }}
            >
              ✦ YOU WON {result.prize.label}!
            </div>
          ) : null}
        </div>

        {/* Spin button */}
        <button
          onClick={handleSpin}
          disabled={spinning || spins <= 0}
          className="w-full py-4 rounded-2xl font-black text-base tracking-widest transition-all active:scale-95 mb-5"
          style={{
            background: spins > 0 && !spinning
              ? "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)"
              : "rgba(255,255,255,0.05)",
            color: spins > 0 && !spinning ? "#0a0e1a" : "rgba(255,255,255,0.3)",
            boxShadow: spins > 0 && !spinning ? "0 0 28px rgba(0,242,254,0.4)" : "none",
            border: "1px solid rgba(0,242,254,0.3)",
            cursor: spins > 0 && !spinning ? "pointer" : "not-allowed",
          }}
        >
          {spinning ? "SPINNING..." : spins > 0 ? `SPIN (${spins} LEFT)` : "NO SPINS — BUY BELOW"}
        </button>

        {/* Buy spins */}
        <div className="font-black text-sm tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
          Buy Spins with ⭐
        </div>
        <div className="flex flex-col gap-2">
          {SPIN_PACKS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleBuy(p.id)}
              disabled={buying === p.id}
              className="w-full flex items-center justify-between rounded-xl px-4 py-3 transition-all active:scale-98"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                opacity: buying === p.id ? 0.6 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-black" style={{ background: "rgba(0,242,254,0.12)", color: "#00f2fe" }}>
                  🎡
                </div>
                <div className="text-left">
                  <div className="font-black text-sm">{p.spins} {p.spins === 1 ? "Spin" : "Spins"}</div>
                  {p.badge && (
                    <div className="text-xs font-bold" style={{ color: "#43e97b" }}>{p.badge} OFF</div>
                  )}
                </div>
              </div>
              <div className="font-black text-sm" style={{ color: "#ffd700" }}>
                ⭐ {p.stars}
              </div>
            </button>
          ))}
        </div>

        {/* Prize odds */}
        <div className="mt-5 mb-2 font-black text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
          Possible Prizes
        </div>
        <div className="grid grid-cols-2 gap-2">
          {prizes.map((p) => (
            <div
              key={p.index}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${p.color}30` }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
              <div className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>{p.label}</div>
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
