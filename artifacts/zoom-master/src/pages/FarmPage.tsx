import { useState, useRef, useEffect, useCallback } from "react";
import type { CollectibleItem } from "../utils/collectibleConfig";
import { FarmInventoryCard } from "../components/FarmInventoryCard";
import { StakingWidget } from "../components/StakingWidget";
import { DailyComboBox } from "../components/DailyComboBox";
import { PlanetDetailModal } from "../components/PlanetDetailModal";
import type { Planet, SunState } from "../hooks/useGameState";
import { PLANET_CONFIG, SUN_CONFIG, isFarmActive, isSunActive, FARM_UPGRADE_COSTS, FARM_UPGRADE_TIERS, isLegacyCatalogModelPlanet } from "../hooks/useGameState";
import { SunFarmInventoryCard } from "../components/SunFarmInventoryCard";
import { SunFarmThumb } from "../components/SunFarmThumb";
import { WalletPopup } from "../components/WalletPopup";
import { useT } from "../i18n/LanguageContext";
import { PlanetRenameModal } from "../components/PlanetRenameModal";
import PvPModal from "../components/PvPModal";
import { getPlanetDisplayName } from "../utils/planetNames";
import { PixelAvatar } from "../components/PixelAvatar";

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
  onRepair?: (id: string) => { ok: boolean; reason?: string };
  stardustBalance?: number;
  // Called after a successful rename so App can patch local state and
  // refresh the displayed stardust balance.
  onRename: (planetId: string, displayName: string, newStardustBalance: number) => void;
  // Collectible items inventory.
  items?: CollectibleItem[];
  onSellItem?: (itemId: string, price: number) => void;
  onUnlistItem?: (itemId: string) => void;
  /** Flush pending planet save before entering PvP queue. */
  onFlushPlanets?: () => Promise<void>;
  /** User's current GRAM deposit balance (shown in upgrade UI). */
  tonBalance?: number;
  /** Permanently upgrade a planet's farm duration; charges GRAM from deposit. */
  onUpgradeDuration?: (planetId: string, durationHours: number) => Promise<{ ok: boolean; error?: string }>;
  /** Permanently upgrade the SUN's farm-cycle duration; charges GRAM from EARNED GRAM. */
  onUpgradeSunDuration?: (durationHours: number) => Promise<{ ok: boolean; error?: string }>;
  /** GRAM-farming collections (White, Earth, Black, Supernova, REDSTAR). */
  whiteCollectionUnlocked?: boolean;
  whiteCollectionBundles?: number;
  whitePlanets?: Planet[];
  earthCollectionUnlocked?: boolean;
  earthCollectionBundles?: number;
  earthPlanets?: Planet[];
  blackCollectionUnlocked?: boolean;
  blackCollectionBundles?: number;
  blackPlanets?: Planet[];
  supernovaCollectionUnlocked?: boolean;
  supernovaCollectionBundles?: number;
  supernovaPlanets?: Planet[];
  stellaRossaCollectionUnlocked?: boolean;
  stellaRossaCollectionBundles?: number;
  stellaPlanets?: Planet[];
  redStarBalance?: number;
  onRedStarBalanceUpdate?: (newBalance: number) => void;
  onPlaceWhitePlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectWhitePlanet?: (planetId: string) => void;
  onReactivateWhitePlanet?: (planetId: string) => { ok: boolean; reason?: string };
  onMarkWhitePlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceEarthPlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectEarthPlanet?: (planetId: string) => void;
  onReactivateEarthPlanet?: (planetId: string) => { ok: boolean; reason?: string };
  onMarkEarthPlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceBlackPlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectBlackPlanet?: (planetId: string) => void;
  onReactivateBlackPlanet?: (planetId: string) => { ok: boolean; reason?: string };
  onMarkBlackPlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceSupernovaPlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectSupernovaPlanet?: (planetId: string) => void;
  onReactivateSupernovaPlanet?: (planetId: string) => { ok: boolean; reason?: string };
  onMarkSupernovaPlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceStellaRossaPlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectStellaRossaPlanet?: (planetId: string) => void;
  onMarkStellaRossaPlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  onUpgradeCollectionDuration?: (collectionType: "white" | "earth" | "black" | "supernova" | "stella_rossa", hours: number) => Promise<{ ok: boolean; error?: string }>;
  /** False when another tab is active — releases Farm WebGL contexts for Lab. */
  visible?: boolean;
}

