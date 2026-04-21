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
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { LanguageProvider, useT } from "./i18n/LanguageContext";
import { fetchMaintenanceStatus } from "./utils/api";

const MAINTENANCE_ADMIN_ID = "8144744644";

const MANIFEST_URL = `${window.location.origin}/tonconnect-manifest.json`;

type Tab = "lab" | "farm" | "market" | "earn" | "wheel" | "rank" | "shop";

const NAV: { id: Tab; labelKey: string; icon: string }[] = [
  { id: "lab", labelKey: "nav.lab", icon: "⬡" },
  { id: "farm", labelKey: "nav.farm", icon: "🪐" },
  { id: "market", labelKey: "nav.market", icon: "💫" },
  { id: "wheel", labelKey: "nav.wheel", icon: "🎡" },
  { id: "earn", labelKey: "nav.earn", icon: "🎁" },
  { id: "rank", labelKey: "nav.rank", icon: "🏆" },
];

const ALL_TABS: Tab[] = ["lab", "farm", "market", "earn", "wheel", "rank", "shop"];

export default function App() {
  return (
    <LanguageProvider>
      <AppShellWithState />
    </LanguageProvider>
  );
}

function AppShellWithState() {
  const [tab, setTab] = useState<Tab>("lab");
  const {
    state, craft, claimCraft, redeemCode,
    collectPlanet, burnPlanet,
    startFarming, stopFarming,
    listPlanet, unlistPlanet, buyPlanet, serverBuyComplete,
    claimDaily, startSunFarming, stopSunFarming, burnSun,
    placeWhitePlanet, reactivateWhitePlanet, collectWhitePlanet,
  } = useGameState();

  // Centralized global data fetch — Season epoch, leaderboard, profile, daily, market.
  // Pages read from the global store so tab switches show pre-loaded data with no pop-in.
  useGlobalInit(state.telegramId);

  // Maintenance mode: poll status, show fullscreen overlay for non-admins.
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string }>({ enabled: false, message: "" });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await fetchMaintenanceStatus();
      if (alive) setMaintenance({ enabled: !!s.enabled, message: s.message || "" });
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 20000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    const onAdmin = () => { load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("zoom-admin-refresh", onAdmin);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("zoom-admin-refresh", onAdmin); };
  }, []);
  const isAdmin = state.telegramId === MAINTENANCE_ADMIN_ID;
  const showMaintenance = maintenance.enabled && !isAdmin;

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
    const TARGET_VOLUME = 0.18;
    const FADE_IN_S = 2.2;

    // Background music. We deliberately use a plain HTMLAudioElement and
    // do NOT route through Web Audio (no createMediaElementSource, no
    // GainNode, no filters). Inside Telegram's in-app WebView (especially
    // on iOS) the Web Audio graph resamples the stream and adds an audible
    // "grainy / lo-fi" texture, even with a minimal source→gain chain.
    // Bypassing it lets the OS audio renderer play the 320 kbps MP3 at
    // native quality. Fades are done by animating `audio.volume`.
    const audio = new Audio(`${import.meta.env.BASE_URL}bgm.mp3`);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = mutedRef.current ? 0 : 0;
    audio.muted = mutedRef.current;
    audioRef.current = audio;

    // Smooth `audio.volume` ramp using requestAnimationFrame.
    let fadeRaf = 0;
    const fadeTo = (target: number, seconds: number) => {
      if (fadeRaf) cancelAnimationFrame(fadeRaf);
      const startV = audio.volume;
      const start = performance.now();
      const dur = Math.max(1, seconds * 1000);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = t * t * (3 - 2 * t);
        audio.volume = Math.max(0, Math.min(1, startV + (target - startV) * eased));
        if (t < 1) fadeRaf = requestAnimationFrame(step);
        else fadeRaf = 0;
      };
      fadeRaf = requestAnimationFrame(step);
    };

    // Start the track. We never pause on mute — just ramp volume to 0 — so
    // the playhead keeps advancing and unmute resumes from the same spot.
    const tryPlay = () => {
      audio.muted = mutedRef.current;
      audio.play().then(() => {
        if (mutedRef.current) {
          audio.volume = 0;
        } else {
          fadeTo(TARGET_VOLUME, FADE_IN_S);
        }
      }).catch(() => {});
    };
    tryPlay();
    const t1 = setTimeout(() => { if (audioRef.current?.paused) tryPlay(); }, 100);
    const t2 = setTimeout(() => { if (audioRef.current?.paused) tryPlay(); }, 500);
    const t3 = setTimeout(() => { if (audioRef.current?.paused) tryPlay(); }, 1500);
    (audio as unknown as { _timers: number[] })._timers = [t1, t2, t3] as unknown as number[];

    const onUserGesture = () => {
      const a = audioRef.current;
      if (!a) return;
      // If the WebView blocked autoplay, the first user gesture starts it.
      // Mute / unmute is handled separately in the [muted] effect below.
      if (a.paused) tryPlay();
    };
    // Listen on as many "first interaction" channels as possible so the music
    // starts the instant the WebView allows audio (Telegram launch animation,
    // first scroll, first tap, focus from background, etc.).
    window.addEventListener("pointerdown", onUserGesture);
    window.addEventListener("touchstart", onUserGesture);
    window.addEventListener("touchend", onUserGesture);
    window.addEventListener("click", onUserGesture);
    window.addEventListener("keydown", onUserGesture);
    window.addEventListener("scroll", onUserGesture, { passive: true });
    window.addEventListener("focus", onUserGesture);
    document.addEventListener("visibilitychange", onUserGesture);

    return () => {
      window.removeEventListener("pointerdown", onUserGesture);
      window.removeEventListener("touchstart", onUserGesture);
      window.removeEventListener("touchend", onUserGesture);
      window.removeEventListener("click", onUserGesture);
      window.removeEventListener("keydown", onUserGesture);
      window.removeEventListener("scroll", onUserGesture);
      window.removeEventListener("focus", onUserGesture);
      document.removeEventListener("visibilitychange", onUserGesture);
      const timers = (audio as unknown as { _timers?: number[] })._timers;
      if (timers) timers.forEach((id) => clearTimeout(id));
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem("zoom-bgm-muted", muted ? "1" : "0"); } catch {/**/}
    const a = audioRef.current;
    if (!a) return;

    // Mute / unmute is purely a volume change — the audio element keeps
    // playing in the background so unmute resumes from the current playhead
    // position, never restarts from zero.
    const TARGET_VOLUME = 0.18;
    const FADE_IN_S = 1.4;

    const animateVolume = (target: number, seconds: number) => {
      const start = performance.now();
      const from = a.volume;
      const dur = Math.max(1, seconds * 1000);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = t * t * (3 - 2 * t);
        a.volume = Math.max(0, Math.min(1, from + (target - from) * eased));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (muted) {
      // Instant silence + volume=0 so it's truly muted on every device.
      a.muted = true;
      a.volume = 0;
    } else {
      a.muted = false;
      // If the WebView paused the element while backgrounded, resume from
      // the current playhead (currentTime is preserved).
      if (a.paused) a.play().catch(() => {});
      animateVolume(TARGET_VOLUME, FADE_IN_S);
    }
  }, [muted]);

  const { t } = useT();

  if (showMaintenance) {
    return (
      <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
        <MaintenanceScreen message={maintenance.message} />
      </TonConnectUIProvider>
    );
  }

  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
    <div className="flex flex-col overflow-hidden relative" style={{ height: "100dvh", background: "#060810", paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <NebulaBackground />
      {isAdmin && maintenance.enabled && (
        <div
          className="flex-shrink-0 text-center text-xs font-black tracking-widest py-1.5 relative z-30"
          style={{ background: "rgba(255,179,71,0.18)", color: "#ffb347", borderBottom: "1px solid rgba(255,179,71,0.4)" }}
        >
          🛠️ {t("maint.banner")}
        </div>
      )}

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
              +{totalRate.toLocaleString()}{t("header.perHour")}
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
          <LanguageSwitcher />
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
                  hasAutoTap={!!state.hasAutoTap}
                  whiteCollectionUnlocked={!!state.whiteCollectionUnlocked}
                  whiteCollectionBundles={Number(state.whiteCollectionBundles) || 0}
                  whitePlanets={state.whitePlanets || []}
                  tonBalance={state.tonBalance || 0}
                  telegramId={state.telegramId}
                  onCraft={craft}
                  onClaim={claimCraft}
                  onPlaceWhitePlanet={placeWhitePlanet}
                  onCollectWhitePlanet={collectWhitePlanet}
                  onReactivateWhitePlanet={reactivateWhitePlanet}
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
                  {t(item.labelKey)}
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

function MaintenanceScreen({ message }: { message: string }) {
  const { t } = useT();
  return (
    <div
      className="flex flex-col items-center justify-center text-center px-6"
      style={{ height: "100dvh", background: "#060810", paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <NebulaBackground />
      <div className="relative z-10 max-w-sm">
        <div style={{ fontSize: 64, marginBottom: 18 }}>🛠️</div>
        <div className="font-black text-2xl tracking-widest neon-text mb-3">{t("maint.title")}</div>
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>
          {message || t("maint.default")}
        </div>
        <div
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black tracking-widest"
          style={{ background: "rgba(255,179,71,0.12)", color: "#ffb347", border: "1px solid rgba(255,179,71,0.4)" }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ffb347", boxShadow: "0 0 10px #ffb347" }} />
          {t("maint.paused")}
        </div>
      </div>
    </div>
  );
}
