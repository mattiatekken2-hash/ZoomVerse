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
  stardust_pot: "/models/stardust_pot.glb",
};

export function getShapeGlbUrl(shapeId: string): string | null {
  return SHAPE_GLB_ASSETS[shapeId] ?? null;
}
