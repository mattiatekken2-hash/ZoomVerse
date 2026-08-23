import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { PlanetCanvas, ForgeProgressBar, type ForgePhase } from "../components/PlanetCanvas";
import { AutoTapWidget, useAutoTapHold } from "../components/AutoTapWidget";
import { SettingsMenu } from "../components/SettingsMenu";
import { ShoppingBag } from "lucide-react";

import { ForgePathPicker } from "../components/ForgePathPicker";
import { ForgePathWheel } from "../components/ForgePathWheel";
import { LabModelRevealCard } from "../components/LabModelRevealCard";
import { ZoomCubeIcon } from "../components/ZoomCubeIcon";
import { ForgeUiErrorBoundary } from "../components/ForgeUiErrorBoundary";
import { GramDiamondIcon } from "../components/GramDiamondIcon";
import { LabRankWidget } from "../components/LabRankWidget";
import type { LabForgePath } from "@workspace/game-models";
import type { Planet } from "../hooks/useGameState";
import { hapticLight } from "../utils/haptic";
import { preloadLabForgePickerGlbs } from "../utils/labGlbPreload";
import { useT } from "../i18n/LanguageContext";
import { loadVoxelStudio, type VoxelStudioProject } from "../utils/voxelStudioStore";


interface LabPageProps {
  balance: number;
  taps: number;
  goal: number;
  pendingPlanet: Planet | null;
  forgePlanetBuild?: boolean;
  forgeRolling?: boolean;
  labForgeShapeId?: string | null;
  labForgePath?: LabForgePath | null;
  hasAutoTap: boolean;
  stardustBalance: number;
  telegramId: string | null;
  sunCount?: number;
  onCraft: (availableStardust?: number) => { completed: boolean; tapsLeft?: number };
  onBeginLabForge: (path: LabForgePath) => { ok: boolean; reason?: string };
  onClaim: () => void;
  onOpenShop?: () => void;
  onOpenStudio?: (opts?: { title?: string; projectId?: string }) => void;
  muted?: boolean;
  setMuted?: (next: boolean | ((prev: boolean) => boolean)) => void;
  visible?: boolean;
}

interface FloatMsg { id: number; text: string; color: string }

const GREY = "#8892b0";
const TON_APP_VOTE_URL = "https://ton.app/games/zoom-bot?id=5847";

