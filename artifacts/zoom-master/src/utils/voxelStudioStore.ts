/** Client store for community 3D voxel miniatures (Lab studio). */
import { apiHeaders } from "./api";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  `${typeof window !== "undefined" ? window.location.origin : ""}/api`;

export const VOXEL_STUDIO_FREE_SLOTS = 2;
export const VOXEL_STUDIO_MAX_SLOTS = 10;
export const VOXEL_STUDIO_SLOT_STARDUST = 15;

export interface VoxelCoord {
  x: number;
  y: number;
  z: number;
}

export interface VoxelStudioProject {
  id: string;
  title: string;
  createdAt: number;
  voxels: VoxelCoord[];
}

export interface VoxelStudioState {
  extraSlots: number;
  projects: VoxelStudioProject[];
}

const emptyState = (): VoxelStudioState => ({ extraSlots: 0, projects: [] });

function storageKey(telegramId: string) {
  return `zoom-voxel-studio-v1:${telegramId}`;
}

export function studioSlotCount(state: VoxelStudioState): number {
  return Math.min(VOXEL_STUDIO_MAX_SLOTS, VOXEL_STUDIO_FREE_SLOTS + Math.max(0, state.extraSlots));
}

export function makeBaseVoxels(): VoxelCoord[] {
  const out: VoxelCoord[] = [];
  const half = 2;
  for (let x = -half; x <= half; x++) {
    for (let z = -half; z <= half; z++) {
      out.push({ x, y: 0, z });
    }
  }
  return out;
}

function readLocal(telegramId: string): VoxelStudioState {
  try {
    const raw = localStorage.getItem(storageKey(telegramId));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as VoxelStudioState;
    if (!parsed || !Array.isArray(parsed.projects)) return emptyState();
    return {
      extraSlots: Math.max(0, Number(parsed.extraSlots) || 0),
      projects: parsed.projects.filter((p) => p && typeof p.id === "string"),
    };
  } catch {
    return emptyState();
  }
}

function writeLocal(telegramId: string, state: VoxelStudioState) {
  try {
    localStorage.setItem(storageKey(telegramId), JSON.stringify(state));
  } catch { /**/ }
}

export async function loadVoxelStudio(telegramId: string): Promise<VoxelStudioState> {
  const local = readLocal(telegramId);
  try {
    const res = await fetch(`${API_BASE}/voxel-studio/${encodeURIComponent(telegramId)}`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json() as VoxelStudioState;
      const merged: VoxelStudioState = {
        extraSlots: Math.max(local.extraSlots, Number(data.extraSlots) || 0),
        projects: (data.projects?.length ? data.projects : local.projects) ?? [],
      };
      writeLocal(telegramId, merged);
      return merged;
    }
  } catch { /**/ }
  return local;
}

export async function saveVoxelStudio(telegramId: string, state: VoxelStudioState): Promise<void> {
  writeLocal(telegramId, state);
  try {
    await fetch(`${API_BASE}/voxel-studio/save`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, extraSlots: state.extraSlots, projects: state.projects }),
    });
  } catch { /**/ }
}

export async function buyVoxelStudioSlot(telegramId: string): Promise<{ ok: boolean; extraSlots?: number; stardustBalance?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/voxel-studio/buy-slot`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "Purchase failed" };
    return { ok: true, extraSlots: data.extraSlots, stardustBalance: data.stardustBalance };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export function createStudioProject(title: string): VoxelStudioProject {
  return {
    id: `vs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: title.trim().slice(0, 32) || "Untitled",
    createdAt: Date.now(),
    voxels: makeBaseVoxels(),
  };
}
