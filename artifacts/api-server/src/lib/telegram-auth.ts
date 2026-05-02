import crypto from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "./logger";

const BOT_TOKEN = process.env["BOT_TOKEN"] || "";

type Mode = "off" | "soft" | "strict";
function readMode(): Mode {
  const raw = (process.env["TG_AUTH_MODE"] || "soft").toLowerCase();
  if (raw === "off" || raw === "soft" || raw === "strict") return raw;
  return "soft";
}
const MODE: Mode = readMode();

const MAX_AGE_SEC = (() => {
  const raw = Number(process.env["TG_AUTH_MAX_AGE_SEC"] || "86400");
  return Number.isFinite(raw) && raw > 0 ? raw : 86400;
})();

const MAX_INIT_DATA_BYTES = 4096;

let _bootLogged = false;
function logBootOnce(): void {
  if (_bootLogged) return;
  _bootLogged = true;
  if (!BOT_TOKEN) {
    logger.warn(
      { mode: MODE },
      "[tg-auth] BOT_TOKEN not set — Telegram initData verification will be skipped (effective mode: off)",
    );
  } else {
    logger.info(
      { mode: MODE, maxAgeSec: MAX_AGE_SEC },
      "[tg-auth] Telegram initData verification configured",
    );
  }
}

export interface VerifiedTgUser {
  id: string;
  firstName?: string;
  username?: string;
  authDate: number;
}

export interface VerifyResult {
  ok: boolean;
  user?: VerifiedTgUser;
  reason?:
    | "missing"
    | "too_long"
    | "malformed"
    | "no_hash"
    | "no_user"
    | "no_auth_date"
    | "expired"
    | "bad_signature"
    | "no_bot_token";
}

/**
 * Verify a Telegram WebApp `initData` query string against the bot's
 * HMAC-SHA256 signature. See:
 *   https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Algorithm:
 *   1. Split `initData` into key/value pairs.
 *   2. Pop the `hash` field — that is the HMAC the client sent.
 *   3. Sort remaining fields alphabetically by key, join with `\n`
 *      as `key=value` lines — this is the `data_check_string`.
 *   4. Compute `secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)`.
 *   5. Compute `expected_hash = HEX(HMAC_SHA256(key=secret_key, data=data_check_string))`.
 *   6. Compare `expected_hash` with the client's hash using timing-safe equal.
 *
 * Also enforces:
 *   - `auth_date` is present and within `MAX_AGE_SEC` of now (replay limit).
 *   - `user` field is present and contains a numeric `id`.
 *   - Total bytes are below `MAX_INIT_DATA_BYTES` (DoS guard).
 */
export function verifyInitData(initData: string | undefined | null): VerifyResult {
  logBootOnce();
  if (!BOT_TOKEN) return { ok: false, reason: "no_bot_token" };
  if (!initData || typeof initData !== "string") return { ok: false, reason: "missing" };
  if (initData.length > MAX_INIT_DATA_BYTES) return { ok: false, reason: "too_long" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no_hash" };

  const authDateStr = params.get("auth_date");
  if (!authDateStr) return { ok: false, reason: "no_auth_date" };
  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: "no_auth_date" };

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authDate > MAX_AGE_SEC) return { ok: false, reason: "expired" };
  // Allow small future skew (5 min) for client/server clock differences.
  if (authDate - nowSec > 300) return { ok: false, reason: "expired" };

  const userStr = params.get("user");
  if (!userStr) return { ok: false, reason: "no_user" };
  let userObj: { id?: unknown; first_name?: unknown; username?: unknown };
  try {
    userObj = JSON.parse(userStr) as typeof userObj;
  } catch {
    return { ok: false, reason: "no_user" };
  }
  const userIdRaw = userObj?.id;
  if (typeof userIdRaw !== "number" && typeof userIdRaw !== "string") {
    return { ok: false, reason: "no_user" };
  }
  const userId = String(userIdRaw);
  if (!userId) return { ok: false, reason: "no_user" };

  // Build data_check_string (sorted; `hash` and `signature` excluded).
  // CRITICAL: i client Telegram moderni (post-2024) includono nel initData
  // un campo aggiuntivo `signature` (ed25519, per consentire verifica
  // server-side senza bot token). Per la verifica HMAC standard questo
  // campo NON deve entrare nel data_check_string — altrimenti la firma
  // non matchera' mai. Escluderlo e' richiesto dalla documentazione
  // ufficiale Telegram WebApp / validating-data-3rd-party (la versione
  // vecchia diceva solo "hash"; la nuova dice esplicitamente "hash and
  // signature"). Questo era la causa di tutti i `bad_signature` per gli
  // utenti sui client Telegram aggiornati.
  const entries: Array<[string, string]> = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash" || k === "signature") continue;
    entries.push([k, v]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  let signatureOk = false;
  try {
    const a = Buffer.from(expectedHash, "hex");
    const b = Buffer.from(hash, "hex");
    signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { ok: false, reason: "bad_signature" };

  return {
    ok: true,
    user: {
      id: userId,
      firstName: typeof userObj.first_name === "string" ? userObj.first_name : undefined,
      username: typeof userObj.username === "string" ? userObj.username : undefined,
      authDate,
    },
  };
}

declare module "express-serve-static-core" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Request {
    tgUser?: VerifiedTgUser | null;
    tgAuthReason?: VerifyResult["reason"];
  }
}

