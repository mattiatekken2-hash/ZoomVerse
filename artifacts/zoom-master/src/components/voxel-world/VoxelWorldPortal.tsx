import { useCallback, useState } from "react";

export type LabWorldMode = "forge" | "voxel";

const LOAD_MS = 1400;

interface VoxelWorldPortalProps {
  mode: LabWorldMode;
  onModeChange: (mode: LabWorldMode) => void;
  /** Block entering the voxel world (forge busy). Leaving is always allowed. */
  enterDisabled?: boolean;
}

function WorldLoadingOverlay({ label }: { label: string }) {
  return (
    <div
      className="voxel-world-loading"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 50% 40%, rgba(20,40,80,0.55) 0%, rgba(4,6,14,0.96) 65%)",
        backdropFilter: "blur(8px)",
        pointerEvents: "all",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "2px solid rgba(120,180,255,0.25)",
          borderTopColor: "#7ecbff",
          animation: "voxel-world-spin 0.9s linear infinite",
          marginBottom: 16,
          boxShadow: "0 0 24px rgba(80,160,255,0.35)",
        }}
      />
      <div
        className="font-black text-sm tracking-[0.22em] uppercase"
        style={{ color: "#dceeff", textShadow: "0 0 16px rgba(100,180,255,0.45)" }}
      >
        {label}
      </div>
    </div>
  );
}

/** Switch between forge builds and the voxel planet world. */
export function VoxelWorldPortal({
  mode,
  onModeChange,
  enterDisabled = false,
}: VoxelWorldPortalProps) {
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<LabWorldMode | null>(null);
  const inVoxel = mode === "voxel";

  const switchTo = useCallback(
    (next: LabWorldMode) => {
      if (loading || next === mode) return;
      if (next === "voxel" && enterDisabled) return;
      setPending(next);
      setLoading(true);
      window.setTimeout(() => {
        onModeChange(next);
        setLoading(false);
        setPending(null);
      }, LOAD_MS);
    },
    [enterDisabled, loading, mode, onModeChange],
  );

  const loadingLabel =
    pending === "voxel" ? "Entrando nel mondo voxel…" : pending === "forge" ? "Torno alle costruzioni…" : "Caricamento…";

  return (
    <>
      {loading && <WorldLoadingOverlay label={loadingLabel} />}

      <div
        style={{
          position: "absolute",
          top: inVoxel ? "calc(env(safe-area-inset-top, 0px) + 12px)" : undefined,
          right: inVoxel ? 12 : 12,
          bottom: inVoxel ? undefined : "calc(env(safe-area-inset-bottom, 0px) + 158px)",
          left: inVoxel ? 12 : undefined,
          zIndex: 45,
          display: "flex",
          flexDirection: inVoxel ? "row" : "column",
          alignItems: inVoxel ? "center" : "flex-end",
          justifyContent: inVoxel ? "center" : "flex-start",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            borderRadius: 999,
            padding: 3,
            background: "rgba(6,8,16,0.82)",
            border: "1px solid rgba(120,180,255,0.22)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
            pointerEvents: loading ? "none" : "auto",
          }}
        >
          <button
            type="button"
            onClick={() => switchTo("forge")}
            className="font-black text-[10px] tracking-wide uppercase"
            style={{
              border: "none",
              borderRadius: 999,
              padding: "8px 12px",
              cursor: "pointer",
              background: mode === "forge" ? "linear-gradient(135deg,#7ecbff,#4facfe)" : "transparent",
              color: mode === "forge" ? "#060810" : "rgba(255,255,255,0.65)",
            }}
          >
            Costruzioni
          </button>
          <button
            type="button"
            onClick={() => switchTo("voxel")}
            disabled={enterDisabled}
            className="font-black text-[10px] tracking-wide uppercase"
            style={{
              border: "none",
              borderRadius: 999,
              padding: "8px 12px",
              cursor: enterDisabled ? "default" : "pointer",
              opacity: enterDisabled ? 0.4 : 1,
              background: mode === "voxel" ? "linear-gradient(135deg,#7ecbff,#4facfe)" : "transparent",
              color: mode === "voxel" ? "#060810" : "rgba(255,255,255,0.65)",
            }}
          >
            Pianeta
          </button>
        </div>

        {!inVoxel && (
          <button
            type="button"
            onClick={() => switchTo("voxel")}
            disabled={enterDisabled || loading}
            aria-label="Vai al pianeta voxel"
            data-testid="button-voxel-world"
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              border: "1.5px solid rgba(120,180,255,0.45)",
              background: "radial-gradient(circle, rgba(30,50,90,0.95), rgba(6,8,16,0.92))",
              boxShadow: "0 0 16px rgba(80,160,255,0.35), inset 0 0 8px rgba(120,180,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: enterDisabled || loading ? "default" : "pointer",
              pointerEvents: enterDisabled || loading ? "none" : "auto",
              opacity: enterDisabled ? 0.5 : 1,
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            🪐
          </button>
        )}
      </div>
    </>
  );
}
