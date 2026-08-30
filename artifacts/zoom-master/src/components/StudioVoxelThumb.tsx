import { useEffect, useRef } from "react";
import type { VoxelCoord } from "../utils/voxelStudioStore";
import { paintStudioVoxelThumb } from "../utils/studioVoxelThumb";

export function StudioVoxelThumb({
  voxels,
}: {
  voxels: VoxelCoord[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const r = el.getBoundingClientRect();
      void paintStudioVoxelThumb(el, voxels, Math.max(8, r.width), Math.max(8, r.height));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [voxels]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}
