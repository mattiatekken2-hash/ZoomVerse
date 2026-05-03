import { useState, useRef } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import type { Planet, SunState } from "../hooks/useGameState";
import { PLANET_CONFIG, SUN_CONFIG, isFarmActive, isSunActive, isFarmExpired, isSunExpired, getReactivationFee, getSunReactivationFee, getFarmTimeRemaining, getSunTimeRemaining, formatDuration } from "../hooks/useGameState";
import { WalletPopup } from "../components/WalletPopup";
import { useT } from "../i18n/LanguageContext";
import { PlanetRenameModal } from "../components/PlanetRenameModal";
import { getPlanetDisplayName } from "../utils/planetNames";


interface FarmPageProps {
  planets: Planet[];
  sun: SunState | null;
  sunCount?: number;
  balance: number;
  maxSlots: number;
  defectPlanets: string[];
  telegramId: string | null;
  onCollect: (id: string) => { defect: boolean };
  onBurn: (id: string) => void;
  onStartFarming: (id: string) => { ok: boolean; reason?: string };
  onStopFarming: (id: string) => void;
  onStartSunFarming: () => { ok: boolean; reason?: string };
  onStopSunFarming: () => void;
  onBurnSun: () => void;
  onSell: (id: string, price: number) => void;
  onUnlist: (id: string) => void;
  // Called after a successful rename so App can patch local state and
  // refresh the displayed stardust balance.
  onRename: (planetId: string, displayName: string, newStardustBalance: number) => void;
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
  V1: "rarity-gold",
};

