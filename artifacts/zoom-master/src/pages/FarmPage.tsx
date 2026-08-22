import { useState, useRef } from "react";
import type { CollectibleItem } from "../utils/collectibleConfig";
import { FarmInventoryCard } from "../components/FarmInventoryCard";
import { PlanetDetailModal } from "../components/PlanetDetailModal";
import type { Planet, SunState } from "../hooks/useGameState";
import { PLANET_CONFIG, isFarmActive } from "../hooks/useGameState";
import { buyShopItemFromDeposit } from "../utils/api";
import { useT } from "../i18n/LanguageContext";
import { PlanetRenameModal } from "../components/PlanetRenameModal";
import PvPModal from "../components/PvPModal";
import { getPlanetDisplayName } from "../utils/planetNames";
import { isLabForgeGeneratorPlanet, MARKET_PRICE_BOUNDS, marketPriceLabel, suggestMarketPrice, isMarketPriceInRange, type MarketPriceCurrency } from "@workspace/game-models";

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
  onSell: (id: string, price: number, currency?: "gram" | "zoom" | "stardust") => void;
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
  depositBalance?: number;
  onSlotUnlocked?: () => void;
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
  rate: number;
}


export function FarmPage({
  planets, sun, sunCount, balance, maxSlots, defectPlanets, telegramId,
  onCollect, onBurn, onStartFarming, onStopFarming, onStartSunFarming, onStopSunFarming, onBurnSun,
  onSell, onUnlist, onRepair, stardustBalance = 0, onRename,
  items: _items = [], onSellItem: _onSellItem, onUnlistItem: _onUnlistItem, onFlushPlanets, tonBalance = 0,
  onUpgradeDuration, onUpgradeSunDuration,
  depositBalance = 0,
  onSlotUnlocked,
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
  void whiteCollectionUnlocked;
  void whiteCollectionBundles;
  void whitePlanets;
  void earthCollectionUnlocked;
  void earthCollectionBundles;
  void earthPlanets;
  void blackCollectionUnlocked;
  void blackCollectionBundles;
  void blackPlanets;
  void supernovaCollectionUnlocked;
  void supernovaCollectionBundles;
  void supernovaPlanets;
  void stellaRossaCollectionUnlocked;
  void stellaRossaCollectionBundles;
  void stellaPlanets;
  void onPlaceWhitePlanet;
  void onCollectWhitePlanet;
  void onReactivateWhitePlanet;
  void onMarkWhitePlanetReactivated;
  void onPlaceEarthPlanet;
  void onCollectEarthPlanet;
  void onReactivateEarthPlanet;
  void onMarkEarthPlanetReactivated;
  void onPlaceBlackPlanet;
  void onCollectBlackPlanet;
  void onReactivateBlackPlanet;
  void onMarkBlackPlanetReactivated;
  void onPlaceSupernovaPlanet;
  void onCollectSupernovaPlanet;
  void onReactivateSupernovaPlanet;
  void onMarkSupernovaPlanetReactivated;
  void onPlaceStellaRossaPlanet;
  void onCollectStellaRossaPlanet;
  void onMarkStellaRossaPlanetReactivated;
  void onUpgradeCollectionDuration;
  void redStarBalance;
  void onRedStarBalanceUpdate;
  const { t } = useT();
  // Lab economy — only ZOOM / Stardust generators in Farm (no spheres, no SUN).
  const labPlanets = planets.filter(isLabForgeGeneratorPlanet);
  const farmGenerators = labPlanets.filter((p) => !p.isListedInMarket);
  void sun;
  void sunCount;
  void onStartSunFarming;
  void onStopSunFarming;
  void onBurnSun;
  void onUpgradeSunDuration;
  const [confirmBurn, setConfirmBurn] = useState<string | null>(null);
  const [sellPopup, setSellPopup] = useState<SellPopup | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [sellCurrency, setSellCurrency] = useState<MarketPriceCurrency>("gram");
  const [slotBuying, setSlotBuying] = useState(false);
  const [defectMsg, setDefectMsg] = useState<string | null>(null);
  const [renamePlanet, setRenamePlanet] = useState<Planet | null>(null);
  const [pvpPlanet, setPvPPlanet] = useState<Planet | null>(null);
  const [detailPlanet, setDetailPlanet] = useState<Planet | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  void _items;
  void _onSellItem;
  void _onUnlistItem;

  // Daily-collect removed — planets now farm autonomously for the full 24h
  // cycle and then need a $ZOOM reactivation, with no manual collect step.
  // `onCollect` prop is retained for legacy compatibility but never invoked.
  void onCollect;

  const totalRate = farmGenerators.filter(isFarmActive).reduce((a, p) => a + p.rate, 0);

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
    const suggested = suggestMarketPrice(planet.rate, "gram");
    setSellCurrency("gram");
    setSellPopup({ planetId: planet.id, planetName: cfg?.label ?? planet.name, planetColor: planet.color, rate: planet.rate });
    setSellPrice(String(suggested));
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const confirmSell = () => {
    if (!sellPopup) return;
    const price = parseFloat(sellPrice);
    if (!price || price <= 0) return;
    if (!isMarketPriceInRange(price, sellCurrency)) {
      const b = MARKET_PRICE_BOUNDS[sellCurrency];
      setDefectMsg(`Price must be ${b.min}–${b.max} ${marketPriceLabel(sellCurrency)}`);
      setTimeout(() => setDefectMsg(null), 3000);
      return;
    }
    onSell(sellPopup.planetId, price, sellCurrency);
    setSellPopup(null);
    setSellPrice("");
  };

  const cancelSell = () => {
    setSellPopup(null);
    setSellPrice("");
  };


  // Keep the detail sheet in sync with the live planets array — `detailPlanet`
  // is a snapshot from the moment the user tapped the card.
  const liveDetailPlanet = detailPlanet
    ? planets.find((p) => p.id === detailPlanet.id) ?? detailPlanet
    : null;

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
                ? `${farmGenerators.length}/${maxSlots} ${t("farm.slots") || "slots"}`
                : `${farmGenerators.length}/${maxSlots} · ${t("farm.noActive")}`}
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

        {/* Row 2: STAKING + COLLECTION pills (coming soon) */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button
            type="button"
            aria-disabled="true"
            aria-label={`${t("farm.staking")} — ${t("shop.comingSoon")}`}
            data-testid="btn-staking"
            className="px-3 py-1.5 rounded-full text-xs font-black tracking-wide"
            style={{
              background: "linear-gradient(135deg, rgba(120,140,180,0.18) 0%, rgba(60,72,96,0.14) 100%)",
              border: "1px solid rgba(180,200,230,0.22)",
              color: "rgba(220,230,245,0.85)",
              filter: "grayscale(0.35)",
              opacity: 0.85,
              cursor: "default",
              letterSpacing: 0.5,
            }}
          >
            <span className="flex flex-col items-center leading-tight gap-0.5">
              <span>{t("farm.staking")}</span>
              <span className="text-[9px] font-bold tracking-wide opacity-55 uppercase">{t("shop.comingSoon")}</span>
            </span>
          </button>
          <button
            type="button"
            aria-disabled="true"
            aria-label={`${t("farm.collection")} — ${t("shop.comingSoon")}`}
            data-testid="btn-collection"
            className="px-3 py-1.5 rounded-full text-xs font-black tracking-wide"
            style={{
              background: "linear-gradient(135deg, rgba(120,140,180,0.18) 0%, rgba(60,72,96,0.14) 100%)",
              border: "1px solid rgba(180,200,230,0.22)",
              color: "rgba(220,230,245,0.85)",
              filter: "grayscale(0.35)",
              opacity: 0.85,
              cursor: "default",
              letterSpacing: 0.5,
            }}
          >
            <span className="flex flex-col items-center leading-tight gap-0.5">
              <span>{t("farm.collection")}</span>
              <span className="text-[9px] font-bold tracking-wide opacity-55 uppercase">{t("shop.comingSoon")}</span>
            </span>
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

          <div className="grid grid-cols-2 gap-3">
          {farmGenerators.map((planet) => {
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
                suspendGl={!!detailPlanet}
                eagerThumb
                glDelayMs={0}
                testId={`planet-card-${planet.id}`}
                onCardClick={() => setDetailPlanet(planet)}
                onStartFarm={handleStartOrReactivate}
                onUnlist={() => onUnlist(planet.id)}
                onRename={telegramId && !isListed ? () => setRenamePlanet(planet) : undefined}
              />
            );
          })}
          {Array.from({ length: Math.max(0, maxSlots - farmGenerators.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="farm-inventory-card"
              style={{
                minHeight: 308,
                borderRadius: 16,
                border: "1.5px solid rgba(158,197,232,0.22)",
                background: "#08080c",
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
              data-testid={`slot-empty-${i}`}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 188,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(180deg, rgba(158,197,232,0.16) 0%, rgba(158,197,232,0.04) 55%, #08080c 100%)",
                }}
              >
                <div style={{ fontSize: 44, fontWeight: 200, color: "rgba(255,255,255,0.32)", lineHeight: 1 }}>+</div>
              </div>
            </div>
          ))}
          <div
            className="farm-inventory-card"
            style={{
              minHeight: 308,
              borderRadius: 16,
              border: "1.5px solid rgba(255,215,0,0.38)",
              background: "#08080c",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              cursor: slotBuying ? "wait" : "pointer",
              userSelect: "none",
              opacity: slotBuying ? 0.7 : 1,
            }}
            data-testid="slot-locked"
            onClick={async () => {
              if (slotBuying) return;
              if (!telegramId) {
                setDefectMsg("Open from Telegram to unlock");
                setTimeout(() => setDefectMsg(null), 2500);
                return;
              }
              if (depositBalance + tonBalance < 0.25) {
                setDefectMsg("Need 0.25 GRAM");
                setTimeout(() => setDefectMsg(null), 2500);
                return;
              }
              setSlotBuying(true);
              const res = await buyShopItemFromDeposit(telegramId, "extra_slot");
              setSlotBuying(false);
              if (res.ok) {
                onSlotUnlocked?.();
                window.dispatchEvent(new Event("zoom-data-refresh"));
              } else {
                setDefectMsg(res.error || "Unlock failed");
                setTimeout(() => setDefectMsg(null), 2800);
              }
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 188,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(180deg, rgba(255,215,0,0.18) 0%, rgba(255,215,0,0.05) 55%, #08080c 100%)",
              }}
            >
              <div style={{ fontSize: 44, fontWeight: 200, color: "rgba(255,215,0,0.85)", lineHeight: 1 }}>+</div>
            </div>
          </div>
          </div>{/* end 2-col grid */}

        {farmGenerators.length === 0 && (
          <div className="text-center text-xs py-4" style={{ color: "rgba(255,255,255,0.22)" }}>
            Forge a $ZOOM or ★ Stardust model in the Lab
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
            <div className="flex items-center gap-3 mb-4">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: sellPopup.planetColor, boxShadow: `0 0 10px ${sellPopup.planetColor}` }} />
              <div className="font-black text-base" style={{ color: sellPopup.planetColor }}>
                List {sellPopup.planetName}
              </div>
            </div>
            <div className="flex gap-2 mb-4">
              {(["gram", "zoom", "stardust"] as const).map((c) => {
                const active = sellCurrency === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setSellCurrency(c);
                      setSellPrice(String(suggestMarketPrice(sellPopup.rate, c)));
                    }}
                    className="flex-1 py-2 rounded-xl text-[11px] font-black tracking-wider"
                    style={{
                      background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                      color: active ? "#fff" : "rgba(255,255,255,0.4)",
                      border: active ? `1px solid ${sellPopup.planetColor}88` : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {marketPriceLabel(c)}
                  </button>
                );
              })}
            </div>
            <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
              Min {MARKET_PRICE_BOUNDS[sellCurrency].min} – max {MARKET_PRICE_BOUNDS[sellCurrency].max} {marketPriceLabel(sellCurrency)} · 10% fee
            </div>
            <div className="relative mb-2">
              <input
                ref={inputRef}
                type="number"
                min={MARKET_PRICE_BOUNDS[sellCurrency].min}
                max={MARKET_PRICE_BOUNDS[sellCurrency].max}
                step={MARKET_PRICE_BOUNDS[sellCurrency].step}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full rounded-xl px-4 py-4 text-xl font-black pr-24 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${sellPopup.planetColor}44`, color: "white", caretColor: sellPopup.planetColor }}
                placeholder={t("farm.enterPrice")}
                inputMode="decimal"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
                {marketPriceLabel(sellCurrency)}
              </span>
            </div>
            {sellPrice && parseFloat(sellPrice) > 0 && (
              <div className="text-xs mb-4 px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                You receive ~{(parseFloat(sellPrice) * 0.9).toFixed(sellCurrency === "gram" ? 3 : 1)} {marketPriceLabel(sellCurrency)}
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
                List for {sellPrice ? parseFloat(sellPrice) : "—"} {marketPriceLabel(sellCurrency)}
              </button>
            </div>
          </div>
        </div>
      )}

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
      {liveDetailPlanet && (
        <PlanetDetailModal
          planet={liveDetailPlanet}
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
    </div>
  );
}
