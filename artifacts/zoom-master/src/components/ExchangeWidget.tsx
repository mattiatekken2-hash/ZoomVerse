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

const POLL_MS = 60_000;

// Global, fixed launch target — must be identical for every user. Two
// months from the feature build date (10 May 2026 → 10 Jul 2026 00:00 UTC).
// Override at runtime by setting localStorage["zm.exchangeLaunchAtMs"] for
// admin/QA, but the default is hard-coded so all users see the same clock.
const LAUNCH_AT_MS: number = (() => {
  const FIXED = Date.UTC(2026, 6, 10, 0, 0, 0);
  if (typeof window === "undefined") return FIXED;
  try {
    const raw = window.localStorage.getItem("zm.exchangeLaunchAtMs");
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch { /**/ }
  return FIXED;
})();

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

function getCountdown(now: number): Countdown {
  const ms = Math.max(0, LAUNCH_AT_MS - now);
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
          background: "rgba(2,4,10,0.78)", backdropFilter: "blur(6px)",
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
            SERVE UN PIANETA SUN
          </div>
          <div style={{ color: "rgba(220,235,255,0.7)", fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
            Per accedere al cambio ZOOM ~ TON devi possedere almeno un pianeta SUN nel tuo inventario.
          </div>
          <button
            onClick={onClose}
            style={{
              marginTop: 16, width: "100%", padding: "10px 0", borderRadius: 12,
              background: "rgba(255,179,71,0.18)", border: "1px solid rgba(255,179,71,0.5)",
              color: "#ffb347", fontWeight: 800, letterSpacing: 1, fontSize: 12,
            }}
          >
            CHIUDI
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
        background: "rgba(2,4,10,0.78)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)", borderRadius: 20, padding: 20,
          background: "linear-gradient(135deg, rgba(0,30,55,0.96), rgba(6,10,22,0.98))",
          border: "1px solid rgba(0,242,254,0.45)",
          boxShadow: "0 0 40px rgba(0,242,254,0.25)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ color: "rgba(0,242,254,0.85)", fontSize: 11, fontWeight: 900, letterSpacing: 1.4 }}>
              EXCHANGE
            </div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, letterSpacing: 1, textShadow: "0 0 10px rgba(0,242,254,0.5)" }}>
              ZOOM ~ TON
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi"
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
            background: "rgba(0,242,254,0.07)", border: "1px solid rgba(0,242,254,0.25)",
          }}
        >
          <div style={{ color: "rgba(220,235,255,0.6)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
            TASSO ATTUALE
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ color: "rgba(220,235,255,0.6)", fontSize: 12 }}>1 $ZOOM =</span>
            <span style={{ color: "#00f2fe", fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", textShadow: "0 0 10px rgba(0,242,254,0.55)" }}>
              {formatPrice(price)} TON
            </span>
          </div>
          <div style={{ color: "rgba(220,235,255,0.5)", fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
            Il tasso di cambio è dinamico e segue l'andamento del grafico Economy.
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "rgba(220,235,255,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              QUANTITÀ $ZOOM
            </span>
            <button
              onClick={() => setAmount(String(Math.floor(balance)))}
              style={{
                fontSize: 10, fontWeight: 800, color: "#00f2fe", letterSpacing: 0.6,
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
              background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,242,254,0.35)",
              color: "#fff", fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums",
              outline: "none",
            }}
          />
        </div>

        <div
          style={{
            borderRadius: 14, padding: 14, marginBottom: 14,
            background: "linear-gradient(135deg, rgba(0,255,140,0.06), rgba(0,242,254,0.06))",
            border: "1px solid rgba(0,255,140,0.3)",
          }}
        >
          <div style={{ color: "rgba(220,235,255,0.6)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
            RICEVI
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span style={{ color: "#00ff88", fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums", textShadow: "0 0 12px rgba(0,255,140,0.45)" }}>
              {formatTon(tonOut)}
            </span>
            <span style={{ color: "#00ff88", fontSize: 12, fontWeight: 800 }}>TON</span>
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
            VALORE PORTFOLIO
          </span>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
            {formatTon(portfolio)} TON
          </span>
        </div>

        <button
          onClick={onExchange}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 14,
            background: "linear-gradient(135deg, #00f2fe, #00aaff)",
            border: "none", color: "#001a2e", fontWeight: 900, letterSpacing: 1.4, fontSize: 14,
            boxShadow: "0 6px 22px rgba(0,242,254,0.45)",
            cursor: "pointer",
          }}
        >
          EXCHANGE
        </button>

        {toast && (
          <div
            style={{
              position: "absolute", left: "50%", bottom: 80, transform: "translateX(-50%)",
              background: "rgba(0,242,254,0.95)", color: "#001a2e",
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
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

  const cd = getCountdown(now);
  const hasSun = sunCount > 0;

  const Body = (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 10, fontWeight: 900, letterSpacing: 1.4,
              color: "rgba(0,242,254,0.9)",
            }}
          >
            EXCHANGE
          </span>
          <span
            style={{
              fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6,
              background: "rgba(255,179,71,0.15)", color: "#ffb347",
              border: "1px solid rgba(255,179,71,0.35)", letterSpacing: 0.6,
            }}
          >
            SOON
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: 0.8, textShadow: "0 0 8px rgba(0,242,254,0.5)" }}>
            ZOOM ~ TON
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <div
          style={{
            display: "flex", alignItems: "baseline", gap: 4,
            color: "#00f2fe", fontWeight: 900, fontSize: 13,
            fontVariantNumeric: "tabular-nums", textShadow: "0 0 8px rgba(0,242,254,0.55)",
          }}
        >
          {cd.done ? (
            <span style={{ fontSize: 12, color: "#00ff88" }}>LIVE</span>
          ) : (
            <>
              <span>{cd.d}</span><span style={{ fontSize: 9, color: "rgba(220,235,255,0.55)" }}>g</span>
              <span style={{ marginLeft: 3 }}>{String(cd.h).padStart(2, "0")}</span><span style={{ fontSize: 9, color: "rgba(220,235,255,0.55)" }}>h</span>
              <span style={{ marginLeft: 3 }}>{String(cd.m).padStart(2, "0")}</span><span style={{ fontSize: 9, color: "rgba(220,235,255,0.55)" }}>m</span>
              <span style={{ marginLeft: 3 }}>{String(cd.s).padStart(2, "0")}</span><span style={{ fontSize: 9, color: "rgba(220,235,255,0.55)" }}>s</span>
            </>
          )}
        </div>
        <span style={{ fontSize: 10, color: "rgba(220,235,255,0.6)", fontVariantNumeric: "tabular-nums" }}>
          1 ZOOM = {formatPrice(price)} TON
        </span>
      </div>
    </>
  );

  const baseStyle: React.CSSProperties = {
    width: "calc(100% - 32px)",
    borderRadius: 14,
    padding: "10px 14px",
    margin: "8px 16px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "linear-gradient(135deg, rgba(0,40,60,0.6) 0%, rgba(0,16,32,0.85) 100%)",
    border: "1px solid rgba(0,242,254,0.35)",
    boxShadow: "0 0 16px rgba(0,242,254,0.18), inset 0 0 10px rgba(0,242,254,0.06)",
  };

  return (
    <>
      {hasSun ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Apri Exchange ZOOM ~ TON"
          data-testid="btn-exchange-widget"
          style={{ ...baseStyle, cursor: "pointer" }}
        >
          {Body}
        </button>
      ) : (
        <div
          aria-label="Exchange ZOOM ~ TON (richiede SUN)"
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
