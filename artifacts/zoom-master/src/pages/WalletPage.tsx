import { useMemo, useEffect, useState, useCallback } from "react";
import { Lock } from "lucide-react";
import { GramWalletPanel, GramWalletIcon, type TonWalletProps } from "../components/TonWalletWidget";
import { StardustMarketModal } from "../components/StardustMarketModal";
import { GramChartModal } from "../components/GramChartModal";

const PRICE_POLL_MS = 15_000;

interface WalletPageProps extends Omit<TonWalletProps, "onOpenWalletTab" | "labVariant"> {
  /** ZOOM Season 2 balance */
  balance: number;
  stardustBalance: number;
  redStarBalance: number;
  nftStarBalance: number;
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
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

/** Fetch live TON/USD price from CoinGecko. Returns null on failure. */
async function fetchTonPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { "the-open-network"?: { usd?: number } };
    return data["the-open-network"]?.usd ?? null;
  } catch {
    return null;
  }
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
}: WalletPageProps) {
  const [tonPrice, setTonPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [stardustMarketOpen, setStardustMarketOpen] = useState(false);
  const [gramChartOpen, setGramChartOpen] = useState(false);
  const [liveStardustBalance, setLiveStardustBalance] = useState(stardustBalance);

  const refreshTonPrice = useCallback(async () => {
    const price = await fetchTonPrice();
    if (price != null) {
      setTonPrice(price);
      setPriceLoading(false);
    }
  }, []);

  useEffect(() => {
    setLiveStardustBalance(stardustBalance);
  }, [stardustBalance]);

  useEffect(() => {
    void refreshTonPrice();
    const id = window.setInterval(() => { void refreshTonPrice(); }, PRICE_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshTonPrice]);

  const usdtValue = tonPrice !== null ? (tonBalance * tonPrice).toFixed(2) : null;
  const priceLabel = tonPrice !== null
    ? `1 GRAM ≈ $${tonPrice.toFixed(2)} · live rate`
    : "Loading live rate…";

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
      {/* ── PAGE TITLE ── */}
      <div className="text-center">
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.28)",
          }}
        >
          MY WALLET
        </div>
      </div>

      {/* ── DEPOSIT / WITHDRAW (first — visible immediately) ── */}
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.28)",
            marginBottom: 8,
          }}
        >
          Deposit &amp; Withdraw
        </div>
        <GramWalletPanel
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
        />
      </div>

      {/* ── MAIN BALANCE: GRAM ── */}
      <button
        type="button"
        className="rounded-2xl text-left w-full transition-all active:scale-[0.99]"
        style={{
          background: "linear-gradient(135deg, rgba(0,242,180,0.09) 0%, rgba(0,180,130,0.05) 100%)",
          border: "1px solid rgba(0,242,180,0.20)",
          boxShadow: "0 0 32px rgba(0,242,180,0.07)",
          padding: "16px 18px",
          cursor: "pointer",
        }}
        onClick={() => setGramChartOpen(true)}
        data-testid="gram-balance-card"
        aria-label="Open GRAM market chart"
      >
        {/* Label row */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(0,242,180,0.50)",
            marginBottom: 8,
          }}
        >
          GRAM BALANCE
        </div>

        {/* Amount row */}
        <div className="flex items-end justify-between" style={{ gap: 8 }}>
          <div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 900,
                color: "#00f2b4",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                textShadow: "0 0 24px rgba(0,242,180,0.50)",
                letterSpacing: "-0.02em",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <GramWalletIcon size={34} />
              {tonBalance.toFixed(4)}
            </div>
          </div>

          {/* USDT estimate */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
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
              ≈ USDT
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: priceLoading ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
                minWidth: 70,
                textAlign: "right",
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
            background: "rgba(0,242,180,0.08)",
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
          {priceLabel} · tap for chart
        </div>
      </button>

      {gramChartOpen && (
        <GramChartModal
          gramBalance={tonBalance}
          depositBalance={depositBalance}
          onClose={() => setGramChartOpen(false)}
          onPriceUpdate={(p) => {
            setTonPrice(p);
            setPriceLoading(false);
          }}
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
          Active Balances — Season 2
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {/* ZOOM S2 — planet emoji, matches top bar */}
          <BalanceRow
            icon="🪐"
            label="ZOOM S2"
            value={formatZoom(balance)}
            color="#ffd740"
            glow="rgba(255,215,64,0.4)"
          />
          {/* STARDUST — star (★), yellow like resource widget */}
          <BalanceRow
            icon="★"
            label="STARDUST"
            value={formatZoom(liveStardustBalance)}
            color="#ffd740"
            glow="rgba(255,215,64,0.35)"
            iconColor="#ffd740"
            onClick={() => setStardustMarketOpen(true)}
            hint="Tap for market & stake"
          />
          {/* REDSTAR — star (★), red */}
          <BalanceRow
            icon="★"
            label="REDSTAR"
            value={redStarBalance.toLocaleString()}
            color="#ff4444"
            glow="rgba(255,68,68,0.4)"
            iconColor="#ff4444"
          />
          {/* NFTSTAR — star (★), silver */}
          <BalanceRow
            icon="★"
            label="NFTSTAR"
            value={nftStarBalance.toLocaleString()}
            color="#a0a0a8"
            glow="rgba(192,192,192,0.3)"
            iconColor="#a0a0a8"
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
          Vault — Legacy &amp; Airdrop
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,165,0,0.04)",
            border: "1px solid rgba(255,165,0,0.18)",
          }}
        >
          {/* Vault row */}
          <div
            className="flex items-center justify-between"
            style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,165,0,0.09)" }}
          >
            {/* Left: lock icon + label */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: 34,
                  height: 34,
                  background: "rgba(255,165,0,0.10)",
                  border: "1px solid rgba(255,165,0,0.25)",
                  flexShrink: 0,
                }}
              >
                <Lock size={15} style={{ color: "#ffaa00", opacity: 0.85 }} strokeWidth={2.5} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#ffaa00", letterSpacing: "0.05em" }}>
                  Season 1 Vault
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,170,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>
                  ZOOM S1 · Locked
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
                ZOOM
              </div>
            </div>
          </div>

          {/* Info note */}
          <div style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 10, lineHeight: 1.55, color: "rgba(255,255,255,0.32)", fontWeight: 600 }}>
              🔒 Season 1 rewards are safely stored in the Vault and will be converted into
              On-Chain Tokens at the time of Listing &amp; Airdrop.
            </div>
          </div>
        </div>
      </div>

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
  color,
  glow,
  iconColor,
  onClick,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  glow: string;
  iconColor?: string;
  onClick?: () => void;
  hint?: string;
}) {
  const ic = iconColor ?? color;
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); } : undefined}
      className="flex items-center justify-between rounded-2xl"
      style={{
        padding: "11px 14px",
        background: color + "08",
        border: `1px solid ${color}22`,
        cursor: interactive ? "pointer" : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: ic + "12",
            border: `1px solid ${ic}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: ic,
            filter: `drop-shadow(0 0 5px ${glow})`,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "rgba(255,255,255,0.52)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
          {hint && (
            <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,215,64,0.45)", marginTop: 2 }}>
              {hint}
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 900,
          color,
          fontVariantNumeric: "tabular-nums",
          textShadow: `0 0 8px ${glow}`,
        }}
      >
        {value}
      </div>
    </div>
  );
}
