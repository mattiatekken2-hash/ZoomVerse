/**
 * Keep in sync with artifacts/zoom-master/src/utils/labFloatFarm.ts.
 * Not in game-models — Vite HMR drops existing Lab exports when that barrel grows.
 */
import {
  LAB_STARDUST_FARM_RATE,
  LAB_ZOOM_FARM_RATE,
  isLabZoomShapeId,
  resolveLabShapeIdFromPlanet,
  resolveLabStardustShapeId,
} from "@workspace/game-models";

/** +0% at float 0, +12% at float 1. Never writes inventories. */
export const LAB_FLOAT_FARM_BONUS = 0.12;

export function readLabModelFloat(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || v > 1) return null;
  return Math.round(v * 1000) / 1000;
}

export function labBaseFarmRate(shapeId: string | null | undefined): number | null {
  if (isLabZoomShapeId(shapeId)) return LAB_ZOOM_FARM_RATE[shapeId];
  const sd = resolveLabStardustShapeId(shapeId);
  return sd ? LAB_STARDUST_FARM_RATE[sd] : null;
}

export function labFarmRateWithFloat(
  shapeId: string | null | undefined,
  float: number | null | undefined,
): number | null {
  const base = labBaseFarmRate(shapeId);
  if (base == null) return null;
  const f = readLabModelFloat(float) ?? 0;
  return Math.round(base * (1 + LAB_FLOAT_FARM_BONUS * f) * 100) / 100;
}

export function labFarmRateForPlanet(planet: {
  shapeId?: string | null;
  displayName?: string | null;
  rate?: number | null;
  float?: number | null;
}): number {
  const shape = resolveLabShapeIdFromPlanet(planet);
  const computed = labFarmRateWithFloat(shape, planet.float);
  const stored = Number(planet.rate);
  const storedOk = Number.isFinite(stored) && stored > 0;
  if (computed == null) return storedOk ? stored : 0;
  return Math.max(storedOk ? stored : 0, computed);
}
