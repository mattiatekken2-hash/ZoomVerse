import { useState, useRef } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import type { Planet, SunState } from "../hooks/useGameState";
import { PLANET_CONFIG, SUN_CONFIG, isFarmActive, isSunActive, getFarmTimeRemaining, getSunTimeRemaining, formatDuration, needsCollect } from "../hooks/useGameState";
import { WalletPopup } from "../components/WalletPopup";
import { haptic } from "../utils/haptic";

interface FarmPageProps {
  planets: Planet[];
  sun: SunState | null;
  balance: number;
  maxSlots: number;
  onCollect: (id: string) => void;
  onBurn: (id: string) => void;
  onStartFarming: (id: string) => void;
  onStopFarming: (id: string) => void;
  onStartSunFarming: () => void;
  onStopSunFarming: () => void;
  onBurnSun: () => void;
  onSell: (id: string, price: number) => void;
  onUnlist: (id: string) => void;
}

interface SellPopup {
  planetId: string;
  planetName: string;
  planetColor: string;
}

const RARITY_CLASS: Record<string, string> = {
  BASIC: "rarity-basic",
  RARE: "rarity-rare",
  EPIC: "rarity-epic",
  GOLD: "rarity-gold",
};

export function FarmPage({ planets, sun, maxSlots, onCollect, onBurn, onStartFarming, onStopFarming, onStartSunFarming, onStopSunFarming, onBurnSun, onSell, onUnlist }: FarmPageProps) {
  const [confirmBurn, setConfirmBurn] = useState<string | null>(null);
  const [sellPopup, setSellPopup] = useState<SellPopup | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [sunWalletOpen, setSunWalletOpen] = useState(false);
  const [slotWalletOpen, setSlotWalletOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalRate = planets.filter(isFarmActive).reduce((a, p) => a + p.rate, 0)
    + (sun && isSunActive(sun) ? SUN_CONFIG.rate : 0);

  const handleBurnClick = (id: string) => {
    haptic(8);
    if (confirmBurn === id) {
      onBurn(id);
      setConfirmBurn(null);
    } else {
      setConfirmBurn(id);
      setTimeout(() => setConfirmBurn(null), 2500);
    }
  };

  const openSellPopup = (planet: Planet) => {
    haptic(6);
    const cfg = PLANET_CONFIG[planet.name];
    const suggested = Math.floor(planet.craftCost * 2.5);
    setSellPopup({ planetId: planet.id, planetName: cfg.label, planetColor: planet.color });
    setSellPrice(String(suggested));
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const confirmSell = () => {
    if (!sellPopup) return;
    const price = parseInt(sellPrice, 10);
    if (!price || price <= 0) return;
    haptic(10);
    onSell(sellPopup.planetId, price);
    setSellPopup(null);
    setSellPrice("");
  };

  const cancelSell = () => {
    setSellPopup(null);
    setSellPrice("");
  };

  const sunActive = sun ? isSunActive(sun) : false;
  const sunRemaining = sun && sun.isActive ? getSunTimeRemaining(sun) : 0;

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-5 pt-4 pb-2 flex-shrink-0 flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg tracking-tight">My Planets</h2>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            {planets.length}/{maxSlots} slots · {totalRate > 0 ? `+${totalRate.toLocaleString()} $ZOOM/hr` : "No active farming"}
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

          {/* SUN CARD */}
          {sun?.isOwned && (
            <div
              className="slot-enter rounded-2xl p-4 border relative overflow-hidden"
              style={{
                borderColor: "rgba(255,179,71,0.35)",
                background: "linear-gradient(135deg, rgba(255,179,71,0.09) 0%, rgba(255,140,0,0.04) 100%)",
                boxShadow: sunActive ? "0 0 32px rgba(255,179,71,0.18)" : "none",
              }}
            >
              <div
                className="absolute top-0 right-0 w-28 h-28 rounded-full pointer-events-none"
                style={{
                  background: "radial-gradient(circle, rgba(255,179,71,0.18) 0%, transparent 70%)",
                  filter: "blur(16px)",
                  transform: "translate(30%,-30%)",
                }}
              />
              <div className="flex items-center gap-4 mb-4">
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      width: 72, height: 72,
                      borderRadius: "50%",
                      background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3) 0%, #ffb347ee 20%, #ff8c00cc 55%, #ff450088 80%, #ff220033 100%)",
                      boxShadow: sunActive
                        ? "0 0 40px rgba(255,179,71,0.7), 0 0 80px rgba(255,140,0,0.3), inset -8px -4px 16px rgba(0,0,0,0.4)"
                        : "0 0 20px rgba(255,179,71,0.3), inset -8px -4px 16px rgba(0,0,0,0.4)",
                      flexShrink: 0,
                      animation: sunActive ? "planet-breathe 3s ease-in-out infinite alternate" : "none",
                    }}
                  />
                  {sunActive && (
                    <div
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full pulse-soft"
                      style={{ background: "#00e676", boxShadow: "0 0 8px #00e676" }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-base tracking-wide gold-text">☀️ THE SUN</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,215,0,0.12)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.25)", fontSize: 9 }}>
                      EXCLUSIVE
                    </span>
                  </div>
                  <div className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {sunActive
                      ? `+${SUN_CONFIG.rate.toLocaleString()} $ZOOM/hr · ${formatDuration(sunRemaining)} left`
                      : "Farming paused"}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="btn-widget flex-1"
                  style={{
                    borderColor: sunActive ? "rgba(255,179,71,0.35)" : "rgba(0,242,254,0.25)",
                    background: sunActive ? "rgba(255,179,71,0.07)" : "rgba(0,242,254,0.06)",
                    color: sunActive ? "#ffb347" : "#00f2fe",
                  }}
                  onClick={() => {
                    haptic(6);
                    if (sunActive) onStopSunFarming();
                    else onStartSunFarming();
                  }}
                >
                  <span style={{ fontSize: 14 }}>{sunActive ? "⏸" : "▶"}</span>
                  <span>{sunActive ? "PAUSE" : "FARM"}</span>
                  <span style={{ fontSize: 8, opacity: 0.6 }}>{sunActive ? formatDuration(sunRemaining) : "Start"}</span>
                </button>

                <button
                  className="btn-widget flex-1"
                  style={{
                    borderColor: confirmBurn === "sun" ? "rgba(255,65,108,0.5)" : "rgba(255,255,255,0.08)",
                    background: confirmBurn === "sun" ? "rgba(255,65,108,0.1)" : "transparent",
                    color: confirmBurn === "sun" ? "#ff416c" : "rgba(255,255,255,0.3)",
                  }}
                  onClick={() => {
                    haptic(8);
                    if (confirmBurn === "sun") {
                      onBurnSun();
                      setConfirmBurn(null);
                    } else {
                      setConfirmBurn("sun");
                      setTimeout(() => setConfirmBurn(null), 2500);
                    }
                  }}
                >
                  <span style={{ fontSize: 14 }}>🔥</span>
                  <span>{confirmBurn === "sun" ? "SURE?" : "BURN"}</span>
                  <span style={{ fontSize: 8, opacity: 0.6 }}>Sun</span>
                </button>
              </div>
            </div>
          )}

          {/* REGULAR PLANETS */}
          {planets.map((planet) => {
            const active = isFarmActive(planet);
            const remaining = getFarmTimeRemaining(planet);
            const needsDaily = needsCollect(planet);
            const refund = Math.floor(planet.craftCost * 0.15);
            const cfg = PLANET_CONFIG[planet.name];
            const isListed = planet.isListedInMarket;

            return (
              <div
                key={planet.id}
                className="slot-enter rounded-2xl p-4 border"
                style={{
                  borderColor: isListed ? "rgba(255,215,0,0.3)" : planet.color + "30",
                  background: `linear-gradient(135deg, ${planet.color}08 0%, rgba(6,8,16,0.6) 100%)`,
                  boxShadow: active ? `0 0 28px ${planet.color}18` : "none",
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
                    {isListed && !active && (
                      <div
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                        style={{ background: "#ffd700", boxShadow: "0 0 8px #ffd700" }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-black text-base tracking-wide ${RARITY_CLASS[planet.name]}`}>
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
                      {active
                        ? `+${planet.rate.toLocaleString()} $ZOOM/hr · ${formatDuration(remaining)} left`
                        : isListed
                        ? `Listed for ${planet.marketPrice?.toLocaleString()} $ZOOM`
                        : "Farming stopped"}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {needsDaily ? (
                    <button
                      className="btn-widget"
                      style={{ borderColor: "rgba(255,165,0,0.5)", background: "rgba(255,165,0,0.09)", color: "#ffa500" }}
                      onClick={() => { haptic(8); onCollect(planet.id); }}
                      data-testid={`btn-collect-${planet.id}`}
                    >
                      <span style={{ fontSize: 14 }}>⚡</span>
                      <span>COLLECT</span>
                      <span style={{ fontSize: 8, opacity: 0.6 }}>Daily</span>
                    </button>
                  ) : active ? (
                    <button
                      className="btn-widget"
                      style={{ borderColor: "rgba(0,230,118,0.3)", background: "rgba(0,230,118,0.06)", color: "#00e676" }}
                      onClick={() => { haptic(6); onStopFarming(planet.id); }}
                      data-testid={`btn-stop-${planet.id}`}
                    >
                      <span style={{ fontSize: 14 }}>⏸</span>
                      <span>FARMING</span>
                      <span style={{ fontSize: 8, opacity: 0.6 }}>{formatDuration(remaining)}</span>
                    </button>
                  ) : (
                    <button
                      className="btn-widget"
                      disabled={isListed}
                      style={{
                        borderColor: isListed ? "rgba(255,255,255,0.04)" : "rgba(0,242,254,0.25)",
                        background: isListed ? "transparent" : "rgba(0,242,254,0.06)",
                        color: isListed ? "rgba(255,255,255,0.15)" : "#00f2fe",
                        cursor: isListed ? "not-allowed" : "pointer",
                        opacity: isListed ? 0.4 : 1,
                      }}
                      onClick={() => { if (!isListed) { haptic(6); onStartFarming(planet.id); } }}
                      data-testid={`btn-farm-${planet.id}`}
                    >
                      <span style={{ fontSize: 14 }}>▶</span>
                      <span>START</span>
                      <span style={{ fontSize: 8, opacity: 0.6 }}>Farm</span>
                    </button>
                  )}

                  <button
                    className="btn-widget"
                    disabled={isListed}
                    style={{
                      borderColor: confirmBurn === planet.id ? "rgba(255,65,108,0.5)" : "rgba(255,255,255,0.08)",
                      background: confirmBurn === planet.id ? "rgba(255,65,108,0.1)" : "transparent",
                      color: isListed ? "rgba(255,255,255,0.12)" : confirmBurn === planet.id ? "#ff416c" : "rgba(255,255,255,0.3)",
                      cursor: isListed ? "not-allowed" : "pointer",
                      opacity: isListed ? 0.35 : 1,
                    }}
                    onClick={() => !isListed && handleBurnClick(planet.id)}
                    data-testid={`btn-burn-${planet.id}`}
                  >
                    <span style={{ fontSize: 14 }}>🔥</span>
                    <span>{confirmBurn === planet.id ? "SURE?" : "BURN"}</span>
                    <span style={{ fontSize: 8, opacity: 0.6 }}>+{refund}</span>
                  </button>

                  {isListed ? (
                    <button
                      className="btn-widget"
                      style={{ borderColor: "rgba(255,215,0,0.4)", background: "rgba(255,215,0,0.07)", color: "#ffd700" }}
                      onClick={() => { haptic(6); onUnlist(planet.id); }}
                      data-testid={`btn-unlist-${planet.id}`}
                    >
                      <span style={{ fontSize: 14 }}>✕</span>
                      <span>LISTED</span>
                      <span style={{ fontSize: 8, opacity: 0.6 }}>Delist</span>
                    </button>
                  ) : (
                    <button
                      className="btn-widget"
                      style={{ borderColor: "rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.3)" }}
                      onClick={() => openSellPopup(planet)}
                      data-testid={`btn-sell-${planet.id}`}
                    >
                      <span style={{ fontSize: 14 }}>💫</span>
                      <span>SELL</span>
                      <span style={{ fontSize: 8, opacity: 0.6 }}>Market</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {Array.from({ length: Math.max(0, maxSlots - planets.length) }).map((_, i) => (
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
            className="rounded-2xl border border-dashed flex flex-col items-center justify-center py-8 gap-2 transition-all active:scale-[0.98]"
            style={{ borderColor: "rgba(255,215,0,0.22)", background: "rgba(255,215,0,0.025)", cursor: "pointer", minHeight: 100 }}
            onClick={() => { haptic(8); setSlotWalletOpen(true); }}
            data-testid="slot-locked"
          >
            <div style={{ fontSize: 20, opacity: 0.45 }}>🔒</div>
            <div className="font-bold text-xs tracking-widest uppercase" style={{ color: "rgba(255,215,0,0.45)" }}>0.25 TON</div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.18)" }}>to unlock slot</div>
          </div>
        </div>

        {planets.length === 0 && !sun?.isOwned && (
          <div className="text-center text-xs py-4" style={{ color: "rgba(255,255,255,0.22)" }}>
            Forge your first planet in the Lab
          </div>
        )}
      </div>

      {/* SELL PRICE POPUP */}
      {sellPopup && (
        <div
          className="absolute inset-0 flex items-end justify-center z-50"
          style={{ background: "rgba(6,8,16,0.82)", backdropFilter: "blur(12px)" }}
          onClick={(e) => e.target === e.currentTarget && cancelSell()}
        >
          <div
            className="w-full glass-strong rounded-t-3xl px-5 pt-6 pb-8"
            style={{ boxShadow: `0 -20px 60px ${sellPopup.planetColor}20` }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: sellPopup.planetColor, boxShadow: `0 0 10px ${sellPopup.planetColor}` }} />
              <div className="font-black text-base" style={{ color: sellPopup.planetColor }}>
                List {sellPopup.planetName} Planet
              </div>
            </div>
            <div className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
              Set your asking price in $ZOOM. A 25% marketplace fee applies on sale.
            </div>
            <div className="relative mb-2">
              <input
                ref={inputRef}
                type="number"
                min={1}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full rounded-xl px-4 py-4 text-xl font-black pr-20 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${sellPopup.planetColor}44`, color: "white", caretColor: sellPopup.planetColor }}
                placeholder="Enter price"
                inputMode="numeric"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
                $ZOOM
              </span>
            </div>
            {sellPrice && parseInt(sellPrice) > 0 && (
              <div className="text-xs mb-4 px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                Buyer pays {Math.floor(parseInt(sellPrice) * 1.25).toLocaleString()} $ZOOM total · You receive {parseInt(sellPrice).toLocaleString()}
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button
                className="flex-1 py-3.5 rounded-xl font-bold text-sm border transition-all active:scale-95"
                style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
                onClick={cancelSell}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-3.5 rounded-xl font-black text-sm transition-all active:scale-95"
                disabled={!sellPrice || parseInt(sellPrice) <= 0}
                style={{
                  background: (!sellPrice || parseInt(sellPrice) <= 0) ? "rgba(255,255,255,0.05)" : `linear-gradient(135deg, ${sellPopup.planetColor}cc, ${sellPopup.planetColor}88)`,
                  color: (!sellPrice || parseInt(sellPrice) <= 0) ? "rgba(255,255,255,0.2)" : "#060810",
                  boxShadow: (!sellPrice || parseInt(sellPrice) <= 0) ? "none" : `0 0 20px ${sellPopup.planetColor}40`,
                }}
                onClick={confirmSell}
                data-testid="btn-confirm-sell"
              >
                List for {sellPrice ? parseInt(sellPrice).toLocaleString() : "—"} $ZOOM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUN WALLET POPUP */}
      {sun && (
        <WalletPopup
          isOpen={sunWalletOpen}
          amount={`${sun.activationCost} TON`}
          purpose="Activate THE SUN"
          onClose={() => setSunWalletOpen(false)}
        />
      )}
      <WalletPopup
        isOpen={slotWalletOpen}
        amount="0.25 TON"
        purpose="Unlock Farm Slot"
        instruction="Send TON to this address to unlock your slot."
        copyLabel="Copy Link"
        onClose={() => setSlotWalletOpen(false)}
      />
    </div>
  );
}
