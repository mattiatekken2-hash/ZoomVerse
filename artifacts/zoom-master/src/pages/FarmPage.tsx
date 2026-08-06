import { useState, useRef, useEffect, useCallback } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import { DailyComboBox } from "../components/DailyComboBox";
import { PlanetDetailModal } from "../components/PlanetDetailModal";
import type { Planet, SunState } from "../hooks/useGameState";
import { PLANET_CONFIG, SUN_CONFIG, isFarmActive, isSunActive, isFarmExpired, isSunExpired, getReactivationFee, getSunReactivationFee, getFarmTimeRemaining, getSunTimeRemaining, formatDuration, REPAIR_STARDUST_COST } from "../hooks/useGameState";
import { WalletPopup } from "../components/WalletPopup";
import { useT } from "../i18n/LanguageContext";
import { PlanetRenameModal } from "../components/PlanetRenameModal";
import PvPModal from "../components/PvPModal";
import { getPlanetDisplayName } from "../utils/planetNames";
import { PlanetFloatBar } from "../components/PlanetFloatBar";
import { getDisplayFloat, isFloatablePlanet } from "../utils/planetFloat";
import { EconomyWidget } from "../components/EconomyWidget";
import { StakingWidget } from "../components/StakingWidget";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_ORDER,
  EQUIPMENT_CYCLE_MS,
  EQUIPMENT_RARITY_INFO,
  EQUIPMENT_RARITY_ORDER,
  PixelEquipmentIcon,
  effectiveEquipmentStart,
  getEquipmentTimeRemaining,
  getEquipmentTotalRate,
  getEquipmentReactivationFee,
  isEquipmentCycleActive,
  type EquipmentCategory,
  type EquipmentItem,
} from "../utils/equipmentConfig";


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
  // Space equipment inventory. Each item runs a 24h cycle (mirrors
  // planets): activate → earns for 24h → Reactivate. While the cycle
  // is running, getEquipmentTotalRate(equipment, now) contributes to
  // the live +$ZOOM/hr chip.
  equipment: EquipmentItem[];
  onActivateEquipment: (id: string) => void;
  onReactivateEquipment: (id: string) => { ok: boolean; reason?: string };
  onBurnEquipment: (id: string) => void;
  onSellEquipment: (id: string, price: number) => void;
  onUnlistEquipment: (id: string) => void;
  /** Flush pending planet save before entering PvP queue. */
  onFlushPlanets?: () => Promise<void>;
}

/**
 * EquipmentInventory — passive-earning space gear, grouped by category and
 * sorted by rarity (rarest first within each group). Equipment items have
 * no farming cycle: they produce $ZOOM/hr continuously while owned.
 * Burning, selling, and listing are intentionally NOT exposed yet — the
 * inventory is read-only at this stage.
 */
