export * from "./types.js";
export * from "./catalog.js";
export * from "./meshes.js";
export * from "./meshes-extended.js";
export * from "./voxelize.js";
export * from "./voxel-sphere-blueprint.js";
export * from "./glb-assets.js";
/**
 * Lab economy + pick/path helpers — zero deps.
 * Do NOT also star-export forge-lab (avoids Vite conflicting / missing named exports).
 */
export * from "./forge-lab-economy.js";
/** Mesh/GLB forge helpers only. */
export {
  resolveLabForgeShapeId,
  getLabForgeShapeTapGoal,
  getLabForgeShapeVoxels,
  labForgeShapeHasGlbReveal,
} from "./forge-lab.js";
