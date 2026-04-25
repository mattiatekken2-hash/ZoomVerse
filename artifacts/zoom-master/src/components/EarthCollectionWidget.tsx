import { useEffect, useId, useState, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { confirmTonPurchase, pollTxnUntilFinal } from "../utils/api";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const PRICE_TON = 7;
const NEON_BLUE = "#3b82f6";
const NEON_GREEN_E = "#22c55e";

// Simplified continent silhouettes in equirectangular projection.
// One full world map fits in viewBox 1000x500 (longitude 0..1000 = -180..+180,
// latitude 0..500 = +90..-90). Two copies are rendered side-by-side at x=0
// and x=1000 inside a 2000x500 SVG and the whole strip is animated
// translateX(0) → translateX(-50%) so the rotation loops seamlessly.
// The shapes are intentionally low-poly silhouettes (not survey-grade
// geography) but each continent is recognizably itself, NOT a random blob.
const CONTINENT_PATHS: string[] = [
  // North America
  "M 70 105 L 100 80 L 145 70 L 195 68 L 240 75 L 270 92 L 285 115 L 282 142 L 268 165 L 248 185 L 222 200 L 195 205 L 170 195 L 148 180 L 130 165 L 110 152 L 92 140 L 78 125 Z",
  // Alaska
  "M 35 95 L 60 88 L 78 95 L 75 110 L 55 115 L 38 108 Z",
  // Greenland
  "M 308 65 L 340 60 L 358 75 L 362 100 L 348 120 L 322 122 L 308 105 L 305 85 Z",
  // Central America
  "M 200 210 L 215 215 L 225 232 L 235 250 L 240 268 L 232 280 L 218 275 L 208 258 L 202 235 Z",
  // South America
  "M 235 280 L 265 268 L 290 275 L 305 295 L 315 322 L 318 355 L 310 388 L 295 415 L 278 425 L 262 418 L 250 400 L 240 372 L 235 340 L 232 308 Z",
  // Iceland
  "M 415 110 L 430 105 L 440 115 L 432 125 L 418 122 Z",
  // UK / Ireland
  "M 460 135 L 475 130 L 482 145 L 478 160 L 462 162 L 455 150 Z",
  // Scandinavia
  "M 510 90 L 535 85 L 555 95 L 560 115 L 548 130 L 525 132 L 510 120 L 505 105 Z",
  // Iberia
  "M 458 168 L 478 165 L 488 178 L 482 192 L 465 192 L 455 180 Z",
  // Continental Europe
  "M 488 145 L 515 138 L 545 142 L 568 152 L 572 168 L 558 180 L 530 185 L 502 182 L 488 170 Z",
  // Africa
  "M 488 195 L 515 188 L 545 192 L 575 200 L 595 218 L 608 245 L 612 278 L 605 312 L 590 345 L 568 372 L 545 388 L 522 392 L 502 380 L 488 358 L 478 328 L 472 295 L 472 262 L 478 228 Z",
  // Madagascar
  "M 615 335 L 625 332 L 632 350 L 628 370 L 618 372 L 612 358 Z",
  // Arabian Peninsula
  "M 595 198 L 622 198 L 640 218 L 638 240 L 618 248 L 600 240 L 590 222 Z",
  // Asia (mainland)
  "M 568 105 L 605 92 L 655 85 L 712 82 L 770 88 L 825 100 L 865 118 L 885 140 L 890 168 L 880 195 L 858 212 L 822 222 L 785 220 L 750 215 L 720 220 L 698 215 L 678 205 L 658 192 L 638 178 L 618 162 L 598 145 L 582 128 Z",
  // India
  "M 695 222 L 718 218 L 730 235 L 738 258 L 728 278 L 712 282 L 700 270 L 692 248 Z",
  // Southeast Asia (Malay peninsula)
  "M 758 222 L 770 225 L 778 245 L 770 265 L 758 268 L 752 250 L 752 232 Z",
  // Indonesia / Borneo
  "M 778 260 L 802 258 L 815 270 L 812 282 L 790 285 L 775 278 Z",
  // New Guinea
  "M 825 268 L 850 266 L 862 278 L 850 290 L 828 287 Z",
  // Japan
  "M 858 165 L 875 158 L 885 172 L 882 188 L 868 192 L 858 180 Z",
  // Philippines
  "M 822 230 L 835 228 L 838 245 L 830 252 L 820 245 Z",
  // Australia
  "M 795 320 L 838 312 L 882 318 L 912 332 L 922 355 L 912 378 L 882 388 L 848 392 L 815 388 L 792 372 L 785 348 Z",
  // Tasmania
  "M 870 395 L 882 393 L 887 405 L 880 412 L 870 408 Z",
  // New Zealand
  "M 932 380 L 945 378 L 952 395 L 948 412 L 935 410 L 928 395 Z",
];

// Antarctica is drawn separately so it can be filled with the polar-ice
// gradient instead of the temperate green used for the other continents.
const ANTARCTICA_PATH =
  "M 0 460 Q 80 450 160 462 Q 250 478 340 465 Q 430 452 520 466 Q 610 478 700 466 Q 790 452 880 466 Q 950 478 1000 466 L 1000 500 L 0 500 Z";

function EarthGlobe({ large = false }: { large?: boolean }) {
  // The toolbar icon and the modal both mount an EarthGlobe at the same time
  // when the modal is open, so we need per-instance gradient IDs to avoid
  // duplicate-id collisions in the DOM (would still render but is invalid
  // HTML and some tools warn). useId() gives a stable, unique id per mount.
  const gid = useId().replace(/[:]/g, "");
  const landId = `ec-land-${gid}`;
  const iceId = `ec-ice-${gid}`;
  return (
    <div
      className={`ec-planet${large ? " ec-planet-lg" : ""}`}
      role="img"
      aria-label="Earth Collection planet"
    >
      <svg
        className="ec-world"
        viewBox="0 0 2000 500"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={landId} x1="0" y1="0" x2="0" y2="500" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4cb96a" />
            <stop offset="55%" stopColor="#2c8a47" />
            <stop offset="100%" stopColor="#1c6633" />
          </linearGradient>
          <linearGradient id={iceId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4faff" />
            <stop offset="100%" stopColor="#c8dcf5" />
          </linearGradient>
        </defs>
        {[0, 1000].map((dx) => (
          <g key={dx} transform={`translate(${dx} 0)`}>
            {CONTINENT_PATHS.map((d, i) => (
              <path key={i} d={d} fill={`url(#${landId})`} />
            ))}
            <path d={ANTARCTICA_PATH} fill={`url(#${iceId})`} />
          </g>
        ))}
      </svg>
      <div className="ec-clouds" aria-hidden="true" />
    </div>
  );
}

interface Props {
  telegramId: string | null;
  unlocked?: boolean;
  ownedBundles?: number;
  sunCount?: number;
  onUnlocked?: () => void;
}

function EarthCollectionWidgetBase({ telegramId, unlocked = false, ownedBundles = 0, sunCount = 0, onUnlocked }: Props) {
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stock, setStock] = useState<{ sold: number; remaining: number; max: number } | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const fetchStock = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/earth-collection/stock`);
      if (r.ok) setStock(await r.json());
    } catch { /* ignore */ }
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
    if (!telegramId) { setMessage("Telegram ID missing"); return; }
    if (sunCount <= 0) {
      setMessage("Requirement: You must own a SUN to unlock this collection");
      return;
    }
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMessage("Connect your wallet first");
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
      const confirmResult = await confirmTonPurchase(telegramId, "earth_collection", connectedAddress, PRICE_TON, boc);
      if (confirmResult.alreadyCredited || confirmResult.ok) {
        setMessage("Earth Collection unlocked!");
        onUnlocked?.();
        window.dispatchEvent(new Event("zoom-data-refresh"));
        setOpen(false);
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage("Verifying payment on-chain…");
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage("Earth Collection unlocked!");
          onUnlocked?.();
          window.dispatchEvent(new Event("zoom-data-refresh"));
          setOpen(false);
        } else if (final?.status === "failed") {
          setMessage("Payment not detected on-chain");
        } else {
          setMessage("Awaiting confirmation…");
        }
      } else {
        setMessage(confirmResult.error || "Credit failed");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMessage("Payment cancelled");
      } else {
        setMessage("TON payment failed");
        console.error("[earth_collection] sendTransaction error:", err);
      }
    }
    setBuying(false);
  };

  return (
    <>
      <style>{`
        @keyframes earthCollFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-6px) rotate(0.5deg); }
        }
        @keyframes earthCollGlow {
          0%, 100% { box-shadow: 0 0 12px ${NEON_BLUE}55, 0 0 24px ${NEON_GREEN_E}22; }
          50%      { box-shadow: 0 0 20px ${NEON_BLUE}99, 0 0 40px ${NEON_GREEN_E}44; }
        }
        @keyframes earthCollPulse {
          0%, 100% { box-shadow: 0 0 16px ${NEON_GREEN_E}66; }
          50%      { box-shadow: 0 0 28px ${NEON_GREEN_E}cc, 0 0 48px ${NEON_BLUE}55; }
        }
        @keyframes ecModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ec-tile-img {
          animation: earthCollFloat 3.2s ease-in-out infinite;
        }
        /* Earth globe — REAL world map (SVG continents) on top of an ocean
           sphere, not random green blobs. Layer order (bottom → top):
             1. Ocean (radial-gradient on .ec-planet itself) gives the
                spherical blue base with a bright north-west highlight.
             2. .ec-world (SVG) draws the continents as a wide horizontal
                strip; it slides left to simulate Earth rotating on its
                axis and loops seamlessly because the strip contains two
                copies of the map side-by-side.
             3. .ec-clouds adds soft white wisps that drift at a different
                speed (parallax — atmosphere moves independently of land).
             4. ::after pseudo-element paints the dark right/bottom limb
                shadow that gives the disc its 3-D sphere look. */
        .ec-planet {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 28%, #a8c8ff 0%, #3b82f6 38%, #1d4ed8 78%, #0a2466 100%);
          box-shadow:
            inset -8px -10px 18px rgba(8,18,50,0.65),
            inset 6px 8px 14px rgba(180,210,255,0.55),
            0 0 10px rgba(120,170,255,0.55);
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .ec-world {
          position: absolute;
          /* The SVG strip is 4x wider than tall (2000:500) but the planet
             is square (1:1). Render the strip vertically centered and
             stretched to fill the disc — preserveAspectRatio="none" on
             the SVG element handles the squash so polar regions stay near
             the poles instead of being clipped off-screen. */
          top: 0;
          left: 0;
          width: 200%;   /* two map widths, for seamless wrap */
          height: 100%;
          animation: ecWorldSpin 22s linear infinite;
          pointer-events: none;
          z-index: 1;
        }
        @keyframes ecWorldSpin {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ec-clouds {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          pointer-events: none;
          background:
            radial-gradient(ellipse 30% 6% at 25% 26%, rgba(255,255,255,0.55) 0%, transparent 65%),
            radial-gradient(ellipse 24% 5% at 65% 70%, rgba(255,255,255,0.5)  0%, transparent 65%),
            radial-gradient(ellipse 16% 4% at 48% 50%, rgba(255,255,255,0.4)  0%, transparent 70%);
          animation: ecCloudSpin 36s linear infinite;
          z-index: 2;
        }
        @keyframes ecCloudSpin {
          from { transform: translateX(0); }
          to   { transform: translateX(-22%); }
        }
        .ec-planet::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle at 70% 75%, transparent 55%, rgba(0,0,0,0.55) 100%);
          pointer-events: none;
          z-index: 3;
        }
        .ec-planet-lg {
          box-shadow:
            inset -16px -20px 32px rgba(8,18,50,0.65),
            inset 12px 14px 26px rgba(180,210,255,0.65),
            0 0 22px rgba(120,170,255,0.6);
        }
        @media (prefers-reduced-motion: reduce) {
          .ec-world, .ec-clouds, .ec-tile-img { animation: none !important; }
        }
        .ec-tile-frame {
          animation: earthCollGlow 2.6s ease-in-out infinite;
        }
        .ec-buy-btn {
          background: linear-gradient(135deg, ${NEON_GREEN_E}, ${NEON_BLUE});
          color: #02143a;
          font-weight: 900;
          letter-spacing: 0.05em;
          border: none;
          border-radius: 12px;
          padding: 14px 20px;
          cursor: pointer;
          animation: earthCollPulse 2.4s ease-in-out infinite;
          transition: transform 0.1s ease, filter 0.15s ease;
        }
        .ec-buy-btn:active { transform: scale(0.96); }
        .ec-buy-btn:disabled { opacity: 0.55; cursor: not-allowed; animation: none; filter: grayscale(0.4); }
        .ec-modal-card {
          animation: ecModalIn 0.28s cubic-bezier(0.2,0.9,0.3,1.2);
        }
      `}</style>

      <button
        onClick={() => setOpen(true)}
        aria-label="Earth Collection Limited"
        style={{
          position: "fixed",
          left: 12,
          top: 200,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(8,12,28,0.78)",
          border: `1.5px solid ${NEON_BLUE}66`,
          padding: 4,
          cursor: "pointer",
          zIndex: 40,
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        className="ec-tile-frame"
        data-testid="button-earth-collection"
      >
        <div className="ec-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 6px ${NEON_BLUE}aa)` }}>
          <EarthGlobe />
        </div>
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(4,6,16,0.74)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "140px 18px 24px",
            overflowY: "auto",
          }}
        >
          <div
            className="ec-modal-card"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              background: "linear-gradient(180deg, rgba(12,14,28,0.96), rgba(8,10,22,0.98))",
              border: `1px solid ${NEON_BLUE}55`,
              boxShadow: `0 0 36px ${NEON_BLUE}33, 0 0 64px ${NEON_GREEN_E}22`,
              borderRadius: 18,
              padding: 22,
              color: "#fff",
            }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                position: "absolute", top: 12, right: 12, width: 32, height: 32,
                borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 16,
                fontWeight: 900, cursor: "pointer", lineHeight: 1,
              }}
            >
              ✕
            </button>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 18, marginTop: 6,
            }}>
              <div
                className="ec-tile-frame"
                style={{
                  width: 180, height: 180, borderRadius: 18,
                  background: "rgba(8,12,28,0.6)",
                  border: `2px solid ${NEON_BLUE}66`,
                  padding: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <div className="ec-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 12px ${NEON_BLUE}cc)` }}>
                  <EarthGlobe large />
                </div>
              </div>
            </div>

            <div style={{
              fontFamily: "'Orbitron', 'Inter', sans-serif",
              fontSize: 20, fontWeight: 900, letterSpacing: "0.18em",
              textAlign: "center", marginBottom: 6, color: "#fff",
              textShadow: `0 0 12px ${NEON_BLUE}88, 0 0 24px ${NEON_GREEN_E}44`,
              textTransform: "uppercase",
            }}>
              Earth Collection Limited
            </div>
            <div style={{
              fontSize: 12, color: "rgba(255,255,255,0.65)", textAlign: "center",
              lineHeight: 1.5, marginBottom: 18, padding: "0 6px",
            }}>
              Unlock 4 exclusive earth slots. Speed: <b style={{ color: NEON_BLUE }}>0.017 TON/day</b>. Requires SUN module.
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 6, marginBottom: 14,
              fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
              color: soldOut ? "#ff5577" : NEON_GREEN_E, fontWeight: 800,
            }}>
              {stock
                ? soldOut
                  ? "SOLD OUT"
                  : <>Limited: <b style={{ color: "#fff" }}>{stock.remaining}</b> / {stock.max} left</>
                : "Loading…"}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, padding: "14px 16px", borderRadius: 14,
              background: `linear-gradient(135deg, rgba(34,197,94,0.06), rgba(59,130,246,0.04))`,
              border: `1px solid ${NEON_GREEN_E}44`,
            }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Price</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>7 TON</span>
              </div>
              <button
                className="ec-buy-btn"
                onClick={handleBuy}
                disabled={buying || soldOut || sunCount <= 0}
                title={sunCount <= 0 ? "You must own a SUN to unlock this collection" : undefined}
                data-testid="button-buy-earth-collection"
              >
                {soldOut
                  ? "SOLD OUT"
                  : buying
                  ? "PROCESSING…"
                  : sunCount <= 0
                  ? "🔒 SUN REQUIRED"
                  : ownedBundles > 0
                  ? `BUY ANOTHER (OWN ${ownedBundles})`
                  : "BUY"}
              </button>
            </div>

            {message && (
              <div style={{
                marginTop: 12, padding: "8px 12px", borderRadius: 8,
                background: "rgba(59,130,246,0.08)", border: `1px solid ${NEON_BLUE}33`,
                fontSize: 12, color: NEON_BLUE, textAlign: "center",
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

export const EarthCollectionWidget = memo(EarthCollectionWidgetBase);
