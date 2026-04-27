import { useState, useCallback, useEffect, useRef } from "react";
import { PlanetCanvas, type ForgePhase } from "../components/PlanetCanvas";
import { AutoTapWidget } from "../components/AutoTapWidget";
import { MysteryBoxWidget } from "../components/MysteryBoxWidget";
import { PixelAvatar } from "../components/PixelAvatar";
import { WhiteCollectionWidget } from "../components/WhiteCollectionWidget";
import { EarthCollectionWidget } from "../components/EarthCollectionWidget";
import type { Planet, PlanetType } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";
import { hapticLight } from "../utils/haptic";
import { useT } from "../i18n/LanguageContext";
import type { StardustCollectResult } from "../utils/api";


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
  // Stardust spawn props — the spawn timer + SUN gate live in this page so
  // the floating star is only visible while the user is actually in the Lab.
  stardustHasSun: boolean;
  stardustToday: number;
  stardustDailyCap: number;
  onCollectStardust: () => Promise<StardustCollectResult>;
}

interface FloatMsg { id: number; text: string; color: string }

const GREY = "#8892b0";
const REVEAL_THRESHOLD = 0.90;

export function LabPage({ balance, taps, goal, planets, maxSlots, currentCraftRarity, pendingPlanet, hasAutoTap, whiteCollectionUnlocked, whiteCollectionBundles, whitePlanets, earthCollectionUnlocked, earthCollectionBundles, earthPlanets, sunCount, tonBalance, telegramId, onCraft, onClaim, onPlaceWhitePlanet, onCollectWhitePlanet, onReactivateWhitePlanet, onMarkWhitePlanetReactivated, onPlaceEarthPlanet, onCollectEarthPlanet, onReactivateEarthPlanet, onMarkEarthPlanetReactivated, visible = true, stardustHasSun, stardustToday, stardustDailyCap, onCollectStardust }: LabPageProps) {
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

  // ─────── STARDUST spawn mechanic ────────────────────────────────
  // While the user is in the Lab, every 10–20 minutes a yellow star may
  // appear (50% probability). It despawns after 7s if not clicked. Click
  // requires SUN ownership (server-enforced too); on success we show a
  // golden burst + +1 float. Cap is enforced server-side; if the daily
  // cap is hit we surface a small "Daily limit reached" toast.
  const [spawnedStar, setSpawnedStar] = useState<{ id: number; x: number; y: number } | null>(null);
  const [stardustBurst, setStardustBurst] = useState<{ id: number; x: number; y: number } | null>(null);
  const [noSunPopup, setNoSunPopup] = useState(false);
  const [stardustToast, setStardustToast] = useState<string | null>(null);
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const despawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stardustIdRef = useRef(0);
  const stardustInFlightRef = useRef(false);

  const stardustCapReached = stardustToday >= stardustDailyCap;

  useEffect(() => {
    if (!visible) {
      // Pause spawn loop while the user is on a different tab. Existing
      // spawned stars are cleared so they don't sit there waiting.
      if (spawnTimerRef.current) { clearTimeout(spawnTimerRef.current); spawnTimerRef.current = null; }
      if (despawnTimerRef.current) { clearTimeout(despawnTimerRef.current); despawnTimerRef.current = null; }
      setSpawnedStar(null);
      return;
    }
    let cancelled = false;
    const scheduleNext = () => {
      if (cancelled) return;
      // 10–20 minutes (in dev/preview the admin can adjust if needed).
      const delayMs = (10 + Math.random() * 10) * 60 * 1000;
      spawnTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        // 50% spawn probability — keeps the appearance pleasingly rare.
        // Suppress spawn if today's cap is already reached (purely UX —
        // server still authoritative).
        if (Math.random() < 0.5 && !stardustCapReached) {
          const id = ++stardustIdRef.current;
          const x = 12 + Math.random() * 76;
          const y = 18 + Math.random() * 50;
          setSpawnedStar({ id, x, y });
          if (despawnTimerRef.current) clearTimeout(despawnTimerRef.current);
          despawnTimerRef.current = setTimeout(() => {
            setSpawnedStar((curr) => (curr && curr.id === id ? null : curr));
            despawnTimerRef.current = null;
          }, 7000);
        }
        scheduleNext();
      }, delayMs);
    };
    scheduleNext();
    return () => {
      cancelled = true;
      if (spawnTimerRef.current) { clearTimeout(spawnTimerRef.current); spawnTimerRef.current = null; }
      if (despawnTimerRef.current) { clearTimeout(despawnTimerRef.current); despawnTimerRef.current = null; }
    };
  }, [visible, stardustCapReached]);

  useEffect(() => () => {
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const handleStardustClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const star = spawnedStar;
    if (!star) return;
    if (stardustInFlightRef.current) return;
    // Remove the star immediately so spamming clicks doesn't double-fire.
    setSpawnedStar(null);
    if (despawnTimerRef.current) { clearTimeout(despawnTimerRef.current); despawnTimerRef.current = null; }

    if (!stardustHasSun) {
      setNoSunPopup(true);
      return;
    }
    stardustInFlightRef.current = true;
    hapticLight();
    // Optimistic golden burst at the star's position. The server is
    // authoritative — if it rejects (cap), we still show the burst (the
    // visual already played) and surface a toast.
    const burstId = ++stardustIdRef.current;
    setStardustBurst({ id: burstId, x: star.x, y: star.y });
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => {
      setStardustBurst((curr) => (curr && curr.id === burstId ? null : curr));
      burstTimerRef.current = null;
    }, 1200);

    try {
      const res = await onCollectStardust();
      if (res.ok) {
        addFloat("✦ +1 STARDUST", "#ffd740");
      } else if (res.reason === "DAILY_CAP") {
        setStardustToast("Daily Stardust limit reached.");
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setStardustToast(null), 2200);
      } else if (res.reason === "NO_SUN") {
        setNoSunPopup(true);
      }
    } finally {
      stardustInFlightRef.current = false;
    }
  }, [spawnedStar, stardustHasSun, onCollectStardust, addFloat]);
  // ────────────────────────────────────────────────────────────────

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
      <WhiteCollectionWidget telegramId={telegramId} unlocked={whiteCollectionUnlocked} ownedBundles={whiteCollectionBundles} sunCount={sunCount} />
      <EarthCollectionWidget telegramId={telegramId} unlocked={earthCollectionUnlocked} ownedBundles={earthCollectionBundles} sunCount={sunCount} />
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

        {/* Floating Stardust star — clickable. Position is randomized in
            % so it's responsive across screen sizes. */}
        {spawnedStar && (
          <button
            type="button"
            onClick={handleStardustClick}
            data-testid="stardust-spawn"
            aria-label="Collect stardust"
            className="stardust-spawn-pop"
            style={{
              position: "absolute",
              left: `${spawnedStar.x}%`,
              top: `${spawnedStar.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 70,
              width: 56,
              height: 56,
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              lineHeight: 1,
              color: "#ffd740",
              textShadow: "0 0 18px rgba(255,215,64,0.9), 0 0 36px rgba(255,179,71,0.6)",
              animation: "stardustFloat 2.4s ease-in-out infinite",
            }}
          >
            ★
          </button>
        )}

        {/* Golden particle burst — fires on a successful collect. */}
        {stardustBurst && (
          <div
            key={stardustBurst.id}
            className="pointer-events-none"
            style={{
              position: "absolute",
              left: `${stardustBurst.x}%`,
              top: `${stardustBurst.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 75,
              width: 0,
              height: 0,
            }}
          >
            {Array.from({ length: 10 }).map((_, i) => {
              const angle = (Math.PI * 2 * i) / 10;
              const dx = Math.cos(angle) * 60;
              const dy = Math.sin(angle) * 60;
              return (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, #fff7c2 0%, #ffd740 50%, rgba(255,179,71,0) 80%)",
                    boxShadow: "0 0 10px rgba(255,215,64,0.95)",
                    transform: `translate(-50%, -50%)`,
                    animation: `stardustBurst-${i} 1.1s ease-out forwards`,
                    // @ts-ignore — CSS custom props for keyframes
                    "--dx": `${dx}px`,
                    "--dy": `${dy}px`,
                  } as React.CSSProperties}
                />
              );
            })}
          </div>
        )}

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
                PLANET BROKEN!
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 6, fontWeight: 600 }}>
                Your {PLANET_CONFIG[brokenFlash.rarity].label} shattered during construction.
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4, fontWeight: 500 }}>
                Try again on the next craft.
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
              CLAIM PLANET
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
                ? `${PLANET_CONFIG[currentCraftRarity].tapsNeeded} taps · 1 $ZOOM each`
                : t("lab.perTap")}
            </span>
            <span>{t("lab.slotsFree", { n: Math.max(0, maxSlots - planets.length) })}</span>
          </div>
        )}
      </div>

      {/* Daily-cap toast — non-blocking, auto-dismisses. */}
      {stardustToast && (
        <div
          className="pointer-events-none"
          style={{
            position: "absolute",
            left: "50%",
            top: 84,
            transform: "translateX(-50%)",
            zIndex: 90,
            background: "rgba(20, 18, 6, 0.92)",
            border: "1px solid rgba(255, 215, 64, 0.45)",
            color: "#ffd740",
            padding: "8px 14px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            boxShadow: "0 0 18px rgba(255,215,64,0.25)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          {stardustToast}
        </div>
      )}

      {/* No-SUN modal — blocks until dismissed. */}
      {noSunPopup && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(6,8,16,0.65)", backdropFilter: "blur(6px)", zIndex: 100 }}
          onClick={() => setNoSunPopup(false)}
        >
          <div
            className="glass rounded-2xl px-6 py-5 text-center"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(86vw, 320px)",
              border: "1.5px solid rgba(255, 179, 71, 0.55)",
              boxShadow: "0 0 28px rgba(255, 179, 71, 0.35)",
            }}
          >
            <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 8 }}>☀</div>
            <div className="font-black tracking-wide" style={{ fontSize: 14, color: "#ffb347", letterSpacing: "0.06em" }}>
              SUN PROTECTION REQUIRED
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", marginTop: 8, fontWeight: 500, lineHeight: 1.45 }}>
              The star's heat is too strong! You need the SUN's protection to harvest it.
            </div>
            <button
              type="button"
              onClick={() => setNoSunPopup(false)}
              style={{
                marginTop: 14,
                padding: "8px 18px",
                borderRadius: 10,
                background: "rgba(255, 179, 71, 0.18)",
                border: "1px solid rgba(255, 179, 71, 0.5)",
                color: "#ffd089",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.06em",
                cursor: "pointer",
              }}
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
