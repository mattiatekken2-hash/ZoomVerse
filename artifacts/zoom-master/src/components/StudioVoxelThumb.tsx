import { useEffect, useRef } from "react";
import type { VoxelCoord } from "../utils/voxelStudioStore";
import { attachStudioVoxelThumb, updateStudioVoxelThumb } from "../utils/studioVoxelThumb";

export function StudioVoxelThumb({
  voxels,
}: {
  voxels: VoxelCoord[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const voxelsRef = useRef(voxels);
  voxelsRef.current = voxels;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachStudioVoxelThumb(el, voxelsRef.current);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateStudioVoxelThumb(el, voxels);
  }, [voxels]);

  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}
