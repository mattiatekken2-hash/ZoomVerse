/* eslint-disable @typescript-eslint/no-explicit-any */

function tgHaptic() {
  return (window as any)?.Telegram?.WebApp?.HapticFeedback ?? null;
}

// Always fire BOTH the Telegram HapticFeedback API and navigator.vibrate. On
// some Telegram client versions the WebApp haptic API silently no-ops; using
// both as a belt-and-suspenders ensures the device actually buzzes on Android.
// (iOS Safari ignores navigator.vibrate, so on iOS only the Telegram API
// matters — but firing both is harmless.)
export function hapticLight() {
  try {
    const hf = tgHaptic();
    if (hf) {
      try {
        if (hf.selectionChanged) hf.selectionChanged();
        else hf.impactOccurred("light");
      } catch { /**/ }
    }
    try { navigator.vibrate?.(8); } catch { /**/ }
  } catch { /**/ }
}

export function haptic(input: number | "light" | "medium" | "heavy" = "medium") {
  try {
    const hf = tgHaptic();
    let style: "light" | "medium" | "heavy";
    if (typeof input === "number") {
      style = input <= 5 ? "light" : input <= 10 ? "medium" : "heavy";
    } else {
      style = input;
    }
    if (hf) {
      try { hf.impactOccurred(style); } catch { /**/ }
    }
    try {
      const ms = style === "light" ? 8 : style === "medium" ? 14 : 22;
      navigator.vibrate?.(ms);
    } catch { /**/ }
  } catch { /**/ }
}
