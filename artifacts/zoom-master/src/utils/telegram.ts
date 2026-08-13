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
