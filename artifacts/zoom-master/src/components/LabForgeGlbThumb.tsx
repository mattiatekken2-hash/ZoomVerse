import { memo } from "react";
import { LabGlbViewer } from "./LabGlbViewer";

interface LabForgeGlbThumbProps {
  shapeId: string;
  size?: number;
  /** reveal = forge grid; picker = studio glow, no grid. */
  variant?: "reveal" | "picker";
  /** Path accent for picker pedestal (#rrggbb). */
  studioGlow?: string;
}

function LabForgeGlbThumbBase({
  shapeId,
  size = 112,
  variant = "reveal",
  studioGlow,
}: LabForgeGlbThumbProps) {
  const isPicker = variant === "picker";
  return (
    <LabGlbViewer
      shapeId={shapeId}
      size={size}
      autoSpin
      showGrid={!isPicker}
      stage={isPicker ? "studio" : "forge"}
      studioGlow={isPicker ? studioGlow : undefined}
    />
  );
}

export const LabForgeGlbThumb = memo(LabForgeGlbThumbBase);
