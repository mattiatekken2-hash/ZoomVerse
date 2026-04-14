import { useState, useCallback, useRef } from "react";
import { PlanetCanvas } from "../components/PlanetCanvas";
import type { Planet, PlanetType } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";
import { haptic } from "../utils/haptic";

interface LabPageProps {
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  currentCraftRarity: PlanetType | null;
  pendingPlanet: Planet | null;
  onCraft: () => { completed: boolean; planet?: Planet; tapsLeft?: number };
  onClaim: () => void;
}

interface FloatMsg { id: number; text: string; color: string }

function interpolateColor(t: number): string {
  const stops = [
    { pos: 0.0, r: 136, g: 146, b: 176 },
    { pos: 0.35, r: 79, g: 172, b: 254 },
    { pos: 0.65, r: 196, g: 113, b: 237 },
    { pos: 1.0, r: 255, g: 215, b: 0 },
  ];
  const clamped = Math.max(0, Math.min(1, t));
  let i = 0;
  for (let k = 0; k < stops.length - 1; k++) {
    if (clamped >= stops[k].pos && clamped <= stops[k + 1].pos) { i = k; break; }
  }
  const from = stops[i];
  const to = stops[i + 1];
  const local = (clamped - from.pos) / (to.pos - from.pos);
  const r = Math.round(from.r + (to.r - from.r) * local);
  const g = Math.round(from.g + (to.g - from.g) * local);
  const b = Math.round(from.b + (to.b - from.b) * local);
  return `rgb(${r},${g},${b})`;
}

export function LabPage({ balance, taps, goal, planets, currentCraftRarity, pendingPlanet, onCraft, onClaim }: LabPageProps) {
  const [status, setStatus] = useState("TAP TO FORGE A PLANET");
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const timeoutRef = useRef<number | null>(null);

  const isFull = planets.length >= 2 && !pendingPlanet;
  const canCraft = !pendingPlanet && planets.length < 2 && balance >= 1;

  const progress = taps / goal;
  const dynamicColor = currentCraftRarity
    ? PLANET_CONFIG[currentCraftRarity].color
    : interpolateColor(progress);

  const addFloat = useCallback((text: string, color: string) => {
    const id = Date.now();
    setFloats(prev => [...prev, { id, text, color }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1400);
  }, []);

  const handleCraft = useCallback(() => {
    if (!canCraft) return;
    haptic(6);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const result = onCraft();
    if (result.completed && result.planet) {
      const p = result.planet;
      setStatus(`${PLANET_CONFIG[p.name].label.toUpperCase()} PLANET FORGED!`);
      addFloat(`✦ ${PLANET_CONFIG[p.name].label}!`, p.color);
    } else if (!result.completed && result.tapsLeft !== undefined) {
      const pct = Math.round(((goal - result.tapsLeft) / goal) * 100);
      setStatus(`FORGING... ${pct}%`);
      addFloat("-1 🪐", "rgba(255,255,255,0.3)");
    }
  }, [canCraft, onCraft, goal, addFloat]);

  const handleClaim = useCallback(() => {
    haptic(10);
    onClaim();
    setStatus("TAP TO FORGE A PLANET");
  }, [onClaim]);

  const rarityClass: Record<string, string> = {
    BASIC: "basic-text",
    RARE: "rare-text",
    EPIC: "epic-text",
    GOLD: "gold-text",
  };

  const planetDisplayColor = pendingPlanet ? pendingPlanet.color : dynamicColor;

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="relative flex-1" style={{ minHeight: 0 }} onClick={canCraft ? handleCraft : undefined}>
        <PlanetCanvas
          onPunch={canCraft ? handleCraft : undefined}
          progress={taps}
          goal={goal}
          planetColor={planetDisplayColor}
          isRevealing={!!pendingPlanet}
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
                boxShadow: `0 0 24px ${pendingPlanet.color}66`,
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
              style={{ color: dynamicColor }}
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
              ? `${PLANET_CONFIG[currentCraftRarity].label} · ${PLANET_CONFIG[currentCraftRarity].tapsNeeded} taps`
              : "1 $ZOOM per tap"}
          </span>
          <span>{Math.max(0, 2 - planets.length)} slot{Math.max(0, 2 - planets.length) !== 1 ? "s" : ""} free</span>
        </div>
      </div>
    </div>
  );
}
