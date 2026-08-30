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
  /** Optional hex color. Missing = Lab grey clay. */
  color?: number;
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

function voxelsHaveColor(voxels: VoxelCoord[] | undefined): boolean {
  return Array.isArray(voxels) && voxels.some((v) => typeof v.color === "number");
}

function mergeStudioProjects(server: VoxelStudioProject[], local: VoxelStudioProject[]): VoxelStudioProject[] {
  const localById = new Map(local.map((p) => [p.id, p]));
  const serverIds = new Set(server.map((p) => p.id));
  const merged = server.map((sp) => {
    const lp = localById.get(sp.id);
    if (!lp) return sp;
    const serverColored = voxelsHaveColor(sp.voxels);
    const localColored = voxelsHaveColor(lp.voxels);
    const localRicher = (lp.voxels?.length ?? 0) > (sp.voxels?.length ?? 0);
    if ((!serverColored && localColored) || localRicher) {
      return { ...sp, title: lp.title || sp.title, voxels: lp.voxels };
    }
    return sp;
  });
  return [...merged, ...local.filter((p) => !serverIds.has(p.id))];
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
        projects: mergeStudioProjects(data.projects ?? [], local.projects),
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
      keepalive: true,
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

export interface StudioGalleryListing {
  id: number;
  projectId: string;
  title: string;
  voxels: VoxelCoord[];
  status: string;
  voteCount: number;
  author: string;
  mine: boolean;
}

export async function fetchStudioGallery(telegramId: string): Promise<{ listings: StudioGalleryListing[]; holdZmc: number }> {
  try {
    const res = await fetch(`${API_BASE}/studio-gallery?telegramId=${encodeURIComponent(telegramId)}`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return {
      listings: Array.isArray(data.listings) ? data.listings : [],
      holdZmc: Number(data.holdZmc) || 100_000,
    };
  } catch {
    return { listings: [], holdZmc: 100_000 };
  }
}

export async function exposeStudioGallery(
  telegramId: string,
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/studio-gallery/expose`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, projectId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "Could not expose" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function unpublishStudioGallery(
  telegramId: string,
  listingId: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/studio-gallery/unpublish`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, listingId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "Could not unpublish" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function reportStudioGallery(
  telegramId: string,
  listingId: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/studio-gallery/report`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, listingId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "Could not report" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function voteStudioGallery(
  telegramId: string,
  listingId: number,
): Promise<{ ok: boolean; voteCount?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/studio-gallery/vote`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ telegramId, listingId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "Could not vote" };
    return { ok: true, voteCount: Number(data.voteCount) || 0 };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
