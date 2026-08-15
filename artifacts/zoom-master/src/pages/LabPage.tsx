import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  ITEM_CONFIG,
  ITEM_TYPES_ORDERED,
  ITEM_RARITY_COLOR,
  ITEM_RARITY_LABEL,
  type ItemType,
} from "../utils/collectibleConfig";
import { PlanetCanvas, type ForgePhase } from "../components/PlanetCanvas";
import { AutoTapWidget } from "../components/AutoTapWidget";
import { PixelAvatar } from "../components/PixelAvatar";

import type { Planet, PlanetType, EquipmentDropResult, ZoomModel } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";
import { EQUIPMENT_RARITY_INFO, EQUIPMENT_CATEGORIES } from "../utils/equipmentConfig";
import { hapticLight } from "../utils/haptic";
import { useT } from "../i18n/LanguageContext";


interface LabPageProps {
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  maxSlots: number;
  currentCraftRarity: PlanetType | null;
  pendingPlanet: Planet | null;
  pendingModel: ZoomModel | null;
  forgingModel?: ZoomModel | null;
  forgeRolling?: boolean;
  hasAutoTap: boolean;
  sunCount: number;
  tonBalance: number;
  depositBalance: number;
  stardustBalance: number;
  telegramId: string | null;
  onCraft: (availableStardust?: number) => { completed: boolean; model?: ZoomModel; tapsLeft?: number; broken?: boolean; brokenRarity?: PlanetType; equipmentDrop?: EquipmentDropResult };
  onPurchase?: (labPointsDelta: number, stardustDelta: number) => void;
  onClaim: () => void;
  whiteCollectionUnlocked: boolean;
  whiteCollectionBundles: number;
  whitePlanets: Planet[];
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  earthPlanets: Planet[];
  blackCollectionUnlocked: boolean;
  blackCollectionBundles: number;
  blackPlanets: Planet[];
  supernovaCollectionUnlocked: boolean;
  supernovaCollectionBundles: number;
  supernovaPlanets: Planet[];
  onPlaceWhitePlanet: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectWhitePlanet: (planetId: string) => void;
  onReactivateWhitePlanet: (planetId: string) => { ok: boolean; reason?: string };
  onMarkWhitePlanetReactivated: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceEarthPlanet: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectEarthPlanet: (planetId: string) => void;
  onReactivateEarthPlanet: (planetId: string) => { ok: boolean; reason?: string };
  onMarkEarthPlanetReactivated: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceBlackPlanet: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectBlackPlanet: (planetId: string) => void;
  onReactivateBlackPlanet: (planetId: string) => { ok: boolean; reason?: string };
  onMarkBlackPlanetReactivated: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceSupernovaPlanet: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectSupernovaPlanet: (planetId: string) => void;
  onReactivateSupernovaPlanet: (planetId: string) => { ok: boolean; reason?: string };
  onMarkSupernovaPlanetReactivated: (planetId: string) => { ok: boolean; reason?: string };
  stellaRossaCollectionUnlocked: boolean;
  stellaRossaCollectionBundles: number;
  stellaPlanets: Planet[];
  stellaLastClaimAt?: number;
  onPlaceStellaRossaPlanet: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectStellaRossaPlanet: (planetId: string) => void;
  onReactivateStellaRossaPlanet: (planetId: string) => { ok: boolean; reason?: string };
  onMarkStellaRossaPlanetReactivated: (planetId: string) => { ok: boolean; reason?: string };
  onStellaClaimDaily?: (newRedStarBalance: number) => void;
  redStarBalance?: number;
  onRedStarBalanceUpdate?: (newBalance: number) => void;
  /** Current collection farm-duration (hours) — shows active tier in upgrade panel. */

  /** Upgrade farm-cycle duration for ALL collection planets. Charges GRAM. */
  onUpgradeCollectionDuration?: (collectionType: "white" | "earth" | "black" | "supernova" | "stella_rossa", hours: number) => Promise<{ ok: boolean; error?: string }>;
  /** Craft a collectible item in the Lab forge. Deducts stardust, rolls chance. */
  onCraftItem?: (itemType: string) => Promise<{ won: boolean; message?: string; error?: string }>;
  visible?: boolean;
}

interface FloatMsg { id: number; text: string; color: string }

