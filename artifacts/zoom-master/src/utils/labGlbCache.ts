/**
 * Shared Lab GLB loader — one network parse per shape, clones for each viewer.
 * Fixes street_scene / island_home disappearing when the picker cycler remounts
 * before large GLBs finish loading.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getShapeGlbUrl } from "@workspace/game-models";

const loader = new GLTFLoader();
const templates = new Map<string, Promise<THREE.Object3D>>();
const readyIds = new Set<string>();

export function preloadLabGlb(shapeId: string): Promise<THREE.Object3D> {
  const cached = templates.get(shapeId);
  if (cached) return cached;

  const url = getShapeGlbUrl(shapeId);
  if (!url) {
    const fail = Promise.reject(new Error(`no glb for ${shapeId}`));
    templates.set(shapeId, fail);
    return fail;
  }

  const promise = new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        readyIds.add(shapeId);
        resolve(gltf.scene);
      },
      undefined,
      (err) => reject(err ?? new Error(`load failed ${shapeId}`)),
    );
  });
  templates.set(shapeId, promise);
  return promise;
}

export function isLabGlbPreloaded(shapeId: string): boolean {
  return readyIds.has(shapeId);
}

/** Deep clone for a new WebGL viewer instance. */
export function cloneLabGlbTemplate(source: THREE.Object3D): THREE.Object3D {
  return skeletonClone(source);
}

export function preloadLabGlbBatch(shapeIds: readonly string[]): Promise<void> {
  return Promise.all(shapeIds.map((id) => preloadLabGlb(id).catch(() => null))).then(() => undefined);
}
