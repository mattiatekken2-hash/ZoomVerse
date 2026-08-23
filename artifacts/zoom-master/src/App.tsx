import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { BlackPlanetOrbStyles } from "./components/BlackPlanetOrb";
import { useGameState, isFarmActive, isSunActive, SUN_CONFIG } from "./hooks/useGameState";
import { fetchRegularPlanets, saveRegularPlanets, prefetchTasksState } from "./utils/api";
import { useGlobalInit } from "./store/globalStore";
import { NebulaBackground } from "./components/NebulaBackground";
import { LabSpaceBackground } from "./components/LabSpaceBackground";
import { MaintenanceScreen } from "./components/MaintenanceScreen";
import { LabPage } from "./pages/LabPage";
import { VoxelStudioPage } from "./pages/VoxelStudioPage";
import { FarmPage } from "./pages/FarmPage";
import { MarketPage } from "./pages/MarketPage";
import { EarnPage } from "./pages/EarnPage";
import { RankPage } from "./pages/RankPage";
import { ShopPage } from "./pages/ShopPage";
import { HomePage } from "./pages/HomePage";
import { AdminPanel } from "./components/AdminPanel";
import { LanguageProvider, useT } from "./i18n/LanguageContext";
import HistoryModal from "./components/HistoryModal";
import { fetchMaintenanceStatus, fetchServerTime, fetchStardustLeaderboard, type StardustLeaderboardEntry } from "./utils/api";
import { useStardust } from "./hooks/useStardust";
import { Sprout, ShoppingCart, Trophy, Wallet, type LucideIcon } from "lucide-react";
import { GramDiamondIcon } from "./components/GramDiamondIcon";
import { ZoomCubeIcon } from "./components/ZoomCubeIcon";
import { WalletPage } from "./pages/WalletPage";
import { hideHtmlSplash } from "./components/SplashScreen";
import { SPLASH_MS } from "./utils/bootSplash";
import { fetchTonPrice } from "./utils/tonPrice";
import { prefetchShopData } from "./utils/shopPrefetch";
import { prefetchWalletMarket } from "./utils/walletMarketCache";
import { prefetchCombo } from "./utils/comboCache";
import { initVersionCheck } from "./utils/appVersion";

const MAINTENANCE_ADMIN_IDS = ["8144744644", "@zoom0100", "zoom0100"];

function isMaintenanceAdmin(telegramId: string | null | undefined): boolean {
  if (!telegramId) return false;
  const normalized = telegramId.trim().toLowerCase();
  return MAINTENANCE_ADMIN_IDS.some((value) => value.toLowerCase() === normalized);
}

type MaintSnapshot = { enabled: boolean; message: string; updatedAt?: number };

function readMaintCache(): MaintSnapshot | null {
  try {
    const raw = localStorage.getItem("zoom-maint-cached");
    if (!raw) return null;
    const c = JSON.parse(raw) as MaintSnapshot;
    return { enabled: !!c.enabled, message: c.message || "", updatedAt: c.updatedAt };
  } catch { return null; }
}

const MANIFEST_URL = `${window.location.origin}/tonconnect-manifest.json`;

type Tab = "lab" | "home" | "farm" | "market" | "earn" | "rank" | "shop" | "wallet";

const NAV: { id: Tab; labelKey: string; icon: LucideIcon | "zoom-cube" | "gram-diamond" }[] = [
  { id: "lab", labelKey: "nav.lab", icon: "zoom-cube" },
  { id: "farm", labelKey: "nav.farm", icon: Sprout },
  { id: "market", labelKey: "nav.market", icon: ShoppingCart },
  { id: "earn", labelKey: "nav.earn", icon: "gram-diamond" },
  { id: "rank", labelKey: "nav.rank", icon: Trophy },
  { id: "wallet", labelKey: "nav.wallet", icon: Wallet },
];

const ALL_TABS: Tab[] = ["lab", "farm", "market", "earn", "rank", "shop", "wallet"];
/** Tabs that share the Lab void + stars (no grid). */
const LAB_SPACE_TABS: Tab[] = ["farm", "market", "earn", "rank", "wallet"];

function splashElapsedDone(): boolean {
  try {
    if ((window as unknown as { __zoomSplashFinished?: boolean }).__zoomSplashFinished) return true;
  } catch { /**/ }
  if (!document.getElementById("splash-screen")) return true;
  try {
    const start = (window as unknown as { __zoomSplashStart?: number }).__zoomSplashStart;
    if (typeof start === "number") return performance.now() - start >= SPLASH_MS;
  } catch { /**/ }
  return false;
}

