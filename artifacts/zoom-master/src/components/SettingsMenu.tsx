import { memo, useEffect, useState } from "react";
import { LANGS, useT } from "../i18n/LanguageContext";

interface SettingsMenuProps {
  muted: boolean;
  setMuted: (next: boolean | ((prev: boolean) => boolean)) => void;
}

/**
 * Single gear-icon entry point for app preferences. Replaces the previous
 * standalone language flag + volume button in the header. Opens a small
 * modal containing:
 *   - Language picker (flags shown for the languages exposed in `LANGS`)
 *   - Audio toggle (mute / unmute)
 */
export const SettingsMenu = memo(function SettingsMenu({ muted, setMuted }: SettingsMenuProps) {
  const { lang, setLang, t } = useT();
  const [open, setOpen] = useState(false);

  // ESC closes the modal — small QoL on desktop / web preview.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={t("common.settings")}
        data-testid="settings-button"
        onClick={() => setOpen(true)}
        className="glass-neon rounded-full flex items-center justify-center"
        style={{
          width: 32,
          height: 32,
          padding: 0,
          border: "none",
          color: "rgba(255,255,255,0.85)",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* Inline gear glyph — kept as SVG so it renders identically across
            platforms (Telegram WebView on iOS/Android sometimes substitutes
            emoji glyphs). */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: "drop-shadow(0 0 4px rgba(255,51,85,0.45))",
          }}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            data-testid="settings-modal"
            style={{
              background: "linear-gradient(180deg, rgba(14,18,36,0.98), rgba(8,10,22,0.98))",
              border: "1px solid rgba(255,51,85,0.3)",
              borderRadius: 16,
              padding: 18,
              width: "100%",
              maxWidth: 300,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "0 0 30px rgba(255,51,85,0.15)",
            }}
          >
            {/* Title */}
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.18em",
                textAlign: "center",
                fontWeight: 700,
              }}
            >
              {t("common.settings").toUpperCase()}
            </div>

            {/* Language section */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: "0.14em",
                  fontWeight: 700,
                  paddingLeft: 2,
                }}
              >
                {t("common.language").toUpperCase()}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {LANGS.map((l) => {
                  const active = l.code === lang;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setLang(l.code)}
                      data-testid={`settings-lang-${l.code}`}
                      style={{
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: 8,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: active ? "1.5px solid #ff3355" : "1px solid rgba(255,255,255,0.08)",
                        background: active ? "rgba(255,51,85,0.10)" : "rgba(255,255,255,0.03)",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        cursor: "pointer",
                        WebkitTapHighlightColor: "transparent",
                        transition: "background 120ms",
                      }}
                    >
                      <span style={{ fontSize: 20, flex: "0 0 auto" }}>{l.flag}</span>
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {l.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Audio section */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: "0.14em",
                  fontWeight: 700,
                  paddingLeft: 2,
                }}
              >
                {t("common.audio").toUpperCase()}
              </div>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                data-testid="settings-audio-toggle"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{muted ? "🔇" : "🔊"}</span>
                <span style={{ flex: 1, textAlign: "left" }}>
                  {muted ? t("common.muted") : t("common.unmuted")}
                </span>
                {/* iOS-style switch */}
                <span
                  aria-hidden
                  style={{
                    position: "relative",
                    width: 38,
                    height: 22,
                    borderRadius: 999,
                    background: muted ? "rgba(255,255,255,0.10)" : "#ff3355",
                    transition: "background 160ms",
                    boxShadow: muted ? "none" : "0 0 12px rgba(255,51,85,0.55)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: muted ? 2 : 18,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left 160ms",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                    }}
                  />
                </span>
              </button>
            </div>

            {/* Close */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                marginTop: 4,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.85)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {t("common.close").toUpperCase()}
            </button>
          </div>
        </div>
      )}
    </>
  );
});
