/**
 * ExchangeWidget — wallet chip + popup to preview ZOOM → GRAM exchange.
 */
import { memo, useEffect, useState, useCallback, useMemo, type CSSProperties } from "react";
import { useGlobalStore } from "../store/globalStore";
import { useT } from "../i18n/LanguageContext";
import { WalletActionPopup, FieldLabel, Feedback } from "./WalletActionPopup";
import {
  prefetchWalletMarket,
  readWalletMarketCacheForDisplay,
  subscribeWalletMarketCache,
} from "../utils/walletMarketCache";

const EXCHANGE_DELAY_MS = 80 * 24 * 60 * 60 * 1000;
const FALLBACK_LAUNCH_AT_MS = Date.UTC(2026, 8, 1, 0, 0, 0);
const EXCHANGE_COLOR = "#ffb347";

interface ExchangeWidgetProps {
  balance: number;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0.000000";
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 10) return p.toFixed(3);
  return p.toFixed(2);
}

function formatGramOut(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return "0.000000";
  if (t < 0.01) return t.toFixed(6);
  if (t < 1) return t.toFixed(4);
  return t.toFixed(3);
}

function getDaysRemaining(now: number, launchAtMs: number): number {
  return Math.max(0, Math.ceil((launchAtMs - now) / 86_400_000));
}

function ExchangeModal({
  onClose,
  balance,
  price,
  daysRemaining,
  seasonReady,
}: {
  onClose: () => void;
  balance: number;
  price: number;
  daysRemaining: number;
  seasonReady: boolean;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState<string>(() => String(Math.min(Math.floor(balance), 10000) || ""));
  const [msg, setMsg] = useState<string | null>(null);

  const numericAmount = useMemo(() => {
    const n = Number(amount.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amount]);

  const gramOut = numericAmount * price;
  const exchangeOpen = seasonReady && daysRemaining <= 0;

  const subtitle = !seasonReady
    ? t("wallet.exchangeCountdownLoading")
    : exchangeOpen
      ? t("wallet.exchangeCountdownLive")
      : t("wallet.exchangeDaysRemaining", { n: daysRemaining });

  const inputStyle: CSSProperties = {
    width: "100%",
    minHeight: 44,
    padding: "11px 12px",
    borderRadius: 12,
    background: "rgba(0,0,0,0.45)",
    border: `1px solid ${EXCHANGE_COLOR}33`,
    color: "#fff",
    fontSize: 18,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    outline: "none",
    boxSizing: "border-box",
    textAlign: "center",
  };

  const onExchange = () => {
    setMsg(t("wallet.exchangeComingSoon"));
    window.setTimeout(() => setMsg(null), 2200);
  };

  return (
    <WalletActionPopup
      title={t("wallet.exchangeTitle")}
      subtitle={subtitle}
      color={EXCHANGE_COLOR}
      icon="⇄"
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          className="rounded-xl text-center py-2"
          style={{ background: `${EXCHANGE_COLOR}10`, border: `1px solid ${EXCHANGE_COLOR}22` }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
            {t("wallet.exchangeCurrentRate")}
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: EXCHANGE_COLOR, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            1 ZOOM = {formatPrice(price)} GRAM
          </div>
        </div>

        <div>
          <FieldLabel color={`${EXCHANGE_COLOR}99`}>{t("wallet.exchangeZoomAmount")}</FieldLabel>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0}
              placeholder="0"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setAmount(String(Math.floor(balance)))}
              disabled={balance <= 0}
              style={{
                padding: "0 12px",
                borderRadius: 12,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.08em",
                color: EXCHANGE_COLOR,
                background: `${EXCHANGE_COLOR}18`,
                border: `1px solid ${EXCHANGE_COLOR}40`,
                cursor: balance <= 0 ? "not-allowed" : "pointer",
                flexShrink: 0,
                opacity: balance <= 0 ? 0.45 : 1,
              }}
            >
              MAX
            </button>
          </div>
        </div>

        <div
          className="rounded-xl text-center py-2"
          style={{ background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.18)" }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
            {t("wallet.exchangeYouReceive")}
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#69f0ae", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {formatGramOut(gramOut)} GRAM
          </div>
        </div>

        <button
          type="button"
          onClick={onExchange}
          disabled={!exchangeOpen || numericAmount <= 0}
          style={{
            width: "100%",
            minHeight: 46,
            padding: "12px 16px",
            borderRadius: 12,
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: 0.8,
            border: "none",
            background: exchangeOpen && numericAmount > 0
              ? `linear-gradient(135deg, ${EXCHANGE_COLOR}, #ff8c42)`
              : "rgba(255,255,255,0.08)",
            color: exchangeOpen && numericAmount > 0 ? "#1a1208" : "rgba(255,255,255,0.35)",
            cursor: exchangeOpen && numericAmount > 0 ? "pointer" : "not-allowed",
          }}
        >
          {t("wallet.exchangeBtn")}
        </button>

        {msg && <Feedback tone="ok">{msg}</Feedback>}
      </div>
    </WalletActionPopup>
  );
}

function ExchangeWidgetBase({ balance }: ExchangeWidgetProps) {
  const { t } = useT();
  const [now, setNow] = useState(Date.now());
  const initialMarket = readWalletMarketCacheForDisplay();
  const [price, setPrice] = useState(initialMarket.zoomPriceGram ?? 0.000001);
  const [open, setOpen] = useState(false);
  const seasonEpoch = useGlobalStore((s) => s.seasonEpoch);

  const applyMarketCache = useCallback(() => {
    const cached = readWalletMarketCacheForDisplay();
    if (cached.zoomPriceGram != null && cached.zoomPriceGram > 0) {
      setPrice(cached.zoomPriceGram);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => subscribeWalletMarketCache(applyMarketCache), [applyMarketCache]);

  useEffect(() => {
    applyMarketCache();
    void prefetchWalletMarket();
  }, [applyMarketCache, open]);

  const launchAtMs = useMemo(() => {
    if (seasonEpoch && seasonEpoch > 0) return seasonEpoch + EXCHANGE_DELAY_MS;
    return FALLBACK_LAUNCH_AT_MS;
  }, [seasonEpoch]);

  const seasonReady = seasonEpoch != null;
  const daysRemaining = getDaysRemaining(now, launchAtMs);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label={t("wallet.exchangeTitle")}
        data-testid="wallet-exchange-orb"
        className="flex items-center justify-center active:scale-95 transition-transform"
        style={{
          padding: "5px 8px",
          minWidth: 28,
          borderRadius: 10,
          background: `${EXCHANGE_COLOR}14`,
          border: `1px solid ${EXCHANGE_COLOR}44`,
          boxShadow: `0 0 12px ${EXCHANGE_COLOR}18`,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1, color: EXCHANGE_COLOR, fontWeight: 900 }} aria-hidden>
          ⇄
        </span>
      </button>
      {open && (
        <ExchangeModal
          onClose={() => setOpen(false)}
          balance={balance}
          price={price}
          daysRemaining={daysRemaining}
          seasonReady={seasonReady}
        />
      )}
    </>
  );
}

export const ExchangeWidget = memo(ExchangeWidgetBase);
