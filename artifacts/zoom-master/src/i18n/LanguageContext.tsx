import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { translate, type Lang, LANGS } from "./translations";
import { setI18nLang } from "./gameMessage";
import { setUserLanguage as apiSetUserLanguage } from "../utils/api";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "zoom-lang";

const ALL_LANGS: Lang[] = ["en", "it", "ru", "uk", "es", "fil"];

function readInitial(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && ALL_LANGS.includes(v as Lang)) return v as Lang;
  } catch { /**/ }
  return "en";
}

function getTelegramId(): string | undefined {
  try {
    const id = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number | string } } } } })
      .Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (id !== undefined && id !== null) return String(id);
  } catch { /**/ }
  return undefined;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial);

  // First visit is always English. Persist it so Telegram / server language
  // cannot flip the UI on first open. Users change language in Settings.
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, "en");
    } catch { /**/ }
  }, []);

  useEffect(() => {
    setI18nLang(lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /**/ }
    const tid = getTelegramId();
    if (tid) void apiSetUserLanguage(tid, l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Safe fallback so components can render before the provider mounts.
    return { lang: "en" as Lang, setLang: () => {}, t: (k: string) => translate("en", k) };
  }
  return ctx;
}

export { LANGS };
export type { Lang };
