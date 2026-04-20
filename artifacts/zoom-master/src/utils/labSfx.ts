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
 * Tiny synthesized 8-bit "soft pop" blip — a short harmonic chirp with a
 * gentle envelope. Designed to feel clean and retro, not piercing.
 * Throttled to one play per ~60ms so rapid taps don't machine-gun.
 * Honors the global mute flag (`zoom-bgm-muted`).
 */
export function playLabBlip(): void {
  if (isMuted()) return;
  const now = performance.now();
  if (now - lastPlay < 60) return;
  lastPlay = now;

  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const t0 = c.currentTime;
  const dur = 0.12;

  // Fundamental: triangle wave for that soft chiptune feel.
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(880, t0);
  osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.05);
  osc.frequency.exponentialRampToValueAtTime(660, t0 + dur);

  // Harmonic shimmer one octave up, quieter.
  const harm = c.createOscillator();
  harm.type = "sine";
  harm.frequency.setValueAtTime(1760, t0);
  harm.frequency.exponentialRampToValueAtTime(2200, t0 + 0.04);

  // Envelope: quick attack, soft exponential decay.
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.18, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const harmEnv = c.createGain();
  harmEnv.gain.setValueAtTime(0.0001, t0);
  harmEnv.gain.exponentialRampToValueAtTime(0.06, t0 + 0.008);
  harmEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.7);

  osc.connect(env);
  harm.connect(harmEnv);
  env.connect(c.destination);
  harmEnv.connect(c.destination);

  osc.start(t0);
  harm.start(t0);
  osc.stop(t0 + dur + 0.02);
  harm.stop(t0 + dur + 0.02);
}
