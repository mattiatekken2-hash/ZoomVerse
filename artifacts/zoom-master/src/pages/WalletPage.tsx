import { useMemo, useEffect, useState, useCallback, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { GramWalletPanel, GramWalletIcon, GramWalletConnectButton, type TonWalletProps } from "../components/TonWalletWidget";
import { StardustMarketModal } from "../components/StardustMarketModal";
import { ZoomMarketModal } from "../components/ZoomMarketModal";
import { GramChartModal } from "../components/GramChartModal";
import { ZoomCubeIcon } from "../components/ZoomCubeIcon";
import { WalletStarIcon } from "../components/WalletStarIcon";
import { useT } from "../i18n/LanguageContext";
import {
  prefetchWalletMarket,
  readWalletMarketCacheForDisplay,
  subscribeWalletMarketCache,
} from "../utils/walletMarketCache";
import { formatChangePct, formatGramValueFull, getRolling24hChange, chartIconScale, formatZoomChartPrice, formatStardustChartIndex, formatGramChartUsd } from "../utils/wallet24hChange";

const LIVE_POLL_MS = 12_000;

/** Lively white-sky blue for the GRAM wallet card. */
const GRAM_CELESTE = {
  main: "#C8EEFF",
  label: "rgba(200, 235, 255, 0.62)",
  border: "rgba(140, 215, 255, 0.32)",
  shadow: "rgba(120, 200, 255, 0.14)",
  divider: "rgba(140, 215, 255, 0.12)",
  bgFrom: "rgba(120, 205, 255, 0.12)",
  bgTo: "rgba(70, 165, 230, 0.05)",
};

/** Match GramWalletIcon footprint in the GRAM card (28–32px). */
const BALANCE_ICON_BOX = 42;
const BALANCE_ICON_SIZE = 30;
/** Fixed left column — keeps every row icon on the same vertical axis. */
const BALANCE_LEFT_COL = BALANCE_ICON_BOX;
/** Green tint for GRAM value under asset logos. */
const GRAM_SUB_VALUE_GREEN = "#34d399";
/** Fixed indicative pegs — not tradable until future features ship. */
const REDSTAR_GRAM_PER_UNIT = 0.05;
const NFTSTAR_GRAM_PER_UNIT = 0.25;

interface WalletPageProps extends Omit<TonWalletProps, "onOpenWalletTab" | "labVariant"> {
  /** ZOOM Season 2 balance */
  balance: number;
  stardustBalance: number;
  redStarBalance: number;
  nftStarBalance: number;
  onOpenHistory?: () => void;
  visible?: boolean;
}

/** Seed a stable pseudo-random between min..max from a string. */
function seededRange(seed: string, min: number, max: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return min + (h % (max - min + 1));
}

function formatZoom(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 20_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatUsdFromGram(gramValue: number | null, tonPrice: number | null, loading: boolean): string {
  if (loading) return "···";
  if (gramValue == null || tonPrice == null || !Number.isFinite(gramValue) || gramValue <= 0) return "—";
  return `$${(gramValue * tonPrice).toFixed(2)}`;
}

export function WalletPage({
  tonBalance,
  depositBalance,
  telegramId,
  whiteCollectionUnlocked,
  earthCollectionUnlocked,
  blackCollectionUnlocked,
  supernovaCollectionUnlocked,
  sunCount,
  whitePlanets,
  earthPlanets,
  blackPlanets,
  supernovaPlanets,
  balance,
  stardustBalance,
  redStarBalance,
  nftStarBalance,
  onOpenHistory,
  visible = true,
}: WalletPageProps) {
  const { t } = useT();
  const initialMarket = readWalletMarketCacheForDisplay();
  const [tonPrice, setTonPrice] = useState<number | null>(initialMarket.tonPriceUsd);
  const [priceLoading, setPriceLoading] = useState(initialMarket.tonPriceUsd == null);
  const [stardustMarketOpen, setStardustMarketOpen] = useState(false);
  const [zoomMarketOpen, setZoomMarketOpen] = useState(false);
  const [gramChartOpen, setGramChartOpen] = useState(false);
  const [liveStardustBalance, setLiveStardustBalance] = useState(stardustBalance);
  const [zoomPriceGram, setZoomPriceGram] = useState<number | null>(initialMarket.zoomPriceGram);
  const [stardustIndex, setStardustIndex] = useState<number>(initialMarket.stardustIndex);
  const [zoomChangePct, setZoomChangePct] = useState<number | null>(() =>
    initialMarket.zoomPriceGram != null
      ? getRolling24hChange("zoom-index", initialMarket.zoomPriceGram)
      : null,
  );
  const [stardustChangePct, setStardustChangePct] = useState<number | null>(() =>
    getRolling24hChange("stardust-index", initialMarket.stardustIndex),
  );
  const [gramChangePct, setGramChangePct] = useState<number | null>(() =>
    initialMarket.tonPriceUsd != null
      ? getRolling24hChange("gram-ton-usd", initialMarket.tonPriceUsd)
      : null,
  );

  const applyMarketCache = useCallback(() => {
    const cached = readWalletMarketCacheForDisplay();
    if (cached.tonPriceUsd != null) {
      setTonPrice(cached.tonPriceUsd);
      setPriceLoading(false);
      setGramChangePct(getRolling24hChange("gram-ton-usd", cached.tonPriceUsd));
    }
    if (cached.zoomPriceGram != null) {
      setZoomPriceGram(cached.zoomPriceGram);
      setZoomChangePct(getRolling24hChange("zoom-index", cached.zoomPriceGram));
    }
    if (Number.isFinite(cached.stardustIndex)) {
      setStardustIndex(cached.stardustIndex);
      setStardustChangePct(getRolling24hChange("stardust-index", cached.stardustIndex));
    }
  }, []);

  useEffect(() => {
    setLiveStardustBalance(stardustBalance);
  }, [stardustBalance]);

  useEffect(() => subscribeWalletMarketCache(applyMarketCache), [applyMarketCache]);

  useEffect(() => {
    if (!visible) return;
    applyMarketCache();
    void prefetchWalletMarket();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void prefetchWalletMarket();
    }, LIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [visible, applyMarketCache]);

  useEffect(() => {
    const onRefresh = () => { void prefetchWalletMarket(); };
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => window.removeEventListener("zoom-data-refresh", onRefresh);
  }, [applyMarketCache]);

  useEffect(() => {
    const onTabActive = (e: Event) => {
      const nextTab = (e as CustomEvent<{ tab?: string }>).detail?.tab;
      if (nextTab !== "wallet") return;
      applyMarketCache();
      void prefetchWalletMarket();
    };
    window.addEventListener("zoom-tab-active", onTabActive);
    return () => window.removeEventListener("zoom-tab-active", onTabActive);
  }, [applyMarketCache]);

  const usdtValue = tonPrice !== null ? (tonBalance * tonPrice).toFixed(2) : null;
  const zoomGramValue = zoomPriceGram != null && balance > 0 ? balance * zoomPriceGram : null;
  const stardustGramValue = liveStardustBalance > 0
    ? (liveStardustBalance * stardustIndex) / 100
    : null;
  // Under-icon: live chart unit (ZOOM ≈ 0.000001, Stardust ≈ 1.000000, GRAM = TON USD).
  // Icons scale with the same 24h chart % so they grow/shrink with the real market.
  const zoomIconValue = formatZoomChartPrice(zoomPriceGram);
  const stardustIconValue = formatStardustChartIndex(stardustIndex);
  const gramIconValue = formatGramChartUsd(tonPrice);
  const gramIconScale = chartIconScale(gramChangePct);
  const zoomIconScale = chartIconScale(zoomChangePct);
  const stardustIconScale = chartIconScale(stardustChangePct);
  const redStarGramValue = redStarBalance > 0 ? redStarBalance * REDSTAR_GRAM_PER_UNIT : null;
  const nftStarGramValue = nftStarBalance > 0 ? nftStarBalance * NFTSTAR_GRAM_PER_UNIT : null;
  const redStarIconValue = redStarBalance > 0 && redStarGramValue != null
    ? formatGramValueFull(redStarGramValue)
    : formatGramValueFull(REDSTAR_GRAM_PER_UNIT);
  const nftStarIconValue = nftStarBalance > 0 && nftStarGramValue != null
    ? formatGramValueFull(nftStarGramValue)
    : formatGramValueFull(NFTSTAR_GRAM_PER_UNIT);
  const priceLabel = tonPrice !== null
    ? t("walletPage.liveRate", { price: tonPrice.toFixed(2) })
    : t("walletPage.loadingRate");

  // Stable vault amount between 5 000 000 and 18 000 000
  const vaultZoom = useMemo(() => {
    const seed = telegramId ?? "default_seed_vault";
    return seededRange(seed, 5_000_000, 18_000_000);
  }, [telegramId]);

  const handleGramPriceUpdate = useCallback((p: number) => {
    setTonPrice(p);
    setPriceLoading(false);
    setGramChangePct(getRolling24hChange("gram-ton-usd", p));
  }, []);

  return (
    <div
      className="flex flex-col overflow-y-auto"
      style={{ height: "100%", padding: "12px 14px 28px", gap: 14 }}
    >
      {/* ── CONNECT WALLET (Telegram / TonConnect) ── */}
      <div className="flex justify-center pt-1 pb-1">
        <GramWalletConnectButton />
      </div>

      {/* ── MAIN BALANCE: GRAM + deposit/withdraw chips overlaid ── */}
      <div style={{ position: "relative" }}>
        <GramWalletPanel
          overlay
          tonBalance={tonBalance}
          depositBalance={depositBalance}
          telegramId={telegramId}
          whiteCollectionUnlocked={whiteCollectionUnlocked}
          earthCollectionUnlocked={earthCollectionUnlocked}
          blackCollectionUnlocked={blackCollectionUnlocked}
          supernovaCollectionUnlocked={supernovaCollectionUnlocked}
          sunCount={sunCount}
          whitePlanets={whitePlanets}
          earthPlanets={earthPlanets}
          blackPlanets={blackPlanets}
          supernovaPlanets={supernovaPlanets}
          zoomBalance={balance}
          onOpenHistory={onOpenHistory}
        />
        <button
          type="button"
          className="rounded-2xl text-left w-full transition-all active:scale-[0.99]"
          style={{
            background: `linear-gradient(135deg, ${GRAM_CELESTE.bgFrom} 0%, ${GRAM_CELESTE.bgTo} 100%)`,
            border: `1px solid ${GRAM_CELESTE.border}`,
            boxShadow: `0 0 32px ${GRAM_CELESTE.shadow}`,
            padding: "16px 18px",
            paddingTop: 44,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            WebkitUserSelect: "none",
            userSelect: "none",
          }}
          onClick={() => setGramChartOpen(true)}
          data-testid="gram-balance-card"
          aria-label={t("walletPage.openChartAria")}
        >
        {/* Label row */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: GRAM_CELESTE.label,
            marginBottom: 8,
            background: "transparent",
            textShadow: "none",
          }}
        >
          {t("walletPage.gramBalance")}
        </div>

        {/* Amount row — grid keeps GRAM and USDT from overlapping */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 14,
            alignItems: "end",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: tonBalance >= 1000 ? 28 : 34,
                fontWeight: 900,
                color: GRAM_CELESTE.main,
                lineHeight: 1.1,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
                textShadow: "0 0 14px rgba(180, 230, 255, 0.32)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "nowrap",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    transform: `scale(${gramIconScale})`,
                    transformOrigin: "center bottom",
                    transition: "transform 0.45s ease",
                  }}
                >
                  <GramWalletIcon size={tonBalance >= 1000 ? 28 : 32} />
                </span>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.55)",
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "0.01em",
                    whiteSpace: "nowrap",
                    lineHeight: 1.1,
                  }}
                >
                  {gramIconValue}
                </span>
                {gramChangePct != null && (
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      color: gramChangePct > 0
                        ? "rgba(0,255,140,0.75)"
                        : gramChangePct < 0
                          ? "rgba(255,100,100,0.75)"
                          : "rgba(255,255,255,0.35)",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.1,
                    }}
                  >
                    {formatChangePct(gramChangePct)}
                  </span>
                )}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tonBalance.toFixed(4)}
              </span>
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0, paddingBottom: 2 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "rgba(255,255,255,0.22)",
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                marginBottom: 2,
              }}
            >
              {t("walletPage.approxUsdt")}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: priceLoading ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
              }}
            >
              {priceLoading
                ? "···"
                : usdtValue !== null
                  ? `$${usdtValue}`
                  : "—"}
            </div>
          </div>
        </div>

        {/* Divider + price note */}
        <div
          style={{
            height: 1,
            background: GRAM_CELESTE.divider,
            margin: "10px 0 8px",
          }}
        />
        <div
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.22)",
            letterSpacing: "0.06em",
          }}
        >
          {priceLabel} · {t("walletPage.tapForChart")}
        </div>
        </button>
      </div>

      {gramChartOpen && (
        <GramChartModal
          key="gram-chart-modal"
          gramBalance={tonBalance}
          depositBalance={depositBalance}
          initialPrice={tonPrice}
          onClose={() => setGramChartOpen(false)}
          onPriceUpdate={handleGramPriceUpdate}
        />
      )}

      {/* ── ACTIVE BALANCES: Season 2 ── */}
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.22)",
            marginBottom: 8,
          }}
        >
          {t("walletPage.activeBalancesTitle")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* ZOOM S2 — cube logo, live chart unit under icon (grows/shrinks with %) */}
          <BalanceRow
            icon={<ZoomCubeIcon size={BALANCE_ICON_SIZE} />}
            label={t("walletPage.zoomS2")}
            value={formatZoom(balance)}
            color="#ffd740"
            gramValue={zoomGramValue}
            tonPrice={tonPrice}
            priceLoading={priceLoading}
            changePct={zoomChangePct}
            iconSubValue={zoomIconValue}
            iconScale={zoomIconScale}
            onClick={() => setZoomMarketOpen(true)}
            hint={t("walletPage.zoomHint")}
            data-testid="wallet-zoom-balance"
          />
          <BalanceRow
            icon={<WalletStarIcon variant="stardust" size={BALANCE_ICON_SIZE} />}
            label={t("resources.stardust")}
            value={formatZoom(liveStardustBalance)}
            color="#ffd740"
            iconColor="#ffd740"
            gramValue={stardustGramValue}
            tonPrice={tonPrice}
            priceLoading={priceLoading}
            changePct={stardustChangePct}
            iconSubValue={stardustIconValue}
            iconScale={stardustIconScale}
            onClick={() => setStardustMarketOpen(true)}
            hint={t("walletPage.stardustHint")}
          />
          <BalanceRow
            icon={<WalletStarIcon variant="redstar" size={BALANCE_ICON_SIZE} />}
            label={t("resources.redStar")}
            value={redStarBalance.toLocaleString()}
            color="#ff4444"
            iconColor="#ff4444"
            gramValue={redStarGramValue}
            tonPrice={tonPrice}
            priceLoading={priceLoading}
            changePct={0}
            iconSubValue={redStarIconValue}
            referenceOnly
          />
          <BalanceRow
            icon={<WalletStarIcon variant="nftstar" size={BALANCE_ICON_SIZE} />}
            label={t("resources.nftStar")}
            value={nftStarBalance.toLocaleString()}
            color="#a0a0a8"
            iconColor="#a0a0a8"
            gramValue={nftStarGramValue}
            tonPrice={tonPrice}
            priceLoading={priceLoading}
            changePct={0}
            iconSubValue={nftStarIconValue}
            referenceOnly
          />
        </div>
      </div>

      {/* ── VAULT: Season 1 Legacy & Airdrop ── */}
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.22)",
            marginBottom: 8,
          }}
        >
          {t("walletPage.vaultTitle")}
        </div>

        <div>
          {/* Vault row */}
          <div
            className="flex items-center justify-between"
            style={{ padding: "6px 0" }}
          >
            {/* Left: lock icon + label */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center"
                style={{
                  width: BALANCE_ICON_BOX,
                  height: BALANCE_ICON_BOX,
                  flexShrink: 0,
                }}
              >
                <Lock size={22} style={{ color: "#ffaa00", opacity: 0.9 }} strokeWidth={2.25} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#ffaa00", letterSpacing: "0.05em" }}>
                  {t("walletPage.season1Vault")}
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,170,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>
                  {t("walletPage.zoomS1Locked")}
                </div>
              </div>
            </div>

            {/* Right: amount */}
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  color: "#ffaa00",
                  fontVariantNumeric: "tabular-nums",
                  textShadow: "0 0 10px rgba(255,170,0,0.4)",
                  letterSpacing: "-0.01em",
                }}
              >
                {formatZoom(vaultZoom)}
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,170,0,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {t("walletPage.zoomUnit")}
              </div>
            </div>
          </div>

          {/* Info note */}
          <div style={{ padding: "8px 0 0", paddingLeft: BALANCE_ICON_BOX + 12 }}>
            <div style={{ fontSize: 10, lineHeight: 1.55, color: "rgba(255,255,255,0.32)", fontWeight: 600 }}>
              {t("walletPage.vaultInfo")}
            </div>
          </div>
        </div>
      </div>

      {zoomMarketOpen && (
        <ZoomMarketModal
          balance={balance}
          onClose={() => setZoomMarketOpen(false)}
        />
      )}

      {stardustMarketOpen && (
        <StardustMarketModal
          telegramId={telegramId ?? null}
          walletBalance={liveStardustBalance}
          depositBalance={depositBalance}
          earnedGramBalance={tonBalance}
          onClose={() => setStardustMarketOpen(false)}
          onBalanceChange={setLiveStardustBalance}
        />
      )}
    </div>
  );
}

