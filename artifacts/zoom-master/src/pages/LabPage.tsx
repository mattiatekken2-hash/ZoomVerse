import { useState, useCallback, useRef } from "react";
import { PlanetCanvas } from "../components/PlanetCanvas";
import { FortuneWheel } from "../components/FortuneWheel";
import type { Planet, PlanetType } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";


interface LabPageProps {
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  maxSlots: number;
  currentCraftRarity: PlanetType | null;
  pendingPlanet: Planet | null;
  telegramId: string;
  firstName?: string;
  onCraft: () => { completed: boolean; planet?: Planet; tapsLeft?: number };
  onClaim: () => void;
  onWheelPrize: (prize: string, zoomAmount: number) => void;
}

interface FloatMsg { id: number; text: string; color: string }

const GREY = "#8892b0";
const REVEAL_THRESHOLD = 0.90;

export function LabPage({ balance, taps, goal, planets, maxSlots, currentCraftRarity, pendingPlanet, telegramId, firstName, onCraft, onClaim, onWheelPrize }: LabPageProps) {
  const [status, setStatus] = useState("TAP TO FORGE A PLANET");
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const [wheelOpen, setWheelOpen] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const isFull = planets.length >= maxSlots && !pendingPlanet;
  const canCraft = !pendingPlanet && planets.length < maxSlots && balance >= 1;

  const progress = goal > 0 ? taps / goal : 0;

  const dynamicColor = pendingPlanet
    ? pendingPlanet.color
    : currentCraftRarity && progress >= REVEAL_THRESHOLD
    ? PLANET_CONFIG[currentCraftRarity].color
    : GREY;

  const addFloat = useCallback((text: string, color: string) => {
    const id = Date.now();
    setFloats(prev => [...prev, { id, text, color }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1400);
  }, []);

  const handleCraft = useCallback(() => {
    if (!canCraft) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const result = onCraft();
    if (result.completed && result.planet) {
      const p = result.planet;
      setStatus(`${PLANET_CONFIG[p.name].label.toUpperCase()} PLANET FORGED!`);
      addFloat(`✦ ${PLANET_CONFIG[p.name].label}!`, p.color);
    } else if (!result.completed && result.tapsLeft !== undefined) {
      const pct = Math.round(((goal - result.tapsLeft) / goal) * 100);
      setStatus(`FORGING... ${pct}%`);
      addFloat("-1 🪐", "rgba(255,255,255,0.25)");
    }
  }, [canCraft, onCraft, goal, addFloat]);

  const handleClaim = useCallback(() => {
    onClaim();
    setStatus("TAP TO FORGE A PLANET");
  }, [onClaim]);

  const rarityClass: Record<string, string> = {
    BASIC: "basic-text",
    RARE: "rare-text",
    EPIC: "epic-text",
    GOLD: "gold-text",
  };

  if (wheelOpen) {
    return (
      <FortuneWheel
        telegramId={telegramId}
        firstName={firstName}
        onClose={() => setWheelOpen(false)}
        onPrizeGranted={onWheelPrize}
      />
    );
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <button
        onClick={() => setWheelOpen(true)}
        className="absolute right-3 top-3 z-30 flex items-center justify-center"
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #7c4dff, #00e5ff)",
          boxShadow: "0 0 20px rgba(0,229,255,0.5), 0 0 40px rgba(124,77,255,0.3)",
          animation: "wheel-pulse 2s ease-in-out infinite",
        }}
      >
        <span className="text-xl" style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.8))" }}>🎡</span>
      </button>

      <div className="relative flex-1" style={{ minHeight: 0 }} onClick={canCraft ? handleCraft : undefined}>
        <PlanetCanvas
          onPunch={canCraft ? handleCraft : undefined}
          progress={taps}
          goal={goal}
          planetColor={dynamicColor}
          isRevealing={!!pendingPlanet}
        />

        {floats.map(f => (
          <div
            key={f.id}
            className="absolute pointer-events-none font-black text-xl float-up"
            style={{
              left: "50%", top: "38%",
              transform: "translate(-50%, -50%)",
              color: f.color,
              textShadow: `0 0 12px ${f.color}`,
              zIndex: 50,
            }}
          >
            {f.text}
          </div>
        ))}

        {isFull && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(6,8,16,0.5)", backdropFilter: "blur(4px)", zIndex: 20 }}
          >
            <div className="glass rounded-2xl px-6 py-4 text-center">
              <div className="text-amber-400 font-black text-base tracking-widest mb-1">FARM FULL</div>
              <div className="text-xs text-muted-foreground">Burn or sell a planet to continue</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-5 pb-6 pt-2 flex flex-col gap-3">
        {pendingPlanet ? (
          <>
            <div
              className="slot-enter rounded-2xl px-4 py-3 flex items-center justify-between border"
              style={{
                borderColor: pendingPlanet.color + "44",
                background: pendingPlanet.color + "10",
                boxShadow: `0 0 24px ${pendingPlanet.color}25`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: pendingPlanet.color, boxShadow: `0 0 8px ${pendingPlanet.color}` }}
                />
                <span className={`font-black text-sm tracking-wider ${rarityClass[pendingPlanet.name]}`}>
                  {PLANET_CONFIG[pendingPlanet.name].label.toUpperCase()} PLANET
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-bold">
                +{pendingPlanet.rate.toLocaleString()}/hr
              </span>
            </div>
            <button
              className="w-full py-4 rounded-xl font-black text-base tracking-wider uppercase transition-all active:scale-95 border"
              onClick={handleClaim}
              style={{
                background: `linear-gradient(135deg, ${pendingPlanet.color}, ${pendingPlanet.color}bb)`,
                color: "#060810",
                boxShadow: `0 0 28px ${pendingPlanet.color}66`,
                borderColor: "transparent",
              }}
              data-testid="button-claim-planet"
            >
              CLAIM PLANET
            </button>
          </>
        ) : (
          <>
            <div
              className="text-center text-xs font-bold tracking-widest uppercase py-1"
              style={{ color: dynamicColor === GREY ? "rgba(255,255,255,0.4)" : dynamicColor }}
              data-testid="craft-status"
            >
              {status}
            </div>
            <button
              className="btn-craft"
              onClick={handleCraft}
              disabled={!canCraft}
              data-testid="button-craft"
            >
              {isFull ? "FARM FULL" : balance < 1 ? "NO $ZOOM" : "FORGE PLANET"}
            </button>
          </>
        )}

        <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          <span>
            {currentCraftRarity
              ? `${PLANET_CONFIG[currentCraftRarity].tapsNeeded} taps · 1 $ZOOM each`
              : "1 $ZOOM per tap"}
          </span>
          <span>{Math.max(0, maxSlots - planets.length)} slot{Math.max(0, maxSlots - planets.length) !== 1 ? "s" : ""} free</span>
        </div>
      </div>
    </div>
  );
}
