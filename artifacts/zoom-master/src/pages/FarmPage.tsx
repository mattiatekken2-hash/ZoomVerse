import { useState, useRef, Fragment } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import type { Planet, SunState } from "../hooks/useGameState";
import { PLANET_CONFIG, SUN_CONFIG, isFarmActive, isSunActive, isFarmExpired, isSunExpired, getReactivationFee, getSunReactivationFee, getFarmTimeRemaining, getSunTimeRemaining, formatDuration } from "../hooks/useGameState";
import { WalletPopup } from "../components/WalletPopup";
import { useT } from "../i18n/LanguageContext";
import { PlanetRenameModal } from "../components/PlanetRenameModal";
import { getPlanetDisplayName } from "../utils/planetNames";
import { PlanetFloatBar } from "../components/PlanetFloatBar";
import { getDisplayFloat, isFloatablePlanet } from "../utils/planetFloat";


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
  V1_NFT: "rarity-gold",
};

// Render order for the per-rarity groups in the planet list. Matches
// the visual progression BASIC → RARE → EPIC → GOLD → V1 → V1_NFT used
// across the rest of the app (shop, lab, market filter dropdown).
// V1_NFT MUST be included — bonus-grant logic in useGameState appends
// V1_NFT planets into state.planets, and omitting it here would cause
// them to silently disappear from FarmPage. Any other future type that
// can land in `planets` is caught by the trailing "OTHER" group below.
const RARITY_ORDER = ["BASIC", "RARE", "EPIC", "GOLD", "V1", "V1_NFT"] as const;
type RarityKey = typeof RARITY_ORDER[number];
type SortDir = "desc" | "asc" | null;

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
  // Transient toast for the disabled COLLECTION teaser button. Shown
  // for ~2.4s, then auto-cleared. Kept separate from `defectMsg` so the
  // styling stays neutral (not a red error). When `defectMsg` is also
  // visible we vertically offset this toast (see render) so they never
  // visually collide.
  const [comingSoonMsg, setComingSoonMsg] = useState<string | null>(null);
  // Timeout id for the COLLECTION toast — kept in a ref so repeated
  // taps reset the auto-dismiss timer instead of firing stale clears.
  const comingSoonTimeoutRef = useRef<number | null>(null);
  const [renamePlanet, setRenamePlanet] = useState<Planet | null>(null);
  // Per-rarity sort direction for the float column. `null` keeps the
  // natural insertion order (most-recently-acquired last). Toggling the
  // same arrow twice clears it. Each rarity has its own state so the
  // user can sort GOLD by Float-high while leaving BASIC untouched.
  const [sortDir, setSortDir] = useState<Record<RarityKey, SortDir>>({
    BASIC: null, RARE: null, EPIC: null, GOLD: null, V1: null, V1_NFT: null,
  });
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
    // Safe lookup: PLANET_CONFIG covers every known rarity but we
    // defensively fall back to the bare planet name so a future or
    // legacy rarity that lands in `planets` (rendered through the
    // FarmPage fallback group) cannot crash the sell popup.
    const cfg = PLANET_CONFIG[planet.name];
    const suggested = Math.floor(planet.craftCost * 2.5);
    setSellPopup({ planetId: planet.id, planetName: cfg?.label ?? planet.name, planetColor: planet.color });
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
            background: "rgba(60,10,10,0.96)",
            border: "1px solid rgba(255,80,80,0.5)",
            color: "#ff5252",
          }}
        >
          ⚠ {defectMsg}
        </div>
      )}
      {comingSoonMsg && (
        <div
          className="absolute left-4 right-4 z-50 rounded-xl px-4 py-3 text-center text-sm font-bold"
          style={{
            // If the red defect toast is currently showing we drop
            // below it (~64px) instead of overlapping at top-2.
            top: defectMsg ? 64 : 8,
            background: "rgba(20,28,48,0.96)",
            border: "1px solid rgba(120,180,255,0.45)",
            color: "rgba(220,235,255,0.95)",
            boxShadow: "0 0 18px rgba(80,140,255,0.18)",
          }}
          data-testid="collection-coming-soon-toast"
        >
          {comingSoonMsg}
        </div>
      )}
      <div className="px-5 pt-4 pb-2 flex-shrink-0 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-black text-lg tracking-tight">{t("farm.myPlanets")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            {totalRate > 0 ? t("farm.slotsRate", { n: planets.length, max: maxSlots, rate: totalRate.toLocaleString() }) : `${planets.length}/${maxSlots} · ${t("farm.noActive")}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* COLLECTION teaser button.
              Visually disabled (greyscale + reduced opacity) to signal
              "coming soon" without removing it from the layout. Click
              shows a transient neutral toast — never navigates, never
              mutates state. Brand-safe English copy. */}
          <button
            type="button"
            onClick={() => {
              setComingSoonMsg("Feature coming soon: Collect planet sets for exclusive bonuses!");
              if (comingSoonTimeoutRef.current !== null) {
                window.clearTimeout(comingSoonTimeoutRef.current);
              }
              comingSoonTimeoutRef.current = window.setTimeout(() => {
                setComingSoonMsg(null);
                comingSoonTimeoutRef.current = null;
              }, 2400);
            }}
            aria-label="Collection — coming soon"
            data-testid="btn-collection-coming-soon"
            className="px-3 py-1.5 rounded-full text-xs font-black tracking-wide"
            style={{
              background: "linear-gradient(135deg, rgba(120,140,180,0.18) 0%, rgba(60,72,96,0.14) 100%)",
              border: "1px solid rgba(180,200,230,0.22)",
              color: "rgba(220,230,245,0.85)",
              filter: "grayscale(1)",
              opacity: 0.55,
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            COLLECTION
          </button>
          {totalRate > 0 && (
            <div className="glass-neon px-3 py-1.5 rounded-full text-xs font-bold neon-text" data-testid="total-farm-rate">
              +{totalRate.toLocaleString()}/hr
            </div>
          )}
        </div>
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
                boxShadow: sunActive ? "0 0 18px rgba(255,179,71,0.18)" : "none",
                transform: "translateZ(0)",
                contain: "layout style paint",
              } as React.CSSProperties}
            >
              <div
                className="absolute top-0 right-0 w-28 h-28 rounded-full pointer-events-none"
                style={{
                  background: "radial-gradient(circle, rgba(255,179,71,0.14) 0%, rgba(255,179,71,0.05) 45%, transparent 75%)",
                  transform: "translate(30%,-30%) translateZ(0)",
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
                    <span>{t("farm.farm")}</span>
                    <span style={{ fontSize: 8, opacity: 0.6 }}>{t("farm.startSmall")}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* REGULAR PLANETS — grouped by rarity. Each non-empty
              rarity group is preceded by a small section header that
              carries a Float-sort widget (▲ = low→high, ▼ = high→low).
              The sort is per-group so the user can sort GOLD by Float
              without disturbing BASIC. Tapping the active arrow again
              clears the sort and restores the natural insertion order. */}
          {RARITY_ORDER.map((rarity) => {
            const group = planets.filter((p) => p.name === rarity);
            if (group.length === 0) return null;
            const dir = sortDir[rarity];
            const sorted = dir
              ? [...group].sort((a, b) => {
                  const fa = getDisplayFloat(a);
                  const fb = getDisplayFloat(b);
                  return dir === "asc" ? fa - fb : fb - fa;
                })
              : group;
            const headerColor = PLANET_CONFIG[rarity]?.color ?? "#ffffff";
            const setDir = (next: SortDir) =>
              setSortDir((prev) => ({ ...prev, [rarity]: prev[rarity] === next ? null : next }));
            return (
              <Fragment key={`group-${rarity}`}>
                <div
                  className="flex items-center justify-between px-1 pt-1"
                  data-testid={`rarity-header-${rarity}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-black tracking-widest ${RARITY_CLASS[rarity]}`}
                      style={{ letterSpacing: "0.12em" }}
                    >
                      {rarity}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: `${headerColor}1a`,
                        color: headerColor,
                        border: `1px solid ${headerColor}40`,
                      }}
                    >
                      {sorted.length}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <span
                      className="text-[9px] font-bold tracking-wider"
                      style={{ color: "rgba(255,255,255,0.4)", marginRight: 2 }}
                    >
                      FLOAT
                    </span>
                    <button
                      type="button"
                      onClick={() => setDir("asc")}
                      aria-label="Sort by Float low to high"
                      aria-pressed={dir === "asc"}
                      data-testid={`sort-${rarity}-asc`}
                      className="flex items-center justify-center"
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: dir === "asc" ? `${headerColor}33` : "transparent",
                        border: dir === "asc" ? `1px solid ${headerColor}80` : "1px solid transparent",
                        color: dir === "asc" ? headerColor : "rgba(255,255,255,0.45)",
                        fontSize: 11, lineHeight: 1, fontWeight: 900,
                        transition: "background 0.15s, color 0.15s, border-color 0.15s",
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => setDir("desc")}
                      aria-label="Sort by Float high to low"
                      aria-pressed={dir === "desc"}
                      data-testid={`sort-${rarity}-desc`}
                      className="flex items-center justify-center"
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: dir === "desc" ? `${headerColor}33` : "transparent",
                        border: dir === "desc" ? `1px solid ${headerColor}80` : "1px solid transparent",
                        color: dir === "desc" ? headerColor : "rgba(255,255,255,0.45)",
                        fontSize: 11, lineHeight: 1, fontWeight: 900,
                        transition: "background 0.15s, color 0.15s, border-color 0.15s",
                      }}
                    >
                      ▼
                    </button>
                  </div>
                </div>
                {sorted.map((planet) => {
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
                  // Single, smaller shadow. The previous double 60px halo was
                  // a major cause of dropped repaints during scroll on Android
                  // Telegram WebView (cards going visually "empty" mid-scroll).
                  boxShadow: active ? `0 0 18px ${planet.color}26` : `0 0 10px ${planet.color}10`,
                  // Promote each card to its own GPU layer so its painted
                  // content is cached as a texture and survives fast scrolls
                  // without being re-rasterised every frame. NOTE: no
                  // persistent `will-change` — long-lived layer hints add GPU
                  // memory pressure on low-end Android devices and can trade
                  // one artifact for another.
                  transform: "translateZ(0)",
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
                    {isFloatablePlanet(planet) && (
                      <div className="mt-1.5" style={{ opacity: expired ? 0.55 : 1 }}>
                        <PlanetFloatBar value={getDisplayFloat(planet)} />
                      </div>
                    )}
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
                      <span>{t("farm.startBig")}</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>{t("farm.farm")}</span>
                    </button>
                  )}

                  <button
                    className={`btn-widget ${isListed ? "" : confirmBurn === planet.id ? "btn-glass-burn-confirm" : "btn-glass-burn"}`}
                    disabled={isListed}
                    style={isListed ? { borderColor: "rgba(255,255,255,0.06)", background: "transparent", color: "rgba(255,255,255,0.12)", cursor: "not-allowed", opacity: 0.3 } : undefined}
                    onClick={() => !isListed && handleBurnClick(planet.id)}
                    data-testid={`btn-burn-${planet.id}`}
                  >
                    <span>{confirmBurn === planet.id ? t("farm.sure") : t("farm.burn")}</span>
                    <span style={{ fontSize: 8, opacity: 0.7 }}>+{refund}</span>
                  </button>

                  {isListed ? (
                    <button
                      className="btn-widget btn-glass-listed"
                      onClick={() => onUnlist(planet.id)}
                      data-testid={`btn-unlist-${planet.id}`}
                    >
                      <span style={{ fontSize: 14 }}>✕</span>
                      <span>{t("farm.listed")}</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>{t("farm.delist")}</span>
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
                      <span style={{ fontSize: 8, opacity: 0.7 }}>{t("farm.cannotSell")}</span>
                    </button>
                  ) : (
                    <button
                      className="btn-widget btn-glass-sell"
                      onClick={() => openSellPopup(planet)}
                      data-testid={`btn-sell-${planet.id}`}
                    >
                      <span>{t("farm.sell")}</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>{t("farm.marketLabel")}</span>
                    </button>
                  )}
                </div>
              </div>
            );
                })}
              </Fragment>
            );
          })}

          {/* Safety fallback: render any planet whose `name` is not in
              RARITY_ORDER as an unsorted, ungrouped tail so a future
              new rarity (or stray legacy entry) can never silently
              disappear from FarmPage. The full card UI is reused via
              the same handlers; only the section header is omitted. */}
          {(() => {
            const known = new Set<string>(RARITY_ORDER);
            const orphans = planets.filter((p) => !known.has(p.name));
            if (orphans.length === 0) return null;
            return orphans.map((planet) => {
              const active = isFarmActive(planet);
              const remaining = getFarmTimeRemaining(planet);
              const refund = Math.floor(planet.craftCost * 0.15);
              const cfg = PLANET_CONFIG[planet.name];
              const isListed = planet.isListedInMarket;
              const expired = isFarmExpired(planet);
              const reactivationFee = getReactivationFee(planet);
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
                    boxShadow: active ? `0 0 18px ${planet.color}26` : `0 0 10px ${planet.color}10`,
                    transform: "translateZ(0)",
                    contain: "layout style paint",
                  } as React.CSSProperties}
                  data-testid={`planet-card-${planet.id}`}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <PlanetOrb planet={planet} size={72} animate={active} />
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-base tracking-wide" style={{ color: planet.color, opacity: expired ? 0.55 : 1 }}>
                        {getPlanetDisplayName(planet)}
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
                      <div className="btn-widget btn-glass-farm-active" style={{ cursor: "default", pointerEvents: "none" }} aria-disabled="true">
                        <span>{t("farm.farming")}</span>
                        <span style={{ fontSize: 8, opacity: 0.7 }}>{formatDuration(remaining)}</span>
                      </div>
                    ) : expired ? (
                      <button className="btn-widget" style={{ background: `linear-gradient(135deg, ${planet.color}33 0%, ${planet.color}1a 100%)`, border: `1px solid ${planet.color}66`, color: planet.color }} onClick={handleStartOrReactivate}>
                        <span>REACTIVATE</span>
                        <span style={{ fontSize: 8, opacity: 0.85 }}>{reactivationFee.toLocaleString()} $ZOOM</span>
                      </button>
                    ) : (
                      <button className={`btn-widget ${isListed ? "" : "btn-glass-farm"}`} disabled={isListed} onClick={handleStartOrReactivate}>
                        <span>{t("farm.startBig")}</span>
                        <span style={{ fontSize: 8, opacity: 0.7 }}>{t("farm.farm")}</span>
                      </button>
                    )}
                    <button className={`btn-widget ${isListed ? "" : confirmBurn === planet.id ? "btn-glass-burn-confirm" : "btn-glass-burn"}`} disabled={isListed} onClick={() => !isListed && handleBurnClick(planet.id)}>
                      <span>{confirmBurn === planet.id ? t("farm.sure") : t("farm.burn")}</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>+{refund}</span>
                    </button>
                    {isListed ? (
                      <button className="btn-widget btn-glass-listed" onClick={() => onUnlist(planet.id)}>
                        <span style={{ fontSize: 14 }}>✕</span>
                        <span>{t("farm.listed")}</span>
                      </button>
                    ) : (
                      <button className="btn-widget btn-glass-sell" onClick={() => openSellPopup(planet)}>
                        <span>{t("farm.sell")}</span>
                        <span style={{ fontSize: 8, opacity: 0.7 }}>{cfg?.label ?? planet.name}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            });
          })()}

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
              <div className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.2)" }}>{t("farm.emptySlot")}</div>
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
          style={{ background: "rgba(6,8,16,0.94)" }}
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
                placeholder={t("farm.enterPrice")}
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
