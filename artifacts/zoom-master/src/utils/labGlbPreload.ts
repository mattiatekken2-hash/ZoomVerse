import {
  getShapeGlbUrl,
  LAB_DOLLAR_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_ISLAND_HOME_SHAPE_ID,
  LAB_PIZZA_SHAPE_ID,
  LAB_STARDUST_POT_SHAPE_ID,
  LAB_STREET_SCENE_SHAPE_ID,
} from "@workspace/game-models";

const preloaded = new Set<string>();

/** Warm GLB bytes before the Lab picker mounts its WebGL viewers. */
export function preloadLabGlbs(shapeIds: string[]): void {
  for (const id of shapeIds) {
    const url = getShapeGlbUrl(id);
    if (!url || preloaded.has(url)) continue;
    preloaded.add(url);
    void fetch(url, { cache: "force-cache" }).catch(() => {});
  }
}

/** All Lab forge GLBs — preload so reveal/spin never stalls after random pick. */
export const LAB_FORGE_PICKER_GLB_IDS = [
  LAB_PIZZA_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_DOLLAR_SHAPE_ID,
  LAB_STREET_SCENE_SHAPE_ID,
  LAB_ISLAND_HOME_SHAPE_ID,
  LAB_STARDUST_POT_SHAPE_ID,
] as const;

export function preloadLabForgePickerGlbs(): void {
  preloadLabGlbs([...LAB_FORGE_PICKER_GLB_IDS]);
}
