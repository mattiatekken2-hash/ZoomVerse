import { useState, useEffect, useRef, useCallback } from "react";
import { fetchWheelStatus, spinWheel, fetchSpinLog, type WheelStatus, type SpinResult, type SpinLogEntry } from "../utils/api";

interface FortuneWheelProps {
  telegramId: string;
  firstName?: string;
  onClose: () => void;
  onPrizeGranted: (prize: string, zoomAmount: number) => void;
}

const SEGMENTS = [
  { name: "ZOOM",       label: "$ZOOM",      color: "#00e5ff", textColor: "#001820", icon: "💎",  weight: 1 },
  { name: "RARE",       label: "RARE",        color: "#4facfe", textColor: "#0a1a30", icon: "🔵", weight: 1 },
  { name: "TON",        label: "TON",         color: "#0098ea", textColor: "#ffffff", icon: "💰", weight: 0.3, isJackpot: true },
  { name: "ZOOM",       label: "$ZOOM",       color: "#00e5ff", textColor: "#001820", icon: "💎", weight: 1 },
  { name: "BLACK_HOLE", label: "BLACK\nHOLE", color: "#1a0025", textColor: "#ff00ff", icon: "🕳️", weight: 0.8, isDanger: true },
  { name: "ZOOM",       label: "$ZOOM",       color: "#00e5ff", textColor: "#001820", icon: "💎", weight: 1 },
  { name: "EPIC",       label: "EPIC",        color: "#c471ed", textColor: "#1a0030", icon: "🟣", weight: 1 },
  { name: "ZOOM",       label: "$ZOOM",       color: "#00e5ff", textColor: "#001820", icon: "💎", weight: 1 },
  { name: "STARS",      label: "STARS",       color: "#ffdd00", textColor: "#332800", icon: "⭐", weight: 0.5 },
  { name: "ZOOM",       label: "$ZOOM",       color: "#00e5ff", textColor: "#001820", icon: "💎", weight: 1 },
  { name: "GOLD",       label: "GOLD",        color: "#ffd700", textColor: "#332800", icon: "🟡", weight: 0.8 },
  { name: "ZOOM",       label: "$ZOOM",       color: "#00e5ff", textColor: "#001820", icon: "💎", weight: 1 },
  { name: "SUN",        label: "THE\nSUN",    color: "#ff8c00", textColor: "#1a0800", icon: "☀️", weight: 0.6, isLegendary: true },
  { name: "RARE",       label: "RARE",        color: "#4facfe", textColor: "#0a1a30", icon: "🔵", weight: 1 },
  { name: "ZOOM",       label: "$ZOOM",       color: "#00e5ff", textColor: "#001820", icon: "💎", weight: 1 },
  { name: "BLACK_HOLE", label: "BLACK\nHOLE", color: "#1a0025", textColor: "#ff00ff", icon: "🕳️", weight: 0.8, isDanger: true },
];

const TOTAL_WEIGHT_VISUAL = SEGMENTS.reduce((s, seg) => s + seg.weight, 0);

const SEGMENT_ANGLES: number[] = SEGMENTS.map(s => (s.weight / TOTAL_WEIGHT_VISUAL) * 360);

const SEGMENT_STARTS: number[] = [];
{
  let acc = 0;
  for (const a of SEGMENT_ANGLES) {
    SEGMENT_STARTS.push(acc);
    acc += a;
  }
}

const PRIZE_LABELS: Record<string, string> = {
  ZOOM: "$ZOOM",
  RARE: "RARE PLANET",
  EPIC: "EPIC PLANET",
  GOLD: "GOLD PLANET",
  SUN: "THE SUN",
  BLACK_HOLE: "BLACK HOLE",
  TON: "TON",
  STARS: "STARS",
};

function getSegCenter(idx: number): number {
  return SEGMENT_STARTS[idx] + SEGMENT_ANGLES[idx] / 2;
}

