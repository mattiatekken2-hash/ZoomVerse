import { useState, useCallback, useEffect, useRef } from "react";
import { PlanetCanvas, type ForgePhase } from "../components/PlanetCanvas";
import { AutoTapWidget } from "../components/AutoTapWidget";
import { HallOfFameWidget } from "../components/HallOfFameWidget";
import { PixelAvatar } from "../components/PixelAvatar";
import { LabRankWidget } from "../components/LabRankWidget";
import { PvpRankWidget } from "../components/PvpRankWidget";
import { ExchangeWidget } from "../components/ExchangeWidget";
import { StellaRossaCollectionWidget } from "../components/StellaRossaCollectionWidget";
import { ZoomStoreWidget } from "../components/ZoomStoreWidget";

import type { Planet, PlanetType } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";
import { hapticLight } from "../utils/haptic";
import { useT } from "../i18n/LanguageContext";
import { UNIFIED_FORGE_COST } from "../utils/season3Forge";


interface LabPageProps {
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  maxSlots: number;
  currentCraftRarity: PlanetType | null;
  pendingPlanet: Planet | null;
  hasAutoTap: boolean;
  sunCount: number;
  tonBalance: number;
  depositBalance: number;
  stardustBalance: number;
  telegramId: string | null;
  onUnifiedForge: () => Promise<void>;
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
  visible?: boolean;
}

interface FloatMsg { id: number; text: string; color: string }

const GREY = "#8892b0";
const REVEAL_THRESHOLD = 0.90;

