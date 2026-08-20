import {
  LAB_DOLLAR_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_ISLAND_HOME_SHAPE_ID,
  LAB_PIZZA_SHAPE_ID,
  LAB_STARDUST_POT_SHAPE_ID,
  LAB_STREET_SCENE_SHAPE_ID,
} from "@workspace/game-models";
import { preloadLabGlbBatch } from "./labGlbCache";

/** All Lab forge GLBs — warm cache before picker / reveal. */
export const LAB_FORGE_PICKER_GLB_IDS = [
  LAB_PIZZA_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_DOLLAR_SHAPE_ID,
  LAB_STREET_SCENE_SHAPE_ID,
  LAB_ISLAND_HOME_SHAPE_ID,
  LAB_STARDUST_POT_SHAPE_ID,
] as const;

export function preloadLabForgePickerGlbs(): void {
  void preloadLabGlbBatch(LAB_FORGE_PICKER_GLB_IDS);
}
