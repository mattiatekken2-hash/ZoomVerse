/* eslint-disable @typescript-eslint/no-explicit-any */

let lastHapticAt = 0;
const HAPTIC_GAP_MS = 40;

function tooSoon() {
  const now = performance.now();
  if (now - lastHapticAt < HAPTIC_GAP_MS) return true;
  lastHapticAt = now;
  return false;
}

function tgHaptic() {
  return (window as any)?.Telegram?.WebApp?.HapticFeedback ?? null;
}

function vibrateMs(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch { /**/ }
}

function impact(style: "light" | "medium" | "heavy") {
  if (tooSoon()) return;
  const hf = tgHaptic();
  if (hf) {
    try { hf.selectionChanged?.(); } catch { /**/ }
    try { hf.impactOccurred(style); } catch { /**/ }
  }
  vibrateMs(style === "light" ? 8 : style === "medium" ? 16 : 26);
}

export function hapticLight() {
  try { impact("light"); } catch { /**/ }
}

export function haptic(input: number | "light" | "medium" | "heavy" = "medium") {
  try {
    let style: "light" | "medium" | "heavy";
    if (typeof input === "number") {
      style = input <= 5 ? "light" : input <= 10 ? "medium" : "heavy";
    } else {
      style = input;
    }
    impact(style);
  } catch { /**/ }
}
