import { memo } from "react";
import { LabGlbViewer } from "./LabGlbViewer";

interface LabForgeGlbThumbProps {
  shapeId: string;
  size?: number;
  /** reveal = forge grid behind model; picker = clean GLB only. */
  variant?: "reveal" | "picker";
}

/** Raw uploaded GLB — same pipeline as pizza (no line-art / voxel stand-ins). */
function LabForgeGlbThumbBase({
  shapeId,
  size = 112,
  variant = "reveal",
}: LabForgeGlbThumbProps) {
  return (
    <LabGlbViewer
      key={shapeId}
      shapeId={shapeId}
      size={size}
      autoSpin
      showGrid={variant === "reveal"}
      stage="forge"
      chrome="card"
    />
  );
}

export const LabForgeGlbThumb = memo(LabForgeGlbThumbBase);
