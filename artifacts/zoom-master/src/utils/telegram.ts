/** True when Telegram WebApp initData includes a verified user id (real Mini App session). */
export function getVerifiedTelegramUserId(): string | null {
  try {
    const id = (window as unknown as {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } };
    }).Telegram?.WebApp?.initDataUnsafe?.user?.id;
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}

export function isBrowserDevSession(): boolean {
  return getVerifiedTelegramUserId() === null;
}

/** Project owner — used only for local browser dev (no Telegram Mini App). */
const DEFAULT_BROWSER_DEV_TELEGRAM_ID = "8144744644";

export const DEV_TG_ID_STORAGE_KEY = "zoom-dev-tg-id";
/** Last verified Mini App user — reused on PC browser so inventory matches Telegram. */
export const TELEGRAM_ID_STORAGE_KEY = "zoom-telegram-id";

export function persistTelegramId(id: string) {
  if (!/^\d{5,12}$/.test(id)) return;
  try {
    localStorage.setItem(DEV_TG_ID_STORAGE_KEY, id);
    localStorage.setItem(TELEGRAM_ID_STORAGE_KEY, id);
  } catch { /**/ }
}

function readStoredTelegramId(): string | null {
  try {
    for (const key of [DEV_TG_ID_STORAGE_KEY, TELEGRAM_ID_STORAGE_KEY]) {
      const stored = localStorage.getItem(key);
      if (stored && /^\d{5,12}$/.test(stored.trim())) return stored.trim();
    }
  } catch { /**/ }
  return null;
}

function readTelegramIdFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("tg") || params.get("tg_id");
    if (q && /^\d{5,12}$/.test(q.trim())) return q.trim();
  } catch { /**/ }
  return null;
}

/** Silent identity for PC browser — same Telegram user as the Mini App when known. */
export function getBrowserDevTelegramId(): string | null {
  if (getVerifiedTelegramUserId() !== null) return null;

  const fromUrl = readTelegramIdFromUrl();
  if (fromUrl) {
    persistTelegramId(fromUrl);
    return fromUrl;
  }

  const stored = readStoredTelegramId();
  if (stored) return stored;

  const fromEnv = import.meta.env.VITE_DEV_TELEGRAM_ID as string | undefined;
  if (fromEnv && /^\d+$/.test(fromEnv.trim())) return fromEnv.trim();

  if (import.meta.env.DEV) return DEFAULT_BROWSER_DEV_TELEGRAM_ID;

  return null;
}
