type TelegramWebApp = {
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
};

function getTgHaptic() {
  try {
    return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } })
      .Telegram?.WebApp?.HapticFeedback ?? null;
  } catch {
    return null;
  }
}

export function hapticLight() {
  try {
    const tg = getTgHaptic();
    if (tg) {
      tg.impactOccurred("light");
      return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(3);
    }
  } catch { /**/ }
}

export function haptic(duration: number = 8) {
  try {
    const tg = getTgHaptic();
    if (tg) {
      if (duration <= 5) tg.impactOccurred("light");
      else if (duration <= 10) tg.impactOccurred("medium");
      else tg.impactOccurred("heavy");
      return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(duration);
    }
  } catch { /**/ }
}
