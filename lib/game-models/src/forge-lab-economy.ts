/** Lab ZOOM forge economy constants — isolated module (no graph cycles for Vite). */

export const LAB_PIZZA_SHAPE_ID = "pizza";
export const LAB_FLOWER_SHAPE_ID = "flower";
export const LAB_DOLLAR_SHAPE_ID = "dollar";
export const LAB_STARDUST_POT_SHAPE_ID = "stardust_pot";

export const LAB_ZOOM_SHAPE_IDS = [
  LAB_PIZZA_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_DOLLAR_SHAPE_ID,
] as const;

export type LabZoomShapeId = (typeof LAB_ZOOM_SHAPE_IDS)[number];
export type LabForgePath = "zoom" | "stardust";
export type LabMarketPath = "zoom" | "stardust";

export const LAB_ZOOM_FARM_RATE: Record<LabZoomShapeId, number> = {
  [LAB_PIZZA_SHAPE_ID]: 3.5,
  [LAB_FLOWER_SHAPE_ID]: 2.6,
  [LAB_DOLLAR_SHAPE_ID]: 4.2,
};

export const LAB_ZOOM_DISPLAY_NAME: Record<LabZoomShapeId, string> = {
  [LAB_PIZZA_SHAPE_ID]: "Pizza",
  [LAB_FLOWER_SHAPE_ID]: "Flower",
  [LAB_DOLLAR_SHAPE_ID]: "Dollar",
};

export const LAB_ZOOM_COLORS: Record<LabZoomShapeId, { color: string; glowColor: string }> = {
  [LAB_PIZZA_SHAPE_ID]: { color: "#7bed9f", glowColor: "#2ed573" },
  [LAB_FLOWER_SHAPE_ID]: { color: "#ff8fab", glowColor: "#ff5c8a" },
  [LAB_DOLLAR_SHAPE_ID]: { color: "#ffe066", glowColor: "#ffd43b" },
};

export const LAB_MODEL_FORGE_GOAL = 257;
export const LAB_STARDUST_FORGE_ZOOM_COST = 500;
export const LAB_ZOOM_FORGE_STARDUST_COST = 3;
/** @deprecated Use LAB_MODEL_FORGE_GOAL */
export const LAB_PIZZA_FORGE_GOAL = LAB_MODEL_FORGE_GOAL;

export function isLabZoomShapeId(shapeId: string | null | undefined): shapeId is LabZoomShapeId {
  return !!shapeId && (LAB_ZOOM_SHAPE_IDS as readonly string[]).includes(shapeId);
}

export function labMarketPathForShapeId(shapeId: string | null | undefined): LabMarketPath | null {
  if (isLabZoomShapeId(shapeId)) return "zoom";
  if (shapeId === LAB_STARDUST_POT_SHAPE_ID) return "stardust";
  return null;
}

export function isLabForgeGeneratorPlanet(planet: { shapeId?: string | null }): boolean {
  return !!planet.shapeId && (
    isLabZoomShapeId(planet.shapeId) || planet.shapeId === LAB_STARDUST_POT_SHAPE_ID
  );
}
