export * from "./types.js";
export * from "./catalog.js";
export * from "./meshes.js";
export * from "./meshes-extended.js";
export * from "./voxelize.js";
export * from "./voxel-sphere-blueprint.js";
export * from "./glb-assets.js";
/**
 * Lab forge — single barrel. Named re-exports live in forge-lab.ts
 * (explicit, not `export *` from economy) so Vite resolves pickRandom.
 */
export * from "./forge-lab.js";
export * from "./farm-pause.js";
export * from "./market-price.js";
export * from "./zmc-economy.js";
/**
 * Named re-exports so Vite HMR sees new zmc-economy symbols. `export *`
 * alone keeps a stale export list on this barrel until a full restart.
 */
export { FARM_HOLD_ZMC, hasFarmHold } from "./zmc-economy.js";
