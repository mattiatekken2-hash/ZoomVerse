import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Make routing strict and case-sensitive so `/balance/sync`, `/balance/sync/`,
// and `/BALANCE/SYNC` are NOT collapsed to the same handler. Without this,
// Express defaults would let `/BALANCE/SYNC` or `/balance/sync/` reach the
// route handler while bypassing the protected-routes lookup table in
// `routes/index.ts` (which keys off req.path exactly), opening a path-
// canonicalization bypass for the Telegram auth middleware.
app.set("case sensitive routing", true);
app.set("strict routing", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