function EquipmentInventory({
  equipment,
  onActivate,
  onReactivate,
  onBurn,
  onSell,
  onUnlist,
  balance,
}: {
  equipment: EquipmentItem[];
  onActivate: (id: string) => void;
  onReactivate: (id: string) => { ok: boolean; reason?: string };
  onBurn: (id: string) => void;
  onSell: (id: string, price: number) => void;
  onUnlist: (id: string) => void;
  balance: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const [sellFor, setSellFor] = useState<{ id: string; rate: number } | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const grouped = new Map<EquipmentCategory, EquipmentItem[]>();
  for (const cat of EQUIPMENT_CATEGORY_ORDER) grouped.set(cat, []);
  for (const item of equipment) {
    const bucket = grouped.get(item.category);
    if (bucket) bucket.push(item);
  }
  const rarityRank = new Map(EQUIPMENT_RARITY_ORDER.map((r, i) => [r, i]));
  for (const [, list] of grouped) {
    list.sort((a, b) => (rarityRank.get(b.rarity) ?? 0) - (rarityRank.get(a.rarity) ?? 0));
  }

  if (equipment.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed flex flex-col items-center justify-center py-10 gap-3"
        style={{ borderColor: "rgba(120,160,220,0.22)", minHeight: 200 }}
        data-testid="equipment-empty"
      >
        <div style={{ fontSize: 36, opacity: 0.45 }}>🛰️</div>
        <div className="text-sm font-bold" style={{ color: "rgba(220,235,255,0.7)" }}>
          No equipment yet
        </div>
        <div className="text-xs px-6 text-center" style={{ color: "rgba(220,235,255,0.35)" }}>
          Space gear (Helmets, Jetpacks, Hats, Scanners) will produce $ZOOM passively.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="equipment-inventory">
      {EQUIPMENT_CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat) ?? [];
        const info = EQUIPMENT_CATEGORIES[cat];
        return (
          <div key={cat} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 16 }}>{info.icon}</span>
                <span className="font-black text-sm tracking-wide" style={{ color: "rgba(230,240,255,0.9)" }}>
                  {info.label.toUpperCase()}
                </span>
              </div>
              <span className="text-xs font-bold" style={{ color: "rgba(220,230,245,0.4)" }}>
                {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <div
                className="rounded-xl border border-dashed py-4 text-center text-xs"
                style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.22)" }}
              >
                None
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => {
                  const r = EQUIPMENT_RARITY_INFO[item.rarity];
                  const eff = effectiveEquipmentStart(item);
                  const active = isEquipmentCycleActive(item, now);
                  const neverStarted = eff <= 0;
                  const expired = !active && !neverStarted;
                  const listed = !!item.isListedInMarket;
                  const remainingMs = active ? getEquipmentTimeRemaining(item, now) : 0;
                  const progress = active
                    ? Math.min(1, Math.max(0, 1 - remainingMs / EQUIPMENT_CYCLE_MS))
                    : expired ? 1 : 0;
                  const remainingLabel = active
                    ? formatDuration(remainingMs)
                    : expired ? "Expired" : "Idle";
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl p-3 border slot-enter flex flex-col gap-2"
                      style={{
                        borderColor: listed ? "rgba(255,51,85,0.45)" : `${r.color}55`,
                        background: `linear-gradient(135deg, ${r.color}1a 0%, rgba(6,8,16,0.6) 100%)`,
                        boxShadow: `0 0 10px ${r.color}22`,
                        opacity: listed ? 0.85 : 1,
                        transform: "translateZ(0)",
                        contain: "layout style paint",
                      } as React.CSSProperties}
                      data-testid={`equipment-card-${item.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: `radial-gradient(circle at 35% 30%, ${r.color}cc 0%, ${r.color}44 60%, rgba(6,8,16,0.9) 100%)`,
                            boxShadow: `0 0 12px ${r.glowColor}`,
                          }}
                        >
                          <PixelEquipmentIcon category={cat} color={r.color} size={26} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-[10px] font-black tracking-widest uppercase truncate"
                            style={{ color: r.color, letterSpacing: 0.8 }}
                          >
                            {r.label}
                          </div>
                          <div
                            className="text-[10px] font-bold truncate"
                            style={{ color: "rgba(220,230,245,0.55)" }}
                          >
                            {info.label.slice(0, -1)}
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] font-black" style={{ color: "#a8d8ff" }}>
                        +{item.rate.toLocaleString()}/hr
                      </div>
                      {/* Progress bar (24h cycle) */}
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${progress * 100}%`,
                            background: active
                              ? `linear-gradient(90deg, ${r.color} 0%, ${r.color}aa 100%)`
                              : expired ? "rgba(255,80,80,0.7)" : "transparent",
                            transition: "width 0.5s linear",
                          }}
                        />
                      </div>
                      <div
                        className="text-[9px] font-bold tracking-wider text-center"
                        style={{ color: active ? "#00e676" : expired ? "#ff6b6b" : "rgba(255,255,255,0.4)" }}
                      >
                        {listed ? "LISTED" : remainingLabel}
                      </div>
                      {/* Action row. No COLLECT button — earnings auto-
                          credit via /farm/settle while the cycle runs.
                          Expired items must pay a $ZOOM fee to start a
                          fresh 24h window (mirrors planet reactivation). */}
                      {listed ? (
                        <button
                          onClick={() => onUnlist(item.id)}
                          className="text-[10px] font-black tracking-wider rounded-md py-1.5"
                          style={{
                            background: "rgba(255,51,85,0.12)",
                            border: "1px solid rgba(255,51,85,0.4)",
                            color: "#ff3355",
                          }}
                          data-testid={`eq-unlist-${item.id}`}
                        >
                          UNLIST
                        </button>
                      ) : active ? (
                        <div
                          className="text-[10px] font-black tracking-wider rounded-md py-1.5 text-center"
                          style={{
                            background: "rgba(0,230,118,0.10)",
                            border: "1px solid rgba(0,230,118,0.30)",
                            color: "#00e676",
                          }}
                          data-testid={`eq-farming-${item.id}`}
                        >
                          FARMING
                        </div>
                      ) : expired ? (
                        (() => {
                          const fee = getEquipmentReactivationFee(item);
                          const canAfford = balance >= fee;
                          return (
                            <button
                              onClick={() => {
                                if (!canAfford) return;
                                const res = onReactivate(item.id);
                                if (!res.ok && res.reason) alert(res.reason);
                              }}
                              disabled={!canAfford}
                              className="text-[10px] font-black tracking-wider rounded-md py-1.5 flex flex-col items-center"
                              style={{
                                background: canAfford ? `${r.color}22` : "rgba(255,255,255,0.04)",
                                border: `1px solid ${canAfford ? r.color + "77" : "rgba(255,255,255,0.15)"}`,
                                color: canAfford ? r.color : "rgba(255,255,255,0.35)",
                                cursor: canAfford ? "pointer" : "not-allowed",
                              }}
                              data-testid={`eq-reactivate-${item.id}`}
                            >
                              <span>REACTIVATE</span>
                              <span className="text-[8px] opacity-80">{fee.toLocaleString()} $ZOOM</span>
                            </button>
                          );
                        })()
                      ) : (
                        <button
                          onClick={() => onActivate(item.id)}
                          className="text-[10px] font-black tracking-wider rounded-md py-1.5"
                          style={{
                            background: `${r.color}22`,
                            border: `1px solid ${r.color}77`,
                            color: r.color,
                          }}
                          data-testid={`eq-activate-${item.id}`}
                        >
                          ACTIVATE
                        </button>
                      )}
                      {!listed && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => {
                              setSellFor({ id: item.id, rate: item.rate });
                              setSellPrice(String(Math.min(10.0, Math.max(0.25, +(item.rate * 0.01).toFixed(2)))));
                            }}
                            className="text-[9px] font-black tracking-wider rounded-md py-1"
                            style={{
                              background: "rgba(255,215,0,0.10)",
                              border: "1px solid rgba(255,215,0,0.35)",
                              color: "#ffd700",
                            }}
                            data-testid={`eq-sell-${item.id}`}
                          >
                            SELL
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Burn this ${r.label} ${info.label.slice(0, -1)}? This cannot be undone.`)) {
                                onBurn(item.id);
                              }
                            }}
                            className="text-[9px] font-black tracking-wider rounded-md py-1"
                            style={{
                              background: "rgba(255,80,80,0.10)",
                              border: "1px solid rgba(255,80,80,0.35)",
                              color: "#ff6b6b",
                            }}
                            data-testid={`eq-burn-${item.id}`}
                          >
                            BURN
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {sellFor && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 px-6"
          style={{ background: "rgba(2,4,10,0.78)", backdropFilter: "blur(4px)" }}
          onClick={() => setSellFor(null)}
        >
          <div
            className="rounded-2xl border p-5 w-full max-w-xs flex flex-col gap-3"
            style={{
              background: "linear-gradient(160deg, rgba(20,24,40,0.95) 0%, rgba(8,10,20,0.95) 100%)",
              borderColor: "rgba(255,215,0,0.35)",
              boxShadow: "0 0 30px rgba(255,215,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-black tracking-wider" style={{ color: "#ffd700" }}>
              SELL EQUIPMENT
            </div>
            <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.6)" }}>
              Set a GRAM price. The buyer pays with deposited GRAM and receives a fresh 24h cycle.
              <br/>
              Min 0.25 – Max 10.0 GRAM.
            </div>
            <input
              type="number"
              step="0.01"
              min={0.25}
              max={10.0}
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              className="rounded-md px-3 py-2 text-sm font-bold"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,215,0,0.35)",
                color: "#ffd700",
              }}
              data-testid="eq-sell-input"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSellFor(null)}
                className="text-xs font-black tracking-wider rounded-md py-2"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  const n = Number(sellPrice);
                  if (!Number.isFinite(n) || n < 0.25 || n > 10.0) return;
                  onSell(sellFor.id, n);
                  setSellFor(null);
                }}
                className="text-xs font-black tracking-wider rounded-md py-2"
                style={{
                  background: "rgba(255,215,0,0.18)",
                  border: "1px solid rgba(255,215,0,0.55)",
                  color: "#ffd700",
                }}
                data-testid="eq-sell-confirm"
              >
                LIST
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
  MYTHIC: "rarity-mythic",
  PLASMA: "rarity-plasma",
  GOLD: "rarity-gold",
  V1: "rarity-gold",
  V1_NFT: "rarity-gold",
};


export function FarmPage({ planets, sun, sunCount, balance, maxSlots, defectPlanets, telegramId, onCollect, onBurn, onStartFarming, onStopFarming, onStartSunFarming, onStopSunFarming, onBurnSun, onSell, onUnlist, onRepair, stardustBalance = 0, onRename, equipment, onActivateEquipment, onReactivateEquipment, onBurnEquipment, onSellEquipment, onUnlistEquipment, onFlushPlanets }: FarmPageProps) {
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
  const [pvpPlanet, setPvPPlanet] = useState<Planet | null>(null);
  const [detailPlanet, setDetailPlanet] = useState<Planet | null>(null);
  const handleComboClaimed = useCallback((_newBal: number) => {
    window.dispatchEvent(new Event("balance-refresh"));
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  // Inventory tab — the FarmPage hosts the player's full inventory, split
  // between "Planets" (existing planet/SUN/staking grid) and "Equipment"
  // (new space gear: Helmets / Jetpacks / Hats / Scanners).
  const [inventoryTab, setInventoryTab] = useState<"planets" | "equipment">("planets");
  const equipmentRate = getEquipmentTotalRate(equipment);

  // Daily-collect removed — planets now farm autonomously for the full 24h
  // cycle and then need a $ZOOM reactivation, with no manual collect step.
  // `onCollect` prop is retained for legacy compatibility but never invoked.
  void onCollect;

  const totalRate = planets.filter(isFarmActive).reduce((a, p) => a + p.rate, 0)
    + (sun && isSunActive(sun) ? sunDisplayRate : 0)
    + equipmentRate;

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
            { id: "equipment", label: "Equipment", count: equipment.length },
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

          {/* DAILY COMBO — shown at top of planets tab */}
          <DailyComboBox
            telegramId={telegramId}
            planets={planets}
            onClaimed={handleComboClaimed}
          />

          {/* REGULAR PLANETS — 2-column compact grid */}
          <div className="grid grid-cols-2 gap-3">
          {planets.filter((p) => !p.isListedInMarket).map((planet) => {
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

            const isPlatinumNft = planet.name === "V1_NFT";
            const planetFloat = isFloatablePlanet(planet) ? getDisplayFloat(planet) : undefined;
            const isPerfectFloat = typeof planetFloat === "number" && planetFloat >= 1 && !expired;
            const dur = planet.durability ?? 100;
            return (
              <div
                key={planet.id}
                className={`slot-enter rounded-xl border ${isPlatinumNft ? "nft-card-glow" : isPerfectFloat ? "perfect-card-glow" : ""}`}
                style={{
                  borderColor: isPlatinumNft
                    ? "rgba(220,232,255,0.10)"
                    : isPerfectFloat
                    ? "rgba(255,215,0,0.10)"
                    : isListed ? "rgba(255,215,0,0.3)" : expired ? "rgba(255,255,255,0.08)" : planet.color + "40",
                  background: isPerfectFloat
                    ? "linear-gradient(135deg, rgba(255,215,0,0.18) 0%, rgba(255,170,40,0.10) 45%, rgba(20,12,4,0.85) 100%)"
                    : `linear-gradient(135deg, ${planet.color}0d 0%, rgba(6,8,16,0.6) 100%)`,
                  boxShadow: isPerfectFloat
                    ? "0 0 22px rgba(255,215,0,0.35)"
                    : active ? `0 0 18px ${planet.color}26` : `0 0 10px ${planet.color}10`,
                  transform: "translateZ(0)",
                  contain: "layout style paint",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                } as React.CSSProperties}
                onClick={() => setDetailPlanet(planet)}
                data-testid={`planet-card-${planet.id}`}
              >
                {/* ── Compact vertical 2-col card ── */}
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 6px" }}>
                  <div
                    style={{
                      position: "relative",
                      filter: expired ? "grayscale(1) brightness(0.45)" : undefined,
                      transition: "filter 0.3s",
                    }}
                  >
                    <PlanetOrb planet={planet} size={60} animate={active} displayFloat={planetFloat} />
                    {isPlatinumNft && (
                      <span
                        className="nft-badge absolute"
                        style={{ top: -6, left: -6 }}
                        aria-label="NFT"
                      >
                        NFT
                      </span>
                    )}
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
                </div>{/* end orb row */}

                {/* Name + rarity — centered compact */}
                <div style={{ padding: "0 8px 3px", textAlign: "center" }}>
                  <div
                    className={`font-black truncate ${isPlatinumNft ? "nft-platinum-text" : RARITY_CLASS[planet.name]}`}
                    style={{ fontSize: 11, opacity: expired ? 0.65 : 1, ...(isPlatinumNft ? {} : { background: "transparent" }) }}
                    onClick={(e) => { e.stopPropagation(); if (telegramId && !isListed) setRenamePlanet(planet); }}
                  >
                    {getPlanetDisplayName(planet)}
                  </div>
                  {/* Rate / status */}
                  <div style={{ textAlign: "center", marginTop: 3, fontSize: 9, fontWeight: 700, color: active ? planet.color : expired ? "rgba(255,82,82,0.75)" : "rgba(255,255,255,0.4)" }}>
                    {active
                      ? (planet.name === "MUSHROOM" ? "+5 ★/24h" : `+${planet.rate.toLocaleString()}/hr`)
                      : expired ? "EXPIRED"
                      : isListed ? `${planet.marketPrice?.toLocaleString()} GRAM`
                      : `+${planet.rate.toLocaleString()}/hr`}
                  </div>
                </div>{/* end name/info section */}

                {/* Float bar compact */}
                {isFloatablePlanet(planet) && (
                  <div style={{ padding: "2px 10px", opacity: expired ? 0.55 : 1 }}>
                    <PlanetFloatBar value={getDisplayFloat(planet)} />
                  </div>
                )}

                {/* Durability bar — shown when below 100% */}
                {dur < 100 && (() => {
                  const durColor = dur > 50 ? "#00e676" : dur > 20 ? "#ffb347" : "#ff5252";
                  return (
                    <div style={{ padding: "3px 10px 1px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.35)" }}>DUR</span>
                        <span style={{ fontSize: 7, fontWeight: 800, color: durColor }}>{dur}%</span>
                      </div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${dur}%`, background: durColor, borderRadius: 2, transition: "width 0.4s" }} />
                      </div>
                    </div>
                  );
                })()}

                {/* Primary action button — full width at card bottom */}
                <div style={{ padding: "6px 8px 10px", marginTop: "auto" }}>
                  {dur <= 0 ? (
                    <div
                      style={{ borderRadius: 10, padding: "7px 0", textAlign: "center", fontSize: 10, fontWeight: 900, background: "rgba(255,82,82,0.07)", border: "1px solid rgba(255,82,82,0.25)", color: "#ff5252", cursor: "not-allowed" }}
                      aria-disabled="true"
                    >
                      ❄ FROZEN
                    </div>
                  ) : active ? (
                    <div
                      className="btn-glass-farm-active"
                      style={{ borderRadius: 10, padding: "7px 4px", textAlign: "center", fontSize: 10, fontWeight: 900, cursor: "default", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
                      data-testid={`status-farming-${planet.id}`}
                    >
                      <span>FARMING</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>{formatDuration(remaining)}</span>
                    </div>
                  ) : isListed ? (
                    <button
                      className="btn-glass-listed"
                      style={{ width: "100%", borderRadius: 10, padding: "7px 0", fontSize: 10, fontWeight: 900, cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); onUnlist(planet.id); }}
                      data-testid={`btn-unlist-${planet.id}`}
                    >
                      DELIST
                    </button>
                  ) : expired ? (
                    <button
                      style={{
                        width: "100%", borderRadius: 10, padding: "7px 0", fontSize: 10, fontWeight: 900,
                        border: `1px solid ${planet.color}66`,
                        background: `linear-gradient(135deg, ${planet.color}33, ${planet.color}1a)`,
                        color: planet.color, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                      }}
                      onClick={(e) => { e.stopPropagation(); handleStartOrReactivate(); }}
                      data-testid={`btn-reactivate-${planet.id}`}
                    >
                      <span>REACTIVATE</span>
                      <span style={{ fontSize: 7, opacity: 0.85 }}>{reactivationFee.toLocaleString()} $ZOOM</span>
                    </button>
                  ) : (
                    <button
                      className="btn-glass-farm"
                      style={{ width: "100%", borderRadius: 10, padding: "7px 0", fontSize: 10, fontWeight: 900, cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); handleStartOrReactivate(); }}
                      data-testid={`btn-farm-${planet.id}`}
                    >
                      START FARM
                    </button>
                  )}
                </div>
              </div>
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
            style={{ borderColor: "rgba(255,215,0,0.22)", background: "rgba(255,215,0,0.025)", cursor: "default", minHeight: 100, pointerEvents: "none", userSelect: "none" }}
            data-testid="slot-locked"
            aria-disabled="true"
          >
            <div style={{ fontSize: 20, opacity: 0.45 }}>🔒</div>
            <div className="font-bold text-xs tracking-widest uppercase" style={{ color: "rgba(255,215,0,0.45)" }}>0.25 GRAM</div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.18)" }}>to unlock slot</div>
          </div>

        {planets.length === 0 && !sun?.isOwned && (
          <div className="text-center text-xs py-4" style={{ color: "rgba(255,255,255,0.22)" }}>
            Forge your first planet in the Lab
          </div>
        )}
          </>
          )}

          {inventoryTab === "equipment" && (
            <EquipmentInventory
              equipment={equipment}
              onActivate={onActivateEquipment}
              onReactivate={onReactivateEquipment}
              onBurn={onBurnEquipment}
              onSell={onSellEquipment}
              onUnlist={onUnlistEquipment}
              balance={balance}
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
          planets={planets}
          maxSlots={maxSlots}
          onClose={() => setDetailPlanet(null)}
          onStartFarming={(id) => onStartFarming(id)}
          onRename={(p) => { setDetailPlanet(null); setRenamePlanet(p); }}
          onPvP={(p) => { setDetailPlanet(null); setPvPPlanet(p); }}
          onSell={(p) => { setDetailPlanet(null); openSellPopup(p); }}
          onBurn={(id) => handleBurnClick(id)}
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
