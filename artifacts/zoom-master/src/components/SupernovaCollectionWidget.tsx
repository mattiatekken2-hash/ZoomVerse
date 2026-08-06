import { useEffect, useState, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { confirmTonPurchase, pollTxnUntilFinal } from "../utils/api";
import { useT } from "../i18n/LanguageContext";
import { SupernovaStarOrb } from "./SupernovaStarOrb";

const WALLET = "UQB7vku7fJS196hYJa86PjQW9rq0Q7hzyqH97Ki5hJHesIdr";
const PRICE_TON = 12;
const SUPERNOVA_YELLOW = "#ffd700";
const DEEP_AMBER = "#b8860b";
const ACCENT = "#fde047";

interface Props {
  telegramId: string | null;
  unlocked?: boolean;
  ownedBundles?: number;
  onUnlocked?: () => void;
}

function SupernovaCollectionWidgetBase({ telegramId, unlocked = false, ownedBundles = 0, onUnlocked }: Props) {
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
      const r = await fetch(`${import.meta.env.BASE_URL}api/supernova-collection/stock`);
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
      const confirmResult = await confirmTonPurchase(telegramId, "supernova_collection", connectedAddress, PRICE_TON, boc);
      if (confirmResult.alreadyCredited || confirmResult.ok) {
        setMessage(t("supernovaColl.unlocked"));
        onUnlocked?.();
        window.dispatchEvent(new Event("zoom-data-refresh"));
        setOpen(false);
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage(t("pay.verifying"));
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage(t("supernovaColl.unlocked"));
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
        @keyframes superCollFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-6px) rotate(0.5deg); }
        }
        @keyframes superCollGlow {
          0%, 100% { box-shadow: 0 0 14px ${SUPERNOVA_YELLOW}88, 0 0 28px ${DEEP_AMBER}33; }
          50%      { box-shadow: 0 0 24px ${SUPERNOVA_YELLOW}cc, 0 0 48px ${SUPERNOVA_YELLOW}55, 0 0 72px ${DEEP_AMBER}22; }
        }
        @keyframes superCollPulse {
          0%, 100% { box-shadow: 0 0 18px ${SUPERNOVA_YELLOW}88; }
          50%      { box-shadow: 0 0 32px ${SUPERNOVA_YELLOW}dd, 0 0 56px ${ACCENT}44; }
        }
        @keyframes scModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .sc-tile-img { animation: superCollFloat 3.5s ease-in-out infinite; }
        .sc-tile-frame { animation: superCollGlow 2.8s ease-in-out infinite; }
        .sc-buy-btn {
          background: linear-gradient(135deg, ${SUPERNOVA_YELLOW}, ${DEEP_AMBER});
          color: #1a1100;
          font-weight: 900;
          letter-spacing: 0.05em;
          border: 1px solid ${SUPERNOVA_YELLOW}aa;
          border-radius: 12px;
          padding: 14px 20px;
          cursor: pointer;
          animation: superCollPulse 2.4s ease-in-out infinite;
          transition: transform 0.1s ease, filter 0.15s ease;
        }
        .sc-buy-btn:active { transform: scale(0.96); }
        .sc-buy-btn:disabled { opacity: 0.55; cursor: not-allowed; animation: none; filter: grayscale(0.4); }
        .sc-modal-card { animation: scModalIn 0.28s cubic-bezier(0.2,0.9,0.3,1.2); }
      `}</style>

      <button
        onClick={() => setOpen(true)}
        aria-label={t("supernovaColl.openAria")}
        style={{
          position: "fixed",
          right: 12,
          top: 478,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(14,10,0,0.88)",
          border: `1.5px solid ${unlocked ? ACCENT : SUPERNOVA_YELLOW}66`,
          padding: 4,
          cursor: "pointer",
          zIndex: 40,
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        className="sc-tile-frame"
        data-testid="button-supernova-collection"
      >
        <div className="sc-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SupernovaStarOrb size={48} spin={false} />
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
              border: "2px solid rgba(14,10,0,0.95)",
              boxShadow: `0 0 8px ${ACCENT}`,
              animation: "superCollPulse 1.6s ease-in-out infinite",
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
            background: "rgba(8,6,0,0.82)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "140px 18px 24px",
            overflowY: "auto",
          }}
        >
          <div
            className="sc-modal-card"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              background: "linear-gradient(180deg, rgba(28,20,2,0.97), rgba(14,10,0,0.99))",
              border: `1px solid ${SUPERNOVA_YELLOW}55`,
              boxShadow: `0 0 48px ${SUPERNOVA_YELLOW}44, 0 0 96px ${DEEP_AMBER}22`,
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
                borderRadius: 8, border: `1px solid ${SUPERNOVA_YELLOW}44`,
                background: `rgba(255,215,0,0.10)`, color: ACCENT, fontSize: 16,
                fontWeight: 900, cursor: "pointer", lineHeight: 1,
              }}
            >
              ✕
            </button>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, marginTop: 6 }}>
              <div
                className="sc-tile-frame"
                style={{
                  width: 180, height: 180, borderRadius: 18,
                  background: "rgba(14,10,0,0.8)",
                  border: `2px solid ${SUPERNOVA_YELLOW}55`,
                  padding: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <div className="sc-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <SupernovaStarOrb size={140} />
                </div>
              </div>
            </div>

            <div style={{
              fontFamily: "'Orbitron', 'Inter', sans-serif",
              fontSize: 18, fontWeight: 900, letterSpacing: "0.18em",
              textAlign: "center", marginBottom: 6, color: ACCENT,
              textShadow: `0 0 12px ${SUPERNOVA_YELLOW}cc, 0 0 24px ${ACCENT}44`,
              textTransform: "uppercase",
            }}>
              {t("supernovaColl.title")}
            </div>
            <div style={{
              fontSize: 12, color: "rgba(253,224,71,0.75)", textAlign: "center",
              lineHeight: 1.5, marginBottom: 18, padding: "0 6px",
            }}>
              {t("supernovaColl.desc")}
            </div>

            {unlocked ? (
              <div style={{
                marginBottom: 14, padding: "12px 14px", borderRadius: 12,
                background: `rgba(255,215,0,0.12)`,
                border: `1px solid ${SUPERNOVA_YELLOW}66`,
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: "0.18em",
                  textTransform: "uppercase", color: ACCENT, marginBottom: 6,
                }}>
                  {t("supernovaColl.active")}
                </div>
                <div style={{ fontSize: 11, color: "rgba(253,224,71,0.8)", lineHeight: 1.5 }}>
                  {ownedBundles === 1
                    ? t("supernovaColl.ownInfo", { n: ownedBundles, total: ownedBundles * 4 })
                    : t("supernovaColl.ownInfoPlural", { n: ownedBundles, total: ownedBundles * 4 })}
                  <br />{t("supernovaColl.tapAvatar")}
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
                    : t("supernovaColl.limited", { left: stock.remaining, max: stock.max })
                  : t("common.loading")}
              </div>
            )}

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, padding: "14px 16px", borderRadius: 14,
              background: `rgba(255,215,0,0.08)`,
              border: `1px solid ${SUPERNOVA_YELLOW}44`,
            }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 11, color: "rgba(253,224,71,0.6)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("supernovaColl.price")}</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>{PRICE_TON} GRAM</span>
              </div>
              <button
                className="sc-buy-btn"
                onClick={handleBuy}
                disabled={buying || soldOut}
                data-testid="button-buy-supernova-collection"
              >
                {soldOut
                  ? t("common.soldOut")
                  : buying
                  ? t("market.processing").toUpperCase()
                  : ownedBundles > 0
                  ? t("supernovaColl.buyAnother", { n: ownedBundles })
                  : t("common.buy")}
              </button>
            </div>

            {message && (
              <div style={{
                marginTop: 12, padding: "8px 12px", borderRadius: 8,
                background: `rgba(255,215,0,0.10)`, border: `1px solid ${SUPERNOVA_YELLOW}44`,
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

export const SupernovaCollectionWidget = memo(SupernovaCollectionWidgetBase);
