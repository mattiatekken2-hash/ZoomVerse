import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/ping", async (_req, res) => {
  try {
    await pool.query("select 1");
    await pool.query("select 1 from users limit 1");
    res.status(200).send("pong");
  } catch {
    res.status(503).send("db_unavailable");
  }
});

router.get("/time", (_req, res) => {
  res.json({ serverTime: Date.now() });
});

export default router;
