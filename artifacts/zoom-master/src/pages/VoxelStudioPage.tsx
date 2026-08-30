import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FORGE_CLAY } from "@workspace/game-models";
import { VoxelStudioCanvas } from "../components/VoxelStudioCanvas";
import { LabSpaceBackground } from "../components/LabSpaceBackground";
import { StudioGalleryPanel } from "../components/StudioGalleryPanel";
import { StudioVoxelThumb } from "../components/StudioVoxelThumb";
import { useT } from "../i18n/LanguageContext";
import {
  buyVoxelStudioSlot,
  createStudioProject,
  loadVoxelStudio,
  saveVoxelStudio,
  studioSlotCount,
  VOXEL_STUDIO_MAX_SLOTS,
  VOXEL_STUDIO_SLOT_STARDUST,
  type VoxelCoord,
  type VoxelStudioProject,
  type VoxelStudioState,
} from "../utils/voxelStudioStore";

interface Props {
  telegramId: string;
  stardustBalance: number;
  seedTitle?: string | null;
  seedProjectId?: string | null;
  onClose: () => void;
  onStardustSpent?: (next: number) => void;
}

const STUDIO_PALETTE = [
  FORGE_CLAY,
  0xffffff,
  0x1a1a1e,
  0xe53935,
  0xff8c00,
  0xffd740,
  0x43a047,
  0x1e88e5,
  0x26c6da,
  0x8e24aa,
] as const;

function CircleBtn({
  children,
  onClick,
  ariaLabel,
  gold,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  gold?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex items-center justify-center font-black"
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        background: gold ? "rgba(255,215,64,0.16)" : "rgba(8,10,18,0.82)",
        color: gold ? "#ffd740" : "#fff",
        border: gold ? "1.5px solid rgba(255,215,64,0.5)" : "1px solid rgba(255,255,255,0.18)",
        boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
        backdropFilter: "blur(10px)",
        fontSize: 14,
      }}
    >
      {children}
    </button>
  );
}

