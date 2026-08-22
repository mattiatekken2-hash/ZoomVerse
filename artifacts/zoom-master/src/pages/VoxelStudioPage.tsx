import { useCallback, useEffect, useMemo, useState } from "react";
import { VoxelStudioCanvas } from "../components/VoxelStudioCanvas";
import { LabSpaceBackground } from "../components/LabSpaceBackground";
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

function formatDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

export function VoxelStudioPage({ telegramId, stardustBalance, seedTitle, seedProjectId, onClose, onStardustSpent }: Props) {
  const [state, setState] = useState<VoxelStudioState>({ extraSlots: 0, projects: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const persist = useCallback((next: VoxelStudioState) => {
    setState(next);
    void saveVoxelStudio(telegramId, next);
  }, [telegramId]);

  useEffect(() => {
    let cancelled = false;
    void loadVoxelStudio(telegramId).then((loaded) => {
      if (cancelled) return;
      let next = loaded;
      if (seedProjectId && loaded.projects.some((p) => p.id === seedProjectId)) {
        setActiveId(seedProjectId);
      } else if (seedTitle && loaded.projects.length < studioSlotCount(loaded)) {
        const project = createStudioProject(seedTitle);
        next = { ...loaded, projects: [...loaded.projects, project] };
        void saveVoxelStudio(telegramId, next);
        setActiveId(project.id);
      } else if (loaded.projects[0]) {
        setActiveId(loaded.projects[0].id);
      }
      setState(next);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [telegramId, seedTitle, seedProjectId]);

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

  const handleUndo = () => {
    if (!active || active.voxels.length <= 25) return;
    patchActive(active.voxels.slice(0, -1));
  };

  const handleBuySlot = async () => {
    if (busy || slots >= VOXEL_STUDIO_MAX_SLOTS) return;
    if (stardustBalance < VOXEL_STUDIO_SLOT_STARDUST) {
      setMsg(`Need ${VOXEL_STUDIO_SLOT_STARDUST} ★`);
      window.setTimeout(() => setMsg(null), 2200);
      return;
    }
    setBusy(true);
    const res = await buyVoxelStudioSlot(telegramId);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error || "Could not buy slot");
      window.setTimeout(() => setMsg(null), 2200);
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

  return (
    <div
      className="flex flex-col"
      style={{
        position: "relative",
        height: "100%",
        minHeight: 0,
        background: "#000",
      }}
    >
      <LabSpaceBackground />
      <div className="relative z-10 flex flex-col h-full min-h-0">
        <header
          className="flex-shrink-0 px-3 pb-2 flex items-center gap-2"
          style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl text-[11px] font-black uppercase"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)" }}
          >
            Back
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm truncate" style={{ color: "#E8ECF4" }}>
              {active?.title || "Create your model"}
            </div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.42)" }}>
              1 tap = 1 voxel · zoom & rotate · gray clay
            </div>
          </div>
          {active && (
            <button
              type="button"
              onClick={handleUndo}
              className="px-3 py-2 rounded-xl text-[11px] font-black uppercase"
              style={{ background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              Undo
            </button>
          )}
        </header>

        {msg && (
          <div className="mx-4 mb-2 rounded-xl px-3 py-2 text-center text-xs font-bold" style={{ background: "rgba(255,215,64,0.12)", color: "#ffd740" }}>
            {msg}
          </div>
        )}

        <div className="flex-1 min-h-0 relative flex items-center justify-center">
          {ready && active ? (
            <div style={{ width: "100%", height: "100%" }}>
              <VoxelStudioCanvas voxels={active.voxels} onAdd={handleAdd} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>
              {ready ? "Pick or create a slot below" : "Loading…"}
            </div>
          )}
        </div>

        <nav
          className="flex-shrink-0"
          style={{
            paddingBottom: "max(14px, calc(env(safe-area-inset-bottom, 0px) + 10px))",
            paddingTop: 8,
            background: "linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.62) 72%, transparent 100%)",
          }}
        >
          <div className="flex items-stretch justify-center gap-2 px-3 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch", minHeight: 92 }}>
            {state.projects.map((p) => (
              <StudioSlotThumb
                key={p.id}
                project={p}
                active={p.id === activeId}
                onSelect={() => setActiveId(p.id)}
              />
            ))}
            {placeholders.map((i) => (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => {
                  const title = window.prompt("Model title", "My model");
                  if (!title) return;
                  const project = createStudioProject(title);
                  persist({ ...state, projects: [...state.projects, project] });
                  setActiveId(project.id);
                }}
                className="flex-shrink-0 rounded-2xl flex flex-col items-center justify-center"
                style={{
                  width: 78,
                  height: 78,
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
                className="flex-shrink-0 rounded-2xl px-2 flex flex-col items-center justify-center"
                style={{
                  width: 78,
                  height: 78,
                  background: "rgba(255,215,64,0.08)",
                  border: "1px solid rgba(255,215,64,0.28)",
                  color: "#ffd740",
                }}
              >
                <span className="text-[10px] font-black">SLOT</span>
                <span className="text-[11px] font-black">{VOXEL_STUDIO_SLOT_STARDUST} ★</span>
              </button>
            )}
          </div>
        </nav>
      </div>
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
      className="flex-shrink-0 rounded-2xl overflow-hidden"
      style={{
        width: 86,
        height: 78,
        border: active ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.12)",
        background: "rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ height: 48, pointerEvents: "none" }}>
        <VoxelStudioCanvas voxels={project.voxels} preview />
      </div>
      <div className="px-1 pb-1 text-center">
        <div className="text-[9px] font-black truncate" style={{ color: "#fff" }}>{project.title}</div>
        <div className="text-[8px]" style={{ color: "rgba(255,255,255,0.4)" }}>{formatDate(project.createdAt)}</div>
      </div>
    </button>
  );
}
