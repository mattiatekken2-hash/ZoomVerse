/**
 * ExchangeWidget — wallet chip + popup to preview ZOOM → GRAM exchange.
 */
import { memo, useEffect, useState, useCallback, useMemo } from "react";
import { useGlobalStore } from "../store/globalStore";
import { useT } from "../i18n/LanguageContext";
import { WalletActionPopup } from "./WalletActionPopup";
import {
  prefetchWalletMarket,
  readWalletMarketCacheForDisplay,
  subscribeWalletMarketCache,
} from "../utils/walletMarketCache";
import { formatZoomChartPrice } from "../utils/wallet24hChange";

const EXCHANGE_DELAY_MS = 80 * 24 * 60 * 60 * 1000;
const FALLBACK_LAUNCH_AT_MS = Date.UTC(2026, 8, 1, 0, 0, 0);
const EXCHANGE_COLOR = "#ffb347";

interface ExchangeWidgetProps {
  balance: number;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p < 0.0001) return formatZoomChartPrice(p);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 10) return p.toFixed(3);
  return p.toFixed(2);
}

function getDaysRemaining(now: number, launchAtMs: number): number {
  return Math.max(0, Math.ceil((launchAtMs - now) / 86_400_000));
}

function ExchangeModal({
  onClose,
  price,
  daysRemaining,
  seasonReady,
}: {
  onClose: () => void;
  price: number;
  daysRemaining: number;
  seasonReady: boolean;
}) {
  const { t } = useT();
  const exchangeOpen = seasonReady && daysRemaining <= 0;

  const subtitle = !seasonReady
    ? t("wallet.exchangeCountdownLoading")
    : exchangeOpen
      ? t("wallet.exchangeCountdownLive")
      : t("wallet.exchangeDaysRemaining", { n: daysRemaining });

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
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
          {t("wallet.exchangeRateNote")}
        </p>
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
          price={price}
          daysRemaining={daysRemaining}
          seasonReady={seasonReady}
        />
      )}
    </>
  );
}

export const ExchangeWidget = memo(ExchangeWidgetBase);