export function VoxelStudioPage({ telegramId, stardustBalance, seedTitle, seedProjectId, onClose, onStardustSpent }: Props) {
  const { t } = useT();
  const [state, setState] = useState<VoxelStudioState>({ extraSlots: 0, projects: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paintColor, setPaintColor] = useState<number | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [selected, setSelected] = useState<VoxelCoord | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  const persist = useCallback((next: VoxelStudioState) => {
    setState(next);
    void saveVoxelStudio(telegramId, next);
  }, [telegramId]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const persistNow = useCallback(async () => {
    if (!readyRef.current) return;
    await saveVoxelStudio(telegramId, stateRef.current);
  }, [telegramId]);

  const flash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 2200);
  };

  const createAndOpen = useCallback((title: string, from: VoxelStudioState) => {
    const slots = studioSlotCount(from);
    if (from.projects.length >= slots) {
      flash("No free slots — buy one below");
      if (from.projects[0]) setActiveId(from.projects[0].id);
      return from;
    }
    const project = createStudioProject(title);
    const next = { ...from, projects: [...from.projects, project] };
    void saveVoxelStudio(telegramId, next);
    setActiveId(project.id);
    return next;
  }, [telegramId]);

  useEffect(() => {
    let cancelled = false;
    void loadVoxelStudio(telegramId).then((loaded) => {
      if (cancelled) return;
      let next = loaded;
      if (seedProjectId && loaded.projects.some((p) => p.id === seedProjectId)) {
        setActiveId(seedProjectId);
      } else if (seedTitle) {
        next = createAndOpen(seedTitle, loaded);
        setState(next);
        setReady(true);
        return;
      } else if (loaded.projects[0]) {
        setActiveId(loaded.projects[0].id);
      }
      setState(next);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [telegramId, seedTitle, seedProjectId, createAndOpen]);

  useEffect(() => {
    const flush = () => {
      if (!readyRef.current) return;
      void saveVoxelStudio(telegramId, stateRef.current);
    };
    const onHide = () => { if (document.hidden) flush(); };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [telegramId]);

  const slots = studioSlotCount(state);
  const active = state.projects.find((p) => p.id === activeId) ?? null;

  const patchActive = (voxels: VoxelCoord[]) => {
    if (!active) return;
    persist({
      ...state,
      projects: state.projects.map((p) => p.id === active.id ? { ...p, voxels } : p),
    });
  };

  const handleAdd = (v: VoxelCoord) => {
    if (!active) return;
    patchActive([...active.voxels, v]);
  };

  const handleRemove = (v: VoxelCoord) => {
    if (!active || active.voxels.length <= 1) return;
    const idx = active.voxels.findIndex((x) => x.x === v.x && x.y === v.y && x.z === v.z);
    if (idx < 0) return;
    patchActive(active.voxels.filter((_, i) => i !== idx));
    if (selected && selected.x === v.x && selected.y === v.y && selected.z === v.z) {
      setSelected(null);
    }
  };

  const handleDeleteSelected = () => {
    if (!selected) return;
    handleRemove(selected);
  };

  const handlePaint = (v: VoxelCoord) => {
    if (!active || paintColor == null) return;
    patchActive(active.voxels.map((x) => (
      x.x === v.x && x.y === v.y && x.z === v.z ? { ...x, color: paintColor } : x
    )));
  };

  const handleUndo = () => {
    if (!active || active.voxels.length <= 1) return;
    patchActive(active.voxels.slice(0, -1));
  };

  const handleBuySlot = async () => {
    if (busy || slots >= VOXEL_STUDIO_MAX_SLOTS) return;
    if (stardustBalance < VOXEL_STUDIO_SLOT_STARDUST) {
      flash(`Need ${VOXEL_STUDIO_SLOT_STARDUST} ★`);
      return;
    }
    setBusy(true);
    const res = await buyVoxelStudioSlot(telegramId);
    setBusy(false);
    if (!res.ok) {
      flash(res.error || "Could not buy slot");
      return;
    }
    persist({ ...state, extraSlots: res.extraSlots ?? state.extraSlots + 1 });
    if (typeof res.stardustBalance === "number") onStardustSpent?.(res.stardustBalance);
    try { window.dispatchEvent(new Event("stardust-refresh")); } catch { /**/ }
  };

  const placeholders = useMemo(() => {
    const n = Math.max(0, slots - state.projects.length);
    return Array.from({ length: n }, (_, i) => i);
  }, [slots, state.projects.length]);

  const submitNew = () => {
    const title = nameDraft.trim() || "Untitled";
    setNameOpen(false);
    setNameDraft("");
    const next = createAndOpen(title, state);
    setState(next);
  };

  const fabTools: { id: string; glyph: string; label: string; color: string; deg: number }[] = [
    { id: "save", glyph: "✓", label: t("studio.save"), color: "#34d399", deg: 140 },
    { id: "colors", glyph: "●", label: t("studio.colors"), color: "#ffd740", deg: 175 },
    { id: "undo", glyph: "↩", label: t("studio.undo"), color: "#90caf9", deg: 210 },
    { id: "erase", glyph: "⌫", label: t("studio.erase"), color: "#ff8a8a", deg: 105 },
  ];

  const runTool = (id: string) => {
    if (id === "save") {
      void persistNow().then(() => flash(t("studio.saved")));
      setToolsOpen(false);
      return;
    }
    if (id === "undo") {
      handleUndo();
      return;
    }
    if (id === "colors") {
      setEraseMode(false);
      setSelected(null);
      setPaintColor(null);
      setPaletteOpen((open) => !open);
      setToolsOpen(false);
      return;
    }
    if (id === "erase") {
      setPaintColor(null);
      setPaletteOpen(false);
      setEraseMode((on) => {
        if (on) setSelected(null);
        return !on;
      });
      setToolsOpen(false);
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{
        position: "relative",
        height: "100%",
        flex: 1,
        minHeight: 0,
        background: "#000",
      }}
    >
      <LabSpaceBackground />
      <div className="relative z-10 flex flex-col h-full min-h-0">
        {galleryOpen ? (
          <StudioGalleryPanel
            telegramId={telegramId}
            active={active}
            onFlash={flash}
            onFlush={persistNow}
            onClose={() => setGalleryOpen(false)}
          />
        ) : (
        <>
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {ready && active ? (
            <div style={{ position: "absolute", inset: 0 }}>
              <VoxelStudioCanvas
                voxels={active.voxels}
                onAdd={handleAdd}
                onRemove={handleRemove}
                onPaint={handlePaint}
                onSelect={setSelected}
                paintColor={paintColor}
                eraseMode={eraseMode}
                selected={selected}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>
              {ready ? t("studio.pickSlot") : "Loading…"}
            </div>
          )}

          <div
            className="absolute left-3 z-30"
            style={{ top: "max(8px, env(safe-area-inset-top, 0px))" }}
          >
            <CircleBtn
              ariaLabel={t("common.close")}
              onClick={() => {
                void (async () => {
                  await persistNow();
                  onClose();
                })();
              }}
            >
              ✕
            </CircleBtn>
          </div>
          <div
            className="absolute left-1/2 z-30"
            style={{ top: "max(12px, calc(env(safe-area-inset-top, 0px) + 6px))", transform: "translateX(-50%)", maxWidth: "46%" }}
          >
            <div
              className="truncate px-3 py-1.5 rounded-full text-[11px] font-black text-center"
              style={{
                background: "rgba(6,8,14,0.72)",
                border: "1px solid rgba(255,255,255,0.16)",
                color: "#E8ECF4",
                backdropFilter: "blur(10px)",
              }}
            >
              {active?.title || t("studio.create")}
            </div>
          </div>
          <div
            className="absolute right-3 z-30"
            style={{ top: "max(8px, env(safe-area-inset-top, 0px))" }}
          >
            <CircleBtn
              ariaLabel={t("studio.gallery.btn")}
              gold
              onClick={() => {
                setToolsOpen(false);
                setPaletteOpen(false);
                setGalleryOpen(true);
              }}
            >
              ★
            </CircleBtn>
          </div>

          {msg && (
            <div
              className="absolute left-1/2 z-30 rounded-full px-4 py-2 text-center text-[11px] font-bold"
              style={{
                top: 58,
                transform: "translateX(-50%)",
                background: "rgba(255,215,64,0.16)",
                color: "#ffd740",
                border: "1px solid rgba(255,215,64,0.35)",
              }}
            >
              {msg}
            </div>
          )}

          {paletteOpen && (
            <div
              className="absolute z-30"
              style={{
                right: 16,
                bottom: 168,
                width: 168,
                padding: 10,
                borderRadius: 999,
                background: "rgba(8,10,18,0.92)",
                border: "1px solid rgba(255,255,255,0.16)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="flex flex-wrap justify-center gap-1.5">
                {STUDIO_PALETTE.map((hex) => {
                  const on = paintColor === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => {
                        setPaintColor(hex);
                        setEraseMode(false);
                      }}
                      aria-label={`color ${hex.toString(16)}`}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        background: `#${hex.toString(16).padStart(6, "0")}`,
                        border: on ? "2px solid #ffd740" : "1px solid rgba(255,255,255,0.28)",
                        boxShadow: on ? "0 0 10px rgba(255,215,64,0.45)" : "none",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {active && (
            <div
              className="absolute z-30"
              style={{
                right: 14,
                bottom: 108,
                width: 56,
                height: 56,
              }}
            >
              {toolsOpen && fabTools.map((tool) => {
                const rad = (tool.deg * Math.PI) / 180;
                const r = 78;
                const x = Math.cos(rad) * r;
                const y = -Math.sin(rad) * r;
                const lit = (tool.id === "erase" && eraseMode) || (tool.id === "colors" && paletteOpen);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    aria-label={tool.label}
                    onClick={() => runTool(tool.id)}
                    className="absolute flex items-center justify-center font-black"
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 999,
                      left: 5 + x,
                      top: 5 + y,
                      background: "rgba(8,10,18,0.94)",
                      color: tool.color,
                      border: lit ? `1.5px solid ${tool.color}` : "1px solid rgba(255,255,255,0.16)",
                      fontSize: 16,
                      boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
                    }}
                  >
                    {tool.glyph}
                  </button>
                );
              })}
              {eraseMode && selected && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="absolute flex items-center justify-center font-black"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    right: 70,
                    top: 2,
                    background: "rgba(180,40,40,0.92)",
                    color: "#fff",
                    border: "1.5px solid #ff8a8a",
                    fontSize: 10,
                    boxShadow: "0 0 16px rgba(255,80,80,0.35)",
                  }}
                >
                  {t("studio.delete")}
                </button>
              )}
              <button
                type="button"
                aria-label={t("studio.tools")}
                onClick={() => setToolsOpen((open) => !open)}
                className="absolute flex items-center justify-center font-black"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  left: 0,
                  top: 0,
                  background: eraseMode ? "rgba(180,40,40,0.9)" : "rgba(8,10,18,0.92)",
                  color: eraseMode ? "#fff" : "#ffd740",
                  border: eraseMode ? "1.5px solid #ff8a8a" : "1.5px solid rgba(255,215,64,0.55)",
                  fontSize: toolsOpen ? 18 : 22,
                  boxShadow: "0 8px 22px rgba(0,0,0,0.5)",
                }}
              >
                {toolsOpen ? "✕" : "✦"}
              </button>
            </div>
          )}
        </div>

        <nav
          className="flex-shrink-0"
          style={{
            paddingBottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
            paddingTop: 6,
            background: "linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.5) 80%, transparent 100%)",
          }}
        >
          <div className="flex items-stretch justify-center gap-2 px-3 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch", minHeight: 76 }}>
            {state.projects.map((p) => (
              <StudioSlotThumb
                key={p.id}
                project={p}
                active={p.id === activeId}
                onSelect={() => {
                  setActiveId(p.id);
                  setSelected(null);
                  setEraseMode(false);
                }}
              />
            ))}
            {placeholders.map((i) => (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => {
                  setNameDraft("");
                  setNameOpen(true);
                }}
                className="flex-shrink-0 flex items-center justify-center"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px dashed rgba(255,255,255,0.18)",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                +
              </button>
            ))}
            {slots < VOXEL_STUDIO_MAX_SLOTS && (
              <button
                type="button"
                onClick={() => void handleBuySlot()}
                disabled={busy}
                className="flex-shrink-0 flex flex-col items-center justify-center"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 999,
                  background: "rgba(255,215,64,0.08)",
                  border: "1px solid rgba(255,215,64,0.28)",
                  color: "#ffd740",
                }}
              >
                <span className="text-[8px] font-black">SLOT</span>
                <span className="text-[10px] font-black">{VOXEL_STUDIO_SLOT_STARDUST} ★</span>
              </button>
            )}
          </div>
        </nav>
        </>
        )}
      </div>

      {nameOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setNameOpen(false)}
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
            <div className="font-black text-sm mb-1" style={{ color: "#E8ECF4" }}>New model</div>
            <div className="text-[11px] mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
              Starts from the gray base square.
            </div>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value.slice(0, 32))}
              placeholder="Title"
              className="w-full rounded-xl px-3 py-3 text-sm font-bold outline-none mb-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff" }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl text-xs font-black"
                style={{ color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}
                onClick={() => setNameOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl text-xs font-black"
                style={{ background: "#fff", color: "#060810" }}
                onClick={submitNew}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudioSlotThumb({
  project,
  active,
  onSelect,
}: {
  project: VoxelStudioProject;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex-shrink-0 overflow-hidden"
      style={{
        width: 64,
        height: 64,
        borderRadius: 999,
        border: active ? "2px solid #ffd740" : "1px solid rgba(255,255,255,0.16)",
        background: "rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
        <StudioVoxelThumb voxels={project.voxels} />
      </div>
    </button>
  );
}
