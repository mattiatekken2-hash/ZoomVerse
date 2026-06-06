import { useState, useEffect, useRef, useCallback } from "react";
import { useT } from "../i18n/LanguageContext";
import {
  pvpQueue,
  pvpLeaveQueue,
  pvpConfirm,
  pvpDecline,
  fetchPvPStatus,
  fetchPvPBattle,
  type PvPStatus,
  type PvPQueueResult,
} from "../utils/api";
import { PlanetOrb } from "./PlanetOrb";
import { getPlanetDisplayName } from "../utils/planetNames";
import type { Planet } from "../hooks/useGameState";

interface Props {
  open: boolean;
  onClose: () => void;
  telegramId: string | null;
  planet: Planet;
  onPlanetTransferred?: () => void;
}

export default function PvPModal({ open, onClose, telegramId, planet, onPlanetTransferred }: Props) {
  const { t } = useT();
  const [phase, setPhase] = useState<"queue" | "match" | "roulette" | "result" | "error">("queue");
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<PvPStatus | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [rouletteAngle, setRouletteAngle] = useState(0);
  const [winner, setWinner] = useState<"player" | "opponent" | null>(null);
  const [isWinner, setIsWinner] = useState(false);
  const pollRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  const isPlayerP1 = battle?.player?.telegramId === telegramId;
  const player = isPlayerP1 ? battle?.player : battle?.opponent;
  const opponent = isPlayerP1 ? battle?.opponent : battle?.player;
  const playerConfirmed = player?.confirmed ?? false;
  const opponentConfirmed = opponent?.confirmed ?? false;

  const startQueue = useCallback(async () => {
    if (!telegramId || !open) return;
    setPhase("queue");
    setError(null);
    setBattle(null);
    setWinner(null);
    setIsWinner(false);

    const result = await pvpQueue(
      telegramId,
      planet.id,
      planet.name,
      planet.name,
      planet.rate,
      typeof planet.float === "number" ? planet.float : null,
    );
    if (!aliveRef.current) return;

    if (!result.ok) {
      setPhase("error");
      setError(result.error || "Failed");
      return;
    }

    if (result.status === "match" && result.battleId) {
      // Immediate match found
      const b = await fetchPvPBattle(result.battleId);
      if (!aliveRef.current) return;
      if (b.ok && b.battleId) {
        setBattle(b);
        setPhase("match");
        setCountdown(Math.max(0, Math.ceil(((b.confirmDeadline ?? 0) - Date.now()) / 1000)));
      } else {
        setPhase("queue");
        startPolling();
      }
    } else {
      // In queue, start polling
      startPolling();
    }
  }, [telegramId, open, planet]);

  const startPolling = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      if (!telegramId || !aliveRef.current) return;
      const s = await fetchPvPStatus(telegramId);
      if (!aliveRef.current) return;
      if (!s.ok) return;

      if (s.inBattle && s.battleId) {
        // Battle found!
        window.clearInterval(pollRef.current!);
        pollRef.current = null;
        setBattle(s);
        if (s.status === "roulette" || s.status === "completed") {
          // Already confirmed or roulette running
          if (s.status === "roulette") {
            setPhase("roulette");
            runRouletteAnimation(s);
          } else if (s.status === "completed") {
            handleResult(s);
          }
        } else {
          setPhase("match");
          setCountdown(Math.max(0, Math.ceil(((s.confirmDeadline ?? 0) - Date.now()) / 1000)));
        }
      }
    }, 2000);
  }, [telegramId]);

  const runRouletteAnimation = useCallback((b: PvPStatus) => {
    const winProb = b.winProbability ?? 0.5;
    const winAngle = winProb * 360;
    const finalAngle = 360 * 5 + Math.random() * 360; // 5 full spins + random
    // Adjust so it lands on the winning segment
    const actualWin = b.winnerTelegramId === telegramId;
    const targetAngle = actualWin ? winAngle / 2 : winAngle + (360 - winAngle) / 2;
    const adjustedFinal = 360 * 5 + targetAngle + Math.random() * 30 - 15;

    let start = 0;
    const duration = 4000;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const angle = ease * adjustedFinal;
      setRouletteAngle(angle);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation done, show result
        setTimeout(() => handleResult(b), 500);
      }
    };
    requestAnimationFrame(animate);
  }, [telegramId]);

  const handleResult = useCallback((b: PvPStatus) => {
    const won = b.winnerTelegramId === telegramId;
    setIsWinner(won);
    setWinner(won ? "player" : "opponent");
    setPhase("result");
    if (won) {
      window.dispatchEvent(new Event("planets-refresh"));
    } else {
      onPlanetTransferred?.();
    }
  }, [telegramId, onPlanetTransferred]);

  const handleConfirm = async () => {
    if (!telegramId || !battle?.battleId) return;
    const r = await pvpConfirm(telegramId, battle.battleId);
    if (r.ok && r.battle) {
      // Check if both confirmed
      const b = await fetchPvPBattle(battle.battleId);
      if (b.ok) {
        setBattle(b);
        if (b.status === "roulette" || b.status === "completed") {
          setPhase("roulette");
          runRouletteAnimation(b);
        } else {
          setPhase("match");
        }
      }
    }
  };

  const handleCancel = async () => {
    if (!telegramId) return;
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // Only send decline if battle is still pending/confirming; don't send for completed/roulette
    if (battle?.battleId && (battle.status === "pending" || battle.status === "confirming")) {
      await pvpDecline(telegramId, battle.battleId);
    } else if (!battle?.battleId) {
      await pvpLeaveQueue(telegramId);
    }
    if (aliveRef.current) {
      setPhase("queue");
      setBattle(null);
      setError(null);
      onClose();
    }
  };

  // Init on open
  useEffect(() => {
    if (!open) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      aliveRef.current = false;
      return;
    }
    aliveRef.current = true;
    startQueue();
    return () => {
      aliveRef.current = false;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open, startQueue]);

  // Countdown timer for match confirmation
  useEffect(() => {
    if (phase !== "match" || !battle?.confirmDeadline) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((battle.confirmDeadline! - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        clearInterval(id);
        // Auto-cancel
        handleCancel();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, battle]);

  // Poll battle status during match phase
  useEffect(() => {
    if (phase !== "match" || !battle?.battleId) return;
    const id = setInterval(async () => {
      const b = await fetchPvPBattle(battle.battleId!);
      if (!aliveRef.current) return;
      if (b.ok && b.status !== battle.status) {
        setBattle(b);
        if (b.status === "roulette" || b.status === "completed") {
          setPhase("roulette");
          runRouletteAnimation(b);
        }
      }
    }, 1500);
    return () => clearInterval(id);
  }, [phase, battle, runRouletteAnimation]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div
        className="relative mx-4 w-full max-w-sm rounded-2xl p-6"
        style={{
          background: "linear-gradient(135deg, rgba(20,12,30,0.95), rgba(10,6,18,0.98))",
          border: "1px solid rgba(255,50,50,0.3)",
          boxShadow: "0 0 40px rgba(255,50,50,0.15)",
        }}
      >
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-lg font-black tracking-wider" style={{ color: "#ff4444" }}>
            PvP BATTLE
          </div>
          <div className="text-xs font-bold mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {phase === "queue" && "Searching for opponent..."}
            {phase === "match" && "Match found! Confirm to start"}
            {phase === "roulette" && "Spinning the wheel..."}
            {phase === "result" && (isWinner ? "Victory!" : "Defeat")}
            {phase === "error" && "Error"}
          </div>
        </div>

        {/* QUEUE PHASE */}
        {phase === "queue" && (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full border-2 border-red-500 border-t-transparent mx-auto mb-4 animate-spin" />
            <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>
              Your planet is in queue
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.35)" }}>
              {getPlanetDisplayName(planet)} · {planet.name}
            </div>
            <button
              onClick={handleCancel}
              className="mt-6 w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
              style={{
                background: "rgba(255,50,50,0.2)",
                color: "#ff6666",
                border: "1px solid rgba(255,50,50,0.4)",
              }}
            >
              CANCEL SEARCH
            </button>
          </div>
        )}

        {/* MATCH PHASE */}
        {phase === "match" && battle && (
          <div>
            {/* Opponent planet */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div>
                <PlanetOrb
                  planet={{
                    ...planet,
                    name: (opponent?.planet as any)?.rarity || "BASIC",
                    color: (opponent?.planet as any)?.rarity === "BASIC" ? "#8892b0" : "#4facfe",
                  }}
                  size={56}
                  animate={false}
                />
              </div>
              <div className="flex-1">
                <div className="text-sm font-black" style={{ color: "#fff" }}>
                  Opponent
                </div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {(opponent?.planet as any)?.rarity || "BASIC"}
                </div>
              </div>
            </div>

            {/* Countdown */}
            <div className="text-center mb-4">
              <div className="text-3xl font-black" style={{ color: "#ff4444" }}>
                {countdown}s
              </div>
              <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                Confirm before time runs out!
              </div>
            </div>

            {/* Confirm button */}
            <button
              onClick={handleConfirm}
              disabled={playerConfirmed}
              className="w-full py-4 rounded-xl font-black text-base tracking-wider active:scale-95 mb-3"
              style={{
                background: playerConfirmed
                  ? "rgba(255,255,255,0.04)"
                  : "linear-gradient(135deg, rgba(255,50,50,0.3), rgba(255,30,30,0.2))",
                color: playerConfirmed ? "rgba(255,255,255,0.3)" : "#ffcccc",
                border: `1px solid ${playerConfirmed ? "rgba(255,255,255,0.1)" : "rgba(255,50,50,0.5)"}`,
                cursor: playerConfirmed ? "default" : "pointer",
              }}
            >
              {playerConfirmed ? "CONFIRMED ✓" : "CONFIRM BATTLE"}
            </button>

            {/* Opponent status */}
            <div className="text-center text-xs font-bold mb-3" style={{ color: opponentConfirmed ? "#00e676" : "rgba(255,255,255,0.3)" }}>
              {opponentConfirmed ? "Opponent confirmed ✓" : "Waiting for opponent..."}
            </div>

            <button
              onClick={handleCancel}
              className="w-full py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              DECLINE
            </button>
          </div>
        )}

        {/* ROULETTE PHASE */}
        {phase === "roulette" && (
          <div className="text-center py-4">
            {/* Roulette wheel */}
            <div className="relative mx-auto mb-4" style={{ width: 200, height: 200 }}>
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  transform: `rotate(${rouletteAngle}deg)`,
                  transition: "none",
                }}
              >
                {/* Wheel background */}
                <svg viewBox="0 0 200 200" className="absolute inset-0">
                  <circle cx="100" cy="100" r="98" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                  {/* Player slice (red) */}
                  <path
                    d="M100,100 L100,2 A98,98 0 0,1 100,198 Z"
                    fill="rgba(255,50,50,0.8)"
                  />
                  {/* Opponent slice (blue) */}
                  <path
                    d="M100,100 L100,198 A98,98 0 0,1 100,2 Z"
                    fill="rgba(50,100,255,0.8)"
                  />
                  {/* Center marker */}
                  <circle cx="100" cy="100" r="20" fill="rgba(20,12,30,0.95)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                  <text x="100" y="105" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">VS</text>
                </svg>
              </div>
              {/* Pointer at top */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "10px solid transparent",
                  borderRight: "10px solid transparent",
                  borderTop: "14px solid #ff4444",
                }}
              />
            </div>
            <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>
              Spinning...
            </div>
          </div>
        )}

        {/* RESULT PHASE */}
        {phase === "result" && (
          <div className="text-center py-4">
            <div className="text-4xl font-black mb-3" style={{ color: isWinner ? "#00e676" : "#ff4444" }}>
              {isWinner ? "VICTORY!" : "DEFEAT"}
            </div>
            <div className="text-sm font-bold mb-4" style={{ color: "rgba(255,255,255,0.6)" }}>
              {isWinner
                ? `You won the opponent's ${(opponent?.planet as any)?.rarity || "planet"}!`
                : `You lost your ${getPlanetDisplayName(planet)}...`}
            </div>
            {isWinner && (
              <div className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                The planet has been added to your inventory!
              </div>
            )}
            <button
              onClick={() => {
                handleCancel();
                onClose();
              }}
              className="w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
              style={{
                background: isWinner
                  ? "rgba(0,230,118,0.2)"
                  : "rgba(255,50,50,0.2)",
                color: isWinner ? "#00e676" : "#ff6666",
                border: `1px solid ${isWinner ? "rgba(0,230,118,0.4)" : "rgba(255,50,50,0.4)"}`,
              }}
            >
              {isWinner ? "CLAIM PRIZE" : "CLOSE"}
            </button>
          </div>
        )}

        {/* ERROR PHASE */}
        {phase === "error" && (
          <div className="text-center py-6">
            <div className="text-3xl font-black mb-2" style={{ color: "#ff4444" }}>
              ✗
            </div>
            <div className="text-sm font-bold mb-4" style={{ color: "rgba(255,255,255,0.6)" }}>
              {error === "NOT_ELIGIBLE" ? "This planet is not eligible for PvP" : error}
            </div>
            <button
              onClick={() => {
                handleCancel();
                onClose();
              }}
              className="w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              CLOSE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
