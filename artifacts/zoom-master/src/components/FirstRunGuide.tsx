import { useEffect, useState, type CSSProperties } from "react";
import { useT } from "../i18n/LanguageContext";

const STORAGE_KEY = "zoom-first-run-v1";
const REPLAY_KEY = "zoom-first-run-replay";
export const REPLAY_TUTORIAL_EVENT = "zoom-replay-tutorial";

export type FirstRunStep = "forge" | "farm" | "market";

function readDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function writeDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch { /**/ }
}

function readReplay(): boolean {
  try {
    return sessionStorage.getItem(REPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

function writeReplay(on: boolean) {
  try {
    if (on) sessionStorage.setItem(REPLAY_KEY, "1");
    else sessionStorage.removeItem(REPLAY_KEY);
  } catch { /**/ }
}

/** Replay the 3-step guide without wiping inventory. Safe with existing models. */
export function replayFirstRunGuide() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /**/ }
  writeReplay(true);
  try {
    window.dispatchEvent(new Event(REPLAY_TUTORIAL_EVENT));
  } catch { /**/ }
}

interface Props {
  planetCount: number;
  tab: string;
  onGoTab: (tab: "lab" | "farm" | "market") => void;
}

const nextBtnStyle: CSSProperties = {
  flex: 1,
  minHeight: 40,
  borderRadius: 12,
  border: 0,
  background: "#9EC5E8",
  color: "#081018",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: "0.08em",
};

/**
 * 3 real actions, no slideshow:
 * 1. Lab — tap FORGE
 * 2. Farm — see your model / START
 * 3. Market tab — that's where you sell
 *
 * Replay (admin) walks all 3 steps with NEXT even if the player already has models.
 */
export function FirstRunGuide({ planetCount, tab, onGoTab }: Props) {
  const { t } = useT();
  const [replay, setReplay] = useState(readReplay);
  const [step, setStep] = useState<FirstRunStep | "off" | "boot">(() =>
    (readDone() && !readReplay() ? "off" : "boot"),
  );

  useEffect(() => {
    const onReplay = () => {
      writeReplay(true);
      setReplay(true);
      onGoTab("lab");
      setStep("forge");
    };
    window.addEventListener(REPLAY_TUTORIAL_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_TUTORIAL_EVENT, onReplay);
  }, [onGoTab]);

  useEffect(() => {
    if (step !== "boot") return;
    const id = window.setTimeout(() => {
      if (readReplay()) {
        setReplay(true);
        onGoTab("lab");
        setStep("forge");
        return;
      }
      if (readDone()) {
        setStep("off");
        return;
      }
      if (planetCount > 0) {
        writeDone();
        setStep("off");
        return;
      }
      onGoTab("lab");
      setStep("forge");
    }, 900);
    return () => window.clearTimeout(id);
  }, [step, planetCount, onGoTab]);

  useEffect(() => {
    if (step === "off" || replay) return;
    if (step === "forge" && planetCount > 0) {
      onGoTab("farm");
      setStep("farm");
    }
  }, [planetCount, step, onGoTab, replay]);

  useEffect(() => {
    if (replay) return;
    if (step === "market" && tab === "market") {
      writeDone();
      writeReplay(false);
      setReplay(false);
      setStep("off");
    }
  }, [step, tab, replay]);

  if (step === "off" || step === "boot") return null;

  const finish = () => {
    writeDone();
    writeReplay(false);
    setReplay(false);
    setStep("off");
  };

  const copy =
    step === "forge"
      ? { title: t("guide.forgeTitle"), body: t("guide.forgeBody") }
      : step === "farm"
        ? { title: t("guide.farmTitle"), body: t("guide.farmBody") }
        : { title: t("guide.marketTitle"), body: t("guide.marketBody") };

  const n = step === "forge" ? 1 : step === "farm" ? 2 : 3;
  const maskBottom = step === "market" ? 78 : step === "forge" ? 148 : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 140,
        pointerEvents: "none",
      }}
      data-testid="first-run-guide"
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: maskBottom,
          background: "rgba(4,6,12,0.62)",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      />

      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          top: step === "farm" ? 88 : 72,
          pointerEvents: "auto",
          borderRadius: 18,
          padding: "16px 16px 14px",
          background: "linear-gradient(180deg, rgba(16,20,32,0.97), rgba(8,10,18,0.98))",
          border: "1px solid rgba(158,197,232,0.28)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: "rgba(158,197,232,0.7)", marginBottom: 6 }}>
          {t("guide.step", { n, max: 3 })}
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#f4f7ff", letterSpacing: "0.02em" }}>
          {copy.title}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.62)", marginTop: 6 }}>
          {copy.body}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
          <button
            type="button"
            onClick={finish}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "rgba(255,255,255,0.5)",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: "0.08em",
            }}
          >
            {t("guide.skip")}
          </button>
          {step === "forge" && replay && (
            <button
              type="button"
              onClick={() => {
                onGoTab("farm");
                setStep("farm");
              }}
              style={nextBtnStyle}
            >
              {t("guide.next")}
            </button>
          )}
          {step === "farm" && (
            <button
              type="button"
              onClick={() => setStep("market")}
              style={nextBtnStyle}
            >
              {t("guide.next")}
            </button>
          )}
          {step === "market" && (
            <button
              type="button"
              onClick={() => {
                onGoTab("market");
                finish();
              }}
              style={nextBtnStyle}
            >
              {t("guide.openMarket")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
