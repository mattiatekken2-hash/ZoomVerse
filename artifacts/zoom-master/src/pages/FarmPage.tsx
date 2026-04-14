import { useState } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import type { Planet } from "../hooks/useGameState";

interface FarmPageProps {
  planets: Planet[];
  maxSlots: number;
  balance: number;
  onRemove: (id: string) => void;
  onUnlock: () => void;
}

const RATE_LABELS: Record<string, string> = {
  BASIC: "Common",
  GOLD: "Rare",
  COSMIC: "Epic",
  VOID: "Legendary",
};

export function FarmPage({ planets, maxSlots, balance, onRemove, onUnlock }: FarmPageProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const canUnlock = maxSlots < 6 && balance >= 250;

  const handleRemoveClick = (id: string) => {
    if (confirmId === id) {
      onRemove(id);
      setConfirmId(null);
    } else {
      setConfirmId(id);
      setTimeout(() => setConfirmId(null), 2000);
    }
  };

  const totalRate = planets.reduce((a, p) => a + p.rate, 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="font-black text-xl tracking-tight">My Planets</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {planets.length}/{maxSlots} active &bull; {totalRate}/hr total
          </p>
        </div>
        {totalRate > 0 && (
          <div
            className="text-xs font-bold px-3 py-1.5 rounded-full border"
            style={{ borderColor: "#00f2fe44", color: "#00f2fe", background: "#00f2fe12" }}
            data-testid="total-farm-rate"
          >
            +{totalRate}/hr
          </div>
        )}
      </div>

      <div className="px-4 py-2 grid grid-cols-2 gap-3 flex-1">
        {planets.map((planet) => (
          <div
            key={planet.id}
            className="rounded-2xl border p-3 flex flex-col items-center gap-2 slot-enter relative"
            style={{
              borderColor: planet.color + "33",
              background: planet.color + "08",
              boxShadow: `0 0 16px ${planet.color}18`,
            }}
            data-testid={`slot-planet-${planet.id}`}
          >
            <PlanetOrb planet={planet} size={64} />
            <div
              className="font-black text-sm tracking-wider uppercase"
              style={{ color: planet.color, textShadow: `0 0 8px ${planet.color}` }}
            >
              {planet.name}
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              {RATE_LABELS[planet.name]} &bull; +{planet.rate}/hr
            </div>
            <div
              className="w-full h-0.5 rounded-full"
              style={{ background: planet.glowColor }}
            />
            <button
              className="text-xs font-bold px-3 py-1 rounded-full transition-all"
              style={{
                background: confirmId === planet.id ? "#ff416c22" : "transparent",
                color: confirmId === planet.id ? "#ff416c" : "rgba(255,255,255,0.3)",
                border: `1px solid ${confirmId === planet.id ? "#ff416c44" : "rgba(255,255,255,0.08)"}`,
              }}
              onClick={() => handleRemoveClick(planet.id)}
              data-testid={`button-remove-${planet.id}`}
            >
              {confirmId === planet.id ? "Confirm?" : "Release"}
            </button>
          </div>
        ))}

        {Array.from({ length: Math.max(0, 2 - planets.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 py-8"
            style={{ borderColor: "rgba(255,255,255,0.08)", minHeight: 160 }}
            data-testid={`slot-empty-${i}`}
          >
            <div className="text-3xl opacity-20">◌</div>
            <div className="text-xs text-muted-foreground font-medium opacity-60">Empty Slot</div>
          </div>
        ))}

        <div
          className="rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 py-8 opacity-40"
          style={{ borderColor: "rgba(255,215,0,0.25)", minHeight: 160, background: "rgba(255,215,0,0.03)", cursor: "not-allowed" }}
          data-testid="slot-locked"
        >
          <div className="text-2xl" style={{ color: "rgba(255,215,0,0.5)" }}>🔒</div>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,215,0,0.6)" }}>
            0.25 TON
          </div>
          <div className="text-xs text-muted-foreground opacity-70">to unlock</div>
        </div>
      </div>

      <div className="px-5 py-3 flex-shrink-0">
        {planets.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">
            Craft your first planet in the Lab to start farming
          </div>
        )}
      </div>
    </div>
  );
}
