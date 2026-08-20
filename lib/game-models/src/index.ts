export * from "./types.js";
export * from "./catalog.js";
export * from "./meshes.js";
export * from "./meshes-extended.js";
export * from "./voxelize.js";
export * from "./voxel-sphere-blueprint.js";
export * from "./glb-assets.js";
/** Lab economy constants (single source — do not also star-export from forge-lab). */
export * from "./forge-lab-economy.js";
/** Lab forge helpers — explicit names only (avoids Vite conflicting star exports). */
export {
  LAB_FORGE_TEST_PIZZA_KEY,
  readLabForgeTestPizzaFlag,
  clearLabForgeTestPizzaFlag,
  LAB_DEV_WIPE_STATE_KEY,
  isLabDevWipeActive,
  LAB_DEV_FARM_RESET_KEY,
  consumeLabDevFarmResetOnce,
  enableNextLabForgePizza,
  pickRandomLabZoomShapeId,
  labForgeShapeForPath,
  resolveLabForgeShapeId,
  getLabForgeShapeTapGoal,
  getLabForgeShapeVoxels,
  labForgeShapeHasGlbReveal,
} from "./forge-lab.js";
