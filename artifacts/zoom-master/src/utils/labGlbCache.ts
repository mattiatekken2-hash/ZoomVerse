/**
 * Shared Lab GLB loader — one network parse per shape, clones for each viewer.
 * Cache keys include the asset URL so cache-bust query changes retry cleanly.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getShapeGlbUrl } from "@workspace/game-models";

const loader = new GLTFLoader();
const templates = new Map<string, Promise<THREE.Object3D>>();
const readyKeys = new Set<string>();

function cacheKey(shapeId: string, url: string): string {
  return `${shapeId}|${url}`;
}

export function preloadLabGlb(shapeId: string): Promise<THREE.Object3D> {
  const url = getShapeGlbUrl(shapeId);
  if (!url) {
    return Promise.reject(new Error(`no glb for ${shapeId}`));
  }

  const key = cacheKey(shapeId, url);
  const cached = templates.get(key);
  if (cached) return cached;

  const promise = new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        readyKeys.add(key);
        resolve(gltf.scene);
      },
      undefined,
      (err) => reject(err ?? new Error(`load failed ${shapeId}`)),
    );
  });
  templates.set(key, promise);
  return promise;
}

export function isLabGlbPreloaded(shapeId: string): boolean {
  const url = getShapeGlbUrl(shapeId);
  if (!url) return false;
  return readyKeys.has(cacheKey(shapeId, url));
}

/** Deep clone for a new WebGL viewer instance. */
export function cloneLabGlbTemplate(source: THREE.Object3D): THREE.Object3D {
  return skeletonClone(source);
}

export function preloadLabGlbBatch(shapeIds: readonly string[]): Promise<void> {
  return Promise.all(shapeIds.map((id) => preloadLabGlb(id).catch(() => null))).then(() => undefined);
}
