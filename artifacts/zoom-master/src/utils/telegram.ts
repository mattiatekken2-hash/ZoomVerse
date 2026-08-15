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

/** Silent dev identity for localhost / browser testing — no login screen. */
export function getBrowserDevTelegramId(): string | null {
  if (getVerifiedTelegramUserId() !== null) return null;

  try {
    const stored = localStorage.getItem(DEV_TG_ID_STORAGE_KEY);
    if (stored && /^\d{5,12}$/.test(stored.trim())) return stored.trim();
  } catch { /**/ }

  const fromEnv = import.meta.env.VITE_DEV_TELEGRAM_ID as string | undefined;
  if (fromEnv && /^\d+$/.test(fromEnv.trim())) return fromEnv.trim();

  if (import.meta.env.DEV) return DEFAULT_BROWSER_DEV_TELEGRAM_ID;

  return null;
}
