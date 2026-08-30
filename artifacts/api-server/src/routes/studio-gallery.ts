import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";
import { STUDIO_GALLERY_HOLD_ZMC, parseJettonNano, zmcHumanToNano } from "@workspace/game-models";

const router: IRouter = Router();

const Voxel = z.object({
  x: z.number().int().min(-24).max(24),
  y: z.number().int().min(0).max(48),
  z: z.number().int().min(-24).max(24),
  color: z.number().int().min(0).max(0xffffff).optional(),
});

void pool.query(`
  CREATE TABLE IF NOT EXISTS studio_gallery (
    id serial PRIMARY KEY,
    telegram_id text NOT NULL,
    project_id text NOT NULL,
    title text NOT NULL,
    voxels jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'public',
    vote_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    UNIQUE (telegram_id, project_id)
  );
  CREATE INDEX IF NOT EXISTS idx_studio_gallery_public
    ON studio_gallery (status, vote_count DESC, id DESC);
  CREATE TABLE IF NOT EXISTS studio_gallery_reports (
    listing_id integer NOT NULL REFERENCES studio_gallery(id) ON DELETE CASCADE,
    reporter_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (listing_id, reporter_id)
  );
  CREATE TABLE IF NOT EXISTS studio_gallery_votes (
    listing_id integer NOT NULL REFERENCES studio_gallery(id) ON DELETE CASCADE,
    voter_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (listing_id, voter_id)
  );
`).catch(() => {});

type GalleryRow = {
  id: number;
  telegram_id: string;
  project_id: string;
  title: string;
  voxels: unknown;
  status: string;
  vote_count: number;
  first_name: string | null;
};

function mapListing(row: GalleryRow, viewerId?: string) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    voxels: Array.isArray(row.voxels) ? row.voxels : [],
    status: row.status,
    voteCount: Number(row.vote_count) || 0,
    author: (row.first_name || "Player").slice(0, 24),
    mine: viewerId ? row.telegram_id === viewerId : false,
  };
}

router.get("/studio-gallery", async (req, res) => {
  const viewerId = String(req.query.telegramId || "").trim();
  try {
    const rows = await pool.query<GalleryRow>(
      `SELECT g.id, g.telegram_id, g.project_id, g.title, g.voxels, g.status, g.vote_count,
              u.first_name
       FROM studio_gallery g
       LEFT JOIN users u ON u.telegram_id = g.telegram_id
       WHERE g.status = 'public'
       ORDER BY g.vote_count DESC, g.id DESC
       LIMIT 60`,
    );
    res.json({
      ok: true,
      holdZmc: STUDIO_GALLERY_HOLD_ZMC,
      listings: rows.rows.map((r) => mapListing(r, viewerId || undefined)),
    });
  } catch (err) {
    console.error("[studio-gallery list]", err);
    res.json({ ok: true, holdZmc: STUDIO_GALLERY_HOLD_ZMC, listings: [] });
  }
});

router.get("/studio-gallery/mine/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "telegramId required" });
    return;
  }
  try {
    const rows = await pool.query<GalleryRow>(
      `SELECT g.id, g.telegram_id, g.project_id, g.title, g.voxels, g.status, g.vote_count,
              u.first_name
       FROM studio_gallery g
       LEFT JOIN users u ON u.telegram_id = g.telegram_id
       WHERE g.telegram_id = $1
       ORDER BY g.updated_at DESC
       LIMIT 20`,
      [telegramId],
    );
    res.json({ ok: true, listings: rows.rows.map((r) => mapListing(r, telegramId)) });
  } catch (err) {
    console.error("[studio-gallery mine]", err);
    res.json({ ok: true, listings: [] });
  }
});

