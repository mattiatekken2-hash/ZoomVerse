import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  fetchHomeState,
  unlockHome,
  claimComputer,
  claimComputerZoomBonus,
  waterPlant,
  claimPlant,
  placeHomeSlot,
  clearHomeSlot,
  fetchReferralFriends,
  fetchRoomVisitors,
  fetchRoomInviteInbox,
  sendRoomInvite,
  respondRoomInvite,
  type HomeState,
  type InvitedFriend,
  type RoomInviteInbox,
} from "../utils/api";
import { PixelPlant } from "../components/PixelPlant";
import { useT } from "../i18n/LanguageContext";
import {
  PixelAstronaut,
  SleepingAstronaut,
  CoffeeSteam,
  PixelBird,
  WalkingAstronaut,
  WalkingVisitor,
  VISITOR_PALETTES,
  ExercisingAstronaut,
  PushupAstronaut,
  DrinkingAstronaut,
  ShoweringAstronaut,
  PixelPet,
} from "../components/PixelAstronaut";
import { useAstronautActivity } from "../hooks/useAstronautActivity";
import { GlobalChat } from "../components/GlobalChat";

/** Read the Telegram WebApp display name once per render, no hook needed. */
function readTelegramDisplayName(): string {
  try {
    const w = window as unknown as {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { username?: string; first_name?: string } } } };
    };
    const u = w.Telegram?.WebApp?.initDataUnsafe?.user;
    return (u?.username || u?.first_name || "").trim();
  } catch {
    return "";
  }
}

interface HomePageProps {
  telegramId: string | null;
  referralCode: string;
  visible: boolean;
}

type Slot = "A" | "B" | "C";
type SkyPhase = "dawn" | "day" | "sunset" | "night";

// Map UTC hour → sky phase. Reading from new Date().getUTCHours() means
// every player on the planet sees the same phase at the same wall-clock
// moment, which is the explicit spec ("orario UTC, sincronizzato lato
// server" — UTC = same for everyone, no per-user clock skew possible).
function getUtcPhase(date: Date): SkyPhase {
  const h = date.getUTCHours();
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 17) return "day";
  if (h >= 17 && h < 20) return "sunset";
  return "night";
}

const PHASE_GRADIENT: Record<SkyPhase, string> = {
  dawn: "linear-gradient(180deg, #ff9a8b 0%, #ffd194 55%, #c8e8f5 100%)",
  day: "linear-gradient(180deg, #6cc7f0 0%, #a6dff5 55%, #d8f1fa 100%)",
  sunset: "linear-gradient(180deg, #ff5e7e 0%, #ff9550 50%, #ffce80 100%)",
  night: "linear-gradient(180deg, #060a1f 0%, #121a48 55%, #2a3a78 100%)",
};

const PHASE_GROUND: Record<SkyPhase, string> = {
  dawn: "#5a8c52",
  day: "#4f9e44",
  sunset: "#3f6638",
  night: "#0d1d18",
};

