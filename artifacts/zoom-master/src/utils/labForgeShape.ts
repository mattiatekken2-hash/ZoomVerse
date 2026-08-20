/**
 * Lab shape helpers for the client — kept in zoom-master so Vite dev
 * does not depend on nested game-models re-exports.
 */
import {
  isLabZoomShapeId,
  resolveLabStardustShapeId,
  LAB_STARDUST_DISPLAY_NAME,
} from "@workspace/game-models";

export function normalizeLabForgeShapeId(shapeId: string | null | undefined): string | null {
  if (!shapeId) return null;
  const stardust = resolveLabStardustShapeId(shapeId);
  if (stardust) return stardust;
  if (isLabZoomShapeId(shapeId)) return shapeId;
  return shapeId;
}

export function labStardustDisplayNameFor(shapeId: string | null | undefined): string | null {
  const resolved = resolveLabStardustShapeId(shapeId);
  return resolved ? LAB_STARDUST_DISPLAY_NAME[resolved] : null;
}
