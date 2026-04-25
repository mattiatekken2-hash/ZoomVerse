import { useEffect, useRef, useState, useCallback } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import {
  fetchArcadeState, fetchArcadeLeaderboard, startArcadeLife,
  finishArcadeRun, confirmTonPurchase, pollTxnUntilFinal,
  type ArcadeState, type ArcadeLeaderboardEntry,
} from "../utils/api";

interface ArcadePageProps {
  telegramId: string | null;
  visible: boolean;
}

const MAX_Z = 500;
const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const EXTRA_LIFE_ITEM_ID = "arcade_extra_life";
const EXTRA_LIFE_TON = 0.10;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export function ArcadePage({ telegramId, visible }: ArcadePageProps) {
  const [state, setState] = useState<ArcadeState | null>(null);
  const [leaderboard, setLeaderboard] = useState<ArcadeLeaderboardEntry[]>([]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [tick, setTick] = useState(0); // 1s tick to refresh countdown

  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();

  const refresh = useCallback(async () => {
    if (!telegramId) return;
    const [st, lb] = await Promise.all([
      fetchArcadeState(telegramId),
      fetchArcadeLeaderboard(),
    ]);
    setState(st);
    setLeaderboard(lb);
  }, [telegramId]);

  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [visible]);

  // Show toast briefly
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const handleStart = useCallback(async () => {
    if (!telegramId || busy) return;
    setBusy(true);
    try {
      const r = await startArcadeLife(telegramId);
      if (!r.ok) {
        setToast({ text: r.message || "No lives", ok: false });
        return;
      }
      sessionStorage.setItem("zjump_session", r.sessionToken);
      setPlaying(true);
    } finally {
      setBusy(false);
    }
  }, [telegramId, busy]);

  // On-chain TON purchase for an extra life — same flow as SUN.
  const handleBuyLife = useCallback(async () => {
    if (!telegramId || busy) return;
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setToast({ text: "Connect your wallet first", ok: false });
      return;
    }
    setBusy(true);
    try {
      const nanotons = BigInt(Math.round(EXTRA_LIFE_TON * 1e9)).toString();
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: WALLET, amount: nanotons }],
      });
      const boc = txResult.boc || "";
      const confirmResult = await confirmTonPurchase(
        telegramId, EXTRA_LIFE_ITEM_ID, connectedAddress, EXTRA_LIFE_TON, boc
      );
      if (confirmResult.alreadyCredited) {
        setToast({ text: "+1 extra life", ok: true });
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else if (confirmResult.pending && confirmResult.txnId) {
        setToast({ text: "Verifying payment on-chain…", ok: true });
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setToast({ text: "+1 extra life", ok: true });
          window.dispatchEvent(new Event("zoom-data-refresh"));
        } else if (final?.status === "failed") {
          setToast({ text: "Payment not detected on-chain", ok: false });
        } else {
          setToast({ text: "Awaiting confirmation — life will be credited automatically", ok: true });
        }
      } else if (confirmResult.ok) {
        setToast({ text: "+1 extra life", ok: true });
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else {
        setToast({ text: confirmResult.error || "Payment failed", ok: false });
      }
      await refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setToast({ text: "Payment cancelled", ok: false });
      } else {
        setToast({ text: "TON payment failed", ok: false });
        console.error("[arcade ton] sendTransaction error:", err);
      }
    } finally {
      setBusy(false);
    }
  }, [telegramId, busy, connectedAddress, tonConnectUI, refresh]);

  const handleGameEnd = useCallback(async (zEarned: number, durationMs: number) => {
    setPlaying(false);
    if (!telegramId) return;
    const token = sessionStorage.getItem("zjump_session");
    sessionStorage.removeItem("zjump_session");
    if (!token) { await refresh(); return; }
    const r = await finishArcadeRun(telegramId, token, zEarned, durationMs);
    if (r.ok) {
      setToast({
        text: r.capped ? `+${r.credited} Z (500 CAP!)` : `+${r.credited} Z`,
        ok: true,
      });
    }
    await refresh();
  }, [telegramId, refresh]);

  const freeReady = !!state?.freeLifeAvailable;
  const extraLives = state?.extraLives ?? 0;
  const canPlay = freeReady || extraLives > 0;
  void tick;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-lg tracking-tight flex items-center gap-2">
            🕹️ Arcade · <span className="neon-text">Zoom Jump</span>
          </h2>
          <span className="text-xs font-bold px-3 py-1 rounded-full border" style={{ borderColor: "rgba(255,215,0,0.3)", color: "#ffd700", background: "rgba(255,215,0,0.06)" }}>
            ⚡ {(state?.zCoins ?? 0).toLocaleString()} Z
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        {/* Z balance widget + future ZOOM converter */}
        <div className="rounded-2xl p-4 border mb-3 relative overflow-hidden"
          style={{ borderColor: "rgba(255,215,0,0.18)", background: "linear-gradient(135deg, rgba(255,215,0,0.08), rgba(196,113,237,0.04))" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 18 }}>⚡</span>
              <span className="font-black text-sm tracking-wide" style={{ color: "#ffd700" }}>Z BALANCE</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,215,0,0.6)" }}>
              best run: {(state?.zCoinsBest ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="font-black text-3xl gold-text" style={{ letterSpacing: "-0.02em" }}>
            {(state?.zCoins ?? 0).toLocaleString()} <span style={{ fontSize: 14, opacity: 0.7 }}>Z</span>
          </div>
          <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            Convertible to $ZOOM (coming soon)
          </div>
          <button
            disabled
            className="w-full mt-3 py-2.5 rounded-xl font-black text-xs tracking-widest uppercase border"
            style={{ background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.25)", borderColor: "rgba(255,255,255,0.06)", letterSpacing: "0.1em", cursor: "not-allowed" }}
          >
            Convert Z → $ZOOM (Coming soon)
          </button>
        </div>

        {/* Lives + Play */}
        <div className="rounded-2xl p-4 border mb-3" style={{ borderColor: "rgba(0,242,254,0.16)", background: "rgba(0,242,254,0.03)" }}>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-xl p-3 border" style={{ borderColor: "rgba(0,230,118,0.2)", background: "rgba(0,230,118,0.05)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(0,230,118,0.7)" }}>Free life</div>
              <div className="font-black text-base mt-1" style={{ color: freeReady ? "#00e676" : "rgba(255,255,255,0.4)" }}>
                {freeReady ? "AVAILABLE" : formatCountdown(state?.nextFreeLifeMs ? state.nextFreeLifeMs - (tick * 1000) : 0)}
              </div>
            </div>
            <div className="rounded-xl p-3 border" style={{ borderColor: "rgba(196,113,237,0.2)", background: "rgba(196,113,237,0.05)" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(196,113,237,0.7)" }}>Extra lives</div>
              <div className="font-black text-base mt-1" style={{ color: extraLives > 0 ? "#c471ed" : "rgba(255,255,255,0.4)" }}>
                × {extraLives}
              </div>
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={!canPlay || busy || !telegramId}
            className="w-full py-3.5 rounded-xl font-black text-sm tracking-widest uppercase border transition-all"
            style={{
              background: canPlay && !busy ? "linear-gradient(135deg, #00f2fe, #4facfe)" : "rgba(255,255,255,0.04)",
              color: canPlay && !busy ? "#060810" : "rgba(255,255,255,0.25)",
              borderColor: "transparent",
              cursor: canPlay && !busy ? "pointer" : "not-allowed",
              boxShadow: canPlay && !busy ? "0 0 20px rgba(0,242,254,0.35)" : "none",
            }}
            data-testid="btn-start-zoom-jump"
          >
            {busy ? "…" : canPlay ? "▶ START — ZOOM JUMP" : "No lives available"}
          </button>

          <button
            onClick={handleBuyLife}
            disabled={busy || !telegramId}
            className="w-full mt-2 py-2.5 rounded-xl font-black text-xs tracking-widest uppercase border"
            style={{
              background: "rgba(0,210,255,0.08)",
              color: "#00d2ff",
              borderColor: "rgba(0,210,255,0.25)",
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
            data-testid="btn-buy-extra-life"
          >
            {busy ? "Processing…" : `+ EXTRA LIFE · ${EXTRA_LIFE_TON} TON`}
          </button>

          <div className="text-[10px] mt-2 leading-relaxed text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
            1 free life every 24h · 500 Z cap per game
          </div>
        </div>

        {/* Leaderboard */}
        <div className="rounded-2xl p-3 border" style={{ borderColor: "rgba(255,215,0,0.18)", background: "rgba(255,215,0,0.03)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontSize: 14 }}>🏆</span>
            <span className="font-black text-sm tracking-wide" style={{ color: "#ffd700" }}>TOP 10 — Zoom Jump</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {leaderboard.length === 0 && (
              <div className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,0.2)" }}>
                No players yet — be the first!
              </div>
            )}
            {leaderboard.map((e) => {
              const isUser = !!telegramId && e.telegramId === telegramId;
              const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : null;
              return (
                <div key={e.telegramId} className="rounded-xl border flex items-center gap-3 px-3 py-2"
                  style={{
                    borderColor: isUser ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.05)",
                    background: isUser ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.02)",
                  }}>
                  <div className="font-black text-sm w-7 text-center flex-shrink-0" style={{ color: isUser ? "#ffd700" : "rgba(255,255,255,0.3)" }}>
                    {medal ?? `#${e.rank}`}
                  </div>
                  <div className="flex-1 font-bold text-sm truncate" style={{ color: isUser ? "#ffd700" : "rgba(255,255,255,0.6)" }}>
                    {e.firstName}{isUser && <span className="text-xs opacity-50 ml-1">(you)</span>}
                  </div>
                  <div className="text-xs font-black tabular-nums" style={{ color: isUser ? "#ffd700" : "rgba(255,255,255,0.45)" }}>
                    {e.zCoins.toLocaleString()} Z
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {playing && (
        <ZoomJumpGame
          onEnd={handleGameEnd}
          maxZ={MAX_Z}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-black tracking-widest"
          style={{
            top: 70, zIndex: 9999,
            background: toast.ok ? "rgba(0,230,118,0.18)" : "rgba(255,65,108,0.18)",
            border: `1px solid ${toast.ok ? "rgba(0,230,118,0.35)" : "rgba(255,65,108,0.35)"}`,
            color: toast.ok ? "#00e676" : "#ff416c",
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── ZOOM JUMP GAME ─────────────────────── */

interface ZoomJumpGameProps {
  onEnd: (zEarned: number, durationMs: number) => void;
  maxZ: number;
}

type Platform = { x: number; y: number; w: number; type: "normal" | "moving"; vx: number; coin?: boolean };

function ZoomJumpGame({ onEnd, maxZ }: ZoomJumpGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const [hudZ, setHudZ] = useState(0);
  const [exploding, setExploding] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Logical (game) world is fixed-size for consistent feel; we scale to fit.
    const W = 360;
    const H = 600;

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const setCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const scale = Math.min(rect.width / W, rect.height / H);
      const cssW = W * scale;
      const cssH = H * scale;
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
    };
    setCanvasSize();
    window.addEventListener("resize", setCanvasSize);

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // ── World state ────────────────────────────────────────────
    const player = {
      x: W / 2, y: H - 100, w: 28, h: 32,
      vx: 0, vy: 0,
      facing: 1 as 1 | -1,
    };
    const GRAVITY = 0.42;
    const JUMP_VY = -11.2;
    const MOVE_ACCEL = 0.6;
    const MAX_VX = 6;
    const FRICTION = 0.86;

    const platforms: Platform[] = [];
    let cameraY = 0;          // how much the world has scrolled (≥ 0)
    let highestY = player.y;  // smallest y reached (negative as we go up)
    let zCoins = 0;
    let dead = false;
    let endedFlag = false;
    let explodeTimer = 0;
    const particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];

    // Initial platforms — staircase climbing up.
    function spawnInitial() {
      platforms.length = 0;
      // Ground platform
      platforms.push({ x: W / 2 - 40, y: H - 30, w: 80, type: "normal", vx: 0 });
      let y = H - 90;
      while (y > -200) {
        const w = 56 + Math.floor(Math.random() * 30);
        const x = 12 + Math.random() * (W - 24 - w);
        const moving = y < H / 2 && Math.random() < 0.18;
        platforms.push({
          x, y, w,
          type: moving ? "moving" : "normal",
          vx: moving ? (Math.random() < 0.5 ? -1.4 : 1.4) : 0,
          coin: Math.random() < 0.18,
        });
        y -= 60 + Math.random() * 40;
      }
    }
    spawnInitial();

    function spawnPlatformAt(yWorld: number) {
      const w = 50 + Math.floor(Math.random() * 30);
      const x = 12 + Math.random() * (W - 24 - w);
      // Difficulty: more moving platforms higher up
      const altitude = Math.max(0, -yWorld);
      const movingProb = Math.min(0.55, 0.12 + altitude / 6000);
      const moving = Math.random() < movingProb;
      platforms.push({
        x, y: yWorld, w,
        type: moving ? "moving" : "normal",
        vx: moving ? (Math.random() < 0.5 ? -1.6 - Math.random() * 1 : 1.6 + Math.random() * 1) : 0,
        coin: Math.random() < 0.22,
      });
    }

    // ── Input: touch / mouse / keyboard ────────────────────────
    let pointerActive = false;
    let pointerX: number | null = null;

    const getLocalX = (clientX: number): number => {
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * (W / rect.width);
      return Math.max(0, Math.min(W, px));
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerActive = true;
      pointerX = getLocalX(e.clientX);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointerActive) return;
      pointerX = getLocalX(e.clientX);
      e.preventDefault();
    };
    const onPointerUp = (e: PointerEvent) => {
      pointerActive = false;
      pointerX = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    let leftKey = false, rightKey = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") leftKey = true;
      if (e.key === "ArrowRight" || e.key === "d") rightKey = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") leftKey = false;
      if (e.key === "ArrowRight" || e.key === "d") rightKey = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── Drawing helpers ────────────────────────────────────────
    function clear() {
      // Space gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0a0e23");
      g.addColorStop(0.55, "#0c1024");
      g.addColorStop(1, "#070912");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Stars (parallax — offset by cameraY * 0.2)
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 71) % W;
        const sy = (((i * 137) % H) + cameraY * 0.2) % H;
        const r = (i % 4 === 0) ? 1.3 : 0.7;
        ctx.fillRect(sx, sy, r, r);
      }
    }

    function drawPlatform(p: Platform) {
      const py = p.y - cameraY;
      if (py < -20 || py > H + 20) return;
      const isMoving = p.type === "moving";
      ctx.fillStyle = isMoving ? "#c471ed" : "#00f2fe";
      ctx.shadowColor = isMoving ? "rgba(196,113,237,0.7)" : "rgba(0,242,254,0.7)";
      ctx.shadowBlur = 10;
      ctx.fillRect(p.x, py, p.w, 8);
      ctx.shadowBlur = 0;
      // Top highlight
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(p.x, py, p.w, 2);

      if (p.coin) {
        const cx = p.x + p.w / 2;
        const cy = py - 14;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "rgba(255,215,0,0.9)";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff5b0";
        ctx.fillRect(cx - 1.5, cy - 2, 1.5, 4);
      }
    }

    function drawAstronaut(x: number, y: number, facing: 1 | -1) {
      // Pixel-art astronaut, ~28x32, drawn centered on (x,y) bottom-aligned
      const px = Math.round(x - 14);
      const py = Math.round(y - 32);
      const flip = facing === -1;
      ctx.save();
      if (flip) {
        ctx.translate(px + 28, py);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(px, py);
      }
      // helper
      const rect = (rx: number, ry: number, rw: number, rh: number, color: string) => {
        ctx.fillStyle = color; ctx.fillRect(rx, ry, rw, rh);
      };
      // Helmet glow
      ctx.shadowColor = "rgba(0,242,254,0.45)";
      ctx.shadowBlur = 8;
      rect(7, 2, 14, 12, "#e8f4ff");           // helmet
      ctx.shadowBlur = 0;
      rect(9, 5, 10, 7, "#0d1a3a");            // visor
      rect(11, 6, 3, 2, "#00f2fe");            // visor highlight
      rect(15, 7, 1, 1, "#ffffff");
      // Body suit
      rect(8, 14, 12, 11, "#f3f7ff");
      rect(11, 16, 6, 4, "#00d2ff");           // chest panel
      rect(12, 17, 2, 1, "#ffd700");
      rect(15, 17, 1, 1, "#ff416c");
      // Backpack hint (right side)
      rect(20, 14, 2, 9, "#cdd9ee");
      // Arms
      rect(5, 16, 3, 6, "#f3f7ff");
      rect(20, 16, 3, 6, "#f3f7ff");
      // Legs / boots
      rect(9, 25, 4, 5, "#e8eefa");
      rect(15, 25, 4, 5, "#e8eefa");
      rect(9, 30, 4, 2, "#1a2240");
      rect(15, 30, 4, 2, "#1a2240");
      ctx.restore();
    }

    function drawParticles() {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / 40);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2 - cameraY, 4, 4);
      }
      ctx.globalAlpha = 1;
    }

    function spawnExplosion(x: number, y: number) {
      const colors = ["#00f2fe", "#ffd700", "#ff416c", "#c471ed", "#ffffff"];
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 6;
        particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 40 + Math.floor(Math.random() * 20),
          color: colors[i % colors.length]!,
        });
      }
    }

    // ── Game loop ──────────────────────────────────────────────
    let lastT = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(34, t - lastT); // clamp
      lastT = t;
      const step = dt / 16.667; // 60fps reference

      if (!dead) {
        // Input → horizontal velocity
        let targetVX = 0;
        if (pointerActive && pointerX !== null) {
          const diff = pointerX - player.x;
          targetVX = Math.max(-MAX_VX, Math.min(MAX_VX, diff * 0.18));
        } else if (leftKey || rightKey) {
          if (leftKey) player.vx -= MOVE_ACCEL * step;
          if (rightKey) player.vx += MOVE_ACCEL * step;
        }
        if (pointerActive) {
          // Smooth toward targetVX
          player.vx = player.vx * 0.65 + targetVX * 0.35;
        } else {
          player.vx *= Math.pow(FRICTION, step);
        }
        if (player.vx > MAX_VX) player.vx = MAX_VX;
        if (player.vx < -MAX_VX) player.vx = -MAX_VX;
        if (Math.abs(player.vx) > 0.2) player.facing = player.vx > 0 ? 1 : -1;

        // Gravity
        player.vy += GRAVITY * step;

        // Move
        player.x += player.vx * step;
        player.y += player.vy * step;

        // Wrap horizontally
        if (player.x < -10) player.x = W + 10;
        if (player.x > W + 10) player.x = -10;

        // Move platforms
        for (const p of platforms) {
          if (p.type === "moving") {
            p.x += p.vx * step;
            if (p.x < 0) { p.x = 0; p.vx *= -1; }
            if (p.x + p.w > W) { p.x = W - p.w; p.vx *= -1; }
          }
        }

        // Collision with platforms — only when falling, and only when the
        // astronaut's FEET cross the TOP edge of the platform from above.
        // Foot footprint is ~12px wide centered on player.x (boots), so we
        // require the feet to actually overlap the platform — no body-grazing.
        if (player.vy > 0) {
          const feetY = player.y;                  // y is bottom anchor (feet)
          const prevFeetY = feetY - player.vy * step;
          const FOOT_HALF = 6;                     // half foot footprint width
          for (const p of platforms) {
            const platTop = p.y;
            const within = (player.x + FOOT_HALF) > p.x && (player.x - FOOT_HALF) < (p.x + p.w);
            // Strict: previous frame feet were above platform top, this frame
            // feet are at or below it → the base just touched the top edge.
            const crossed = prevFeetY <= platTop && feetY >= platTop;
            if (within && crossed) {
              player.y = platTop;
              player.vy = JUMP_VY;
              if (p.coin) {
                p.coin = false;
                const before = zCoins;
                zCoins = Math.min(maxZ, zCoins + 5);
                if (before < maxZ && zCoins >= maxZ) {
                  // Trigger explosion at cap
                  setExploding(true);
                  spawnExplosion(player.x, player.y - 16);
                  dead = true;
                  explodeTimer = 60;
                }
              }
              break;
            }
          }
        }

        // ── Smooth camera follow ───────────────────────────────
        // Camera anchors the astronaut around screen middle (H * 0.5):
        // as soon as the player rises above that line, the world scrolls
        // up via a frame-rate-independent lerp so upcoming platforms
        // become visible in advance and motion stays buttery.
        const ANCHOR_Y = H * 0.5;
        const targetCameraY = player.y - ANCHOR_Y;
        if (targetCameraY < cameraY) {
          // ~22% catch-up per 60fps frame, scaled correctly for any dt.
          const lerp = 1 - Math.pow(0.78, step);
          cameraY += (targetCameraY - cameraY) * lerp;

          // Track altitude climbed and award Z (1 Z per 12 px climbed)
          highestY = Math.min(highestY, player.y);
          const altitudeZ = Math.floor(Math.max(0, -highestY) / 12);
          if (altitudeZ > zCoins) {
            const before = zCoins;
            zCoins = Math.min(maxZ, altitudeZ);
            if (before < maxZ && zCoins >= maxZ) {
              setExploding(true);
              spawnExplosion(player.x, player.y - 16);
              dead = true;
              explodeTimer = 60;
            }
          }
        }

        // Spawn new platforms above as we climb
        let topMost = Infinity;
        for (const p of platforms) if (p.y < topMost) topMost = p.y;
        while (topMost > cameraY - 200) {
          topMost -= 60 + Math.random() * 40;
          spawnPlatformAt(topMost);
        }

        // Cull platforms below camera + viewport
        for (let i = platforms.length - 1; i >= 0; i--) {
          if (platforms[i]!.y - cameraY > H + 100) platforms.splice(i, 1);
        }

        // Death by falling off the bottom
        if (player.y - cameraY > H + 30 && !dead) {
          dead = true;
          spawnExplosion(player.x, H);
          explodeTimer = 30;
        }
      } else {
        // Death animation: update particles
        explodeTimer -= 1;
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vy += 0.18 * step;
        p.life -= 1;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // ── Render ─────────────────────────────
      clear();
      for (const p of platforms) drawPlatform(p);
      if (!dead || exploding === false) {
        drawAstronaut(player.x, player.y, player.facing);
      }
      drawParticles();

      // HUD inside canvas (top-left score)
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(8, 8, 96, 24);
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.fillText(`⚡ ${zCoins} / ${maxZ}`, 14, 25);

      setHudZ(zCoins);

      if (!dead) {
        rafRef.current = requestAnimationFrame(frame);
      } else if (explodeTimer > 0 || particles.length > 0) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        // Done
        if (!endedFlag) {
          endedFlag = true;
          const dur = Date.now() - startTimeRef.current;
          onEndRef.current(zCoins, dur);
        }
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", setCanvasSize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxZ]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center"
      style={{ background: "rgba(6,8,16,0.96)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between" style={{ zIndex: 2 }}>
        <div className="font-black text-sm tracking-widest neon-text">ZOOM JUMP</div>
        <div className="font-black text-sm" style={{ color: "#ffd700" }}>
          ⚡ {hudZ} / {maxZ}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 w-full flex items-center justify-center px-2 py-12" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            borderRadius: 16,
            border: "1px solid rgba(0,242,254,0.2)",
            boxShadow: "0 0 30px rgba(0,242,254,0.15)",
            touchAction: "none",
          }}
        />
      </div>
      <div className="absolute bottom-4 left-0 right-0 text-center text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
        Touch & drag to move · Auto-jump
      </div>
    </div>
  );
}
