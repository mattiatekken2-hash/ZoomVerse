import { useState, useRef, useEffect, useCallback } from "react";
import {
  ITEM_CONFIG,
  ITEM_TYPES_ORDERED,
  ITEM_RARITY_COLOR,
  ITEM_RARITY_LABEL,
  type CollectibleItem,
  type ItemType,
} from "../utils/collectibleConfig";
import { FarmInventoryCard } from "../components/FarmInventoryCard";
import { DailyComboBox } from "../components/DailyComboBox";
import { PlanetDetailModal } from "../components/PlanetDetailModal";
import type { Planet, SunState } from "../hooks/useGameState";
import { PLANET_CONFIG, SUN_CONFIG, isFarmActive, isSunActive, isFarmExpired, isSunExpired, getReactivationFee, getFarmTimeRemaining, getSunTimeRemaining, formatDuration, REPAIR_STARDUST_COST, FARM_UPGRADE_COSTS, FARM_UPGRADE_TIERS, isLegacyCatalogModelPlanet } from "../hooks/useGameState";
import { WalletPopup } from "../components/WalletPopup";
import { useT } from "../i18n/LanguageContext";
import { PlanetRenameModal } from "../components/PlanetRenameModal";
import PvPModal from "../components/PvPModal";
import { getPlanetDisplayName } from "../utils/planetNames";
import { EconomyWidget } from "../components/EconomyWidget";
import { StakingWidget } from "../components/StakingWidget";
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
}

/**
 * CollectibleItemInventory — all-time passive ZOOM earners (no farm cycle).
 * Shows a 2-col grid of item cards, each with emoji orb, rarity badge, rate,
 * and List/Delist controls.
 */
