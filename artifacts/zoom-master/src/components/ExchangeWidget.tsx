/**
 * ExchangeWidget — pill at the top of the LAB page that previews the
 * upcoming ZOOM ↔ TON exchange. Shows a live 2-month countdown plus the
 * current dynamic exchange rate (same source as the FARM → ECONOMY
 * widget). Tapping opens a modal with a live conversion calculator and
 * the user's portfolio in TON.
 *
 * Gating:
 *   • Users WITHOUT a SUN planet can only see the countdown — the
 *     widget is non-clickable and shows a small "Serve un SUN" hint.
 *   • Users WITH a SUN can open the modal, simulate conversions and
 *     press EXCHANGE (which currently just shows a "coming soon"
 *     toast — the real swap is not live yet).
 */
import { memo, useEffect, useState, useCallback, useMemo } from "react";
import { fetchEconomyPrice, fetchEconomyHistory } from "../utils/api";
import { useGlobalStore } from "../store/globalStore";

const POLL_MS = 60_000;

// The exchange opens 90 days after the current season starts. Anchoring to
// the season epoch (a single server timestamp, identical for every user)
// keeps the countdown perfectly in sync across all clients and makes it
// auto-restart whenever a new season begins. There is intentionally NO
// client-side override — a stale localStorage value used to silently pin
// an old launch date, so the countdown is now driven purely by the season.
const EXCHANGE_DELAY_MS = 90 * 24 * 60 * 60 * 1000;
// Fallback launch used only until the season epoch has loaded from the server.
const FALLBACK_LAUNCH_AT_MS = Date.UTC(2026, 8, 1, 0, 0, 0);

interface ExchangeWidgetProps {
  balance: number;
  sunCount: number;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0.000000";
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 10) return p.toFixed(3);
  return p.toFixed(2);
}

function formatTon(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return "0.000000";
  if (t < 0.01) return t.toFixed(6);
  if (t < 1) return t.toFixed(4);
  return t.toFixed(3);
}

interface Countdown { d: number; h: number; m: number; s: number; done: boolean }

