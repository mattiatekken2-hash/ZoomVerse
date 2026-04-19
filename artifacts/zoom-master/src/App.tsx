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

  const gainRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const TARGET_VOLUME = 0.18;
    const FADE_IN_S = 2.2;
    const FADE_OUT_S = 0.6;

    // Track #3 (background music). Loops forever once user gesture allows
    // playback. Mute / unmute NEVER pauses the element — they only ramp the
    // gain node — so the playhead keeps advancing in the background and
    // un-muting resumes from the current position instantly, with no restart.
    const audio = new Audio(`${import.meta.env.BASE_URL}bgm.mp3`);
    audio.loop = true;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    // Keep element volume at 1 — we control level via the Web Audio gain node
    // so fades and the final mix happen with sample-accurate float precision
    // instead of the WebView's coarse volume mixer (which is what was causing
    // the grainy / lo-fi feel).
    audio.volume = 1;
    audioRef.current = audio;

    // Web Audio chain: source → lowpass (tames harsh top end on tiny phone
    // speakers) → gentle compressor (prevents peak clipping in the WebView
    // mixer) → gain (smooth fades). Built lazily on first user gesture so we
    // don't trip Safari's autoplay policy.
    let chainBuilt = false;
    const buildChain = () => {
      if (chainBuilt) return;
      try {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaElementSource(audio);
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 14000;
        lowpass.Q.value = 0.7;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 24;
        comp.ratio.value = 3;
        comp.attack.value = 0.01;
        comp.release.value = 0.25;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gainRef.current = gain;
        source.connect(lowpass);
        lowpass.connect(comp);
        comp.connect(gain);
        gain.connect(ctx.destination);
        chainBuilt = true;
      } catch {
        /* fall back to plain HTMLAudio playback */
      }
    };

    // Smooth volume ramp via Web Audio gain (no element pause). Falls back to
    // an animated `audio.volume` ramp when Web Audio is unavailable.
    const fadeTo = (target: number, seconds: number) => {
      const ctx = audioCtxRef.current;
      const gain = gainRef.current;
      if (ctx && gain) {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(target, now + seconds);
      } else {
        const startV = audio.volume;
        const start = performance.now();
        const dur = seconds * 1000;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = t * t * (3 - 2 * t);
          audio.volume = Math.max(0, Math.min(1, startV + (target - startV) * eased));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    };

    // Start the track once. After this, we never pause: mute just ramps gain
    // to 0, leaving the playhead running so unmute resumes from where the
    // music currently is. Volume / `muted` are also set as a hard fallback
    // when no Web Audio chain is available.
    const tryPlay = () => {
      buildChain();
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      audio.muted = mutedRef.current;
      audio.play().then(() => {
        if (mutedRef.current) {
          // Already muted — keep gain at 0, nothing to fade.
          if (gainRef.current) gainRef.current.gain.value = 0;
          else audio.volume = 0;
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
    const FADE_OUT_S = 0.6;
    const FADE_IN_S = 1.4;
    const ctx = audioCtxRef.current;
    const gain = gainRef.current;

    if (muted) {
      if (ctx && gain) {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
      } else {
        // No Web Audio: fall back to the element's `muted` flag (instant) +
        // volume=0 so the user truly hears nothing on every device.
        a.volume = 0;
        a.muted = true;
      }
    } else {
      // Make sure the element flag is off so audio is audible again.
      a.muted = false;
      // If the WebView had paused the element (e.g. backgrounded the tab),
      // resume playback — currentTime is preserved so it continues from
      // where it stopped, not from the beginning.
      if (a.paused) a.play().catch(() => {});
      if (ctx && gain) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(TARGET_VOLUME, now + FADE_IN_S);
      } else {
        const start = performance.now();
        const from = a.volume;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / (FADE_IN_S * 1000));
          const eased = t * t * (3 - 2 * t);
          a.volume = from + (TARGET_VOLUME - from) * eased;
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }
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
