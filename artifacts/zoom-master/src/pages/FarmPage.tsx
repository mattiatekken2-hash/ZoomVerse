import { useState } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import type { Planet } from "../hooks/useGameState";
import { PLANET_CONFIG, isFarmActive, getFarmTimeRemaining, formatDuration, needsCollect } from "../hooks/useGameState";

interface FarmPageProps {
  planets: Planet[];
  balance: number;
  onCollect: (id: string) => void;
  onBurn: (id: string) => void;
  onList: (id: string) => void;
}

const RARITY_CLASS: Record<string, string> = {
  BASIC: "rarity-basic",
  RARE: "rarity-rare",
  EPIC: "rarity-epic",
  GOLD: "rarity-gold",
};

export function FarmPage({ planets, onCollect, onBurn, onList }: FarmPageProps) {
  const [confirmBurn, setConfirmBurn] = useState<string | null>(null);

  const handleBurnClick = (id: string) => {
    if (confirmBurn === id) {
      onBurn(id);
      setConfirmBurn(null);
    } else {
      setConfirmBurn(id);
      setTimeout(() => setConfirmBurn(null), 2500);
    }
  };

  const totalRate = planets.filter(isFarmActive).reduce((a, p) => a + p.rate, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-4 pb-2 flex-shrink-0 flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg tracking-tight">My Planets</h2>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            {planets.length}/2 slots · {totalRate.toLocaleString()} $ZOOM/hr farming
          </p>
        </div>
        {totalRate > 0 && (
          <div className="glass-neon px-3 py-1.5 rounded-full text-xs font-bold neon-text" data-testid="total-farm-rate">
            +{totalRate.toLocaleString()}/hr
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-3">
          {planets.map((planet) => {
            const active = isFarmActive(planet);
            const remaining = getFarmTimeRemaining(planet);
            const needsDaily = needsCollect(planet);
            const refund = Math.floor(planet.craftCost * 0.15);
            const cfg = PLANET_CONFIG[planet.name];

            return (
              <div
                key={planet.id}
                className="slot-enter rounded-2xl p-4 border"
                style={{
                  borderColor: planet.color + "30",
                  background: `linear-gradient(135deg, ${planet.color}08 0%, rgba(6,8,16,0.6) 100%)`,
                  boxShadow: active ? `0 0 24px ${planet.color}15` : "none",
                }}
                data-testid={`planet-card-${planet.id}`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div style={{ position: "relative" }}>
                    <PlanetOrb planet={planet} size={72} animate={active} />
                    {active && (
                      <div
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full pulse-soft"
                        style={{ background: "#00e676", boxShadow: "0 0 8px #00e676" }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`font-black text-base tracking-wide ${RARITY_CLASS[planet.name]}`}
                      >
                        {cfg.label.toUpperCase()}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RARITY_CLASS[planet.name]}`}
                        style={{ fontSize: 9 }}
                      >
                        {planet.name}
                      </span>
                    </div>
                    <div className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {active ? `+${planet.rate.toLocaleString()} $ZOOM/hr` : "Farming paused"}
                    </div>
                    {planet.isListedInMarket && (
                      <div className="text-xs font-bold mt-1" style={{ color: "#ffd700" }}>
                        Listed in Market
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="btn-widget"
                    style={{
                      borderColor: needsDaily ? "rgba(255,165,0,0.4)" : active ? "rgba(0,230,118,0.3)" : "rgba(255,255,255,0.08)",
                      background: needsDaily ? "rgba(255,165,0,0.08)" : active ? "rgba(0,230,118,0.06)" : "transparent",
                      color: needsDaily ? "#ffa500" : active ? "#00e676" : "rgba(255,255,255,0.3)",
                    }}
                    onClick={() => needsDaily ? onCollect(planet.id) : undefined}
                    data-testid={`btn-farm-${planet.id}`}
                  >
                    <span style={{ fontSize: 14 }}>{needsDaily ? "⚡" : active ? "🌿" : "⏸"}</span>
                    <span>{needsDaily ? "COLLECT" : active ? "FARMING" : "PAUSED"}</span>
                    {active && !needsDaily && (
                      <span style={{ fontSize: 8, opacity: 0.6 }}>{formatDuration(remaining)}</span>
                    )}
                  </button>

                  <button
                    className="btn-widget"
                    style={{
                      borderColor: confirmBurn === planet.id ? "rgba(255,65,108,0.5)" : "rgba(255,255,255,0.08)",
                      background: confirmBurn === planet.id ? "rgba(255,65,108,0.1)" : "transparent",
                      color: confirmBurn === planet.id ? "#ff416c" : "rgba(255,255,255,0.3)",
                    }}
                    onClick={() => handleBurnClick(planet.id)}
                    data-testid={`btn-burn-${planet.id}`}
                  >
                    <span style={{ fontSize: 14 }}>🔥</span>
                    <span>{confirmBurn === planet.id ? "SURE?" : "BURN"}</span>
                    <span style={{ fontSize: 8, opacity: 0.6 }}>+{refund} $ZOOM</span>
                  </button>

                  <button
                    className="btn-widget"
                    style={{
                      borderColor: planet.isListedInMarket ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)",
                      background: planet.isListedInMarket ? "rgba(255,215,0,0.06)" : "transparent",
                      color: planet.isListedInMarket ? "#ffd700" : "rgba(255,255,255,0.3)",
                    }}
                    onClick={() => onList(planet.id)}
                    data-testid={`btn-sell-${planet.id}`}
                  >
                    <span style={{ fontSize: 14 }}>💫</span>
                    <span>{planet.isListedInMarket ? "LISTED" : "SELL"}</span>
                    <span style={{ fontSize: 8, opacity: 0.6 }}>Market</span>
                  </button>
                </div>
              </div>
            );
          })}

          {Array.from({ length: Math.max(0, 2 - planets.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="rounded-2xl border border-dashed flex flex-col items-center justify-center py-10 gap-3"
              style={{ borderColor: "rgba(255,255,255,0.07)", minHeight: 140 }}
              data-testid={`slot-empty-${i}`}
            >
              <div style={{ fontSize: 32, opacity: 0.15 }}>◌</div>
              <div className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.2)" }}>Empty Slot</div>
            </div>
          ))}

          <div
            className="rounded-2xl border border-dashed flex flex-col items-center justify-center py-10 gap-2"
            style={{
              borderColor: "rgba(255,215,0,0.15)",
              background: "rgba(255,215,0,0.02)",
              cursor: "not-allowed",
              minHeight: 120,
            }}
            data-testid="slot-locked"
          >
            <div style={{ fontSize: 22, opacity: 0.5 }}>🔒</div>
            <div className="font-bold text-xs tracking-widest uppercase" style={{ color: "rgba(255,215,0,0.5)" }}>
              0.25 TON
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>to unlock</div>
          </div>
        </div>

        {planets.length === 0 && (
          <div className="text-center text-xs py-6" style={{ color: "rgba(255,255,255,0.25)" }}>
            Forge your first planet in the Lab
          </div>
        )}
      </div>
    </div>
  );
}
