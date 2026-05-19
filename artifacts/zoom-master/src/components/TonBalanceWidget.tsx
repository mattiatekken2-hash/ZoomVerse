/**
 * TonBalanceWidget — small pixel-wallet icon button in the LAB.
 * Tap to open a modal showing the unified TON balance breakdown:
 *   total = ton_balance (spendable) + sum of all staking accruedTon
 */
import { memo, useEffect, useState, useRef, useCallback } from "react";
import { fetchStakingStatus } from "../utils/api";
import type { StakingStatusResponse } from "../utils/api";

const POLL_MS = 60_000;

interface Props {
  tonBalance: number;
  telegramId: string | null;
}

function formatTon(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "0.000";
  if (v < 0.001) return v.toFixed(6);
  if (v < 0.01)  return v.toFixed(5);
  if (v < 0.1)   return v.toFixed(4);
  if (v < 10)    return v.toFixed(3);
  if (v < 1000)  return v.toFixed(2);
  return v.toFixed(1);
}

interface Breakdown {
  spendable: number;
  v1: number;
  sun: number;
  basic: number;
  rare: number;
  epic: number;
  mythic: number;
  gold: number;
}

function parseBreakdown(s: StakingStatusResponse): Breakdown {
  return {
    spendable: 0,
    v1:     s.v1?.accruedTon     ?? 0,
    sun:    s.sun?.accruedTon    ?? 0,
    basic:  s.basic?.accruedTon  ?? 0,
    rare:   s.rare?.accruedTon   ?? 0,
    epic:   s.epic?.accruedTon   ?? 0,
    mythic: s.mythic?.accruedTon ?? 0,
    gold:   s.gold?.accruedTon   ?? 0,
  };
}

function totalAccrued(b: Breakdown): number {
  return b.v1 + b.sun + b.basic + b.rare + b.epic + b.mythic + b.gold;
}

/* Pixel-art wallet rendered in pure SVG — 16×16 grid, no external assets */
function PixelWallet({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 16 16"
      style={{ imageRendering: "pixelated", display: "block" }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* body */}
      <rect x="1" y="4" width="14" height="10" rx="1" fill="#00c87a" />
      {/* flap */}
      <rect x="1" y="4" width="14" height="3" fill="#00a562" />
      {/* clasp pocket */}
      <rect x="9" y="6" width="5" height="5" rx="1" fill="#003d28" />
      {/* coin */}
      <rect x="10" y="7" width="3" height="3" rx="1" fill="#00ff8c" />
      {/* top edge / strap hint */}
      <rect x="3" y="3" width="10" height="2" rx="1" fill="#00a562" />
    </svg>
  );
}

