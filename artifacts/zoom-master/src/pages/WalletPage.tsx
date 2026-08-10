import { useMemo } from "react";
import { Lock } from "lucide-react";

interface WalletPageProps {
  /** GRAM (TON) earned balance */
  tonBalance: number;
  /** ZOOM Season 2 balance */
  balance: number;
  stardustBalance: number;
  redStarBalance: number;
  nftStarBalance: number;
  /** Used to seed a stable per-user Vault amount */
  telegramId: string | null;
}

/** Fixed GRAM → USDT rate (display only). Update when listing occurs. */
const GRAM_USDT_RATE = 5.5;

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

export function WalletPage({
  tonBalance,
  balance,
  stardustBalance,
  redStarBalance,
  nftStarBalance,
  telegramId,
}: WalletPageProps) {
  const usdtValue = (tonBalance * GRAM_USDT_RATE).toFixed(2);

  // Stable vault amount between 5 000 000 and 18 000 000
  const vaultZoom = useMemo(() => {
    const seed = telegramId ?? "default_seed_vault";
    return seededRange(seed, 5_000_000, 18_000_000);
  }, [telegramId]);

  return (
    <div
      className="flex flex-col overflow-y-auto"
      style={{ height: "100%", padding: "20px 16px 32px", gap: 20 }}
    >
      {/* ── PAGE TITLE ── */}
      <div className="text-center" style={{ marginBottom: 2 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.3)",
          }}
        >
          MY WALLET
        </div>
      </div>

      {/* ── MAIN BALANCE: GRAM ── */}
      <div
        className="rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(0,242,180,0.08) 0%, rgba(0,180,130,0.04) 100%)",
          border: "1px solid rgba(0,242,180,0.18)",
          boxShadow: "0 0 40px rgba(0,242,180,0.06)",
          padding: "24px 20px 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(0,242,180,0.55)",
            marginBottom: 10,
          }}
        >
          GRAM BALANCE
        </div>

        {/* Main GRAM amount */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: "#00f2b4",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 0 32px rgba(0,242,180,0.45)",
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          {tonBalance.toFixed(4)}
        </div>

        {/* Token label */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.18em",
            color: "rgba(0,242,180,0.6)",
            marginBottom: 14,
          }}
        >
          GRAM
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(0,242,180,0.1)",
            margin: "0 0 14px",
          }}
        />

        {/* USDT estimate */}
        <div className="flex items-center justify-center gap-2">
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.25)",
              textTransform: "uppercase",
            }}
          >
            ≈ USDT
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: "rgba(255,255,255,0.55)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${usdtValue}
          </div>
        </div>
        <div
          style={{
            fontSize: 8,
            color: "rgba(255,255,255,0.18)",
            marginTop: 4,
            letterSpacing: "0.08em",
          }}
        >
          Estimated at listing price · subject to change
        </div>
      </div>

      {/* ── ACTIVE BALANCES: Season 2 ── */}
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.25)",
            marginBottom: 10,
          }}
        >
          Active Balances — Season 2
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* ZOOM S2 */}
          <BalanceRow
            icon="⚡"
            label="ZOOM S2"
            value={formatZoom(balance)}
            color="#ffd740"
            glow="rgba(255,215,64,0.4)"
          />
          {/* STARDUST */}
          <BalanceRow
            icon="✦"
            label="STARDUST"
            value={formatZoom(stardustBalance)}
            color="#e0a0ff"
            glow="rgba(200,100,255,0.35)"
          />
          {/* REDSTAR */}
          <BalanceRow
            icon="★"
            label="REDSTAR"
            value={redStarBalance.toLocaleString()}
            color="#ff4455"
            glow="rgba(255,68,85,0.4)"
          />
          {/* NFTSTAR */}
          <BalanceRow
            icon="◈"
            label="NFTSTAR"
            value={nftStarBalance.toLocaleString()}
            color="#c0c0c0"
            glow="rgba(192,192,192,0.3)"
          />
        </div>
      </div>

      {/* ── VAULT: Season 1 Legacy & Airdrop ── */}
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.25)",
            marginBottom: 10,
          }}
        >
          Vault — Legacy &amp; Airdrop
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,165,0,0.04)",
            border: "1px solid rgba(255,165,0,0.18)",
            boxShadow: "0 0 24px rgba(255,165,0,0.04)",
          }}
        >
          {/* Vault row */}
          <div
            className="flex items-center justify-between"
            style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,165,0,0.10)" }}
          >
            {/* Left: lock + label */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: 36,
                  height: 36,
                  background: "rgba(255,165,0,0.10)",
                  border: "1px solid rgba(255,165,0,0.25)",
                  flexShrink: 0,
                }}
              >
                <Lock size={16} style={{ color: "#ffaa00", opacity: 0.85 }} strokeWidth={2.5} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: "#ffaa00",
                    letterSpacing: "0.06em",
                  }}
                >
                  Season 1 Vault
                </div>
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: "rgba(255,170,0,0.45)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginTop: 1,
                  }}
                >
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
                  textShadow: "0 0 12px rgba(255,170,0,0.4)",
                  letterSpacing: "-0.01em",
                }}
              >
                {formatZoom(vaultZoom)}
              </div>
              <div
                style={{
                  fontSize: 8,
                  color: "rgba(255,170,0,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                ZOOM
              </div>
            </div>
          </div>

          {/* Info note */}
          <div style={{ padding: "12px 16px" }}>
            <div
              style={{
                fontSize: 10,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.35)",
                fontWeight: 600,
              }}
            >
              🔒 Season 1 rewards are safely stored in the Vault and will be converted into
              On-Chain Tokens at the time of Listing &amp; Airdrop.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── helpers ─────────── */

function BalanceRow({
  icon,
  label,
  value,
  color,
  glow,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  glow: string;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-2xl"
      style={{
        padding: "12px 14px",
        background: color + "08",
        border: `1px solid ${color}22`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: color + "12",
            border: `1px solid ${color}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            filter: `drop-shadow(0 0 4px ${glow})`,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 900,
          color,
          fontVariantNumeric: "tabular-nums",
          textShadow: `0 0 10px ${glow}`,
        }}
      >
        {value}
      </div>
    </div>
  );
}
