let ctx: AudioContext | null = null;
let lastPlay = 0;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  } catch {
    return null;
  }
  return ctx;
}

function isMuted(): boolean {
  try { return localStorage.getItem("zoom-bgm-muted") === "1"; } catch { return false; }
}

/**
 * "Forge thump" — a short, deep retro-game craft sound used when the user
 * presses FORGE PLANET. A descending square-wave bass body gives weight,
 * and a brief metallic ping on top gives that crafted / forged feel.
 * Honors the global mute flag and is throttled to avoid rapid repeats.
 */
export function playForgeThump(): void {
  if (isMuted()) return;
  const now = performance.now();
  if (now - lastPlay < 80) return;
  lastPlay = now;

  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const t0 = c.currentTime;
  const dur = 0.22;

  // Bass body: square wave dropping from 220 → 90 Hz for that retro thump.
  const bass = c.createOscillator();
  bass.type = "square";
  bass.frequency.setValueAtTime(220, t0);
  bass.frequency.exponentialRampToValueAtTime(90, t0 + dur);

  const bassEnv = c.createGain();
  bassEnv.gain.setValueAtTime(0.0001, t0);
  bassEnv.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
  bassEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // Metallic ping on top: short triangle blip for the "craft" cue.
  const ping = c.createOscillator();
  ping.type = "triangle";
  ping.frequency.setValueAtTime(1200, t0);
  ping.frequency.exponentialRampToValueAtTime(900, t0 + 0.08);

  const pingEnv = c.createGain();
  pingEnv.gain.setValueAtTime(0.0001, t0);
  pingEnv.gain.exponentialRampToValueAtTime(0.09, t0 + 0.005);
  pingEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);

  bass.connect(bassEnv);
  ping.connect(pingEnv);
  bassEnv.connect(c.destination);
  pingEnv.connect(c.destination);

  bass.start(t0);
  ping.start(t0);
  bass.stop(t0 + dur + 0.02);
  ping.stop(t0 + 0.12);
}