/* Modal */
function TonModal({
  onClose,
  tonBalance,
  breakdown,
}: {
  onClose: () => void;
  tonBalance: number;
  breakdown: Breakdown;
}) {
  const spendable = Math.max(0, tonBalance);
  const accrued   = Math.max(0, totalAccrued(breakdown));
  const total     = spendable + accrued;

  const rows: { label: string; value: number; dim?: boolean }[] = [
    { label: "Spendable balance",   value: spendable },
    { label: "V1 staking (accrued)",     value: breakdown.v1,     dim: true },
    { label: "SUN staking (accrued)",    value: breakdown.sun,    dim: true },
    { label: "BASIC staking (accrued)",  value: breakdown.basic,  dim: true },
    { label: "RARE staking (accrued)",   value: breakdown.rare,   dim: true },
    { label: "EPIC staking (accrued)",   value: breakdown.epic,   dim: true },
    { label: "MYTHIC staking (accrued)", value: breakdown.mythic, dim: true },
    { label: "GOLD staking (accrued)",   value: breakdown.gold,   dim: true },
  ].filter(r => r.value > 0 || !r.dim);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(2,8,18,0.82)", backdropFilter: "blur(7px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(400px,100%)", borderRadius: 20, padding: 20,
          background: "linear-gradient(135deg, rgba(0,30,20,0.97), rgba(0,10,8,0.99))",
          border: "1px solid rgba(0,255,140,0.35)",
          boxShadow: "0 0 40px rgba(0,255,140,0.18)",
          position: "relative",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PixelWallet size={24} />
            <div>
              <div style={{ color: "rgba(0,255,140,0.75)", fontSize: 10, fontWeight: 900, letterSpacing: 1.4 }}>TON WALLET</div>
              <div style={{ color: "#fff", fontSize: 17, fontWeight: 900, letterSpacing: 0.8, textShadow: "0 0 10px rgba(0,255,140,0.5)" }}>
                {formatTon(total)} TON
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 9, fontSize: 14,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(220,240,255,0.8)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* total bar */}
        <div
          style={{
            borderRadius: 13, padding: "11px 14px", marginBottom: 12,
            background: "linear-gradient(135deg, rgba(0,255,140,0.1), rgba(0,200,120,0.06))",
            border: "1px solid rgba(0,255,140,0.28)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}
        >
          <span style={{ color: "rgba(0,255,140,0.8)", fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>TOTAL BALANCE</span>
          <span style={{ color: "#00ff8c", fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", textShadow: "0 0 10px rgba(0,255,140,0.5)" }}>
            {formatTon(total)} TON
          </span>
        </div>

        {/* breakdown rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(r => (
            <div
              key={r.label}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "7px 12px", borderRadius: 10,
                background: r.dim ? "rgba(255,255,255,0.03)" : "rgba(0,255,140,0.06)",
                border: `1px solid ${r.dim ? "rgba(255,255,255,0.08)" : "rgba(0,255,140,0.18)"}`,
              }}
            >
              <span style={{ color: r.dim ? "rgba(200,230,215,0.55)" : "rgba(200,230,215,0.85)", fontSize: 11, fontWeight: 700 }}>
                {r.label}
              </span>
              <span
                style={{
                  color: r.dim ? "rgba(0,255,140,0.65)" : "#00ff8c",
                  fontSize: 12, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatTon(r.value)} TON
              </span>
            </div>
          ))}
        </div>

        {accrued > 0 && (
          <div
            style={{
              marginTop: 10, padding: "8px 12px", borderRadius: 10,
              background: "rgba(0,255,140,0.05)", border: "1px solid rgba(0,255,140,0.15)",
            }}
          >
            <span style={{ color: "rgba(0,255,140,0.55)", fontSize: 10, fontWeight: 700, lineHeight: 1.4, display: "block" }}>
              Accrued amounts are pending staking yields. Claim them on the Staking screen to move them to your spendable balance.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TonBalanceWidgetBase({ tonBalance, telegramId }: Props) {
  const [breakdown, setBreakdown] = useState<Breakdown>({
    spendable: 0, v1: 0, sun: 0, basic: 0, rare: 0, epic: 0, mythic: 0, gold: 0,
  });
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!telegramId) return;
    const status = await fetchStakingStatus(telegramId);
    if (status) setBreakdown(parseBreakdown(status));
  }, [telegramId]);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => { void load(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const accrued = totalAccrued(breakdown);
  const total   = Math.max(0, tonBalance) + Math.max(0, accrued);

  return (
    <>
      <button
        type="button"
        aria-label="TON Wallet"
        onClick={() => setOpen(true)}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 30,
          borderRadius: 10,
          padding: "5px 8px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          background: "linear-gradient(135deg, rgba(0,50,38,0.82), rgba(0,18,12,0.94))",
          border: "1px solid rgba(0,255,140,0.32)",
          boxShadow: "0 0 10px rgba(0,255,140,0.15)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        <PixelWallet size={20} />
        <span
          style={{
            fontSize: 9,
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
            color: "#00ff8c",
            textShadow: "0 0 6px rgba(0,255,140,0.5)",
            letterSpacing: 0.3,
            whiteSpace: "nowrap",
          }}
        >
          {formatTon(total)}
        </span>
        <span style={{ fontSize: 7, fontWeight: 700, color: "rgba(0,255,140,0.55)", letterSpacing: 0.3 }}>
          TON
        </span>
      </button>

      {open && (
        <TonModal
          onClose={() => setOpen(false)}
          tonBalance={tonBalance}
          breakdown={breakdown}
        />
      )}
    </>
  );
}

export const TonBalanceWidget = memo(TonBalanceWidgetBase);
