import { useEffect, useRef, useState, useCallback } from "react";
import {
  fetchHomeState,
  unlockHome,
  claimComputer,
  placeHomeSlot,
  clearHomeSlot,
  type HomeState,
} from "../utils/api";
import {
  PixelAstronaut,
  SleepingAstronaut,
  CoffeeSteam,
  PixelBird,
  WalkingAstronaut,
  WalkingVisitor,
  VISITOR_PALETTES,
  ExercisingAstronaut,
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

function fmtCountdown(s: number): string {
  if (s <= 0) return "READY";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

export function HomePage({ telegramId, visible }: HomePageProps) {
  const [state, setState] = useState<HomeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [arrange, setArrange] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);

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
    setState(s);
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
      setToast("HOME unlocked!");
      window.dispatchEvent(new Event("zoom-data-refresh"));
      void refresh();
    } else if (r.error === "NO_SUN") setToast("You need the SUN first");
    else if (r.error === "NOT_ENOUGH_STARDUST") setToast(`Need ${r.need} stardust (have ${r.have})`);
    else if (r.error === "ALREADY_UNLOCKED") void refresh();
    else setToast("Unlock failed");
  };

  const handleClaim = async () => {
    if (!telegramId) return;
    setBusy("claim");
    const r = await claimComputer(telegramId);
    setBusy(null);
    if (r.ok) {
      setToast(`+${r.reward} STARDUST`);
      window.dispatchEvent(new Event("zoom-data-refresh"));
      void refresh();
    } else if (r.error === "NOT_READY") {
      setToast(`Not ready: ${fmtCountdown(r.secondsToReady ?? 0)}`);
      void refresh();
    } else if (r.error === "NOT_OWNED") setToast("Buy the COMPUTER in the SHOP");
    else setToast("Claim failed");
  };

  const handlePlace = async (slot: Slot, itemId: string) => {
    if (!telegramId) return;
    setBusy(`place-${slot}`);
    const r = await placeHomeSlot(telegramId, slot, itemId);
    setBusy(null);
    setPickerSlot(null);
    if (r.ok) void refresh();
    else if (r.error === "ITEM_NOT_OWNED") setToast("You don't own that item");
    else setToast("Could not place item");
  };

  const handleClear = async (slot: Slot) => {
    if (!telegramId) return;
    setBusy(`clear-${slot}`);
    const r = await clearHomeSlot(telegramId, slot);
    setBusy(null);
    if (r.ok) void refresh();
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</div>;
  }
  if (!state) {
    return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Could not load HOME</div>;
  }

  // ─── LOCK SCREEN ────────────────────────────────────────────────────
  if (!state.unlocked) {
    const canPay = state.stardustBalance >= state.unlockCost;
    const canUnlock = state.hasSun && canPay;
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative" style={{ overflow: "auto" }}>
        {toast && <Toast text={toast} />}
        <PixelLock />
        <div className="mt-6 font-black text-lg tracking-widest neon-text text-center">HOME LOCKED</div>
        <div className="mt-2 text-xs text-center" style={{ color: "rgba(255,255,255,0.55)", maxWidth: 280, lineHeight: 1.5 }}>
          Your private pixel room — unlock it to display your collection and farm passive stardust.
        </div>
        <div className="mt-5 w-full max-w-xs flex flex-col gap-2">
          <Requirement met={state.hasSun} label="Own the SUN" />
          <Requirement met={canPay} label={`Pay ${state.unlockCost.toLocaleString()} stardust (have ${state.stardustBalance.toLocaleString()})`} />
        </div>
        <button
          type="button"
          onClick={handleUnlock}
          disabled={!canUnlock || busy === "unlock"}
          className="mt-6 w-full max-w-xs py-3 rounded-xl font-black tracking-wider text-sm transition-all active:scale-95"
          style={{
            background: canUnlock ? "linear-gradient(135deg, rgba(0,242,254,0.22), rgba(0,136,255,0.18))" : "rgba(255,255,255,0.04)",
            color: canUnlock ? "#00f2fe" : "rgba(255,255,255,0.25)",
            border: `1px solid ${canUnlock ? "rgba(0,242,254,0.45)" : "rgba(255,255,255,0.08)"}`,
            boxShadow: canUnlock ? "0 0 24px rgba(0,242,254,0.18)" : "none",
            cursor: canUnlock ? "pointer" : "not-allowed",
            opacity: busy === "unlock" ? 0.6 : 1,
          }}
        >
          {busy === "unlock" ? "UNLOCKING…" : `UNLOCK — ${state.unlockCost.toLocaleString()} STARDUST`}
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
          onClick={() => { setArrange((v) => !v); setPickerSlot(null); }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all active:scale-95"
          style={{
            background: arrange ? "rgba(255,215,64,0.18)" : "rgba(255,255,255,0.05)",
            color: arrange ? "#ffd740" : "rgba(255,255,255,0.55)",
            border: `1px solid ${arrange ? "rgba(255,215,64,0.45)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          {arrange ? "DONE" : "ARRANGE"}
        </button>
      </div>

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
            computerClaimable={state.computer.claimable}
            secondsToReady={state.computer.secondsToReady}
            visible={visible}
            onSlotClick={(s) => {
              if (!arrange) {
                // Outside arrange mode: clicking the slot only does
                // anything if it holds the computer and it's claimable.
                const id = state.slots[s];
                if (id === "computer" && state.computer.claimable) handleClaim();
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
              SLOT {pickerSlot}
            </div>
            <div className="flex flex-wrap gap-2">
              <SlotPickerOption
                label="COMPUTER"
                owned={state.computer.owned}
                disabled={!state.computer.owned || busy === `place-${pickerSlot}`}
                onClick={() => handlePlace(pickerSlot, "computer")}
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
                  REMOVE
                </button>
              )}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
              {state.computer.owned
                ? "Tap COMPUTER to place it here, or REMOVE to empty the slot."
                : "Visit the SHOP to buy items you can place in your HOME."}
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-2 rounded-lg text-xs font-bold tracking-wider transition-all active:scale-95"
      style={{
        background: owned ? "rgba(0,242,254,0.10)" : "rgba(255,255,255,0.04)",
        color: owned ? "#00f2fe" : "rgba(255,255,255,0.3)",
        border: `1px solid ${owned ? "rgba(0,242,254,0.3)" : "rgba(255,255,255,0.08)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label} {!owned && "(not owned)"}
    </button>
  );
}

// Pixelated padlock for the lock screen. Pure SVG with integer
// coordinates + image-rendering: pixelated → crisp at any size.
function PixelLock() {
  const px = "#00f2fe";
  return (
    <svg
      viewBox="0 0 16 18"
      width={88}
      height={99}
      style={{ imageRendering: "pixelated", filter: "drop-shadow(0 0 12px rgba(0,242,254,0.5))" }}
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
        25/H ★
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
  onSlotClick: (slot: Slot) => void;
}

function PixelRoom({ phase, slots, arrange, computerClaimable, onSlotClick, visible }: PixelRoomProps & { visible: boolean }) {
  const sky = PHASE_GRADIENT[phase];
  const ground = PHASE_GROUND[phase];
  const wall = "#2a2540";
  const wallTrim = "#3a3556";
  const floor = "#5b3a22";
  const floorDark = "#3f2916";

  // Slot screen positions (% of room) — kept fixed across all devices.
  const SLOT_POS: Record<Slot, { left: string; top: string }> = {
    A: { left: "18%", top: "44%" },   // left: bedside table
    B: { left: "54%", top: "48%" },   // center: SITTING ON the dining table top
                                       // (table top surface is at y≈36/64 ≈ 56% — with the
                                       //  monitor sprite ~48px tall, centering at 48% lands
                                       //  the stand right on the table.)
    C: { left: "82%", top: "60%" },   // right: floor pedestal
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
        <PixelWindow x={28} y={4} w={36} h={26} sky={sky} ground={ground} phase={phase} />

        {/* Bed (left wall) — wider variant so the sleeping astronaut
            fits under the covers without spilling over the foot board. */}
        <PixelBed x={2} y={28} width={22} />

        {/* Shower stall (left, between bed and window/table area). Shifted
            right by 4 units to make room for the wider bed. */}
        <PixelShower x={26} y={22} />

        {/* Dining table + chair (center / right) */}
        <PixelTable x={36} y={36} />
        <PixelChair x={50} y={42} />

        {/* Fridge — right wall, sits on the floor */}
        <PixelFridge x={68} y={24} />
      </svg>

      {/* Life overlay — astronaut going about his routine, plus the
          occasional bird drifting across the window. Sits ABOVE the room
          SVG and BELOW the slot buttons so it never intercepts clicks. */}
      <RoomLifeOverlay phase={phase} visible={visible} />

      {/* Slot overlays — positioned absolutely on top of the SVG so we
          can attach onClick handlers and the rendered item without
          re-rendering the whole pixel scene. */}
      {(["A", "B", "C"] as Slot[]).map((s) => {
        const item = slots[s];
        const pos = SLOT_POS[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSlotClick(s)}
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
              cursor: arrange || (item === "computer" && computerClaimable) ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {item === "computer" && (
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PixelComputerIcon size={64} screenOn={computerClaimable} showLabel />
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

function RoomLifeOverlay({ phase, visible }: { phase: SkyPhase; visible: boolean }) {
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
  const activity: ReturnType<typeof useAstronautActivity> = idle ? "drum" : baseActivity;
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
    drum: { left: "55%", top: "78%" },      // standing at the kitchen table, drumming
  };
  const pos = astroPos[activity];

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
    drum: { left: "65%", top: "88%" },      // bopping along to the drum beat next to the table
  };
  const petState: "idle" | "sleep" | "eat" =
    activity === "sleep" ? "sleep" :
    activity === "snack" || activity === "fridge" || activity === "coffee" || activity === "pizza" ? "eat" :
    "idle";
  const pet = petPos[activity];
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
  const onAstroClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (annoyed) return;
    const now = Date.now();
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
        {/* Welcome speech bubble — only on first mount, ~5s */}
        {welcome && !annoyed && (
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
            Welcome back, Commander!
          </div>
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
          <>
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
          </>
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
              Ciao!
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

function PixelWindow({ x, y, w, h, sky, ground, phase }: { x: number; y: number; w: number; h: number; sky: string; ground: string; phase: SkyPhase }) {
  const frame = "#cfd6e6";
  const frameId = `winsky-${phase}`;
  // Star dots only at night.
  const stars = phase === "night" ? [
    [4, 3], [10, 5], [16, 2], [22, 6], [28, 3], [33, 5],
    [6, 9], [14, 11], [20, 8], [26, 12], [31, 9],
  ] : [];
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
