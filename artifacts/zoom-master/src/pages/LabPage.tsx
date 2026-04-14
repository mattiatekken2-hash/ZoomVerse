import { useState, useCallback, useRef } from "react";
import { PlanetCanvas } from "../components/PlanetCanvas";
import type { Planet } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";

interface LabPageProps {
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  onCraft: () => { completed: boolean; planet?: Planet; tapsLeft?: number };
}

interface FloatMsg { id: number; text: string; color: string }

export function LabPage({ balance, taps, goal, planets, onCraft }: LabPageProps) {
  const [status, setStatus] = useState("TAP TO FORGE A PLANET");
  const [craftedColor, setCraftedColor] = useState<string | undefined>(undefined);
  const [isRevealing, setIsRevealing] = useState(false);
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const [revealedPlanet, setRevealedPlanet] = useState<Planet | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const isFull = planets.length >= 2;
  const canCraft = !isFull && balance >= 1;

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
      setCraftedColor(p.color);
      setIsRevealing(true);
      setRevealedPlanet(p);
      setStatus(`${PLANET_CONFIG[p.name].label.toUpperCase()} PLANET FORGED!`);
      addFloat(`✦ ${PLANET_CONFIG[p.name].label}!`, p.color);

      timeoutRef.current = window.setTimeout(() => {
        setIsRevealing(false);
        setRevealedPlanet(null);
        setStatus("TAP TO FORGE A PLANET");
        setCraftedColor(undefined);
      }, 3000);
    } else if (!result.completed && result.tapsLeft !== undefined) {
      const pct = Math.round(((goal - result.tapsLeft) / goal) * 100);
      setStatus(`FORGING... ${pct}%`);
      addFloat("-1 🪐", "rgba(255,255,255,0.3)");
    }
  }, [canCraft, onCraft, goal, addFloat]);

  const rarityClass: Record<string, string> = {
    BASIC: "basic-text",
    RARE: "rare-text",
    EPIC: "epic-text",
    GOLD: "gold-text",
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="relative flex-1" style={{ minHeight: 0 }} onClick={canCraft ? handleCraft : undefined}>
        <PlanetCanvas
          onPunch={canCraft ? handleCraft : undefined}
          progress={taps}
          goal={goal}
          planetColor={craftedColor}
          isRevealing={isRevealing}
        />

        {floats.map(f => (
          <div
            key={f.id}
            className="absolute pointer-events-none font-black text-xl float-up"
            style={{
              left: "50%", top: "40%",
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
              <div className="text-xs text-muted-foreground">Release a planet to keep crafting</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-5 pb-6 pt-2 flex flex-col gap-3">
        {revealedPlanet ? (
          <div
            className="slot-enter rounded-2xl px-4 py-3 flex items-center justify-between border"
            style={{
              borderColor: revealedPlanet.color + "44",
              background: revealedPlanet.color + "10",
              boxShadow: `0 0 24px ${revealedPlanet.color}25`,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: revealedPlanet.color, boxShadow: `0 0 8px ${revealedPlanet.color}` }}
              />
              <span className={`font-black text-sm tracking-wider ${rarityClass[revealedPlanet.name]}`}>
                {PLANET_CONFIG[revealedPlanet.name].label.toUpperCase()} PLANET
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-bold">
              +{revealedPlanet.rate.toLocaleString()}/hr
            </span>
          </div>
        ) : (
          <div
            className="text-center text-xs font-bold tracking-widest uppercase py-1"
            style={{ color: craftedColor || "rgba(0,242,254,0.7)" }}
            data-testid="craft-status"
          >
            {status}
          </div>
        )}

        <button
          className="btn-craft"
          onClick={handleCraft}
          disabled={!canCraft}
          data-testid="button-craft"
        >
          {isFull ? "FARM FULL" : balance < 1 ? "NO $ZOOM" : "FORGE PLANET"}
        </button>

        <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          <span>1 $ZOOM per tap · 20 taps</span>
          <span>{Math.max(0, 2 - planets.length)} slot{Math.max(0, 2 - planets.length) !== 1 ? "s" : ""} free</span>
        </div>
      </div>
    </div>
  );
}
