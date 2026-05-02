import { useEffect, useState, memo, useCallback } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { confirmTonPurchase, pollTxnUntilFinal, fetchLottoState, type LottoStateResponse } from "../utils/api";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const NEON_GOLD = "#ffd84d";
const NEON_RED = "#ff5577";
const NEON_PURPLE = "#c471ed";

interface Bundle {
  id: "lotto_ticket_1" | "lotto_ticket_15" | "lotto_ticket_40";
  tickets: number;
  tonPrice: number;
  label: string;
  badge?: string;
}

const BUNDLES: Bundle[] = [
  { id: "lotto_ticket_1",  tickets: 1,  tonPrice: 0.1, label: "1 biglietto" },
  { id: "lotto_ticket_15", tickets: 15, tonPrice: 1.0, label: "15 biglietti", badge: "−33%" },
  { id: "lotto_ticket_40", tickets: 40, tonPrice: 2.5, label: "40 biglietti", badge: "−38%" },
];

interface Props {
  telegramId: string | null;
}

/**
 * Pixel-art ticket icon. Pure SVG, nessun asset esterno. La griglia è
 * disegnata con rect a "pixel" 6x6 dentro un viewBox 48x48 per ottenere
 * un look retro-game coerente con l'estetica del resto dell'app.
 */
function PixelTicket({ size = 48 }: { size?: number }) {
  // Mappa dei pixel: '.' = trasparente, 'B' = bordo scuro, 'Y' = giallo
  // ticket, 'O' = bordo dorato luminoso, 'D' = punteggiato perforazione,
  // 'R' = rosso stella, 'W' = bianco accent.
  const grid = [
    "................",
    "....BBBBBBBB....",
    "...BOYYYYYYOB...",
    "..BOYYRWRYYYOB..",
    ".BOYYRRWRRYYYOB.",
    ".BOYWRWRWRWYYOB.",
    ".BOYYRRWRRYYYOB.",
    ".BOYYYRWRYYYYOB.",
    ".BOYDDDDDDDDYOB.",
    ".BOYYY1OO5YYYOB.",
    ".BOYYY OO YYYOB.",
    ".BOYYYYYYYYYYOB.",
    "..BOYYYYYYYYOB..",
    "...BOYYYYYYOB...",
    "....BBBBBBBB....",
    "................",
  ];
  const px = size / 16;
  const COLOR: Record<string, string> = {
    B: "#1a0d00",
    O: "#ffb800",
    Y: "#ffd84d",
    R: "#ff3344",
    W: "#ffffff",
    D: "#7a4a00",
    "1": "#ff8a00",
    "5": "#ff8a00",
    " ": "#ffd84d",
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {grid.map((row, y) =>
        row.split("").map((ch, x) => {
          if (ch === ".") return null;
          return (
            <rect
              key={`${x}-${y}`}
              x={x * px}
              y={y * px}
              width={px}
              height={px}
              fill={COLOR[ch] ?? "#ffd84d"}
            />
          );
        })
      )}
    </svg>
  );
}

