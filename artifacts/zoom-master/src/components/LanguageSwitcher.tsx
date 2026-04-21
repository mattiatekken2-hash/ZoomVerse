import { memo, useState } from "react";
import { LANGS, useT } from "../i18n/LanguageContext";

export const LanguageSwitcher = memo(function LanguageSwitcher() {
  const { lang, setLang, t } = useT();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <>
      <button
        type="button"
        aria-label={t("common.language")}
        onClick={() => setOpen(true)}
        className="glass-neon rounded-full flex items-center justify-center"
        style={{ width: 32, height: 32, fontSize: 16, border: "none", cursor: "pointer", padding: 0 }}
      >
        {current.flag}
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div
            style={{
              background: "linear-gradient(180deg, rgba(14,18,36,0.98), rgba(8,10,22,0.98))",
              border: "1px solid rgba(0,242,254,0.3)",
              borderRadius: 16,
              padding: 18,
              width: "100%", maxWidth: 280,
              display: "flex", flexDirection: "column", gap: 10,
              boxShadow: "0 0 30px rgba(0,242,254,0.15)",
            }}
          >
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em", textAlign: "center", marginBottom: 4 }}>
              {t("common.language").toUpperCase()}
            </div>
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: l.code === lang ? "1.5px solid #00f2fe" : "1px solid rgba(255,255,255,0.08)",
                  background: l.code === lang ? "rgba(0,242,254,0.10)" : "rgba(255,255,255,0.03)",
                  color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "0.04em",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ fontSize: 22 }}>{l.flag}</span>
                <span>{l.label}</span>
                {l.code === lang && <span style={{ marginLeft: "auto", color: "#00f2fe" }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
});
