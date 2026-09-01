import { useEffect, useState, memo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n/LanguageContext";
import { ZoomCubeIcon } from "./ZoomCubeIcon";
import { openExternalUrl } from "../utils/zmcToken";
import {
  fetchZmcAirdropState,
  postZmcAirdropCheckin,
  postZmcAirdropClaim,
  postZmcAirdropSocial,
  type ZmcAirdropSocialId,
  type ZmcAirdropState,
} from "../utils/api";

const CYAN = "#00d4ff";
const GOLD = "#ffe566";

const SOCIALS: { id: ZmcAirdropSocialId; labelKey: string; url: string }[] = [
  { id: "discord", labelKey: "airdrop.social.discord", url: "https://discord.gg/uWZktCtD6Z" },
  { id: "x", labelKey: "airdrop.social.x", url: "https://x.com/zoomversebot?s=11" },
  { id: "youtube", labelKey: "airdrop.social.youtube", url: "https://youtube.com/@zoomverseworld?si=lafMJII8K_bmJR7l" },
  { id: "instagram", labelKey: "airdrop.social.instagram", url: "https://www.instagram.com/zoomverse0100?igsi=ZGxkdTNkbnE2bG1n&utm_source=qr" },
  { id: "tiktok", labelKey: "airdrop.social.tiktok", url: "https://www.tiktok.com/@zoom01002?_r=1&_t=ZG-99Bz3C5E3EG" },
];

function fmt(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString();
}

function holdDaysDone(s: ZmcAirdropState): number {
  const need = Math.max(1, s.hold.days || 15);
  if (s.hold.done) return need;
  if (!(s.hold.startedAtMs > 0)) return 0;
  const elapsed = Date.now() - s.hold.startedAtMs;
  return Math.min(need, Math.max(0, Math.floor(elapsed / 86400000)));
}

function missingLabel(t: (k: string, v?: Record<string, string | number>) => string, code: string, s: ZmcAirdropState): string {
  if (code === "checkin") return t("airdrop.miss.checkin", { n: s.checkin.streak, need: s.checkin.need });
  if (code === "social") return t("airdrop.miss.social");
  if (code === "wallet") return t("airdrop.miss.wallet");
  if (code === "hold_balance") return t("airdrop.miss.holdBal", { n: fmt(s.hold.min) });
  if (code === "hold_days") {
    return t("airdrop.miss.holdDays", { have: holdDaysDone(s), need: s.hold.days });
  }
  if (code === "crafts") return t("airdrop.miss.crafts", { n: s.crafts.have, need: s.crafts.need });
  if (code === "sales") return t("airdrop.miss.sales", { n: s.sales.have, need: s.sales.need });
  return code;
}

function ZmcAirdropWidgetBase({ telegramId }: { telegramId: string | null }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ZmcAirdropState | null>(null);
  const [busy, setBusy] = useState<"checkin" | "claim" | ZmcAirdropSocialId | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    if (!telegramId) return;
    const s = await fetchZmcAirdropState(telegramId);
    if (s) setState(s);
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, open ? 5000 : 60000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId, open]);

  useEffect(() => {
    if (!open) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onCheckin = async () => {
    if (!telegramId || busy) return;
    setBusy("checkin");
    setMsg(null);
    const r = await postZmcAirdropCheckin(telegramId);
    setBusy(null);
    if (!r.ok) setMsg(r.error ?? t("airdrop.err"));
    await refresh();
  };

  const onSocialDone = async (id: ZmcAirdropSocialId) => {
    if (!telegramId || busy) return;
    setBusy(id);
    setMsg(null);
    const r = await postZmcAirdropSocial(telegramId, id);
    setBusy(null);
    if (!r.ok) setMsg(r.error ?? t("airdrop.err"));
    await refresh();
  };

  const onClaim = async () => {
    if (!telegramId || busy || !state?.eligible) return;
    setBusy("claim");
    setMsg(null);
    const r = await postZmcAirdropClaim(telegramId);
    setBusy(null);
    if (!r.ok) setMsg(r.error ?? t("airdrop.err"));
    else setMsg(t("airdrop.claimedOk", { n: fmt(r.payout ?? state.payout) }));
    await refresh();
  };

  const remaining = state?.remaining ?? 0;
  const eligible = !!state?.eligible;
  const claimed = !!state?.claimed;
  const exhausted = !!state?.exhausted;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("airdrop.aria")}
        data-testid="button-zmc-airdrop"
        style={{
          position: "relative",
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "rgba(8,14,24,0.92)",
          border: `1.5px solid ${GOLD}`,
          padding: 0,
          cursor: "pointer",
          flexShrink: 0,
          WebkitTapHighlightColor: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: eligible ? `0 0 12px ${GOLD}55` : "0 4px 14px rgba(255, 210, 70, 0.18)",
        }}
      >
        <ZoomCubeIcon size={22} />
        {claimed && (
          <span style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#3dd68c",
            border: "2px solid #041018",
          }} />
        )}
      </button>

      {open && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(4,2,8,0.85)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "calc(env(safe-area-inset-top, 0px) + 90px) 14px calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
          data-testid="modal-zmc-airdrop"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 400,
              background:
                "radial-gradient(120% 80% at 50% -10%, rgba(255,210,70,0.16), transparent 55%), linear-gradient(180deg, #071018 0%, #04080e 100%)",
              border: `1px solid ${CYAN}40`,
              boxShadow: `0 24px 80px rgba(0,0,0,0.55), 0 0 60px ${CYAN}22`,
              borderRadius: 18,
              padding: 18,
              color: "#fff",
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("common.closeAria")}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.4)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 28 }}>
              <ZoomCubeIcon size={28} />
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.15 }}>{t("airdrop.title")}</div>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8, lineHeight: 1.4 }}>
              {t("airdrop.subtitle", { gross: fmt(state?.claimGross ?? 10000), net: fmt(state?.payout ?? 9500) })}
            </div>

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(0,212,255,0.06)",
              border: `1px solid ${CYAN}28`,
            }}>
              <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
                {t("airdrop.pool")}
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: exhausted ? "#ff6b6b" : GOLD }}>
                {fmt(remaining)}
                <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}> / {fmt(state?.total ?? 200000)}</span>
              </span>
            </div>

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <TaskRow
                done={!!state?.checkin.done}
                label={t("airdrop.task.checkin", { n: state?.checkin.streak ?? 0, need: state?.checkin.need ?? 7 })}
                action={!state?.checkin.done && !state?.checkin.checkedInToday ? (
                  <MiniBtn disabled={busy === "checkin"} onClick={onCheckin}>
                    {busy === "checkin" ? "…" : t("airdrop.checkinBtn")}
                  </MiniBtn>
                ) : state?.checkin.checkedInToday && !state.checkin.done ? (
                  <span style={{ fontSize: 10, color: CYAN }}>{t("airdrop.checkedIn")}</span>
                ) : null}
              />

              <div style={{
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <TaskRow done={SOCIALS.every((s) => state?.social[s.id])} label={t("airdrop.task.social")} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {SOCIALS.map((s) => {
                    const done = !!state?.social[s.id];
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ flex: 1, fontSize: 12, color: done ? "#3dd68c" : "rgba(255,255,255,0.75)" }}>
                          {done ? "✓ " : ""}{t(s.labelKey)}
                        </span>
                        {!done && (
                          <>
                            <MiniBtn onClick={() => openExternalUrl(s.url)}>{t("airdrop.open")}</MiniBtn>
                            <MiniBtn disabled={busy === s.id} onClick={() => onSocialDone(s.id)}>
                              {t("airdrop.done")}
                            </MiniBtn>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <TaskRow
                done={!!state?.hold.done}
                label={t("airdrop.task.hold", {
                  n: fmt(state?.hold.min ?? 10000),
                  d: state?.hold.days ?? 15,
                  daysHave: state ? holdDaysDone(state) : 0,
                  have: fmt(state?.hold.held ?? 0),
                })}
              />
              <TaskRow
                done={!!state?.crafts.done}
                label={t("airdrop.task.crafts", { n: state?.crafts.have ?? 0, need: state?.crafts.need ?? 50 })}
              />
              <TaskRow
                done={!!state?.sales.done}
                label={t("airdrop.task.sales", { n: state?.sales.have ?? 0, need: state?.sales.need ?? 10 })}
              />
            </div>

            {msg && (
              <div style={{ marginTop: 12, fontSize: 12, color: GOLD, lineHeight: 1.35 }}>{msg}</div>
            )}

            {claimed ? (
              <div style={{
                marginTop: 14,
                textAlign: "center",
                padding: "12px 10px",
                borderRadius: 12,
                background: "rgba(61,214,140,0.12)",
                border: "1px solid rgba(61,214,140,0.35)",
                fontWeight: 800,
                color: "#3dd68c",
              }}>
                {t("airdrop.claimedBadge", { n: fmt(state?.payoutZmc ?? state?.payout ?? 9500) })}
              </div>
            ) : exhausted ? (
              <div style={{
                marginTop: 14,
                textAlign: "center",
                padding: "12px 10px",
                borderRadius: 12,
                background: "rgba(255,80,80,0.1)",
                border: "1px solid rgba(255,80,80,0.35)",
                fontWeight: 800,
                color: "#ff8a8a",
              }}>
                {t("airdrop.exhausted")}
              </div>
            ) : (
              <>
                {!eligible && state && state.missing.length > 0 && (
                  <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
                    {state.missing.map((m) => (
                      <li key={m}>{missingLabel(t, m, state)}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  disabled={!eligible || busy === "claim" || !!state?.pending}
                  onClick={onClaim}
                  style={{
                    width: "100%",
                    marginTop: 14,
                    padding: "12px 10px",
                    borderRadius: 12,
                    border: "none",
                    fontWeight: 900,
                    fontSize: 14,
                    letterSpacing: "0.06em",
                    cursor: eligible && busy !== "claim" ? "pointer" : "not-allowed",
                    color: eligible ? "#041018" : "rgba(255,255,255,0.35)",
                    background: eligible
                      ? `linear-gradient(180deg, ${GOLD}, #e0b800)`
                      : "rgba(255,255,255,0.08)",
                  }}
                >
                  {busy === "claim" || state?.pending
                    ? t("airdrop.claiming")
                    : t("airdrop.claimBtn", { n: fmt(state?.payout ?? 9500) })}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function TaskRow({ done, label, action }: { done: boolean; label: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        flexShrink: 0,
        background: done ? "#3dd68c" : "transparent",
        border: done ? "none" : "1.5px solid rgba(255,255,255,0.25)",
        color: "#041018",
        fontSize: 10,
        fontWeight: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {done ? "✓" : ""}
      </span>
      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: done ? "rgba(255,255,255,0.55)" : "#fff" }}>
        {label}
      </span>
      {action}
    </div>
  );
}

function MiniBtn({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.04em",
        padding: "4px 8px",
        borderRadius: 8,
        border: `1px solid ${CYAN}55`,
        background: "rgba(0,212,255,0.08)",
        color: CYAN,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export const ZmcAirdropWidget = memo(ZmcAirdropWidgetBase);
