import type * as THREE from "three";

/** Live Lab GLB viewers — SHARE captures these instead of a new (often black) WebGL context. */
export interface LabGlbCaptureHandle {
  shapeId: string;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  spinGroup: THREE.Group;
  paused: boolean;
}

const handles = new Set<LabGlbCaptureHandle>();

export function registerLabGlbCapture(handle: LabGlbCaptureHandle): () => void {
  handles.add(handle);
  return () => {
    handles.delete(handle);
  };
}

export function findLabGlbCapture(shapeId: string): LabGlbCaptureHandle | null {
  let best: LabGlbCaptureHandle | null = null;
  let bestArea = 0;
  for (const handle of handles) {
    if (handle.shapeId !== shapeId) continue;
    const el = handle.renderer.domElement;
    if (!el.isConnected) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 64 || rect.height < 64) continue;
    if (rect.width > 360 || rect.height > 360) continue;
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = handle;
      bestArea = area;
    }
  }
  return best;
}
