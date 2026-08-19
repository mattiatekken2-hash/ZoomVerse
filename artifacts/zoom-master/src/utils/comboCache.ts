const API = `${typeof window !== "undefined" ? window.location.origin : ""}/api`;

export interface ComboState {
  comboEpoch: number;
  required: string[];
  claimed: boolean;
  nextResetMs: number;
}

let cached: ComboState | null = null;
let cachedFor: string | null = null;
let inflight: Promise<ComboState | null> | null = null;

async function fetchCombo(telegramId: string): Promise<ComboState | null> {
  try {
    const r = await fetch(`${API}/combo/current?telegramId=${encodeURIComponent(telegramId)}`);
    if (!r.ok) return null;
    return (await r.json()) as ComboState;
  } catch {
    return null;
  }
}

/** Prefetch combo data as soon as telegramId is known (before Farm tab opens). */
export function prefetchCombo(telegramId: string): Promise<ComboState | null> {
  if (cachedFor === telegramId && cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetchCombo(telegramId).then((data) => {
    if (data) {
      cached = data;
      cachedFor = telegramId;
    }
    inflight = null;
    return data;
  });
  return inflight;
}

export function getCachedCombo(telegramId: string | null): ComboState | null {
  if (!telegramId || cachedFor !== telegramId) return null;
  return cached;
}

export function setCachedCombo(telegramId: string, combo: ComboState): void {
  cached = combo;
  cachedFor = telegramId;
}
