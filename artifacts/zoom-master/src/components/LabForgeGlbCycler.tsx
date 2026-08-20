import { memo, useEffect, useState } from "react";
import { LabForgeGlbThumb } from "./LabForgeGlbThumb";
import { preloadLabGlbBatch } from "../utils/labGlbCache";

const CYCLE_MS = 4000;
const FALLBACK_POOL = ["pizza"] as const;

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
  const pool = shapeIds.length > 0 ? shapeIds : FALLBACK_POOL;
  const poolKey = pool.join(",");
  const [idx, setIdx] = useState(0);
  const [poolReady, setPoolReady] = useState(pool.length <= 1);

  useEffect(() => {
    setIdx(0);
    if (pool.length <= 1) {
      setPoolReady(true);
      return;
    }
    setPoolReady(false);
    let cancelled = false;
    void preloadLabGlbBatch(pool).then(() => {
      if (!cancelled) setPoolReady(true);
    });
    return () => { cancelled = true; };
  }, [poolKey, pool.length]);

  useEffect(() => {
    if (!poolReady || pool.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % pool.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [pool.length, poolReady]);

  const shapeId = pool[idx] ?? pool[0]!;

  return (
    <LabForgeGlbThumb
      shapeId={shapeId}
      size={size}
      variant={variant}
    />
  );
}

export const LabForgeGlbCycler = memo(LabForgeGlbCyclerBase);
