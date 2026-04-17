import { useState, useMemo, useEffect, useRef } from "react";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { useGameState, isFarmActive, isSunActive, SUN_CONFIG } from "./hooks/useGameState";
import { useGlobalInit } from "./store/globalStore";
import { NebulaBackground } from "./components/NebulaBackground";
import { LabPage } from "./pages/LabPage";
import { FarmPage } from "./pages/FarmPage";
import { MarketPage } from "./pages/MarketPage";
import { EarnPage } from "./pages/EarnPage";
import { RankPage } from "./pages/RankPage";
import { ShopPage } from "./pages/ShopPage";
import { WheelPage } from "./pages/WheelPage";
import { AdminPanel } from "./components/AdminPanel";

const MANIFEST_URL = `${window.location.origin}/tonconnect-manifest.json`;

type Tab = "lab" | "farm" | "market" | "earn" | "wheel" | "rank" | "shop";

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "lab", label: "LAB", icon: "⬡" },
  { id: "farm", label: "FARM", icon: "🪐" },
  { id: "market", label: "MARKET", icon: "💫" },
  { id: "wheel", label: "WHEEL", icon: "🎡" },
  { id: "earn", label: "EARN", icon: "🎁" },
  { id: "rank", label: "RANK", icon: "🏆" },
];

const ALL_TABS: Tab[] = ["lab", "farm", "market", "earn", "wheel", "rank", "shop"];

