import { useState, useCallback, useEffect, useRef } from "react";
import { PlanetCanvas } from "../components/PlanetCanvas";
import { AutoTapWidget } from "../components/AutoTapWidget";
import { MysteryBoxWidget } from "../components/MysteryBoxWidget";
import type { Planet, PlanetType } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";
import { hapticLight } from "../utils/haptic";


interface LabPageProps {
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  maxSlots: number;
  currentCraftRarity: PlanetType | null;
  pendingPlanet: Planet | null;
  hasAutoTap: boolean;
  telegramId: string | null;
  onCraft: () => { completed: boolean; planet?: Planet; tapsLeft?: number; broken?: boolean; brokenRarity?: PlanetType };
  onClaim: () => void;
  visible?: boolean;
}

interface FloatMsg { id: number; text: string; color: string }

const GREY = "#8892b0";
const REVEAL_THRESHOLD = 0.90;

export function LabPage({ balance, taps, goal, planets, maxSlots, currentCraftRarity, pendingPlanet, hasAutoTap, telegramId, onCraft, onClaim, visible = true }: LabPageProps) {
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const floatIdRef = useRef(0);
  const floatTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [brokenFlash, setBrokenFlash] = useState<{ id: number; rarity: PlanetType } | null>(null);
  const brokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {visible && (
        <>
          <AutoTapWidget
            hasAutoTap={hasAutoTap}
            canCraft={canCraft}
            telegramId={telegramId}
            onTap={handleCraft}
          />
          <MysteryBoxWidget telegramId={telegramId} />
        </>
      )}
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <PlanetCanvas
          onPunch={canCraft ? handleCraft : undefined}
          progress={taps}
          goal={goal}
          planetColor={dynamicColor}
          isRevealing={!!pendingPlanet}
          pendingPlanet={pendingPlanet}
          currentCraftRarity={progress >= REVEAL_THRESHOLD ? currentCraftRarity : null}
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
              <div className="text-amber-400 font-black text-base tracking-widest mb-1">FARM FULL</div>
              <div className="text-xs text-muted-foreground">Burn or sell a planet to continue</div>
            </div>
          </div>
        )}

        {/* CLAIM button — overlaid centered above the planet so the user can
            tap it directly without reaching the bottom of the screen. */}
        {pendingPlanet && (
          <div
            className="absolute left-1/2 flex flex-col items-center gap-3"
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
        {!pendingPlanet && (
          <>
            <button
              className="btn-craft"
              onClick={handleCraft}
              disabled={!canCraft}
              data-testid="button-craft"
            >
              {isFull ? "FARM FULL" : balance < 1 ? "NO $ZOOM" : "FORGE PLANET"}
            </button>
          </>
        )}

        {!pendingPlanet && (
          <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            <span>
              {currentCraftRarity
                ? `${PLANET_CONFIG[currentCraftRarity].tapsNeeded} taps · 1 $ZOOM each`
                : "1 $ZOOM per tap"}
            </span>
            <span>{Math.max(0, maxSlots - planets.length)} slot{Math.max(0, maxSlots - planets.length) !== 1 ? "s" : ""} free</span>
          </div>
        )}
      </div>
    </div>
  );
}
