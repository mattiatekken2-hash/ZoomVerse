import { memo, useEffect, useState } from "react";
import { LabForgeGlbThumb } from "./LabForgeGlbThumb";

const CYCLE_MS = 2800;

interface LabForgeGlbCyclerProps {
  shapeIds: readonly string[];
  size?: number;
  variant?: "reveal" | "picker";
}

/** Picker preview — cycles through every GLB in the path pool (same pool as random forge). */
function LabForgeGlbCyclerBase({
  shapeIds,
  size = 104,
  variant = "picker",
}: LabForgeGlbCyclerProps) {
  const pool = shapeIds.length > 0 ? shapeIds : ["pizza"];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (pool.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % pool.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [pool.length]);

  const shapeId = pool[idx] ?? pool[0]!;

  return (
    <LabForgeGlbThumb
      key={shapeId}
      shapeId={shapeId}
      size={size}
      variant={variant}
    />
  );
}

export const LabForgeGlbCycler = memo(LabForgeGlbCyclerBase);
