import { useState, useCallback, useEffect, useRef } from "react";
import { PlanetCanvas, type ForgePhase } from "../components/PlanetCanvas";
import { AutoTapWidget } from "../components/AutoTapWidget";
import { MysteryBoxWidget } from "../components/MysteryBoxWidget";
import { HallOfFameWidget } from "../components/HallOfFameWidget";
import { PixelAvatar } from "../components/PixelAvatar";
import { WhiteCollectionWidget } from "../components/WhiteCollectionWidget";
import { EarthCollectionWidget } from "../components/EarthCollectionWidget";
import { LottoStellareWidget } from "../components/LottoStellareWidget";
import { V1NftWidget } from "../components/V1NftWidget";
import type { Planet, PlanetType } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";
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
  hasAutoTap: boolean;
  whiteCollectionUnlocked: boolean;
  whiteCollectionBundles: number;
  whitePlanets: Planet[];
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  earthPlanets: Planet[];
  sunCount: number;
  tonBalance: number;
  telegramId: string | null;
  onCraft: () => { completed: boolean; planet?: Planet; tapsLeft?: number; broken?: boolean; brokenRarity?: PlanetType };
  onClaim: () => void;
  onPlaceWhitePlanet: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectWhitePlanet: (planetId: string) => void;
  onReactivateWhitePlanet: (planetId: string) => { ok: boolean; reason?: string };
  onMarkWhitePlanetReactivated: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceEarthPlanet: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectEarthPlanet: (planetId: string) => void;
  onReactivateEarthPlanet: (planetId: string) => { ok: boolean; reason?: string };
  onMarkEarthPlanetReactivated: (planetId: string) => { ok: boolean; reason?: string };
  visible?: boolean;
  /** When true, the radar LED next to the Earth widget pulses red so the
   *  player notices the merchant even if the popup hasn't yet rendered. */
  merchantActive?: boolean;
}

interface FloatMsg { id: number; text: string; color: string }

const GREY = "#8892b0";
const REVEAL_THRESHOLD = 0.90;

export function LabPage({ balance, taps, goal, planets, maxSlots, currentCraftRarity, pendingPlanet, hasAutoTap, whiteCollectionUnlocked, whiteCollectionBundles, whitePlanets, earthCollectionUnlocked, earthCollectionBundles, earthPlanets, sunCount, tonBalance, telegramId, onCraft, onClaim, onPlaceWhitePlanet, onCollectWhitePlanet, onReactivateWhitePlanet, onMarkWhitePlanetReactivated, onPlaceEarthPlanet, onCollectEarthPlanet, onReactivateEarthPlanet, onMarkEarthPlanetReactivated, visible = true, merchantActive = false }: LabPageProps) {
  const { t } = useT();
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const floatIdRef = useRef(0);
  const floatTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [brokenFlash, setBrokenFlash] = useState<{ id: number; rarity: PlanetType } | null>(null);
  const brokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (pendingPlanet && forgePhase === "idle") {
      // Just completed a craft — kick off the cinematic.
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
      // Claim button fades in shortly after the planet appears.
      claimTimerRef.current = setTimeout(() => {
        setShowClaim(true);
      }, 220 + 2000 + 400);
    } else if (!pendingPlanet && forgePhase !== "idle") {
      // User claimed (or pendingPlanet cleared otherwise) — reset.
      setForgePhase("idle");
      setShowClaim(false);
      if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
      if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
      if (claimTimerRef.current) { clearTimeout(claimTimerRef.current); claimTimerRef.current = null; }
    }
  }, [pendingPlanet, forgePhase]);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
  }, []);

  const isFull = planets.length >= maxSlots && !pendingPlanet;
  const canCraft = !pendingPlanet && planets.length < maxSlots && balance >= 1;

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

  const handleCraft = useCallback(() => {
    if (!canCraft) return;
    hapticLight();
    const result = onCraft();
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
      }, 2600);
      return;
    }
    if (result.completed && result.planet) {
      const p = result.planet;
      addFloat(`✦ ${PLANET_CONFIG[p.name].label}!`, p.color);
    }
  }, [canCraft, onCraft, addFloat]);

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
      <MysteryBoxWidget telegramId={telegramId} />
      <HallOfFameWidget telegramId={telegramId} />
      <WhiteCollectionWidget telegramId={telegramId} unlocked={whiteCollectionUnlocked} ownedBundles={whiteCollectionBundles} sunCount={sunCount} />
      <EarthCollectionWidget telegramId={telegramId} unlocked={earthCollectionUnlocked} ownedBundles={earthCollectionBundles} sunCount={sunCount} />
      <LottoStellareWidget telegramId={telegramId} />
      <V1NftWidget telegramId={telegramId} />
      {/* Space-merchant radar LED — small red blink near the Earth widget so
          the user spots the encounter even with the popup minimised by a tab
          switch. Hidden when no merchant is currently in the system. */}
      {merchantActive && (
        <div
          aria-label={t("lab.merchantNearby")}
          title={t("lab.merchantNearby")}
          style={{
            position: "fixed",
            left: 12,
            top: 178,
            zIndex: 55,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#ff2d2d",
            boxShadow: "0 0 10px #ff2d2d, 0 0 18px rgba(255,45,45,0.6)",
            animation: "merchant-radar-blink 0.9s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
      )}
      <style>{`@keyframes merchant-radar-blink { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.25; transform: scale(0.7); } }`}</style>
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
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
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
            style={{ background: "rgba(6,8,16,0.5)", backdropFilter: "blur(4px)", zIndex: 20 }}
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
                backdropFilter: "blur(8px)",
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
              {isFull ? t("lab.farmFull") : balance < 1 ? t("lab.noZoom") : t("lab.forgePlanet")}
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
          />
        </div>

        {!pendingPlanet && (
          <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            <span>
              {currentCraftRarity
                ? t("lab.tapsNeeded", { n: PLANET_CONFIG[currentCraftRarity].tapsNeeded })
                : t("lab.perTap")}
            </span>
            <span>{t("lab.slotsFree", { n: Math.max(0, maxSlots - planets.length) })}</span>
          </div>
        )}
      </div>

    </div>
  );
}

