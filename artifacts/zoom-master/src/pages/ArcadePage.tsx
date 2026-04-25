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

