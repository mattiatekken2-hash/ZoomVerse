/**
 * TonBalanceWidget — small pill in the top-right of the LAB page showing
 * the user's unified TON balance:
 *
 *   total = ton_balance (settled/spendable)
 *         + sum of all staking accruedTon (pending, not yet claimed)
 *
 * This gives the user a single, live view of every TON they own across all
 * sources: collections, staking yields, deposits, plant rewards, etc.
 * The component fetches /api/staking/status periodically so the accrued
 * portion stays fresh without the user navigating to the Staking screen.
 */
import { memo, useEffect, useState, useRef } from "react";
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

function sumAccrued(s: StakingStatusResponse): number {
  return (
    (s.v1?.accruedTon     ?? 0) +
    (s.sun?.accruedTon    ?? 0) +
    (s.basic?.accruedTon  ?? 0) +
    (s.rare?.accruedTon   ?? 0) +
    (s.epic?.accruedTon   ?? 0) +
    (s.mythic?.accruedTon ?? 0) +
    (s.gold?.accruedTon   ?? 0)
  );
}

function TonBalanceWidgetBase({ tonBalance, telegramId }: Props) {
  const [accrued, setAccrued] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!telegramId) return;

    let cancelled = false;
    const load = async () => {
      const status = await fetchStakingStatus(telegramId);
      if (!cancelled && status) setAccrued(sumAccrued(status));
    };

    void load();
    timerRef.current = setInterval(() => { void load(); }, POLL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [telegramId]);

  const total = Math.max(0, tonBalance) + Math.max(0, accrued);

  return (
    <div
      title="Saldo TON totale (saldo spendibile + rendite in maturazione)"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 30,
        borderRadius: 10,
        padding: "5px 9px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 1,
        background: "linear-gradient(135deg, rgba(0,50,40,0.78) 0%, rgba(0,20,16,0.92) 100%)",
        border: "1px solid rgba(0,255,140,0.35)",
        boxShadow: "0 0 10px rgba(0,255,140,0.18)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        lineHeight: 1.1,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontSize: 8,
          fontWeight: 900,
          letterSpacing: 0.8,
          color: "rgba(0,255,140,0.75)",
          textTransform: "uppercase",
        }}
      >
        TON Balance
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          color: "#00ff8c",
          textShadow: "0 0 8px rgba(0,255,140,0.55)",
          letterSpacing: 0.4,
        }}
      >
        {formatTon(total)} <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.8 }}>TON</span>
      </span>
      {accrued > 0 && (
        <span
          style={{
            fontSize: 8,
            color: "rgba(0,255,140,0.5)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{formatTon(accrued)} in maturazione
        </span>
      )}
    </div>
  );
}

export const TonBalanceWidget = memo(TonBalanceWidgetBase);