function fmtCountdown(s: number, readyLabel: string): string {
  if (s <= 0) return readyLabel;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

// ─────────────────────────────────────────────────────────────────────
// Identity-stable update helpers — used to dampen the per-30s polling
// flicker. Each helper returns true when the new payload is "the same"
// for rendering purposes, so the calling setState can skip the commit
// and keep the previous array/object reference. This prevents the
// downstream tree (room overlays, friend astronauts, plant slots) from
// re-rendering and visually jittering when nothing actually changed.
// ─────────────────────────────────────────────────────────────────────
function sameKeyList(a: InvitedFriend[], b: InvitedFriend[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key) return false;
  }
  return true;
}
function sameInboxList(a: RoomInviteInbox[], b: RoomInviteInbox[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}
function shallowSameHomeState(a: HomeState, b: HomeState): boolean {
  // Compare the small set of fields that actually drive UI state. We
  // intentionally ignore long timestamp strings and instead derive
  // readiness client-side from the numeric `*NextReadyAt` fields, so
  // an unchanged snapshot stays referentially equal across polls.
  if (
    a.unlocked !== b.unlocked ||
    a.hasSun !== b.hasSun ||
    a.stardustBalance !== b.stardustBalance ||
    a.unlockCost !== b.unlockCost ||
    a.slots.A !== b.slots.A ||
    a.slots.B !== b.slots.B ||
    a.slots.C !== b.slots.C
  ) return false;
  if (
    a.computer.owned !== b.computer.owned ||
    a.computer.nextReadyAt !== b.computer.nextReadyAt ||
    a.computer.cost !== b.computer.cost ||
    a.computer.rewardPerClaim !== b.computer.rewardPerClaim ||
    a.computer.zoomBonusNextReadyAt !== b.computer.zoomBonusNextReadyAt
  ) return false;
  if (
    a.plant.owned !== b.plant.owned ||
    a.plant.level !== b.plant.level ||
    a.plant.xp !== b.plant.xp ||
    a.plant.waterNextReadyAt !== b.plant.waterNextReadyAt ||
    a.plant.claimNextReadyAt !== b.plant.claimNextReadyAt ||
    a.plant.tonPerClaim !== b.plant.tonPerClaim ||
    a.plant.seedCost !== b.plant.seedCost
  ) return false;
  return true;
}

export function HomePage({ telegramId, referralCode, visible }: HomePageProps) {
  const { t } = useT();
  const [state, setState] = useState<HomeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [arrange, setArrange] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState<InvitedFriend[]>([]);
  const [visitors, setVisitors] = useState<InvitedFriend[]>([]);
  const [inbox, setInbox] = useState<RoomInviteInbox[]>([]);
  // In-room invite (peer-to-peer) — username input + UI feedback.
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Tracks which inbox row is currently being responded to (to disable
  // its buttons while the request is in flight).
  const [responding, setResponding] = useState<number | null>(null);

  // The Telegram referral system (start_param + /referral/register) is
  // still live on the bot side — anyone who shares their old link will
  // still earn +20 ZOOM. We just don't surface the Share/Copy buttons
  // in the in-app modal anymore (the user asked to drop that section).
  void referralCode;

  // Fetch the list of users who have already accepted this user's
  // invite. Used to render one "friend astronaut" per invite inside the
  // host's room. Refresh every 30 s while the HOME tab is visible so a
  // newly accepted invite shows up without a manual reload.
  //
  // Sequence guard (seqRef) prevents a slow request from a previous
  // poll from overwriting fresher data.
  //
  // ⚠️ Flicker fix: we used to clear `friends`/`visitors` on every
  // `visible` toggle (i.e. each tab switch to/from HOME), which made
  // every friend astronaut briefly disappear and pop back in. Clearing
  // is now scoped to telegramId changes only — the cached list stays
  // visible while the next poll is in flight.
  const friendsSeqRef = useRef(0);
  useEffect(() => {
    setFriends([]);
    setVisitors([]);
  }, [telegramId]);
  useEffect(() => {
    if (!telegramId || !visible) return;
    let cancelled = false;
    const load = async () => {
      const my = ++friendsSeqRef.current;
      const [f, v] = await Promise.all([
        fetchReferralFriends(),
        fetchRoomVisitors(),
      ]);
      if (!cancelled && my === friendsSeqRef.current) {
        // Only commit a new array reference when the contents actually
        // changed — otherwise downstream room overlays see "new" friend
        // props every 30 s and re-render their astronauts for nothing.
        setFriends((cur) => (sameKeyList(cur, f) ? cur : f));
        setVisitors((cur) => (sameKeyList(cur, v) ? cur : v));
      }
    };
    load();
    const id = window.setInterval(load, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [telegramId, visible]);

  // Inbox of pending room invites addressed to me. Polled more often
  // than the visitors list (15s vs 30s) so a fresh invite shows up
  // promptly while the user is on HOME. The seq guard prevents a slow
  // poll from clobbering a faster one. Same flicker fix as above:
  // clear only on telegramId change, not on every visible toggle.
  const inboxSeqRef = useRef(0);
  useEffect(() => { setInbox([]); }, [telegramId]);
  useEffect(() => {
    if (!telegramId || !visible) return;
    let cancelled = false;
    const load = async () => {
      const my = ++inboxSeqRef.current;
      const list = await fetchRoomInviteInbox();
      if (!cancelled && my === inboxSeqRef.current) {
        setInbox((cur) => (sameInboxList(cur, list) ? cur : list));
      }
    };
    load();
    const id = window.setInterval(load, 15000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [telegramId, visible]);

  // Friends + visitors are rendered with the same room-overlay code
  // (same shape, same palette function, same FRIEND_SPOTS). Visitors
  // win when both sources reference the same `key` so the more recent
  // 30-min window takes precedence over the long-lived referral entry.
  //
  // Memoised on the underlying arrays so the per-second `tick` re-render
  // doesn't rebuild the array (which would trigger every astronaut
  // overlay to re-render and restart its CSS animations).
  const roomOccupants: InvitedFriend[] = useMemo(() => {
    const byKey = new Map<string, InvitedFriend>();
    for (const f of friends) byKey.set(f.key, f);
    for (const v of visitors) byKey.set(v.key, v);
    return [...byKey.values()];
  }, [friends, visitors]);

  const handleSendRoomInvite = useCallback(async () => {
    if (!telegramId) return;
    const raw = inviteUsername.trim();
    if (!raw) {
      setInviteFeedback({ kind: "err", text: t("home.usrTypeUsername") });
      return;
    }
    setInviteSending(true);
    setInviteFeedback(null);
    const r = await sendRoomInvite(telegramId, raw);
    setInviteSending(false);
    if (r.ok) {
      setInviteUsername("");
      setInviteFeedback({ kind: "ok", text: t("home.inviteSent") });
    } else {
      const msg = (() => {
        switch (r.error) {
          case "user_not_found": return t("home.err.userNotFound");
          case "ambiguous_username": return t("home.err.ambiguous");
          case "cannot_invite_self": return t("home.err.self");
          case "cooldown": return t("home.err.cooldown", { n: r.waitSeconds ?? 60 });
          case "too_many_pending": return t("home.err.tooMany");
          case "invalid_username": return t("home.err.invalid");
          default: return t("home.err.failed");
        }
      })();
      setInviteFeedback({ kind: "err", text: msg });
    }
  }, [telegramId, inviteUsername, t]);

  const handleRespondInvite = useCallback(async (id: number, action: "accept" | "decline") => {
    if (!telegramId) return;
    setResponding(id);
    const ok = await respondRoomInvite(telegramId, id, action);
    setResponding(null);
    if (ok) {
      // Optimistically drop the row so the banner disappears immediately;
      // the next 15s poll will reconcile if the server disagrees.
      setInbox((cur) => cur.filter((i) => i.id !== id));
      if (action === "accept") setToast(t("home.inviteJoined"));
    } else {
      setToast(t("home.inviteCouldNot"));
    }
  }, [telegramId, t]);

  // Watering tick — bumps each time the player successfully waters the
  // plant. PlantSlotContent listens to this number to (re-)trigger a
  // happy shake + blue water-droplet burst around the sprite. Declared
  // up here (above any conditional return) so the hook order stays
  // stable across loading/loaded/locked/unlocked render branches.
  const [wateringTick, setWateringTick] = useState(0);

  // Re-render the countdown every second so it actually counts down.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [visible]);
  void tick;

  // Phase recompute hook — we don't need a timer for it because the room
  // re-renders on every countdown tick anyway, which already covers the
  // worst-case 1s delay between an hour boundary and the gradient swap.
  const phase = getUtcPhase(new Date());

  // Sequence guard: when a refresh is triggered both by the periodic
  // tick AND by the global "zoom-data-refresh" event (e.g. right after
  // claiming the computer), two requests can be in flight at the same
  // time. Without this guard, the older response can land last and
  // overwrite the newer state — making `claimable` flip back to true
  // for a second after a successful claim. We tag every fetch with a
  // monotonically increasing seq and only commit if the seq is still
  // the latest one started.
  const refreshSeqRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!telegramId) {
      setState(null);
      setLoading(false);
      return;
    }
    const mySeq = ++refreshSeqRef.current;
    const s = await fetchHomeState(telegramId);
    if (mySeq !== refreshSeqRef.current) return; // a newer refresh already won
    // ⚠️ Flicker fix: only commit when the snapshot actually differs.
    // Without this, every 30 s reconcile + every global "zoom-data-refresh"
    // event would replace `state` with a brand-new object reference even
    // when nothing changed, forcing the entire 2k-line HOME tree to
    // re-render and visibly flashing CSS-driven sub-elements.
    setState((cur) => {
      if (cur && s && shallowSameHomeState(cur, s)) return cur;
      return s;
    });
    setLoading(false);
  }, [telegramId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-fetch whenever the global "data-refresh" event fires (e.g. after
  // buying the COMPUTER from the shop). Cheap and keeps the UI in sync
  // without forcing the user to switch tabs.
  useEffect(() => {
    const onRefresh = () => { void refresh(); };
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => window.removeEventListener("zoom-data-refresh", onRefresh);
  }, [refresh]);

  // Periodic /home/state reconciliation while the page is visible.
  // Belt-and-suspenders alongside the per-second client-side derivation
  // of cooldowns: re-syncs server-truth fields like xp, level, balances,
  // and exact timestamps every 30s so long-idle sessions stay correct.
  useEffect(() => {
    if (!visible || !telegramId) return;
    const id = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(id);
  }, [visible, telegramId, refresh]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleUnlock = async () => {
    if (!telegramId || !state) return;
    setBusy("unlock");
    const r = await unlockHome(telegramId);
    setBusy(null);
    if (r.ok) {
      setToast(t("home.unlocked"));
      window.dispatchEvent(new Event("zoom-data-refresh"));
      void refresh();
    } else if (r.error === "NO_SUN") setToast(t("home.needSun"));
    else if (r.error === "NOT_ENOUGH_STARDUST") setToast(t("home.needStardust", { need: r.need, have: r.have }));
    else if (r.error === "ALREADY_UNLOCKED") void refresh();
    else setToast(t("home.unlockFailed"));
  };

  const handleClaim = async () => {
    if (!telegramId) return;
    setBusy("claim");
    const r = await claimComputer(telegramId);
    setBusy(null);
    if (r.ok) {
      setToast(t("home.gotStardust", { n: r.reward }));
      window.dispatchEvent(new Event("zoom-data-refresh"));
      void refresh();
    } else if (r.error === "NOT_READY") {
      setToast(t("home.notReady", { time: fmtCountdown(r.secondsToReady ?? 0, t("home.ready")) }));
      void refresh();
    } else if (r.error === "NOT_OWNED") setToast(t("home.buyComputer"));
    else setToast(t("home.claimFailed"));
  };

  // Easter-egg: tap the computer to try the +200 $ZOOM daily bonus.
  // Silent on cooldown (the visual binary-rain animation is enough
  // feedback) — only the success path shows a toast so it feels like a
  // surprise reward, not a button.
  const handleComputerZoomBonus = async () => {
    if (!telegramId) return;
    const r = await claimComputerZoomBonus(telegramId);
    if (r.ok) {
      setToast(t("earn.zoomCredited", { n: r.reward }));
      window.dispatchEvent(new Event("zoom-data-refresh"));
      void refresh();
    } else if (r.error === "NOT_READY") {
      // Stay quiet — the next bonus is on tomorrow's tap.
      void refresh();
    }
  };

  const handleWaterPlant = async () => {
    if (!telegramId) return;
    setBusy("water-plant");
    const r = await waterPlant(telegramId);
    setBusy(null);
    if (r.ok) {
      // Bump the watering tick so PlantSlotContent triggers its
      // shake-and-droplets animation. Each bump is unique so the
      // animation re-runs even on rapid successive successful waters.
      setWateringTick((t) => t + 1);
      if (r.maxedOut) setToast(t("home.fullyGrown"));
      else if (r.leveledUp) setToast(t("home.levelUp", { n: r.plantLevel }));
      else setToast(t("home.gotXp", { n: 10 }));
      window.dispatchEvent(new Event("zoom-data-refresh"));
      void refresh();
    } else if (r.error === "NOT_READY") {
      setToast(t("home.waitWater", { time: fmtCountdown(r.secondsToReady ?? 0, t("home.ready")) }));
      void refresh();
    } else if (r.error === "NOT_ENOUGH_STARDUST") {
      setToast(t("home.needStardust", { need: r.need, have: r.have }));
    } else if (r.error === "MAX_LEVEL") {
      setToast(t("home.maxLevel"));
      void refresh();
    } else if (r.error === "NOT_OWNED") {
      setToast(t("home.buySeed"));
    } else {
      setToast(t("home.waterFailed"));
    }
  };

  const handleClaimPlant = async () => {
    if (!telegramId) return;
    setBusy("claim-plant");
    const r = await claimPlant(telegramId);
    setBusy(null);
    if (r.ok) {
      setToast(t("home.gotTon", { n: r.reward }));
      window.dispatchEvent(new Event("zoom-data-refresh"));
      void refresh();
    } else if (r.error === "NOT_READY") {
      setToast(t("home.notReady", { time: fmtCountdown(r.secondsToReady ?? 0, t("home.ready")) }));
      void refresh();
    } else if (r.error === "NOT_MATURE") {
      setToast(t("home.notMature"));
    } else {
      setToast(t("home.claimFailed"));
    }
  };

  const handlePlace = async (slot: Slot, itemId: string) => {
    if (!telegramId) return;
    setBusy(`place-${slot}`);
    const r = await placeHomeSlot(telegramId, slot, itemId);
    setBusy(null);
    setPickerSlot(null);
    if (r.ok) void refresh();
    else if (r.error === "ITEM_NOT_OWNED") setToast(t("home.notOwned"));
    else setToast(t("home.placeFailed"));
  };

  const handleClear = async (slot: Slot) => {
    if (!telegramId) return;
    setBusy(`clear-${slot}`);
    const r = await clearHomeSlot(telegramId, slot);
    setBusy(null);
    if (r.ok) void refresh();
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{t("home.loading")}</div>;
  }
  if (!state) {
    return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{t("home.couldNotLoad")}</div>;
  }

  // ─── LIVE DERIVED READINESS ─────────────────────────────────────────
  // The server snapshot includes booleans (`claimable`, `waterReady`,
  // `claimReady`) that are correct only at the instant of fetch. To
  // avoid a stale UI keeping a button blocked after the cooldown has
  // already expired, we re-derive readiness every render from the
  // absolute timestamps the server provides (`nextReadyAt` / unix-ms).
  // Combined with the 1Hz `tick`, this re-evaluates each second so the
  // moment a cooldown ends the slot becomes interactive — without
  // waiting for the periodic 30s /home/state reconciliation.
  const nowMs = Date.now();
  const liveComputerClaimable =
    state.computer.owned && nowMs >= state.computer.nextReadyAt;
  // Easter-egg 200 $ZOOM bonus — derived live from the absolute server
  // timestamp so the cooldown unlocks immediately at the 24h mark
  // without waiting for the next /home/state poll.
  const liveZoomBonusReady = nowMs >= (state.computer.zoomBonusNextReadyAt || 0);
  const livePlant: HomeState["plant"] = {
    ...state.plant,
    waterReady: state.plant.owned && nowMs >= state.plant.waterNextReadyAt,
    claimReady:
      state.plant.owned &&
      state.plant.level >= state.plant.maxLevel &&
      nowMs >= state.plant.claimNextReadyAt,
    secondsToWater: Math.max(0, Math.ceil((state.plant.waterNextReadyAt - nowMs) / 1000)),
    secondsToClaim: Math.max(0, Math.ceil((state.plant.claimNextReadyAt - nowMs) / 1000)),
  };

  // ─── LOCK SCREEN ────────────────────────────────────────────────────
  if (!state.unlocked) {
    const canPay = state.stardustBalance >= state.unlockCost;
    const canUnlock = state.hasSun && canPay;
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative" style={{ overflow: "auto" }}>
        {toast && <Toast text={toast} />}
        <PixelLock />
        <div className="mt-6 font-black text-lg tracking-widest neon-text text-center">{t("home.locked")}</div>
        <div className="mt-2 text-xs text-center" style={{ color: "rgba(255,255,255,0.55)", maxWidth: 280, lineHeight: 1.5 }}>
          {t("home.lockedDesc")}
        </div>
        <div className="mt-5 w-full max-w-xs flex flex-col gap-2">
          <Requirement met={state.hasSun} label={t("home.reqSun")} />
          <Requirement met={canPay} label={t("home.reqStardust", { cost: state.unlockCost.toLocaleString(), have: state.stardustBalance.toLocaleString() })} />
        </div>
        <button
          type="button"
          onClick={handleUnlock}
          disabled={!canUnlock || busy === "unlock"}
          className="mt-6 w-full max-w-xs py-3 rounded-xl font-black tracking-wider text-sm transition-all active:scale-95"
          style={{
            background: canUnlock ? "linear-gradient(135deg, rgba(255,51,85,0.22), rgba(0,136,255,0.18))" : "rgba(255,255,255,0.04)",
            color: canUnlock ? "#ff3355" : "rgba(255,255,255,0.25)",
            border: `1px solid ${canUnlock ? "rgba(255,51,85,0.45)" : "rgba(255,255,255,0.08)"}`,
            boxShadow: canUnlock ? "0 0 24px rgba(255,51,85,0.18)" : "none",
            cursor: canUnlock ? "pointer" : "not-allowed",
            opacity: busy === "unlock" ? 0.6 : 1,
          }}
        >
          {busy === "unlock" ? t("home.unlocking") : t("home.unlock", { n: state.unlockCost.toLocaleString() })}
        </button>
      </div>
    );
  }

  // ─── ROOM (UNLOCKED) ────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {toast && <Toast text={toast} />}

      {/* Top bar: arrange toggle + computer status */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ background: "rgba(6,8,16,0.85)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="font-black text-sm tracking-widest neon-text">HOME</div>
        <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>· UTC {phase.toUpperCase()}</div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all active:scale-95"
          style={{
            background: "rgba(0,230,118,0.14)",
            color: "#00e676",
            border: "1px solid rgba(0,230,118,0.4)",
          }}
        >
          {t("home.invite")}
          {(roomOccupants.length > 0 || inbox.length > 0) && (
            <span style={{ marginLeft: 6, opacity: 0.85 }}>
              · {roomOccupants.length}
              {inbox.length > 0 && (
                <span style={{ color: "#ffd740", marginLeft: 4 }}>(+{inbox.length})</span>
              )}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setArrange((v) => !v); setPickerSlot(null); }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all active:scale-95"
          style={{
            background: arrange ? "rgba(255,215,64,0.18)" : "rgba(255,255,255,0.05)",
            color: arrange ? "#ffd740" : "rgba(255,255,255,0.55)",
            border: `1px solid ${arrange ? "rgba(255,215,64,0.45)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          {arrange ? t("home.done") : t("home.arrange")}
        </button>
      </div>

      {/* Invite modal — choose between sharing the link in Telegram
          (forwards to a friend / chat) or copying the raw link to
          paste anywhere. Closes by tapping the backdrop. */}
      {inviteOpen && (
        <div
          onClick={() => setInviteOpen(false)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 360,
              width: "100%",
              background: "#0c1226",
              border: "1px solid rgba(0,230,118,0.35)",
              borderRadius: 12,
              padding: 18,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}
          >
            <div className="font-black text-base mb-1" style={{ color: "#00e676" }}>
              {t("home.inviteFriend")}
            </div>
            <div className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
              {t("home.inviteDesc")}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => { setInviteUsername(e.target.value); setInviteFeedback(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSendRoomInvite(); }}
                placeholder="@username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={inviteSending}
                className="flex-1 px-2 py-2 rounded-lg text-sm font-mono"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  outline: "none",
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={handleSendRoomInvite}
                disabled={inviteSending || !inviteUsername.trim()}
                className="px-3 py-2 rounded-lg font-bold text-xs tracking-wider uppercase transition-all active:scale-95"
                style={{
                  background: inviteSending ? "rgba(255,255,255,0.06)" : "rgba(0,230,118,0.22)",
                  color: inviteSending ? "rgba(255,255,255,0.4)" : "#00e676",
                  border: "1px solid rgba(0,230,118,0.45)",
                  opacity: inviteUsername.trim() ? 1 : 0.5,
                }}
              >
                {inviteSending ? "..." : t("home.inviteBtn")}
              </button>
            </div>
            {inviteFeedback && (
              <div
                className="text-xs mb-3 px-2 py-1.5 rounded"
                style={{
                  background: inviteFeedback.kind === "ok" ? "rgba(0,230,118,0.10)" : "rgba(255,90,90,0.12)",
                  color: inviteFeedback.kind === "ok" ? "#00e676" : "#ff7a7a",
                  border: `1px solid ${inviteFeedback.kind === "ok" ? "rgba(0,230,118,0.35)" : "rgba(255,90,90,0.35)"}`,
                }}
              >
                {inviteFeedback.text}
              </div>
            )}

            <div className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
              {t("home.inRoomNow")} <span style={{ color: "#00e676", fontWeight: 700 }}>{roomOccupants.length}</span>
            </div>

            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="w-full py-2 rounded-lg text-xs font-bold tracking-wider"
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {t("home.close")}
            </button>
          </div>
        </div>
      )}

      {/* Pending room-invite banner — only renders when someone has
          invited me into their room. Shows the most recent invite with
          Accept / Decline; older invites are stacked underneath, capped
          at 3 visible so the banner doesn't push the room offscreen. */}
      {inbox.length > 0 && (
        <div
          style={{
            padding: "8px 10px 0",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {inbox.slice(0, 3).map((inv) => {
            const busy = responding === inv.id;
            return (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(255,215,64,0.10)",
                  border: "1px solid rgba(255,215,64,0.45)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
                }}
              >
                <div className="text-xs" style={{ flex: 1, color: "rgba(255,255,255,0.92)" }}>
                  {t("home.pendingInvite", { name: inv.from })}
                </div>
                <button
                  type="button"
                  onClick={() => void handleRespondInvite(inv.id, "accept")}
                  disabled={busy}
                  className="px-2.5 py-1 rounded-md text-xs font-black tracking-wider uppercase active:scale-95"
                  style={{
                    background: "rgba(0,230,118,0.22)",
                    color: "#00e676",
                    border: "1px solid rgba(0,230,118,0.55)",
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  {t("home.accept")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRespondInvite(inv.id, "decline")}
                  disabled={busy}
                  className="px-2 py-1 rounded-md text-xs font-bold tracking-wider uppercase active:scale-95"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  {t("home.decline")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pixel room — fills the entire HOME area (no max-width clamp).
          The room SVG uses preserveAspectRatio="none" so it stretches to
          whatever shape the device gives us; slot/window % positions are
          relative so they follow the stretch correctly. */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="relative flex-1 overflow-hidden"
          style={{
            background: "#0a0e1a",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            boxShadow: "inset 0 0 18px rgba(0,0,0,0.55)",
            imageRendering: "pixelated",
          }}
        >
          <PixelRoom
            phase={phase}
            slots={state.slots}
            arrange={arrange}
            computerOwned={state.computer.owned}
            computerClaimable={liveComputerClaimable}
            secondsToReady={state.computer.secondsToReady}
            plant={livePlant}
            wateringTick={wateringTick}
            visible={visible}
            friends={roomOccupants}
            onComputerExtraClick={() => {
              if (liveZoomBonusReady) void handleComputerZoomBonus();
            }}
            onSlotClick={(s) => {
              if (!arrange) {
                // Outside arrange mode: tapping the slot does the
                // appropriate per-item interaction. Readiness is derived
                // live from server timestamps each tick, so cooldown
                // expiry unlocks the action immediately without needing
                // a manual refresh.
                const id = state.slots[s];
                if (id === "computer" && liveComputerClaimable) handleClaim();
                else if (id === "plant") {
                  if (livePlant.level >= livePlant.maxLevel) {
                    if (livePlant.claimReady) handleClaimPlant();
                    else setToast(t("home.notReady", { time: fmtCountdown(livePlant.secondsToClaim, t("home.ready")) }));
                  } else if (livePlant.waterReady) {
                    handleWaterPlant();
                  } else {
                    setToast(t("home.waitWater", { time: fmtCountdown(livePlant.secondsToWater, t("home.ready")) }));
                  }
                }
                return;
              }
              setPickerSlot((cur) => (cur === s ? null : s));
            }}
          />
        </div>

        {/* NOTE: the old COMPUTER status strip + CLAIM button used to
            sit here. We removed it on the player's request: the monitor
            in the room now shows "25/H ★" directly on its screen, and
            tapping the monitor after the 24h cooldown is the claim. */}

        {/* Global chat panel — Phase 5b. Lives below the room
            so the player can chat with the rest of the universe
            while their astronaut and pet do their thing in the scene. */}
        <GlobalChat telegramId={telegramId} username={readTelegramDisplayName()} />

        {/* Slot picker — appears in arrange mode when a slot is tapped. */}
        {arrange && pickerSlot && (
          <div
            className="mx-auto mt-4 rounded-xl p-3"
            style={{
              maxWidth: 420,
              background: "rgba(255,215,64,0.08)",
              border: "1px solid rgba(255,215,64,0.3)",
            }}
          >
            <div className="text-xs font-black tracking-widest mb-2" style={{ color: "#ffd740" }}>
              {t("home.placementTitle")}
            </div>
            <div className="flex flex-wrap gap-2">
              <SlotPickerOption
                label="COMPUTER"
                owned={state.computer.owned}
                disabled={!state.computer.owned || busy === `place-${pickerSlot}`}
                onClick={() => handlePlace(pickerSlot, "computer")}
              />
              <SlotPickerOption
                label="PLANT"
                owned={state.plant.owned}
                disabled={!state.plant.owned || busy === `place-${pickerSlot}`}
                onClick={() => handlePlace(pickerSlot, "plant")}
              />
              {state.slots[pickerSlot] && (
                <button
                  type="button"
                  onClick={() => handleClear(pickerSlot)}
                  disabled={busy === `clear-${pickerSlot}`}
                  className="px-3 py-2 rounded-lg text-xs font-bold tracking-wider"
                  style={{
                    background: "rgba(255,99,99,0.10)",
                    color: "#ff8b8b",
                    border: "1px solid rgba(255,99,99,0.3)",
                  }}
                >
                  {t("home.remove")}
                </button>
              )}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
              {state.computer.owned
                ? t("home.placementComputer")
                : t("home.placementShop")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────

function Toast({ text }: { text: string }) {
  return (
    <div
      className="absolute top-2 left-1/2 z-50 px-4 py-2 rounded-xl text-xs font-bold pointer-events-none"
      style={{
        transform: "translateX(-50%)",
        background: "rgba(20,18,6,0.92)",
        color: "#ffd740",
        border: "1px solid rgba(255,215,64,0.4)",
        boxShadow: "0 0 18px rgba(255,215,64,0.2)",
      }}
    >
      {text}
    </div>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
      style={{
        background: met ? "rgba(0,230,118,0.08)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${met ? "rgba(0,230,118,0.3)" : "rgba(255,255,255,0.08)"}`,
        color: met ? "#00e676" : "rgba(255,255,255,0.55)",
      }}
    >
      <span style={{ fontWeight: 900, fontSize: 13 }}>{met ? "✓" : "○"}</span>
      <span>{label}</span>
    </div>
  );
}

function SlotPickerOption({ label, owned, disabled, onClick }: { label: string; owned: boolean; disabled: boolean; onClick: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-2 rounded-lg text-xs font-bold tracking-wider transition-all active:scale-95"
      style={{
        background: owned ? "rgba(255,51,85,0.10)" : "rgba(255,255,255,0.04)",
        color: owned ? "#ff3355" : "rgba(255,255,255,0.3)",
        border: `1px solid ${owned ? "rgba(255,51,85,0.3)" : "rgba(255,255,255,0.08)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}{!owned && ` (${t("home.notOwned")})`}
    </button>
  );
}

// Pixelated padlock for the lock screen. Pure SVG with integer
// coordinates + image-rendering: pixelated → crisp at any size.
function PixelLock() {
  const px = "#ff3355";
  return (
    <svg
      viewBox="0 0 16 18"
      width={88}
      height={99}
      style={{ imageRendering: "pixelated", filter: "drop-shadow(0 0 12px rgba(255,51,85,0.5))" }}
    >
      {/* Shackle */}
      <rect x="4" y="1" width="8" height="2" fill={px} />
      <rect x="3" y="2" width="2" height="6" fill={px} />
      <rect x="11" y="2" width="2" height="6" fill={px} />
      {/* Body */}
      <rect x="2" y="7" width="12" height="10" fill={px} />
      <rect x="3" y="8" width="10" height="8" fill="#0a0e1a" />
      {/* Keyhole */}
      <rect x="7" y="10" width="2" height="2" fill={px} />
      <rect x="7" y="12" width="2" height="3" fill={px} />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
// PlantSlotContent — what gets rendered inside a HOME slot when the
// player has placed their plant there.
//
// Shows three layers:
//   1. The pixel-art plant sprite (PixelPlant) at its current level.
//   2. A floating "balance" badge ABOVE the sprite — at level <10 it
//      shows the level + XP progress bar; at level 10 it shows the
//      live TON-per-second accrual rate (per spec) and the live
//      accumulated balance ticking up in real time.
//   3. A subtle pulsing dot when an action is ready (water ready or
//      a TON claim ready), so the player knows to tap.
// ────────────────────────────────────────────────────────────────────────
function PlantSlotContent({ plant, wateringTick }: { plant: HomeState["plant"]; wateringTick: number }) {
  const isMature = plant.level >= plant.maxLevel;
  // Watering reaction — when `wateringTick` changes, run a one-shot
  // ~900 ms animation: the plant shakes happily and a small burst of
  // blue water droplets rains around it. The tick is a unique number,
  // so even back-to-back successful waters re-trigger the effect.
  const [watering, setWatering] = useState(false);
  useEffect(() => {
    if (wateringTick === 0) return;
    setWatering(true);
    const id = window.setTimeout(() => setWatering(false), 900);
    return () => window.clearTimeout(id);
  }, [wateringTick]);
  // Eight pre-computed droplet trajectories arranged around the plant
  // — fixed angles + slight delays so the burst feels organic without
  // recomputing on every render.
  const droplets = [
    { left: "20%", top: "55%", delay: "0ms" },
    { left: "80%", top: "55%", delay: "60ms" },
    { left: "30%", top: "30%", delay: "120ms" },
    { left: "70%", top: "30%", delay: "30ms" },
    { left: "50%", top: "20%", delay: "180ms" },
    { left: "10%", top: "70%", delay: "90ms" },
    { left: "90%", top: "70%", delay: "150ms" },
    { left: "50%", top: "85%", delay: "200ms" },
  ];
  // Live-tick the accrued TON since the last claim — purely visual,
  // server is the source of truth on actual claim. 1Hz is plenty.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isMature) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [isMature]);
  const lastClaimMs = plant.lastClaimAt ? new Date(plant.lastClaimAt).getTime() : 0;
  const elapsedSec = isMature && lastClaimMs > 0 ? Math.max(0, (Date.now() - lastClaimMs) / 1000) : 0;
  const accruedTon = Math.min(plant.tonPerClaim, elapsedSec * plant.tonPerSecond);
  const ratePerSecStr = plant.tonPerSecond.toExponential(2); // e.g. "3.86e-8"
  const accruedStr = accruedTon.toFixed(8);

  const actionReady =
    (!isMature && plant.waterReady) || (isMature && plant.claimReady);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Floating "balance" badge above the plant. At pre-mature levels
          it shows L?/10 + xp; at level 10 it shows the live TON rate and
          accumulated TON. Anchored above the slot so it doesn't cover
          the plant sprite. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: -34,
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          padding: "3px 6px",
          borderRadius: 6,
          background: "rgba(6,8,16,0.78)",
          border: `1px solid ${isMature ? "rgba(255,215,64,0.45)" : "rgba(0,230,118,0.35)"}`,
          color: isMature ? "#ffd740" : "#00e676",
          fontWeight: 800,
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          textShadow: "0 0 4px rgba(0,0,0,0.6)",
        }}
      >
        {isMature ? (
          <>
            <span style={{ fontSize: 9, lineHeight: 1 }}>{ratePerSecStr} TON/s</span>
            <span style={{ fontSize: 10, lineHeight: 1, color: "#fff4a3" }}>+{accruedStr}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 9, lineHeight: 1 }}>L{plant.level}/{plant.maxLevel}</span>
            <span style={{ fontSize: 9, lineHeight: 1, color: "rgba(255,255,255,0.7)" }}>
              {plant.xp}/{plant.xpPerLevel} xp
            </span>
          </>
        )}
      </div>

      <div style={{ animation: watering ? "home-plant-shake 0.45s ease-in-out 2" : undefined }}>
        <PixelPlant level={plant.level} size={56} glowing={isMature} />
      </div>
      {/* Blue water droplet burst — only while `watering` is true. Each
          droplet falls slightly, fades out, and is positioned via fixed
          percentages around the plant. Pure CSS, pointer-events:none. */}
      {watering && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          {droplets.map((d, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: d.left,
                top: d.top,
                width: 5,
                height: 7,
                borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                background: "radial-gradient(circle at 35% 30%, #cdeaff 0%, #4ec3ff 60%, #1f7fbf 100%)",
                boxShadow: "0 0 4px rgba(78,195,255,0.85)",
                animation: `home-water-drop 0.7s ease-in ${d.delay} 1 forwards`,
                opacity: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Action-ready pulse — water-ready droplet (pre-mature) or a
          claim-ready golden dot (mature). */}
      {actionReady && (
        <span
          aria-hidden
          className="stardust-spawn-pop"
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: isMature
              ? "radial-gradient(circle, #fff7c2 0%, #ffd740 60%, rgba(255,179,71,0) 90%)"
              : "radial-gradient(circle, #cdeaff 0%, #4ec3ff 60%, rgba(78,195,255,0) 90%)",
            boxShadow: isMature
              ? "0 0 10px rgba(255,215,64,0.95)"
              : "0 0 10px rgba(78,195,255,0.9)",
          }}
        />
      )}
    </div>
  );
}

// Small pixel computer used by the status panel. Optionally lit up
// with a yellow screen when there's stardust ready to claim.
function PixelComputerIcon({
  size = 24,
  screenOn = false,
  showLabel = false,
}: {
  size?: number;
  screenOn?: boolean;
  /** When true, overlays "25/H ★" on the monitor screen so the
   *  player can read the reward at a glance from the room view. */
  showLabel?: boolean;
}) {
  const cy = "#cfd6e6";
  const iconH = size * (12 / 16);
  const inner = (
    <svg
      viewBox="0 0 16 12"
      width={size}
      height={iconH}
      style={{ imageRendering: "pixelated", flexShrink: 0, display: "block" }}
    >
      {/* Monitor body */}
      <rect x="1" y="1" width="14" height="9" fill={cy} />
      {/* Screen — yellow/lit when stardust is ready, deep navy otherwise */}
      <rect x="2" y="2" width="12" height="7" fill={screenOn ? "#ffd740" : "#0a1a3d"} />
      {/* Stand */}
      <rect x="6" y="10" width="4" height="1" fill={cy} />
      <rect x="4" y="11" width="8" height="1" fill={cy} />
    </svg>
  );
  if (!showLabel) return inner;
  // Screen rect (in icon coords) occupies x=2..14, y=2..9 of the
  // 16×12 viewBox → 12.5%..87.5% horizontally, 16.7%..75% vertically.
  return (
    <div style={{ position: "relative", width: size, height: iconH, flexShrink: 0 }}>
      {inner}
      <span
        aria-hidden
        style={{
          // Cover the FULL icon box so flex centering uses the same
          // reference as the SVG itself — this guarantees the label
          // sits in the visual middle of the screen rect (the screen
          // is also centered horizontally inside the icon, x=2..14
          // of a 16-wide viewBox, so a full-width centered span lands
          // perfectly on top of it).
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Pull up by a hair to compensate for the monitor stand at
          // the bottom of the icon (rows 10-11 of the 12-row viewBox).
          // Without this the centered label would visually sit slightly
          // below the geometric center of the screen.
          paddingBottom: `${(3 / 12) * 100}%`,
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          fontWeight: 900,
          fontSize: Math.max(8, Math.round(size * 0.16)),
          letterSpacing: 0,
          color: screenOn ? "#1a1300" : "#7fa8d6",
          textShadow: screenOn ? "0 0 2px rgba(255,247,194,0.8)" : "none",
          userSelect: "none",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        25/D ★
      </span>
    </div>
  );
}

// Tiny pixel-art slice of pizza held by the astronaut during the
// "pizza" activity. 8×8 sprite: brown crust along the right edge,
// red sauce body, two yellow cheese dots, one green basil dot.
function PixelPizzaSlice({ size = 16 }: { size?: number }) {
  const crust = "#c98a4b";
  const crustDark = "#7a4d22";
  const sauce = "#d63a2a";
  const cheese = "#ffe27a";
  const basil = "#3da33d";
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {/* Sauce / triangle body */}
      <rect x="1" y="2" width="5" height="1" fill={sauce} />
      <rect x="1" y="3" width="5" height="1" fill={sauce} />
      <rect x="2" y="4" width="4" height="1" fill={sauce} />
      <rect x="2" y="5" width="3" height="1" fill={sauce} />
      <rect x="3" y="6" width="2" height="1" fill={sauce} />
      {/* Crust on the right edge */}
      <rect x="6" y="2" width="1" height="5" fill={crust} />
      <rect x="7" y="3" width="1" height="3" fill={crustDark} />
      {/* Toppings */}
      <rect x="2" y="3" width="1" height="1" fill={cheese} />
      <rect x="4" y="4" width="1" height="1" fill={cheese} />
      <rect x="3" y="5" width="1" height="1" fill={basil} />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Pixel room SVG. Coordinates are in a 80x64 viewBox so 1 unit = 1 pixel
// of the pixel-art grid (regardless of how big it's rendered on screen).
// ────────────────────────────────────────────────────────────────────────
interface PixelRoomProps {
  phase: SkyPhase;
  slots: HomeState["slots"];
  arrange: boolean;
  computerOwned: boolean;
  computerClaimable: boolean;
  secondsToReady: number;
  plant: HomeState["plant"];
  /** Increments each time the player successfully waters the plant —
   *  forwarded to PlantSlotContent to (re-)trigger the happy shake +
   *  blue droplet burst. */
  wateringTick: number;
  onSlotClick: (slot: Slot) => void;
  friends: InvitedFriend[];
  /** Easter-egg: fired on every COMPUTER tap (regardless of slot
   *  position) so the parent can attempt the daily +200 $ZOOM bonus. */
  onComputerExtraClick?: () => void;
}

// Outdoor scene cycles when the user taps the window. Index 0 = the
// natural day/night sky (UTC-driven). Indices 1..3 are deliberate
// "skin" overrides — they ignore phase so a Pink Nebula stays pink even
// at midnight UTC. Stars draw on top only when phase==="night" still.
type OutdoorOverride = { sky: string; ground: string; labelKey: string; planet?: "ringed" | "giant" };
const OUTDOOR_SCENES: Array<OutdoorOverride | null> = [
  null,
  {
    sky: "linear-gradient(180deg, #2a0540 0%, #6a1480 45%, #ff5db5 100%)",
    ground: "#3a0a4a",
    labelKey: "home.scenery.pinkNebula",
  },
  {
    sky: "linear-gradient(180deg, #1a0533 0%, #471174 60%, #b47ce0 100%)",
    ground: "#2a1040",
    labelKey: "home.scenery.giantPlanet",
    planet: "giant",
  },
  {
    sky: "linear-gradient(180deg, #000000 0%, #050018 60%, #0a0030 100%)",
    ground: "#020010",
    labelKey: "home.scenery.deepSpace",
  },
];

function PixelRoom({ phase, slots, arrange, computerClaimable, plant, wateringTick, onSlotClick, visible, friends, onComputerExtraClick }: PixelRoomProps & { visible: boolean }) {
  const { t } = useT();
  // Read shared astronaut activity so the room can react to what the
  // robot is doing — used for the plant "cheer" hop while he is doing
  // push-ups near it.
  const roomActivity = useAstronautActivity();
  // Outdoor scene cycle (index into OUTDOOR_SCENES). null = follow phase.
  const [outdoorIdx, setOutdoorIdx] = useState(0);
  const [sceneLabel, setSceneLabel] = useState<string | null>(null);
  const override = OUTDOOR_SCENES[outdoorIdx] || null;
  const sky = override ? override.sky : PHASE_GRADIENT[phase];
  const ground = override ? override.ground : PHASE_GROUND[phase];
  // Night dim — when no outdoor override is active and it's night UTC,
  // darken the room interior so the lit lamp on the table reads as the
  // main light source.
  const nightDim = !override && phase === "night";
  const wall = nightDim ? "#1a1730" : "#2a2540";
  const wallTrim = nightDim ? "#27243f" : "#3a3556";
  const floor = nightDim ? "#3a2415" : "#5b3a22";
  const floorDark = nightDim ? "#2a1a0e" : "#3f2916";
  const lampLit = nightDim;

  // PC binary-rain easter egg — local visual flash. Lasts 1.5 s.
  const [pcAnim, setPcAnim] = useState(false);
  // Bed click → force the astronaut to walk to bed and sleep for ~30 s.
  const [forceSleepUntil, setForceSleepUntil] = useState(0);
  const sleeping = forceSleepUntil > Date.now();
  // Sofa click → force the astronaut to walk to the sofa and sit for ~30 s.
  const [forceSitUntil, setForceSitUntil] = useState(0);
  const sitting = forceSitUntil > Date.now();
  // Plant "cheer" should only fire when the astronaut is VISIBLY doing
  // push-ups in the room. The bed/sofa overrides re-route the displayed
  // sprite to "sleep"/"coffee" (see RoomLifeOverlay's `activity` calc),
  // so when sleeping or sitting we suppress the cheer even if the
  // shared store still says "pushups".
  const isPushupsActive = roomActivity === "pushups" && !sleeping && !sitting;
  // TV power state — toggles ON/OFF when the user taps the TV.
  const [tvOn, setTvOn] = useState(false);
  // View mode — "flat" (default elevation pixel view) vs "persp"
  // (3D first-person tilt with central vanishing point). Toggled by
  // a small floating widget in the top-right corner of the room.
  const [viewMode, setViewMode] = useState<"flat" | "persp">("flat");
  const persp = viewMode === "persp";
  // Re-tick every second so the room rerenders when forceSleep / forceSit
  // expire (the booleans are derived from absolute deadlines).
  const [, setSleepTick] = useState(0);
  useEffect(() => {
    if (!sleeping && !sitting) return;
    const id = window.setInterval(() => setSleepTick((x) => x + 1), 500);
    return () => window.clearInterval(id);
  }, [sleeping, sitting]);

  // ── Meteor shower behind the window ─────────────────────────────
  // Rare ambient event. Every 60-150 s we may spawn a "shower" of
  // 3-5 meteors with staggered delays so they trail across the
  // window panel one after another. Skipped while the page is
  // hidden (no point burning timers in the background).
  const [meteors, setMeteors] = useState<{ id: number; topPct: number; delayMs: number; durationMs: number }[]>([]);
  const meteorIdRef = useRef(0);
  useEffect(() => {
    if (!visible) {
      setMeteors([]);
      return;
    }
    let cancelled = false;
    const cullTimers = new Set<number>();
    let scheduleTimer: number;
    const burst = () => {
      if (cancelled) return;
      const count = 3 + Math.floor(Math.random() * 3); // 3..5
      const next: typeof meteors = [];
      let maxFinish = 0;
      for (let i = 0; i < count; i++) {
        const id = ++meteorIdRef.current;
        const topPct = 5 + Math.random() * 35; // upper portion of window
        const delayMs = i * (200 + Math.random() * 350);
        const durationMs = 1000 + Math.random() * 700;
        next.push({ id, topPct, delayMs, durationMs });
        maxFinish = Math.max(maxFinish, delayMs + durationMs);
      }
      setMeteors((prev) => [...prev, ...next]);
      const cull = window.setTimeout(() => {
        cullTimers.delete(cull);
        if (cancelled) return;
        const ids = new Set(next.map((m) => m.id));
        setMeteors((prev) => prev.filter((m) => !ids.has(m.id)));
      }, maxFinish + 400);
      cullTimers.add(cull);
      scheduleTimer = window.setTimeout(burst, 60000 + Math.random() * 90000);
    };
    // First shower lands 20-50 s after entering HOME so it doesn't
    // greet the user immediately.
    scheduleTimer = window.setTimeout(burst, 20000 + Math.random() * 30000);
    return () => {
      cancelled = true;
      window.clearTimeout(scheduleTimer);
      cullTimers.forEach((id) => window.clearTimeout(id));
      cullTimers.clear();
      setMeteors([]);
    };
  }, [visible]);

  const cycleOutdoor = useCallback(() => {
    setOutdoorIdx((i) => {
      const next = (i + 1) % OUTDOOR_SCENES.length;
      const scene = OUTDOOR_SCENES[next];
      const lbl = scene?.labelKey ? t(scene.labelKey) : phase.toUpperCase();
      setSceneLabel(lbl);
      window.setTimeout(() => setSceneLabel(null), 1800);
      return next;
    });
  }, [t, phase]);

  const triggerBedSleep = useCallback(() => {
    setForceSleepUntil(Date.now() + 30000);
  }, []);

  const triggerSofaSit = useCallback(() => {
    setForceSitUntil(Date.now() + 30000);
  }, []);

  const toggleTv = useCallback(() => {
    setTvOn((v) => !v);
  }, []);

  const triggerPcAnim = useCallback(() => {
    setPcAnim(true);
    window.setTimeout(() => setPcAnim(false), 1500);
  }, []);

  // Slot screen positions (% of room) — kept fixed across all devices.
  const SLOT_POS: Record<Slot, { left: string; top: string }> = {
    A: { left: "13%", top: "90%" },   // left: floor pedestal in front of the sofa (bottom-left)
    B: { left: "54%", top: "48%" },   // center: SITTING ON the dining table top
                                       // (table top surface is at y≈36/64 ≈ 56% — with the
                                       //  monitor sprite ~48px tall, centering at 48% lands
                                       //  the stand right on the table.)
    C: { left: "82%", top: "60%" },   // right: floor pedestal
  };

  // ── First-person 3D rig ─────────────────────────────────────────
  // When "persp" mode is on we build a true 3D box around the camera:
  // the existing pixel scene becomes the BACK WALL pushed to z=-DEPTH,
  // and four extra planes (floor, ceiling, left wall, right wall) hinge
  // along the viewport edges and recede toward the back wall, all
  // converging on a centered vanishing point. The camera sits inside
  // the room and looks straight at the back wall, giving the user an
  // immersive first-person view of their pixel apartment.
  const ROOM_DEPTH_PX = 420;        // distance from camera to back wall
  const PERSPECTIVE_PX = 620;       // CSS perspective focal length

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        // Perspective is ALWAYS on (even in flat mode) so toggling
        // between modes doesn't cause a flash: the back-wall plane
        // can smoothly animate its translateZ from 0 → -ROOM_DEPTH_PX
        // and back. With no translateZ in flat mode the scene looks
        // identical to a non-3D render.
        perspective: `${PERSPECTIVE_PX}px`,
        perspectiveOrigin: "50% 50%",
        overflow: "hidden",
        // Background is always dark — in FLAT mode the SVG covers the
        // entire viewport so this colour is invisible; in 3D mode it
        // fills the corner gaps where the wall planes don't reach.
        // Keeping it constant prevents the colour-fade flash that
        // happened when we transitioned bg between transparent ↔ dark.
        background: "#0a0e1a",
      }}
    >
      {/* 3D stage — preserves child transforms in 3D space so the
          back wall, floor, ceiling and side walls compose a real box. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
        }}
      >
      {/* Back-wall plane — holds the entire existing pixel scene.
          In FLAT mode it fills the viewport (scale = 1). In 1ST
          mode it shrinks to ~60% via a plain 2D scale() — which
          produces the EXACT same apparent size as a translateZ of
          -ROOM_DEPTH_PX through a perspective of PERSPECTIVE_PX
          (scale = P / (P + D) = 620 / 1040 ≈ 0.596). Using a 2D
          scale instead of a 3D translateZ keeps the interactive
          layer in plain 2D space, so all buttons (slots, bed,
          sofa, TV, window) remain reliably clickable on every
          browser — including the WebKit webview Telegram uses,
          which is finicky about 3D hit-testing. The corridor
          walls below stay in true 3D and converge on the same
          screen rectangle, so the visual still reads as depth. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "50% 50%",
          transform: persp
            ? `scale(${PERSPECTIVE_PX / (PERSPECTIVE_PX + ROOM_DEPTH_PX)})`
            : "none",
          transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      >
      {/* Background room layout. Single SVG so everything stays pixel-aligned. */}
      <svg
        viewBox="0 0 80 64"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{ imageRendering: "pixelated", display: "block" }}
      >
        {/* Wall */}
        <rect x="0" y="0" width="80" height="40" fill={wall} />
        {/* Wall trim line */}
        <rect x="0" y="38" width="80" height="2" fill={wallTrim} />
        {/* Floor */}
        <rect x="0" y="40" width="80" height="24" fill={floor} />
        {/* Floor planks darker stripe */}
        <rect x="0" y="48" width="80" height="1" fill={floorDark} />
        <rect x="0" y="56" width="80" height="1" fill={floorDark} />

        {/* Window — large panoramic window in the back wall */}
        <PixelWindow x={28} y={4} w={36} h={26} sky={sky} ground={ground} phase={phase} planet={override?.planet} hideStars={override != null} />

        {/* Bed (left wall) — wider variant so the sleeping astronaut
            fits under the covers without spilling over the foot board. */}
        <PixelBed x={2} y={28} width={22} />

        {/* TV mounted high on the LEFT wall, above the bed. Tapping it
            toggles power. */}
        <PixelTV x={5} y={10} on={tvOn} />

        {/* Sofa on the floor, just below the bed. Tapping it sends the
            astronaut to sit on it for ~30 s. */}
        <PixelSofa x={2} y={42} width={22} />

        {/* Shower stall (left, between bed and window/table area). Shifted
            right by 4 units to make room for the wider bed. */}
        <PixelShower x={26} y={22} />

        {/* Dining table + chair (center / right) */}
        <PixelTable x={36} y={36} />
        <PixelChair x={50} y={42} />
        {/* Bedside lamp on the dining table — only LIT during night UTC
            (and when no outdoor scene override is active). Provides the
            "warm pool of light" that explains the dimmed walls. */}
        <PixelLamp x={37} y={31} lit={lampLit} />

        {/* Fridge — right wall, sits on the floor */}
        <PixelFridge x={68} y={24} />

        {/* NFT poster — small framed pixel-art poster hanging on the
            wall above the fridge. Plain visual decoration: a thin
            dark frame with a stylised "NFT" label inside. */}
        {/* Frame */}
        <rect x="69" y="6" width="10" height="12" fill="#0a0e1a" />
        <rect x="70" y="7" width="8" height="10" fill="#1a1730" />
        {/* Inner art panel — gradient-feel using two stacked colors */}
        <rect x="70" y="7"  width="8" height="5"  fill="#3b1a5c" />
        <rect x="70" y="12" width="8" height="5"  fill="#5fb4ff" />
        {/* Tiny pixel star + dot on the upper half */}
        <rect x="73" y="9"  width="1" height="1" fill="#ffd740" />
        <rect x="74" y="8"  width="1" height="3" fill="#ffd740" />
        <rect x="75" y="9"  width="1" height="1" fill="#ffd740" />
        <rect x="72" y="10" width="5" height="1" fill="#ffd740" />
        {/* "NFT" label etched on the lower half (very small, pixel) */}
        <rect x="71" y="14" width="1" height="2" fill="#ffffff" />
        <rect x="72" y="14" width="1" height="1" fill="#ffffff" />
        <rect x="73" y="15" width="1" height="1" fill="#ffffff" />
        <rect x="74" y="14" width="1" height="2" fill="#ffffff" />
        <rect x="75" y="14" width="3" height="1" fill="#ffffff" />
        <rect x="76" y="15" width="1" height="1" fill="#ffffff" />
        {/* Tiny mounting nail above the frame */}
        <rect x="73" y="5"  width="2" height="1" fill="#9a9a9a" />
      </svg>

      {/* Meteor shower overlay — clipped to the window panel, sits
          ABOVE the SVG sky but BELOW the window click overlay so it
          never intercepts taps. Each meteor is a thin tapered streak
          that travels diagonally across the panel. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${(28 / 80) * 100}%`,
          top: `${(4 / 64) * 100}%`,
          width: `${(36 / 80) * 100}%`,
          height: `${(26 / 64) * 100}%`,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {meteors.map((m) => (
          <div
            key={m.id}
            style={{
              position: "absolute",
              left: "-12%",
              top: `${m.topPct}%`,
              width: 28,
              height: 2,
              background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(170,220,255,0.9) 60%, #ffffff 100%)",
              borderRadius: 2,
              boxShadow: "0 0 6px rgba(180,220,255,0.8)",
              opacity: 0,
              animation: `home-meteor ${m.durationMs}ms linear ${m.delayMs}ms 1`,
              animationFillMode: "forwards",
            }}
          />
        ))}
      </div>

      {/* Life overlay — astronaut going about his routine, plus the
          occasional bird drifting across the window. Sits ABOVE the room
          SVG and BELOW the slot buttons so it never intercepts clicks. */}
      <RoomLifeOverlay phase={phase} visible={visible} friends={friends} forceSleep={sleeping} forceSit={sitting} />

      {/* Warm lamp glow — soft yellow radial bloom over the table at
          night, reinforces that the lamp is the room's light source.
          Pure CSS, sits between the SVG and the interactive overlays. */}
      {lampLit && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${(38 / 80) * 100}%`,
            top: `${(34 / 64) * 100}%`,
            width: "32%",
            height: "40%",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(255,225,140,0.35) 0%, rgba(255,200,100,0.15) 40%, rgba(0,0,0,0) 70%)",
            pointerEvents: "none",
            animation: "home-lamp-glow 4s ease-in-out infinite",
          }}
        />
      )}

      {/* Window click overlay — cycles through outdoor scenes (default
          phase → Pink Nebula → Giant Planet → Deep Space). */}
      <button
        type="button"
        onClick={cycleOutdoor}
        aria-label={t("home.aria.cycleView")}
        style={{
          position: "absolute",
          left: `${(28 / 80) * 100}%`,
          top: `${(4 / 64) * 100}%`,
          width: `${(36 / 80) * 100}%`,
          height: `${(26 / 64) * 100}%`,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      />
      {sceneLabel && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${(46 / 80) * 100}%`,
            top: `${(2 / 64) * 100}%`,
            transform: "translate(-50%, 0)",
            background: "rgba(10,26,61,0.85)",
            color: "#fff",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 9,
            padding: "3px 6px",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.25)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            animation: "home-visitor-bubble 1.6s ease-in-out infinite",
          }}
        >
          {sceneLabel}
        </div>
      )}

      {/* Bed click overlay — astronaut walks to bed and sleeps for 30 s. */}
      <button
        type="button"
        onClick={triggerBedSleep}
        aria-label={t("home.aria.sleep")}
        style={{
          position: "absolute",
          left: `${(2 / 80) * 100}%`,
          top: `${(28 / 64) * 100}%`,
          width: `${(22 / 80) * 100}%`,
          height: `${(12 / 64) * 100}%`,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      />

      {/* TV click overlay — toggles power on/off. Mounted high on the
          left wall above the bed. */}
      <button
        type="button"
        onClick={toggleTv}
        aria-label={tvOn ? t("home.aria.tvOff") : t("home.aria.tvOn")}
        style={{
          position: "absolute",
          left: `${(5 / 80) * 100}%`,
          top: `${(10 / 64) * 100}%`,
          width: `${(14 / 80) * 100}%`,
          height: `${(12 / 64) * 100}%`,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      />

      {/* Sofa click overlay — astronaut walks to the sofa and sits
          for ~30 s. Sits BELOW the bed area so it doesn't conflict
          with the bed click target. */}
      <button
        type="button"
        onClick={triggerSofaSit}
        aria-label={t("home.aria.sitSofa")}
        style={{
          position: "absolute",
          left: `${(2 / 80) * 100}%`,
          top: `${(42 / 64) * 100}%`,
          width: `${(22 / 80) * 100}%`,
          height: `${(8 / 64) * 100}%`,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      />

      {/* Slot overlays — positioned absolutely on top of the SVG so we
          can attach onClick handlers and the rendered item without
          re-rendering the whole pixel scene. */}
      {(["A", "B", "C"] as Slot[]).map((s) => {
        const item = slots[s];
        const pos = SLOT_POS[s];
        // Plant slot (A) hops in "tifo" while the astronaut does
        // push-ups. The animation is applied to the inner content
        // wrapper (NOT the button) so the click hit-box stays put
        // and is never deformed by the bouncing transform.
        const cheering = s === "A" && item === "plant" && isPushupsActive;
        return (
          <button
            key={s}
            type="button"
            onClick={() => {
              // Easter-egg fires on EVERY computer tap (regardless of
              // whether the regular 24h stardust claim is ready). The
              // parent decides whether the +200 ZOOM bonus actually
              // lands; the binary-rain animation always plays so the
              // room reads as interactive.
              if (item === "computer" && !arrange) {
                triggerPcAnim();
                onComputerExtraClick?.();
              }
              onSlotClick(s);
            }}
            aria-label={`Slot ${s}`}
            style={{
              position: "absolute",
              left: pos.left,
              top: pos.top,
              transform: "translate(-50%, -50%)",
              width: 56,
              height: 56,
              padding: 0,
              background: "transparent",
              border: arrange && !item ? "2px dashed #ffd740" : "none",
              borderRadius: 6,
              cursor:
                arrange ||
                (item === "computer" && computerClaimable) ||
                (item === "plant" && plant.level < plant.maxLevel && plant.waterReady) ||
                (item === "plant" && plant.level >= plant.maxLevel && plant.claimReady)
                  ? "pointer"
                  : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {item === "computer" && (
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PixelComputerIcon size={64} screenOn={computerClaimable || pcAnim} showLabel />
                {/* Binary-rain overlay — covers the monitor screen with
                    falling 0/1 glyphs while the easter-egg animation
                    plays. Pure CSS, autocleaned after 1.5 s. */}
                {pcAnim && (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: "12.5%",
                      top: "12%",
                      width: "75%",
                      height: "55%",
                      overflow: "hidden",
                      pointerEvents: "none",
                      animation: "home-pc-flash 1.5s steps(6) 1 forwards",
                      borderRadius: 1,
                    }}
                  >
                    {Array.from({ length: 6 }).map((_, col) => (
                      <span
                        key={col}
                        style={{
                          position: "absolute",
                          left: `${(col * 100) / 6}%`,
                          top: 0,
                          width: `${100 / 6}%`,
                          color: "#7fff9f",
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 8,
                          lineHeight: 1,
                          textAlign: "center",
                          textShadow: "0 0 3px rgba(127,255,159,0.9)",
                          whiteSpace: "pre",
                          animation: `home-binary-fall 0.${5 + col}s linear ${col * 0.05}s infinite`,
                        }}
                      >
                        {"01\n10\n01\n11\n00\n10"}
                      </span>
                    ))}
                  </div>
                )}
                {computerClaimable && (
                  <span
                    aria-hidden
                    className="stardust-spawn-pop"
                    style={{
                      position: "absolute",
                      top: -10,
                      right: -8,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "radial-gradient(circle, #fff7c2 0%, #ffd740 60%, rgba(255,179,71,0) 90%)",
                      boxShadow: "0 0 10px rgba(255,215,64,0.95)",
                    }}
                  />
                )}
              </div>
            )}
            {item === "plant" && (
              <div
                style={{
                  animation: cheering
                    ? "home-plant-cheer 1.6s ease-in-out infinite"
                    : undefined,
                  transformOrigin: "50% 100%",
                }}
              >
                <PlantSlotContent plant={plant} wateringTick={wateringTick} />
              </div>
            )}
            {arrange && (
              <span
                style={{
                  position: "absolute",
                  bottom: -16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  color: "#ffd740",
                  textShadow: "0 0 6px rgba(0,0,0,0.8)",
                }}
              >
                {s}
              </span>
            )}
          </button>
        );
      })}
      </div>
      {/* End of back-wall plane. */}

      {/* Floor / ceiling / side walls — ALWAYS mounted, but their
          opacity fades in/out in sync with the back-wall transform
          so toggling between modes is one smooth motion (no flash
          from instant mount/unmount). Each plane hinges along a
          viewport edge and rotates 90° to recede into the screen,
          meeting the back-wall plane (at z = -ROOM_DEPTH_PX) along
          its far edge. Together they form a closed corridor that
          gives the user a real first-person sense of standing
          inside the apartment. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          // Walls are ALWAYS at full opacity. In FLAT mode they are
          // completely hidden behind the back-wall plane (which is
          // at scale 1 and covers the whole viewport). As soon as
          // the back-wall starts shrinking they reveal themselves
          // smoothly — no opacity fade means no black void appears
          // around the back-wall during the transition.
          opacity: 1,
          pointerEvents: "none",
        }}
      >
          {/* Floor — hinged along the bottom edge of the viewport. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: `${ROOM_DEPTH_PX}px`,
              transformOrigin: "50% 100%",
              transform: "rotateX(90deg)",
              background:
                "repeating-linear-gradient(0deg, #5b3a22 0px, #5b3a22 28px, #4a2f1c 28px, #4a2f1c 30px)",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.55)",
              backfaceVisibility: "hidden",
              pointerEvents: "none",
            }}
          />
          {/* Ceiling — hinged along the top edge of the viewport. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: `${ROOM_DEPTH_PX}px`,
              transformOrigin: "50% 0%",
              transform: "rotateX(-90deg)",
              background:
                "linear-gradient(180deg, #1a1730 0%, #2a2540 100%)",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.4)",
              backfaceVisibility: "hidden",
              pointerEvents: "none",
            }}
          />
          {/* Left wall — hinged along the left edge of the viewport. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: `${ROOM_DEPTH_PX}px`,
              transformOrigin: "0% 50%",
              transform: "rotateY(90deg)",
              background:
                "linear-gradient(90deg, #2f2a4a 0%, #1f1b35 100%)",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.4)",
              backfaceVisibility: "hidden",
              pointerEvents: "none",
            }}
          />
          {/* Right wall — hinged along the right edge of the viewport. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: `${ROOM_DEPTH_PX}px`,
              transformOrigin: "100% 50%",
              transform: "rotateY(-90deg)",
              background:
                "linear-gradient(270deg, #2f2a4a 0%, #1f1b35 100%)",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.4)",
              backfaceVisibility: "hidden",
              pointerEvents: "none",
            }}
          />
      </div>
      {/* End of corridor planes wrapper. */}
      </div>
      {/* End of 3D stage. */}

      {/* View-mode widget — small floating pill in the top-right
          corner. Toggles between FLAT (default elevation pixel
          look) and PERSP (3D first-person tilt). Sits OUTSIDE the
          tilted wrapper so it never rotates with the room. */}
      <button
        type="button"
        onClick={() => setViewMode((m) => (m === "flat" ? "persp" : "flat"))}
        aria-label={persp ? t("home.aria.viewFlat") : t("home.aria.viewFirst")}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 20,
          padding: "5px 9px",
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 8,
          letterSpacing: "0.08em",
          color: persp ? "#0a0e1a" : "#bcd9ec",
          background: persp
            ? "linear-gradient(135deg, #5fb4ff, #a8d8ff)"
            : "rgba(10,14,26,0.72)",
          border: `1px solid ${persp ? "#a8d8ff" : "rgba(188,217,236,0.45)"}`,
          borderRadius: 6,
          cursor: "pointer",
          boxShadow: persp ? "0 0 12px rgba(95,180,255,0.55)" : "0 0 6px rgba(0,0,0,0.4)",
          transition: "all 200ms ease",
        }}
      >
        {persp ? t("home.viewFirst") : t("home.viewFlat")}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Room life — astronaut routine + birds.
//
// Activity is now sourced from a SHARED store (`useAstronautActivity`)
// so the LAB status pill and HOME room always agree on what the
// astronaut is doing. Bird spawning stays local — birds are purely
// visual and only relevant inside the HOME window frame.
// ────────────────────────────────────────────────────────────────────────

interface Bird {
  id: number;
  direction: "ltr" | "rtl";
  topPct: number;
  durationS: number;
}

// ── Visitor (random guest who comes to greet) ─────────────────────
// A guest astronaut with a different palette walks in from one side
// of the room every 20–50 minutes, says "Ciao!" near the resident,
// and walks out. Phase timing:
//   "in"    → walking from the door toward the greeting spot
//   "greet" → standing next to the resident with a speech bubble
//   "out"   → walking back to the door and leaving the screen
type VisitorPhase = "in" | "greet" | "out";
interface Visitor {
  /** Door side — also the side the visitor enters from. */
  fromSide: "left" | "right";
  /** Index into VISITOR_PALETTES so each visit looks like a different guest. */
  paletteIdx: number;
  /** Current animation phase. */
  phase: VisitorPhase;
}
const VISITOR_IN_MS = 4500;     // walk from door to greeting spot
const VISITOR_GREET_MS = 6000;  // stand and say hello
const VISITOR_OUT_MS = 4500;    // walk back out
// Random delay between consecutive visits, in ms (20–50 minutes).
function nextVisitDelayMs(): number {
  const minMs = 20 * 60 * 1000;
  const maxMs = 50 * 60 * 1000;
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

// Stable hash → palette index, so the same friend always shows up in
// the same color (and same friend always sits in the same spot).
function friendHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// How long after a friend creates their account their astronaut keeps
// showing in the host's room. After this window the sprite simply
// disappears (the +20 ZOOM bonus and the lifetime referralCount are
// untouched — only the visual presence in the room times out).
const FRIEND_VISIT_MS = 30 * 60 * 1000;

// Where each invited friend stands in the host's room. Capped at the
// length of this array — beyond that, additional invites still earn the
// referral bonus but don't add more sprites (the room would be unreadable).
const FRIEND_SPOTS: { left: string; top: string }[] = [
  { left: "12%", top: "82%" },
  { left: "84%", top: "82%" },
  { left: "30%", top: "50%" },
  { left: "76%", top: "50%" },
];

// Random speech bubbles surfaced when the user taps the resident
// astronaut. Brief one-liners that hint at the game without nagging.
const ASTRO_SPEECH_KEYS = [
  "home.astronaut.line1",
  "home.astronaut.line2",
  "home.astronaut.line3",
  "home.astronaut.line4",
  "home.astronaut.line5",
] as const;

function RoomLifeOverlay({ phase, visible, friends, forceSleep, forceSit }: { phase: SkyPhase; visible: boolean; friends: InvitedFriend[]; forceSleep?: boolean; forceSit?: boolean }) {
  const { t } = useT();
  const baseActivity = useAstronautActivity();
  // Idle detection — if the user hasn't touched the screen for 30 s
  // we override the rotation and force the "drum" activity (the
  // astronaut grabs his sticks and bangs on the kitchen table).
  // Any pointer/touch/key resets the timer back to normal life.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = 0;
    const reset = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), 30000);
    };
    reset();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "touchstart", "keydown", "wheel"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true } as AddEventListenerOptions));
    return () => {
      window.clearTimeout(t);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, []);
  // forceSleep (bed click) wins over everything: idle→drum and the
  // normal rotation. forceSit (sofa click) is the same idea but uses
  // the "coffee" pose (the only sitting pose we have) and overrides
  // the position to the sofa via the pos override below. Both release
  // automatically when the parent flips the flag back to false.
  const activity: ReturnType<typeof useAstronautActivity> =
    forceSleep ? "sleep" : forceSit ? "coffee" : idle ? "drum" : baseActivity;
  const [birds, setBirds] = useState<Bird[]>([]);
  // Measure the room so the astronaut sprite scales relative to the
  // room size — keeps the character a sensible portion of the bed,
  // table, fridge etc. on every device.
  const overlayRef = useRef<HTMLDivElement>(null);
  const [roomW, setRoomW] = useState(420);
  useEffect(() => {
    const node = overlayRef.current;
    if (!node) return;
    setRoomW(node.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setRoomW(w);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  // Sprite width ~12% of room width, clamped so it never gets unreadable
  // on tiny screens or absurdly large on tablets/desktop.
  const spriteW = Math.max(48, Math.min(110, Math.round(roomW * 0.12)));
  // Persistent monotonic bird id so that stale cull timeouts from a
  // previous effect run can never collide with a freshly-spawned bird's
  // id and cause flicker.
  const birdIdRef = useRef(0);

  // Birds — only spawn when the sky outside is bright enough to see them.
  // Each bird also has its own cull timer; we track ALL of them in a Set
  // so cleanup truly cancels every pending timeout (otherwise a leftover
  // cull from cycle N could fire during cycle N+1 and remove a same-id
  // bird that's still flying).
  useEffect(() => {
    if (!visible || phase === "night") {
      setBirds([]);
      return;
    }
    let cancelled = false;
    let spawnTimer: number;
    const cullTimers = new Set<number>();
    const spawn = () => {
      if (cancelled) return;
      const direction: "ltr" | "rtl" = Math.random() < 0.5 ? "ltr" : "rtl";
      const topPct = 8 + Math.random() * 35;
      const durationS = 5 + Math.random() * 4;
      const bird: Bird = { id: ++birdIdRef.current, direction, topPct, durationS };
      setBirds((prev) => [...prev, bird]);
      const cull = window.setTimeout(() => {
        cullTimers.delete(cull);
        if (cancelled) return;
        setBirds((prev) => prev.filter((b) => b.id !== bird.id));
      }, durationS * 1000 + 500);
      cullTimers.add(cull);
      spawnTimer = window.setTimeout(spawn, 9000 + Math.random() * 24000);
    };
    spawnTimer = window.setTimeout(spawn, 4000 + Math.random() * 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(spawnTimer);
      cullTimers.forEach((id) => window.clearTimeout(id));
      cullTimers.clear();
      setBirds([]);
    };
  }, [visible, phase]);

  // Astronaut placement per activity. Coords are % of the room container,
  // matching the SVG's 80×64 furniture layout.
  const astroPos: Record<ReturnType<typeof useAstronautActivity>, { left: string; top: string }> = {
    sleep: { left: "16.25%", top: "51%" },  // exact center of the (wider) bed sheet
    walk: { left: "50%", top: "82%" },      // walking strip across the floor
    coffee: { left: "70%", top: "76%" },    // sitting on the chair
    snack: { left: "55%", top: "78%" },     // standing by the table
    window: { left: "57%", top: "78%" },    // standing on the floor UNDER the window, looking up
    exercise: { left: "40%", top: "78%" },  // jumping jacks center floor
    fridge: { left: "82%", top: "60%" },    // in front of the fridge
    shower: { left: "39%", top: "48%" },    // INSIDE the shower stall (centered on the glass area)
    play: { left: "44%", top: "82%" },      // crouched on the floor, facing the pet
    music: { left: "62%", top: "82%" },     // standing on the floor, head bobbing to the beat
    sing: { left: "38%", top: "82%" },      // singing in the middle of the floor
    pizza: { left: "76%", top: "78%" },     // standing next to the fridge with a pizza slice
    paint: { left: "30%", top: "78%" },     // standing on the floor, drawing on a sheet of paper
    pushups: { left: "20%", top: "92%" },   // lying on the floor RIGHT NEXT to the plant slot A
    drum: { left: "55%", top: "78%" },      // standing at the kitchen table, drumming
  };
  // Sofa coords (matches the SVG layout x=2..24, y=42..50). Center
  // of the seat cushion in container %.
  const SOFA_ASTRO_POS = { left: "16%", top: "70%" };
  // Each time the activity changes to "walk", pick a fresh random
  // starting X within the room perimeter (25%..75%) so the stroll
  // doesn't always begin from the same spot — gives the room a more
  // organic, non-linear feel. The Y stays anchored to the floor.
  const walkStartX = useMemo(() => {
    const min = 25;
    const max = 75;
    return `${Math.round(min + Math.random() * (max - min))}%`;
  }, [activity]);
  const basePos = forceSit ? SOFA_ASTRO_POS : astroPos[activity];
  const pos = activity === "walk" && !forceSit
    ? { left: walkStartX, top: basePos.top }
    : basePos;

  // ── Walking transition ─────────────────────────────────────────
  // The user wants every activity change to look like the astronaut
  // PHYSICALLY walks to the new spot, not teleports. We:
  //   1. detect a position change
  //   2. enter `isMoving` mode → render WalkingAstronaut, facing the
  //      direction of travel (compare left % values)
  //   3. let CSS animate `left`/`top` over 1.4 s
  //   4. exit `isMoving`, render the activity-specific sprite
  const TRAVEL_MS = 1400;
  const prevPosRef = useRef(pos);
  const [isMoving, setIsMoving] = useState(false);
  const [walkFacing, setWalkFacing] = useState<1 | -1>(1);
  useEffect(() => {
    const prev = prevPosRef.current;
    if (prev.left === pos.left && prev.top === pos.top) return;
    const prevLeftN = parseFloat(prev.left);
    const newLeftN = parseFloat(pos.left);
    setWalkFacing(newLeftN >= prevLeftN ? 1 : -1);
    setIsMoving(true);
    const t = window.setTimeout(() => {
      setIsMoving(false);
      prevPosRef.current = pos;
    }, TRAVEL_MS);
    return () => window.clearTimeout(t);
  }, [pos.left, pos.top]);

  // ── Phase 5: pet companion (Space Slime) ───────────────────────
  // Pet position + state derive from the astronaut's activity so
  // the two characters always read as a pair.
  const petPos: Record<ReturnType<typeof useAstronautActivity>, { left: string; top: string }> = {
    sleep: { left: "31%", top: "62%" },     // curled up at the foot of the (wider) bed
    walk: { left: "35%", top: "88%" },      // trailing the astronaut
    coffee: { left: "78%", top: "88%" },    // begging by the chair
    snack: { left: "65%", top: "88%" },     // sharing the table snack
    window: { left: "48%", top: "88%" },    // sitting by the astronaut on the floor under the window
    exercise: { left: "55%", top: "88%" },  // watching the workout
    fridge: { left: "72%", top: "88%" },    // tail of the astronaut at the fridge
    shower: { left: "50%", top: "88%" },    // waiting just outside the shower door, on the floor
    play: { left: "52%", top: "82%" },      // right next to the astronaut, hopping around
    music: { left: "70%", top: "88%" },     // bobbing along on the floor next to the astronaut
    sing: { left: "46%", top: "88%" },      // listening to the singing astronaut
    pizza: { left: "68%", top: "88%" },     // begging for a pizza crumb on the floor
    paint: { left: "20%", top: "88%" },     // sitting next to the painter, watching
    pushups: { left: "32%", top: "92%" },   // sitting next to the lying astronaut, watching
    drum: { left: "65%", top: "88%" },      // bopping along to the drum beat next to the table
  };
  const petState: "idle" | "sleep" | "eat" =
    activity === "sleep" ? "sleep" :
    activity === "snack" || activity === "fridge" || activity === "coffee" || activity === "pizza" ? "eat" :
    "idle";
  // Pet snuggles next to the astronaut on the sofa when sitting.
  const SOFA_PET_POS = { left: "30%", top: "76%" };
  const pet = forceSit ? SOFA_PET_POS : petPos[activity];
  // Pet ~45% the size of the astronaut so it reads as a small companion.
  const petW = Math.max(22, Math.round(spriteW * 0.55));

  // ── Visitor scheduling ─────────────────────────────────────────
  // Schedule a guest visit every 20-50 minutes. The visitor enters
  // from one of the room sides, walks toward the astronaut, says
  // "Ciao!" with a speech bubble for a few seconds, then walks out.
  // Pause everything when the page is hidden so timers don't pile up.
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const timers = new Set<number>();
    const startVisit = () => {
      if (cancelled) return;
      const fromSide: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
      const paletteIdx = Math.floor(Math.random() * VISITOR_PALETTES.length);
      setVisitor({ fromSide, paletteIdx, phase: "in" });
      const tGreet = window.setTimeout(() => {
        if (cancelled) return;
        setVisitor((v) => (v ? { ...v, phase: "greet" } : v));
        const tOut = window.setTimeout(() => {
          if (cancelled) return;
          setVisitor((v) => (v ? { ...v, phase: "out" } : v));
          const tEnd = window.setTimeout(() => {
            if (cancelled) return;
            setVisitor(null);
            const tNext = window.setTimeout(startVisit, nextVisitDelayMs());
            timers.add(tNext);
          }, VISITOR_OUT_MS);
          timers.add(tEnd);
        }, VISITOR_GREET_MS);
        timers.add(tOut);
      }, VISITOR_IN_MS);
      timers.add(tGreet);
    };
    // First visit: schedule it within the same 20-50 min window so
    // people don't see a guest immediately on every page load.
    const first = window.setTimeout(startVisit, nextVisitDelayMs());
    timers.add(first);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      setVisitor(null);
    };
  }, [visible]);

  // Visitor placement. The "greeting spot" is just to the side of the
  // resident astronaut so the two characters read as facing each other.
  // When entering/leaving, the visitor sits at the door (off-screen).
  const visitorGreetLeft = visitor
    ? visitor.fromSide === "left"
      ? `calc(${pos.left} - ${Math.round(spriteW * 1.0)}px)`
      : `calc(${pos.left} + ${Math.round(spriteW * 1.0)}px)`
    : pos.left;
  const visitorOffLeft = visitor?.fromSide === "left" ? "-12%" : "112%";
  const visitorLeft =
    visitor?.phase === "greet" ? visitorGreetLeft : visitor?.phase === "in" ? visitorGreetLeft : visitorOffLeft;
  // Visitor faces the resident: from the LEFT door means walking right (+1),
  // from the RIGHT door means walking left (-1). When greeting they keep
  // facing the resident; when leaving they flip to head back to the door.
  const visitorFacing: 1 | -1 =
    visitor?.phase === "out"
      ? visitor.fromSide === "left" ? -1 : 1
      : visitor?.fromSide === "left" ? 1 : -1;

  // ── Welcome wave on app open ───────────────────────────────────
  // First mount: the astronaut waves and a "Welcome back, Commander!"
  // speech bubble pops above his helmet for ~5 seconds.
  const [welcome, setWelcome] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setWelcome(false), 5000);
    return () => window.clearTimeout(t);
  }, []);

  // ── Annoyed astronaut (10 fast clicks) ─────────────────────────
  // Tap the astronaut 10 times within 3 seconds → he turns RED, puffs
  // smoke and dashes to the OPPOSITE side of the room. Holds the
  // grumpy state for a few seconds before going back to normal life.
  const ANNOYED_PALETTE = {
    suit: "#d63a2a",
    suitShade: "#7a1f15",
    helmet: "#f4c8c2",
    accent: "#ffd166",
    visorShine: "#ffd166",
  };
  const [annoyed, setAnnoyed] = useState(false);
  const [escapePos, setEscapePos] = useState<{ left: string; top: string } | null>(null);
  const clickTimesRef = useRef<number[]>([]);
  // Single-tap easter egg: jump + random English speech bubble. The
  // bubble auto-clears after 2.5 s; the jump animation runs once per
  // tap and is throttled by `jumping` so spam-clicking doesn't restart
  // it mid-air. Annoyed mode (10 fast clicks) still takes priority.
  const [jumping, setJumping] = useState(false);
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const onAstroClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (annoyed) return;
    const now = Date.now();
    if (!jumping) {
      setJumping(true);
      setBubbleText(t(ASTRO_SPEECH_KEYS[Math.floor(Math.random() * ASTRO_SPEECH_KEYS.length)]!));
      window.setTimeout(() => setJumping(false), 600);
      window.setTimeout(() => setBubbleText((cur) => (cur && Date.now() - now >= 2400 ? null : cur)), 2500);
    }
    clickTimesRef.current = [...clickTimesRef.current.filter((t) => now - t < 3000), now];
    if (clickTimesRef.current.length >= 10) {
      clickTimesRef.current = [];
      const curLeftN = parseFloat(pos.left);
      // Dash to the opposite half of the room, keeping the same Y.
      const escLeft = curLeftN < 50 ? "85%" : "15%";
      setEscapePos({ left: escLeft, top: "82%" });
      setAnnoyed(true);
      window.setTimeout(() => {
        setAnnoyed(false);
        setEscapePos(null);
      }, 6000);
    }
  };
  // While annoyed, override the activity-driven position with the
  // escape spot so the existing CSS transition slides him over there.
  const effectivePos = escapePos ?? pos;

  return (
    <div
      ref={overlayRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Window sky overlay — birds clip to this rect so they only
          appear inside the window frame (matches the SVG window at
          x=29..63, y=5..24 of the 80×64 viewBox). */}
      <div
        style={{
          position: "absolute",
          left: `${(29 / 80) * 100}%`,
          top: `${(5 / 64) * 100}%`,
          width: `${(34 / 80) * 100}%`,
          height: `${(19 / 64) * 100}%`,
          overflow: "hidden",
        }}
      >
        {birds.map((b) => (
          <div
            key={b.id}
            style={{
              position: "absolute",
              left: 0,
              top: `${b.topPct}%`,
              width: 12,
              height: 6,
              animation: `${b.direction === "ltr" ? "home-bird-ltr" : "home-bird-rtl"} ${b.durationS}s linear forwards`,
            }}
          >
            <div style={{ animation: "home-bird-flap 0.35s ease-in-out infinite" }}>
              <PixelBird />
            </div>
          </div>
        ))}
      </div>

      {/* Astronaut — sprite size scales with the measured room width
          so the character is always proportional to the furniture.
          Slow CSS transition (1.4s ease-in-out) so the slide between
          two activity spots is clearly visible as a walk, not a jump. */}
      <div
        onClick={onAstroClick}
        style={{
          position: "absolute",
          left: effectivePos.left,
          top: effectivePos.top,
          width: spriteW,
          height: spriteW,
          transform: "translate(-50%, -50%)",
          transition: annoyed
            ? "left 1.2s ease-in, top 1.2s ease-in"
            : `left ${TRAVEL_MS}ms ease-in-out, top ${TRAVEL_MS}ms ease-in-out`,
          // Make the sprite tappable so the "10 fast clicks" easter
          // egg can fire. Parent overlay disables pointer events.
          pointerEvents: "auto",
          cursor: "pointer",
        }}
      >
        {/* Welcome speech bubble — only on first mount, ~5s. Replaced
            by the random tap-bubble whenever the user clicks the
            astronaut directly. */}
        {(welcome || bubbleText) && !annoyed && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translate(-50%, -4px)",
              background: "#fff",
              color: "#0a1a3d",
              fontFamily: "'Press Start 2P', monospace",
              fontSize: Math.max(8, Math.round(spriteW * 0.16)),
              padding: "4px 6px",
              borderRadius: 4,
              border: "2px solid #0a1a3d",
              whiteSpace: "nowrap",
              animation: "home-visitor-bubble 2s ease-in-out infinite",
              pointerEvents: "none",
            }}
          >
            {bubbleText || t("home.welcomeBack")}
          </div>
        )}
        {/* Sleeping Zzz cloud — drifts up from the helmet whenever the
            astronaut is asleep (random sleep activity OR forced bed nap). */}
        {activity === "sleep" && !annoyed && (
          <>
            {[0, 0.6, 1.2].map((d, i) => (
              <span
                key={i}
                aria-hidden
                style={{
                  position: "absolute",
                  left: "60%",
                  top: "10%",
                  fontSize: Math.max(10, Math.round(spriteW * 0.32)),
                  color: "#cfe4ff",
                  fontFamily: "'Press Start 2P', monospace",
                  textShadow: "0 0 4px rgba(0,0,0,0.5)",
                  animation: `home-z-float 2.4s ease-out ${d}s infinite`,
                  pointerEvents: "none",
                }}
              >
                Z
              </span>
            ))}
          </>
        )}
        {/* Smoke puffs while annoyed — three offset puffs rising */}
        {annoyed && (
          <>
            {[0, 0.25, 0.55].map((delay, i) => (
              <div
                key={i}
                aria-hidden
                style={{
                  position: "absolute",
                  left: `${30 + i * 20}%`,
                  top: "10%",
                  width: Math.max(6, Math.round(spriteW * 0.22)),
                  height: Math.max(6, Math.round(spriteW * 0.22)),
                  borderRadius: "50%",
                  background: "rgba(180,180,180,0.85)",
                  filter: "blur(1px)",
                  animation: `home-annoyed-smoke 1.2s ease-out ${delay}s infinite`,
                  pointerEvents: "none",
                }}
              />
            ))}
          </>
        )}
        {annoyed ? (
          // Angry RED astronaut dashing across the room.
          <div style={{ transform: `scaleX(${escapePos && parseFloat(escapePos.left) < parseFloat(pos.left) ? -1 : 1})` }}>
            <div style={{ animation: "home-astro-bob 0.3s ease-in-out infinite" }}>
              <WalkingVisitor width={spriteW} palette={ANNOYED_PALETTE} />
            </div>
          </div>
        ) : welcome ? (
          // Standing still + waving hand. Same standing sprite, plus a
          // small skin-coloured hand that swings overhead like a wave.
          <div style={{ position: "relative" }}>
            <PixelAstronaut pose="stand" width={spriteW} />
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "78%",
                top: "8%",
                width: Math.max(6, Math.round(spriteW * 0.22)),
                height: Math.max(6, Math.round(spriteW * 0.22)),
                background: "#f3f4f6",
                borderRadius: 2,
                transformOrigin: "50% 100%",
                animation: "home-astro-wave 0.55s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
          </div>
        ) : isMoving ? (
          // Travelling between activity spots — show the walking sprite
          // with bob, flipped to face the direction of travel.
          <div style={{ transform: `scaleX(${walkFacing})` }}>
            <div style={{ animation: "home-astro-bob 0.5s ease-in-out infinite" }}>
              <WalkingAstronaut width={spriteW} />
            </div>
          </div>
        ) : (
          <div style={{ animation: jumping ? "home-astro-jump 0.6s ease-out 1" : undefined }}>
        {activity === "sleep" && (
          // Total figure ~1.8 × spriteW so the lying body has the same
          // proportions as a standing astronaut tipped on its side.
          // helmetWidth = spriteW makes the helmet render at the SAME
          // visual size as in every other activity (stand, walk, etc.)
          // — the user wanted the helmet not to shrink while sleeping.
          <SleepingAstronaut
            width={Math.round(spriteW * 1.8)}
            helmetWidth={spriteW}
          />
        )}
        {activity === "walk" && (
          // 14 s cycle = walk → pause → walk → pause (see keyframe).
          // ease-in-out smooths the start/stop of each leg of the walk
          // so the pauses don't look like the animation hitched.
          <div style={{ animation: "home-astro-walk 14s ease-in-out infinite" }}>
            <div style={{ animation: "home-astro-bob 0.5s ease-in-out infinite" }}>
              <WalkingAstronaut width={spriteW} />
            </div>
          </div>
        )}
        {activity === "coffee" && (
          // Standing pose holding a mug — keeps the SAME full-height
          // sprite as every other activity, so the character does not
          // visually shrink when he takes a coffee.
          <div style={{ position: "relative" }}>
            <PixelAstronaut pose="coffee" width={spriteW} />
            <CoffeeSteam />
          </div>
        )}
        {activity === "snack" && <PixelAstronaut pose="snack" width={spriteW} />}
        {activity === "window" && (
          // Gentle horizontal sway — looks like he's leaning side to
          // side at the window, NOT a full body turn (which the player
          // explicitly disliked). 4 s cycle keeps it subtle.
          <div style={{ animation: "home-astro-window-sway 4s ease-in-out infinite" }}>
            <PixelAstronaut pose="stand" facing="up" width={spriteW} />
          </div>
        )}
        {activity === "exercise" && <ExercisingAstronaut width={spriteW} />}
        {activity === "pushups" && <PushupAstronaut width={spriteW} />}
        {activity === "fridge" && <DrinkingAstronaut width={spriteW} />}
        {activity === "shower" && <ShoweringAstronaut width={spriteW} />}
        {activity === "play" && (
          // Astronaut standing next to the pet with a tiny heart drifting
          // up between them. Gentle bob suggests bending down to play.
          <div style={{ position: "relative", animation: "home-astro-bob 0.7s ease-in-out infinite" }}>
            <PixelAstronaut pose="stand" width={spriteW} />
            <span
              style={{
                position: "absolute",
                left: "100%",
                bottom: "55%",
                fontSize: Math.round(spriteW * 0.22),
                color: "#ff7a8a",
                textShadow: "0 0 4px rgba(0,0,0,0.5)",
                animation: "home-play-heart 2.2s ease-in-out infinite",
              }}
            >
              ♥
            </span>
          </div>
        )}
        {activity === "music" && (
          // Listening to music — head bobs to the beat, three musical
          // notes drift up from beside the helmet, each on its own delay.
          <div style={{ position: "relative", animation: "home-astro-bob 0.45s ease-in-out infinite" }}>
            <PixelAstronaut pose="stand" width={spriteW} />
            {[0, 0.7, 1.4].map((d, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: i % 2 === 0 ? "92%" : "-12%",
                  bottom: "60%",
                  fontSize: Math.round(spriteW * 0.26),
                  color: "#9ad8ff",
                  textShadow: "0 0 4px rgba(0,0,0,0.55)",
                  animation: `home-music-note 2.4s ease-in-out ${d}s infinite`,
                }}
              >
                ♪
              </span>
            ))}
          </div>
        )}
        {activity === "pizza" && (
          // Standing next to the fridge holding a slice of pizza.
          // Same full-height standing sprite (no shrinking) + a small
          // pixel pizza slice in the right hand + chew animation.
          <div style={{ position: "relative", animation: "home-chew 0.6s ease-in-out infinite" }}>
            <PixelAstronaut pose="stand" width={spriteW} />
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "60%",
                bottom: "38%",
                width: Math.round(spriteW * 0.35),
                height: Math.round(spriteW * 0.35),
              }}
            >
              <PixelPizzaSlice size={Math.round(spriteW * 0.35)} />
            </div>
          </div>
        )}
        {activity === "paint" && (
          // PAINTER — standing on the floor holding a small sheet of
          // paper in one hand and a brush in the other. A few colored
          // pixel dots already on the paper, with a tiny brush-stroke
          // animation so it looks like he's actually painting.
          <div style={{ position: "relative" }}>
            <PixelAstronaut pose="stand" width={spriteW} />
            {/* Paper held in front of the chest */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "10%",
                top: "38%",
                width: Math.round(spriteW * 0.45),
                height: Math.round(spriteW * 0.45),
                background: "#fffaf0",
                border: "2px solid #0a1a3d",
              }}
            >
              {/* A few colored pixels — the ongoing painting */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", width: "100%", height: "100%" }}>
                {["#d63a2a","#ffd166","#3da33d","#7fdfff","#7a4cc4","#ff8a3c","#fffaf0","#fffaf0",
                  "#fffaf0","#3da33d","#d63a2a","#fffaf0","#fffaf0","#fffaf0","#7fdfff","#ffd166"
                ].map((c, i) => (
                  <div key={i} style={{ background: c }} />
                ))}
              </div>
            </div>
            {/* Brush — small wooden stick with a colored tip, swings
                back and forth to mimic painting strokes. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "55%",
                top: "55%",
                width: Math.max(6, Math.round(spriteW * 0.30)),
                height: Math.max(2, Math.round(spriteW * 0.08)),
                background: "#8a5a2a",
                transformOrigin: "0% 50%",
                animation: "home-astro-paint 0.45s ease-in-out infinite",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  right: -Math.max(2, Math.round(spriteW * 0.06)),
                  top: -Math.max(1, Math.round(spriteW * 0.03)),
                  width: Math.max(3, Math.round(spriteW * 0.10)),
                  height: Math.max(3, Math.round(spriteW * 0.14)),
                  background: "#d63a2a",
                }}
              />
            </div>
          </div>
        )}
        {activity === "drum" && (
          // DRUMMER — standing at the kitchen table, banging two white
          // drumsticks on the surface. Three pixel notes (♪ ♫ ♬) pop
          // out in a steady rhythm so it really reads as "playing".
          <div style={{ position: "relative", animation: "home-astro-bob 0.3s ease-in-out infinite" }}>
            <PixelAstronaut pose="stand" width={spriteW} />
            {/* Two drumsticks angled toward the table top */}
            {[-1, 1].map((side) => (
              <div
                key={side}
                aria-hidden
                style={{
                  position: "absolute",
                  left: side < 0 ? "8%" : "70%",
                  top: "55%",
                  width: Math.max(2, Math.round(spriteW * 0.08)),
                  height: Math.max(8, Math.round(spriteW * 0.40)),
                  background: "#fffaf0",
                  borderRadius: 1,
                  transformOrigin: "50% 0%",
                  animation: `home-astro-drumstick 0.30s ease-in-out ${side < 0 ? 0 : 0.15}s infinite`,
                }}
              />
            ))}
            {/* Rhythmic notes flying out of the kitchen table */}
            {[
              { d: 0,    side: -1, sym: "♪" },
              { d: 0.30, side:  1, sym: "♫" },
              { d: 0.60, side: -1, sym: "♬" },
              { d: 0.90, side:  1, sym: "♪" },
            ].map((n, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: n.side > 0 ? "85%" : "0%",
                  bottom: "-10%",
                  fontSize: Math.round(spriteW * 0.28),
                  color: "#9ad8ff",
                  textShadow: "0 0 4px rgba(0,0,0,0.5)",
                  animation: `home-music-note 1.6s ease-out ${n.d}s infinite`,
                }}
              >
                {n.sym}
              </span>
            ))}
          </div>
        )}
        {/* sing block below */}
        {activity === "sing" && (
          // Singing — gentler bob and louder notes (♫) coming OUT of the
          // helmet area, fanning upward and to the sides.
          <div style={{ position: "relative", animation: "home-astro-bob 0.6s ease-in-out infinite" }}>
            <PixelAstronaut pose="stand" width={spriteW} />
            {[
              { d: 0,   side: -1, sym: "♫" },
              { d: 0.6, side:  1, sym: "♪" },
              { d: 1.2, side: -1, sym: "♬" },
              { d: 1.8, side:  1, sym: "♫" },
            ].map((n, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: n.side > 0 ? "85%" : "-5%",
                  bottom: "70%",
                  fontSize: Math.round(spriteW * 0.30),
                  color: "#ffd166",
                  textShadow: "0 0 5px rgba(0,0,0,0.6)",
                  animation: `home-sing-note 2.2s ease-out ${n.d}s infinite`,
                }}
              >
                {n.sym}
              </span>
            ))}
          </div>
        )}
          </div>
        )}
      </div>

      {/* Visitor — random guest who walks in every 20-50 minutes,
          says "Ciao!" near the resident astronaut, then walks back
          out. Same sprite as WalkingAstronaut, recolored via palette. */}
      {visitor && (
        <div
          style={{
            position: "absolute",
            left: visitorLeft,
            top: pos.top,
            width: spriteW,
            height: spriteW,
            transform: "translate(-50%, -50%)",
            transition: `left ${visitor.phase === "in" ? VISITOR_IN_MS : visitor.phase === "out" ? VISITOR_OUT_MS : 300}ms ease-in-out`,
          }}
        >
          {/* Speech bubble — only during the greeting phase. */}
          {visitor.phase === "greet" && (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: "50%",
                transform: "translate(-50%, -4px)",
                background: "#fff",
                color: "#0a1a3d",
                fontFamily: "'Press Start 2P', monospace",
                fontSize: Math.max(8, Math.round(spriteW * 0.18)),
                padding: "4px 6px",
                borderRadius: 4,
                border: "2px solid #0a1a3d",
                whiteSpace: "nowrap",
                animation: "home-visitor-bubble 2s ease-in-out infinite",
              }}
            >
              {t("home.ciao")}
            </div>
          )}
          <div style={{ transform: `scaleX(${visitorFacing})` }}>
            {visitor.phase === "greet" ? (
              // Standing still during greeting — small bob so they feel alive.
              <div style={{ animation: "home-astro-bob 0.6s ease-in-out infinite" }}>
                <PixelAstronaut
                  pose="stand"
                  width={spriteW}
                  palette={VISITOR_PALETTES[visitor.paletteIdx]}
                />
              </div>
            ) : (
              <div style={{ animation: "home-astro-bob 0.5s ease-in-out infinite" }}>
                <WalkingVisitor width={spriteW} palette={VISITOR_PALETTES[visitor.paletteIdx]!} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Friend astronauts — one per accepted referral, capped at
          FRIEND_SPOTS.length so the room stays readable. Each friend
          gets a stable color (palette derived from a hash of their
          telegramId) and a stable spot, with their first name floating
          above the helmet. They idle in place with a small bob.
          Auto-hidden after FRIEND_VISIT_MS from their join time so the
          room doesn't stay cluttered forever — counted server-side off
          the friend's account creation timestamp. */}
      {friends.filter((f) => {
        const t = Date.parse(f.joinedAt);
        if (!Number.isFinite(t)) return true;
        return Date.now() - t < FRIEND_VISIT_MS;
      }).slice(0, FRIEND_SPOTS.length).map((f, i) => {
        const spot = FRIEND_SPOTS[i]!;
        const palette = VISITOR_PALETTES[friendHash(f.key) % VISITOR_PALETTES.length]!;
        const label = (f.name || "Friend").slice(0, 12);
        // Even-indexed friends face right (+1), odd face left (-1) so
        // they don't all look the same direction.
        const facing = i % 2 === 0 ? 1 : -1;
        return (
          <div
            key={f.key}
            style={{
              position: "absolute",
              left: spot.left,
              top: spot.top,
              width: spriteW,
              height: spriteW,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: "50%",
                transform: "translate(-50%, -2px)",
                background: "rgba(10,26,61,0.85)",
                color: "#fff",
                fontFamily: "'Press Start 2P', monospace",
                fontSize: Math.max(7, Math.round(spriteW * 0.13)),
                padding: "2px 5px",
                borderRadius: 3,
                border: "1px solid rgba(0,230,118,0.45)",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {label}
            </div>
            <div style={{ transform: `scaleX(${facing})` }}>
              <div style={{ animation: "home-astro-bob 0.7s ease-in-out infinite" }}>
                <PixelAstronaut pose="stand" width={spriteW} palette={palette} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Pet companion — Space Slime. Smoothly drifts with the astronaut. */}
      <div
        style={{
          position: "absolute",
          left: pet.left,
          top: pet.top,
          width: petW,
          height: petW,
          transform: "translate(-50%, -50%)",
          transition: "left 0.8s ease, top 0.8s ease",
        }}
      >
        <PixelPet state={petState} width={petW} />
      </div>
    </div>
  );
}

function PixelWindow({ x, y, w, h, sky, ground, phase, planet, hideStars }: { x: number; y: number; w: number; h: number; sky: string; ground: string; phase: SkyPhase; planet?: "ringed" | "giant"; hideStars?: boolean }) {
  const frame = "#cfd6e6";
  const frameId = `winsky-${phase}-${planet || "n"}-${hideStars ? "h" : "v"}`;
  // Star dots only at night AND when no outdoor scene override hides them.
  const stars = !hideStars && phase === "night" ? [
    [4, 3], [10, 5], [16, 2], [22, 6], [28, 3], [33, 5],
    [6, 9], [14, 11], [20, 8], [26, 12], [31, 9],
  ] : [];
  // Pre-compute the giant planet (a chunky pixel-art circle approximation
  // covering most of the right half of the window) so the SVG returns it
  // when the user has cycled to the Giant Planet outdoor scene.
  const giantPlanet = planet === "giant" ? (
    <g>
      <circle cx={x + w * 0.65} cy={y + h * 0.45} r={Math.min(w, h) * 0.35} fill="#ff8c5a" />
      <ellipse cx={x + w * 0.55} cy={y + h * 0.4} rx={Math.min(w, h) * 0.18} ry={Math.min(w, h) * 0.05} fill="#ffba8a" opacity={0.75} />
      <ellipse cx={x + w * 0.7} cy={y + h * 0.5} rx={Math.min(w, h) * 0.2} ry={Math.min(w, h) * 0.04} fill="#c25a32" opacity={0.7} />
    </g>
  ) : null;
  return (
    <g>
      {/* Frame outer */}
      <rect x={x} y={y} width={w} height={h} fill={frame} />
      {/* Sky inside (using a gradient-coloured rect via foreignObject would
          break pixelation; instead we approximate with a single fill that
          matches the phase palette midpoint). */}
      <defs>
        <linearGradient id={frameId} x1="0" y1="0" x2="0" y2="1">
          {sky.includes("180deg") && (() => {
            // Parse the gradient stops out of the CSS string for SVG.
            const m = sky.match(/#([0-9a-f]{6})/gi) || [];
            return m.map((c, i) => (
              <stop key={i} offset={`${(i / Math.max(1, m.length - 1)) * 100}%`} stopColor={c} />
            ));
          })()}
        </linearGradient>
      </defs>
      <rect x={x + 1} y={y + 1} width={w - 2} height={h - 6} fill={`url(#${frameId})`} />
      {/* Giant planet (Easter-egg outdoor scene) drawn on top of the sky
          and underneath the cross-frame so it reads as "out the window". */}
      {giantPlanet}
      {/* Ground band */}
      <rect x={x + 1} y={y + h - 6} width={w - 2} height={5} fill={ground} />
      {/* Stars — slow pulse (opacity in/out) with a per-star delay so
          they twinkle out of sync, like a real night sky. 4s cycle. */}
      {stars.map(([sx, sy], i) => (
        <rect
          key={i}
          x={x + sx}
          y={y + sy}
          width={1}
          height={1}
          fill="#ffffff"
          style={{
            animation: `home-star-pulse 4s ease-in-out ${(i * 0.37) % 4}s infinite`,
            transformOrigin: "center",
          }}
        />
      ))}
      {/* Cross frame */}
      <rect x={x + w / 2 - 1} y={y} width={2} height={h} fill={frame} />
      <rect x={x} y={y + h / 2 - 1} width={w} height={2} fill={frame} />
      {/* Sill */}
      <rect x={x - 2} y={y + h - 1} width={w + 4} height={2} fill={frame} />
    </g>
  );
}

// Bedside lamp — small base + shade. When `lit`, the shade glows yellow
// with a soft pulsing CSS animation. Pure SVG so it composes inside the
// pixel-art room without breaking the pixelated rendering.
function PixelLamp({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  const shade = lit ? "#ffd97a" : "#7a6a40";
  const base = "#3a2f1a";
  return (
    <g>
      {/* Shade (trapezoid-ish: wider top) */}
      <rect x={x} y={y} width={4} height={1} fill={shade} />
      <rect x={x - 1} y={y + 1} width={6} height={2} fill={shade} />
      {/* Neck */}
      <rect x={x + 1} y={y + 3} width={2} height={1} fill={base} />
      {/* Base */}
      <rect x={x - 1} y={y + 4} width={6} height={1} fill={base} />
      {lit && (
        <rect
          x={x - 2}
          y={y - 1}
          width={8}
          height={6}
          fill="#ffe7a0"
          opacity={0.25}
          style={{ animation: "home-lamp-glow 4s ease-in-out infinite" }}
        />
      )}
    </g>
  );
}

function PixelBed({ x, y, width = 22 }: { x: number; y: number; width?: number }) {
  const frame = "#5d3b1e";
  const sheet = "#7da7d9";
  const sheetDark = "#5e8bbd";
  const pillow = "#f3f0e6";
  // Internal proportions scale with the bed width so a narrower bed
  // still keeps a sensible pillow + sheet layout.
  const sheetW = width - 6;
  const pillowW = Math.max(3, Math.round(sheetW * 0.35));
  return (
    <g>
      {/* Frame */}
      <rect x={x} y={y + 6} width={width} height={4} fill={frame} />
      {/* Headboard (left, tall) + foot board (right, short) */}
      <rect x={x} y={y} width={3} height={10} fill={frame} />
      <rect x={x + width - 3} y={y + 3} width={3} height={7} fill={frame} />
      {/* Sheet */}
      <rect x={x + 3} y={y + 2} width={sheetW} height={5} fill={sheet} />
      <rect x={x + 3} y={y + 6} width={sheetW} height={1} fill={sheetDark} />
      {/* Pillow — sits at the head end (left, after the headboard) */}
      <rect x={x + 4} y={y + 3} width={pillowW} height={3} fill={pillow} />
    </g>
  );
}

/** Wall-mounted shower stall on the floor: tile back wall, showerhead,
 *  pale-blue glass front and a darker tray base. Drawn as a 10×18 unit
 *  block in the room's 80×64 viewBox. */
function PixelShower({ x, y }: { x: number; y: number }) {
  const tile = "#3b4658";
  const tileLine = "#2c3445";
  const frame = "#9aa6b8";
  const glass = "#bcd9ec";
  const glassShade = "#8fb6d6";
  const head = "#5b5b66";
  const trayDark = "#5b6470";
  return (
    <g>
      {/* Back tile wall */}
      <rect x={x + 1} y={y + 1} width={8} height={14} fill={tile} />
      {/* Tile grout lines */}
      <rect x={x + 1} y={y + 6} width={8} height={1} fill={tileLine} />
      <rect x={x + 1} y={y + 11} width={8} height={1} fill={tileLine} />
      {/* Showerhead (top center) */}
      <rect x={x + 4} y={y + 1} width={1} height={2} fill={head} />
      <rect x={x + 3} y={y + 3} width={3} height={1} fill={head} />
      {/* Pale glass front */}
      <rect x={x + 1} y={y + 4} width={8} height={11} fill={glass} opacity={0.55} />
      <rect x={x + 1} y={y + 14} width={8} height={1} fill={glassShade} />
      {/* Frame (sides + top + bottom rail) */}
      <rect x={x} y={y} width={1} height={18} fill={frame} />
      <rect x={x + 9} y={y} width={1} height={18} fill={frame} />
      <rect x={x} y={y} width={10} height={1} fill={frame} />
      {/* Tray base */}
      <rect x={x} y={y + 15} width={10} height={3} fill={trayDark} />
    </g>
  );
}

/** Two-door fridge with handles. Drawn as a 10×16 unit block. The OPEN
 *  variant (door swung out + bottle inside) is rendered separately as
 *  an HTML overlay during the FRIDGE activity. */
function PixelFridge({ x, y }: { x: number; y: number }) {
  const body = "#e0e0e6";
  const bodyShade = "#a8a8b0";
  const door = "#cdcdd4";
  const trim = "#5b5b66";
  const handle = "#3a3a44";
  return (
    <g>
      {/* Body */}
      <rect x={x} y={y} width={10} height={16} fill={body} />
      {/* Side shading */}
      <rect x={x} y={y} width={1} height={16} fill={bodyShade} />
      <rect x={x + 9} y={y} width={1} height={16} fill={bodyShade} />
      {/* Freezer door (top) */}
      <rect x={x + 1} y={y + 1} width={8} height={4} fill={door} />
      {/* Split */}
      <rect x={x + 1} y={y + 5} width={8} height={1} fill={trim} />
      {/* Main door */}
      <rect x={x + 1} y={y + 6} width={8} height={9} fill={door} />
      {/* Handles */}
      <rect x={x + 7} y={y + 2} width={1} height={2} fill={handle} />
      <rect x={x + 7} y={y + 8} width={1} height={5} fill={handle} />
      {/* Floor shadow */}
      <rect x={x} y={y + 15} width={10} height={1} fill={trim} />
    </g>
  );
}

function PixelTable({ x, y }: { x: number; y: number }) {
  const wood = "#8b5a2b";
  const woodDark = "#5d3b1e";
  return (
    <g>
      <rect x={x} y={y} width={14} height={3} fill={wood} />
      <rect x={x} y={y + 2} width={14} height={1} fill={woodDark} />
      <rect x={x + 1} y={y + 3} width={2} height={6} fill={wood} />
      <rect x={x + 11} y={y + 3} width={2} height={6} fill={wood} />
    </g>
  );
}

function PixelChair({ x, y }: { x: number; y: number }) {
  const wood = "#8b5a2b";
  return (
    <g>
      {/* Back */}
      <rect x={x} y={y - 4} width={1} height={6} fill={wood} />
      <rect x={x + 4} y={y - 4} width={1} height={6} fill={wood} />
      {/* Seat */}
      <rect x={x} y={y + 2} width={5} height={2} fill={wood} />
      {/* Legs */}
      <rect x={x} y={y + 4} width={1} height={3} fill={wood} />
      <rect x={x + 4} y={y + 4} width={1} height={3} fill={wood} />
    </g>
  );
}

/** Three-cushion sofa drawn in the floor area. 22×8 unit block, dark
 *  fabric with two seat cushions and a back. Click target sits on top
 *  via an absolute HTML overlay (the user taps the sofa to make the
 *  astronaut walk over and sit on it for ~30 s). */
function PixelSofa({ x, y, width = 22 }: { x: number; y: number; width?: number }) {
  const fabric = "#5b4a8b";
  const fabricShade = "#3f3266";
  const fabricLight = "#7a68b0";
  const wood = "#3a2916";
  const armW = 3;
  const seatW = width - armW * 2;
  const cushionW = Math.max(2, Math.floor((seatW - 1) / 2));
  return (
    <g>
      {/* Back */}
      <rect x={x} y={y} width={width} height={4} fill={fabric} />
      <rect x={x} y={y} width={width} height={1} fill={fabricLight} />
      <rect x={x} y={y + 3} width={width} height={1} fill={fabricShade} />
      {/* Left arm */}
      <rect x={x} y={y + 2} width={armW} height={6} fill={fabric} />
      <rect x={x} y={y + 2} width={1} height={6} fill={fabricShade} />
      {/* Right arm */}
      <rect x={x + width - armW} y={y + 2} width={armW} height={6} fill={fabric} />
      <rect x={x + width - 1} y={y + 2} width={1} height={6} fill={fabricShade} />
      {/* Seat (between arms) */}
      <rect x={x + armW} y={y + 4} width={seatW} height={3} fill={fabric} />
      {/* Two seat cushions */}
      <rect x={x + armW} y={y + 4} width={cushionW} height={2} fill={fabricLight} />
      <rect x={x + armW + cushionW + 1} y={y + 4} width={cushionW} height={2} fill={fabricLight} />
      {/* Floor shadow line */}
      <rect x={x} y={y + 7} width={width} height={1} fill={wood} />
    </g>
  );
}

/** Wall-mounted/standing pixel TV. 14×12 unit block. The screen
 *  changes look based on `on`: dark glass when off, soft cycling
 *  color bands (driven by the home-tv-flicker keyframe applied via
 *  an HTML overlay above the SVG) when on. */
function PixelTV({ x, y, on }: { x: number; y: number; on: boolean }) {
  const frame = "#2a2a32";
  const frameLight = "#44444f";
  const screenOff = "#101018";
  const screenOn = "#5fb4ff";
  const stand = "#3a3a44";
  const w = 14;
  const h = 10;
  return (
    <g>
      {/* Outer frame */}
      <rect x={x} y={y} width={w} height={h} fill={frame} />
      <rect x={x} y={y} width={w} height={1} fill={frameLight} />
      {/* Screen */}
      <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill={on ? screenOn : screenOff} />
      {on && (
        <>
          {/* Subtle scanlines on top of the lit screen */}
          <rect x={x + 1} y={y + 3} width={w - 2} height={1} fill="#a8d8ff" opacity={0.6} />
          <rect x={x + 1} y={y + 6} width={w - 2} height={1} fill="#3a8fd8" opacity={0.6} />
        </>
      )}
      {/* Tiny power LED, bottom-right of the bezel */}
      <rect x={x + w - 2} y={y + h - 1} width={1} height={1} fill={on ? "#7dffb0" : "#5a2020"} />
      {/* Wall-mount stand bracket */}
      <rect x={x + w / 2 - 1} y={y + h} width={2} height={2} fill={stand} />
    </g>
  );
}