function getTargetAngle(prize: string): number {
  const prizeIndices = SEGMENTS.map((s, i) => s.name === prize ? i : -1).filter(i => i >= 0);
  if (prizeIndices.length === 0) return 0;

  const tonIndex = SEGMENTS.findIndex(s => s.isJackpot);

  let bestIdx = prizeIndices[0];
  if (tonIndex >= 0) {
    let bestDist = 999;
    for (const idx of prizeIndices) {
      const dist = Math.abs(idx - tonIndex);
      const wrapDist = Math.min(dist, SEGMENTS.length - dist);
      if (wrapDist <= 2 && wrapDist < bestDist) {
        bestDist = wrapDist;
        bestIdx = idx;
      }
    }
    if (bestDist === 999) bestIdx = prizeIndices[Math.floor(Math.random() * prizeIndices.length)];
  }

  const segCenter = getSegCenter(bestIdx);
  const halfSeg = SEGMENT_ANGLES[bestIdx] / 2;
  const nearMissOffset = (Math.random() * 0.35 + 0.05) * halfSeg * (Math.random() < 0.5 ? 1 : -1);

  if (tonIndex >= 0) {
    const tonCenter = getSegCenter(tonIndex);
    const finalAngle = segCenter + nearMissOffset;
    const distToTon = Math.abs(((finalAngle - tonCenter + 180) % 360) - 180);
    if (distToTon < 3) return segCenter;
  }

  return segCenter + nearMissOffset;
}

