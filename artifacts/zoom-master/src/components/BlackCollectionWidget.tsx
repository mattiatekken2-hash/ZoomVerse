import { useEffect, useState, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { confirmTonPurchase, pollTxnUntilFinal } from "../utils/api";
import { useT } from "../i18n/LanguageContext";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const PRICE_TON = 40;
const VOID_PURPLE = "#7b2fff";
const DEEP_PURPLE = "#4a0e8f";
const ACCENT = "#c084fc";

function BlackPlanetOrb({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#000000",
        boxShadow: [
          `0 0 ${size * 0.3}px ${VOID_PURPLE}cc`,
          `0 0 ${size * 0.6}px ${VOID_PURPLE}66`,
          `0 0 ${size * 1.1}px ${DEEP_PURPLE}33`,
        ].join(", "),
        flexShrink: 0,
      }}
    />
  );
}

interface Props {
  telegramId: string | null;
  unlocked?: boolean;
  ownedBundles?: number;
  onUnlocked?: () => void;
}

function BlackCollectionWidgetBase({ telegramId, unlocked = false, ownedBundles = 0, onUnlocked }: Props) {
  const { t } = useT();
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stock, setStock] = useState<{ sold: number; remaining: number; max: number } | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const fetchStock = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/black-collection/stock`);
      if (r.ok) setStock(await r.json());
    } catch { }
  };

  useEffect(() => {
    fetchStock();
    const onRefresh = () => fetchStock();
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => window.removeEventListener("zoom-data-refresh", onRefresh);
  }, []);

  useEffect(() => { if (open) fetchStock(); }, [open]);

  const soldOut = !!stock && stock.remaining <= 0;

  const handleBuy = async () => {
    if (!telegramId) { setMessage(t("pay.tgMissing")); return; }
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMessage(t("pay.connectFirst"));
      return;
    }
    setBuying(true);
    try {
      const nanotons = BigInt(Math.round(PRICE_TON * 1e9)).toString();
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: WALLET, amount: nanotons }],
      });
      const boc = txResult.boc || "";
      const confirmResult = await confirmTonPurchase(telegramId, "black_collection", connectedAddress, PRICE_TON, boc);
      if (confirmResult.alreadyCredited || confirmResult.ok) {
        setMessage(t("blackColl.unlocked"));
        onUnlocked?.();
        window.dispatchEvent(new Event("zoom-data-refresh"));
        setOpen(false);
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage(t("pay.verifying"));
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage(t("blackColl.unlocked"));
          onUnlocked?.();
          window.dispatchEvent(new Event("zoom-data-refresh"));
          setOpen(false);
        } else if (final?.status === "failed") {
          setMessage(t("pay.notDetected"));
        } else {
          setMessage(t("pay.awaiting"));
        }
      } else {
        setMessage(confirmResult.error || t("pay.creditFailed"));
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMessage(t("pay.cancelled"));
      } else {
        setMessage(t("pay.failed"));
      }
    }
    setBuying(false);
  };

  return (
    <>
      <style>{`
        @keyframes blackCollFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-6px) rotate(0.5deg); }
        }
        @keyframes blackCollGlow {
          0%, 100% { box-shadow: 0 0 14px ${VOID_PURPLE}88, 0 0 28px ${DEEP_PURPLE}33; }
          50%      { box-shadow: 0 0 24px ${VOID_PURPLE}cc, 0 0 48px ${VOID_PURPLE}55, 0 0 72px ${DEEP_PURPLE}22; }
        }
        @keyframes blackCollPulse {
          0%, 100% { box-shadow: 0 0 18px ${VOID_PURPLE}88; }
          50%      { box-shadow: 0 0 32px ${VOID_PURPLE}dd, 0 0 56px ${ACCENT}44; }
        }
        @keyframes bcModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .bc-tile-img { animation: blackCollFloat 3.5s ease-in-out infinite; }
        .bc-tile-frame { animation: blackCollGlow 2.8s ease-in-out infinite; }
        .bc-buy-btn {
          background: linear-gradient(135deg, ${VOID_PURPLE}, ${DEEP_PURPLE});
          color: #e8d5ff;
          font-weight: 900;
          letter-spacing: 0.05em;
          border: 1px solid ${VOID_PURPLE}88;
          border-radius: 12px;
          padding: 14px 20px;
          cursor: pointer;
          animation: blackCollPulse 2.4s ease-in-out infinite;
          transition: transform 0.1s ease, filter 0.15s ease;
        }
        .bc-buy-btn:active { transform: scale(0.96); }
        .bc-buy-btn:disabled { opacity: 0.55; cursor: not-allowed; animation: none; filter: grayscale(0.4); }
        .bc-modal-card { animation: bcModalIn 0.28s cubic-bezier(0.2,0.9,0.3,1.2); }
      `}</style>

      <button
        onClick={() => setOpen(true)}
        aria-label={t("blackColl.openAria")}
        style={{
          position: "fixed",
          left: 12,
          top: 410,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(4,0,12,0.88)",
          border: `1.5px solid ${unlocked ? ACCENT : VOID_PURPLE}66`,
          padding: 6,
          cursor: "pointer",
          zIndex: 40,
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        className="bc-tile-frame"
        data-testid="button-black-collection"
      >
        <div className="bc-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BlackPlanetOrb size={44} />
        </div>
        {unlocked && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: ACCENT,
              border: "2px solid rgba(4,0,12,0.95)",
              boxShadow: `0 0 8px ${ACCENT}`,
              animation: "blackCollPulse 1.6s ease-in-out infinite",
            }}
          />
        )}
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(2,0,8,0.82)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "140px 18px 24px",
            overflowY: "auto",
          }}
        >
          <div
            className="bc-modal-card"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              background: "linear-gradient(180deg, rgba(8,2,18,0.97), rgba(4,0,12,0.99))",
              border: `1px solid ${VOID_PURPLE}55`,
              boxShadow: `0 0 48px ${VOID_PURPLE}44, 0 0 96px ${DEEP_PURPLE}22`,
              borderRadius: 18,
              padding: 22,
              color: "#fff",
            }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              style={{
                position: "absolute", top: 12, right: 12, width: 32, height: 32,
                borderRadius: 8, border: `1px solid ${VOID_PURPLE}44`,
                background: `rgba(123,47,255,0.08)`, color: "#c084fc", fontSize: 16,
                fontWeight: 900, cursor: "pointer", lineHeight: 1,
              }}
            >
              ✕
            </button>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, marginTop: 6 }}>
              <div
                className="bc-tile-frame"
                style={{
                  width: 180, height: 180, borderRadius: 18,
                  background: "rgba(4,0,12,0.8)",
                  border: `2px solid ${VOID_PURPLE}55`,
                  padding: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <div className="bc-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BlackPlanetOrb size={140} />
                </div>
              </div>
            </div>

            <div style={{
              fontFamily: "'Orbitron', 'Inter', sans-serif",
              fontSize: 18, fontWeight: 900, letterSpacing: "0.18em",
              textAlign: "center", marginBottom: 6, color: ACCENT,
              textShadow: `0 0 12px ${VOID_PURPLE}cc, 0 0 24px ${ACCENT}44`,
              textTransform: "uppercase",
            }}>
              {t("blackColl.title")}
            </div>
            <div style={{
              fontSize: 12, color: "rgba(192,132,252,0.7)", textAlign: "center",
              lineHeight: 1.5, marginBottom: 18, padding: "0 6px",
            }}>
              {t("blackColl.desc")}
            </div>

            {unlocked ? (
              <div style={{
                marginBottom: 14, padding: "12px 14px", borderRadius: 12,
                background: `rgba(123,47,255,0.12)`,
                border: `1px solid ${VOID_PURPLE}66`,
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: "0.18em",
                  textTransform: "uppercase", color: ACCENT, marginBottom: 6,
                }}>
                  {t("blackColl.active")}
                </div>
                <div style={{ fontSize: 11, color: "rgba(192,132,252,0.8)", lineHeight: 1.5 }}>
                  {ownedBundles === 1
                    ? t("blackColl.ownInfo", { n: ownedBundles, total: ownedBundles * 4 })
                    : t("blackColl.ownInfoPlural", { n: ownedBundles, total: ownedBundles * 4 })}
                  <br />{t("blackColl.tapAvatar")}
                </div>
              </div>
            ) : (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, marginBottom: 14,
                fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
                color: soldOut ? "#ff5577" : ACCENT, fontWeight: 800,
              }}>
                {stock
                  ? soldOut
                    ? t("common.soldOut")
                    : t("blackColl.limited", { left: stock.remaining, max: stock.max })
                  : t("common.loading")}
              </div>
            )}

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, padding: "14px 16px", borderRadius: 14,
              background: `rgba(123,47,255,0.08)`,
              border: `1px solid ${VOID_PURPLE}44`,
            }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 11, color: "rgba(192,132,252,0.55)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("blackColl.price")}</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>{PRICE_TON} TON</span>
              </div>
              <button
                className="bc-buy-btn"
                onClick={handleBuy}
                disabled={buying || soldOut}
                data-testid="button-buy-black-collection"
              >
                {soldOut
                  ? t("common.soldOut")
                  : buying
                  ? t("market.processing").toUpperCase()
                  : ownedBundles > 0
                  ? t("blackColl.buyAnother", { n: ownedBundles })
                  : t("common.buy")}
              </button>
            </div>

            {message && (
              <div style={{
                marginTop: 12, padding: "8px 12px", borderRadius: 8,
                background: `rgba(123,47,255,0.10)`, border: `1px solid ${VOID_PURPLE}44`,
                fontSize: 12, color: ACCENT, textAlign: "center",
              }}>
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export const BlackCollectionWidget = memo(BlackCollectionWidgetBase);
