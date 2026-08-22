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
import { getZoomPriceMicro, getZoomChart, getDailyHighMicro, GENESIS_PRICE_MICRO, SCALE_FACTOR } from "../lib/zoomPrice";

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
      price: micro / SCALE_FACTOR,
      dailyHighPrice: dailyHighMicro / SCALE_FACTOR,
      genesisPrice: GENESIS_PRICE_MICRO / SCALE_FACTOR,
      updatedAt: Date.now(),
    });
  } catch {
    // Defensive: never break the FARM page if the price read fails.
    res.json({
      priceMicro: GENESIS_PRICE_MICRO,
      price: GENESIS_PRICE_MICRO / SCALE_FACTOR,
      dailyHighPrice: GENESIS_PRICE_MICRO / SCALE_FACTOR,
      genesisPrice: GENESIS_PRICE_MICRO / SCALE_FACTOR,
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
      points: points.map((pt) => ({ t: pt.t, p: pt.p, price: pt.p / SCALE_FACTOR })),
      genesisPrice: GENESIS_PRICE_MICRO / SCALE_FACTOR,
    });
  } catch {
    res.json({ points: [], genesisPrice: GENESIS_PRICE_MICRO / SCALE_FACTOR });
  }
});

/** Live TON/USD (= GRAM) chart — 24h % from Binance ticker (live), candles for the chart. */
router.get("/economy/gram-market", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [histRes, tickerRes] = await Promise.all([
      fetch(
        "https://api.binance.com/api/v3/klines?symbol=TONUSDT&interval=1m&limit=120",
        { signal: AbortSignal.timeout(10000) },
      ).catch(() => null),
      fetch(
        "https://api.binance.com/api/v3/ticker/24hr?symbol=TONUSDT",
        { signal: AbortSignal.timeout(8000) },
      ).catch(() => null),
    ]);
    let points: Array<{ t: number; price: number }> = [];
    if (histRes?.ok) {
      const rows = await histRes.json() as Array<[number, string, string, string, string]>;
      if (Array.isArray(rows)) {
        points = rows.map((row) => ({ t: Number(row[0]), price: parseFloat(row[4]) }))
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.price) && p.price > 0);
      }
    }
    if (points.length < 2) {
      const cg = await fetch(
        "https://api.coingecko.com/api/v3/coins/the-open-network/market_chart?vs_currency=usd&days=1",
        { signal: AbortSignal.timeout(10000) },
      ).catch(() => null);
      if (cg?.ok) {
        const data = await cg.json() as { prices?: [number, number][] };
        points = (data.prices ?? []).map(([t, price]) => ({ t, price }))
          .filter((p) => Number.isFinite(p.price) && p.price > 0);
      }
    }
    let priceUsd: number | null = null;
    let change24hPct: number | null = null;
    if (tickerRes?.ok) {
      const data = await tickerRes.json() as { lastPrice?: string; priceChangePercent?: string };
      const last = parseFloat(data.lastPrice ?? "");
      const pct = parseFloat(data.priceChangePercent ?? "");
      if (Number.isFinite(last) && last > 0) priceUsd = last;
      if (Number.isFinite(pct)) change24hPct = pct;
    }
    if (priceUsd == null && points.length) priceUsd = points[points.length - 1]!.price;
    if (priceUsd != null && Number.isFinite(priceUsd) && priceUsd > 0) {
      const now = Date.now();
      const last = points[points.length - 1];
      if (!last || now - last.t > 5_000) {
        points = [...points, { t: now, price: priceUsd }];
      } else {
        points = [...points.slice(0, -1), { t: now, price: priceUsd }];
      }
    }
    if (change24hPct == null && points.length >= 2) {
      const first = points[0]!.price;
      const last = priceUsd ?? points[points.length - 1]!.price;
      if (first > 0) change24hPct = ((last - first) / first) * 100;
    }
    res.json({ priceUsd, change24hPct, points });
  } catch {
    res.json({ priceUsd: null, change24hPct: null, points: [] });
  }
});

export default router;
