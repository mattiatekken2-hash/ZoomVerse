/** Pause Farm/Market WebGL thumbs so a one-shot capture can get a GPU context. */

import { useEffect, useState } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();
let paused = false;

export function areGlThumbsPaused(): boolean {
  return paused;
}

export function subscribeGlThumbsPause(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function withGlThumbsPaused<T>(fn: () => Promise<T>): Promise<T> {
  paused = true;
  listeners.forEach((l) => l());
  await new Promise((r) => window.setTimeout(r, 320));
  try {
    return await fn();
  } finally {
    paused = false;
    listeners.forEach((l) => l());
  }
}

export function useGlThumbsPaused(): boolean {
  const [paused, setPaused] = useState(() => areGlThumbsPaused());
  useEffect(() => subscribeGlThumbsPause(() => setPaused(areGlThumbsPaused())), []);
  return paused;
}