/** Hold Lab/WebGL until the HTML splash has covered the first 2s — WebGL on iOS draws above overlays. */
function BootSplashGate() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      setReady(true);
      requestAnimationFrame(() => hideHtmlSplash());
    };

    if (splashElapsedDone()) {
      release();
      return;
    }

    const start =
      (window as unknown as { __zoomSplashStart?: number }).__zoomSplashStart ??
      performance.now();
    const remaining = Math.max(0, SPLASH_MS - (performance.now() - start));
    const timeoutId = window.setTimeout(release, remaining);
    const pollId = window.setInterval(() => {
      if (splashElapsedDone()) release();
    }, 50);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
    };
  }, []);

  if (!ready) return null;
  return (
    <>
      <BlackPlanetOrbStyles />
      <AppShellWithState />
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <BootSplashGate />
    </LanguageProvider>
  );
}

function AppShellWithState() {
  const [tab, setTab] = useState<Tab>("lab");
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioSeedTitle, setStudioSeedTitle] = useState<string | null>(null);
  const [studioSeedProjectId, setStudioSeedProjectId] = useState<string | null>(null);
  const { t } = useT();

  // Deep-link focus (Feature 2 — Planet Sharing). When the mini app is opened
  // via a `mkt_<listingId>` start_param, jump straight to the Market tab and
  // pass the listing's server id down so MarketPage scrolls to + highlights it.
  const [marketFocusId, setMarketFocusId] = useState<number | null>(null);
  const [marketRevealKey, setMarketRevealKey] = useState(0);
  useEffect(() => {
    try {
      let sp = (window as unknown as {
        Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
      }).Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
      if (!sp) { try { sp = localStorage.getItem("n"); } catch { sp = null; } }
      if (sp && /^mkt_\d+$/.test(sp)) {
        const id = parseInt(sp.slice(4), 10);
        if (Number.isFinite(id)) {
          setMarketFocusId(id);
          setTab("market");
        }
      }
    } catch { /* noop */ }
  }, []);

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
    state, setState, craft, beginLabForge, skipForge, claimCraft, redeemCode,
    pvpAddPlanet, pvpRemovePlanet,
    collectPlanet, burnPlanet,
    startFarming, stopFarming, repairPlanet, upgradePlanetFarmDuration, upgradeSunFarmDuration, upgradeCollectionFarmDuration,
    listPlanet, unlistPlanet, buyPlanet, serverBuyComplete,
    claimDaily, startSunFarming, stopSunFarming, burnSun, unlockSlot,
    placeWhitePlanet, reactivateWhitePlanet, markWhitePlanetReactivated, collectWhitePlanet,
    placeEarthPlanet, reactivateEarthPlanet, markEarthPlanetReactivated, collectEarthPlanet,
    placeBlackPlanet, reactivateBlackPlanet, markBlackPlanetReactivated, collectBlackPlanet,
    placeSupernovaPlanet, reactivateSupernovaPlanet, markSupernovaPlanetReactivated, collectSupernovaPlanet,
    placeStellaRossaPlanet, reactivateStellaRossaPlanet, markStellaRossaPlanetReactivated, collectStellaRossaPlanet,
    activateEquipment, reactivateEquipment, burnEquipment, listEquipment, unlistEquipment, buyEquipmentFromMarket,
    items, listItem, unlistItem, buyItemFromMarket,
  } = useGameState();

  // Centralized global data fetch — Season epoch, leaderboard, profile, daily, market.
  // Pages read from the global store so tab switches show pre-loaded data with no pop-in.
  useGlobalInit(state.telegramId);

  // Stardust — second currency. Server-authoritative; the SUN gate and the
  // 25/day cap are enforced inside the API.
  const stardust = useStardust(state.telegramId);
  const [stardustPopupOpen, setStardustPopupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resourceWidgetOpen, setResourceWidgetOpen] = useState(false);

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

  // One-shot init + periodic up-sync: when the server-side stardust state
  // first arrives, seed the local GameState if it still holds the default 0.
  // Afterwards, only snap UPWARD (server grants, admin credits) — never
  // overwrite downwards, because local crafts deduct immediately.
  const stardustInitDoneRef = useRef(false);
  useEffect(() => {
    if (!stardust.ready) return;
    setState((prev) => {
      // First time ever: adopt server value unconditionally.
      if (!stardustInitDoneRef.current) {
        stardustInitDoneRef.current = true;
        if (prev.stardustBalance === 0 && stardust.balance > 0) {
          return { ...prev, stardustBalance: stardust.balance };
        }
        return prev;
      }
      // Subsequent syncs: adopt server when not mid-forge (craft deducts locally).
      const forging = prev.forgePlanetBuild || prev.labForgePath || prev.pendingPlanet;
      if (!forging && stardust.balance !== prev.stardustBalance) {
        return { ...prev, stardustBalance: stardust.balance };
      }
      if (forging && stardust.balance > prev.stardustBalance) {
        return { ...prev, stardustBalance: stardust.balance };
      }
      return prev;
    });
  }, [stardust.ready, stardust.balance]);

  // ───── HMR-safe admin self-credit/debit listener ───────────────
  // The mount-once listener inside useGameState.ts (dependency []) can
  // get stuck with an old closure after hot reload. We handle stardust
  // and ton admin self-actions here so they always reflect immediately.
  useEffect(() => {
    const onInc = (e: Event) => {
      const d = (e as CustomEvent<{ type: string; amount: number }>).detail;
      if (!d || !d.type) return;
      const n = Math.max(0, Math.floor(d.amount || 0));
      if (d.type === "stardust") {
        setState((prev) => ({ ...prev, stardustBalance: (prev.stardustBalance || 0) + n }));
        void stardust.refresh();
      }
      if (d.type === "ton") {
        setState((prev) => ({ ...prev, tonBalance: (prev.tonBalance || 0) + n }));
      }
    };
    const onDec = (e: Event) => {
      const d = (e as CustomEvent<{ type: string; amount: number }>).detail;
      if (!d || !d.type) return;
      const n = Math.max(0, Math.floor(d.amount || 0));
      if (d.type === "stardust") {
        setState((prev) => ({ ...prev, stardustBalance: Math.max(0, (prev.stardustBalance || 0) - n) }));
        void stardust.refresh();
      }
      if (d.type === "ton") {
        setState((prev) => ({ ...prev, tonBalance: Math.max(0, (prev.tonBalance || 0) - n) }));
      }
    };
    const onStardustRefresh = () => { void stardust.refresh(); };
    const onPlanetsRefresh = () => {
      const tid = state.telegramId;
      if (tid) void fetchRegularPlanets(tid);
    };
    // PvP transfer: the server has already atomically moved the planet. We must
    // mirror it in the client-authoritative planets array immediately, before
    // the debounced /regular-planets/save fires — otherwise that save would undo
    // the server transfer (winner loses the prize / loser keeps their planet).
    const onPvpWon = (e: Event) => {
      const raw = (e as CustomEvent<{ id: string; name: string; rate?: number; float?: number | null }>).detail;
      if (raw && raw.id && raw.name) pvpAddPlanet(raw);
    };
    const onPvpLost = (e: Event) => {
      const id = (e as CustomEvent<{ planetId: string }>).detail?.planetId;
      if (id) pvpRemovePlanet(id);
    };
    window.addEventListener("zoom-admin-self-increment", onInc);
    window.addEventListener("zoom-admin-self-decrement", onDec);
    window.addEventListener("stardust-refresh", onStardustRefresh);
    window.addEventListener("planets-refresh", onPlanetsRefresh);
    window.addEventListener("pvp-planet-won", onPvpWon);
    window.addEventListener("pvp-planet-lost", onPvpLost);
    return () => {
      window.removeEventListener("zoom-admin-self-increment", onInc);
      window.removeEventListener("zoom-admin-self-decrement", onDec);
      window.removeEventListener("stardust-refresh", onStardustRefresh);
      window.removeEventListener("planets-refresh", onPlanetsRefresh);
      window.removeEventListener("pvp-planet-won", onPvpWon);
      window.removeEventListener("pvp-planet-lost", onPvpLost);
    };
  }, [stardust, pvpAddPlanet, pvpRemovePlanet]);

  // Maintenance mode: poll status, show fullscreen overlay for non-admins.
  // Cache is used ONLY when maintenance is ON (instant lock screen). A cached
  // "off" is never trusted — we always wait for a fresh server check before
  // showing the game, so users never flash the Lab and then get kicked out.
  const initialMaintCache = readMaintCache();
  const [maintenance, setMaintenance] = useState<MaintSnapshot>(() => {
    if (initialMaintCache?.enabled) {
      return { enabled: true, message: initialMaintCache.message };
    }
    return { enabled: false, message: "" };
  });
  useEffect(() => {
    let alive = true;
    let retryTimer: number | undefined;

    const finish = (next: MaintSnapshot) => {
      if (!alive) return;
      setMaintenance(next);
      try { localStorage.setItem("zoom-maint-cached", JSON.stringify(next)); } catch { /**/ }
    };

    const load = async () => {
      const s = await fetchMaintenanceStatus();
      if (!alive) return;
      if (!s) {
        finish({ enabled: false, message: "" });
        retryTimer = window.setTimeout(() => { void load(); }, 5000);
        return;
      }
      finish({ enabled: !!s.enabled, message: s.message || "", updatedAt: s.updatedAt });
    };

    void load();
    const id = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    const onAdmin = () => { void load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("zoom-admin-refresh", onAdmin);
    return () => {
      alive = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("zoom-admin-refresh", onAdmin);
    };
  }, []);
  const isAdmin = isMaintenanceAdmin(state.telegramId);
  const showMaintenance = maintenance.enabled && !isAdmin;

  useEffect(() => {
    void fetchTonPrice();
    void prefetchWalletMarket();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void prefetchWalletMarket();
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    initVersionCheck();
  }, []);

  useEffect(() => {
    if (!state.telegramId) return;
    void prefetchCombo(state.telegramId);
  }, [state.telegramId]);

  useEffect(() => {
    if (!state.telegramId) return;
    void prefetchShopData(state.telegramId);
    void prefetchWalletMarket();
    prefetchTasksState(state.telegramId);
  }, [state.telegramId]);

  // Pause CSS animations when backgrounded or when a non-Lab tab is active.
  useEffect(() => {
    const syncPause = () => {
      const pause = document.visibilityState === "hidden" || tab !== "lab";
      document.body.classList.toggle("animations-paused", pause);
    };
    syncPause();
    document.addEventListener("visibilitychange", syncPause);
    return () => document.removeEventListener("visibilitychange", syncPause);
  }, [tab]);

  const planetRate = state.planets.filter(isFarmActive).reduce((a, p) => a + p.rate, 0);
  const sunRate = state.sun && isSunActive(state.sun) ? SUN_CONFIG.rate * Math.max(1, state.sunCount || 1) : 0;
  const totalRate = planetRate + sunRate;
  /** Keep Lab WebGL + voxel mask alive while forging so tab return does not replay fly-in. */
  const keepLabForgeAlive = Boolean(
    state.labForgePath &&
    state.forgePlanetBuild &&
    !state.pendingPlanet &&
    !state.forgeRolling,
  );
  const visitedEarnRef = useRef(false);
  const visitedTabsRef = useRef<Set<Tab>>(new Set(["lab"]));
  const [tgSafeTop, setTgSafeTop] = useState(0);

  useEffect(() => {
    const readInset = () => {
      try {
        const tg = (window as unknown as {
          Telegram?: { WebApp?: {
            initData?: string;
            ready?: () => void;
            safeAreaInset?: { top?: number };
            contentSafeAreaInset?: { top?: number };
          } };
        }).Telegram?.WebApp;
        tg?.ready?.();
        const content = Number(tg?.contentSafeAreaInset?.top ?? 0);
        const safe = Number(tg?.safeAreaInset?.top ?? 0);
        const inTelegram = !!(tg?.initData);
        const extra = inTelegram ? Math.max(content, safe, 72) : Math.max(content, safe, 0);
        setTgSafeTop(extra);
        document.documentElement.style.setProperty("--tg-content-top", `${extra}px`);
      } catch { /**/ }
    };
    readInset();
    window.addEventListener("resize", readInset);
    return () => window.removeEventListener("resize", readInset);
  }, []);

  const switchTab = (nextTab: Tab) => {
    visitedTabsRef.current.add(nextTab);
    setTab(nextTab);
    window.dispatchEvent(new CustomEvent("zoom-tab-active", { detail: { tab: nextTab } }));
    if (nextTab === "wallet") return;
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

    // Spawn loop disabled per admin request — no random stardust stars.
    const performAttempt = () => {
      if (cancelled) return;
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
      showStardustToast(t("stardust.goToLab"));
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
        // Reflect the newly-collected stardust into GameState so the Lab
        // crafting cost check and the header counter stay in sync.
        setState((prev) => ({
          ...prev,
          stardustBalance: (prev.stardustBalance || 0) + 1,
        }));
        showStardustToast(t("stardust.collected"), 1600);
      } else if (res.reason === "DAILY_CAP") {
        showStardustToast(t("stardust.dailyCap"));
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

  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <div
        className="flex flex-col overflow-hidden relative"
        style={{
          height: "100dvh",
          background: "#000000",
          paddingTop: tab === "lab" ? 0 : `calc(env(safe-area-inset-top, 0px) + ${tgSafeTop}px)`,
          paddingBottom: tab === "lab" ? 0 : "env(safe-area-inset-bottom, 0px)",
        }}
      >
      {LAB_SPACE_TABS.includes(tab) && <LabSpaceBackground />}
      {!LAB_SPACE_TABS.includes(tab) && tab !== "lab" && <NebulaBackground />}
      {isAdmin && maintenance.enabled && (
        <div
          className="flex-shrink-0 text-center text-xs font-black tracking-widest py-1.5 relative z-30"
          style={{ background: "rgba(255,179,71,0.18)", color: "#ffb347", borderBottom: "1px solid rgba(255,179,71,0.4)" }}
        >
          🛠️ {t("maint.banner")}
        </div>
      )}

      <main className="flex-1 overflow-hidden relative z-10" style={{ minHeight: 0 }}>
        {ALL_TABS.map((t) => {
          const isActiveTab = tab === t;
          const isHiddenLabForge = t === "lab" && !isActiveTab && keepLabForgeAlive;
          // Keep Earn mounted after first open so forge → zoom-data-refresh still
          // updates the FORGED counter (unmounting made Earn look "stuck").
          const keepEarnAlive = t === "earn" && (isActiveTab || visitedEarnRef.current);
          if (t === "earn" && isActiveTab) visitedEarnRef.current = true;
          if (isActiveTab) visitedTabsRef.current.add(t);
          const keepVisited = t !== "shop" && visitedTabsRef.current.has(t);
          if (!isActiveTab && !isHiddenLabForge && !keepEarnAlive && !keepVisited) return null;
          return (
            <div
              key={t}
              style={{
                position: "absolute",
                inset: 0,
                display: isActiveTab ? "flex" : "none",
                flexDirection: "column",
                overflow: "hidden",
                zIndex: isActiveTab ? 2 : 0,
                pointerEvents: isActiveTab ? "auto" : "none",
              }}
            >
              {t === "lab" && (
                <LabPage
                  balance={state.balance}
                  taps={state.taps}
                  goal={state.goal}
                  pendingPlanet={state.pendingPlanet}
                  forgePlanetBuild={state.forgePlanetBuild}
                  forgeRolling={state.forgeRolling}
                  labForgeShapeId={state.labForgeShapeId}
                  labForgePath={state.labForgePath}
                  hasAutoTap={!!state.hasAutoTap}
                  stardustBalance={state.stardustBalance || 0}
                  telegramId={state.telegramId}
                  sunCount={state.sunCount ?? 0}
                  onCraft={craft}
                  onBeginLabForge={beginLabForge}
                  onClaim={claimCraft}
                  onOpenShop={() => switchTab("shop")}
                  onOpenStudio={(opts) => {
                    setStudioSeedTitle(opts?.title ?? null);
                    setStudioSeedProjectId(opts?.projectId ?? null);
                    setStudioOpen(true);
                  }}
                  muted={muted}
                  setMuted={setMuted}
                  visible={isActiveTab}
                />
              )}
              {t === "farm" && (
                <FarmPage
                  visible={tab === "farm"}
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
                  onSell={(id, price, currency) => {
                    listPlanet(id, price, currency);
                    setMarketRevealKey((n) => n + 1);
                    setTab("market");
                  }}
                  onUnlist={unlistPlanet}
                  onRepair={repairPlanet}
                  stardustBalance={stardust.balance}
                  tonBalance={state.tonBalance || 0}
                  depositBalance={state.depositBalance || 0}
                  onSlotUnlocked={unlockSlot}
                  onUpgradeDuration={upgradePlanetFarmDuration}
                  onUpgradeSunDuration={upgradeSunFarmDuration}
                  whiteCollectionUnlocked={!!state.whiteCollectionUnlocked}
                  whiteCollectionBundles={Number(state.whiteCollectionBundles) || 0}
                  whitePlanets={state.whitePlanets || []}
                  earthCollectionUnlocked={!!state.earthCollectionUnlocked}
                  earthCollectionBundles={Number(state.earthCollectionBundles) || 0}
                  earthPlanets={state.earthPlanets || []}
                  blackCollectionUnlocked={!!state.blackCollectionUnlocked}
                  blackCollectionBundles={Number(state.blackCollectionBundles) || 0}
                  blackPlanets={state.blackPlanets || []}
                  supernovaCollectionUnlocked={!!state.supernovaCollectionUnlocked}
                  supernovaCollectionBundles={Number(state.supernovaCollectionBundles) || 0}
                  supernovaPlanets={state.supernovaPlanets || []}
                  stellaRossaCollectionUnlocked={!!state.stellaRossaCollectionUnlocked}
                  stellaRossaCollectionBundles={Number(state.stellaRossaCollectionBundles) || 0}
                  stellaPlanets={state.stellaPlanets || []}
                  redStarBalance={state.redStarBalance || 0}
                  onRedStarBalanceUpdate={(newBal) => setState((prev) => ({ ...prev, redStarBalance: newBal }))}
                  onPlaceWhitePlanet={placeWhitePlanet}
                  onCollectWhitePlanet={collectWhitePlanet}
                  onReactivateWhitePlanet={reactivateWhitePlanet}
                  onMarkWhitePlanetReactivated={markWhitePlanetReactivated}
                  onPlaceEarthPlanet={placeEarthPlanet}
                  onCollectEarthPlanet={collectEarthPlanet}
                  onReactivateEarthPlanet={reactivateEarthPlanet}
                  onMarkEarthPlanetReactivated={markEarthPlanetReactivated}
                  onPlaceBlackPlanet={placeBlackPlanet}
                  onCollectBlackPlanet={collectBlackPlanet}
                  onReactivateBlackPlanet={reactivateBlackPlanet}
                  onMarkBlackPlanetReactivated={markBlackPlanetReactivated}
                  onPlaceSupernovaPlanet={placeSupernovaPlanet}
                  onCollectSupernovaPlanet={collectSupernovaPlanet}
                  onReactivateSupernovaPlanet={reactivateSupernovaPlanet}
                  onMarkSupernovaPlanetReactivated={markSupernovaPlanetReactivated}
                  onPlaceStellaRossaPlanet={placeStellaRossaPlanet}
                  onCollectStellaRossaPlanet={collectStellaRossaPlanet}
                  onMarkStellaRossaPlanetReactivated={markStellaRossaPlanetReactivated}
                  onUpgradeCollectionDuration={upgradeCollectionFarmDuration}
                  items={items}
                  onSellItem={listItem}
                  onUnlistItem={unlistItem}
                  onFlushPlanets={async () => {
                    // Flush planets to the server immediately so the PvP
                    // queue route can verify ownership in planets_json even
                    // for freshly-crafted planets whose debounced save
                    // hasn't fired yet (mirrors the listing flow).
                    if (!state.telegramId) return;
                    await saveRegularPlanets(
                      state.telegramId,
                      state.planets as unknown as Array<Record<string, unknown>>,
                      {
                        basic: state.claimedBonusBasic ?? 0,
                        rare: state.claimedBonusRare ?? 0,
                        epic: state.claimedBonusEpic ?? 0,
                        gold: state.claimedBonusGold ?? 0,
                        mythic: state.claimedBonusMythic ?? 0,
                        plasma: state.claimedBonusPlasma ?? 0,
                        v1: state.claimedBonusV1 ?? 0,
                        v1NftPlatinum: state.claimedBonusV1NftPlatinum ?? 0,
                      },
                      state.craftsCompleted ?? 0,
                    );
                  }}
                />
              )}
              {t === "market" && (
                <MarketPage
                  visible={tab === "market"}
                  depositBalance={state.depositBalance || 0}
                  earnedBalance={state.tonBalance || 0}
                  zoomBalance={state.balance}
                  stardustBalance={state.stardustBalance || 0}
                  myListings={state.planets}
                  maxSlots={state.maxSlots}
                  telegramId={state.telegramId}
                  onBuy={buyPlanet}
                  onUnlist={unlistPlanet}
                  onServerBuyComplete={serverBuyComplete}
                  onBuyEquipment={buyEquipmentFromMarket}
                  onUnlistEquipment={unlistEquipment}
                  onBuyItem={buyItemFromMarket}
                  onUnlistItem={unlistItem}
                  focusListingId={marketFocusId}
                  onFocusConsumed={() => setMarketFocusId(null)}
                  revealKey={marketRevealKey}
                />
              )}
              {t === "earn" && (
                <EarnPage
                  visible={isActiveTab}
                  referralCode={state.referralCode}
                  referralCount={state.referralCount}
                  lastDailyClaimAt={state.lastDailyClaimAt}
                  referralSpeedBonus={state.referralSpeedBonus}
                  referredBy={state.referredBy}
                  claimedMilestones={state.claimedMilestones}
                  craftsCompleted={state.craftsCompleted ?? 0}
                  onClaimDaily={claimDaily}
                  onRedeemCode={redeemCode}
                  telegramId={state.telegramId}
                  weeklyRedStarDay={state.weeklyRedStarDay ?? 1}
                  weeklyRedStarClaimedToday={state.weeklyRedStarClaimedToday ?? false}
                  onRedStarUpdate={(n) => setState((prev) => ({ ...prev, redStarBalance: n }))}
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
                  planets={state.planets}
                  visible={tab === "rank"}
                />
              )}
              {t === "shop" && (
                <ShopPage
                  balance={state.balance}
                  stardustBalance={state.stardustBalance || 0}
                  depositBalance={state.depositBalance || 0}
                  tonBalance={state.tonBalance || 0}
                  hasSun={!!state.sun?.isOwned}
                  telegramId={state.telegramId}
                  sunCount={state.sunCount || 0}
                  whiteCollectionUnlocked={!!state.whiteCollectionUnlocked}
                  whiteCollectionBundles={Number(state.whiteCollectionBundles) || 0}
                  earthCollectionUnlocked={!!state.earthCollectionUnlocked}
                  earthCollectionBundles={Number(state.earthCollectionBundles) || 0}
                  blackCollectionUnlocked={!!state.blackCollectionUnlocked}
                  blackCollectionBundles={Number(state.blackCollectionBundles) || 0}
                  supernovaCollectionUnlocked={!!state.supernovaCollectionUnlocked}
                  supernovaCollectionBundles={Number(state.supernovaCollectionBundles) || 0}
                  stellaRossaCollectionUnlocked={!!state.stellaRossaCollectionUnlocked}
                  stellaRossaCollectionBundles={Number(state.stellaRossaCollectionBundles) || 0}
                  stellaLastClaimAt={Number(state.lastStellaClaimAt) || 0}
                  onStellaClaimDaily={(newBal) => {
                    setState((prev) => ({ ...prev, redStarBalance: newBal, lastStellaClaimAt: Date.now() }));
                  }}
                />
              )}
              {t === "home" && (
                <HomePage telegramId={state.telegramId} referralCode={state.referralCode} visible={tab === "home"} />
              )}
              {t === "wallet" && (
                <WalletPage
                  visible={tab === "wallet"}
                  tonBalance={state.tonBalance || 0}
                  depositBalance={state.depositBalance || 0}
                  onOpenHistory={() => setHistoryOpen(true)}
                  telegramId={state.telegramId}
                  whiteCollectionUnlocked={!!state.whiteCollectionUnlocked}
                  earthCollectionUnlocked={!!state.earthCollectionUnlocked}
                  blackCollectionUnlocked={!!state.blackCollectionUnlocked}
                  supernovaCollectionUnlocked={!!state.supernovaCollectionUnlocked}
                  sunCount={state.sunCount || 0}
                  whitePlanets={state.whitePlanets || []}
                  earthPlanets={state.earthPlanets || []}
                  blackPlanets={state.blackPlanets || []}
                  supernovaPlanets={state.supernovaPlanets || []}
                  balance={state.balance || 0}
                  stardustBalance={state.stardustBalance || 0}
                  redStarBalance={state.redStarBalance || 0}
                  nftStarBalance={state.nftStarBalance || 0}
                />
              )}
            </div>
          );
        })}
      </main>

      {/* Stardust floating star removed per admin request. */}

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
            textShadow: "0 0 6px rgba(255,215,64,0.4)",
          }}
        >
          {stardustToast}
        </div>
      )}

      {/* No-SUN modal — only reachable when clicking inside the LAB. */}
      {noSunPopup && (
        <div
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
              {t("sun.requiredTitle")}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", marginTop: 8, fontWeight: 500, lineHeight: 1.45 }}>
              {t("sun.requiredBody")}
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
              {t("sun.gotIt")}
            </button>
          </div>
        </div>
      )}

      {state.telegramId && <AdminPanel telegramId={state.telegramId} />}

      {historyOpen && state.telegramId && (
        <HistoryModal telegramId={state.telegramId} onClose={() => setHistoryOpen(false)} />
      )}


      {!studioOpen && (
      <nav
        className="flex-shrink-0 relative z-20"
        style={tab === "lab" ? {
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          height: "calc(64px + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 50%, transparent 100%)",
          borderTop: "none",
          pointerEvents: "none",
        } : {
          height: 70,
          background: "rgba(8,1,9,0.92)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex h-full" style={tab === "lab" ? { pointerEvents: "auto" } : undefined}>
          {NAV.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
                onClick={() => switchTab(item.id)}
                data-testid={`nav-${item.id}`}
                style={{ color: isActive ? "#E8ECF4" : "rgba(255,255,255,0.45)" }}
              >
                {isActive && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full"
                    style={{ background: "rgba(255,255,255,0.75)", boxShadow: "0 0 6px rgba(200,220,255,0.35)" }}
                  />
                )}
                {item.icon === "zoom-cube" || item.icon === "gram-diamond" ? (
                  <span
                    style={{
                      display: "inline-flex",
                      transform: isActive ? "scale(1.15)" : "scale(1)",
                      filter: isActive ? "drop-shadow(0 0 5px rgba(200,220,255,0.35))" : "none",
                      opacity: isActive ? 1 : 0.7,
                      transition: "transform 150ms ease, filter 150ms ease, opacity 150ms ease",
                    }}
                  >
                    {item.icon === "zoom-cube" ? (
                      <ZoomCubeIcon size={20} />
                    ) : (
                      <GramDiamondIcon size={20} />
                    )}
                  </span>
                ) : (
                  <item.icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    style={{
                      transform: isActive ? "scale(1.15)" : "scale(1)",
                      filter: isActive ? "drop-shadow(0 0 5px rgba(200,220,255,0.35))" : "none",
                      transition: "transform 150ms ease, filter 150ms ease",
                    }}
                  />
                )}
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em" }}>
                  {t(item.labelKey)}
                </div>
              </button>
            );
          })}
        </div>
      </nav>
      )}
      {studioOpen && state.telegramId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "#000",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            paddingTop: `calc(env(safe-area-inset-top, 0px) + ${tgSafeTop}px)`,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            overflow: "hidden",
          }}
        >
          <VoxelStudioPage
            telegramId={state.telegramId}
            stardustBalance={state.stardustBalance || 0}
            seedTitle={studioSeedTitle}
            seedProjectId={studioSeedProjectId}
            onClose={() => {
              setStudioOpen(false);
              setStudioSeedTitle(null);
              setStudioSeedProjectId(null);
            }}
            onStardustSpent={(n) => {
              setState((s) => ({ ...s, stardustBalance: n }));
            }}
          />
        </div>
      )}
      {globalToast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-black tracking-widest"
          style={{
            top: tab === "lab" ? 12 : 70,
            zIndex: 9999,
            background: globalToast.ok ? "rgba(0,230,118,0.15)" : "rgba(255,65,108,0.15)",
            border: `1px solid ${globalToast.ok ? "rgba(0,230,118,0.3)" : "rgba(255,65,108,0.3)"}`,
            color: globalToast.ok ? "#00e676" : "#ff416c",
          }}
        >
          {globalToast.text}
        </div>
      )}
      {stardustPopupOpen && (
        <StardustInfoPopup
          balance={state.stardustBalance}
          today={stardust.today}
          dailyCap={stardust.dailyCap}
          globalTotal={stardust.globalTotal}
          onClose={() => setStardustPopupOpen(false)}
        />
      )}

      {/* ── RESOURCE WIDGET ── star icon → Stardust / Redstar / NFTSTAR */}
      {resourceWidgetOpen && (
        <div
          onClick={() => setResourceWidgetOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 320, width: "100%",
              background: "linear-gradient(160deg, rgba(18,10,6,0.98) 0%, rgba(8,4,2,0.99) 100%)",
              border: "1px solid rgba(255,215,64,0.28)",
              borderRadius: 18,
              padding: "22px 20px 20px",
              boxShadow: "0 0 40px rgba(255,215,64,0.12)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <svg width={32} height={32} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ margin: "0 auto 6px", display: "block", filter: "drop-shadow(0 0 8px rgba(255,215,64,0.8))" }}>
                <rect x="5" y="0" width="2" height="2" fill="#ffd740" />
                <rect x="3" y="2" width="6" height="2" fill="#ffd740" />
                <rect x="1" y="4" width="10" height="2" fill="#ffd740" />
                <rect x="0" y="5" width="12" height="2" fill="#ffee88" />
                <rect x="1" y="7" width="10" height="2" fill="#ffd740" />
                <rect x="3" y="9" width="6" height="2" fill="#ffd740" />
                <rect x="5" y="11" width="2" height="1" fill="#ffb300" />
              </svg>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.2em", color: "#ffd740", textTransform: "uppercase" }}>{t("header.resources")}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: t("resources.stardust"), value: state.stardustBalance || 0, color: "#ffd740", icon: "★" },
                { label: t("resources.redStar"), value: state.redStarBalance || 0, color: "#ff4444", icon: "★" },
                { label: t("resources.nftStar"), value: state.nftStarBalance || 0, color: "#a0a0a8", icon: "★" },
              ].map(({ label, value, color, icon }) => (
                <div
                  key={label}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: color + "0a",
                    border: `1px solid ${color}22`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color, fontSize: 16, filter: `drop-shadow(0 0 4px ${color}aa)` }}>{icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
                    {value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + "M"
                      : value >= 10_000 ? (value / 1_000).toFixed(1) + "K"
                      : value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setResourceWidgetOpen(false)}
              style={{
                display: "block", width: "100%", marginTop: 16,
                padding: "10px", borderRadius: 10,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >{t("common.close")}</button>
          </div>
        </div>
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
  const { t } = useT();
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
        background: "rgba(8,1,9,0.72)",
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
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.22em", color: "#ffd740" }}>{t("stardustPopup.title")}</div>
        <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.78)", fontStyle: "italic" }}>
          {t("stardustPopup.quote")}
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
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,215,64,0.7)" }}>{t("stardustPopup.yourBalance")}</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#ffd740" }}>{balance.toLocaleString()}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "10px 6px" }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}>{t("stardustPopup.today")}</div>
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
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}>{t("stardustPopup.globalCollected")}</span>
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
            {t("stardustPopup.top10")}
          </div>
          {leaderboard === null && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", padding: "8px 0" }}>
              {t("stardustPopup.loading")}
            </div>
          )}
          {leaderboard !== null && leaderboard.length === 0 && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", padding: "8px 0" }}>
              {t("stardustPopup.noCollectors")}
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
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
