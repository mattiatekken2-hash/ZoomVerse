import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchHistory, type HistoryEntry, type HistoryCurrency } from "../utils/api";
import { useT } from "../i18n/LanguageContext";
import { GramDiamondIcon } from "./GramDiamondIcon";
import { ZoomCubeIcon } from "./ZoomCubeIcon";

interface Props {
  telegramId: string;
  onClose: () => void;
}

const STARDUST_KINDS = new Set([
  "stardust_collect",
  "stardust_convert",
  "stardust_convert_out",
  "stardust_purchase",
  "daily_claim",
]);

const GRAM_KINDS = new Set([
  "gram_convert_in",
  "ton_purchase",
  "withdraw_request",
  "plant_claim",
  "market_buy",
  "market_sale",
]);

const REDSTAR_KINDS = new Set([
  "redstar_claim",
  "weekly_redstar",
  "weekly_redstar_claim",
  "pvp_redstar_prize",
]);

function isRedstarEntry(entry: HistoryEntry): boolean {
  if (REDSTAR_KINDS.has(entry.kind) || entry.currency === "redstar") return true;
  const meta = entry.meta as { asset?: string } | null | undefined;
  return meta?.asset === "redstar";
}

type CurrencyVisual = {
  glyph: string;
  tint: string;
  useGramIcon?: boolean;
  useZoomIcon?: boolean;
};

function currencyVisual(entry: HistoryEntry): CurrencyVisual {
  if (GRAM_KINDS.has(entry.kind) || entry.currency === "ton") {
    return { glyph: "", tint: "#00f2b4", useGramIcon: true };
  }
  if (isRedstarEntry(entry)) {
    return { glyph: "★", tint: "#ff2244" };
  }
  if (STARDUST_KINDS.has(entry.kind) || entry.currency === "stardust") {
    return { glyph: "★", tint: "#ffd740" };
  }
  switch (entry.currency) {
    case "zoom":
      return { glyph: "", tint: "#ffd740", useZoomIcon: true };
    case "stars":
      return { glyph: "⭐", tint: "#ffd700" };
    case "spins":
      return { glyph: "🎡", tint: "#9EC5E8" };
    case "planet":
      return { glyph: "", tint: "#ffd740", useZoomIcon: true };
    default:
      return { glyph: "•", tint: "rgba(255,255,255,0.45)" };
  }
}

function formatAmount(delta: number, currency: HistoryCurrency): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  const formatted = currency === "ton"
    ? abs.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : currency === "stardust" || currency === "redstar" || currency === "stars" || currency === "spins" || currency === "planet"
      ? Math.round(abs).toLocaleString()
      : abs.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${sign}${formatted}`;
}

function formatTime(ms: number): string {
  try {
    const d = new Date(ms);
    const sameDay = new Date().toDateString() === d.toDateString();
    if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleString(undefined, {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function HistoryModal({ telegramId, onClose }: Props) {
  const { t } = useT();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHistory(telegramId).then((rows) => {
      if (!alive) return;
      setEntries(rows);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [telegramId]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      try { previouslyFocusedRef.current?.focus(); } catch { /**/ }
    };
  }, [onClose]);

  const list = useMemo(() => entries ?? [], [entries]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgba(4,6,14,0.82)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
      data-testid="history-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        className="w-full max-w-[320px] overflow-hidden flex flex-col rounded-2xl"
        style={{
          maxHeight: "72vh",
          background: "linear-gradient(165deg, rgba(14,18,34,0.98), rgba(8,10,20,0.99))",
          border: "1px solid rgba(158,197,232,0.38)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.55), 0 0 24px rgba(158,197,232,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="history-modal"
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <div id="history-modal-title" className="font-black text-sm tracking-[0.22em]" style={{ color: "#9EC5E8" }}>
              {t("history.title")}
            </div>
            <div className="text-[10px] text-white/40 mt-0.5">{t("history.subtitle")}</div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label={t("common.closeAria")}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10 active:scale-95"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}
            data-testid="history-modal-close"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1" data-testid="history-list">
          {loading && (
            <div className="px-4 py-8 text-center text-xs text-white/50">
              {t("history.loading")}
            </div>
          )}
          {!loading && list.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-white/50">
              {t("history.empty")}
            </div>
          )}
          {!loading && list.map((e) => {
            const positive = e.delta > 0;
            const color = positive ? "#26d97f" : e.delta < 0 ? "#ff5d6c" : "#cccccc";
            const kindKey = `history.kind.${e.kind}` as const;
            const kindLabel = t(kindKey) === kindKey ? e.kind.replace(/_/g, " ") : t(kindKey);
            const visual = currencyVisual(e);
            return (
              <div
                key={e.id}
                className="flex items-center gap-2.5 px-3.5 py-2 border-b border-white/5"
                data-testid={`history-entry-${e.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold text-white truncate">{kindLabel}</div>
                  <div className="text-[9px] text-white/35 mt-0.5">{formatTime(e.createdAt)}</div>
                </div>
                <div
                  className="text-[12px] font-black tabular-nums whitespace-nowrap flex items-center gap-1"
                  style={{ color }}
                >
                  <span>{formatAmount(e.delta, e.currency)}</span>
                  {visual.useGramIcon ? (
                    <GramDiamondIcon size={13} />
                  ) : visual.useZoomIcon ? (
                    <ZoomCubeIcon size={13} />
                  ) : (
                    <span style={{ color: visual.tint }}>{visual.glyph}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
