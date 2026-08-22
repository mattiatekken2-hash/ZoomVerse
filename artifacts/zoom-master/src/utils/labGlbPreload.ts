import {
  LAB_STARDUST_SHAPE_IDS,
  LAB_ZOOM_SHAPE_IDS,
} from "@workspace/game-models";
import { preloadLabGlbBatch } from "./labGlbCache";

/** All Lab forge GLBs — warm cache before picker / reveal. */
export const LAB_FORGE_PICKER_GLB_IDS = [
  ...LAB_ZOOM_SHAPE_IDS,
  ...LAB_STARDUST_SHAPE_IDS,
] as const;

export function preloadLabForgePickerGlbs(): void {
  void preloadLabGlbBatch(LAB_FORGE_PICKER_GLB_IDS);
}