export function FarmPage({ planets, sun, sunCount, maxSlots, defectPlanets, telegramId, onCollect, onBurn, onStartFarming, onStopFarming, onStartSunFarming, onStopSunFarming, onBurnSun, onSell, onUnlist, onRename }: FarmPageProps) {
  const { t } = useT();
  const sunMultiplier = Math.max(1, sunCount || (sun?.isOwned ? 1 : 0));
  const sunDisplayRate = SUN_CONFIG.rate * sunMultiplier;
  const [confirmBurn, setConfirmBurn] = useState<string | null>(null);
  const [sellPopup, setSellPopup] = useState<SellPopup | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [sunWalletOpen, setSunWalletOpen] = useState(false);
  const [slotWalletOpen, setSlotWalletOpen] = useState(false);
  const [defectMsg, setDefectMsg] = useState<string | null>(null);
  const [renamePlanet, setRenamePlanet] = useState<Planet | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Daily-collect removed — planets now farm autonomously for the full 24h
  // cycle and then need a $ZOOM reactivation, with no manual collect step.
  // `onCollect` prop is retained for legacy compatibility but never invoked.
  void onCollect;

  const totalRate = planets.filter(isFarmActive).reduce((a, p) => a + p.rate, 0)
    + (sun && isSunActive(sun) ? sunDisplayRate : 0);

  const handleBurnClick = (id: string) => {
    if (confirmBurn === id) {
      onBurn(id);
      setConfirmBurn(null);
    } else {
      setConfirmBurn(id);
      setTimeout(() => setConfirmBurn(null), 2500);
    }
  };

  const openSellPopup = (planet: Planet) => {
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
    onSell(sellPopup.planetId, price);
    setSellPopup(null);
    setSellPrice("");
  };

  const cancelSell = () => {
    setSellPopup(null);
    setSellPrice("");
  };

  const sunActive = sun ? isSunActive(sun) : false;
  const sunExpired = isSunExpired(sun);
  const sunReactivationFee = getSunReactivationFee(sunCount);
  const sunRemaining = sun && sun.isActive ? getSunTimeRemaining(sun) : 0;

  const handleSunStartOrReactivate = () => {
    const res = onStartSunFarming();
    if (!res.ok) {
      setDefectMsg(res.reason ?? "Cannot start SUN farming");
      setTimeout(() => setDefectMsg(null), 1800);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      {defectMsg && (
        <div
          className="absolute top-2 left-4 right-4 z-50 rounded-xl px-4 py-3 text-center text-sm font-bold animate-pulse"
          style={{
            background: "linear-gradient(135deg, rgba(255,50,50,0.25) 0%, rgba(180,30,30,0.35) 100%)",
            border: "1px solid rgba(255,80,80,0.5)",
            color: "#ff5252",
            backdropFilter: "blur(12px)",
          }}
        >
          ⚠ {defectMsg}
        </div>
      )}
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

      {/* Native-like scroll container.
          - `WebkitOverflowScrolling: touch` enables momentum scroll on iOS WebView (Telegram mini-app).
          - `touchAction: pan-y` tells the browser the only gesture is vertical pan, so it can scroll on the compositor without waiting for JS.
          - `overscrollBehavior: contain` blocks chain-scroll to the parent and disables pull-to-refresh jitter.
          - `transform: translateZ(0)` + `willChange: scroll-position` promote the scroller to its own GPU layer so frames are composited, not repainted.
          - `contain: layout paint` isolates layout/paint scope. */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-4"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
          transform: "translateZ(0)",
          willChange: "scroll-position",
          contain: "layout paint",
        }}
      >
        <div className="flex flex-col gap-3">

          {/* SUN CARD */}
          {sun?.isOwned && (
            <div
              className="slot-enter rounded-2xl p-4 border relative overflow-hidden"
              style={{
                borderColor: sunExpired ? "rgba(255,255,255,0.08)" : "rgba(255,179,71,0.35)",
                background: "linear-gradient(135deg, rgba(255,179,71,0.09) 0%, rgba(255,140,0,0.04) 100%)",
                boxShadow: sunActive ? "0 0 32px rgba(255,179,71,0.18)" : "none",
                contain: "layout style paint",
              } as React.CSSProperties}
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
                <div
                  style={{
                    position: "relative",
                    filter: sunExpired ? "grayscale(1) brightness(0.45)" : undefined,
                    transition: "filter 0.4s ease",
                  }}
                >
                  <div
                    style={{
                      width: 72, height: 72,
                      borderRadius: "50%",
                      position: "relative",
                      overflow: "hidden",
                      background: "radial-gradient(circle at 40% 35%, #fff8e1 0%, #ffe082 12%, #ffb347 28%, #ff8c00 48%, #e65100 68%, #bf360c 85%, #4e1a00 100%)",
                      boxShadow: sunActive
                        ? "0 0 50px rgba(255,160,0,0.8), 0 0 100px rgba(255,100,0,0.4), 0 0 150px rgba(255,60,0,0.15), inset -6px -4px 14px rgba(0,0,0,0.3)"
                        : "0 0 25px rgba(255,160,0,0.35), 0 0 50px rgba(255,100,0,0.12), inset -6px -4px 14px rgba(0,0,0,0.3)",
                      flexShrink: 0,
                      animation: sunActive ? "planet-rotate 18s linear infinite" : "none",
                    }}
                  >
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 35%)",
                      pointerEvents: "none",
                    }} />
                  </div>
                  {sunExpired && (
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ background: "radial-gradient(circle, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.85) 100%)" }}
                    />
                  )}
                  {sunActive && (
                    <div
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full pulse-soft"
                      style={{ background: "#00e676", boxShadow: "0 0 8px #00e676" }}
                    />
                  )}
                  {sunExpired && (
                    <div
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                      style={{ background: "#ff5252", boxShadow: "0 0 8px #ff5252" }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-base tracking-wide gold-text" style={sunExpired ? { opacity: 0.55 } : undefined}>THE SUN</span>
                    {sunMultiplier > 1 && (
                      <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(255,179,71,0.18)", color: "#ffb347", border: "1px solid rgba(255,179,71,0.45)", fontSize: 10 }}>
                        ×{sunMultiplier}
                      </span>
                    )}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,215,0,0.12)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.25)", fontSize: 9, opacity: sunExpired ? 0.55 : 1 }}>
                      EXCLUSIVE
                    </span>
                    {sunExpired && (
                      <span
                        className="text-xs font-black px-2 py-0.5 rounded-full"
                        style={{ fontSize: 9, background: "rgba(255,82,82,0.15)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.35)" }}
                      >
                        EXPIRED
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold" style={{ color: sunExpired ? "rgba(255,82,82,0.75)" : "rgba(255,255,255,0.5)" }}>
                    {sunActive
                      ? `+${SUN_CONFIG.rate.toLocaleString()} $ZOOM/hr · ${formatDuration(sunRemaining)} left`
                      : sunExpired
                      ? `Cycle ended · Reactivate for ${sunReactivationFee.toLocaleString()} $ZOOM`
                      : "Farming paused"}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {sunExpired ? (
                  <button
                    className="btn-widget flex-1"
                    style={{
                      background: "linear-gradient(135deg, rgba(255,179,71,0.22) 0%, rgba(255,140,0,0.12) 100%)",
                      border: "1px solid rgba(255,179,71,0.5)",
                      color: "#ffb347",
                      boxShadow: "0 0 14px rgba(255,179,71,0.25)",
                    }}
                    onClick={handleSunStartOrReactivate}
                    data-testid="btn-reactivate-sun"
                  >
                    <span>REACTIVATE</span>
                    <span style={{ fontSize: 8, opacity: 0.85 }}>{sunReactivationFee.toLocaleString()} $ZOOM</span>
                  </button>
                ) : sunActive ? (
                  // Active SUN cycle: show a non-interactive FARMING indicator.
                  // The cycle runs uninterrupted — there is no manual pause/stop.
                  <div
                    className="btn-widget flex-1 btn-glass-farm-active"
                    style={{ cursor: "default", pointerEvents: "none" }}
                    aria-disabled="true"
                    data-testid="status-sun-farming"
                  >
                    <span>FARMING</span>
                    <span style={{ fontSize: 8, opacity: 0.6 }}>{formatDuration(sunRemaining)}</span>
                  </div>
                ) : (
                  <button
                    className="btn-widget flex-1 btn-glass-farm"
                    onClick={handleSunStartOrReactivate}
                  >
                    <span>FARM</span>
                    <span style={{ fontSize: 8, opacity: 0.6 }}>Start</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* REGULAR PLANETS */}
          {planets.map((planet) => {
            const active = isFarmActive(planet);
            const remaining = getFarmTimeRemaining(planet);
            // Daily-collect removed: every rarity (including V1) now farms its
            // full 24h cycle autonomously, then expires and needs a $ZOOM
            // reactivation. No intermediate COLLECT button.
            const refund = Math.floor(planet.craftCost * 0.15);
            const cfg = PLANET_CONFIG[planet.name];
            const isListed = planet.isListedInMarket;
            const expired = isFarmExpired(planet);
            const reactivationFee = getReactivationFee(planet);
            void defectPlanets;

            const handleStartOrReactivate = () => {
              if (isListed) return;
              const res = onStartFarming(planet.id);
              if (!res.ok) {
                setDefectMsg(res.reason ?? "Cannot start farming");
                setTimeout(() => setDefectMsg(null), 1800);
              }
            };

            return (
              <div
                key={planet.id}
                className="slot-enter rounded-2xl p-4 border"
                style={{
                  borderColor: isListed ? "rgba(255,215,0,0.3)" : expired ? "rgba(255,255,255,0.08)" : planet.color + "40",
                  background: `linear-gradient(135deg, ${planet.color}0d 0%, rgba(6,8,16,0.6) 100%)`,
                  boxShadow: active ? `0 0 32px ${planet.color}22, 0 0 60px ${planet.color}08` : `0 0 16px ${planet.color}08`,
                  // Per-card paint isolation only — we intentionally do NOT use
                  // `content-visibility: auto` here. On Telegram's iOS WebView
                  // it caused a visible flicker as cards entered the viewport
                  // (placeholder height ≠ real height = layout jump + repaint).
                  contain: "layout style paint",
                } as React.CSSProperties}
                data-testid={`planet-card-${planet.id}`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div
                    style={{
                      position: "relative",
                      filter: expired ? "grayscale(1) brightness(0.45)" : undefined,
                      transition: "filter 0.4s ease",
                    }}
                  >
                    <PlanetOrb planet={planet} size={72} animate={active} />
                    {expired && (
                      <div
                        className="absolute inset-0 rounded-full pointer-events-none"
                        style={{ background: "radial-gradient(circle, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.85) 100%)" }}
                      />
                    )}
                    {active && (
                      <div
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full pulse-soft"
                        style={{ background: "#00e676", boxShadow: "0 0 8px #00e676" }}
                      />
                    )}
                    {expired && !isListed && (
                      <div
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                        style={{ background: "#ff5252", boxShadow: "0 0 8px #ff5252" }}
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
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => { if (telegramId && !isListed) setRenamePlanet(planet); }}
                        disabled={!telegramId || isListed}
                        title={isListed ? "Unlist to rename" : "Rename this planet"}
                        data-testid={`btn-rename-${planet.id}`}
                        className={`font-black text-base tracking-wide text-left ${RARITY_CLASS[planet.name]}`}
                        style={{
                          opacity: expired ? 0.55 : 1,
                          background: "transparent",
                          padding: 0,
                          border: 0,
                          cursor: telegramId && !isListed ? "pointer" : "default",
                        }}
                      >
                        {getPlanetDisplayName(planet)}
                      </button>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RARITY_CLASS[planet.name]}`}
                        style={{ fontSize: 9, opacity: expired ? 0.55 : 1 }}
                      >
                        {cfg.label.toUpperCase()}
                      </span>
                      {expired && (
                        <span
                          className="text-xs font-black px-2 py-0.5 rounded-full"
                          style={{ fontSize: 9, background: "rgba(255,82,82,0.15)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.35)" }}
                        >
                          EXPIRED
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-bold" style={{ color: expired ? "rgba(255,82,82,0.75)" : "rgba(255,255,255,0.5)" }}>
                      {active
                        ? `+${planet.rate.toLocaleString()} $ZOOM/hr · ${formatDuration(remaining)} left`
                        : expired
                        ? `Cycle ended · Reactivate for ${reactivationFee.toLocaleString()} $ZOOM`
                        : isListed
                        ? `Listed for ${planet.marketPrice?.toLocaleString()} $ZOOM`
                        : "Farming stopped"}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {active ? (
                    // Active farm cycle: non-interactive indicator. The cycle
                    // runs uninterrupted to completion — no manual pause/stop.
                    <div
                      className="btn-widget btn-glass-farm-active"
                      style={{ cursor: "default", pointerEvents: "none" }}
                      aria-disabled="true"
                      data-testid={`status-farming-${planet.id}`}
                    >
                      <span>{t("farm.farming")}</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>{formatDuration(remaining)}</span>
                    </div>
                  ) : expired ? (
                    <button
                      className="btn-widget"
                      style={{
                        background: `linear-gradient(135deg, ${planet.color}33 0%, ${planet.color}1a 100%)`,
                        border: `1px solid ${planet.color}66`,
                        color: planet.color,
                        boxShadow: `0 0 14px ${planet.color}33`,
                      }}
                      onClick={handleStartOrReactivate}
                      data-testid={`btn-reactivate-${planet.id}`}
                    >
                      <span>REACTIVATE</span>
                      <span style={{ fontSize: 8, opacity: 0.85 }}>{reactivationFee.toLocaleString()} $ZOOM</span>
                    </button>
                  ) : (
                    <button
                      className={`btn-widget ${isListed ? "" : "btn-glass-farm"}`}
                      disabled={isListed}
                      style={isListed ? { borderColor: "rgba(255,255,255,0.04)", background: "transparent", color: "rgba(255,255,255,0.15)", cursor: "not-allowed", opacity: 0.4 } : undefined}
                      onClick={handleStartOrReactivate}
                      data-testid={`btn-farm-${planet.id}`}
                    >
                      <span>START</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>Farm</span>
                    </button>
                  )}

                  <button
                    className={`btn-widget ${isListed ? "" : confirmBurn === planet.id ? "btn-glass-burn-confirm" : "btn-glass-burn"}`}
                    disabled={isListed}
                    style={isListed ? { borderColor: "rgba(255,255,255,0.06)", background: "transparent", color: "rgba(255,255,255,0.12)", cursor: "not-allowed", opacity: 0.3 } : undefined}
                    onClick={() => !isListed && handleBurnClick(planet.id)}
                    data-testid={`btn-burn-${planet.id}`}
                  >
                    <span>{confirmBurn === planet.id ? "SURE?" : "BURN"}</span>
                    <span style={{ fontSize: 8, opacity: 0.7 }}>+{refund}</span>
                  </button>

                  {isListed ? (
                    <button
                      className="btn-widget btn-glass-listed"
                      onClick={() => onUnlist(planet.id)}
                      data-testid={`btn-unlist-${planet.id}`}
                    >
                      <span style={{ fontSize: 14 }}>✕</span>
                      <span>LISTED</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>Delist</span>
                    </button>
                  ) : planet.name === "V1" ? (
                    // V1 is bound to its owner — cannot be listed on the
                    // market. Render a disabled badge instead of the SELL
                    // button so the slot still shows an action affordance.
                    <button
                      className="btn-widget btn-glass-sell"
                      disabled
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                      data-testid={`btn-sell-${planet.id}`}
                    >
                      <span>SOULBOUND</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>Cannot sell</span>
                    </button>
                  ) : (
                    <button
                      className="btn-widget btn-glass-sell"
                      onClick={() => openSellPopup(planet)}
                      data-testid={`btn-sell-${planet.id}`}
                    >
                      <span>SELL</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>Market</span>
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
              style={{
                borderColor: "rgba(255,255,255,0.07)",
                minHeight: 140,
                contain: "layout style paint",
              } as React.CSSProperties}
              data-testid={`slot-empty-${i}`}
            >
              <div style={{ fontSize: 32, opacity: 0.15 }}>◌</div>
              <div className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.2)" }}>Empty Slot</div>
            </div>
          ))}

          <div
            className="rounded-2xl border border-dashed flex flex-col items-center justify-center py-8 gap-2"
            style={{ borderColor: "rgba(255,215,0,0.22)", background: "rgba(255,215,0,0.025)", cursor: "default", minHeight: 100, pointerEvents: "none", userSelect: "none" }}
            data-testid="slot-locked"
            aria-disabled="true"
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
      {renamePlanet && telegramId && (
        <PlanetRenameModal
          planet={renamePlanet}
          telegramId={telegramId}
          onClose={() => setRenamePlanet(null)}
          onRenamed={(planetId, displayName, newStardustBalance) => {
            onRename(planetId, displayName, newStardustBalance);
          }}
        />
      )}
    </div>
  );
}
