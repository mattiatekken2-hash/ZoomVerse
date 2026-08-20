import { getShapeGlbUrl } from "@workspace/game-models";
import {
  LAB_ISLAND_HOME_SHAPE_ID,
  LAB_PIZZA_SHAPE_ID,
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

/** Models shown on Start Build — pizza + both Stardust GLBs. */
export const LAB_FORGE_PICKER_GLB_IDS = [
  LAB_PIZZA_SHAPE_ID,
  LAB_STREET_SCENE_SHAPE_ID,
  LAB_ISLAND_HOME_SHAPE_ID,
] as const;

export function preloadLabForgePickerGlbs(): void {
  preloadLabGlbs([...LAB_FORGE_PICKER_GLB_IDS]);
}