interface SellPopup {
  planetId: string;
  planetName: string;
  planetColor: string;
}


export function FarmPage({
  planets, sun, sunCount, balance, maxSlots, defectPlanets, telegramId,
  onCollect, onBurn, onStartFarming, onStopFarming, onStartSunFarming, onStopSunFarming, onBurnSun,
  onSell, onUnlist, onRepair, stardustBalance = 0, onRename,
  items: _items = [], onSellItem: _onSellItem, onUnlistItem: _onUnlistItem, onFlushPlanets, tonBalance = 0,
  onUpgradeDuration, onUpgradeSunDuration,
  whiteCollectionUnlocked = false,
  whiteCollectionBundles = 0,
  whitePlanets = [],
  earthCollectionUnlocked = false,
  earthCollectionBundles = 0,
  earthPlanets = [],
  blackCollectionUnlocked = false,
  blackCollectionBundles = 0,
  blackPlanets = [],
  supernovaCollectionUnlocked = false,
  supernovaCollectionBundles = 0,
  supernovaPlanets = [],
  stellaRossaCollectionUnlocked = false,
  stellaRossaCollectionBundles = 0,
  stellaPlanets = [],
  redStarBalance = 0,
  onRedStarBalanceUpdate,
  onPlaceWhitePlanet,
  onCollectWhitePlanet,
  onReactivateWhitePlanet,
  onMarkWhitePlanetReactivated,
  onPlaceEarthPlanet,
  onCollectEarthPlanet,
  onReactivateEarthPlanet,
  onMarkEarthPlanetReactivated,
  onPlaceBlackPlanet,
  onCollectBlackPlanet,
  onReactivateBlackPlanet,
  onMarkBlackPlanetReactivated,
  onPlaceSupernovaPlanet,
  onCollectSupernovaPlanet,
  onReactivateSupernovaPlanet,
  onMarkSupernovaPlanetReactivated,
  onPlaceStellaRossaPlanet,
  onCollectStellaRossaPlanet,
  onMarkStellaRossaPlanetReactivated,
  onUpgradeCollectionDuration,
  visible = true,
}: FarmPageProps) {
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
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [stakingOpen, setStakingOpen] = useState(false);
  // Timeout id for the COLLECTION toast — kept in a ref so repeated
  // taps reset the auto-dismiss timer instead of firing stale clears.
  const comingSoonTimeoutRef = useRef<number | null>(null);
  const [renamePlanet, setRenamePlanet] = useState<Planet | null>(null);
  const [pvpPlanet, setPvPPlanet] = useState<Planet | null>(null);
  const [detailPlanet, setDetailPlanet] = useState<Planet | null>(null);
  const [sunDetailOpen, setSunDetailOpen] = useState(false);
  const handleComboClaimed = useCallback((newRedStarBalance: number) => {
    // Snap the local redStar balance to the server-confirmed value immediately
    // so the UI reflects the combo reward without waiting for the next sync.
    window.dispatchEvent(new CustomEvent("zoom-server-redstar-snap", {
      detail: { redStarBalance: newRedStarBalance },
    }));
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  void _items;
  void _onSellItem;
  void _onUnlistItem;

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
    // Suggested price in TON: cap between 0.25 and 10.0
    const suggested = Math.min(10.0, Math.max(0.25, +(planet.craftCost * 0.01).toFixed(2)));
    setSellPopup({ planetId: planet.id, planetName: cfg?.label ?? planet.name, planetColor: planet.color });
    setSellPrice(String(suggested));
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const confirmSell = () => {
    if (!sellPopup) return;
    const price = parseFloat(sellPrice);
    if (!price || price <= 0) return;
    // Price cap enforcement client-side: 0.25 – 10.0 TON
    if (price < 0.25 || price > 10.0) {
      setDefectMsg(t("farm.priceRangeError"));
      setTimeout(() => setDefectMsg(null), 3000);
      return;
    }
    onSell(sellPopup.planetId, price);
    setSellPopup(null);
    setSellPrice("");
  };

  const cancelSell = () => {
    setSellPopup(null);
    setSellPrice("");
  };

  const handleSunStartOrReactivate = () => {
    const res = onStartSunFarming();
    if (!res.ok) {
      setDefectMsg(res.reason ?? t("farm.cannotStartSun"));
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
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        {/* Row 1: title + slots subtitle on the left, live +ZOOM/hr
            chip on the right. The previous layout crammed STAKING,
            COLLECTION and the rate chip together which forced "My
            Planets" to wrap. We now hoist the two teaser buttons to
            their own row underneath so all three pills sit cleanly
            on a single line at every viewport width. */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-black text-lg tracking-tight">{t("farm.myPlanets")}</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              {totalRate > 0
                ? `${planets.length}/${maxSlots} ${t("farm.slots") || "slots"}`
                : `${planets.length}/${maxSlots} · ${t("farm.noActive")}`}
            </p>
          </div>
          {totalRate > 0 && (
            <div
              className="glass-neon px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
              style={{ color: "#9EC5E8", textShadow: "0 0 10px rgba(158,197,232,0.45)" }}
              data-testid="total-farm-rate"
            >
              +{Math.floor(totalRate).toLocaleString()}/hr
            </div>
          )}
        </div>

        {/* Row 2: STAKING + COLLECTION pills */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* STAKING teaser button — sits to the left of COLLECTION.
              Same disabled "coming soon" pattern: greyscale + reduced
              opacity, click shows a transient neutral toast, never
              navigates or mutates state. */}
          <button
            type="button"
            onClick={() => setStakingOpen((v) => !v)}
            aria-label="GRAM staking"
            aria-pressed={stakingOpen}
            data-testid="btn-staking"
            className="px-3 py-1.5 rounded-full text-xs font-black tracking-wide"
            style={{
              background: stakingOpen
                ? "linear-gradient(135deg, rgba(255,215,64,0.22) 0%, rgba(255,179,0,0.16) 100%)"
                : "linear-gradient(135deg, rgba(120,140,180,0.18) 0%, rgba(60,72,96,0.14) 100%)",
              border: stakingOpen ? "1px solid rgba(255,215,64,0.45)" : "1px solid rgba(180,200,230,0.22)",
              color: stakingOpen ? "#ffd740" : "rgba(220,230,245,0.85)",
              filter: stakingOpen ? "none" : "grayscale(0.35)",
              opacity: stakingOpen ? 1 : 0.85,
              cursor: "pointer",
              letterSpacing: 0.5,
              boxShadow: stakingOpen ? "0 0 14px rgba(255,215,64,0.22)" : "none",
            }}
          >
            STAKING
          </button>
          {/* COLLECTION teaser button.
              Visually disabled (greyscale + reduced opacity) to signal
              "coming soon" without removing it from the layout. Click
              shows a transient neutral toast — never navigates, never
              mutates state. Brand-safe English copy. */}
          <button
            type="button"
            onClick={() => setCollectionOpen((v) => !v)}
            aria-label="Collection farms"
            aria-pressed={collectionOpen}
            data-testid="btn-collection"
            className="px-3 py-1.5 rounded-full text-xs font-black tracking-wide"
            style={{
              background: collectionOpen
                ? "linear-gradient(135deg, rgba(15,217,255,0.22) 0%, rgba(192,96,255,0.18) 100%)"
                : "linear-gradient(135deg, rgba(120,140,180,0.18) 0%, rgba(60,72,96,0.14) 100%)",
              border: collectionOpen ? "1px solid rgba(15,217,255,0.45)" : "1px solid rgba(180,200,230,0.22)",
              color: collectionOpen ? "#0fd9ff" : "rgba(220,230,245,0.85)",
              filter: collectionOpen ? "none" : "grayscale(0.35)",
              opacity: collectionOpen ? 1 : 0.85,
              cursor: "pointer",
              letterSpacing: 0.5,
              boxShadow: collectionOpen ? "0 0 14px rgba(15,217,255,0.22)" : "none",
            }}
          >
            COLLECTION
          </button>
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

          <DailyComboBox
            telegramId={telegramId}
            planets={planets}
            onClaimed={handleComboClaimed}
            active={visible}
          />

          {collectionOpen && (
            <PixelAvatar
              headless
              inline
              onClose={() => setCollectionOpen(false)}
              whitePlanets={whitePlanets}
              whiteCollectionUnlocked={whiteCollectionUnlocked}
              whiteCollectionBundles={whiteCollectionBundles}
              earthPlanets={earthPlanets}
              earthCollectionUnlocked={earthCollectionUnlocked}
              earthCollectionBundles={earthCollectionBundles}
              blackPlanets={blackPlanets}
              blackCollectionUnlocked={blackCollectionUnlocked}
              blackCollectionBundles={blackCollectionBundles}
              supernovaPlanets={supernovaPlanets}
              supernovaCollectionUnlocked={supernovaCollectionUnlocked}
              supernovaCollectionBundles={supernovaCollectionBundles}
              stellaPlanets={stellaPlanets}
              stellaRossaCollectionUnlocked={stellaRossaCollectionUnlocked}
              stellaRossaCollectionBundles={stellaRossaCollectionBundles}
              sunCount={sunCount ?? 0}
              tonBalance={tonBalance}
              telegramId={telegramId}
              onPlaceWhitePlanet={onPlaceWhitePlanet}
              onCollectWhitePlanet={onCollectWhitePlanet}
              onReactivateWhitePlanet={onReactivateWhitePlanet}
              onMarkWhitePlanetReactivated={onMarkWhitePlanetReactivated}
              onPlaceEarthPlanet={onPlaceEarthPlanet}
              onCollectEarthPlanet={onCollectEarthPlanet}
              onReactivateEarthPlanet={onReactivateEarthPlanet}
              onMarkEarthPlanetReactivated={onMarkEarthPlanetReactivated}
              onPlaceBlackPlanet={onPlaceBlackPlanet}
              onCollectBlackPlanet={onCollectBlackPlanet}
              onReactivateBlackPlanet={onReactivateBlackPlanet}
              onMarkBlackPlanetReactivated={onMarkBlackPlanetReactivated}
              onPlaceSupernovaPlanet={onPlaceSupernovaPlanet}
              onCollectSupernovaPlanet={onCollectSupernovaPlanet}
              onReactivateSupernovaPlanet={onReactivateSupernovaPlanet}
              onMarkSupernovaPlanetReactivated={onMarkSupernovaPlanetReactivated}
              onPlaceStellaRossaPlanet={onPlaceStellaRossaPlanet}
              onCollectStellaRossaPlanet={onCollectStellaRossaPlanet}
              onMarkStellaRossaPlanetReactivated={onMarkStellaRossaPlanetReactivated}
              redStarBalance={redStarBalance}
              onRedStarBalanceUpdate={onRedStarBalanceUpdate}
              onUpgradeCollectionDuration={onUpgradeCollectionDuration}
            />
          )}

          {stakingOpen && (
            <StakingWidget
              telegramId={telegramId}
              planets={planets}
              sunCountClient={Math.max(sunCount ?? 0, sun?.isOwned ? 1 : 0)}
              sunFarmStartedAtClient={sun?.farmStartedAt ?? 0}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
          {sun?.isOwned && sun && (
            <SunFarmInventoryCard
              sun={sun}
              sunMultiplier={sunMultiplier}
              suspendGl={!!detailPlanet || !!sunDetailOpen || !visible}
              onCardClick={() => setSunDetailOpen(true)}
              onStartFarm={handleSunStartOrReactivate}
            />
          )}
          {planets.filter((p) => !p.isListedInMarket && !isLegacyCatalogModelPlanet(p)).map((planet, index) => {
            const isListed = planet.isListedInMarket;

            const handleStartOrReactivate = () => {
              if (isListed) return;
              const res = onStartFarming(planet.id);
              if (!res.ok) {
                setDefectMsg(res.reason ?? t("farm.cannotStartFarming"));
                setTimeout(() => setDefectMsg(null), 1800);
              }
            };

            return (
              <FarmInventoryCard
                key={planet.id}
                planet={planet}
                variant="grid"
                suspendGl={!!detailPlanet || !visible}
                eagerThumb={visible && index < 6}
                glDelayMs={visible && index < 6 ? 0 : Math.min(Math.max(0, index - 6), 8) * 50}
                testId={`planet-card-${planet.id}`}
                onCardClick={() => setDetailPlanet(planet)}
                onStartFarm={handleStartOrReactivate}
                onUnlist={() => onUnlist(planet.id)}
                onRename={telegramId && !isListed ? () => setRenamePlanet(planet) : undefined}
              />
            );
          })}
          </div>{/* end 2-col grid */}

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
            style={{ borderColor: "rgba(255,215,0,0.22)", background: "rgba(255,215,0,0.025)", cursor: "pointer", minHeight: 100, userSelect: "none" }}
            data-testid="slot-locked"
            onClick={() => setSlotWalletOpen(true)}
          >
            <div style={{ fontSize: 20, opacity: 0.6 }}>🔒</div>
            <div className="font-bold text-xs tracking-widest uppercase" style={{ color: "rgba(255,215,0,0.65)" }}>0.25 GRAM</div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>to unlock slot</div>
          </div>

        {planets.length === 0 && !sun?.isOwned && (
          <div className="text-center text-xs py-4" style={{ color: "rgba(255,255,255,0.22)" }}>
            Forge your first planet in the Lab
          </div>
        )}

        </div>
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
              {t("farm.sellPriceHint")}
            </div>
            <div className="relative mb-2">
              <input
                ref={inputRef}
                type="number"
                min={0.25}
                max={10.0}
                step={0.01}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full rounded-xl px-4 py-4 text-xl font-black pr-20 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${sellPopup.planetColor}44`, color: "white", caretColor: sellPopup.planetColor }}
                placeholder={t("farm.enterPrice")}
                inputMode="decimal"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
                GRAM
              </span>
            </div>
            {sellPrice && parseFloat(sellPrice) > 0 && (
              <div className="text-xs mb-4 px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                {t("farm.netReceive", { n: ((parseFloat(sellPrice) || 0) * 0.9).toFixed(3) })}
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
                disabled={!sellPrice || parseFloat(sellPrice) <= 0}
                style={{
                  background: (!sellPrice || parseFloat(sellPrice) <= 0) ? "rgba(255,255,255,0.05)" : `linear-gradient(135deg, ${sellPopup.planetColor}cc, ${sellPopup.planetColor}88)`,
                  color: (!sellPrice || parseFloat(sellPrice) <= 0) ? "rgba(255,255,255,0.2)" : "#060810",
                  boxShadow: (!sellPrice || parseFloat(sellPrice) <= 0) ? "none" : `0 0 20px ${sellPopup.planetColor}40`,
                }}
                onClick={confirmSell}
                data-testid="btn-confirm-sell"
              >
                List for {sellPrice ? parseFloat(sellPrice).toFixed(3) : "—"} GRAM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUN WALLET POPUP */}
      {sun && (
        <WalletPopup
          isOpen={sunWalletOpen}
          amount={`${sun.activationCost} GRAM`}
          purpose="Activate THE SUN"
          onClose={() => setSunWalletOpen(false)}
        />
      )}
      <WalletPopup
        isOpen={slotWalletOpen}
        amount="0.25 GRAM"
        purpose="Unlock Farm Slot"
        instruction="Send GRAM to this address to unlock your slot."
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
      {/* PvP active badge — always English, visible to everyone while in queue/match */}
      {pvpPlanet && (
        <div
          style={{
            position: "fixed",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 16px",
            borderRadius: 20,
            background: "linear-gradient(90deg, rgba(14,22,36,0.94), rgba(20,32,48,0.94))",
            border: "1px solid rgba(158,197,232,0.45)",
            boxShadow: "0 0 18px rgba(158,197,232,0.35)",
            animation: "pvp-fighter-pulse 1.4s ease-in-out infinite",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: 14 }}>⚔️</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: "#9EC5E8", letterSpacing: 1.5, textTransform: "uppercase" }}>
            {t("farm.pvpActive")}
          </span>
          <span style={{ fontSize: 14 }}>⚔️</span>
          <style>{`
            @keyframes pvp-fighter-pulse {
              0%,100% { box-shadow: 0 0 14px rgba(158,197,232,0.35); }
              50%      { box-shadow: 0 0 28px rgba(158,197,232,0.55); }
            }
          `}</style>
        </div>
      )}
      {pvpPlanet && telegramId && (
        <PvPModal
          open={!!pvpPlanet}
          onClose={() => setPvPPlanet(null)}
          telegramId={telegramId}
          planet={pvpPlanet}
          onPlanetTransferred={() => {
            window.dispatchEvent(new Event("planets-refresh"));
          }}
          onBeforeQueue={onFlushPlanets}
        />
      )}
      {detailPlanet && (
        <PlanetDetailModal
          planet={detailPlanet}
          telegramId={telegramId}
          stardustBalance={stardustBalance}
          tonBalance={tonBalance}
          planets={planets}
          maxSlots={maxSlots}
          onClose={() => setDetailPlanet(null)}
          onStartFarming={(id) => onStartFarming(id)}
          onPvP={(p) => { setDetailPlanet(null); setPvPPlanet(p); }}
          onSell={(p) => { setDetailPlanet(null); openSellPopup(p); }}
          onBurn={onBurn}
          onUnlist={(id: string) => onUnlist(id)}
          onRepair={onRepair
            ? (id: string) => {
                const r = onRepair(id);
                if (!r.ok) { setDefectMsg(r.reason ?? "Repair failed"); setTimeout(() => setDefectMsg(null), 1800); }
                return r;
              }
            : undefined}
          onUpgradeDuration={onUpgradeDuration}
        />
      )}
      {sunDetailOpen && sun?.isOwned && sun && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(6,8,16,0.92)" }}
          onClick={(e) => e.target === e.currentTarget && setSunDetailOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl px-5 pt-5 pb-8"
            style={{
              background: "linear-gradient(180deg, rgba(255,238,88,0.12) 0%, rgba(8,10,18,0.98) 32%)",
              border: "1px solid rgba(255,238,88,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,238,88,0.55)" }}>
                  EXCLUSIVE
                </div>
                <div className="font-black text-xl" style={{ color: "#ffee58" }}>
                  THE SUN{sunMultiplier > 1 ? ` ×${sunMultiplier}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSunDetailOpen(false)}
                className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                Close
              </button>
            </div>

            <div className="mb-4 flex flex-col items-center gap-3">
              <SunFarmThumb size={120} animate suspendGl={false} />
              <div className="text-center text-xs font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
                +{(SUN_CONFIG.rate * sunMultiplier).toLocaleString()} $ZOOM/hr · {sun.farmDurationHours ?? 1}h cycle
              </div>
              <button
                type="button"
                className="w-full max-w-xs py-3 rounded-xl text-xs font-black"
                style={{
                  background: "linear-gradient(135deg, #ffee58, #ffb300)",
                  color: "#1a1000",
                }}
                onClick={handleSunStartOrReactivate}
              >
                {isSunActive(sun) ? "FARMING ACTIVE" : "START / REACTIVATE"}
              </button>
            </div>

            {onUpgradeSunDuration && (
              <div className="farm-panel-3d">
                <div className="farm-panel-3d__title">
                  ⏱ CYCLE DURATION — {sun.farmDurationHours ?? 1}h · costs EARNED GRAM
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                  {FARM_UPGRADE_TIERS.map((h) => {
                    const cost = FARM_UPGRADE_COSTS[h]!;
                    const isCurrent = (sun.farmDurationHours ?? 1) === h;
                    const canAfford = tonBalance >= cost;
                    const tierDisabled = isCurrent || !canAfford;
                    return (
                      <button
                        key={h}
                        type="button"
                        disabled={tierDisabled}
                        onClick={async () => {
                          const result = await onUpgradeSunDuration(h);
                          if (!result.ok) {
                            setDefectMsg(result.error ?? "Upgrade failed");
                            setTimeout(() => setDefectMsg(null), 2000);
                          }
                        }}
                        className={`farm-btn-3d farm-btn-3d--tier${isCurrent ? " farm-btn-3d--current" : ""}${tierDisabled && !isCurrent ? " farm-btn-3d--disabled" : ""}`}
                      >
                        <div>{h}h</div>
                        {!isCurrent && <div>{cost} G</div>}
                        {isCurrent && <div>✓</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
