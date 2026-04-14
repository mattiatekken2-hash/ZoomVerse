/* eslint-disable @typescript-eslint/no-explicit-any */

function tgHaptic() {
  return (window as any)?.Telegram?.WebApp?.HapticFeedback ?? null;
}

export function hapticLight() {
  try {
    const hf = tgHaptic();
    if (hf) {
      hf.selectionChanged
        ? hf.selectionChanged()
        : hf.impactOccurred("soft");
    } else {
      navigator.vibrate?.(2);
    }
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
      hf.impactOccurred(style);
    } else {
      const ms = style === "light" ? 5 : style === "medium" ? 10 : 18;
      navigator.vibrate?.(ms);
    }
  } catch { /**/ }
}