/* ─────────── BalanceRow ─────────── */

function BalanceRow({
  icon,
  label,
  value,
  iconColor,
  gramValue,
  tonPrice,
  priceLoading,
  changePct,
  iconSubValue,
  iconScale = 1,
  referenceOnly,
  onClick,
  hint,
  "data-testid": dataTestId,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: string;
  iconColor?: string;
  gramValue?: number | null;
  tonPrice?: number | null;
  priceLoading?: boolean;
  changePct?: number | null;
  iconSubValue?: string;
  /** Live chart scale — emoji grows/shrinks with market %. */
  iconScale?: number;
  referenceOnly?: boolean;
  onClick?: () => void;
  hint?: string;
  "data-testid"?: string;
}) {
  const { t } = useT();
  const interactive = !!onClick;
  // Under-icon always shows chart unit + % (no GRAM). Right column keeps USD.
  const iconPctLabel = changePct != null ? formatChangePct(changePct) : "";
  const pctPositive = (changePct ?? 0) > 0;
  const pctNegative = (changePct ?? 0) < 0;
  const usdLabel = formatUsdFromGram(gramValue ?? null, tonPrice ?? null, !!priceLoading);
  const usdHeader = referenceOnly ? "walletPage.approxUsdRef" : "walletPage.approxUsd";
  const scale = Number.isFinite(iconScale) ? iconScale : 1;

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); } : undefined}
      data-testid={dataTestId}
      className="flex items-center justify-between"
      style={{
        padding: "6px 0",
        cursor: interactive ? "pointer" : undefined,
      }}
    >
      {/* Left — icon column + label/balance */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            minWidth: BALANCE_LEFT_COL,
          }}
        >
          <div
            style={{
              width: BALANCE_ICON_BOX,
              height: BALANCE_ICON_BOX,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: BALANCE_ICON_SIZE,
                height: BALANCE_ICON_SIZE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transform: `scale(${scale})`,
                transformOrigin: "center center",
                transition: "transform 0.45s ease",
              }}
            >
              {icon}
            </div>
          </div>
          {(iconSubValue || iconPctLabel) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                lineHeight: 1.15,
              }}
            >
              {iconSubValue && (
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.55)",
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "center",
                    letterSpacing: "0.01em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {iconSubValue}
                </div>
              )}
              {iconPctLabel && (
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 800,
                    color: pctPositive
                      ? "rgba(0,255,140,0.75)"
                      : pctNegative
                        ? "rgba(255,100,100,0.75)"
                        : "rgba(255,255,255,0.35)",
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "center",
                    letterSpacing: "0.02em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {iconPctLabel}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "rgba(255,255,255,0.22)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "rgba(255,255,255,0.65)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              marginTop: 2,
              lineHeight: 1.1,
            }}
          >
            {value}
          </div>
          {hint && (
            <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.18)", marginTop: 3, letterSpacing: "0.08em" }}>
              {hint}
            </div>
          )}
        </div>
      </div>

      {/* Right — live USD */}
      <div style={{ textAlign: "right", flexShrink: 0, paddingTop: 2 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(255,255,255,0.22)",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            marginBottom: 2,
          }}
        >
          {t(usdHeader)}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: priceLoading ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          {usdLabel}
        </div>
      </div>
    </div>
  );
}
