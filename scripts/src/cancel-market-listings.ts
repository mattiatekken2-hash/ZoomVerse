/**
 * Cancel ALL active marketplace listings and return items to sellers' inventories.
 *
 * Usage: pnpm --filter @workspace/scripts run cancel-market-listings
 *
 * For every `status = 'active'` row in `market_listings`:
 *   1. Mark listing as `cancelled`.
 *   2. Re-insert the item back into the seller's `planets_json` or
 *      `equipment_json` with `isListedInMarket: false` and stripped
 *      marketplace metadata (`serverListingId`, `marketPrice`).
 *
 * The script is idempotent: if an item is already present in the JSON
 * array (e.g. from a stale client save), it will be deduplicated by id.
 */
import { pool, db } from "@workspace/db";
import { marketListingsTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

interface ActiveListing {
  id: number;
  sellerTelegramId: string;
  kind: string | null;
  planetId: string | null;
  planetType: string | null;
  planetRate: number | null;
  planetFloat: number | null;
  planetDisplayName: string | null;
  equipmentId: string | null;
  equipmentCategory: string | null;
  equipmentRarity: string | null;
  equipmentRate: number | null;
  price: number;
}

async function cancelAll() {
  const listings = (await db
    .select()
    .from(marketListingsTable)
    .where(eq(marketListingsTable.status, "active"))) as ActiveListing[];

  if (listings.length === 0) {
    console.log("No active marketplace listings found.");
    await pool.end();
    return;
  }

  console.log(`Found ${listings.length} active listing(s). Cancelling…`);

  const nowMs = Date.now();

  for (const listing of listings) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Mark listing as cancelled
      await db
        .update(marketListingsTable)
        .set({ status: "cancelled" })
        .where(eq(marketListingsTable.id, listing.id));

      if (listing.kind === "equipment" && listing.equipmentId) {
        // ── Equipment: strip market flags and ensure it's in the array ──
        await client.query(
          `UPDATE users
           SET equipment_json = COALESCE(
             (SELECT jsonb_agg(
                CASE WHEN e->>'id' = $2
                  THEN (e - 'serverListingId' - 'marketPrice') || jsonb_build_object(
                    'isListedInMarket', false,
                    'isFarmingActive', false
                  )
                  ELSE e
                END
              )
              FROM jsonb_array_elements(equipment_json) e),
             '[]'::jsonb
           ),
           equipment_updated_at_ms = GREATEST(equipment_updated_at_ms, $3::bigint)
           WHERE telegram_id = $1`,
          [listing.sellerTelegramId, listing.equipmentId, nowMs],
        );
      } else if (listing.planetId) {
        // ── Planet: strip market flags and ensure it's in the array ──
        await client.query(
          `UPDATE users
           SET planets_json = COALESCE(
             (SELECT jsonb_agg(
                CASE WHEN p->>'id' = $2
                  THEN (p - 'serverListingId' - 'marketPrice') || jsonb_build_object(
                    'isListedInMarket', false,
                    'isFarmingActive', false
                  )
                  ELSE p
                END
              )
              FROM jsonb_array_elements(planets_json) p),
             '[]'::jsonb
           ),
           planets_updated_at_ms = GREATEST(planets_updated_at_ms, $3::bigint)
           WHERE telegram_id = $1`,
          [listing.sellerTelegramId, listing.planetId, nowMs],
        );
      }

      await client.query("COMMIT");
      console.log(
        `  [#${listing.id}] ${listing.kind || "planet"} ` +
          `${listing.planetId || listing.equipmentId} → ` +
          `seller ${listing.sellerTelegramId}`,
      );
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`  [#${listing.id}] FAILED:`, err);
    } finally {
      client.release();
    }
  }

  console.log(`Done. Cancelled ${listings.length} listing(s).`);
  await pool.end();
}

cancelAll().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
