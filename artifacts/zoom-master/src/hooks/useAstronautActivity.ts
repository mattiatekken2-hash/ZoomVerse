import { useSyncExternalStore } from "react";

// ────────────────────────────────────────────────────────────────────────
// Shared astronaut activity store.
//
// The astronaut "lives" in HOME but we also want a tiny status indicator
// in LAB (and potentially elsewhere) to mirror what he is doing right now.
// To keep both views perfectly in sync we hoist the activity state out of
// any component into a module-level store with a subscribe/snapshot API,
// consumed via React.useSyncExternalStore.
//
// The interval timer only runs while at least one component is subscribed
// (ref-counted), so background CPU stays at zero when no one is looking.
// ────────────────────────────────────────────────────────────────────────

export type AstronautActivity =
  | "sleep"
  | "walk"
  | "coffee"
  | "snack"
  | "window"
  | "exercise"
  | "fridge"
  | "shower";

const ACTIVITIES: AstronautActivity[] = [
  "sleep",
  "walk",
  "coffee",
  "snack",
  "window",
  "exercise",
  "fridge",
  "shower",
];

let current: AstronautActivity = "walk";
const listeners = new Set<() => void>();
let timer: number | null = null;

function pickNext(): AstronautActivity {
  const others = ACTIVITIES.filter((a) => a !== current);
  return others[Math.floor(Math.random() * others.length)]!;
}

function tick() {
  current = pickNext();
  listeners.forEach((l) => l());
  // Random interval: 12-30 s — same cadence Phase 3 used locally so the
  // perceived rhythm of the room doesn't change.
  timer = window.setTimeout(tick, 12000 + Math.random() * 18000);
}

function startIfNeeded() {
  if (timer !== null) return;
  // First mount: also delay a bit so the very first transition isn't
  // jarring right after the tab opens.
  timer = window.setTimeout(tick, 8000 + Math.random() * 8000);
}

function stopIfIdle() {
  if (listeners.size === 0 && timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  startIfNeeded();
  return () => {
    listeners.delete(listener);
    stopIfIdle();
  };
}

function getSnapshot(): AstronautActivity {
  return current;
}

/** Returns the current astronaut activity, kept in sync across all
 *  components that consume this hook. Re-renders only when the activity
 *  actually changes. */
export function useAstronautActivity(): AstronautActivity {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Italian short labels — used by the LAB status pill. We deliberately
 *  use no emoji per the project's "no emoji" rule. */
export const ACTIVITY_LABEL_IT: Record<AstronautActivity, string> = {
  sleep: "dorme",
  walk: "passeggia",
  coffee: "pausa caffè",
  snack: "spuntino",
  window: "guarda fuori",
  exercise: "esercizi",
  fridge: "frigo",
  shower: "doccia",
};
