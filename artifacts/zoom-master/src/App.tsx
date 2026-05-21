import { useState, useMemo, useEffect, useRef } from "react";
import { TonWalletWidget } from "./components/TonWalletWidget";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { BlackPlanetOrbStyles } from "./components/BlackPlanetOrb";
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
import { HomePage } from "./pages/HomePage";
import { AdminPanel } from "./components/AdminPanel";
import { SettingsMenu } from "./components/SettingsMenu";
import { LanguageProvider, useT } from "./i18n/LanguageContext";
import HistoryModal from "./components/HistoryModal";
import { fetchMaintenanceStatus, fetchServerTime, fetchStardustLeaderboard, type StardustLeaderboardEntry } from "./utils/api";
import { useStardust } from "./hooks/useStardust";
import { useMerchant } from "./hooks/useMerchant";
import { MerchantPopup } from "./components/MerchantPopup";

const MAINTENANCE_ADMIN_ID = "8144744644";

const MANIFEST_URL = `${window.location.origin}/tonconnect-manifest.json`;

type Tab = "lab" | "home" | "farm" | "market" | "earn" | "wheel" | "rank" | "shop";

const NAV: { id: Tab; labelKey: string; icon: string }[] = [
  { id: "lab", labelKey: "nav.lab", icon: "⬡" },
  { id: "home", labelKey: "nav.home", icon: "⌂" },
  { id: "farm", labelKey: "nav.farm", icon: "🪐" },
  { id: "market", labelKey: "nav.market", icon: "💫" },
  { id: "wheel", labelKey: "nav.wheel", icon: "🎡" },
  { id: "earn", labelKey: "nav.earn", icon: "🎁" },
  { id: "rank", labelKey: "nav.rank", icon: "🏆" },
];

const ALL_TABS: Tab[] = ["lab", "home", "farm", "market", "earn", "wheel", "rank", "shop"];

export default function App() {
  return (
    <LanguageProvider>
      <BlackPlanetOrbStyles />
      <AppShellWithState />
    </LanguageProvider>
  );
}

