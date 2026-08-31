import { useEffect, useState } from "react";
import { STUDIO_GALLERY_HOLD_ZMC } from "@workspace/game-models";
import { VoxelStudioCanvas } from "./VoxelStudioCanvas";
import { StudioVoxelThumb } from "./StudioVoxelThumb";
import { useZmcStatus } from "../hooks/useZmcStatus";
import { useT } from "../i18n/LanguageContext";
import {
  exposeStudioGallery,
  fetchStudioGallery,
  reportStudioGallery,
  unpublishStudioGallery,
  voteStudioGallery,
  type StudioGalleryListing,
  type VoxelStudioProject,
} from "../utils/voxelStudioStore";

const RANK_METAL = [
  { ring: "#ffe566", inner: "#c9a227", glow: "rgba(255,215,64,0.5)", fg: "#14120a" },
  { ring: "#e8eef8", inner: "#8a93a8", glow: "rgba(200,210,230,0.4)", fg: "#141820" },
  { ring: "#e08a4a", inner: "#8a4a22", glow: "rgba(224,138,74,0.45)", fg: "#1a1008" },
] as const;

function StudioRankMark({ rank }: { rank: 0 | 1 | 2 }) {
  const m = RANK_METAL[rank];
  return (
    <div
      aria-hidden
      style={{
        width: 30,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: `drop-shadow(0 0 8px ${m.glow})`,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          transform: "rotate(45deg)",
          borderRadius: 5,
          background: `linear-gradient(145deg, ${m.ring} 0%, ${m.inner} 72%)`,
          border: `1.5px solid ${m.ring}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            transform: "rotate(-45deg)",
            fontSize: 11,
            fontWeight: 900,
            color: m.fg,
            lineHeight: 1,
          }}
        >
          {rank + 1}
        </span>
      </div>
    </div>
  );
}

export function StudioGalleryPanel({
  telegramId,
  active,
  onFlash,
  onClose,
  onFlush,
}: {
  telegramId: string;
  active: VoxelStudioProject | null;
  onFlash: (text: string) => void;
  onClose: () => void;
  onFlush: () => Promise<void>;
}) {
  const { t } = useT();
  const zmc = useZmcStatus(telegramId);
  const [listings, setListings] = useState<StudioGalleryListing[]>([]);
  const [top3, setTop3] = useState<StudioGalleryListing[]>([]);
  const [holdZmc, setHoldZmc] = useState(STUDIO_GALLERY_HOLD_ZMC);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<StudioGalleryListing | null>(null);
  const [topOpen, setTopOpen] = useState(false);

  const reload = async () => {
    const data = await fetchStudioGallery(telegramId);
    setListings(data.listings);
    setTop3(data.top3);
    setHoldZmc(data.holdZmc);
  };

  useEffect(() => {
    void reload();
  }, [telegramId]);

  const enoughHold = zmc.zmcBalance >= holdZmc;

  const applyVote = (item: StudioGalleryListing, voteCount: number, nextTop?: StudioGalleryListing[]) => {
    setListings((prev) => prev.map((p) => (
      p.id === item.id ? { ...p, voteCount, voted: true } : p
    )).sort((a, b) => b.voteCount - a.voteCount || b.id - a.id));
    if (open?.id === item.id) setOpen({ ...item, voteCount, voted: true });
    if (nextTop) setTop3(nextTop);
  };

  const expose = async () => {
    if (!active || busy) return;
    setBusy(true);
    await onFlush();
    const res = await exposeStudioGallery(telegramId, active.id);
    setBusy(false);
    if (!res.ok) {
      onFlash(res.error || t("studio.gallery.exposeFail"));
      return;
    }
    onFlash(t("studio.gallery.exposed"));
    void reload();
  };

  const vote = async (item: StudioGalleryListing) => {
    if (busy || item.mine || item.voted) return;
    setBusy(true);
    const res = await voteStudioGallery(telegramId, item.id);
    setBusy(false);
    if (!res.ok) {
      onFlash(res.error || t("studio.gallery.voteFail"));
      return;
    }
    applyVote(item, res.voteCount ?? item.voteCount + 1, res.top3);
  };

  const report = async (item: StudioGalleryListing) => {
    if (busy || item.mine) return;
    setBusy(true);
    const res = await reportStudioGallery(telegramId, item.id);
    setBusy(false);
    if (!res.ok) {
      onFlash(res.error || t("studio.gallery.reportFail"));
      return;
    }
    onFlash(t("studio.gallery.reported"));
    setOpen(null);
    void reload();
  };

  const unpublish = async (item: StudioGalleryListing) => {
    if (busy || !item.mine) return;
    setBusy(true);
    const res = await unpublishStudioGallery(telegramId, item.id);
    setBusy(false);
    if (!res.ok) {
      onFlash(res.error || t("studio.gallery.unpublishFail"));
      return;
    }
    setOpen(null);
    void reload();
  };

  const circleBtn = (label: string, onClick: () => void, gold?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center font-black"
      style={{
        minWidth: 44,
        height: 44,
        padding: "0 14px",
        borderRadius: 999,
        background: gold ? "rgba(255,215,64,0.16)" : "rgba(255,255,255,0.08)",
        color: gold ? "#ffd740" : "#fff",
        border: gold ? "1.5px solid rgba(255,215,64,0.45)" : "1px solid rgba(255,255,255,0.16)",
        fontSize: 11,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "rgba(0,0,0,0.94)" }}>
      <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2">
        {circleBtn(t("studio.gallery.back"), onClose)}
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm" style={{ color: "#E8ECF4" }}>{t("studio.gallery.title")}</div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.42)" }}>
            {t("studio.gallery.holdHint", { n: holdZmc.toLocaleString() })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTopOpen(true)}
          className="flex items-center justify-center font-black"
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            background: "rgba(255,215,64,0.14)",
            color: "#ffd740",
            border: "1.5px solid rgba(255,215,64,0.5)",
            fontSize: 10,
            letterSpacing: "0.04em",
            boxShadow: "0 0 18px rgba(255,215,64,0.18)",
          }}
        >
          TOP 3
        </button>
        <button
          type="button"
          disabled={!active || busy}
          onClick={() => void expose()}
          className="flex items-center justify-center font-black"
          style={{
            minWidth: 44,
            height: 44,
            padding: "0 14px",
            borderRadius: 999,
            background: enoughHold ? "rgba(255,215,64,0.16)" : "rgba(255,255,255,0.06)",
            color: enoughHold ? "#ffd740" : "rgba(255,255,255,0.35)",
            border: enoughHold ? "1px solid rgba(255,215,64,0.4)" : "1px solid rgba(255,255,255,0.12)",
            opacity: !active || busy ? 0.55 : 1,
            fontSize: 11,
          }}
        >
          {t("studio.gallery.expose")}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        {listings.length === 0 ? (
          <div className="pt-16 text-center text-xs font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("studio.gallery.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {listings.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(item)}
                  className="block w-full text-left"
                >
                  <div style={{ height: 148, background: "#05070c" }}>
                    <StudioVoxelThumb voxels={item.voxels} />
                  </div>
                </button>
                <div className="px-2 py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-black truncate" style={{ color: "#fff" }}>{item.title}</div>
                    <div className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{item.author}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || item.mine || item.voted}
                    onClick={(e) => {
                      e.stopPropagation();
                      void vote(item);
                    }}
                    className="flex-shrink-0 flex items-center gap-1 font-black"
                    style={{
                      height: 32,
                      padding: "0 8px",
                      borderRadius: 999,
                      background: item.voted ? "rgba(255,80,100,0.22)" : "rgba(255,255,255,0.08)",
                      color: item.mine ? "rgba(255,255,255,0.4)" : "#ff8aa0",
                      border: "1px solid rgba(255,120,140,0.35)",
                      fontSize: 12,
                      opacity: item.mine ? 0.55 : 1,
                    }}
                  >
                    <span>{item.voted ? "❤️" : "🤍"}</span>
                    <span>{item.voteCount}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {topOpen && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.82)" }}
          onClick={() => setTopOpen(false)}
        >
          <div
            className="relative flex flex-col items-center"
            style={{
              width: "min(92vw, 420px)",
              aspectRatio: "1",
              borderRadius: "50%",
              background: "radial-gradient(circle at 50% 30%, rgba(40,36,18,0.98) 0%, rgba(8,10,16,0.98) 62%, #04060a 100%)",
              border: "2px solid rgba(255,215,64,0.45)",
              boxShadow: "0 0 40px rgba(255,215,64,0.18)",
              padding: "18% 12% 16%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setTopOpen(false)}
              className="absolute flex items-center justify-center font-black"
              style={{
                top: 18,
                right: "18%",
                width: 36,
                height: 36,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.16)",
                fontSize: 14,
              }}
            >
              ✕
            </button>
            <div className="font-black text-sm mb-1" style={{ color: "#ffd740", letterSpacing: "0.16em" }}>
              {t("studio.gallery.top3Title")}
            </div>
            <div className="text-[10px] mb-4 text-center" style={{ color: "rgba(255,255,255,0.45)" }}>
              {t("studio.gallery.top3Hint")}
            </div>
            <div className="flex items-end justify-center gap-2 w-full">
              {[1, 0, 2].map((rank) => {
                const item = top3[rank];
                const size = rank === 0 ? 112 : 92;
                return (
                  <button
                    key={rank}
                    type="button"
                    disabled={!item}
                    onClick={() => {
                      if (!item) return;
                      setTopOpen(false);
                      setOpen(item);
                    }}
                    className="flex flex-col items-center"
                    style={{ opacity: item ? 1 : 0.55 }}
                  >
                    <div className="mb-1"><StudioRankMark rank={rank as 0 | 1 | 2} /></div>
                    <div
                      className="overflow-hidden"
                      style={{
                        width: size,
                        height: size,
                        borderRadius: 999,
                        border: item ? "2px solid rgba(255,215,64,0.55)" : "1.5px dashed rgba(255,255,255,0.22)",
                        background: "#05070c",
                      }}
                    >
                      {item ? (
                        <StudioVoxelThumb voxels={item.voxels} />
                      ) : (
                        <div className="h-full flex items-center justify-center text-[10px] font-bold px-2 text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {t("studio.gallery.top3Wait")}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] font-black truncate max-w-[96px]" style={{ color: "#fff" }}>
                      {item ? item.title : "—"}
                    </div>
                    <div className="text-[10px] font-bold" style={{ color: "#ff8aa0" }}>
                      {item ? `❤️ ${item.voteCount}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ background: "#000" }}>
          <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2">
            {circleBtn(t("studio.gallery.back"), () => setOpen(null))}
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm truncate" style={{ color: "#fff" }}>{open.title}</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.42)" }}>{open.author} · ❤️ {open.voteCount}</div>
            </div>
            {!open.mine && (
              <>
              <button
                type="button"
                disabled={busy || open.voted}
                onClick={() => void vote(open)}
                className="flex items-center gap-1 font-black"
                style={{
                  height: 44,
                  padding: "0 12px",
                  borderRadius: 999,
                  background: open.voted ? "rgba(255,80,100,0.22)" : "rgba(255,215,64,0.14)",
                  color: open.voted ? "#ff8aa0" : "#ffd740",
                  border: "1px solid rgba(255,215,64,0.35)",
                  fontSize: 13,
                }}
              >
                {open.voted ? "❤️" : "🤍"} {open.voteCount}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void report(open)}
                aria-label={t("studio.gallery.report")}
                className="flex items-center justify-center font-black"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: "rgba(255,80,80,0.16)",
                  color: "#ff8a8a",
                  border: "1px solid rgba(255,80,80,0.4)",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                }}
              >
                {t("studio.gallery.report")}
              </button>
              </>
            )}
          </div>
          <div className="flex-1 min-h-0 relative">
            <VoxelStudioCanvas voxels={open.voxels} preview />
          </div>
          <div className="flex-shrink-0 px-3 pt-2 flex gap-2" style={{ paddingBottom: "max(14px, calc(env(safe-area-inset-bottom, 0px) + 10px))" }}>
            {!open.mine && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void report(open)}
                className="flex-1 py-3 rounded-full text-[11px] font-black uppercase"
                style={{ background: "rgba(255,80,80,0.12)", color: "#ff8a8a", border: "1px solid rgba(255,80,80,0.3)" }}
              >
                {t("studio.gallery.report")}
              </button>
            )}
            {open.mine && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void unpublish(open)}
                className="flex-1 py-3 rounded-full text-[11px] font-black uppercase"
                style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)" }}
              >
                {t("studio.gallery.unpublish")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
