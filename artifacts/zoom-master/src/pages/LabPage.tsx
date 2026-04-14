import { useState, useCallback } from "react";
import { PlanetCanvas } from "../components/PlanetCanvas";
import type { Planet } from "../hooks/useGameState";

interface LabPageProps {
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  maxSlots: number;
  onCraft: () => { completed: boolean; planet?: Planet; tapsLeft?: number };
}

interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
}

const CRAFT_COLORS: Record<string, string> = {
  BASIC: "#00f2fe",
  GOLD: "#ffd700",
  COSMIC: "#c471ed",
  VOID: "#ff416c",
};

export function LabPage({ balance, taps, goal, planets, maxSlots, onCraft }: LabPageProps) {
  const [status, setStatus] = useState("TAP TO CRAFT A PLANET");
  const [statusColor, setStatusColor] = useState("#00f2fe");
  const [floats, setFloats] = useState<FloatingText[]>([]);
  const [lastPlanet, setLastPlanet] = useState<Planet | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [craftedColor, setCraftedColor] = useState<string | undefined>(undefined);

  const handleCraft = useCallback(() => {
    if (craftedColor) {
      setCraftedColor(undefined);
    }
    const result = onCraft();
    if (result.completed && result.planet) {
      const p = result.planet;
      setLastPlanet(p);
      setCraftedColor(p.color);
      setStatus(`${p.name} PLANET CRAFTED! SENT TO FARM`);
      setStatusColor(p.color);
      setShowSuccess(true);
      const id = Date.now();
      setFloats((prev) => [...prev, { id, text: `+${p.name}!`, x: 50, y: 50 }]);
      setTimeout(() => {
        setFloats((prev) => prev.filter((f) => f.id !== id));
        setShowSuccess(false);
        setStatus("TAP TO CRAFT A PLANET");
        setStatusColor("#00f2fe");
        setLastPlanet(null);
      }, 2500);
    } else if (!result.completed && result.tapsLeft !== undefined) {
      const pct = Math.round(((goal - result.tapsLeft) / goal) * 100);
      setStatus(`CRAFTING... ${pct}% COMPLETE`);
      setStatusColor("#00f2fe");
    }
  }, [onCraft, goal, craftedColor]);

  const isFull = planets.length >= 2;
  const planetColor = craftedColor;

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <PlanetCanvas
          onPunch={isFull ? undefined : handleCraft}
          progress={taps}
          goal={goal}
          planetColor={planetColor}
        />

        {floats.map((f) => (
          <div
            key={f.id}
            className="absolute pointer-events-none font-black text-2xl earning-float z-50"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              transform: "translate(-50%, -50%)",
              color: planetColor || "#00f2fe",
              textShadow: `0 0 12px ${planetColor || "#00f2fe"}`,
            }}
          >
            {f.text}
          </div>
        ))}
      </div>

      <div className="px-5 pb-6 pt-3 flex flex-col gap-3 flex-shrink-0">
        {isFull && (
          <div className="text-center text-xs font-bold tracking-widest uppercase text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-xl py-2">
            Farm is full — sell or unlock more slots
          </div>
        )}
        <div
          className="text-center text-xs font-bold tracking-widest uppercase py-1 transition-colors duration-300"
          style={{ color: statusColor }}
          data-testid="craft-status"
        >
          {status}
        </div>

        {showSuccess && lastPlanet && (
          <div
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border font-bold text-sm slot-enter"
            style={{
              borderColor: lastPlanet.color + "44",
              background: lastPlanet.color + "12",
              color: lastPlanet.color,
              boxShadow: `0 0 20px ${lastPlanet.color}30`,
            }}
          >
            <span style={{ textShadow: `0 0 8px ${lastPlanet.color}` }}>
              ★ {lastPlanet.name} PLANET
            </span>
            <span className="text-muted-foreground font-normal text-xs">
              +{lastPlanet.rate}/hr
            </span>
          </div>
        )}

        <button
          className="w-full py-5 rounded-2xl font-black text-xl tracking-wider uppercase relative overflow-hidden transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={isFull ? undefined : handleCraft}
          disabled={isFull || balance < 1}
          data-testid="button-craft"
          style={{
            background: isFull
              ? "rgba(255,255,255,0.05)"
              : "linear-gradient(135deg, #00f2fe, #4facfe)",
            color: isFull ? "rgba(255,255,255,0.3)" : "#000",
            boxShadow: isFull ? "none" : "0 0 24px rgba(0,242,254,0.4), 0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {isFull ? "FARM FULL" : "CRAFT PLANET"}
        </button>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Cost: 1 coin / tap</span>
          <span>{Math.max(0, 2 - planets.length)} slot{Math.max(0, 2 - planets.length) !== 1 ? "s" : ""} free</span>
        </div>
      </div>
    </div>
  );
}