function AppShellWithState() {
  const [tab, setTab] = useState<Tab>("lab");
  const { t } = useT();

  // Global toast — listens for window 'zoom-toast' CustomEvents and shows a
  // brief banner. Used by useGameState (e.g. claimCraft when slots are full).
  const [globalToast, setGlobalToast] = useState<{ text: string; ok: boolean } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string; ok: boolean }>).detail;
      if (!detail) return;
      const text = detail.text === "Slots full" ? t("common.slotsFull") : detail.text;
      setGlobalToast({ text, ok: !!detail.ok });
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setGlobalToast(null);
        toastTimerRef.current = null;
      }, 2500);
    };
    window.addEventListener("zoom-toast", onToast);
    return () => {
      window.removeEventListener("zoom-toast", onToast);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, [t]);
  const {
    state, craft, claimCraft, redeemCode,
    collectPlanet, burnPlanet, renamePlanetLocal,
    startFarming, stopFarming,
    listPlanet, unlistPlanet, buyPlanet, serverBuyComplete,
    claimDaily, startSunFarming, stopSunFarming, burnSun,
    placeWhitePlanet, reactivateWhitePlanet, markWhitePlanetReactivated, collectWhitePlanet,
    placeEarthPlanet, reactivateEarthPlanet, markEarthPlanetReactivated, collectEarthPlanet,
    placeBlackPlanet, reactivateBlackPlanet, markBlackPlanetReactivated, collectBlackPlanet,
    burnTwoOfType, addCraftedPlanet,
  } = useGameState();

  // Space Merchant — wire once at App level so the radar LED in LAB and the
  // overlay popup share the same authoritative timer state. Polling stays
  // active on every tab so the spawn timer keeps ticking in the background;
  // the popup itself is gated to the LAB tab below, so the alien can only be
  // *interacted with* in the lab even though it can *appear* anywhere.
  const merchant = useMerchant(state.telegramId);
  const basicCount = state.planets.filter((p) => p.name === "BASIC" && !p.isFarmingActive && !p.isListedInMarket).length;
  const rareCount = state.planets.filter((p) => p.name === "RARE" && !p.isFarmingActive && !p.isListedInMarket).length;
  const epicCount = state.planets.filter((p) => p.name === "EPIC" && !p.isFarmingActive && !p.isListedInMarket).length;

  // Centralized global data fetch — Season epoch, leaderboard, profile, daily, market.
  // Pages read from the global store so tab switches show pre-loaded data with no pop-in.
  useGlobalInit(state.telegramId);

  // Stardust — second currency. Server-authoritative; the SUN gate and the
  // 25/day cap are enforced inside the API.
  const stardust = useStardust(state.telegramId);
  const [stardustPopupOpen, setStardustPopupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ─────── STARDUST spawn mechanic (lifted to App level) ──────────
  // The star spawns on ANY screen so the user doesn't need to camp the LAB,
  // but it's only *collectable* while the LAB tab is active. Clicking the
  // star outside the LAB shows a small hint without despawning it (so the
  // user has time to switch tab and harvest it).
  const [spawnedStar, setSpawnedStar] = useState<{ id: number; x: number; y: number } | null>(null);
  const [stardustBurst, setStardustBurst] = useState<{ id: number; x: number; y: number } | null>(null);
  const [noSunPopup, setNoSunPopup] = useState(false);
  const [stardustToast, setStardustToast] = useState<string | null>(null);
  const stardustSpawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stardustDespawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stardustBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stardustToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stardustIdRef = useRef(0);
  const stardustInFlightRef = useRef(false);
  const stardustCapReached = stardust.today >= stardust.dailyCap;
  // Stable ref so the spawn loop can read the latest cap state without
  // re-running its cleanup (which would also kill an active despawn timer).
  const stardustCapReachedRef = useRef(stardustCapReached);
  useEffect(() => { stardustCapReachedRef.current = stardustCapReached; }, [stardustCapReached]);

  // Maintenance mode: poll status, show fullscreen overlay for non-admins.
  // We cache the last known status in localStorage so a repeat visit during
  // maintenance shows the lock screen immediately (zero Lab flash). On a
  // first-ever visit (no cache) we render a neutral splash until the first
  // status fetch resolves, again to prevent the Lab from flashing.
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string }>(() => {
    try {
      const raw = localStorage.getItem("zoom-maint-cached");
      if (raw) {
        const c = JSON.parse(raw) as { enabled?: boolean; message?: string };
        return { enabled: !!c.enabled, message: c.message || "" };
      }
    } catch { /**/ }
    return { enabled: false, message: "" };
  });
  const [maintLoaded, setMaintLoaded] = useState<boolean>(() => {
    try { return localStorage.getItem("zoom-maint-cached") !== null; } catch { return false; }
  });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await fetchMaintenanceStatus();
      if (!alive) return;
      const next = { enabled: !!s.enabled, message: s.message || "" };
      setMaintenance(next);
      setMaintLoaded(true);
      try { localStorage.setItem("zoom-maint-cached", JSON.stringify(next)); } catch { /**/ }
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
  const showSplash = !maintLoaded && !isAdmin;

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

  // ─────── STARDUST spawn loop (runs on every screen) ─────────────
  // The next-attempt time is persisted to localStorage so the cooldown
  // continues counting down even while the user has the app closed. When
  // the user re-enters and the persisted time has already passed, the next
  // spawn fires shortly after mount instead of restarting a fresh 5–10 min
  // cycle from zero. Cap state is read via a ref so flipping the cap
  // doesn't tear down an active despawn timer mid-flight.
  useEffect(() => {
    let cancelled = false;
    // 5–10 minutes between attempts.
    const SPAWN_MIN_MS = 5 * 60 * 1000;
    const SPAWN_RANGE_MS = 5 * 60 * 1000;
    const computeNextDelay = () => SPAWN_MIN_MS + Math.random() * SPAWN_RANGE_MS;

    // Per-user key so two accounts on the same device don't share timers.
    const tid = state.telegramId;
    const storageKey = tid ? `stardust_next_attempt_${tid}` : null;

    // Server-time clock that's IMMUNE to the user changing their phone clock.
    // We pin the server epoch once at boot and then advance it locally with
    // performance.now(), which is monotonic — it doesn't jump when the device
    // clock is moved forward, so persisting `nextAttempt` in server-time units
    // means an attacker can no longer fast-forward the spawn just by editing
    // the system date. Until the first /time response lands we fall back to
    // Date.now() and the persistence window stays disabled (see below) so we
    // don't trust the local clock to interpret a saved timestamp.
    let serverEpochAtBoot: number | null = null;
    let monoAtBoot: number | null = null;
    const serverNow = (): number => {
      if (serverEpochAtBoot == null || monoAtBoot == null) return Date.now();
      return serverEpochAtBoot + (performance.now() - monoAtBoot);
    };
    const haveServerClock = () => serverEpochAtBoot != null && monoAtBoot != null;

    const persistNextAt = (delayMs: number) => {
      // Only persist once we have a trusted server clock; otherwise the saved
      // value would be in local-clock units and could be exploited.
      if (!storageKey || !haveServerClock()) return;
      try { localStorage.setItem(storageKey, String(serverNow() + delayMs)); } catch {}
    };
    const loadNextAt = (): number | null => {
      if (!storageKey) return null;
      try {
        const v = localStorage.getItem(storageKey);
        if (!v) return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      } catch { return null; }
    };

    const performAttempt = () => {
      if (cancelled) return;
      if (Math.random() < 0.5 && !stardustCapReachedRef.current) {
        const id = ++stardustIdRef.current;
        // Position in viewport %, kept inside safe margins so the star
        // never lands under the header / nav bar.
        const x = 12 + Math.random() * 76;
        const y = 22 + Math.random() * 50;
        setSpawnedStar({ id, x, y });
        if (stardustDespawnTimerRef.current) clearTimeout(stardustDespawnTimerRef.current);
        stardustDespawnTimerRef.current = setTimeout(() => {
          setSpawnedStar((curr) => (curr && curr.id === id ? null : curr));
          stardustDespawnTimerRef.current = null;
        }, 7000);
      }
      scheduleNext();
    };

    const scheduleNext = () => {
      if (cancelled) return;
      const delay = computeNextDelay();
      persistNextAt(delay);
      stardustSpawnTimerRef.current = setTimeout(performAttempt, delay);
    };

    // Boot the schedule. We always fetch the server clock first so any
    // persisted "next attempt" timestamp is interpreted with a clock the user
    // can't manipulate. If /time is unreachable we degrade to a fresh
    // schedule (no persistence honored) rather than trusting the local clock.
    const boot = async () => {
      const t0 = performance.now();
      let serverTs: number | null = null;
      try { serverTs = await fetchServerTime(); } catch { serverTs = null; }
      if (cancelled) return;
      if (serverTs != null) {
        // Rough RTT correction: assume the server's "now" sits at request
        // midpoint; over WAN this still keeps us within sub-second accuracy.
        const t1 = performance.now();
        serverEpochAtBoot = serverTs + (t1 - t0) / 2;
        monoAtBoot = t1;
      }

      const persistedNextAt = loadNextAt();
      if (persistedNextAt == null || !haveServerClock()) {
        // No saved schedule, or no trusted clock to interpret it with —
        // start a fresh window so we never honour a tampered timestamp.
        scheduleNext();
        return;
      }
      const remaining = persistedNextAt - serverNow();
      // Clamp: anything obviously corrupt (huge negative or larger than the
      // legal max delay + a safety margin) is treated as "fire soon" so the
      // user isn't locked out, but never instant.
      const MAX_LEGAL_REMAINING = SPAWN_MIN_MS + SPAWN_RANGE_MS + 60_000;
      if (remaining <= 0 || remaining > MAX_LEGAL_REMAINING) {
        // The window passed (or the saved value is corrupt) — fire shortly
        // after load so the spawn doesn't appear on top of the splash.
        stardustSpawnTimerRef.current = setTimeout(performAttempt, 1500);
      } else {
        stardustSpawnTimerRef.current = setTimeout(performAttempt, remaining);
      }
    };
    void boot();

    return () => {
      cancelled = true;
      if (stardustSpawnTimerRef.current) { clearTimeout(stardustSpawnTimerRef.current); stardustSpawnTimerRef.current = null; }
      if (stardustDespawnTimerRef.current) { clearTimeout(stardustDespawnTimerRef.current); stardustDespawnTimerRef.current = null; }
      if (stardustBurstTimerRef.current) { clearTimeout(stardustBurstTimerRef.current); stardustBurstTimerRef.current = null; }
      if (stardustToastTimerRef.current) { clearTimeout(stardustToastTimerRef.current); stardustToastTimerRef.current = null; }
      // Clear any visible star so account-switch / re-mount doesn't leave
      // a "ghost" that can never be despawned by the new effect instance.
      setSpawnedStar(null);
    };
  }, [state.telegramId]);

  const showStardustToast = (text: string, ms = 2200) => {
    setStardustToast(text);
    if (stardustToastTimerRef.current) clearTimeout(stardustToastTimerRef.current);
    stardustToastTimerRef.current = setTimeout(() => setStardustToast(null), ms);
  };

  const handleStardustStarClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const star = spawnedStar;
    if (!star) return;

    // Outside the LAB: don't despawn — just hint and let the user navigate.
    if (tab !== "lab") {
      showStardustToast("Go to the LAB to harvest!");
      return;
    }

    if (stardustInFlightRef.current) return;
    setSpawnedStar(null);
    if (stardustDespawnTimerRef.current) { clearTimeout(stardustDespawnTimerRef.current); stardustDespawnTimerRef.current = null; }

    if ((state.sunCount || 0) <= 0) {
      setNoSunPopup(true);
      return;
    }
    stardustInFlightRef.current = true;

    // Optimistic golden burst at the star's position.
    const burstId = ++stardustIdRef.current;
    setStardustBurst({ id: burstId, x: star.x, y: star.y });
    if (stardustBurstTimerRef.current) clearTimeout(stardustBurstTimerRef.current);
    stardustBurstTimerRef.current = setTimeout(() => {
      setStardustBurst((curr) => (curr && curr.id === burstId ? null : curr));
      stardustBurstTimerRef.current = null;
    }, 1200);

    try {
      const res = await stardust.collect();
      if (res.ok) {
        showStardustToast("✦ +1 STARDUST", 1600);
      } else if (res.reason === "DAILY_CAP") {
        showStardustToast("Daily Stardust limit reached.");
      } else if (res.reason === "NO_SUN") {
        setNoSunPopup(true);
      }
    } finally {
      stardustInFlightRef.current = false;
    }
  };

  if (showMaintenance) {
    return (
      <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
        <MaintenanceScreen message={maintenance.message} />
      </TonConnectUIProvider>
    );
  }

  // First-ever visit (no cached status yet): hide the Lab behind a neutral
  // splash until the maintenance check resolves, so users never see a flash
  // of game UI before the lock screen appears.
  if (showSplash) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "#060810",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.35)", fontWeight: 800, letterSpacing: "0.2em", fontSize: 12,
      }}>
        ZOOM
      </div>
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
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 relative z-20"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div
          className="font-black text-lg tracking-widest neon-text cursor-pointer flex-shrink-0"
          onClick={() => switchTab("lab")}
        >
          ZOOM
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className="glass-neon flex items-center gap-1 px-2.5 py-1.5 rounded-full font-black cursor-pointer active:scale-95 flex-shrink-0"
            data-testid="balance-display"
            aria-label="ZOOM balance — open history"
            role="button"
            tabIndex={0}
            onClick={() => setHistoryOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setHistoryOpen(true);
              }
            }}
            style={{ fontSize: 12 }}
          >
            <span style={{ fontSize: 12 }}>🪐</span>
            <span className="neon-text" style={{ fontVariantNumeric: "tabular-nums" }}>
              {(() => {
                const n = Math.floor(state.balance);
                if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
                if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "M";
                if (n >= 10_000)        return (n / 1_000).toFixed(1) + "K";
                return n.toLocaleString();
              })()}
            </span>
          </div>
          <TonWalletWidget
            tonBalance={state.tonBalance || 0}
            depositBalance={state.depositBalance || 0}
            telegramId={state.telegramId || null}
            whiteCollectionUnlocked={!!state.whiteCollectionUnlocked}
            earthCollectionUnlocked={!!state.earthCollectionUnlocked}
            blackCollectionUnlocked={!!state.blackCollectionUnlocked}
            sunCount={state.sunCount || 0}
            whitePlanets={state.whitePlanets || []}
            earthPlanets={state.earthPlanets || []}
            blackPlanets={state.blackPlanets || []}
          />
          <button
            onClick={() => switchTab("shop")}
            data-testid="button-shop-nav"
            aria-label="Open shop"
            className="flex flex-col items-center justify-center gap-0.5 active:scale-95 flex-shrink-0"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg, rgba(196,113,237,0.18), rgba(0,242,254,0.10))",
              border: "1px solid rgba(196,113,237,0.55)",
              boxShadow: "0 0 14px rgba(196,113,237,0.35), inset 0 0 8px rgba(0,242,254,0.10)",
              cursor: "pointer",
              padding: 0,
              transition: "transform 0.12s",
            }}
          >
            <svg width={16} height={16} viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ filter: "drop-shadow(0 0 4px rgba(196,113,237,0.8))" }}>
              <rect x="5" y="2" width="1" height="3" fill="#c471ed" />
              <rect x="10" y="2" width="1" height="3" fill="#c471ed" />
              <rect x="6" y="1" width="4" height="1" fill="#c471ed" />
              <rect x="3" y="5" width="10" height="1" fill="#00f2fe" />
              <rect x="3" y="6" width="1" height="8" fill="#00f2fe" />
              <rect x="12" y="6" width="1" height="8" fill="#00f2fe" />
              <rect x="3" y="13" width="10" height="1" fill="#00f2fe" />
              <rect x="4" y="6" width="8" height="7" fill="rgba(196,113,237,0.18)" />
              <rect x="6" y="8" width="1" height="1" fill="#fff" />
              <rect x="9" y="8" width="1" height="1" fill="#fff" />
              <rect x="6" y="10" width="4" height="1" fill="#fff" />
            </svg>
            <span style={{
              fontSize: 6,
              fontWeight: 900,
              letterSpacing: 0.8,
              color: "#c471ed",
              textShadow: "0 0 4px rgba(196,113,237,0.7)",
              lineHeight: 1,
            }}>SHOP</span>
          </button>
          <div
            className="flex items-center gap-0.5 px-2 py-1.5 rounded-full font-black cursor-pointer flex-shrink-0"
            onClick={() => setStardustPopupOpen(true)}
            data-testid="stardust-display"
            style={{
              background: "rgba(255, 215, 64, 0.10)",
              border: "1px solid rgba(255, 215, 64, 0.35)",
              boxShadow: "0 0 12px rgba(255, 215, 64, 0.18) inset",
              color: "#ffd740",
              textShadow: "0 0 8px rgba(255, 215, 64, 0.55)",
              fontSize: 12,
            }}
            aria-label="Stardust balance"
          >
            <span style={{ fontSize: 12, lineHeight: 1 }}>★</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {(() => {
                const n = stardust.balance;
                if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
                if (n >= 10_000)    return (n / 1_000).toFixed(1) + "K";
                return n.toLocaleString();
              })()}
            </span>
          </div>
          <SettingsMenu muted={muted} setMuted={setMuted} />
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
                  earthCollectionUnlocked={!!state.earthCollectionUnlocked}
                  earthCollectionBundles={Number(state.earthCollectionBundles) || 0}
                  earthPlanets={state.earthPlanets || []}
                  sunCount={state.sunCount || 0}
                  tonBalance={state.tonBalance || 0}
                  telegramId={state.telegramId}
                  onCraft={craft}
                  onClaim={claimCraft}
                  onPlaceWhitePlanet={placeWhitePlanet}
                  onCollectWhitePlanet={collectWhitePlanet}
                  onReactivateWhitePlanet={reactivateWhitePlanet}
                  onMarkWhitePlanetReactivated={markWhitePlanetReactivated}
                  onPlaceEarthPlanet={placeEarthPlanet}
                  onCollectEarthPlanet={collectEarthPlanet}
                  onReactivateEarthPlanet={reactivateEarthPlanet}
                  onMarkEarthPlanetReactivated={markEarthPlanetReactivated}
                  blackCollectionUnlocked={!!state.blackCollectionUnlocked}
                  blackCollectionBundles={Number(state.blackCollectionBundles) || 0}
                  blackPlanets={state.blackPlanets || []}
                  onPlaceBlackPlanet={placeBlackPlanet}
                  onCollectBlackPlanet={collectBlackPlanet}
                  onReactivateBlackPlanet={reactivateBlackPlanet}
                  onMarkBlackPlanetReactivated={markBlackPlanetReactivated}
                  visible={tab === "lab"}
                  merchantActive={merchant.active}
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
                  telegramId={state.telegramId}
                  onCollect={collectPlanet}
                  onBurn={burnPlanet}
                  onStartFarming={startFarming}
                  onStopFarming={stopFarming}
                  onStartSunFarming={startSunFarming}
                  onStopSunFarming={stopSunFarming}
                  onBurnSun={burnSun}
                  onSell={listPlanet}
                  onUnlist={unlistPlanet}
                  onRename={(planetId, displayName, _newStardustBalance) => {
                    // Patch the planet in local state — the debounced
                    // /regular-planets/save will mirror it to the server.
                    renamePlanetLocal(planetId, displayName);
                    // Pull the fresh stardust balance from the server so
                    // the top-bar counter immediately shows the post-debit
                    // value (the rename endpoint also returned the new
                    // balance, but a refresh keeps everything in lockstep
                    // with any other stardust spend that may have raced).
                    void _newStardustBalance;
                    void stardust.refresh();
                  }}
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
                <ShopPage balance={state.balance} depositBalance={state.depositBalance || 0} hasSun={!!state.sun?.isOwned} telegramId={state.telegramId} />
              )}
              {t === "wheel" && (
                <WheelPage telegramId={state.telegramId} />
              )}
              {t === "home" && (
                <HomePage telegramId={state.telegramId} referralCode={state.referralCode} visible={tab === "home"} />
              )}
            </div>
          );
        })}
      </main>

      {/* ─── Stardust floating star — visible across every screen.
          Click only collects when on the LAB tab; elsewhere it shows
          a hint pointing the user to the LAB. ─── */}
      {spawnedStar && (
        <button
          type="button"
          onClick={handleStardustStarClick}
          data-testid="stardust-spawn"
          aria-label={tab === "lab" ? "Collect stardust" : "Go to LAB to harvest stardust"}
          title={tab === "lab" ? "Collect stardust" : "Go to LAB to harvest stardust"}
          className="stardust-spawn-pop"
          style={{
            position: "fixed",
            left: `${spawnedStar.x}vw`,
            top: `${spawnedStar.y}vh`,
            transform: "translate(-50%, -50%)",
            zIndex: 200,
            width: 56,
            height: 56,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 38,
            lineHeight: 1,
            color: "#ffd740",
            textShadow: "0 0 18px rgba(255,215,64,0.9), 0 0 36px rgba(255,179,71,0.6)",
          }}
        >
          ★
        </button>
      )}

      {/* Golden particle burst on successful collect (LAB-only). */}
      {stardustBurst && (
        <div
          key={stardustBurst.id}
          className="pointer-events-none"
          style={{
            position: "fixed",
            left: `${stardustBurst.x}vw`,
            top: `${stardustBurst.y}vh`,
            transform: "translate(-50%, -50%)",
            zIndex: 205,
            width: 0,
            height: 0,
          }}
        >
          {Array.from({ length: 10 }).map((_, i) => {
            const angle = (Math.PI * 2 * i) / 10;
            const dx = Math.cos(angle) * 60;
            const dy = Math.sin(angle) * 60;
            return (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, #fff7c2 0%, #ffd740 50%, rgba(255,179,71,0) 80%)",
                  boxShadow: "0 0 10px rgba(255,215,64,0.95)",
                  transform: "translate(-50%, -50%)",
                  animation: `stardustBurst-${i} 1.1s ease-out forwards`,
                  // @ts-ignore — CSS custom props
                  "--dx": `${dx}px`,
                  "--dy": `${dy}px`,
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      )}

      {/* Toast — also used for "Go to LAB" hint when clicking off-LAB. */}
      {stardustToast && (
        <div
          className="pointer-events-none"
          style={{
            position: "fixed",
            left: "50%",
            top: 100,
            transform: "translateX(-50%)",
            zIndex: 210,
            background: "rgba(20, 18, 6, 0.92)",
            border: "1px solid rgba(255, 215, 64, 0.45)",
            color: "#ffd740",
            padding: "8px 14px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            boxShadow: "0 0 18px rgba(255,215,64,0.25)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            textShadow: "0 0 6px rgba(255,215,64,0.4)",
          }}
        >
          {stardustToast}
        </div>
      )}

      {/* No-SUN modal — only reachable when clicking inside the LAB. */}
      {noSunPopup && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(6,8,16,0.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setNoSunPopup(false)}
        >
          <div
            className="glass rounded-2xl px-6 py-5 text-center"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(86vw, 320px)",
              border: "1.5px solid rgba(255, 179, 71, 0.55)",
              boxShadow: "0 0 28px rgba(255, 179, 71, 0.35)",
            }}
          >
            <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 8 }}>☀</div>
            <div className="font-black tracking-wide" style={{ fontSize: 14, color: "#ffb347", letterSpacing: "0.06em" }}>
              SUN PROTECTION REQUIRED
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", marginTop: 8, fontWeight: 500, lineHeight: 1.45 }}>
              The star's heat is too strong! You need the SUN's protection to harvest it.
            </div>
            <button
              type="button"
              onClick={() => setNoSunPopup(false)}
              style={{
                marginTop: 14,
                padding: "8px 18px",
                borderRadius: 10,
                background: "rgba(255, 179, 71, 0.18)",
                border: "1px solid rgba(255, 179, 71, 0.5)",
                color: "#ffd089",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.06em",
                cursor: "pointer",
              }}
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {state.telegramId && <AdminPanel telegramId={state.telegramId} />}

      {historyOpen && state.telegramId && (
        <HistoryModal telegramId={state.telegramId} onClose={() => setHistoryOpen(false)} />
      )}

      {/* Space Merchant overlay — gated to LAB so the popup can't ambush
          users who are mid-trade in MARKET or mid-tap in another tab. The
          radar LED on LAB tells them the merchant is waiting if they're
          elsewhere; the popup itself only appears when they actually open
          the lab. */}
      {merchant.active && tab === "lab" && (
        <MerchantPopup
          expiresAt={merchant.expiresAt}
          fusionsUsed={merchant.fusionsUsed}
          maxFusions={merchant.maxFusions}
          basicCount={basicCount}
          rareCount={rareCount}
          epicCount={epicCount}
          onFuse={merchant.fuse}
          burnTwoOfType={burnTwoOfType}
          addCraftedPlanet={addCraftedPlanet}
          onClose={merchant.dismissLocally}
        />
      )}

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
      {globalToast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-black tracking-widest"
          style={{
            top: 70,
            zIndex: 9999,
            background: globalToast.ok ? "rgba(0,230,118,0.15)" : "rgba(255,65,108,0.15)",
            border: `1px solid ${globalToast.ok ? "rgba(0,230,118,0.3)" : "rgba(255,65,108,0.3)"}`,
            color: globalToast.ok ? "#00e676" : "#ff416c",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          {globalToast.text}
        </div>
      )}
      {stardustPopupOpen && (
        <StardustInfoPopup
          balance={stardust.balance}
          today={stardust.today}
          dailyCap={stardust.dailyCap}
          globalTotal={stardust.globalTotal}
          onClose={() => setStardustPopupOpen(false)}
        />
      )}
    </div>
    </TonConnectUIProvider>
  );
}

