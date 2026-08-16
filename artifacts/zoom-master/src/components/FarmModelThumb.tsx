import { useCallback, useEffect, useRef, useState } from "react";
import { ObjectThumb } from "./MysteryModel3D";

function ModelPreviewPlaceholder({
  size,
  color,
  accent,
}: {
  size: number;
  color: string;
  accent: string;
}) {
  return (
    <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * 0.92,
          height: size * 0.92,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 42%, ${accent}55 0%, ${color}30 45%, transparent 72%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%) rotate(18deg)",
          width: size * 0.38,
          height: size * 0.48,
          borderRadius: 6,
          background: `linear-gradient(145deg, ${color}aa, ${accent}77)`,
          boxShadow: `0 0 14px ${accent}44`,
        }}
      />
    </div>
  );
}

const FARM_THUMB_GL_MAX = 12;
let farmThumbGlActive = 0;
const farmThumbWaiters: Array<() => void> = [];

function acquireFarmThumbGl(): boolean {
  if (farmThumbGlActive >= FARM_THUMB_GL_MAX) return false;
  farmThumbGlActive++;
  return true;
}

function releaseFarmThumbGl() {
  farmThumbGlActive = Math.max(0, farmThumbGlActive - 1);
  while (farmThumbGlActive < FARM_THUMB_GL_MAX && farmThumbWaiters.length > 0) {
    const before = farmThumbGlActive;
    farmThumbWaiters.shift()?.();
    if (farmThumbGlActive > before) break;
  }
}

export function FarmModelThumb({
  planetId,
  shapeId,
  primaryColor,
  accentColor,
  size,
  suspendGl,
}: {
  planetId: string;
  shapeId: string;
  primaryColor: string;
  accentColor: string;
  size: number;
  suspendGl: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasSlotRef = useRef(false);
  const [inView, setInView] = useState(false);
  const [hasSlot, setHasSlot] = useState(false);
  const [glGen, setGlGen] = useState(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { rootMargin: "140px 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const releaseSlot = useCallback(() => {
    if (!hasSlotRef.current) return;
    hasSlotRef.current = false;
    setHasSlot(false);
    releaseFarmThumbGl();
  }, []);

  useEffect(() => {
    if (suspendGl || !inView) {
      releaseSlot();
      return;
    }
    if (hasSlotRef.current) return;

    if (acquireFarmThumbGl()) {
      hasSlotRef.current = true;
      setHasSlot(true);
      return () => releaseSlot();
    }

    let cancelled = false;
    const retry = () => {
      if (cancelled || hasSlotRef.current || suspendGl || !inView) return;
      if (acquireFarmThumbGl()) {
        hasSlotRef.current = true;
        setHasSlot(true);
      }
    };
    farmThumbWaiters.push(retry);

    return () => {
      cancelled = true;
      const idx = farmThumbWaiters.indexOf(retry);
      if (idx >= 0) farmThumbWaiters.splice(idx, 1);
      releaseSlot();
    };
  }, [suspendGl, inView, releaseSlot]);

  const handleGlError = useCallback(() => {
    releaseSlot();
    setGlGen((g) => g + 1);
  }, [releaseSlot]);

  const showGl = !suspendGl && inView && hasSlot;

  return (
    <div ref={rootRef} style={{ width: size, height: size, flexShrink: 0 }}>
      {showGl ? (
        <ObjectThumb
          key={`${planetId}-${glGen}`}
          shapeId={shapeId}
          primaryColor={primaryColor}
          accentColor={accentColor}
          size={size}
          performanceMode
          onGlFailed={handleGlError}
          onGlContextLost={handleGlError}
        />
      ) : (
        <ModelPreviewPlaceholder size={size} color={primaryColor} accent={accentColor} />
      )}
    </div>
  );
}
