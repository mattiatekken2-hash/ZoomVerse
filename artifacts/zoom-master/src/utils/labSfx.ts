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
 * "Forge chime" — a warm, pleasant craft cue used when the user presses
 * FORGE PLANET. Built from a soft major-chord arpeggio (C5 / E5 / G5)
 * played on sine waves with a gentle attack and a long, smooth decay.
 * No square waves and no harsh metallic ping — designed to feel rewarding
 * and easy on the ears even after many taps.
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

  // Master bus with a tiny low-pass to soften any high-frequency edge.
  const master = c.createGain();
  master.gain.value = 0.9;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 4500;
  tone.Q.value = 0.4;
  master.connect(tone);
  tone.connect(c.destination);

  // Soft major chord (C5 E5 G5) as a quick arpeggio: each note offset by
  // ~25 ms so it lands like a gentle chime rather than a single hit.
  const notes = [
    { freq: 523.25, delay: 0.000, level: 0.20, dur: 0.55 }, // C5
    { freq: 659.25, delay: 0.025, level: 0.16, dur: 0.55 }, // E5
    { freq: 783.99, delay: 0.050, level: 0.14, dur: 0.60 }, // G5
  ];

  for (const n of notes) {
    const start = t0 + n.delay;
    const end = start + n.dur;

    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(n.freq, start);

    // Subtle detuned partial one octave up adds shimmer without harshness.
    const shimmer = c.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(n.freq * 2, start);

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(n.level, start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    const shimmerEnv = c.createGain();
    shimmerEnv.gain.setValueAtTime(0.0001, start);
    shimmerEnv.gain.exponentialRampToValueAtTime(n.level * 0.25, start + 0.015);
    shimmerEnv.gain.exponentialRampToValueAtTime(0.0001, start + n.dur * 0.55);

    osc.connect(env);
    shimmer.connect(shimmerEnv);
    env.connect(master);
    shimmerEnv.connect(master);

    osc.start(start);
    shimmer.start(start);
    osc.stop(end + 0.02);
    shimmer.stop(end + 0.02);
  }
}