export interface RequireTgAuthOptions {
  /**
   * Body field whose value must equal the verified Telegram user id. The
   * most common values are `"telegramId"`, `"sellerTelegramId"`,
   * `"buyerTelegramId"`, and `"adminId"`. When `bindField` is set, requests
   * are rejected (in strict mode) if the verified user id does not match
   * this field — preventing an authenticated user from acting on behalf of
   * another user. In soft mode, mismatches are logged but allowed.
   */
  bindField?: string;
}

/**
 * Express middleware that verifies the `X-Telegram-Init-Data` header (or
 * `_initData` body field, used by sendBeacon paths that can't set headers)
 * against the bot's HMAC signature, and optionally binds the verified user
 * id to a body field.
 *
 * Behavior is gated by `TG_AUTH_MODE`:
 *   - `off`     — verification is skipped entirely (logs nothing).
 *   - `soft`    — verifies when initData is present; logs violations but
 *                 NEVER rejects. This is the migration-safe default so
 *                 already-loaded clients don't break on first deploy.
 *   - `strict`  — verifies always; rejects 401 on missing/invalid initData
 *                 and 403 on bound-field mismatch.
 *
 * Always sets `req.tgUser` to the verified user (or `null` on failure) and
 * `req.tgAuthReason` to the reason code, so individual handlers can make
 * fine-grained policy decisions even in soft mode.
 */
export function requireTelegramAuth(opts: RequireTgAuthOptions = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (MODE === "off") {
      req.tgUser = null;
      next();
      return;
    }

    const headerVal = req.header("x-telegram-init-data");
    const bodyVal = (req.body && typeof req.body === "object")
      ? (req.body as Record<string, unknown>)["_initData"]
      : undefined;
    const initData = typeof headerVal === "string" && headerVal
      ? headerVal
      : (typeof bodyVal === "string" ? bodyVal : "");

    const result = verifyInitData(initData);
    req.tgAuthReason = result.reason;

    if (!result.ok || !result.user) {
      // Don't log every miss in soft mode — would flood. Sample at 1/100.
      if (MODE === "strict" || Math.random() < 0.01) {
        logger.warn(
          {
            path: req.path,
            method: req.method,
            mode: MODE,
            reason: result.reason,
            ip: req.ip,
            ua: req.header("user-agent")?.slice(0, 80),
          },
          "[tg-auth] verification failed",
        );
      }
      if (MODE === "strict") {
        res.status(401).json({ error: "TG_AUTH_REQUIRED", reason: result.reason });
        return;
      }
      req.tgUser = null;
      next();
      return;
    }

    req.tgUser = result.user;

    if (opts.bindField) {
      const claimedRaw = (req.body && typeof req.body === "object")
        ? (req.body as Record<string, unknown>)[opts.bindField]
        : undefined;

      // Telegram IDs are numeric in the JSON wire but most DB layers in this
      // codebase coerce them to text — meaning a malicious client could send
      // `{ telegramId: 123 }` (number) and the check would silently skip if
      // we only accepted strings. Normalize string|number to a canonical
      // string and treat anything else (object, array, boolean, null,
      // undefined) as a mismatch. Empty strings and "0" are also rejected:
      // an attacker who can omit the field shouldn't get a free pass.
      let mismatch = false;
      let claimedNorm: string | null = null;
      if (claimedRaw === undefined || claimedRaw === null) {
        mismatch = true;
      } else if (typeof claimedRaw === "string" || typeof claimedRaw === "number") {
        claimedNorm = String(claimedRaw).trim();
        if (!claimedNorm || claimedNorm === "0") {
          mismatch = true;
        } else if (claimedNorm !== result.user.id) {
          mismatch = true;
        }
      } else {
        // bigint, boolean, object, array → never legitimate for a Telegram id.
        mismatch = true;
      }

      if (mismatch) {
        // ALWAYS log mismatches at warn — these are the actual attack signal.
        logger.warn(
          {
            path: req.path,
            method: req.method,
            mode: MODE,
            field: opts.bindField,
            verifiedId: result.user.id,
            claimedId: claimedNorm ?? `<${typeof claimedRaw}>`,
            ip: req.ip,
          },
          "[tg-auth] bound-field mismatch (claimed user != verified user)",
        );
        if (MODE === "strict") {
          res.status(403).json({ error: "TG_USER_MISMATCH", field: opts.bindField });
          return;
        }
      }
    }

    next();
  };
}

export function getTgAuthMode(): Mode {
  return MODE;
}
