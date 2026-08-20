/**
 * Optional HD GLB models per shape. Drop files in `public/models/{name}.glb`
 * (generated via Meshy, Tripo, Rodin, etc.) — showcase view loads these when present.
 */
export const SHAPE_GLB_ASSETS: Partial<Record<string, string>> = {
  minifig: "/models/minifig.glb",
  cat: "/models/cat.glb",
  burger: "/models/burger.glb",
  dog: "/models/dog.glb",
  donut: "/models/donut.glb",
  mug: "/models/mug.glb",
  wine: "/models/wine.glb",
  pizza: "/models/pizza.glb",
  flower: "/models/flower.glb",
  dollar: "/models/dollar.glb",
  stardust_pot: "/models/stardust_pot.glb",
  street_scene: "/models/street_scene.glb",
  island_home: "/models/island_home.glb",
};

/** Bust stale CDN / Telegram cache when Lab GLB assets are replaced. */
const LAB_GLB_CACHE_BUST = "20260820b";

const LAB_GLB_SHAPE_IDS = new Set([
  "pizza",
  "flower",
  "dollar",
  "stardust_pot",
  "street_scene",
  "island_home",
]);

export function getShapeGlbUrl(shapeId: string): string | null {
  const path = SHAPE_GLB_ASSETS[shapeId];
  if (!path) return null;
  if (LAB_GLB_SHAPE_IDS.has(shapeId)) {
    return `${path}?v=${LAB_GLB_CACHE_BUST}`;
  }
  return path;
}