const GREY = "#8892b0";

const RARITY_PAINT: Record<string, string> = {
  BASIC: "#9aa3b8",
  RARE: "#4facfe",
  EPIC: "#c471ed",
  MYTHIC: "#ff3355",
  GOLD: "#ffd700",
  LEGEND: "#fff4b0",
};

export function LabPage({ balance, taps, goal, planets, maxSlots, currentCraftRarity, pendingPlanet, pendingModel, forgingModel = null, forgeRolling = false, hasAutoTap, sunCount, tonBalance, depositBalance, stardustBalance, telegramId, onCraft, onPurchase, onClaim, whiteCollectionUnlocked, whiteCollectionBundles, whitePlanets, earthCollectionUnlocked, earthCollectionBundles, earthPlanets, blackCollectionUnlocked, blackCollectionBundles, blackPlanets, supernovaCollectionUnlocked, supernovaCollectionBundles, supernovaPlanets, onPlaceWhitePlanet, onCollectWhitePlanet, onReactivateWhitePlanet, onMarkWhitePlanetReactivated, onPlaceEarthPlanet, onCollectEarthPlanet, onReactivateEarthPlanet, onMarkEarthPlanetReactivated, onPlaceBlackPlanet, onCollectBlackPlanet, onReactivateBlackPlanet, onMarkBlackPlanetReactivated, onPlaceSupernovaPlanet, onCollectSupernovaPlanet, onReactivateSupernovaPlanet, onMarkSupernovaPlanetReactivated, stellaRossaCollectionUnlocked, stellaRossaCollectionBundles, stellaPlanets, stellaLastClaimAt, onStellaClaimDaily, onPlaceStellaRossaPlanet, onCollectStellaRossaPlanet, onReactivateStellaRossaPlanet, onMarkStellaRossaPlanetReactivated, redStarBalance = 0, onRedStarBalanceUpdate, onUpgradeCollectionDuration, onCraftItem, visible = true }: LabPageProps) {
  const { t } = useT();
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const floatIdRef = useRef(0);
  const floatTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [brokenFlash, setBrokenFlash] = useState<{ id: number; rarity: PlanetType } | null>(null);
  const brokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEquipmentDropRef = useRef<EquipmentDropResult | undefined>(undefined);
  const pendingFloatRef = useRef<{ model: ZoomModel; equipmentDrop?: EquipmentDropResult } | null>(null);

  // Forge phase state machine: drives the visual sequence after the user
  // hits 100% — flash → 2s dramatic wait → model reveal → claim button.
  const [forgePhase, setForgePhase] = useState<ForgePhase>("idle");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showClaim, setShowClaim] = useState(false);

  useEffect(() => {
    if (pendingModel && forgePhase === "idle" && !pendingFloatRef.current) {
      pendingFloatRef.current = {
        model: pendingModel,
        equipmentDrop: pendingEquipmentDropRef.current,
      };
      pendingEquipmentDropRef.current = undefined;
    }
  }, [pendingModel, forgePhase]);

  useEffect(() => {
    if (pendingModel && forgePhase === "idle") {
      setForgePhase("flash");
      setShowClaim(false);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setForgePhase("waiting");
      }, 220);
      revealTimerRef.current = setTimeout(() => {
        setForgePhase("revealed");
      }, 220 + 2000);
      claimTimerRef.current = setTimeout(() => {
        setShowClaim(true);
      }, 220 + 2000 + 3500);
    } else if (!pendingModel && !pendingPlanet && forgePhase !== "idle") {
      setForgePhase("idle");
      setShowClaim(false);
      pendingFloatRef.current = null;
      if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
      if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
      if (claimTimerRef.current) { clearTimeout(claimTimerRef.current); claimTimerRef.current = null; }
    }
  }, [pendingModel, pendingPlanet, forgePhase]);

  // (moved below addFloat — see the effect at ~line 185)

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
  }, []);

  const isFull = planets.length >= maxSlots && !pendingPlanet && !pendingModel;
  const effectiveStardust = stardustBalance;
  const canCraft = !brokenFlash && !pendingModel && !pendingPlanet && !forgeRolling && planets.length < maxSlots && (currentCraftRarity
    ? true
    : (effectiveStardust >= (PLANET_CONFIG["BASIC"].craftCost ?? 2)));

  const progress = goal > 0 ? taps / goal : 0;

  const dynamicColor = GREY;

  const clearAllFloats = useCallback(() => {
    floatTimersRef.current.forEach(t => clearTimeout(t));
    floatTimersRef.current.clear();
    setFloats([]);
  }, []);

  // Flush all pending +1 floats whenever LAB is hidden (tab switch) or the
  // browser tab is backgrounded. CSS animations replay from frame 0 when an
  // element comes back from `display: none`, so without this floats added
  // right before a tab switch would re-appear as ghost +1 on return.
  useEffect(() => {
    if (!visible) clearAllFloats();
  }, [visible, clearAllFloats]);

  useEffect(() => {
    const onVis = () => { if (document.hidden) clearAllFloats(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [clearAllFloats]);

  useEffect(() => () => clearAllFloats(), [clearAllFloats]);

  const addFloat = useCallback((text: string, color: string) => {
    if (!visible || document.hidden) return;
    const id = ++floatIdRef.current;
    setFloats(prev => [...prev, { id, text, color }]);
    const timer = setTimeout(() => {
      setFloats(prev => prev.filter(f => f.id !== id));
      floatTimersRef.current.delete(id);
    }, 1400);
    floatTimersRef.current.set(id, timer);
  }, [visible]);

  // Show the planet float when the reveal phase fires (end of cinematic).
  useEffect(() => {
    if (forgePhase === "revealed" && pendingFloatRef.current) {
      const m = pendingFloatRef.current.model;
      addFloat(`✦ ${m.name}!`, RARITY_PAINT[m.rarity] || m.primaryColor);
      const drop = pendingFloatRef.current.equipmentDrop;
      if (drop) {
        setTimeout(() => {
          if (drop.item) {
            const cat = EQUIPMENT_CATEGORIES[drop.item.category];
            const rar = EQUIPMENT_RARITY_INFO[drop.item.rarity];
            addFloat(`🛠 ${rar.label} ${cat.label.replace(/s$/, "")}!`, rar.color);
          } else {
            const rar = EQUIPMENT_RARITY_INFO[drop.rarity];
            addFloat(`+${drop.convertedToZoom} $ZOOM (cap raggiunto)`, rar.color);
          }
        }, 220);
      }
      pendingFloatRef.current = null;
    }
  }, [forgePhase, addFloat]);

  const handleCraft = useCallback(() => {
    if (!canCraft) return;
    hapticLight();
    const result = onCraft(stardustBalance);
    if (result.completed && result.broken && result.brokenRarity) {
      try {
        const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred?: (s: string) => void } } } }).Telegram?.WebApp;
        tg?.HapticFeedback?.notificationOccurred?.("error");
      } catch { /**/ }
      const id = ++floatIdRef.current;
      setBrokenFlash({ id, rarity: result.brokenRarity });
      if (brokenTimerRef.current) clearTimeout(brokenTimerRef.current);
      brokenTimerRef.current = setTimeout(() => {
        setBrokenFlash((curr) => (curr && curr.id === id ? null : curr));
        brokenTimerRef.current = null;
      }, 4000);
      return;
    }
    if (result.completed && !result.broken) {
      pendingEquipmentDropRef.current = result.equipmentDrop || undefined;
    }
  }, [canCraft, onCraft]);

  useEffect(() => () => {
    if (brokenTimerRef.current) clearTimeout(brokenTimerRef.current);
  }, []);

  const handleClaim = useCallback(() => {
    onClaim();
  }, [onClaim]);

  const rarityClass: Record<string, string> = {
    BASIC: "basic-text",
    RARE: "rare-text",
    EPIC: "epic-text",
    MYTHIC: "mythic-text",
    GOLD: "gold-text",
    LEGEND: "gold-text",
    V1: "gold-text",
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Widgets stay mounted across tab switches — the parent tab container
          uses display:none when the LAB tab is inactive, which already hides
          these fixed-position widgets. Unmounting them on every tab switch
          caused visible flashes (re-fetch + animation restarts on remount). */}
      <AutoTapWidget
        hasAutoTap={hasAutoTap}
        canCraft={canCraft}
        telegramId={telegramId}
        onTap={handleCraft}
      />

      <div
        className="relative flex-1"
        style={{ minHeight: 0 }}
        onClick={canCraft && forgePhase === "idle" ? handleCraft : undefined}
      >
        {/* Fixed $ZOOM balance — Lab viewport only */}
        <div
          className="absolute top-3 left-0 right-0 z-30 flex justify-center pointer-events-none"
          data-testid="lab-zoom-balance"
        >
          <div
            className="px-5 py-2 rounded-full"
            style={{
              background: "rgba(0, 0, 0, 0.62)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
            }}
          >
            <span
              className="font-black text-base tracking-wide"
              style={{ color: "#ffffff", letterSpacing: "0.06em" }}
            >
              {Math.floor(balance).toLocaleString()} $ZOOM
            </span>
          </div>
        </div>

        <PlanetCanvas
          onPunch={canCraft && forgePhase === "idle" ? handleCraft : undefined}
          progress={taps}
          goal={goal}
          accentColor={dynamicColor}
          pendingModel={pendingModel}
          forgingModel={forgingModel}
          forgePhase={forgePhase}
          forgeRolling={forgeRolling}
        />

        {floats.map(f => (
          <div
            key={f.id}
            className="absolute pointer-events-none font-black text-xl float-up"
            style={{
              left: "50%", top: "38%",
              transform: "translate(-50%, -50%)",
              color: f.color,
              textShadow: `0 0 12px ${f.color}`,
              zIndex: 50,
            }}
          >
            {f.text}
          </div>
        ))}

        {brokenFlash && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 60 }}
          >
            <div
              key={brokenFlash.id}
              className="broken-pop rounded-2xl px-7 py-5 text-center"
              style={{
                background: "rgba(20, 6, 8, 0.92)",
                border: "1.5px solid rgba(255, 80, 80, 0.55)",
                boxShadow: "0 0 28px rgba(255, 60, 60, 0.45), 0 0 0 1px rgba(255,80,80,0.12) inset",
                maxWidth: "min(82vw, 320px)",
              }}
            >
              <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 6 }}>💥</div>
              <div
                className="font-black tracking-widest"
                style={{ fontSize: 14, color: "#ff5555", textShadow: "0 0 12px rgba(255,80,80,0.7)", letterSpacing: "0.18em" }}
              >
                {t("lab.planetBroken")}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 6, fontWeight: 600 }}>
                {t("lab.brokenBody", { kind: PLANET_CONFIG[brokenFlash.rarity].label })}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4, fontWeight: 500 }}>
                {t("lab.tryAgainNext")}
              </div>
            </div>
          </div>
        )}

        {isFull && (
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="glass rounded-2xl px-6 py-4 text-center">
              <div className="text-amber-400 font-black text-base tracking-widest mb-1">{t("lab.farmFull")}</div>
              <div className="text-xs text-muted-foreground">{t("lab.farmFullHint")}</div>
            </div>
          </div>
        )}

        {/* CLAIM button — only shown after the planet reveal animation
            completes so the moment feels earned. Fades in via CSS. */}
        {pendingModel && showClaim && (
          <div
            className="absolute left-1/2 flex flex-col items-center gap-3 forge-claim-fade-in"
            style={{
              top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 30,
              pointerEvents: "none",
            }}
          >
            <div
              className="rounded-2xl px-5 py-3 flex flex-col items-center gap-1 border"
              style={{
                borderColor: (RARITY_PAINT[pendingModel.rarity] || pendingModel.primaryColor) + "55",
                background: "rgba(6,8,16,0.78)",
                boxShadow: `0 0 20px ${(RARITY_PAINT[pendingModel.rarity] || pendingModel.primaryColor)}33`,
                pointerEvents: "auto",
              }}
            >
              <span className={`font-black text-[11px] tracking-[0.22em] ${rarityClass[pendingModel.rarity] ?? ""}`}>
                {pendingModel.rarity}
              </span>
              <span className="font-black text-sm tracking-wider" style={{ color: "#fff" }}>
                {pendingModel.name}
              </span>
              <span className="text-[10px] font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                +{pendingModel.rate.toLocaleString()}/hr · float {(pendingModel.float / 100).toFixed(3)}
              </span>
            </div>
            <button
              className="px-8 py-3.5 rounded-xl font-black text-sm tracking-wider uppercase active:scale-95 border whitespace-nowrap"
              onClick={handleClaim}
              style={{
                background: `linear-gradient(135deg, ${RARITY_PAINT[pendingModel.rarity] || pendingModel.primaryColor}, ${pendingModel.accentColor})`,
                color: "#060810",
                boxShadow: `0 0 32px ${(RARITY_PAINT[pendingModel.rarity] || pendingModel.primaryColor)}88, 0 4px 16px rgba(0,0,0,0.4)`,
                borderColor: "transparent",
                pointerEvents: "auto",
              }}
              data-testid="button-claim-model"
            >
              SEND TO FARM
            </button>
          </div>
        )}

        {pendingPlanet && showClaim && !pendingModel && (
          <div
            className="absolute left-1/2 flex flex-col items-center gap-3 forge-claim-fade-in"
            style={{
              top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 30,
              pointerEvents: "none",
            }}
          >
            <div
              className="rounded-full px-4 py-1.5 flex items-center gap-2 border"
              style={{
                borderColor: pendingPlanet.color + "55",
                background: "rgba(6,8,16,0.65)",
                boxShadow: `0 0 20px ${pendingPlanet.color}33`,
                pointerEvents: "auto",
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: pendingPlanet.color, boxShadow: `0 0 6px ${pendingPlanet.color}` }}
              />
              <span className={`font-black text-xs tracking-wider ${rarityClass[pendingPlanet.name]}`}>
                {PLANET_CONFIG[pendingPlanet.name].label.toUpperCase()}
              </span>
              <span className="text-[10px] font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                +{pendingPlanet.rate.toLocaleString()}/hr
              </span>
            </div>
            <button
              className="px-8 py-3.5 rounded-xl font-black text-sm tracking-wider uppercase active:scale-95 border whitespace-nowrap"
              onClick={handleClaim}
              style={{
                background: `linear-gradient(135deg, ${pendingPlanet.color}, ${pendingPlanet.color}bb)`,
                color: "#060810",
                boxShadow: `0 0 32px ${pendingPlanet.color}88, 0 4px 16px rgba(0,0,0,0.4)`,
                borderColor: "transparent",
                pointerEvents: "auto",
              }}
              data-testid="button-claim-planet"
            >
              {t("lab.claimPlanet")}
            </button>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-5 pb-6 pt-2 flex flex-col gap-3">
        {/* Bottom row stays mounted across pendingPlanet toggles so the
            avatar's bob/glow animations don't restart on every craft cycle.
            The CRAFT button is hidden during the planet-reveal cinematic but
            the avatar (and its modal state) are preserved. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {pendingPlanet ? (
            <div style={{ flex: 1 }} aria-hidden="true" />
          ) : (
            <button
              className="btn-craft"
              onClick={handleCraft}
              disabled={!canCraft}
              data-testid="button-craft"
              style={{ flex: 1 }}
            >
              {isFull ? t("lab.farmFull") : !canCraft ? t("lab.noStardust") : t("lab.forgePlanet")}
            </button>
          )}
          <PixelAvatar
            size={60}
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
            sunCount={sunCount}
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
            stellaPlanets={stellaPlanets}
            stellaRossaCollectionUnlocked={stellaRossaCollectionUnlocked}
            stellaRossaCollectionBundles={stellaRossaCollectionBundles}
            onPlaceStellaRossaPlanet={onPlaceStellaRossaPlanet}
            onCollectStellaRossaPlanet={onCollectStellaRossaPlanet}
            onMarkStellaRossaPlanetReactivated={onMarkStellaRossaPlanetReactivated}
            redStarBalance={redStarBalance}
            onRedStarBalanceUpdate={onRedStarBalanceUpdate}
            onUpgradeCollectionDuration={onUpgradeCollectionDuration}
          />
        </div>

        {!pendingPlanet && (
          <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            <span>
              {currentCraftRarity
                ? t("lab.tapsNeeded", { n: goal })
                : t("lab.perTap")}
            </span>
            <span>{t("lab.slotsFree", { n: Math.max(0, maxSlots - planets.length) })}</span>
          </div>
        )}

        {/* ─── ITEM FORGE PANEL ─────────────────────────────────────────
            Collapsible catalog of all 12 collectible items. Each item
            shows its emoji, rarity, passive rate, and stardust cost.
            Tapping FORGE calls onCraftItem and shows a result toast. */}
        {onCraftItem && <ItemForgePanel stardustBalance={stardustBalance} onCraftItem={onCraftItem} />}
      </div>

    </div>
  );
}