function LottoStellareWidgetBase({ telegramId }: Props) {
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [state, setState] = useState<LottoStateResponse | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(t);
  }, [message]);

  const refresh = useCallback(async () => {
    if (!telegramId) return;
    const s = await fetchLottoState(telegramId);
    if (s) setState(s);
  }, [telegramId]);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => window.removeEventListener("zoom-data-refresh", onRefresh);
  }, [refresh]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const handleBuy = async (bundle: Bundle) => {
    if (!telegramId) { setMessage("ID Telegram mancante"); return; }
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMessage("Collega prima il wallet TON");
      return;
    }
    setBuying(bundle.id);
    try {
      const nanotons = BigInt(Math.round(bundle.tonPrice * 1e9)).toString();
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: WALLET, amount: nanotons }],
      });
      const boc = txResult.boc || "";
      const confirmResult = await confirmTonPurchase(telegramId, bundle.id, connectedAddress, bundle.tonPrice, boc);
      if (confirmResult.alreadyCredited || confirmResult.ok) {
        setMessage(`+${bundle.tickets} biglietti accreditati!`);
        await refresh();
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage("Verifica pagamento in corso…");
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage(`+${bundle.tickets} biglietti accreditati!`);
          await refresh();
          window.dispatchEvent(new Event("zoom-data-refresh"));
        } else if (final?.status === "failed") {
          setMessage("Pagamento non confermato sulla blockchain");
        } else {
          setMessage("In attesa di conferma…");
        }
      } else {
        setMessage(confirmResult.error || "Errore di accredito");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMessage("Pagamento annullato");
      } else {
        setMessage("Errore TON");
        console.error("[lotto] sendTransaction error:", err);
      }
    }
    setBuying(null);
  };

  const jackpotTon = state?.jackpotTon ?? 0;
  const userTickets = state?.userTickets ?? 0;
  const winChancePct = state?.winChancePct ?? 0;
  const totalTickets = state?.totalTickets ?? 0;

  return (
    <>
      <style>{`
        @keyframes lottoFloat {
          0%, 100% { transform: translateY(0) rotate(-1.2deg); }
          50%      { transform: translateY(-5px) rotate(1.2deg); }
        }
        @keyframes lottoGlow {
          0%, 100% { box-shadow: 0 0 12px ${NEON_GOLD}66, 0 0 24px ${NEON_RED}22; }
          50%      { box-shadow: 0 0 22px ${NEON_GOLD}cc, 0 0 44px ${NEON_PURPLE}55; }
        }
        @keyframes lottoModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .lotto-tile-img { animation: lottoFloat 3.6s ease-in-out infinite; }
        .lotto-tile-frame { animation: lottoGlow 2.6s ease-in-out infinite; }
        .lotto-buy-btn {
          background: linear-gradient(135deg, ${NEON_GOLD}, ${NEON_RED});
          color: #1a0d00;
          font-weight: 900;
          letter-spacing: 0.05em;
          border: none;
          border-radius: 12px;
          padding: 12px 16px;
          cursor: pointer;
          transition: transform 0.1s ease, filter 0.15s ease;
          box-shadow: 0 0 12px ${NEON_GOLD}66;
        }
        .lotto-buy-btn:active { transform: scale(0.96); }
        .lotto-buy-btn:disabled { opacity: 0.55; cursor: not-allowed; filter: grayscale(0.4); }
        .lotto-modal-card { animation: lottoModalIn 0.28s cubic-bezier(0.2,0.9,0.3,1.2); }
      `}</style>

      <button
        onClick={() => setOpen(true)}
        aria-label="Lotto Stellare"
        style={{
          position: "fixed",
          left: 12,
          // Sotto Earth (top:200, h:60 → 260) e Mystery Box (top:270, h:60
          // → 330). Il widget sta a left:12 top:340 dove il lato sinistro è
          // libero (Hall of Fame e gli altri widget verticali stanno a
          // right:12 a quote diverse).
          top: 340,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(28,16,4,0.78)",
          border: `1.5px solid ${NEON_GOLD}88`,
          padding: 4,
          cursor: "pointer",
          zIndex: 40,
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        className="lotto-tile-frame"
        data-testid="button-lotto-stellare"
      >
        <div className="lotto-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 6px ${NEON_GOLD}aa)` }}>
          <PixelTicket size={48} />
        </div>
        {userTickets > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 20,
              height: 20,
              padding: "0 5px",
              borderRadius: 10,
              background: NEON_GOLD,
              color: "#1a0d00",
              fontSize: 10,
              fontWeight: 900,
              border: "2px solid rgba(8,12,28,0.95)",
              boxShadow: `0 0 8px ${NEON_GOLD}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {userTickets > 99 ? "99+" : userTickets}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(4,6,16,0.78)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "100px 18px 24px",
            overflowY: "auto",
          }}
        >
          <div
            className="lotto-modal-card"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 440,
              background: "linear-gradient(180deg, rgba(20,12,4,0.96), rgba(8,4,12,0.98))",
              border: `1px solid ${NEON_GOLD}66`,
              boxShadow: `0 0 36px ${NEON_GOLD}33, 0 0 64px ${NEON_RED}22`,
              borderRadius: 18,
              padding: 22,
              color: "#fff",
            }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Chiudi"
              style={{
                position: "absolute", top: 12, right: 12, width: 32, height: 32,
                borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 16,
                fontWeight: 900, cursor: "pointer", lineHeight: 1,
              }}
            >
              ✕
            </button>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, marginTop: 6 }}>
              <div className="lotto-tile-frame" style={{
                width: 110, height: 110, borderRadius: 18,
                background: "rgba(28,16,4,0.6)",
                border: `2px solid ${NEON_GOLD}88`,
                padding: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div className="lotto-tile-img" style={{ filter: `drop-shadow(0 0 12px ${NEON_GOLD}cc)` }}>
                  <PixelTicket size={88} />
                </div>
              </div>
            </div>

            <div style={{
              fontFamily: "'Orbitron', 'Inter', sans-serif",
              fontSize: 22, fontWeight: 900, letterSpacing: "0.18em",
              textAlign: "center", marginBottom: 4, color: "#fff",
              textShadow: `0 0 12px ${NEON_GOLD}88, 0 0 24px ${NEON_RED}44`,
              textTransform: "uppercase",
            }}>
              Lotto Stellare
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textAlign: "center", marginBottom: 14, letterSpacing: "0.08em" }}>
              più biglietti compri, più alta la tua probabilità di vincere
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8, marginBottom: 18,
              padding: 12, borderRadius: 12,
              background: `linear-gradient(135deg, rgba(255,216,77,0.1), rgba(196,113,237,0.05))`,
              border: `1px solid ${NEON_GOLD}33`,
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Jackpot</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: NEON_GOLD, marginTop: 2 }}>{jackpotTon.toFixed(2)}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>TON</div>
              </div>
              <div style={{ textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.08)", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em", textTransform: "uppercase" }}>I tuoi</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginTop: 2 }}>{userTickets}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>biglietti</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Vincita</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: NEON_PURPLE, marginTop: 2 }}>{winChancePct.toFixed(2)}%</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{totalTickets} totali</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {BUNDLES.map((b) => (
                <div key={b.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, padding: "12px 14px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${NEON_GOLD}33`,
                }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>{b.label}</span>
                      {b.badge && (
                        <span style={{
                          fontSize: 9, fontWeight: 900, padding: "2px 6px",
                          borderRadius: 6, background: NEON_RED, color: "#fff",
                          letterSpacing: "0.08em",
                        }}>{b.badge}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{b.tonPrice} TON</span>
                  </div>
                  <button
                    className="lotto-buy-btn"
                    onClick={() => handleBuy(b)}
                    disabled={buying !== null}
                    data-testid={`button-buy-${b.id}`}
                  >
                    {buying === b.id ? "…" : "ACQUISTA"}
                  </button>
                </div>
              ))}
            </div>

            {message && (
              <div style={{
                marginTop: 14, padding: "8px 12px", borderRadius: 8,
                background: "rgba(255,216,77,0.1)", border: `1px solid ${NEON_GOLD}55`,
                fontSize: 12, color: NEON_GOLD, textAlign: "center",
              }}>
                {message}
              </div>
            )}

            <div style={{
              marginTop: 14, padding: "10px 12px", borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, textAlign: "center",
            }}>
              Il <b style={{ color: NEON_GOLD }}>90%</b> del raccolto va al vincitore (jackpot). Il vincitore è scelto a caso tra TUTTI i biglietti venduti — più ne possiedi, più sale la tua probabilità. Pagamento del premio gestito manualmente dall'admin.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const LottoStellareWidget = memo(LottoStellareWidgetBase);