export function LabPage({ balance, taps, goal, planets, maxSlots, currentCraftRarity, pendingPlanet, hasAutoTap, sunCount, tonBalance, depositBalance, stardustBalance, telegramId, onUnifiedForge, onPurchase, onClaim, whiteCollectionUnlocked, whiteCollectionBundles, whitePlanets, earthCollectionUnlocked, earthCollectionBundles, earthPlanets, blackCollectionUnlocked, blackCollectionBundles, blackPlanets, supernovaCollectionUnlocked, supernovaCollectionBundles, supernovaPlanets, onPlaceWhitePlanet, onCollectWhitePlanet, onReactivateWhitePlanet, onMarkWhitePlanetReactivated, onPlaceEarthPlanet, onCollectEarthPlanet, onReactivateEarthPlanet, onMarkEarthPlanetReactivated, onPlaceBlackPlanet, onCollectBlackPlanet, onReactivateBlackPlanet, onMarkBlackPlanetReactivated, onPlaceSupernovaPlanet, onCollectSupernovaPlanet, onReactivateSupernovaPlanet, onMarkSupernovaPlanetReactivated, stellaRossaCollectionUnlocked, stellaRossaCollectionBundles, stellaPlanets, stellaLastClaimAt, onStellaClaimDaily, onPlaceStellaRossaPlanet, onCollectStellaRossaPlanet, onReactivateStellaRossaPlanet, onMarkStellaRossaPlanetReactivated, redStarBalance = 0, onRedStarBalanceUpdate, onUpgradeCollectionDuration, visible = true }: LabPageProps) {
  const { t } = useT();
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const floatIdRef = useRef(0);
  const floatTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [forging, setForging] = useState(false);
  const pendingFloatRef = useRef<{ planet: Planet } | null>(null);

  // Forge phase state machine: drives the visual sequence after the user
  // hits 100% — flash → 2s dramatic wait → planet reveal → claim button.
  // The pendingPlanet from the parent already exists from the moment craft
  // completes; we just gate when the user *sees* the planet so the moment
  // feels earned.
  const [forgePhase, setForgePhase] = useState<ForgePhase>("idle");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showClaim, setShowClaim] = useState(false);

  useEffect(() => {
    if (pendingPlanet) {
      pendingFloatRef.current = { planet: pendingPlanet };
    }
  }, [pendingPlanet]);

  useEffect(() => {
    if (pendingPlanet && forgePhase === "idle") {
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
      // Claim button appears after the planet has rotated on screen for ~3.5s.
      claimTimerRef.current = setTimeout(() => {
        setShowClaim(true);
      }, 220 + 2000 + 3500);
    } else if (!pendingPlanet && forgePhase !== "idle") {
      // User claimed (or pendingPlanet cleared otherwise) — reset.
      setForgePhase("idle");
      setShowClaim(false);
      pendingFloatRef.current = null;
      if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
      if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
      if (claimTimerRef.current) { clearTimeout(claimTimerRef.current); claimTimerRef.current = null; }
    }
  }, [pendingPlanet, forgePhase]);

  // (moved below addFloat — see the effect at ~line 185)

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
  }, []);

  const isFull = planets.length >= maxSlots && !pendingPlanet;
  const effectiveStardust = stardustBalance;
  const canCraft = !pendingPlanet && !forging && planets.length < maxSlots && (effectiveStardust >= UNIFIED_FORGE_COST);

  const progress = goal > 0 ? taps / goal : 0;

  const dynamicColor = pendingPlanet
    ? pendingPlanet.color
    : currentCraftRarity && progress >= REVEAL_THRESHOLD
    ? PLANET_CONFIG[currentCraftRarity].color
    : GREY;

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
      const p = pendingFloatRef.current.planet;
      addFloat(`✦ ${PLANET_CONFIG[p.name].label}!`, p.color);
      pendingFloatRef.current = null;
    }
  }, [forgePhase, addFloat]);

  const handleCraft = useCallback(async () => {
    if (!canCraft) return;
    hapticLight();
    setForging(true);
    try {
      await onUnifiedForge();
    } finally {
      setForging(false);
    }
  }, [canCraft, onUnifiedForge]);

  const handleClaim = useCallback(() => {
    onClaim();
  }, [onClaim]);

  const rarityClass: Record<string, string> = {
    BASIC: "basic-text",
    RARE: "rare-text",
    EPIC: "epic-text",
    MYTHIC: "mythic-text",
    GOLD: "gold-text",
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
      <HallOfFameWidget telegramId={telegramId} />
      <LabRankWidget telegramId={telegramId} sunCount={sunCount} balance={balance} />
      <PvpRankWidget telegramId={telegramId} />
      <ExchangeWidget balance={balance} sunCount={sunCount} />
      <StellaRossaCollectionWidget
        telegramId={telegramId}
        unlocked={stellaRossaCollectionUnlocked}
        ownedBundles={stellaRossaCollectionBundles}
        lastClaimAt={stellaLastClaimAt}
        onClaim={onStellaClaimDaily}
      />
      <ZoomStoreWidget />

      <div
        className="relative flex-1"
        style={{ minHeight: 0 }}
        onClick={canCraft && forgePhase === "idle" ? handleCraft : undefined}
      >
        <PlanetCanvas
          onPunch={canCraft && forgePhase === "idle" ? handleCraft : undefined}
          progress={taps}
          goal={goal}
          planetColor={dynamicColor}
          pendingPlanet={pendingPlanet}
          currentCraftRarity={progress >= REVEAL_THRESHOLD ? currentCraftRarity : null}
          forgePhase={forgePhase}
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
        {pendingPlanet && showClaim && (
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
              className="btn-craft s3-bw-btn"
              onClick={() => { void handleCraft(); }}
              disabled={!canCraft}
              data-testid="button-craft"
              style={{ flex: 1 }}
            >
              {isFull ? t("lab.farmFull") : !canCraft ? t("lab.noStardust") : `FORGE · ${UNIFIED_FORGE_COST}★`}
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
            <span>Planet or 3D item · {UNIFIED_FORGE_COST}★ per forge</span>
            <span>{t("lab.slotsFree", { n: Math.max(0, maxSlots - planets.length) })}</span>
          </div>
        )}
      </div>

    </div>
  );
}
