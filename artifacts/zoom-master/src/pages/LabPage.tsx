import { useState, useCallback, useEffect, useRef } from "react";
import { PlanetCanvas, type ForgePhase } from "../components/PlanetCanvas";
import { AutoTapWidget } from "../components/AutoTapWidget";
import { RarityForgeWheel } from "../components/RarityForgeWheel";
import { FarmInventoryCard } from "../components/FarmInventoryCard";
import { MerchantPopup } from "../components/MerchantPopup";

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
  forgePlanetBuild?: boolean;
  forgeRolling?: boolean;
  hasAutoTap: boolean;
  stardustBalance: number;
  telegramId: string | null;
  onCraft: (availableStardust?: number) => { completed: boolean; tapsLeft?: number; broken?: boolean; brokenRarity?: PlanetType };
  onClaim: () => void;
  onMerchantScrap?: (planetId: string, planetType: string) => Promise<{ ok: boolean; reward?: number; reason?: string }>;
  onBurnPlanet?: (id: string) => void;
  visible?: boolean;
}

interface FloatMsg { id: number; text: string; color: string }

const GREY = "#8892b0";

export function LabPage({ balance, taps, goal, planets, maxSlots, currentCraftRarity, pendingPlanet, forgePlanetBuild = false, forgeRolling = false, hasAutoTap, stardustBalance, telegramId, onCraft, onClaim, onMerchantScrap, onBurnPlanet, visible = true }: LabPageProps) {
  const { t } = useT();
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const floatIdRef = useRef(0);
  const floatTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [brokenFlash, setBrokenFlash] = useState<{ id: number; rarity: PlanetType } | null>(null);
  const brokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFloatRef = useRef<{ planet: Planet } | null>(null);

  // Forge phase state machine: drives the visual sequence after the user
  // hits 100% — flash → 2s dramatic wait → model reveal → claim button.
  const [forgePhase, setForgePhase] = useState<ForgePhase>("idle");
  const [tapSignal, setTapSignal] = useState(0);
  const [tapRelaxed, setTapRelaxed] = useState(true);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showClaim, setShowClaim] = useState(false);

  useEffect(() => {
    if (pendingPlanet && forgePhase === "idle" && !pendingFloatRef.current) {
      pendingFloatRef.current = { planet: pendingPlanet };
    }
  }, [pendingPlanet, forgePhase]);

  useEffect(() => {
    if (pendingPlanet && forgePhase === "idle") {
      setForgePhase("wheel");
      setShowClaim(false);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    } else if (!pendingPlanet && forgePhase !== "idle") {
      setForgePhase("idle");
      setShowClaim(false);
      pendingFloatRef.current = null;
      if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
      if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
      if (claimTimerRef.current) { clearTimeout(claimTimerRef.current); claimTimerRef.current = null; }
    }
  }, [pendingPlanet, forgePhase]);

  const handleWheelComplete = useCallback(() => {
    setForgePhase("flash");
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setForgePhase("revealed");
      flashTimerRef.current = null;
      if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
      claimTimerRef.current = setTimeout(() => {
        setShowClaim(true);
      }, 2200);
    }, 380);
  }, []);

  // (moved below addFloat — see the effect at ~line 185)

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
  }, []);

  const isFull = planets.length >= maxSlots && !pendingPlanet;
  const effectiveStardust = stardustBalance;
  const canCraft = !brokenFlash && !pendingPlanet && !forgeRolling && planets.length < maxSlots && (currentCraftRarity
    ? true
    : (effectiveStardust >= (PLANET_CONFIG["BASIC"].craftCost ?? 2)));

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
      const p = pendingFloatRef.current.planet;
      addFloat(`✦ ${PLANET_CONFIG[p.name].label}!`, p.color);
      pendingFloatRef.current = null;
    }
  }, [forgePhase, addFloat]);

  const handleCraft = useCallback((opts?: { particles?: boolean; relaxed?: boolean }) => {
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
    if (opts?.particles !== false) {
      setTapRelaxed(opts?.relaxed !== false);
      setTapSignal((n) => n + 1);
    }
  }, [canCraft, onCraft, stardustBalance]);

  useEffect(() => () => {
    if (brokenTimerRef.current) clearTimeout(brokenTimerRef.current);
  }, []);

  const handleClaim = useCallback(() => {
    onClaim();
  }, [onClaim]);

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <AutoTapWidget
        hasAutoTap={hasAutoTap}
        canCraft={canCraft}
        telegramId={telegramId}
        onTap={() => handleCraft({ relaxed: true })}
      />

      <div
        className="relative flex-1"
        style={{ minHeight: 0 }}
        onClick={canCraft && forgePhase === "idle" ? () => handleCraft({ relaxed: true }) : undefined}
      >
        <PlanetCanvas
          backdrop
          onPunch={canCraft && forgePhase === "idle" ? () => handleCraft({ relaxed: true }) : undefined}
          tapSignal={tapSignal}
          tapRelaxed={tapRelaxed}
          progress={taps}
          goal={goal}
          accentColor={dynamicColor}
          pendingPlanet={pendingPlanet}
          forgePlanetBuild={forgePlanetBuild}
          craftRarity={currentCraftRarity}
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
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="glass rounded-2xl px-6 py-4 text-center">
              <div className="text-amber-400 font-black text-base tracking-widest mb-1">{t("lab.farmFull")}</div>
              <div className="text-xs text-muted-foreground">{t("lab.farmFullHint")}</div>
            </div>
          </div>
        )}

        {pendingPlanet && forgePhase === "wheel" && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              zIndex: 45,
              background: "radial-gradient(circle at 50% 42%, rgba(255,215,64,0.12) 0%, rgba(4,6,12,0.92) 55%, rgba(4,6,12,0.97) 100%)",
              backdropFilter: "blur(6px)",
              pointerEvents: "auto",
            }}
          >
            <RarityForgeWheel
              targetRarity={pendingPlanet.name}
              onComplete={handleWheelComplete}
              size={Math.min(320, typeof window !== "undefined" ? window.innerWidth - 48 : 300)}
            />
          </div>
        )}

        {pendingPlanet && forgePhase === "flash" && (
          <div
            className="absolute inset-0 forge-flash pointer-events-none"
            style={{
              zIndex: 46,
              background: `radial-gradient(circle at 50% 50%, ${pendingPlanet.color}88 0%, rgba(255,255,255,0.35) 28%, transparent 68%)`,
            }}
          />
        )}

        {pendingPlanet && forgePhase === "revealed" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ zIndex: 40, padding: "0 12px" }}
          >
            <div className="forge-reveal pointer-events-none" style={{ width: "min(92vw, 268px)" }}>
              <FarmInventoryCard
                planet={pendingPlanet}
                variant="compact"
                suspendGl={false}
                eagerThumb
                testId="lab-reveal-planet-card"
              />
            </div>
          </div>
        )}

        {pendingPlanet && showClaim && (
          <div
            className="absolute left-1/2 flex flex-col items-center gap-3 forge-claim-fade-in"
            style={{
              bottom: "18%",
              transform: "translateX(-50%)",
              zIndex: 50,
              pointerEvents: "none",
            }}
          >
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

        {telegramId && onMerchantScrap && onBurnPlanet && visible && (
          <MerchantPopup
            planets={planets}
            onScrap={onMerchantScrap}
            onBurnPlanet={onBurnPlanet}
          />
        )}
      </div>

      <div className="flex-shrink-0 px-5 pb-6 pt-2 flex flex-col gap-3">
        <div style={{ display: "flex", alignItems: "center" }}>
          {!pendingPlanet && (
            <button
              className="btn-craft"
              onClick={() => handleCraft({ relaxed: true })}
              disabled={!canCraft}
              data-testid="button-craft"
              style={{ width: "100%" }}
            >
              {isFull ? t("lab.farmFull") : !canCraft ? t("lab.noStardust") : t("lab.forgePlanet")}
            </button>
          )}
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
      </div>
    </div>
  );
}
