import { useEffect, useState } from "react";
import { FORGE_CLAY, STUDIO_GALLERY_HOLD_ZMC } from "@workspace/game-models";
import { VoxelStudioCanvas } from "./VoxelStudioCanvas";
import { useZmcStatus } from "../hooks/useZmcStatus";
import { useT } from "../i18n/LanguageContext";
import {
  exposeStudioGallery,
  fetchStudioGallery,
  reportStudioGallery,
  unpublishStudioGallery,
  voteStudioGallery,
  type StudioGalleryListing,
  type VoxelCoord,
  type VoxelStudioProject,
} from "../utils/voxelStudioStore";

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
  const [holdZmc, setHoldZmc] = useState(STUDIO_GALLERY_HOLD_ZMC);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<StudioGalleryListing | null>(null);

  const reload = async () => {
    const data = await fetchStudioGallery(telegramId);
    setListings(data.listings);
    setHoldZmc(data.holdZmc);
  };

  useEffect(() => {
    void reload();
  }, [telegramId]);

  const enoughHold = zmc.zmcBalance >= holdZmc;

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
    if (busy || item.mine) return;
    setBusy(true);
    const res = await voteStudioGallery(telegramId, item.id);
    setBusy(false);
    if (!res.ok) {
      onFlash(res.error || t("studio.gallery.voteFail"));
      return;
    }
    setListings((prev) => prev.map((p) => p.id === item.id ? { ...p, voteCount: res.voteCount ?? p.voteCount } : p));
    if (open?.id === item.id) setOpen({ ...item, voteCount: res.voteCount ?? item.voteCount });
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

  return (
    <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "rgba(0,0,0,0.92)" }}>
      <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 rounded-xl text-[11px] font-black uppercase"
          style={{ minHeight: 44, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)" }}
        >
          {t("studio.gallery.back")}
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm" style={{ color: "#E8ECF4" }}>{t("studio.gallery.title")}</div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.42)" }}>
            {t("studio.gallery.holdHint", { n: holdZmc.toLocaleString() })}
          </div>
        </div>
        <button
          type="button"
          disabled={!active || busy}
          onClick={() => void expose()}
          className="px-3 rounded-xl text-[11px] font-black uppercase"
          style={{
            minHeight: 44,
            background: enoughHold ? "rgba(255,215,64,0.16)" : "rgba(255,255,255,0.06)",
            color: enoughHold ? "#ffd740" : "rgba(255,255,255,0.35)",
            border: enoughHold ? "1px solid rgba(255,215,64,0.4)" : "1px solid rgba(255,255,255,0.12)",
            opacity: !active || busy ? 0.55 : 1,
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
              <button
                key={item.id}
                type="button"
                onClick={() => setOpen(item)}
                className="rounded-2xl overflow-hidden text-left"
                style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
              >
                <div style={{ height: 110 }}>
                  <GalleryThumb2D voxels={item.voxels} />
                </div>
                <div className="px-2 py-2">
                  <div className="text-[11px] font-black truncate" style={{ color: "#fff" }}>{item.title}</div>
                  <div className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {item.author} · {item.voteCount}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ background: "#000" }}>
          <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="px-3 rounded-xl text-[11px] font-black uppercase"
              style={{ minHeight: 44, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)" }}
            >
              {t("studio.gallery.back")}
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm truncate" style={{ color: "#fff" }}>{open.title}</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.42)" }}>{open.author} · {open.voteCount}</div>
            </div>
          </div>
          <div className="flex-1 min-h-0 relative">
            <VoxelStudioCanvas voxels={open.voxels} preview />
          </div>
          <div className="flex-shrink-0 px-3 pt-2 flex gap-2" style={{ paddingBottom: "max(14px, calc(env(safe-area-inset-bottom, 0px) + 10px))" }}>
            {!open.mine && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void vote(open)}
                  className="flex-1 py-3 rounded-xl text-[11px] font-black uppercase"
                  style={{ background: "rgba(255,215,64,0.16)", color: "#ffd740", border: "1px solid rgba(255,215,64,0.35)" }}
                >
                  {t("studio.gallery.vote")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void report(open)}
                  className="flex-1 py-3 rounded-xl text-[11px] font-black uppercase"
                  style={{ background: "rgba(255,80,80,0.12)", color: "#ff8a8a", border: "1px solid rgba(255,80,80,0.3)" }}
                >
                  {t("studio.gallery.report")}
                </button>
              </>
            )}
            {open.mine && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void unpublish(open)}
                className="flex-1 py-3 rounded-xl text-[11px] font-black uppercase"
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

function GalleryThumb2D({ voxels }: { voxels: VoxelCoord[] }) {
  const [el, setEl] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const w = 160;
    const h = 110;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (voxels.length === 0) return;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const v of voxels) {
      cx += v.x;
      cy += v.y;
      cz += v.z;
    }
    const n = voxels.length;
    cx /= n;
    cy /= n;
    cz /= n;
    const sorted = [...voxels].sort((a, b) => (a.x + a.z + a.y) - (b.x + b.z + b.y));
    const ox = w / 2;
    const oy = h * 0.62;
    for (const v of sorted) {
      const dx = v.x - cx;
      const dy = v.y - cy;
      const dz = v.z - cz;
      const x = ox + (dx - dz) * 6.2;
      const y = oy + (dx + dz) * 1.6 - dy * 6.4;
      const hex = typeof v.color === "number" ? v.color : FORGE_CLAY;
      ctx.fillStyle = `#${hex.toString(16).padStart(6, "0")}`;
      ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
      ctx.strokeStyle = "rgba(0,0,0,0.38)";
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
    }
  }, [el, voxels]);
  return <canvas ref={setEl} style={{ width: "100%", height: "100%", display: "block" }} />;
}
