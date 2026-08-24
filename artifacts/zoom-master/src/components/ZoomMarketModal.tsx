/**
 * ZoomMarketModal — Wallet → ZOOM S2 row.
 * Live $ZMC chart (DexScreener) + STON.fi buy/sell. Layout matches the
 * existing market sheet (header, wallet row, how-it-works note).
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { ZoomCubeIcon } from "./ZoomCubeIcon";
import { useT } from "../i18n/LanguageContext";
import {
  ZMC_DEXSCREENER_EMBED,
  ZMC_JETTON_ADDRESS,
  ZMC_STONFI_BUY,
  ZMC_STONFI_SELL,
  ZMC_TICKER,
  copyText,
  openExternalUrl,
} from "../utils/zmcToken";

const CYAN = "#9EC5E8";
const GOLD = "#ffd740";

interface Props {
  balance: number;
  onClose: () => void;
}

function formatZoom(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function ZoomMarketModal({ balance, onClose }: Props) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  const handleCopyCa = async () => {
    const ok = await copyText(ZMC_JETTON_ADDRESS);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4,6,12,0.88)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="zoom-market-modal"
    >
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(14,18,32,0.98), rgba(8,10,22,0.99))",
          border: "1px solid rgba(158,197,232,0.28)",
          boxShadow: "0 -8px 40px rgba(158,197,232,0.10)",
          maxHeight: "88vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(158,197,232,0.55)" }}>
              {t("zoomMarket.title")}
            </div>
            <div
              className="flex items-center gap-2"
              style={{ fontSize: 20, fontWeight: 900, color: GOLD, marginTop: 2 }}
            >
              <ZoomCubeIcon size={22} />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>${ZMC_TICKER}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeAria")}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Compact stats + copy CA */}
        <div className="px-4 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold flex-shrink-0">
          <span style={{ color: GOLD }}>{t("zoomMarket.wallet", { n: formatZoom(balance) })}</span>
          <button
            type="button"
            onClick={() => void handleCopyCa()}
            data-testid="zmc-copy-ca"
            aria-label={t("zoomMarket.copyCa")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${copied ? "rgba(105,240,174,0.45)" : "rgba(158,197,232,0.35)"}`,
              background: copied ? "rgba(105,240,174,0.12)" : "rgba(158,197,232,0.10)",
              color: copied ? "#69f0ae" : CYAN,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {copied ? t("zoomMarket.copyCaDone") : t("zoomMarket.copyCa")}
          </button>
        </div>

        {/* Live DexScreener chart — overlay our cube on their missing token image. */}
        <div className="px-3 flex-shrink-0">
          <div className="relative overflow-hidden" style={{ borderRadius: 12 }}>
            <iframe
              src={ZMC_DEXSCREENER_EMBED}
              width="100%"
              height="400px"
              title={t("zoomMarket.chartTitle")}
              style={{ border: 0, borderRadius: 12, display: "block" }}
              data-testid="zmc-dexscreener"
            />
            <div
              aria-hidden
              data-testid="zmc-dex-logo"
              style={{
                position: "absolute",
                top: 11,
                left: 12,
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#11141c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 2,
              }}
            >
              <ZoomCubeIcon size={26} />
            </div>
          </div>
        </div>

        {/* Compra / Vendi $ZMC → STON.fi */}
        <div className="px-4 pt-3 pb-2 flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => openExternalUrl(ZMC_STONFI_BUY)}
            data-testid="zmc-buy"
            className="flex-1 active:scale-[0.98] transition-transform"
            style={{
              padding: "11px 12px",
              borderRadius: 12,
              border: "1px solid rgba(105,240,174,0.35)",
              background: "linear-gradient(180deg, rgba(105,240,174,0.18), rgba(105,240,174,0.06))",
              color: "#69f0ae",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          >
            {t("zoomMarket.buyZmc")}
          </button>
          <button
            type="button"
            onClick={() => openExternalUrl(ZMC_STONFI_SELL)}
            data-testid="zmc-sell"
            className="flex-1 active:scale-[0.98] transition-transform"
            style={{
              padding: "11px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,138,128,0.35)",
              background: "linear-gradient(180deg, rgba(255,138,128,0.16), rgba(255,138,128,0.05))",
              color: "#ff8a80",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          >
            {t("zoomMarket.sellZmc")}
          </button>
        </div>

        <div className="px-4 pb-4 flex-1 overflow-y-auto min-h-0">
          <div
            className="rounded-xl p-3 text-[11px] leading-relaxed"
            style={{
              background: "rgba(158,197,232,0.06)",
              border: "1px solid rgba(158,197,232,0.15)",
              color: "rgba(220,235,255,0.7)",
            }}
          >
            <span style={{ color: CYAN, fontWeight: 800 }}>{t("zoomMarket.howTitle")}</span>{" "}
            {t("zoomMarket.howBody")}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
