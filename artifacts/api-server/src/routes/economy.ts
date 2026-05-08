/**
 * Public read-only endpoints for the global $ZOOM price index.
 *
 * - GET /economy/price   -> current price + last update timestamp
 * - GET /economy/history -> chart history (last N points, throttled to ~10s
 *                            granularity by the writer; see zoomPrice.ts)
 *
 * No auth: the price is a public, read-only signal. No body, no user data.
 * Cache headers explicitly disabled so polling clients always see fresh
 * values — the underlying queries are cheap (single row reads).
 */
import { Router, type IRouter } from "express";
import { getZoomPriceMicro, getZoomChart, getDailyHighMicro, GENESIS_PRICE_MICRO } from "../lib/zoomPrice";

const router: IRouter = Router();

router.get("/economy/price", async (_req, res) => {
  try {
    // Sequential, not parallel: getZoomPriceMicro() runs the lazy
    // midnight-UTC reset transaction. If we read the daily-high in
    // parallel it may observe the OLD high before the reset commits,
    // returning a dailyHighPrice greater than the freshly-corrected
    // price for that one poll. Reading after the reset guarantees the
    // response is internally consistent.
    const micro = await getZoomPriceMicro();
    const dailyHighMicro = await getDailyHighMicro();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      priceMicro: micro,
      price: micro / 1_000_000,
      dailyHighPrice: dailyHighMicro / 1_000_000,
      genesisPrice: GENESIS_PRICE_MICRO / 1_000_000,
      updatedAt: Date.now(),
    });
  } catch {
    // Defensive: never break the FARM page if the price read fails.
    res.json({
      priceMicro: GENESIS_PRICE_MICRO,
      price: GENESIS_PRICE_MICRO / 1_000_000,
      dailyHighPrice: GENESIS_PRICE_MICRO / 1_000_000,
      genesisPrice: GENESIS_PRICE_MICRO / 1_000_000,
      updatedAt: Date.now(),
    });
  }
});

router.get("/economy/history", async (_req, res) => {
  try {
    const points = await getZoomChart();
    res.setHeader("Cache-Control", "no-store");
    // Convert micro -> human price client-side stays simple, so we ship both.
    res.json({
      points: points.map((pt) => ({ t: pt.t, p: pt.p, price: pt.p / 1_000_000 })),
      genesisPrice: GENESIS_PRICE_MICRO / 1_000_000,
    });
  } catch {
    res.json({ points: [], genesisPrice: GENESIS_PRICE_MICRO / 1_000_000 });
  }
});

export default router;