function StardustInfoPopup({ balance, today, dailyCap, globalTotal, onClose }: {
  balance: number;
  today: number;
  dailyCap: number;
  globalTotal: number;
  onClose: () => void;
}) {
  // Top 10 stardust holders. Loaded once when the popup opens. We keep the
  // initial state as `null` (vs `[]`) so we can distinguish "still loading"
  // from "loaded but empty" and show the right placeholder text.
  const [leaderboard, setLeaderboard] = useState<StardustLeaderboardEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchStardustLeaderboard().then((entries) => {
      if (!cancelled) setLeaderboard(entries);
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(6,8,16,0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 360, width: "100%",
          background: "linear-gradient(160deg, rgba(36,28,8,0.96) 0%, rgba(14,12,18,0.96) 100%)",
          border: "1px solid rgba(255, 215, 64, 0.40)",
          boxShadow: "0 0 40px rgba(255, 215, 64, 0.25), 0 12px 40px rgba(0,0,0,0.55)",
          borderRadius: 20,
          padding: "26px 22px 20px",
          textAlign: "center",
          color: "#fff",
          position: "relative",
        }}
      >
        <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 6, color: "#ffd740", textShadow: "0 0 22px rgba(255,215,64,0.85)" }}>★</div>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.22em", color: "#ffd740" }}>STARDUST</div>
        <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.78)", fontStyle: "italic" }}>
          "Residual stellar energy. Its purpose will be revealed when the sky darkens...!"
        </div>
        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div style={{ background: "rgba(255,215,64,0.07)", border: "1px solid rgba(255,215,64,0.20)", borderRadius: 12, padding: "10px 6px" }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,215,64,0.7)" }}>YOUR BALANCE</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#ffd740" }}>{balance.toLocaleString()}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "10px 6px" }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}>TODAY</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#fff" }}>
              {today}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>/{dailyCap}</span>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            padding: "10px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}>GLOBAL COLLECTED</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#ffd740", textShadow: "0 0 8px rgba(255,215,64,0.5)" }}>★ {globalTotal.toLocaleString()}</span>
        </div>
        {/* Top 10 stardust leaderboard. Lives inside the popup so the user can
            see who's collecting the most stardust without leaving the screen. */}
        <div
          style={{
            marginTop: 14,
            background: "rgba(255,215,64,0.05)",
            border: "1px solid rgba(255,215,64,0.18)",
            borderRadius: 12,
            padding: "10px 10px 6px",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,215,64,0.75)", textAlign: "center", marginBottom: 8 }}>
            TOP 10 STARDUST
          </div>
          {leaderboard === null && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", padding: "8px 0" }}>
              Loading...
            </div>
          )}
          {leaderboard !== null && leaderboard.length === 0 && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", padding: "8px 0" }}>
              No collectors yet. Be the first!
            </div>
          )}
          {leaderboard !== null && leaderboard.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
              {leaderboard.map((entry, i) => (
                <div
                  key={`${entry.name}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 6px",
                    borderRadius: 8,
                    background: i < 3 ? "rgba(255,215,64,0.08)" : "transparent",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 900,
                        color: i === 0 ? "#ffd740" : i === 1 ? "#cfd6e6" : i === 2 ? "#d49a5a" : "rgba(255,255,255,0.55)",
                        minWidth: 18,
                      }}
                    >
                      #{i + 1}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.85)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.name}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#ffd740", marginLeft: 8 }}>
                    ★ {entry.balance.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 18,
            width: "100%",
            background: "linear-gradient(135deg, rgba(255,215,64,0.85), rgba(255,179,71,0.85))",
            color: "#1a1208",
            border: "none",
            borderRadius: 12,
            padding: "10px 0",
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: "0.18em",
            cursor: "pointer",
            boxShadow: "0 0 18px rgba(255,215,64,0.45)",
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
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
