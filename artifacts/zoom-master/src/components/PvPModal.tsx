import { useState, useEffect, useRef, useCallback } from "react";
import {
  pvpQueue,
  pvpLeaveQueue,
  pvpConfirm,
  pvpDecline,
  fetchPvPStatus,
  fetchPvPBattle,
  type PvPStatus,
} from "../utils/api";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";
import { ForgePathWheel } from "./ForgePathWheel";
import { getPlanetDisplayName } from "../utils/planetNames";
import { getRarityColorsForModel, type Planet } from "../hooks/useGameState";

const CYAN = "#9EC5E8";
const CYAN_BORDER = "rgba(158,197,232,0.35)";
const CYAN_GLOW = "rgba(158,197,232,0.18)";
const CYAN_BG = "rgba(158,197,232,0.12)";
const CYAN_BG_STRONG = "rgba(158,197,232,0.22)";

function pvpPlanetFromRaw(raw: unknown, fallback: Planet): Planet {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = (typeof o.name === "string" ? o.name : fallback.name) as Planet["name"];
  const colors = getRarityColorsForModel(String(o.rarity ?? o.name ?? name));
  return {
    ...fallback,
    id: typeof o.id === "string" && o.id ? o.id : fallback.id,
    name,
    rate: typeof o.rate === "number" ? o.rate : fallback.rate,
    color: typeof o.color === "string" ? o.color : colors.color,
    glowColor: typeof o.glowColor === "string" ? o.glowColor : colors.glowColor,
    shapeId: typeof o.shapeId === "string" ? o.shapeId : undefined,
    displayName: typeof o.displayName === "string" ? o.displayName : undefined,
    float: typeof o.float === "number" ? o.float : fallback.float,
    isListedInMarket: false,
    isFarmingActive: false,
    marketPrice: null,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  telegramId: string | null;
  planet: Planet;
  onPlanetTransferred?: () => void;
  /** Called before entering the matchmaking queue. The parent must flush
   *  any pending planet save so the server can verify ownership in
   *  planets_json — without this, a freshly-crafted planet returns
   *  PLANET_NOT_FOUND because the debounced save hasn't fired yet. */
  onBeforeQueue?: () => Promise<void>;
}

export default function PvPModal({ open, onClose, telegramId, planet, onPlanetTransferred, onBeforeQueue }: Props) {
  const [phase, setPhase] = useState<"queue" | "match" | "roulette" | "result" | "error">("queue");
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<PvPStatus | null>(null);
  const [countdown, setCountdown] = useState(20);
  const [winner, setWinner] = useState<"player" | "opponent" | null>(null);
  const [isWinner, setIsWinner] = useState(false);
  const pollRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  // Guards the one-time transition into wheel + result. The server resolves the
  // roulette synchronously inside the second player's confirm request, so the
  // status poll, the match poll and the confirm response can all observe the
  // finished battle at once. Without this guard the wheel restarts or the result
  // fires twice (and double-dispatches the planet transfer events).
  const resolvedRef = useRef(false);
  const resultFiredRef = useRef(false);

  const isPlayerP1 = battle?.player?.telegramId === telegramId;
  const player = isPlayerP1 ? battle?.player : battle?.opponent;
  const opponent = isPlayerP1 ? battle?.opponent : battle?.player;
  const playerConfirmed = player?.confirmed ?? false;
  const opponentConfirmed = opponent?.confirmed ?? false;
  const opponentPlanet = (opponent?.planet ?? null) as
    | { id?: string; name?: string; rarity?: string; rate?: number; float?: number | null; shapeId?: string; displayName?: string; color?: string; glowColor?: string }
    | null;
  const opponentRarity = opponentPlanet?.rarity || opponentPlanet?.name || "BASIC";
  const opponentName = opponent?.username || "Opponent";
  const opponentModel = pvpPlanetFromRaw(opponentPlanet, planet);
  const youWonWheel = battle?.winnerTelegramId === telegramId;

  const handleResult = useCallback((b: PvPStatus) => {
    if (resultFiredRef.current) return;
    resultFiredRef.current = true;
    const won = b.winnerTelegramId === telegramId;
    setIsWinner(won);
    setWinner(won ? "player" : "opponent");
    setPhase("result");
    // Mirror the server's atomic transfer into client-authoritative state via
    // window events handled in App.tsx. This must run so the debounced
    // /regular-planets/save persists the correct post-transfer inventory.
    if (won) {
      const oppSide = b.player?.telegramId === telegramId ? b.opponent : b.player;
      const op = (oppSide?.planet ?? null) as
        | { id?: string; name?: string; rarity?: string; rate?: number; float?: number | null; shapeId?: string; displayName?: string; color?: string; glowColor?: string }
        | null;
      if (op?.id) {
        window.dispatchEvent(new CustomEvent("pvp-planet-won", {
          detail: {
            id: op.id,
            name: op.rarity || op.name || "BASIC",
            rate: op.rate,
            float: op.float ?? null,
            shapeId: (op as { shapeId?: string }).shapeId,
            displayName: (op as { displayName?: string }).displayName,
            color: (op as { color?: string }).color,
            glowColor: (op as { glowColor?: string }).glowColor,
          },
        }));
      }
    } else {
      window.dispatchEvent(new CustomEvent("pvp-planet-lost", { detail: { planetId: planet.id } }));
    }
    onPlanetTransferred?.();
  }, [telegramId, planet.id, onPlanetTransferred]);

  const resultBattleRef = useRef<PvPStatus | null>(null);

  const maybeResolve = useCallback((b: PvPStatus): boolean => {
    if (resolvedRef.current) return true;
    if (!b.winnerTelegramId) return false;
    resolvedRef.current = true;
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    resultBattleRef.current = b;
    setBattle(b);
    setPhase("roulette");
    return true;
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      if (!telegramId || !aliveRef.current) return;
      const s = await fetchPvPStatus(telegramId);
      if (!aliveRef.current || !s.ok) return;

      if (s.inBattle && s.battleId) {
        if (maybeResolve(s)) return;
        window.clearInterval(pollRef.current!);
        pollRef.current = null;
        setBattle(s);
        setPhase("match");
        setCountdown(Math.max(0, Math.ceil(((s.confirmDeadline ?? 0) - Date.now()) / 1000)));
      }
    }, 2000);
  }, [telegramId, maybeResolve]);

  const startQueue = useCallback(async () => {
    if (!telegramId || !open) return;
    resolvedRef.current = false;
    resultFiredRef.current = false;
    setPhase("queue");
    setError(null);
    setBattle(null);
    setWinner(null);
    setIsWinner(false);

    // Flush any pending planet save before queuing so the server can
    // verify ownership in planets_json even for freshly-crafted planets.
    try { await onBeforeQueue?.(); } catch { /* non-blocking */ }

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
      const b = await fetchPvPBattle(result.battleId, telegramId);
      if (!aliveRef.current) return;
      if (b.ok && b.battleId) {
        if (maybeResolve(b)) return;
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
  }, [telegramId, open, planet, maybeResolve, startPolling]);

  const handleConfirm = async () => {
    if (!telegramId || !battle?.battleId) return;
    const r = await pvpConfirm(telegramId, battle.battleId);
    if (!aliveRef.current) return;
    if (r.ok) {
      const b = await fetchPvPBattle(battle.battleId, telegramId);
      if (!aliveRef.current) return;
      if (b.ok) {
        if (maybeResolve(b)) return;
        // I've confirmed; stay in match and wait for the opponent. The match
        // poll will pick up the resolution once both have confirmed.
        setBattle(b);
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

  // SKIP: reject the currently matched opponent and go back to searching for a
  // new one, without leaving the PvP modal. Only meaningful before the local
  // player has confirmed (after confirming you're committed to the duel).
  const handleSkip = async () => {
    if (!telegramId) return;
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (battle?.battleId && (battle.status === "pending" || battle.status === "confirming")) {
      await pvpDecline(telegramId, battle.battleId);
    }
    if (!aliveRef.current) return;
    // Re-enter the queue; startQueue resets resolvedRef/state and starts polling.
    startQueue();
  };

  // Init on open
  // Keep a ref to the latest startQueue so the init effect can call it WITHOUT
  // depending on it. startQueue's identity changes whenever `planet` changes
  // reference (the game state re-renders the parent ~every second for farming /
  // balance ticks). If this effect depended on startQueue it would re-fire on
  // those ticks and call startQueue() again — yanking the user out of an active
  // match straight back into "searching". The init must run ONLY on open toggle.
  const startQueueRef = useRef(startQueue);
  startQueueRef.current = startQueue;

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
    startQueueRef.current();
    return () => {
      aliveRef.current = false;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open]);

  // Countdown timer for match confirmation
  useEffect(() => {
    if (phase !== "match" || !battle?.confirmDeadline) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((battle.confirmDeadline! - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        clearInterval(id);
        // Only auto-decline if I have NOT confirmed. If I already confirmed I
        // must keep waiting for the opponent / resolution — auto-declining here
        // is what caused "both confirmed but it cancelled".
        if (!playerConfirmed) {
          handleCancel();
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, battle, playerConfirmed]);

  // Poll battle status during match phase.
  // CRITICAL: depend only on [phase, telegramId] — NOT on `battle` or
  // `maybeResolve`. Those change identity on nearly every parent re-render
  // (FarmPage passes an inline `onPlanetTransferred` and re-renders ~1×/sec for
  // farming/balance ticks, which rebuilds maybeResolve; setBattle churns `battle`).
  // If they were deps, this effect would tear down and recreate its 1.5s interval
  // faster than it can ever fire — so the player who confirmed FIRST (and is
  // waiting) never polls the resolution and their wheel never spins, while the
  // second confirmer gets it directly via handleConfirm. Refs keep the latest
  // values without resetting the interval.
  const battleRef = useRef(battle);
  battleRef.current = battle;
  const maybeResolveRef = useRef(maybeResolve);
  maybeResolveRef.current = maybeResolve;

  useEffect(() => {
    if (phase !== "match") return;
    const id = setInterval(async () => {
      const bId = battleRef.current?.battleId;
      if (!bId) return;
      const b = await fetchPvPBattle(bId, telegramId ?? undefined);
      if (!aliveRef.current) return;
      if (!b.ok) return;
      if (b.status === "cancelled") {
        clearInterval(id);
        setPhase("error");
        setError("BATTLE_CANCELLED");
        return;
      }
      if (maybeResolveRef.current(b)) {
        clearInterval(id);
        return;
      }
      const cur = battleRef.current;
      if (b.status !== cur?.status || b.opponent?.confirmed !== cur?.opponent?.confirmed || b.player?.confirmed !== cur?.player?.confirmed) {
        setBattle(b);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [phase, telegramId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div
        className="relative mx-3 w-full"
        style={{
          maxWidth: phase === "roulette" ? 440 : 384,
          background: "linear-gradient(135deg, rgba(20,12,30,0.95), rgba(10,6,18,0.98))",
          border: `1px solid ${CYAN_BORDER}`,
          boxShadow: `0 0 40px ${CYAN_GLOW}`,
          borderRadius: 16,
          padding: phase === "roulette" ? 16 : 24,
        }}
      >
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-lg font-black tracking-wider" style={{ color: CYAN }}>
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
          <div className="text-center py-4">
            <div className="flex justify-center mb-3">
              <PlanetVoxelThumb planet={planet} size={88} animate eager />
            </div>
            <div
              className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-4 animate-spin"
              style={{ borderColor: `${CYAN} transparent transparent transparent` }}
            />
            <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>
              Searching for opponent...
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.35)" }}>
              {getPlanetDisplayName(planet)} · {planet.name}
            </div>
            <button
              onClick={handleCancel}
              className="mt-6 w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
              style={{
                background: CYAN_BG_STRONG,
                color: CYAN,
                border: `1px solid ${CYAN_BORDER}`,
              }}
            >
              CANCEL SEARCH
            </button>
          </div>
        )}

        {/* MATCH PHASE */}
        {phase === "match" && battle && (
          <div>
            {/* Versus: my planet (left) vs opponent planet (right) */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                <PlanetVoxelThumb planet={planet} size={72} animate eager />
                <div className="text-xs font-black mt-1 text-center truncate w-full" style={{ color: "#fff" }}>
                  You
                </div>
                <div className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {getPlanetDisplayName(planet)}
                </div>
              </div>

              <div className="text-sm font-black px-1" style={{ color: CYAN }}>VS</div>

              <div className="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                <PlanetVoxelThumb planet={opponentModel} size={72} animate eager />
                <div className="text-xs font-black mt-1 text-center truncate w-full" style={{ color: "#fff" }}>
                  {opponentName}
                </div>
                <div className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {getPlanetDisplayName(opponentModel)}
                </div>
              </div>
            </div>

            {/* Countdown / waiting state */}
            <div className="text-center mb-4">
              {playerConfirmed ? (
                <div className="text-sm font-black" style={{ color: "#00e676" }}>
                  Waiting for opponent...
                </div>
              ) : (
                <>
                  <div className="text-3xl font-black" style={{ color: CYAN }}>
                    {countdown}s
                  </div>
                  <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Confirm before time runs out!
                  </div>
                </>
              )}
            </div>

            {/* Confirm button */}
            <button
              onClick={handleConfirm}
              disabled={playerConfirmed}
              className="w-full py-4 rounded-xl font-black text-base tracking-wider active:scale-95 mb-3"
              style={{
                background: playerConfirmed
                  ? "rgba(255,255,255,0.04)"
                  : `linear-gradient(135deg, ${CYAN_BG_STRONG}, ${CYAN_BG})`,
                color: playerConfirmed ? "rgba(255,255,255,0.3)" : "#E8ECF4",
                border: `1px solid ${playerConfirmed ? "rgba(255,255,255,0.1)" : CYAN_BORDER}`,
                cursor: playerConfirmed ? "default" : "pointer",
              }}
            >
              {playerConfirmed ? "CONFIRMED ✓" : "CONFIRM BATTLE"}
            </button>

            {/* Opponent status */}
            <div className="text-center text-xs font-bold mb-3" style={{ color: opponentConfirmed ? "#00e676" : "rgba(255,255,255,0.3)" }}>
              {opponentConfirmed ? "Opponent confirmed ✓" : "Waiting for opponent..."}
            </div>

            {/* SKIP — reject this opponent and keep searching. Hidden once you've
                confirmed (you're then committed to the duel). */}
            {!playerConfirmed && (
              <button
                onClick={handleSkip}
                className="w-full py-3 rounded-xl text-sm font-black tracking-wider active:scale-95 mb-3"
                style={{
                  background: "rgba(80,130,255,0.15)",
                  color: "#7aa2ff",
                  border: "1px solid rgba(80,130,255,0.4)",
                }}
              >
                SKIP OPPONENT
              </button>
            )}

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
        {phase === "roulette" && battle && (
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <div className="flex flex-col items-center" style={{ width: 92 }}>
                <PlanetVoxelThumb planet={planet} size={86} animate eager />
                <div className="text-[10px] font-black mt-1 truncate w-full" style={{ color: "#fff" }}>You</div>
              </div>
              <ForgePathWheel
                size={168}
                targetPath={youWonWheel ? "zoom" : "stardust"}
                zoomLabel="YOU"
                stardustLabel="OPP"
                onComplete={() => {
                  const b = resultBattleRef.current ?? battle;
                  if (aliveRef.current) handleResult(b);
                }}
              />
              <div className="flex flex-col items-center" style={{ width: 92 }}>
                <PlanetVoxelThumb planet={opponentModel} size={86} animate eager />
                <div className="text-[10px] font-black mt-1 truncate w-full" style={{ color: "#fff" }}>{opponentName}</div>
              </div>
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
                ? `You won ${opponentName}'s ${opponentRarity} planet!`
                : `You lost your ${getPlanetDisplayName(planet)} to ${opponentName}...`}
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
              {error === "NOT_ELIGIBLE"
                ? "This planet is not eligible for PvP"
                : error === "SLOTS_FULL"
                  ? "Need a free farm slot to play PvP"
                  : error === "BATTLE_CANCELLED"
                    ? "The battle was cancelled — the opponent didn't confirm in time."
                    : error}
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
