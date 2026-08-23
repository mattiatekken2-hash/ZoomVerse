/* eslint-disable @typescript-eslint/no-explicit-any */

function tgHaptic() {
  return (window as any)?.Telegram?.WebApp?.HapticFeedback ?? null;
}

function vibrateMs(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch { /**/ }
}

function impact(style: "light" | "medium" | "heavy") {
  const hf = tgHaptic();
  if (hf) {
    try { hf.impactOccurred(style); } catch { /**/ }
    try { hf.selectionChanged?.(); } catch { /**/ }
  }
  vibrateMs(style === "light" ? 12 : style === "medium" ? 18 : 28);
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