export default function App() {
  const [tab, setTab] = useState<Tab>("lab");
  const {
    state, craft, claimCraft, redeemCode,
    collectPlanet, burnPlanet,
    startFarming, stopFarming,
    listPlanet, unlistPlanet, buyPlanet, serverBuyComplete,
    claimDaily, startSunFarming, stopSunFarming, burnSun,
  } = useGameState();

  // Centralized global data fetch — Season epoch, leaderboard, profile, daily, market.
  // Pages read from the global store so tab switches show pre-loaded data with no pop-in.
  useGlobalInit(state.telegramId);

  const planetRate = state.planets.filter(isFarmActive).reduce((a, p) => a + p.rate, 0);
  const sunRate = state.sun && isSunActive(state.sun) ? SUN_CONFIG.rate * Math.max(1, state.sunCount || 1) : 0;
  const totalRate = planetRate + sunRate;

  const visitedTabs = useMemo(() => new Set<Tab>(["lab"]), []);
  if (!visitedTabs.has(tab)) visitedTabs.add(tab);

  const switchTab = (nextTab: Tab) => {
    setTab(nextTab);
    // Throttle: only fire global refresh if user hasn't switched in last 4s.
    // Pages that need fresh data on activation listen to "zoom-tab-active" with their tab id.
    const now = Date.now();
    const last = (window as unknown as { __zoomLastRefresh?: number }).__zoomLastRefresh || 0;
    if (now - last > 4000) {
      (window as unknown as { __zoomLastRefresh?: number }).__zoomLastRefresh = now;
      window.dispatchEvent(new Event("zoom-data-refresh"));
    }
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem("zoom-bgm-muted") === "1"; } catch { return false; }
  });
  const mutedRef = useRef<boolean>(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    const audio = new Audio(`${import.meta.env.BASE_URL}bgm.mp3`);
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "auto";
    audioRef.current = audio;

    const tryPlay = () => { audio.play().catch(() => {}); };
    if (!mutedRef.current) tryPlay();

    const onUserGesture = () => {
      const a = audioRef.current;
      if (!a) return;
      if (mutedRef.current) {
        if (!a.paused) a.pause();
        return;
      }
      if (a.paused) tryPlay();
    };
    window.addEventListener("pointerdown", onUserGesture);
    window.addEventListener("touchstart", onUserGesture);

    return () => {
      window.removeEventListener("pointerdown", onUserGesture);
      window.removeEventListener("touchstart", onUserGesture);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (muted) { a.pause(); }
    else { a.play().catch(() => {}); }
    try { localStorage.setItem("zoom-bgm-muted", muted ? "1" : "0"); } catch {/**/}
  }, [muted]);

  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
    <div className="flex flex-col overflow-hidden relative" style={{ height: "100dvh", background: "#060810", paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <NebulaBackground />

      <header
        className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 relative z-20"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div
          className="font-black text-lg tracking-widest neon-text cursor-pointer"
          onClick={() => switchTab("lab")}
        >
          ZOOM BETA
        </div>
        <div className="flex items-center gap-3">
          {totalRate > 0 && (
            <div className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
              +{totalRate.toLocaleString()}/hr
            </div>
          )}
          <div
            className="glass-neon flex items-center gap-1.5 px-3.5 py-2 rounded-full font-black text-sm cursor-pointer"
            onClick={() => switchTab("shop")}
            data-testid="balance-display"
          >
            <span style={{ fontSize: 13 }}>🪐</span>
            <span className="neon-text">{Math.floor(state.balance).toLocaleString()}</span>
          </div>
          <button
            type="button"
            aria-label={muted ? "Unmute music" : "Mute music"}
            onClick={() => setMuted((m) => !m)}
            className="glass-neon rounded-full flex items-center justify-center"
            style={{ width: 32, height: 32, fontSize: 14, border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer" }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative z-10" style={{ minHeight: 0 }}>
        {ALL_TABS.map((t) => {
          const isActive = tab === t;
          if (!visitedTabs.has(t)) return null;
          return (
            <div
              key={t}
              style={{
                height: "100%",
                display: isActive ? "flex" : "none",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {t === "lab" && (
                <LabPage
                  balance={state.balance}
                  taps={state.taps}
                  goal={state.goal}
                  planets={state.planets}
                  maxSlots={state.maxSlots}
                  currentCraftRarity={state.currentCraftRarity}
                  pendingPlanet={state.pendingPlanet}
                  onCraft={craft}
                  onClaim={claimCraft}
                  visible={tab === "lab"}
                />
              )}
              {t === "farm" && (
                <FarmPage
                  planets={state.planets}
                  sun={state.sun}
                  sunCount={state.sunCount}
                  balance={state.balance}
                  maxSlots={state.maxSlots}
                  defectPlanets={state.defectPlanets || []}
                  onCollect={collectPlanet}
                  onBurn={burnPlanet}
                  onStartFarming={startFarming}
                  onStopFarming={stopFarming}
                  onStartSunFarming={startSunFarming}
                  onStopSunFarming={stopSunFarming}
                  onBurnSun={burnSun}
                  onSell={listPlanet}
                  onUnlist={unlistPlanet}
                />
              )}
              {t === "market" && (
                <MarketPage
                  balance={state.balance}
                  myListings={state.planets}
                  maxSlots={state.maxSlots}
                  telegramId={state.telegramId}
                  onBuy={buyPlanet}
                  onUnlist={unlistPlanet}
                  onServerBuyComplete={serverBuyComplete}
                />
              )}
              {t === "earn" && (
                <EarnPage
                  referralCode={state.referralCode}
                  referralCount={state.referralCount}
                  lastDailyClaimAt={state.lastDailyClaimAt}
                  referralSpeedBonus={state.referralSpeedBonus}
                  referredBy={state.referredBy}
                  claimedMilestones={state.claimedMilestones}
                  onClaimDaily={claimDaily}
                  onRedeemCode={redeemCode}
                  telegramId={state.telegramId}
                />
              )}
              {t === "rank" && (
                <RankPage
                  balance={state.balance}
                  seasonPoolEarned={state.seasonPoolEarned}
                  activeFarmRate={totalRate}
                  totalTonSpent={state.totalTonSpent}
                  feedEvents={state.feedEvents}
                  telegramId={state.telegramId}
                  visible={tab === "rank"}
                />
              )}
              {t === "shop" && (
                <ShopPage balance={state.balance} hasSun={!!state.sun?.isOwned} telegramId={state.telegramId} />
              )}
              {t === "wheel" && (
                <WheelPage telegramId={state.telegramId} />
              )}
            </div>
          );
        })}
      </main>

      {state.telegramId && <AdminPanel telegramId={state.telegramId} />}

      <nav
        className="flex-shrink-0 relative z-20"
        style={{
          height: 70,
          background: "rgba(6,8,16,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex h-full">
          {NAV.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
                onClick={() => switchTab(item.id)}
                data-testid={`nav-${item.id}`}
                style={{ color: isActive ? "#00f2fe" : "rgba(255,255,255,0.2)" }}
              >
                {isActive && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full"
                    style={{ background: "#00f2fe", boxShadow: "0 0 10px rgba(0,242,254,0.9)" }}
                  />
                )}
                <div
                  style={{
                    fontSize: 17,
                    transform: isActive ? "scale(1.15)" : "scale(1)",
                    textShadow: isActive ? "0 0 12px rgba(0,242,254,0.9)" : "none",
                  }}
                >
                  {item.icon}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em" }}>
                  {item.label}
                </div>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
    </TonConnectUIProvider>
  );
}