function getCountdown(now: number, launchAtMs: number): Countdown {
  const ms = Math.max(0, launchAtMs - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { d, h, m, s, done: ms <= 0 };
}

function ExchangeModal({
  onClose, balance, price, sunCount,
}: {
  onClose: () => void;
  balance: number;
  price: number;
  sunCount: number;
}) {
  const [amount, setAmount] = useState<string>(() => Math.min(balance, 10000).toFixed(0));
  const [toast, setToast] = useState<string | null>(null);

  const numericAmount = useMemo(() => {
    const n = Number(amount.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amount]);

  const tonOut = numericAmount * price;
  const portfolio = balance * price;

  const onExchange = () => {
    setToast("EXCHANGE — coming soon");
    window.setTimeout(() => setToast(null), 1800);
  };

  if (sunCount <= 0) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(420px, 100%)", borderRadius: 18, padding: 22,
            background: "linear-gradient(135deg, rgba(20,30,55,0.96), rgba(6,10,22,0.98))",
            border: "1px solid rgba(255,179,71,0.45)",
            boxShadow: "0 0 40px rgba(255,179,71,0.25)",
          }}
        >
          <div style={{ fontSize: 28, textAlign: "center", marginBottom: 8 }}>☀️</div>
          <div style={{ color: "#ffb347", fontSize: 14, fontWeight: 800, textAlign: "center", letterSpacing: 1.2 }}>
            SUN PLANET REQUIRED
          </div>
          <div style={{ color: "rgba(220,235,255,0.7)", fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
            You need to own at least one SUN planet in your inventory to access the ZOOM ~ GRAM exchange.
          </div>
          <button
            onClick={onClose}
            style={{
              marginTop: 16, width: "100%", padding: "10px 0", borderRadius: 12,
              background: "rgba(255,179,71,0.18)", border: "1px solid rgba(255,179,71,0.5)",
              color: "#ffb347", fontWeight: 800, letterSpacing: 1, fontSize: 12,
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)", borderRadius: 20, padding: 20,
          background: "linear-gradient(135deg, rgba(0,30,55,0.96), rgba(6,10,22,0.98))",
          border: "1px solid rgba(255,51,85,0.45)",
          boxShadow: "0 0 40px rgba(255,51,85,0.25)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ color: "rgba(255,51,85,0.85)", fontSize: 11, fontWeight: 900, letterSpacing: 1.4 }}>
              EXCHANGE
            </div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, letterSpacing: 1, textShadow: "0 0 10px rgba(255,51,85,0.5)" }}>
              ZOOM ~ GRAM
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 10, fontSize: 16,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(220,235,255,0.85)", cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            borderRadius: 14, padding: 12, marginBottom: 12,
            background: "rgba(255,51,85,0.07)", border: "1px solid rgba(255,51,85,0.25)",
          }}
        >
          <div style={{ color: "rgba(220,235,255,0.6)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
            CURRENT RATE
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ color: "rgba(220,235,255,0.6)", fontSize: 12 }}>1 $ZOOM =</span>
            <span style={{ color: "#ff3355", fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", textShadow: "0 0 10px rgba(255,51,85,0.55)" }}>
              {formatPrice(price)} GRAM
            </span>
          </div>
          <div style={{ color: "rgba(220,235,255,0.5)", fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
            The exchange rate is dynamic and follows the Economy chart.
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "rgba(220,235,255,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              $ZOOM AMOUNT
            </span>
            <button
              onClick={() => setAmount(String(Math.floor(balance)))}
              style={{
                fontSize: 10, fontWeight: 800, color: "#ff3355", letterSpacing: 0.6,
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
              }}
            >
              MAX ({Math.floor(balance).toLocaleString()})
            </button>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={0}
            placeholder="0"
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 12,
              background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,51,85,0.35)",
              color: "#fff", fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums",
              outline: "none",
            }}
          />
        </div>

        <div
          style={{
            borderRadius: 14, padding: 14, marginBottom: 14,
            background: "linear-gradient(135deg, rgba(0,255,140,0.06), rgba(255,51,85,0.06))",
            border: "1px solid rgba(0,255,140,0.3)",
          }}
        >
          <div style={{ color: "rgba(220,235,255,0.6)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
            YOU RECEIVE
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span style={{ color: "#00ff88", fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums", textShadow: "0 0 12px rgba(0,255,140,0.45)" }}>
              {formatTon(tonOut)}
            </span>
            <span style={{ color: "#00ff88", fontSize: 12, fontWeight: 800 }}>GRAM</span>
          </div>
        </div>

        <div
          style={{
            borderRadius: 12, padding: "10px 12px", marginBottom: 14,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}
        >
          <span style={{ color: "rgba(220,235,255,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
            PORTFOLIO VALUE
          </span>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
            {formatTon(portfolio)} GRAM
          </span>
        </div>

        <button
          onClick={onExchange}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 14,
            background: "linear-gradient(135deg, #ff3355, #00aaff)",
            border: "none", color: "#001a2e", fontWeight: 900, letterSpacing: 1.4, fontSize: 14,
            boxShadow: "0 6px 22px rgba(255,51,85,0.45)",
            cursor: "pointer",
          }}
        >
          EXCHANGE
        </button>

        {toast && (
          <div
            style={{
              position: "absolute", left: "50%", bottom: 80, transform: "translateX(-50%)",
              background: "rgba(255,51,85,0.95)", color: "#001a2e",
              padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 900, letterSpacing: 0.5,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function ExchangeWidgetBase({ balance, sunCount }: ExchangeWidgetProps) {
  const [now, setNow] = useState<number>(Date.now());
  const [price, setPrice] = useState<number>(0.000001);
  const [open, setOpen] = useState(false);
  const seasonEpoch = useGlobalStore((s) => s.seasonEpoch);

  useEffect(() => {
    // Live countdown — tick every second so the seconds digit visibly
    // counts down in real time while the user is on the Lab page.
    const id = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);

  const refreshPrice = useCallback(async () => {
    const [p, h] = await Promise.all([fetchEconomyPrice(), fetchEconomyHistory()]);
    if (p && Number.isFinite(p.price) && p.price > 0) {
      setPrice(p.price);
    } else if (h?.points && h.points.length > 0) {
      const last = h.points[h.points.length - 1];
      if (last && Number.isFinite(last.p)) setPrice(last.p);
    }
  }, []);

  useEffect(() => {
    void refreshPrice();
    const id = window.setInterval(() => { void refreshPrice(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void refreshPrice(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshPrice, open]);

  const launchAtMs = useMemo(() => {
    if (seasonEpoch && seasonEpoch > 0) return seasonEpoch + EXCHANGE_DELAY_MS;
    return FALLBACK_LAUNCH_AT_MS;
  }, [seasonEpoch]);

  const seasonReady = seasonEpoch != null;
  const cd = getCountdown(now, launchAtMs);
  const hasSun = sunCount > 0;

  const Body = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, lineHeight: 1.1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            fontSize: 9, fontWeight: 900, letterSpacing: 0.8,
            color: "#fff", textShadow: "0 0 6px rgba(255,51,85,0.55)",
          }}
        >
          ZOOM~GRAM
        </span>
        <span
          style={{
            fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: 4,
            background: "rgba(255,179,71,0.18)", color: "#ffb347",
            border: "1px solid rgba(255,179,71,0.4)", letterSpacing: 0.4,
          }}
        >
          SOON
        </span>
      </div>
      <div
        style={{
          display: "flex", alignItems: "baseline", gap: 2,
          color: "#ff3355", fontWeight: 900, fontSize: 10,
          fontVariantNumeric: "tabular-nums", textShadow: "0 0 6px rgba(255,51,85,0.5)",
        }}
      >
        {!seasonReady ? (
          <span style={{ opacity: 0.6 }}>--g --:--:--</span>
        ) : cd.done ? (
          <span style={{ fontSize: 10, color: "#00ff88" }}>LIVE</span>
        ) : (
          <span>
            {cd.d}g {String(cd.h).padStart(2, "0")}:{String(cd.m).padStart(2, "0")}:{String(cd.s).padStart(2, "0")}
          </span>
        )}
      </div>
    </div>
  );

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    top: 8,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 30,
    borderRadius: 10,
    padding: "5px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, rgba(0,40,60,0.75) 0%, rgba(0,16,32,0.9) 100%)",
    border: "1px solid rgba(255,51,85,0.4)",
    boxShadow: "0 0 12px rgba(255,51,85,0.25)",
  };

  return (
    <>
      {hasSun ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Apri Exchange ZOOM ~ GRAM"
          data-testid="btn-exchange-widget"
          style={{ ...baseStyle, cursor: "pointer" }}
        >
          {Body}
        </button>
      ) : (
        <div
          aria-label="Exchange ZOOM ~ GRAM (richiede SUN)"
          title="Serve almeno 1 pianeta SUN per accedere"
          style={{ ...baseStyle, opacity: 0.85, cursor: "not-allowed" }}
        >
          {Body}
        </div>
      )}
      {open && hasSun && (
        <ExchangeModal
          onClose={() => setOpen(false)}
          balance={balance}
          price={price}
          sunCount={sunCount}
        />
      )}
    </>
  );
}

export const ExchangeWidget = memo(ExchangeWidgetBase);