/** ItemForgePanel — shown below the planet-forge area in the Lab. */
function ItemForgePanel({
  stardustBalance,
  onCraftItem,
}: {
  stardustBalance: number;
  onCraftItem: (itemType: string) => Promise<{ won: boolean; message?: string; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [crafting, setCrafting] = useState<string | null>(null);
  const [resultToast, setResultToast] = useState<{ won: boolean; msg: string } | null>(null);

  const showResult = (won: boolean, msg: string) => {
    setResultToast({ won, msg });
    setTimeout(() => setResultToast(null), 3200);
  };

  const handleForge = async (type: string, cost: number) => {
    if (stardustBalance < cost) {
      showResult(false, `Need ${cost}★ stardust`);
      return;
    }
    setCrafting(type);
    const res = await onCraftItem(type);
    setCrafting(null);
    if (res.error) {
      showResult(false, res.error);
    } else {
      showResult(!!res.won, res.message ?? (res.won ? "Item forged!" : "No luck this time!"));
    }
  };

  return (
    <div className="flex flex-col gap-0 mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all"
        style={{
          background: open ? "rgba(196,113,237,0.10)" : "rgba(30,20,50,0.5)",
          border: "1px solid rgba(196,113,237,0.22)",
          color: "#c471ed",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 18 }}>⚗️</span>
          <span className="font-black text-xs tracking-widest">FORGE ITEM</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold opacity-60">{stardustBalance.toLocaleString()}★</span>
          <span className="text-xs" style={{ opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {resultToast && (
        <div
          className="mt-2 rounded-xl px-4 py-2 text-xs font-bold text-center slot-enter"
          style={{
            background: resultToast.won ? "rgba(0,230,118,0.10)" : "rgba(196,113,237,0.10)",
            color: resultToast.won ? "#00e676" : "#c471ed",
            border: `1px solid ${resultToast.won ? "rgba(0,230,118,0.25)" : "rgba(196,113,237,0.25)"}`,
          }}
        >
          {resultToast.msg}
        </div>
      )}

      {open && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ITEM_TYPES_ORDERED.map((type) => {
            const cfg = ITEM_CONFIG[type];
            const rarityColor = ITEM_RARITY_COLOR[cfg.rarity];
            const canAfford = stardustBalance >= cfg.craftCost;
            const isCrafting = crafting === type;
            return (
              <div
                key={type}
                className="rounded-xl flex flex-col items-center gap-1.5 p-2 border slot-enter"
                style={{
                  background: `${rarityColor}0d`,
                  borderColor: `${rarityColor}28`,
                }}
              >
                {/* Emoji with glow */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{
                    background: `radial-gradient(circle at 40% 35%, ${rarityColor}44 0%, ${rarityColor}18 70%, rgba(6,8,16,0.8) 100%)`,
                    boxShadow: `0 0 14px ${cfg.glowColor}`,
                  }}
                >
                  {cfg.emoji}
                </div>
                <div className="text-center" style={{ lineHeight: 1.3 }}>
                  <div className="text-[9px] font-black" style={{ color: rarityColor }}>
                    {cfg.rarity}
                  </div>
                  <div className="text-[8px]" style={{ color: "rgba(220,235,255,0.55)" }}>
                    +{cfg.rate}/hr
                  </div>
                </div>
                <button
                  onClick={() => { if (!isCrafting) void handleForge(type, cfg.craftCost); }}
                  disabled={!canAfford || !!crafting}
                  className="w-full py-1 rounded-lg text-[9px] font-black border transition-all active:scale-95"
                  style={{
                    borderColor: canAfford ? `${rarityColor}44` : "rgba(255,255,255,0.07)",
                    background: canAfford ? `${rarityColor}12` : "transparent",
                    color: canAfford ? rarityColor : "rgba(255,255,255,0.2)",
                    cursor: canAfford && !crafting ? "pointer" : "not-allowed",
                  }}
                >
                  {isCrafting ? "…" : `${cfg.craftCost}★`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

