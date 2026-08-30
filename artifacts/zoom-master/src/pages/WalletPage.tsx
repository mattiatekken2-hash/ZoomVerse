import { useMemo, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  commitStickyWalletBalance,
  useStickyWalletBalance,
} from "../hooks/useStickyWalletBalance";
import { Lock } from "lucide-react";
import { GramWalletPanel, GramWalletConnectButton, type TonWalletProps } from "../components/TonWalletWidget";
import { StardustMarketModal } from "../components/StardustMarketModal";
import { ZoomMarketModal } from "../components/ZoomMarketModal";
import { EconomyModal } from "../components/EconomyModal";
import { ZoomCubeIcon } from "../components/ZoomCubeIcon";
import { WalletStarIcon } from "../components/WalletStarIcon";
import { useT } from "../i18n/LanguageContext";
import {
  prefetchWalletMarket,
  readWalletMarketCacheForDisplay,
  subscribeWalletMarketCache,
} from "../utils/walletMarketCache";
import {
  fetchGramMarketSnapshot,
  readGramSpotUsd,
  subscribeGramMarket,
} from "../utils/gramMarket";
import { prefetchStardustSheet } from "../utils/api";
import { displayStardustIndex } from "../utils/stardustMarket";
import { pickWalletTonUsd, lockTonUsd, getLockedTonUsd } from "../utils/displayTonUsd";
import { formatChangePct, formatGramValueFull, formatZoomChartPrice, formatStardustChartIndex } from "../utils/wallet24hChange";
import { useZmcStatus } from "../hooks/useZmcStatus";
import { formatZmcAmount } from "../utils/zmcToken";

const LIVE_POLL_MS = 5_000;

/** Lively cyan for the ZMC wallet card. */
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
/** Fixed left column — same width as the emoji box so values sit under the icon. */
const BALANCE_LEFT_COL = BALANCE_ICON_BOX;
/** Green tint for GRAM value under asset logos. */
const GRAM_SUB_VALUE_GREEN = "#34d399";
/** Fixed indicative pegs — not tradable until future features ship. */
const REDSTAR_GRAM_PER_UNIT = 0.05;
const NFTSTAR_GRAM_PER_UNIT = 0.25;

interface WalletPageProps extends Omit<TonWalletProps, "onOpenWalletTab" | "labVariant"> {
  /** ZOOM Season 3 balance */
  balance: number;
  stardustBalance: number;
  redStarBalance: number;
  nftStarBalance: number;
  onOpenHistory?: () => void;
  /** Server banked ★ from the chart modal — keep wallet and graph in sync. */
  onBankedStardust?: (balance: number) => void;
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
  const v = Math.floor(Number.isFinite(n) ? n : 0);
  if (v < 0) return "0";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 20_000) return (v / 1_000).toFixed(1) + "K";
  return v.toLocaleString();
}

