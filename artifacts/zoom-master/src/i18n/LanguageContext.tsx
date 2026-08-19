import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { translate, type Lang, LANGS } from "./translations";
import { setI18nLang } from "./gameMessage";
import { setUserLanguage as apiSetUserLanguage, fetchUserLanguage } from "../utils/api";

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
  // Auto-detect from Telegram WebApp / browser
  try {
    const code =
      (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } })
        .Telegram?.WebApp?.initDataUnsafe?.user?.language_code ||
      (typeof navigator !== "undefined" ? navigator.language : "");
    const norm = (code || "").toLowerCase().slice(0, 2);
    if (norm === "it") return "it";
    if (norm === "es") return "es";
    if (norm === "fil" || norm === "tl") return "fil";
    if (norm === "ru") return "ru";
    if (norm === "uk") return "uk";
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

  // Pull stored language from server only when localStorage is empty.
  // localStorage is treated as authoritative once the user has picked, so we
  // never get a flicker (local → flip to server) on subsequent mounts.
  const [hydratedFromServer, setHydratedFromServer] = useState(false);
  useEffect(() => {
    if (hydratedFromServer) return;
    let hasLocal = false;
    try { hasLocal = !!localStorage.getItem(STORAGE_KEY); } catch { /**/ }
    if (hasLocal) { setHydratedFromServer(true); return; }
    const tid = getTelegramId();
    if (!tid) return;
    let alive = true;
    fetchUserLanguage(tid).then((serverLang) => {
      if (!alive) return;
      if (serverLang && ALL_LANGS.includes(serverLang as Lang)) {
        setLangState(serverLang);
        try { localStorage.setItem(STORAGE_KEY, serverLang); } catch { /**/ }
      }
      setHydratedFromServer(true);
    }).catch(() => setHydratedFromServer(true));
    return () => { alive = false; };
  }, [hydratedFromServer]);

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
