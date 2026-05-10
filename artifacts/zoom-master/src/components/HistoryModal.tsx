import { useEffect, useMemo, useRef, useState } from "react";
import { fetchHistory, type HistoryEntry, type HistoryCurrency } from "../utils/api";
import { useT } from "../i18n/LanguageContext";

interface Props {
  telegramId: string;
  onClose: () => void;
}

const CURRENCY_ICON: Record<HistoryCurrency, string> = {
  zoom: "🪐",
  ton: "💎",
  stardust: "✦",
  stars: "⭐",
  spins: "🎡",
  planet: "🪐",
  none: "•",
};

function formatAmount(delta: number, currency: HistoryCurrency): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  const formatted = currency === "ton"
    ? abs.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : currency === "stardust" || currency === "stars" || currency === "spins" || currency === "planet"
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

  // Focus management + Escape-to-close. We capture whoever was focused
  // before the modal opened (typically the balance pill) and return
  // focus to it on unmount, so keyboard users don't get dumped at the
  // top of the page. Initial focus goes to the close button — the only
  // always-present interactive element — which also makes the modal
  // immediately dismissable from the keyboard.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      try { previouslyFocusedRef.current?.focus(); } catch { /**/ }
    };
  }, [onClose]);

  const list = useMemo(() => entries ?? [], [entries]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      data-testid="history-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        className="w-full sm:max-w-md bg-[#0b0b18] border border-[rgba(196,113,237,0.55)] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="history-modal"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div id="history-modal-title" className="font-black text-base tracking-widest neon-text">
            {t("history.title")}
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-95"
            data-testid="history-modal-close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-2 text-[11px] text-white/50 border-b border-white/5">
          {t("history.subtitle")}
        </div>

        <div className="overflow-y-auto flex-1" data-testid="history-list">
          {loading && (
            <div className="px-4 py-10 text-center text-sm text-white/60">
              {t("history.loading")}
            </div>
          )}
          {!loading && list.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-white/60">
              {t("history.empty")}
            </div>
          )}
          {!loading && list.map((e) => {
            const positive = e.delta > 0;
            const color = positive ? "#26d97f" : e.delta < 0 ? "#ff5d6c" : "#cccccc";
            const kindLabel = t(`history.kind.${e.kind}`);
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5"
                data-testid={`history-entry-${e.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-white truncate">{kindLabel}</div>
                  <div className="text-[10px] text-white/40">{formatTime(e.createdAt)}</div>
                </div>
                <div
                  className="text-[13px] font-black tabular-nums whitespace-nowrap"
                  style={{ color }}
                >
                  {formatAmount(e.delta, e.currency)} {CURRENCY_ICON[e.currency]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