function CollectibleItemInventory({
  items,
  onSell,
  onUnlist,
}: {
  items: CollectibleItem[];
  onSell?: (id: string, price: number) => void;
  onUnlist?: (id: string) => void;
}) {
  const [listFor, setListFor] = useState<{ id: string; cfg: typeof ITEM_CONFIG[ItemType] } | null>(null);
  const [listPrice, setListPrice] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // Sort: rarest first (GOLD → BASIC)
  const RARITY_RANK = { GOLD: 4, MYTHIC: 3, EPIC: 2, RARE: 1, BASIC: 0 };
  const sorted = [...items].sort((a, b) =>
    (RARITY_RANK[b.rarity as keyof typeof RARITY_RANK] ?? 0) - (RARITY_RANK[a.rarity as keyof typeof RARITY_RANK] ?? 0)
  );

  if (sorted.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed flex flex-col items-center justify-center py-10 gap-3"
        style={{ borderColor: "rgba(120,160,220,0.22)", minHeight: 200 }}
        data-testid="items-empty"
      >
        <div style={{ fontSize: 36, opacity: 0.45 }}>⚗️</div>
        <div className="text-sm font-bold" style={{ color: "rgba(220,235,255,0.7)" }}>
          No collectibles yet
        </div>
        <div className="text-xs px-6 text-center" style={{ color: "rgba(220,235,255,0.35)" }}>
          Forge items in the Lab to start collecting passive ZOOM earners.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="items-inventory">
      {toast && (
        <div className="rounded-xl px-4 py-2 text-xs font-bold text-center slot-enter"
          style={{ background: "rgba(196,113,237,0.12)", color: "#c471ed", border: "1px solid rgba(196,113,237,0.25)" }}>
          {toast}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {sorted.map((item) => {
          const type = item.type as ItemType;
          const cfg = ITEM_CONFIG[type];
          if (!cfg) return null;
          const rarityColor = ITEM_RARITY_COLOR[item.rarity];
          const listed = !!item.isListedInMarket;
          const bokeh = cfg.glowColor ?? "rgba(180,140,255,0.5)";
          return (
            <div
              key={item.id}
              className="rounded-xl border flex flex-col gap-2 p-3 slot-enter"
              style={{
                borderColor: `${rarityColor}30`,
                background: `linear-gradient(135deg, ${rarityColor}10 0%, rgba(10,14,30,0.7) 100%)`,
                backdropFilter: "blur(10px)",
              }}
              data-testid={`item-card-${item.id}`}
            >
              {/* Emoji orb with bokeh glow — no dark box */}
              <div className="relative flex justify-center">
                <div
                  className="bokeh-blob absolute"
                  style={{ width: 56, height: 56, top: 0, left: "50%", transform: "translateX(-50%)", background: bokeh, opacity: 0.85 }}
                />
                <div
                  className="relative w-14 h-14 flex items-center justify-center text-3xl planet-float-anim"
                  style={{ filter: `drop-shadow(0 0 14px ${bokeh})` }}
                >
                  {cfg.emoji}
                </div>
                {listed && (
                  <div
                    className="absolute -top-1 -right-1 text-[8px] font-black px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(255,215,0,0.15)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.3)" }}
                  >
                    LISTED
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="text-center">
                <div className="text-[9px] font-black tracking-wide" style={{ color: rarityColor }}>
                  {ITEM_RARITY_LABEL[item.rarity] ?? item.rarity} · {cfg.rate}/hr
                </div>
                <div className="text-xs font-bold truncate mt-0.5" style={{ color: "rgba(220,235,255,0.85)" }}>
                  {cfg.label}
                </div>
              </div>
              {/* Actions */}
              {listed ? (
                <button
                  className="w-full py-1.5 rounded-lg text-[10px] font-black border transition-all active:scale-95"
                  style={{ borderColor: "rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.07)", color: "#ffd700" }}
                  onClick={() => { if (onUnlist) onUnlist(item.id); }}
                >
                  Delist
                </button>
              ) : (
                <button
                  className="w-full py-1.5 rounded-lg text-[10px] font-black border transition-all active:scale-95"
                  style={{ borderColor: `${rarityColor}33`, background: `${rarityColor}0d`, color: rarityColor }}
                  onClick={() => {
                    setListFor({ id: item.id, cfg });
                    setListPrice("");
                    setTimeout(() => inputRef.current?.focus(), 80);
                  }}
                >
                  List
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* List-price modal */}
      {listFor && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50"
          style={{ background: "rgba(6,8,16,0.92)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setListFor(null); }}
        >
          <div className="w-full rounded-t-3xl px-5 pt-6 pb-8 glass-strong">
            <div className="flex items-center gap-3 mb-5">
              <div className="text-3xl">{listFor.cfg.emoji}</div>
              <div className="font-black text-base" style={{ color: ITEM_RARITY_COLOR[listFor.cfg.rarity] }}>
                List {listFor.cfg.label}
              </div>
            </div>
            <div className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
              Price in GRAM (0.25 – 10). 10% marketplace fee included.
            </div>
            <div className="relative mb-4">
              <input
                ref={inputRef}
                type="number"
                min={0.25}
                max={10.0}
                step={0.01}
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                className="w-full rounded-xl px-4 py-4 text-xl font-black pr-20 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", color: "white", border: `1px solid ${ITEM_RARITY_COLOR[listFor.cfg.rarity]}44`, caretColor: ITEM_RARITY_COLOR[listFor.cfg.rarity] }}
                placeholder="0.00"
                inputMode="decimal"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>GRAM</span>
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 py-3.5 rounded-2xl font-black text-sm border"
                style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
                onClick={() => setListFor(null)}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-3.5 rounded-2xl font-black text-sm border transition-all active:scale-95"
                style={{ borderColor: `${ITEM_RARITY_COLOR[listFor.cfg.rarity]}44`, background: `${ITEM_RARITY_COLOR[listFor.cfg.rarity]}14`, color: ITEM_RARITY_COLOR[listFor.cfg.rarity] }}
                onClick={() => {
                  const p = parseFloat(listPrice);
                  if (isNaN(p) || p < 0.25 || p > 10) {
                    showToast("Price must be 0.25 – 10 GRAM");
                    return;
                  }
                  if (onSell) onSell(listFor.id, p);
                  setListFor(null);
                }}
              >
                List for Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Collectible items inventory grouped by type.
 */
interface SellPopup {
  planetId: string;
  planetName: string;
  planetColor: string;
}


export function FarmPage({
  planets, sun, sunCount, balance, maxSlots, defectPlanets, telegramId,
  onCollect, onBurn, onStartFarming, onStopFarming, onStartSunFarming, onStopSunFarming, onBurnSun,
  onSell, onUnlist, onRepair, stardustBalance = 0, onRename,
  items = [], onSellItem, onUnlistItem, onFlushPlanets, tonBalance = 0,
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
  // Timeout id for the COLLECTION toast — kept in a ref so repeated
  // taps reset the auto-dismiss timer instead of firing stale clears.
  const comingSoonTimeoutRef = useRef<number | null>(null);
  const [renamePlanet, setRenamePlanet] = useState<Planet | null>(null);
  const [pvpPlanet, setPvPPlanet] = useState<Planet | null>(null);
  const [detailPlanet, setDetailPlanet] = useState<Planet | null>(null);
  const handleComboClaimed = useCallback((newRedStarBalance: number) => {
    // Snap the local redStar balance to the server-confirmed value immediately
    // so the UI reflects the combo reward without waiting for the next sync.
    window.dispatchEvent(new CustomEvent("zoom-server-redstar-snap", {
      detail: { redStarBalance: newRedStarBalance },
    }));
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  // Inventory tab — the FarmPage hosts the player's full inventory, split
  // between "Planets" (existing planet/SUN/staking grid) and "Equipment"
  // (new space gear: Helmets / Jetpacks / Hats / Scanners).
  const [inventoryTab, setInventoryTab] = useState<"planets" | "items">("planets");

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
      setDefectMsg("Prezzo deve essere tra 0.25 e 10 TON");
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

  const sunActive = sun ? isSunActive(sun) : false;
  const sunExpired = isSunExpired(sun);
  // SUN reactivation now costs 1 ★ REDSTAR (flat) instead of a ZOOM fee.
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
            <div className="glass-neon px-3 py-1.5 rounded-full text-xs font-bold neon-text flex-shrink-0" data-testid="total-farm-rate">
              +{Math.floor(totalRate).toLocaleString()}/hr
            </div>
          )}
        </div>

        {/* Inventory tab switcher — splits the FarmPage between the
            existing planets/SUN/staking grid and the new space equipment
            grid (Helmets / Jetpacks / Hats / Scanners). The Economy /
            Staking widgets stay above this row because they describe the
            overall portfolio, not a single inventory section. */}
        <div
          className="flex items-center gap-1 mt-3 p-1 rounded-xl"
          style={{
            background: "rgba(20,28,48,0.55)",
            border: "1px solid rgba(120,160,220,0.18)",
          }}
        >
          {([
            { id: "planets", label: "Planets", count: planets.length },
            { id: "items", label: "Items", count: items.length },
          ] as const).map((tab) => {
            const active = inventoryTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInventoryTab(tab.id)}
                data-testid={`tab-inventory-${tab.id}`}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-black tracking-wide transition-all"
                style={{
                  background: active
                    ? "linear-gradient(135deg, rgba(80,180,255,0.30) 0%, rgba(60,120,220,0.18) 100%)"
                    : "transparent",
                  color: active ? "#e6f3ff" : "rgba(220,230,245,0.55)",
                  border: active ? "1px solid rgba(120,200,255,0.5)" : "1px solid transparent",
                  boxShadow: active ? "0 0 12px rgba(80,160,255,0.25)" : "none",
                  letterSpacing: 0.6,
                }}
              >
                {tab.label.toUpperCase()} · {tab.count}
              </button>
            );
          })}
        </div>
        {/* Row 2: teaser pills aligned left, equal gap, no wrapping. */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* STAKING teaser button — sits to the left of COLLECTION.
              Same disabled "coming soon" pattern: greyscale + reduced
              opacity, click shows a transient neutral toast, never
              navigates or mutates state. */}
          <button
            type="button"
            onClick={() => {
              setComingSoonMsg("Coming Soon: Stake your $ZOOM or Planets to earn massive rewards!");
              if (comingSoonTimeoutRef.current !== null) {
                window.clearTimeout(comingSoonTimeoutRef.current);
              }
              comingSoonTimeoutRef.current = window.setTimeout(() => {
                setComingSoonMsg(null);
                comingSoonTimeoutRef.current = null;
              }, 2400);
            }}
            aria-label="Staking — coming soon"
            data-testid="btn-staking-coming-soon"
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

          {/* ECONOMY widget — global $ZOOM price + live portfolio.
              Tappable card; opens the full chart modal. Polls /economy
              every 12s while mounted. Read-only, no mutations. */}
          <EconomyWidget balance={balance} />

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

          {/* TON STAKING — locks 4 V1 or 4 SUN for 0.5 TON / 30 days each.
              Server is the source of truth (re-validates count on start);
              the widget polls /staking/status every 30s and ticks a local
              counter every second for the live display. */}
          <StakingWidget
            telegramId={telegramId}
            planets={planets}
            sunCountClient={Math.max(sunCount ?? 0, sun?.isOwned ? 1 : 0)}
            sunFarmStartedAtClient={sun?.farmStartedAt ?? 0}
          />

          {inventoryTab === "planets" && (
          <>
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
                      background: "radial-gradient(circle at 38% 32%, #ffffff 0%, #fffde7 4%, #fff176 10%, #ffee58 18%, #ffca28 30%, #ffa726 48%, #fb8c00 65%, #ef6c00 82%, #e65100 100%)",
                      boxShadow: sunActive
                        ? "0 0 30px rgba(255,230,0,1), 0 0 70px rgba(255,165,0,0.85), 0 0 120px rgba(255,100,0,0.55), 0 0 200px rgba(255,50,0,0.25), inset -4px -3px 10px rgba(0,0,0,0.2)"
                        : "0 0 18px rgba(255,200,0,0.6), 0 0 45px rgba(255,140,0,0.3), 0 0 80px rgba(255,80,0,0.12), inset -4px -3px 10px rgba(0,0,0,0.2)",
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
                      ? `Cycle ended · Reactivate · 1 ★ Redstar`
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
                    <span style={{ fontSize: 8, opacity: 0.85 }}>1 ★ Redstar</span>
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

              {/* SUN farm-duration upgrade — same tier system as regular planets */}
              {sun && onUpgradeSunDuration && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,179,71,0.07)", borderRadius: 10, border: "1px solid rgba(255,179,71,0.2)" }}>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", color: "rgba(255,179,71,0.7)", marginBottom: 8 }}>
                    ⏱ CYCLE DURATION — {sun.farmDurationHours ?? 1}h · costs EARNED GRAM
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                    {FARM_UPGRADE_TIERS.map((h) => {
                      const cost = FARM_UPGRADE_COSTS[h]!;
                      const isCurrent = (sun.farmDurationHours ?? 1) === h;
                      const canAfford = tonBalance >= cost;
                      return (
                        <button
                          key={h}
                          disabled={isCurrent || !canAfford}
                          onClick={async () => {
                            const result = await onUpgradeSunDuration(h);
                            if (!result.ok) {
                              setDefectMsg(result.error ?? "Upgrade failed");
                              setTimeout(() => setDefectMsg(null), 2000);
                            }
                          }}
                          style={{
                            padding: "5px 2px", borderRadius: 7, fontSize: 9, fontWeight: 900,
                            background: isCurrent
                              ? "rgba(255,179,71,0.25)"
                              : canAfford ? "rgba(255,179,71,0.10)" : "rgba(255,255,255,0.04)",
                            border: isCurrent ? "1px solid rgba(255,179,71,0.7)" : "1px solid rgba(255,179,71,0.2)",
                            color: isCurrent ? "#ffb347" : canAfford ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)",
                            cursor: isCurrent || !canAfford ? "default" : "pointer",
                            textAlign: "center", lineHeight: 1.3,
                          }}
                        >
                          <div>{h}h</div>
                          {!isCurrent && <div style={{ fontSize: 8, opacity: 0.75 }}>{cost} G</div>}
                          {isCurrent && <div style={{ fontSize: 8, opacity: 0.7 }}>✓</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DAILY COMBO — shown at top of planets tab */}
          <DailyComboBox
            telegramId={telegramId}
            planets={planets}
            onClaimed={handleComboClaimed}
          />

          {/* REGULAR PLANETS — 2-column compact grid */}
          <div className="grid grid-cols-2 gap-3">
          {planets.filter((p) => !p.isListedInMarket && !isLegacyCatalogModelPlanet(p)).map((planet) => {
            const isListed = planet.isListedInMarket;

            const handleStartOrReactivate = () => {
              if (isListed) return;
              const res = onStartFarming(planet.id);
              if (!res.ok) {
                setDefectMsg(res.reason ?? "Cannot start farming");
                setTimeout(() => setDefectMsg(null), 1800);
              }
            };

            return (
              <FarmInventoryCard
                key={planet.id}
                planet={planet}
                variant="grid"
                suspendGl={!!detailPlanet}
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
          </>
          )}

          {inventoryTab === "items" && (
            <CollectibleItemInventory
              items={items}
              onSell={onSellItem}
              onUnlist={onUnlistItem}
            />
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
              Prezzo in GRAM (min 0.25 – max 10). Commissione 10% inclusa.
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
                Ricevi ~{((parseFloat(sellPrice) || 0) * 0.9).toFixed(3)} GRAM netto
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
      {/* ⚔️ COMBATTENTE ON badge — visible whenever PvP modal is active */}
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
            background: "linear-gradient(90deg, rgba(180,0,0,0.92), rgba(220,40,40,0.92))",
            border: "1px solid rgba(255,100,100,0.5)",
            boxShadow: "0 0 18px rgba(255,50,50,0.5)",
            animation: "pvp-fighter-pulse 1.4s ease-in-out infinite",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: 14 }}>⚔️</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: 1.5, textTransform: "uppercase" }}>
            Combattente ON
          </span>
          <span style={{ fontSize: 14 }}>⚔️</span>
          <style>{`
            @keyframes pvp-fighter-pulse {
              0%,100% { box-shadow: 0 0 14px rgba(255,50,50,0.5); }
              50%      { box-shadow: 0 0 28px rgba(255,80,80,0.85); }
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
          onRename={(p) => { setDetailPlanet(null); setRenamePlanet(p); }}
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