export function FortuneWheel({ telegramId, firstName, onClose, onPrizeGranted }: FortuneWheelProps) {
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [logs, setLogs] = useState<SpinLogEntry[]>([]);
  const [claimed, setClaimed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const currentRotRef = useRef(0);
  const blackHoleGlowRef = useRef(0);

  useEffect(() => {
    fetchWheelStatus(telegramId).then(setStatus);
    fetchSpinLog().then(setLogs);
  }, [telegramId]);

  const drawWheel = useCallback((rot: number, blackHoleGlow: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(window.innerWidth - 40, 340);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 4;

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);

    for (let i = 0; i < SEGMENTS.length; i++) {
      const seg = SEGMENTS[i];
      const segRad = (SEGMENT_ANGLES[i] * Math.PI) / 180;
      const startAngle = (SEGMENT_STARTS[i] * Math.PI) / 180 - Math.PI / 2;
      const endAngle = startAngle + segRad;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();

      if (seg.isJackpot) {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        grad.addColorStop(0, "#00d4ff");
        grad.addColorStop(0.5, "#0098ea");
        grad.addColorStop(1, "#005588");
        ctx.fillStyle = grad;
      } else if (seg.isDanger && blackHoleGlow > 0) {
        const g = blackHoleGlow;
        ctx.fillStyle = `rgb(${Math.floor(40 + 80 * g)}, ${Math.floor(10 * g)}, ${Math.floor(60 + 100 * g)})`;
      } else if (seg.isDanger) {
        ctx.fillStyle = seg.color;
      } else if (seg.isLegendary) {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        grad.addColorStop(0, "#fff4b0");
        grad.addColorStop(0.4, "#ffa500");
        grad.addColorStop(1, "#ff6600");
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = seg.color;
      }
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (seg.isJackpot) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.clip();
        for (let s = 0; s < 3; s++) {
          const sparkAngle = startAngle + (segRad / 4) * (s + 1);
          const sparkR = radius * (0.4 + Math.random() * 0.4);
          const sx = Math.cos(sparkAngle) * sparkR;
          const sy = Math.sin(sparkAngle) * sparkR;
          const sparkGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 8);
          sparkGrad.addColorStop(0, "rgba(255,255,255,0.9)");
          sparkGrad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = sparkGrad;
          ctx.fillRect(sx - 8, sy - 8, 16, 16);
        }
        ctx.restore();
      }

      ctx.save();
      const midAngle = startAngle + segRad / 2;
      const textR = radius * 0.65;
      ctx.translate(Math.cos(midAngle) * textR, Math.sin(midAngle) * textR);
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.fillStyle = seg.textColor;
      const fontScale = Math.min(1, seg.weight / 0.6);
      ctx.font = `bold ${Math.max(7, radius * 0.08 * fontScale)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = seg.label.split("\n");
      const lineH = radius * 0.1 * fontScale;
      const totalH = (lines.length - 1) * lineH;
      lines.forEach((line, li) => {
        ctx.fillText(line, 0, -totalH / 2 + li * lineH);
      });

      ctx.font = `${Math.max(8, radius * 0.12 * fontScale)}px sans-serif`;
      ctx.fillText(seg.icon, 0, -totalH / 2 - lineH * 1.2);
      ctx.restore();
    }

    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,229,255,0.15)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const dotCount = 24;
    for (let d = 0; d < dotCount; d++) {
      const da = (d / dotCount) * Math.PI * 2 - Math.PI / 2;
      const dx = cx + Math.cos(da) * (radius + 8);
      const dy = cy + Math.sin(da) * (radius + 8);
      ctx.beginPath();
      ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = d % 2 === 0 ? "#00e5ff" : "#ffd700";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    const centerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
    centerGrad.addColorStop(0, "#ffffff");
    centerGrad.addColorStop(0.5, "#00e5ff");
    centerGrad.addColorStop(1, "#0066aa");
    ctx.fillStyle = centerGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const pointerY = cy - radius - 6;
    ctx.beginPath();
    ctx.moveTo(cx, pointerY - 4);
    ctx.lineTo(cx - 10, pointerY - 22);
    ctx.lineTo(cx + 10, pointerY - 22);
    ctx.closePath();
    ctx.fillStyle = "#ff3366";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, []);

  useEffect(() => {
    drawWheel(0, 0);
  }, [drawWheel]);

  const handleSpin = useCallback(async () => {
    if (spinning || showResult) return;

    setSpinning(true);
    setResult(null);
    setShowResult(false);
    setClaimed(false);

    const spinResult = await spinWheel(telegramId, firstName);

    if (!spinResult.ok) {
      setSpinning(false);
      return;
    }

    setResult(spinResult);

    const targetAngle = getTargetAngle(spinResult.prize);
    const totalSpin = 360 * (8 + Math.random() * 4) + (360 - targetAngle);
    const duration = 6000 + Math.random() * 2000;
    const startTime = performance.now();
    const startRot = currentRotRef.current;

    const blackHoleIndices = SEGMENTS.map((s, i) => s.isDanger ? i : -1).filter(i => i >= 0);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const currentAngle = startRot + totalSpin * ease;
      currentRotRef.current = currentAngle;

      let bhGlow = 0;
      const normalizedAngle = ((360 - (currentAngle % 360)) + 360) % 360;
      for (const bi of blackHoleIndices) {
        const bhCenter = getSegCenter(bi);
        const bhHalf = SEGMENT_ANGLES[bi] / 2;
        const dist = Math.abs(((normalizedAngle - bhCenter + 180) % 360) - 180);
        if (dist < SEGMENT_ANGLES[bi]) {
          bhGlow = Math.max(bhGlow, 1 - dist / (bhHalf * 2));
        }
      }
      blackHoleGlowRef.current = bhGlow;

      drawWheel(currentAngle, bhGlow);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setShowResult(true);
        setStatus(prev => prev ? {
          ...prev,
          spinsToday: spinResult.spinsToday,
          hasFreeSpinToday: false,
          nextCost: spinResult.nextCost,
        } : prev);
        fetchSpinLog().then(setLogs);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [spinning, showResult, telegramId, firstName, drawWheel]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleClaim = useCallback(() => {
    if (!result) return;
    setClaimed(true);
    onPrizeGranted(result.prize, result.zoomAmount);

    window.dispatchEvent(new Event("zoom-data-refresh"));
  }, [result, onPrizeGranted]);

  const handleNewSpin = useCallback(() => {
    setShowResult(false);
    setResult(null);
    setClaimed(false);
  }, []);

  const isPlanetPrize = result && ["RARE", "EPIC", "GOLD", "SUN"].includes(result.prize);
  const isZoomPrize = result?.prize === "ZOOM";
  const isBlackHole = result?.prize === "BLACK_HOLE";

  const prizeColor = result ? (
    SEGMENTS.find(s => s.name === result.prize)?.color ?? "#ffffff"
  ) : "#ffffff";

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "#060810" }}>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <button
          onClick={onClose}
          className="text-white/60 text-sm font-bold tracking-wider"
        >
          ✕ CLOSE
        </button>
        <div className="text-xs text-white/40 font-bold tracking-wider">
          FORTUNE WHEEL
        </div>
        <div className="text-xs text-cyan-400 font-bold">
          {status?.hasFreeSpinToday ? "🎁 FREE SPIN" : `⭐ ${status?.nextCost ?? 20}`}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative" style={{ minHeight: 0 }}>
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)`,
              transform: "scale(1.3)",
              filter: "blur(20px)",
            }}
          />
          <canvas ref={canvasRef} className="relative z-10" />

          {spinning && blackHoleGlowRef.current > 0 && (
            <div
              className="absolute inset-0 rounded-full pointer-events-none z-20"
              style={{
                background: `radial-gradient(circle, rgba(255,0,255,${blackHoleGlowRef.current * 0.15}) 0%, transparent 60%)`,
                animation: "pulse 0.3s ease-in-out infinite",
              }}
            />
          )}
        </div>

        {showResult && result && (
          <div
            className="absolute inset-0 flex items-center justify-center z-30"
            style={{ background: "rgba(6,8,16,0.85)", backdropFilter: "blur(8px)" }}
          >
            <div className="flex flex-col items-center gap-4 px-6 animate-in fade-in zoom-in duration-500">
              <div className="text-5xl">
                {isBlackHole ? "🕳️" : isPlanetPrize ? (
                  SEGMENTS.find(s => s.name === result.prize)?.icon ?? "🪐"
                ) : isZoomPrize ? "💎" : ""}
              </div>

              <div
                className="text-2xl font-black tracking-wider text-center"
                style={{ color: prizeColor, textShadow: `0 0 20px ${prizeColor}66` }}
              >
                {isBlackHole ? "BLACK HOLE!" : PRIZE_LABELS[result.prize] ?? result.prize}
              </div>

              {isZoomPrize && (
                <div className="text-3xl font-black text-cyan-400">
                  +{result.zoomAmount} $ZOOM
                </div>
              )}

              {isBlackHole && (
                <div className="text-sm text-white/50 text-center">
                  The void consumed your spin...<br />Better luck next time!
                </div>
              )}

              {isPlanetPrize && !claimed && (
                <button
                  onClick={handleClaim}
                  className="mt-2 px-8 py-3 rounded-xl font-black text-base tracking-wider uppercase transition-all active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, ${prizeColor}, ${prizeColor}bb)`,
                    color: "#060810",
                    boxShadow: `0 0 28px ${prizeColor}66`,
                  }}
                >
                  CLAIM
                </button>
              )}

              {isZoomPrize && !claimed && (
                <button
                  onClick={handleClaim}
                  className="mt-2 px-8 py-3 rounded-xl font-black text-base tracking-wider uppercase transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, #00e5ff, #00b8d4)",
                    color: "#060810",
                    boxShadow: "0 0 28px rgba(0,229,255,0.4)",
                  }}
                >
                  CLAIM
                </button>
              )}

              {(claimed || isBlackHole) && (
                <button
                  onClick={handleNewSpin}
                  className="mt-2 px-6 py-2 rounded-lg font-bold text-sm tracking-wider text-white/80 border border-white/20 transition-all active:scale-95"
                >
                  {status?.nextCost ? `SPIN AGAIN ⭐${status.nextCost}` : "SPIN AGAIN"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!spinning && !showResult && (
        <div className="px-5 pb-4">
          <button
            onClick={handleSpin}
            disabled={spinning}
            className="w-full py-4 rounded-xl font-black text-lg tracking-wider uppercase transition-all active:scale-95"
            style={{
              background: status?.hasFreeSpinToday
                ? "linear-gradient(135deg, #00e5ff, #7c4dff)"
                : "linear-gradient(135deg, #ffd700, #ff8c00)",
              color: "#060810",
              boxShadow: status?.hasFreeSpinToday
                ? "0 0 32px rgba(0,229,255,0.4)"
                : "0 0 32px rgba(255,215,0,0.4)",
            }}
          >
            {status?.hasFreeSpinToday ? "🎁 FREE SPIN!" : `⭐ SPIN (${status?.nextCost ?? 20} Stars)`}
          </button>
        </div>
      )}

      <div className="px-4 pb-4" style={{ maxHeight: "120px", overflowY: "auto" }}>
        <div className="text-xs font-bold text-white/30 tracking-wider mb-2">LIVE SPIN LOG</div>
        {logs.length === 0 ? (
          <div className="text-xs text-white/20 text-center py-2">No spins yet</div>
        ) : (
          <div className="space-y-1">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                <span className="truncate" style={{ maxWidth: "40%" }}>
                  {log.firstName ?? log.telegramId.slice(0, 6) + "..."}
                </span>
                <span
                  className="font-bold"
                  style={{ color: SEGMENTS.find(s => s.name === log.prize)?.color ?? "#fff" }}
                >
                  {PRIZE_LABELS[log.prize] ?? log.prize}
                </span>
                <span>
                  {log.isFree ? "🎁" : `⭐${log.starsSpent}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