function formatUsdFromGram(gramValue: number | null, tonPrice: number | null, loading: boolean): string {
  if (loading) return "···";
  if (gramValue == null || tonPrice == null || !Number.isFinite(gramValue) || gramValue <= 0) return "—";
  const usd = gramValue * tonPrice;
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
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
  onBankedStardust,
  visible = true,
}: WalletPageProps) {
  const { t } = useT();
  const zmc = useZmcStatus(telegramId);
  const initialMarket = readWalletMarketCacheForDisplay();
  const initialTonUsd = pickWalletTonUsd();
  const [tonPrice, setTonPrice] = useState<number | null>(initialTonUsd);
  const [priceLoading, setPriceLoading] = useState(initialTonUsd == null);
  const [stardustMarketOpen, setStardustMarketOpen] = useState(false);
  const [zoomMarketOpen, setZoomMarketOpen] = useState(false);
  const [zoomPointsOpen, setZoomPointsOpen] = useState(false);
  const [liveStardustBalance, setLiveStardustBalance] = useState(stardustBalance);
  const [zoomPriceGram, setZoomPriceGram] = useState<number | null>(initialMarket.zoomPriceGram);
  const [stardustIndex, setStardustIndex] = useState<number>(displayStardustIndex(initialMarket.stardustIndex));
  const [zoomChangePct, setZoomChangePct] = useState<number | null>(() =>
    initialMarket.zoomChange24hPct,
  );
  const [stardustChangePct, setStardustChangePct] = useState<number | null>(() =>
    initialMarket.stardustChange24hPct,
  );

  const commitTonUsd = useCallback((usd: number) => {
    const locked = lockTonUsd(usd);
    if (locked == null) return;
    setTonPrice(locked);
    setPriceLoading(false);
  }, []);

  const applyMarketCache = useCallback(() => {
    const cached = readWalletMarketCacheForDisplay();
    // CoinGecko TON/USD must not overwrite the GRAM USDT column — that
    // was the Rank↔Wallet flash ($127 then $135). TON/USD is Gram/Binance only.
    if (cached.zoomPriceGram != null) {
      setZoomPriceGram(cached.zoomPriceGram);
    }
    if (cached.zoomChange24hPct != null && Number.isFinite(cached.zoomChange24hPct)) {
      setZoomChangePct(cached.zoomChange24hPct);
    }
    if (Number.isFinite(cached.stardustIndex) && cached.stardustIndex > 0) {
      const next = displayStardustIndex(cached.stardustIndex);
      setStardustIndex((prev) => (next === 1 && prev > 1 ? prev : next));
    }
    if (cached.stardustChange24hPct != null && Number.isFinite(cached.stardustChange24hPct)) {
      setStardustChangePct(cached.stardustChange24hPct);
    }
  }, []);

  const applyGramMarket = useCallback(() => {
    const spot = readGramSpotUsd();
    if (spot != null) commitTonUsd(spot);
  }, [commitTonUsd]);

  useEffect(() => {
    setLiveStardustBalance(stardustBalance);
  }, [stardustBalance]);

  useEffect(() => subscribeWalletMarketCache(applyMarketCache), [applyMarketCache]);
  useEffect(() => subscribeGramMarket(applyGramMarket), [applyGramMarket]);

  useEffect(() => {
    const locked = getLockedTonUsd();
    if (locked != null) {
      setTonPrice(locked);
      setPriceLoading(false);
      return;
    }
    applyGramMarket();
    void fetchGramMarketSnapshot().then(() => applyGramMarket());
  }, [applyGramMarket]);

  useEffect(() => {
    if (!visible) return;
    void prefetchWalletMarket();
    prefetchStardustSheet(telegramId);
    if (getLockedTonUsd() == null) void fetchGramMarketSnapshot();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void prefetchWalletMarket();
    }, LIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [visible, telegramId]);

  useEffect(() => {
    const onRefresh = () => {
      void prefetchWalletMarket();
    };
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => window.removeEventListener("zoom-data-refresh", onRefresh);
  }, []);

  const shownZoomBalance = useStickyWalletBalance(balance, "zoom");
  const shownStardustBalance = useStickyWalletBalance(liveStardustBalance, "stardust");
  const shownRedStarBalance = useStickyWalletBalance(redStarBalance, "redStar");
  const shownNftStarBalance = useStickyWalletBalance(nftStarBalance, "nftStar");
  const zmcShown = zmc.connected || zmc.zmcBalance > 0 ? formatZmcAmount(zmc.zmcBalance) : "—";
  const zmcVipLabel = zmc.vipLevel === "PRO" ? "VIP PRO" : zmc.vipLevel === "BASE" ? "VIP BASE" : "ON-CHAIN";
  const zoomGramValue = zoomPriceGram != null && shownZoomBalance > 0 ? shownZoomBalance * zoomPriceGram : null;
  const stardustIndexSafe = displayStardustIndex(stardustIndex);
  const stardustGramValue = shownStardustBalance > 0
    ? (shownStardustBalance * stardustIndexSafe) / 100
    : null;
  const zoomIconValue = formatZoomChartPrice(zoomPriceGram, true);
  const stardustIconValue = formatStardustChartIndex(stardustIndexSafe);
  const redStarGramValue = shownRedStarBalance > 0 ? shownRedStarBalance * REDSTAR_GRAM_PER_UNIT : null;
  const nftStarGramValue = shownNftStarBalance > 0 ? shownNftStarBalance * NFTSTAR_GRAM_PER_UNIT : null;
  const redStarIconValue = shownRedStarBalance > 0 && redStarGramValue != null
    ? formatGramValueFull(redStarGramValue)
    : formatGramValueFull(REDSTAR_GRAM_PER_UNIT);
  const nftStarIconValue = shownNftStarBalance > 0 && nftStarGramValue != null
    ? formatGramValueFull(nftStarGramValue)
    : formatGramValueFull(NFTSTAR_GRAM_PER_UNIT);

  // Stable vault amount between 5 000 000 and 18 000 000
  const vaultZoom = useMemo(() => {
    const seed = telegramId ?? "default_seed_vault";
    return seededRange(seed, 5_000_000, 18_000_000);
  }, [telegramId]);

  return (
    <div
      className="flex flex-col overflow-y-auto"
      style={{ height: "100%", padding: "12px 14px 28px", gap: 14 }}
    >
      {/* ── CONNECT WALLET (Telegram / TonConnect) ── */}
      <div className="flex justify-center pt-1 pb-1">
        <GramWalletConnectButton telegramId={telegramId} />
      </div>

      {/* ── MAIN BALANCE: ZMC + STON.fi deposit/withdraw chips ── */}
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
          onClick={() => setZoomMarketOpen(true)}
          data-testid="zmc-balance-card"
          aria-label={t("walletPage.openChartAria")}
        >
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
                fontSize: 32,
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
              <ZoomCubeIcon size={32} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {zmcShown}
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
              ZMC
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "rgba(255,255,255,0.65)",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              {zmcVipLabel}
            </div>
          </div>
        </div>

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
          {t("walletPage.zmcHeroHint")}
        </div>
        </button>
      </div>

      {/* ── ACTIVE BALANCES: Season 3 ── */}
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
          {/* ZOOM S3 — season points, not a tradeable market */}
          <BalanceRow
            icon={<ZoomCubeIcon size={BALANCE_ICON_SIZE} />}
            label={t("walletPage.zoomS2")}
            value={formatZoom(shownZoomBalance)}
            color="#ffd740"
            gramValue={zoomGramValue}
            tonPrice={tonPrice}
            priceLoading={priceLoading}
            changePct={zoomChangePct}
            iconSubValue={zoomIconValue}
            onClick={() => setZoomPointsOpen(true)}
            data-testid="wallet-zoom-balance"
          />
          <BalanceRow
            icon={<WalletStarIcon variant="stardust" size={BALANCE_ICON_SIZE} />}
            label={t("resources.stardust")}
            value={formatZoom(shownStardustBalance)}
            color="#ffd740"
            iconColor="#ffd740"
            gramValue={stardustGramValue}
            tonPrice={tonPrice}
            priceLoading={priceLoading}
            changePct={stardustChangePct}
            iconSubValue={stardustIconValue}
            onClick={() => setStardustMarketOpen(true)}
          />
          <BalanceRow
            icon={<WalletStarIcon variant="redstar" size={BALANCE_ICON_SIZE} />}
            label={t("resources.redStar")}
            value={shownRedStarBalance.toLocaleString()}
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
            value={shownNftStarBalance.toLocaleString()}
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

      {/* ── VAULT: Season 3 ── */}
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

      {zoomPointsOpen && (
        <EconomyModal
          onClose={() => setZoomPointsOpen(false)}
          balance={shownZoomBalance}
          initialPrice={zoomPriceGram}
          initialGenesis={0.000001}
        />
      )}

      {zoomMarketOpen && (
        <ZoomMarketModal
          balance={zmc.zmcBalance}
          onClose={() => setZoomMarketOpen(false)}
        />
      )}

      {stardustMarketOpen && (
        <StardustMarketModal
          telegramId={telegramId ?? null}
          walletBalance={shownStardustBalance}
          onClose={() => setStardustMarketOpen(false)}
          onBalanceChange={(next) => {
            commitStickyWalletBalance("stardust", next);
            setLiveStardustBalance(next);
            onBankedStardust?.(next);
          }}
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
  referenceOnly?: boolean;
  onClick?: () => void;
  hint?: string;
  "data-testid"?: string;
}) {
  const { t } = useT();
  const interactive = !!onClick;
  // Under-icon always shows chart unit + % (no GRAM). Right column is USDT.
  const iconPctLabel = changePct != null ? formatChangePct(changePct) : "";
  const pctPositive = (changePct ?? 0) > 0;
  const pctNegative = (changePct ?? 0) < 0;
  const usdLabel = formatUsdFromGram(gramValue ?? null, tonPrice ?? null, !!priceLoading);

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
            width: BALANCE_LEFT_COL,
            minWidth: BALANCE_LEFT_COL,
            maxWidth: BALANCE_LEFT_COL,
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
                width: BALANCE_ICON_BOX,
                marginLeft: 0,
                overflow: "hidden",
              }}
            >
              {iconSubValue && (
                <div
                  title={iconSubValue}
                  style={{
                    fontSize: 6,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.55)",
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "center",
                    letterSpacing: "-0.03em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "100%",
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

      {/* Right — live USDT */}
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
          {usdLabel}
        </div>
      </div>
    </div>
  );
}
