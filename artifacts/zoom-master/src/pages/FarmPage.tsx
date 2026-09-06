import { useState, useRef, useEffect, type ReactNode } from "react";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import type { CollectibleItem } from "../utils/collectibleConfig";
import { FarmInventoryCard } from "../components/FarmInventoryCard";
import { PlanetDetailModal } from "../components/PlanetDetailModal";
import { ZoomCubeIcon } from "../components/ZoomCubeIcon";
import { WalletStarIcon } from "../components/WalletStarIcon";
import type { Planet, SunState } from "../hooks/useGameState";
import { getPlanetDisplayColors, isFarmActive, getPlanetFarmDurationHours } from "../hooks/useGameState";
import { payShopItemWithZmc, syncActiveFarms } from "../utils/api";
import { useT } from "../i18n/LanguageContext";
import { getPlanetDisplayName } from "../utils/planetNames";
import { isLabForgeGeneratorPlanet, isLabStardustFarmPlanet, labForgeShapeHasGlbReveal, labMarketPathForPlanet, resolveLabShapeIdFromPlanet, MARKET_PRICE_BOUNDS, suggestMarketPrice, isMarketPriceInRange } from "@workspace/game-models";
import { preloadLabGlbBatch } from "../utils/labGlbCache";
import { useZmcStatus } from "../hooks/useZmcStatus";
import { FARM_HOLD_ZMC, hasFarmHold } from "../utils/farmHold";
import { ZMC_STONFI_BUY, openExternalUrl } from "../utils/zmcToken";

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
  onStartFarming: (id: string, vipLevel?: "NONE" | "BASE" | "PRO") => { ok: boolean; reason?: string };
  onStopFarming: (id: string) => void;
  onStartSunFarming: () => { ok: boolean; reason?: string };
  onStopSunFarming: () => void;
  onBurnSun: () => void;
  onSell: (id: string, price: number, currency?: "zmc" | "gram" | "zoom" | "stardust", sellerWalletAddress?: string) => void;
  onUnlist: (id: string) => void;
  onRepair?: (id: string) => { ok: boolean; reason?: string };
  stardustBalance?: number;
  // Collectible items inventory.
  items?: CollectibleItem[];
  onSellItem?: (itemId: string, price: number) => void;
  onUnlistItem?: (itemId: string) => void;
  /** Flush pending planet save before entering PvP queue. */
  onFlushPlanets?: () => Promise<void>;
  /** User's current GRAM deposit balance. */
  tonBalance?: number;
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
  /** Jump to Market tab (real sell flow — replaces coming-soon teasers). */
  onOpenMarket?: () => void;
  /** Open Voxel Studio (create — the actual Zoom loop). */
  onOpenStudio?: () => void;
  /** False when another tab is active — releases Farm WebGL contexts for Lab. */
  visible?: boolean;
}

interface SellPopup {
  planetId: string;
  planetName: string;
  planetColor: string;
  rate: number;
}

function formatFarmHourRate(n: number, maxFrac: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
}

function FarmHourChip({
  testId,
  color,
  glow,
  icon,
  value,
}: {
  testId: string;
  color: string;
  glow: string;
  icon: ReactNode;
  value: string;
}) {
  return (
    <div
      className="glass-neon flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
      style={{
        color,
        textShadow: `0 0 10px ${glow}`,
        border: `1px solid ${glow}`,
        boxShadow: `0 0 12px ${glow}`,
      }}
      data-testid={testId}
    >
      {icon}
      <span style={{ fontVariantNumeric: "tabular-nums", letterSpacing: 0.2 }}>+{value}/hr</span>
    </div>
  );
}