function openExternalUrl(url: string) {
  try {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void; openLink?: (u: string) => void } };
    }).Telegram?.WebApp;
    if (tg?.openTelegramLink && url.startsWith("https://t.me/")) {
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch { /**/ }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function LabPage({ balance, taps, goal, pendingPlanet, forgePlanetBuild = false, forgeRolling = false, labForgeShapeId = null, labForgePath = null, hasAutoTap, stardustBalance, telegramId, sunCount = 0, onCraft, onBeginLabForge, onClaim, onOpenShop, onOpenStudio, muted = false, setMuted, visible = true }: LabPageProps) {
  const { t } = useT();
  const [forgePickerOpen, setForgePickerOpen] = useState(false);
  const [floats, setFloats] = useState<FloatMsg[]>([]);
  const floatIdRef = useRef(0);
  const floatTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingFloatRef = useRef<{ planet: Planet; label: string } | null>(null);

  // Forge phase state machine: drives the visual sequence after the user
  // hits 100% — flash → 2s dramatic wait → model reveal → claim button.
  const [forgePhase, setForgePhase] = useState<ForgePhase>("idle");
  const [tapSignal, setTapSignal] = useState(0);
  const [tapRelaxed, setTapRelaxed] = useState(true);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showClaim, setShowClaim] = useState(false);
  const [studioTitleOpen, setStudioTitleOpen] = useState(false);
  const [studioTitle, setStudioTitle] = useState("");
  const [studioSaves, setStudioSaves] = useState<VoxelStudioProject[]>([]);
  const FORGE_COMPLETE_MS = 1800;

  useEffect(() => {
    if (pendingPlanet && forgePhase === "idle" && !pendingFloatRef.current) {
      const label = labForgePath === "zoom" ? "$ZOOM" : labForgePath === "stardust" ? "★ STARDUST" : pendingPlanet.displayName ?? "Model";
      pendingFloatRef.current = { planet: pendingPlanet, label };
    }
  }, [pendingPlanet, forgePhase, labForgePath]);

  useLayoutEffect(() => {
    if (pendingPlanet && forgePhase === "idle") {
      setForgePhase("waiting");
      setShowClaim(false);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = setTimeout(() => {
        setForgePhase("wheel");
        waitingTimerRef.current = null;
      }, FORGE_COMPLETE_MS);
    } else if (!pendingPlanet && forgePhase !== "idle") {
      setForgePhase("idle");
      setShowClaim(false);
      pendingFloatRef.current = null;
      if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
      if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
      if (claimTimerRef.current) { clearTimeout(claimTimerRef.current); claimTimerRef.current = null; }
      if (waitingTimerRef.current) { clearTimeout(waitingTimerRef.current); waitingTimerRef.current = null; }
    }
  }, [pendingPlanet, forgePhase]);

  const handleWheelComplete = useCallback(() => {
    setForgePhase("revealed");
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = null;
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    claimTimerRef.current = setTimeout(() => {
      setShowClaim(true);
    }, 900);
  }, []);

  // (moved below addFloat — see the effect at ~line 185)

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
  }, []);

  const isForgingActive = !pendingPlanet && !!labForgePath && !forgeRolling && forgePhase === "idle";
  const canTapForge = isForgingActive;
  const canOpenForgePicker = !pendingPlanet && !forgeRolling && !isForgingActive;
  const pathLabel = labForgePath === "zoom" ? "$ZOOM" : labForgePath === "stardust" ? "★ STARDUST" : "";

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
      const p = pendingFloatRef.current;
      addFloat(t("lab.planetAcquired", { kind: p.label }), p.planet.color);
      pendingFloatRef.current = null;
    }
  }, [forgePhase, addFloat, t]);

  const handleCraft = useCallback((opts?: { particles?: boolean; relaxed?: boolean; haptic?: boolean }) => {
    if (!canTapForge) return;
    if (opts?.haptic !== false) hapticLight();
    const result = onCraft(stardustBalance);
    if (opts?.particles !== false) {
      setTapRelaxed(opts?.relaxed !== false);
      setTapSignal((n) => n + 1);
    }
    if (result.completed) return;
  }, [canTapForge, onCraft, stardustBalance]);

  const handleForgeButton = useCallback(() => {
    if ((window as unknown as { __zoomOrientLock?: boolean }).__zoomOrientLock) return;
    if (isForgingActive) {
      handleCraft({ relaxed: true, haptic: true });
      return;
    }
    if (canOpenForgePicker) {
      hapticLight();
      setForgePickerOpen(true);
    }
  }, [isForgingActive, canOpenForgePicker, handleCraft]);

  const { startHold, stopHold, holding } = useAutoTapHold({
    enabled: hasAutoTap && isForgingActive,
    canCraft: canTapForge,
    onTap: () => handleCraft({ relaxed: true, haptic: true }),
  });

  useEffect(() => {
    const lock = () => {
      (window as unknown as { __zoomOrientLock?: boolean }).__zoomOrientLock = true;
      window.setTimeout(() => {
        (window as unknown as { __zoomOrientLock?: boolean }).__zoomOrientLock = false;
      }, 1800);
    };
    window.addEventListener("orientationchange", lock);
    return () => window.removeEventListener("orientationchange", lock);
  }, []);

  useEffect(() => {
    if (visible) preloadLabForgePickerGlbs();
  }, [visible]);

  const handleSelectForgePath = useCallback((path: LabForgePath) => {
    if ((window as unknown as { __zoomOrientLock?: boolean }).__zoomOrientLock) return;
    hapticLight();
    const result = onBeginLabForge(path);
    setForgePickerOpen(false);
    if (!result.ok && result.reason === "no_zoom") {
      setFloats((prev) => [...prev, { id: ++floatIdRef.current, text: "Need 500 $ZOOM", color: "#ff6b6b" }]);
    } else if (!result.ok && result.reason === "no_stardust") {
      setFloats((prev) => [...prev, { id: ++floatIdRef.current, text: t("lab.noStardust"), color: "#ff6b6b" }]);
    } else if (!result.ok && result.reason === "slots_full") {
      setFloats((prev) => [...prev, { id: ++floatIdRef.current, text: t("common.slotsFull"), color: "#ff6b6b" }]);
    }
  }, [onBeginLabForge, t]);

  const handleClaim = useCallback(() => {
    onClaim();
  }, [onClaim]);

  const bottomChromeOffset = "calc(env(safe-area-inset-bottom, 0px) + 78px)";
  const forgePct = goal > 0 ? Math.min(taps / goal, 1) : 0;
  const progressLabel = useMemo(() => {
    if (forgeRolling) return t("planetCanvas.forgingMass");
    if (forgePct < 0.04) return t("planetCanvas.primordial");
    if (forgePlanetBuild) return t("planetCanvas.forming");
    return t("planetCanvas.assembling");
  }, [forgeRolling, forgePct, forgePlanetBuild, t]);

  return (
    <div className="relative h-full overflow-hidden">
      <AutoTapWidget
        hasAutoTap={hasAutoTap}
        telegramId={telegramId}
      />

      <div className="absolute inset-0">
        <ForgeUiErrorBoundary label="3D forge error">
        <PlanetCanvas
          backdrop
          tapSignal={tapSignal}
          tapRelaxed={tapRelaxed}
          progress={taps}
          goal={goal}
          accentColor={dynamicColor}
          pendingPlanet={pendingPlanet}
          forgePlanetBuild={forgePlanetBuild}
          labForgeShapeId={labForgeShapeId}
          labForgePath={labForgePath}
          forgePhase={forgePhase}
          forgeRolling={forgeRolling}
          chromeBottomOffset={bottomChromeOffset}
          suppressProgressBar
          visible={visible && !pendingPlanet}
        />
        </ForgeUiErrorBoundary>

        <button
          type="button"
          onClick={() => {
            setStudioTitle("");
            setStudioTitleOpen(true);
            if (telegramId) {
              void loadVoxelStudio(telegramId).then((s) => setStudioSaves(s.projects));
            }
          }}
          aria-label="Create your model"
          title="Create your model"
          className="absolute z-30 flex items-center justify-center active:scale-95 pointer-events-auto"
          style={{
            left: 6,
            top: "max(56px, calc(env(safe-area-inset-top, 0px) + 50px))",
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(0, 0, 0, 0.62)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            backdropFilter: "blur(10px)",
            cursor: "pointer",
            padding: 0,
            color: "#E8ECF4",
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          ▦
        </button>

        <button
          type="button"
          onClick={() => openExternalUrl(TON_APP_VOTE_URL)}
          aria-label={t("lab.tonAppVoteAria")}
          title={t("lab.tonAppVoteAria")}
          data-testid="lab-ton-app-vote"
          className="absolute z-30 flex items-center justify-center active:scale-95 pointer-events-auto"
          style={{
            left: 6,
            top: "max(102px, calc(env(safe-area-inset-top, 0px) + 96px))",
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(0, 0, 0, 0.62)",
            border: "1px solid rgba(140, 215, 255, 0.28)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 14px rgba(120, 200, 255, 0.18)",
            cursor: "pointer",
            padding: 0,
            transition: "transform 0.12s",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <GramDiamondIcon size={22} />
        </button>

        <div
          className="absolute z-30 pointer-events-auto"
          style={{
            right: 6,
            top: "max(102px, calc(env(safe-area-inset-top, 0px) + 96px))",
          }}
        >
          <LabRankWidget
            telegramId={telegramId}
            sunCount={sunCount}
            balance={balance}
            headerMode
          />
        </div>

        <div
          className="absolute left-0 right-0 z-30 flex items-center justify-center gap-2 px-3 pointer-events-none"
          style={{ top: "max(56px, calc(env(safe-area-inset-top, 0px) + 50px))" }}
        >
          <div className="pointer-events-auto flex-shrink-0">
            <SettingsMenu muted={muted} setMuted={setMuted ?? (() => {})} headerButton />
          </div>
          <div
            data-testid="lab-zoom-balance"
            className="px-4 py-2 rounded-full pointer-events-auto flex-shrink-0 flex items-center gap-2"
            style={{
              background: "rgba(0, 0, 0, 0.62)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
            }}
          >
            <span
              className="font-black text-base tracking-wide whitespace-nowrap inline-flex items-center gap-1.5"
              style={{ color: "#ffffff", letterSpacing: "0.06em" }}
            >
              <ZoomCubeIcon size={18} />
              {Math.floor(balance).toLocaleString()}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenShop}
            data-testid="button-shop-nav"
            aria-label={t("header.openShop")}
            className="flex items-center justify-center active:scale-95 flex-shrink-0 pointer-events-auto"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "linear-gradient(145deg, #ffb347, #ff8c00)",
              border: "1px solid rgba(255, 140, 0, 0.55)",
              boxShadow: "0 4px 14px rgba(255, 140, 0, 0.45)",
              cursor: "pointer",
              padding: 0,
              transition: "transform 0.12s",
            }}
          >
            <ShoppingBag size={20} strokeWidth={2.4} color="#111" />
          </button>
        </div>

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

        {pendingPlanet && forgePhase === "waiting" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-end pointer-events-none forge-complete-celebrate"
            style={{ zIndex: 44, paddingBottom: "22%" }}
          >
            <div
              className="font-black tracking-widest text-center forge-complete-label px-6 py-3 rounded-2xl"
              style={{
                fontSize: 13,
                letterSpacing: "0.22em",
                color: "rgba(255,255,255,0.95)",
                textShadow: "0 0 24px rgba(255,255,255,0.35)",
                background: "rgba(6,8,14,0.55)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              }}
            >
              {t("lab.forgeComplete")}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.42)",
                textTransform: "uppercase",
              }}
            >
              {t("lab.rarityWheelNext")}
            </div>
          </div>
        )}

        {pendingPlanet && forgePhase === "wheel" && labForgePath && (
          <ForgeUiErrorBoundary label="Wheel error">
          <div
            className="absolute inset-0 flex items-center justify-center forge-wheel-enter"
            style={{
              zIndex: 45,
              background: "radial-gradient(circle at 50% 44%, rgba(255,255,255,0.06) 0%, rgba(4,6,12,0.94) 52%, rgba(4,6,12,0.98) 100%)",
              backdropFilter: "blur(8px)",
              pointerEvents: "auto",
            }}
          >
              <ForgePathWheel
                targetPath={labForgePath}
                onComplete={handleWheelComplete}
                size={Math.min(360, typeof window !== "undefined" ? window.innerWidth - 28 : 340)}
              />
          </div>
          </ForgeUiErrorBoundary>
        )}

        {pendingPlanet && forgePhase === "revealed" && (
          <ForgeUiErrorBoundary label="Reveal error">
          <div className="lab-forge-reveal-overlay">
            <div className="forge-reveal pointer-events-none" style={{ width: "min(92vw, 300px)" }}>
              <LabModelRevealCard
                planet={pendingPlanet}
                pathLabel={pathLabel || pendingPlanet.displayName || "Model"}
              />
            </div>
          </div>
          </ForgeUiErrorBoundary>
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
              className="lab-forge-claim-btn active:scale-95 whitespace-nowrap"
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

      <div
        className="absolute left-0 right-0 z-20 px-5 flex flex-col gap-2.5 pointer-events-none"
        style={{ bottom: bottomChromeOffset, paddingBottom: 8 }}
      >
        {isForgingActive && (
          <ForgeProgressBar
            progress={taps}
            goal={goal}
            pct={forgePct}
            displayAccent={dynamicColor}
            label={progressLabel}
            inline
          />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          {forgePickerOpen && canOpenForgePicker && (
            <ForgePathPicker
              stardustBalance={stardustBalance}
              zoomBalance={balance}
              onSelect={handleSelectForgePath}
              onClose={() => setForgePickerOpen(false)}
            />
          )}
          {!pendingPlanet && (
            <button
              className="btn-craft pointer-events-auto"
              onClick={(e) => {
                if (hasAutoTap && isForgingActive) {
                  e.preventDefault();
                  return;
                }
                handleForgeButton();
              }}
              onPointerDown={(e) => {
                if (!hasAutoTap || !isForgingActive || e.button !== 0) return;
                e.preventDefault();
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /**/ }
                startHold(e.pointerId);
              }}
              onPointerUp={(e) => {
                if (!hasAutoTap) return;
                stopHold(e.pointerId);
                try {
                  if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                } catch { /**/ }
              }}
              onPointerCancel={(e) => {
                if (!hasAutoTap) return;
                stopHold(e.pointerId);
              }}
              onLostPointerCapture={(e) => {
                if (!hasAutoTap) return;
                stopHold(e.pointerId);
              }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!canTapForge && !canOpenForgePicker}
              data-no-global-haptic
              data-testid="button-craft"
              style={{
                flex: 1,
                width: "auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                touchAction: hasAutoTap && isForgingActive ? "none" : undefined,
                userSelect: "none",
                WebkitUserSelect: "none",
                ...((canTapForge || canOpenForgePicker)
                  ? {
                      background: holding ? "#111827" : "#000000",
                      color: "#ffffff",
                      border: holding
                        ? "1px solid rgba(255,255,255,0.42)"
                        : "1px solid rgba(255,255,255,0.18)",
                      boxShadow: holding
                        ? "0 0 18px rgba(200,220,255,0.28)"
                        : "0 3px 12px rgba(0,0,0,0.35)",
                    }
                  : {}),
              }}
            >
              <ZoomCubeIcon size={16} />
              {t("lab.startBuildBtn")}
            </button>
          )}
        </div>

      </div>

      {studioTitleOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setStudioTitleOpen(false)}
        >
          <div
            className="w-full rounded-2xl p-4"
            style={{
              maxWidth: 320,
              background: "rgba(8,10,16,0.96)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-black text-sm mb-1" style={{ color: "#E8ECF4" }}>Create your model</div>
            <div className="text-[11px] mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
              {studioSaves.length > 0
                ? "Open a saved project or start a new one."
                : "Name it, then sculpt gray voxels on the base square."}
            </div>
            {studioSaves.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-3 max-h-40 overflow-y-auto">
                {studioSaves.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    onClick={() => {
                      setStudioTitleOpen(false);
                      onOpenStudio?.({ projectId: p.id });
                    }}
                  >
                    <div className="text-[12px] font-black truncate" style={{ color: "#E8ECF4" }}>{p.title}</div>
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {p.voxels.length} voxels · continue
                    </div>
                  </button>
                ))}
              </div>
            )}
            <input
              value={studioTitle}
              onChange={(e) => setStudioTitle(e.target.value.slice(0, 32))}
              placeholder={studioSaves.length > 0 ? "New title" : "Title"}
              className="w-full rounded-xl px-3 py-3 text-sm font-bold outline-none mb-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff" }}
              autoFocus={studioSaves.length === 0}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl text-xs font-black"
                style={{ color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}
                onClick={() => setStudioTitleOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl text-xs font-black"
                style={{ background: "#fff", color: "#060810" }}
                onClick={() => {
                  const title = studioTitle.trim() || "Untitled";
                  setStudioTitleOpen(false);
                  onOpenStudio?.({ title });
                }}
              >
                {studioSaves.length > 0 ? "New" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