router.post("/studio-gallery/expose", async (req, res) => {
  const parsed = z.object({
    telegramId: z.string().min(1),
    projectId: z.string().min(1).max(64),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, projectId } = parsed.data;
  try {
    const user = await pool.query<{
      zmc_balance_nano: string | null;
      voxel_studio_json: { projects?: Array<{ id?: string; title?: string; voxels?: unknown }> } | null;
    }>(
      `SELECT zmc_balance_nano, voxel_studio_json FROM users WHERE telegram_id = $1 LIMIT 1`,
      [telegramId],
    );
    const row = user.rows[0];
    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const holdNano = zmcHumanToNano(STUDIO_GALLERY_HOLD_ZMC);
    const haveNano = parseJettonNano(row.zmc_balance_nano);
    if (haveNano < holdNano) {
      res.status(400).json({
        error: `Hold ${STUDIO_GALLERY_HOLD_ZMC.toLocaleString()} ZMC in your linked wallet to expose`,
        holdZmc: STUDIO_GALLERY_HOLD_ZMC,
      });
      return;
    }
    const projects = Array.isArray(row.voxel_studio_json?.projects) ? row.voxel_studio_json!.projects! : [];
    const project = projects.find((p) => p && p.id === projectId);
    if (!project || !Array.isArray(project.voxels) || project.voxels.length < 1) {
      res.status(400).json({ error: "Model not found in Studio" });
      return;
    }
    const voxelsParsed = z.array(Voxel).max(900).safeParse(project.voxels);
    if (!voxelsParsed.success) {
      res.status(400).json({ error: "Invalid voxels" });
      return;
    }
    const title = String(project.title || "Untitled").slice(0, 32);
    const upsert = await pool.query<{ id: number }>(
      `INSERT INTO studio_gallery (telegram_id, project_id, title, voxels, status, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, 'public', NOW())
       ON CONFLICT (telegram_id, project_id) DO UPDATE
         SET title = EXCLUDED.title,
             voxels = EXCLUDED.voxels,
             status = 'public',
             updated_at = NOW()
         WHERE studio_gallery.status <> 'hidden'
       RETURNING id`,
      [telegramId, projectId, title, JSON.stringify(voxelsParsed.data)],
    );
    if (!upsert.rows[0]) {
      res.status(403).json({ error: "This piece is in review and cannot go public" });
      return;
    }
    res.json({ ok: true, id: upsert.rows[0]?.id, holdZmc: STUDIO_GALLERY_HOLD_ZMC });
  } catch (err) {
    console.error("[studio-gallery expose]", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/studio-gallery/unpublish", async (req, res) => {
  const parsed = z.object({
    telegramId: z.string().min(1),
    listingId: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, listingId } = parsed.data;
  try {
    await pool.query(
      `DELETE FROM studio_gallery WHERE id = $1 AND telegram_id = $2 AND status <> 'hidden'`,
      [listingId, telegramId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[studio-gallery unpublish]", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/studio-gallery/report", async (req, res) => {
  const parsed = z.object({
    telegramId: z.string().min(1),
    listingId: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, listingId } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const listing = await client.query<{ telegram_id: string; status: string }>(
      `SELECT telegram_id, status FROM studio_gallery WHERE id = $1 FOR UPDATE`,
      [listingId],
    );
    const row = listing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (row.telegram_id === telegramId) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Cannot report your own piece" });
      return;
    }
    await client.query(
      `INSERT INTO studio_gallery_reports (listing_id, reporter_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [listingId, telegramId],
    );
    await client.query(
      `UPDATE studio_gallery SET status = 'hidden', updated_at = NOW() WHERE id = $1`,
      [listingId],
    );
    await client.query("COMMIT");
    res.json({ ok: true, hidden: true });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /**/ }
    console.error("[studio-gallery report]", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

router.post("/studio-gallery/vote", async (req, res) => {
  const parsed = z.object({
    telegramId: z.string().min(1),
    listingId: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, listingId } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const listing = await client.query<{ telegram_id: string; status: string; vote_count: number }>(
      `SELECT telegram_id, status, vote_count FROM studio_gallery WHERE id = $1 FOR UPDATE`,
      [listingId],
    );
    const row = listing.rows[0];
    if (!row || row.status !== "public") {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (row.telegram_id === telegramId) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Cannot vote your own piece" });
      return;
    }
    const ins = await client.query(
      `INSERT INTO studio_gallery_votes (listing_id, voter_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING listing_id`,
      [listingId, telegramId],
    );
    let votes = Number(row.vote_count) || 0;
    if (ins.rows.length > 0) {
      const upd = await client.query<{ vote_count: number }>(
        `UPDATE studio_gallery SET vote_count = vote_count + 1, updated_at = NOW()
         WHERE id = $1 RETURNING vote_count`,
        [listingId],
      );
      votes = Number(upd.rows[0]?.vote_count ?? votes + 1);
    }
    await client.query("COMMIT");
    res.json({ ok: true, voteCount: votes, already: ins.rows.length === 0 });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /**/ }
    console.error("[studio-gallery vote]", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

export default router;