export function FarmPage({
  planets, sun, sunCount, balance, maxSlots, defectPlanets, telegramId,
  onCollect, onBurn, onStartFarming, onStopFarming, onStartSunFarming, onStopSunFarming, onBurnSun,
  onSell, onUnlist, onRepair, stardustBalance = 0,
  items: _items = [], onSellItem: _onSellItem, onUnlistItem: _onUnlistItem, onFlushPlanets: _onFlushPlanets, tonBalance = 0,
  onUpgradeSunDuration,
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
  onOpenMarket,
  onOpenStudio,
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

  const farmGlbKey = farmGenerators.map((p) => p.id).join(",");
  useEffect(() => {
    const ids = [...new Set(
      farmGenerators
        .map((p) => resolveLabShapeIdFromPlanet(p) ?? p.shapeId)
        .filter((id): id is string => !!id && labForgeShapeHasGlbReveal(id)),
    )];
    if (ids.length > 0) void preloadLabGlbBatch(ids);
  }, [farmGlbKey]);

  useEffect(() => {
    if (!telegramId) return;
    const push = () => {
      const active = planets
        .filter((p) => isFarmActive(p) && !p.isListedInMarket && p.farmStartedAt > 0)
        .map((p) => ({
          id: p.id,
          type: p.name,
          farmDurationHours: getPlanetFarmDurationHours(p),
          farmStartedAt: p.farmStartedAt,
        }));
      if (active.length === 0) return;
      syncActiveFarms(telegramId, active);
    };
    push();
    const onVis = () => { if (!document.hidden) push(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [telegramId, farmGlbKey, planets]);
  void sun;
  void sunCount;
  void onStartSunFarming;
  void onStopSunFarming;
  void onBurnSun;
  void onUpgradeSunDuration;
  const [confirmBurn, setConfirmBurn] = useState<string | null>(null);
  const [sellPopup, setSellPopup] = useState<SellPopup | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [slotBuying, setSlotBuying] = useState(false);
  const [defectMsg, setDefectMsg] = useState<string | null>(null);
  const [detailPlanet, setDetailPlanet] = useState<Planet | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sellerWallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const { zmcBalance, connected, vipProPassActive } = useZmcStatus(telegramId);
  const farmRepairVip = vipProPassActive ? "PRO" as const : "NONE" as const;
  const farmHoldOk = hasFarmHold(zmcBalance);
  void _items;
  void _onSellItem;
  void _onUnlistItem;
  void _onFlushPlanets;

  // Daily-collect removed — planets now farm autonomously for the full 24h
  // cycle and then need a $ZOOM reactivation, with no manual collect step.
  // `onCollect` prop is retained for legacy compatibility but never invoked.
  void onCollect;

  const zoomRate = farmGenerators
    .filter((p) => isFarmActive(p) && labMarketPathForPlanet(p) !== "stardust")
    .reduce((a, p) => a + p.rate, 0);
  const stardustRate = farmGenerators
    .filter((p) => isFarmActive(p) && (isLabStardustFarmPlanet(p) || labMarketPathForPlanet(p) === "stardust"))
    .reduce((a, p) => a + p.rate, 0);
  const anyFarmActive = zoomRate > 0 || stardustRate > 0;

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
    const suggested = suggestMarketPrice(planet.rate, "zmc");
    const colors = getPlanetDisplayColors(planet);
    setSellPopup({
      planetId: planet.id,
      planetName: getPlanetDisplayName(planet),
      planetColor: colors.color,
      rate: planet.rate,
    });
    setSellPrice(String(suggested));
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const confirmSell = () => {
    if (!sellPopup) return;
    const price = parseFloat(sellPrice);
    if (!price || price <= 0) return;
    if (!isMarketPriceInRange(price, "zmc")) {
      const b = MARKET_PRICE_BOUNDS.zmc;
      setDefectMsg(`Price must be ${b.min}–${b.max.toLocaleString()} ZMC`);
      setTimeout(() => setDefectMsg(null), 3000);
      return;
    }
    if (!sellerWallet) {
      setDefectMsg("Connect TON wallet to list in ZMC");
      setTimeout(() => setDefectMsg(null), 3000);
      return;
    }
    onSell(sellPopup.planetId, price, "zmc", sellerWallet);
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
        {/* Row 1: title + rate. Shortcuts underneath jump to real features. */}
        <div className="flex items-center justify-between gap-3" data-tutorial="farm-board">
          <div className="min-w-0">
            <h2 className="font-black text-lg tracking-tight">{t("farm.myPlanets")}</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              {anyFarmActive
                ? `${farmGenerators.length}/${maxSlots} ${t("farm.slots") || "slots"}`
                : `${farmGenerators.length}/${maxSlots} · ${t("farm.noActive")}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <FarmHourChip
              testId="total-farm-rate"
              color="#9EC5E8"
              glow="rgba(158,197,232,0.35)"
              icon={<ZoomCubeIcon size={14} />}
              value={formatFarmHourRate(farmHoldOk ? zoomRate : 0, 1)}
            />
            <FarmHourChip
              testId="total-farm-stardust-rate"
              color="#ffd740"
              glow="rgba(255,215,64,0.32)"
              icon={<WalletStarIcon variant="stardust" size={14} />}
              value={formatFarmHourRate(farmHoldOk ? stardustRate : 0, 2)}
            />
          </div>
        </div>

        {/* Row 2: real actions — sell on Market, create in Studio */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button
            type="button"
            onClick={() => onOpenMarket?.()}
            aria-label={t("farm.openMarket")}
            data-testid="btn-open-market"
            className="px-3 py-1.5 rounded-full text-xs font-black tracking-wide"
            style={{
              background: "linear-gradient(135deg, rgba(158,197,232,0.22) 0%, rgba(60,72,96,0.16) 100%)",
              border: "1px solid rgba(158,197,232,0.35)",
              color: "#d7e8f8",
              letterSpacing: 0.5,
            }}
          >
            {t("farm.openMarket")}
          </button>
          <button
            type="button"
            onClick={() => onOpenStudio?.()}
            aria-label={t("farm.openStudio")}
            data-testid="btn-open-studio"
            className="px-3 py-1.5 rounded-full text-xs font-black tracking-wide"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(60,72,96,0.16) 100%)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#f4f7ff",
              letterSpacing: 0.5,
            }}
          >
            {t("farm.openStudio")}
          </button>
        </div>

        {!farmHoldOk && (
          <button
            type="button"
            onClick={() => openExternalUrl(ZMC_STONFI_BUY)}
            className="mt-3 w-full text-left rounded-xl px-3 py-2.5"
            style={{
              background: "rgba(255,215,64,0.08)",
              border: "1px solid rgba(255,215,64,0.28)",
            }}
          >
            <div className="text-xs font-black tracking-wide" style={{ color: "#ffd740" }}>
              {t("farm.holdTitle", { n: FARM_HOLD_ZMC.toLocaleString() })}
            </div>
            <div className="text-[10px] mt-0.5 font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>
              {t("farm.holdBody", { n: FARM_HOLD_ZMC.toLocaleString() })}
            </div>
            <div className="text-[10px] mt-1 font-black tracking-wider uppercase" style={{ color: "#ffd740" }}>
              {connected ? t("farm.holdCta") : t("farm.holdConnect")}
            </div>
          </button>
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

          <div className="lab-market__grid">
          {farmGenerators.map((planet, index) => {
            const isListed = planet.isListedInMarket;

            const handleStartOrReactivate = () => {
              if (isListed) return;
              const res = onStartFarming(planet.id, farmRepairVip);
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
                glDelayMs={0}
                suspendGl={liveDetailPlanet?.id === planet.id}
                testId={`planet-card-${planet.id}`}
                onCardClick={() => setDetailPlanet(planet)}
                onStartFarm={handleStartOrReactivate}
                onUnlist={() => onUnlist(planet.id)}
                vipLevel={farmRepairVip}
              />
            );
          })}
          {Array.from({ length: Math.max(0, maxSlots - farmGenerators.length) }).map((_, i) => (
            <article
              key={`empty-${i}`}
              className="lab-market-card lab-market-card--empty farm-inventory-card"
              style={{
                ["--mkt-accent" as string]: "#9ec5e8",
                ["--mkt-glow" as string]: "#9ec5e8",
                ["--mkt-accent-a" as string]: "rgba(158,197,232,0.12)",
              }}
              data-testid={`slot-empty-${i}`}
            >
              <div className="lab-market-card__stage">
                <div className="lab-market-card__plus" aria-hidden>+</div>
              </div>
            </article>
          ))}
          <article
            className="lab-market-card lab-market-card--locked farm-inventory-card"
            style={{
              ["--mkt-accent" as string]: "#ffd700",
              ["--mkt-glow" as string]: "#ffee58",
              ["--mkt-accent-a" as string]: "rgba(255,215,0,0.18)",
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
              if (!connected || !sellerWallet) {
                setDefectMsg("Connect TON wallet in Wallet to pay with ZMC");
                setTimeout(() => setDefectMsg(null), 2500);
                return;
              }
              if (zmcBalance < 25) {
                setDefectMsg("Need 25 ZMC");
                setTimeout(() => setDefectMsg(null), 2500);
                return;
              }
              setSlotBuying(true);
              try {
                const res = await payShopItemWithZmc({
                  telegramId,
                  itemId: "extra_slot",
                  walletAddress: sellerWallet,
                  sendTransaction: (tx) => tonConnectUI.sendTransaction(tx),
                });
                if (res.pending) {
                  setDefectMsg("Waiting for on-chain ZMC confirmation…");
                  setTimeout(() => setDefectMsg(null), 4000);
                  return;
                }
                if (res.ok) {
                  onSlotUnlocked?.();
                  window.dispatchEvent(new Event("zoom-data-refresh"));
                } else {
                  setDefectMsg(res.error || "Unlock failed");
                  setTimeout(() => setDefectMsg(null), 2800);
                }
              } catch (err) {
                setDefectMsg(err instanceof Error ? err.message : "TON Connect cancelled");
                setTimeout(() => setDefectMsg(null), 2800);
              } finally {
                setSlotBuying(false);
              }
            }}
          >
            <div className="lab-market-card__stage">
              <div className="lab-market-card__plus" aria-hidden>+</div>
            </div>
          </article>
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
            <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
              Price in ZMC · 5% fee to treasury (you receive 95%)
            </div>
            <div className="relative mb-2">
              <input
                ref={inputRef}
                type="number"
                min={MARKET_PRICE_BOUNDS.zmc.min}
                max={MARKET_PRICE_BOUNDS.zmc.max}
                step={MARKET_PRICE_BOUNDS.zmc.step}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full rounded-xl px-4 py-4 text-xl font-black pr-24 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${sellPopup.planetColor}44`, color: "white", caretColor: sellPopup.planetColor }}
                placeholder={t("farm.enterPrice")}
                inputMode="decimal"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
                ZMC
              </span>
            </div>
            {sellPrice && parseFloat(sellPrice) > 0 && (
              <div className="text-xs mb-4 px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                You receive ~{Math.round(parseFloat(sellPrice) * 0.95).toLocaleString()} ZMC
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
                List for {sellPrice ? parseFloat(sellPrice).toLocaleString() : "—"} ZMC
              </button>
            </div>
          </div>
        </div>
      )}

      {liveDetailPlanet && (
        <PlanetDetailModal
          planet={liveDetailPlanet}
          telegramId={telegramId}
          stardustBalance={stardustBalance}
          planets={planets}
          maxSlots={maxSlots}
          onClose={() => setDetailPlanet(null)}
          onStartFarming={(id) => onStartFarming(id, farmRepairVip)}
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
        />
      )}
    </div>
  );
}
