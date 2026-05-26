import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { requireTelegramAuth } from "../lib/telegram-auth";
import healthRouter from "./health";
import referralRouter from "./referral";
import leaderboardRouter from "./leaderboard";
import grantsRouter from "./grants";
import adminRouter from "./admin";
import starsRouter from "./stars";
import marketplaceRouter from "./marketplace";
import wheelRouter from "./wheel";
import dailyRouter from "./daily";
import mysteryBoxRouter from "./mysteryBox";
import withdrawalsRouter from "./withdrawals";
import maintenanceRouter from "./maintenance";
import farmRouter from "./farm";
import farmSettleRouter from "./farm-settle";
import userRouter from "./user";
import planetsRouter from "./planets";
import stardustRouter from "./stardust";
import merchantRouter from "./merchant";
import sunRouter from "./sun";
import collectionPlanetsRouter from "./collection-planets";
import regularPlanetsRouter from "./regular-planets";
import equipmentRouter from "./equipment";
import lotteryRouter from "./lottery";
import tasksRouter from "./tasks";
import homeRouter from "./home";
import chatRouter from "./chat";
import roomInvitesRouter from "./roomInvites";
import redeemCodesRouter from "./redeemCodes";
import obtainedRouter from "./obtained";
import economyRouter from "./economy";
import stakingRouter from "./staking";
import labRankingRouter from "./labRanking";
import historyRouter from "./history";

const router: IRouter = Router();

/**
 * Telegram auth policy — single source of truth.
 *
 * The map below lists every state-modifying / money-moving endpoint and
 * the body field that must equal the verified Telegram user id. The
 * middleware is mounted ONCE here at the top of the chain so individual
 * route files don't have to be touched, which makes the policy auditable
 * in one place and impossible to silently miss when adding new routes.
 *
 * Public read-only endpoints (GET) and webhook endpoints called by
 * Telegram servers (`/stars/webhook`) are intentionally NOT protected
 * here — the former carry no secrets, the latter are authenticated by
 * a secret-token URL and originate from Telegram, not the WebApp.
 *
 * Effective behavior is gated by `TG_AUTH_MODE`:
 *   - `off`    — verification is fully disabled
 *   - `soft`   — verifies & logs but never rejects (default; migration-safe)
 *   - `strict` — rejects 401 on missing/invalid initData, 403 on mismatch
 *
 * Default `soft` is intentional: in-flight clients (already-loaded JS
 * that doesn't yet send the header) keep working through a deploy. Flip
 * to `strict` once logs confirm all clients are sending it cleanly.
 */
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
interface ProtectedRoute {
  methods: Method[];
  paths: string[];
  bindField: string;
}

const PROTECTED_ROUTES: ProtectedRoute[] = [
  // Per-user state & money endpoints — bind to telegramId
  {
    methods: ["POST"],
    paths: [
      "/farm/start",
      "/farm/collect",
      "/farm/stop",
      "/farm/settle",
      "/balance/sync",
      "/craft/record",
      "/planets/burn",
      "/regular-planets/save",
      "/equipment/save",
      "/equipment/start",
      "/equipment/collect",
      "/equipment/burn",
      "/planets/rename",
      "/collection-planets/upsert",
      "/collection-planets/bulk-seed",
      "/sun/cycle",
      "/stardust/collect",
      "/stardust/deduct",
      "/merchant/scrap",
      "/wheel/claim-daily",
      "/wheel/spin",
      "/wheel/spin/claim",
      "/daily/claim",
      "/user/language",
      "/withdrawals/request",
      "/referral/register",
      "/referral/check-milestones",
      "/tasks/claim",
      "/home/unlock",
      "/home/computer/buy",
      "/home/computer/claim",
      "/home/computer/zoom-bonus",
      "/home/plant/buy",
      "/home/plant/water",
      "/home/plant/claim",
      "/home/slot/place",
      "/home/slot/clear",
      "/chat/send",
      "/referral/reset",
      "/stars/create-invoice",
      "/stars/confirm",
      "/ton/confirm",
      "/shop/buy-deposit",
      "/room-invites/send",
      "/room-invites/respond",
      "/redeem-codes/redeem",
      "/staking/start",
    ],
    bindField: "telegramId",
  },
  // Marketplace — seller-initiated actions bind to sellerTelegramId
  {
    methods: ["POST"],
    paths: ["/market/list", "/market/list-equipment", "/market/delist"],
    bindField: "sellerTelegramId",
  },
  // Marketplace — buyer-initiated actions bind to buyerTelegramId
  {
    methods: ["POST"],
    paths: ["/market/buy"],
    bindField: "buyerTelegramId",
  },
  // GET endpoints that need to KNOW the caller's verified Telegram id to
  // filter the response (e.g. "show MY tickets in the active round"). They
  // don't bind to a body field — the handler simply reads `req.tgUser?.id`.
  // This is NOT a write/auth gate; in soft mode, missing initData yields
  // `req.tgUser = null` and the handler must degrade gracefully (e.g.
  // returning public totals only). Without this entry the auth middleware
  // never runs for the GET, so `req.tgUser` stays undefined and the
  // handler can't recognize the user even when the client sends initData.
  {
    methods: ["GET"],
    paths: [
      "/lottery/state",
      "/lab-rank/state",
      "/referral/friends",
      "/room-invites/inbox",
      "/room-invites/visitors",
    ],
    bindField: "",
  },
  // Admin endpoints — bind to adminId. The existing isAdmin() check inside
  // each handler still runs (defense in depth: an authenticated non-admin
  // can't impersonate an admin AND can't pass the admin allow-list check).
  {
    methods: ["POST"],
    paths: [
      "/admin/credit-zoom",
      "/admin/credit-ton",
      "/admin/add-planets",
      "/admin/unlock-slots",
      "/admin/grant-auto-tap",
      "/admin/unlock-white-collection",
      "/admin/unlock-earth-collection",
      "/admin/revoke-white-collection",
      "/admin/revoke-earth-collection",
      "/admin/unlock-black-collection",
      "/admin/revoke-black-collection",
      "/admin/unlock-supernova-collection",
      "/admin/revoke-supernova-collection",
      "/admin/grant-v1",
      "/admin/grant-v1-nft",
      "/admin/global-bonus",
      "/admin/remove-zoom",
      "/admin/remove-planets",
      "/admin/remove-slots",
      "/admin/credit-stardust",
      "/admin/remove-stardust",
      "/admin/remove-ton",
      "/admin/credit-spins",
      "/admin/force-delist",
      "/admin/clear-planet-market",
      "/admin/clear-equipment-market",
      "/admin/remove-spins",
      "/admin/force-merchant-spawn",
      "/admin/reset-season",
      "/admin/mark-ton-completed",
      "/admin/reconcile-referrals",
      "/admin/reconcile-stars",
      "/admin/test-withdrawal-channel",
      "/admin/withdrawals/approve",
      "/admin/withdrawals/reject",
      "/admin/maintenance",
      "/admin/lottery/draw",
      "/admin/lab-rank/close",
      "/admin/disable-user",
      "/admin/enable-user",
      "/admin/bulk-disable",
      "/referral/unlink",
      "/admin/redeem-codes/create",
      "/admin/redeem-codes/list",
      "/admin/anti-cheat-purge-referrals",
      "/admin/referrals/audit",
      "/admin/referrals/purge-fakes",
      "/admin/stardust/total",
    ],
    bindField: "adminId",
  },
];

// Pre-compute lookup map for O(1) per-request match.
const protectedMap = new Map<string, { methods: Set<Method>; bindField: string }>();
for (const entry of PROTECTED_ROUTES) {
  for (const path of entry.paths) {
    const existing = protectedMap.get(path);
    if (existing) {
      // Same path declared under two bindFields = configuration bug. Fail loud
      // rather than letting one definition silently win.
      throw new Error(`[tg-auth] duplicate protected route configuration for ${path}`);
    }
    protectedMap.set(path, { methods: new Set(entry.methods), bindField: entry.bindField });
  }
}

/**
 * Canonicalize the request path before looking it up in the protected map.
 * Belt-and-suspenders with the `case sensitive routing` + `strict routing`
 * Express settings in app.ts: even if a future change disables those, this
 * lookup will still match `/BALANCE/SYNC/` to `/balance/sync` and apply the
 * same auth policy as the bare path.
 *
 * Steps:
 *   1. Lowercase (Telegram doesn't care; our routes are all lowercase).
 *   2. Strip a single trailing slash, but never the root.
 *   3. Reject anything containing `..` or backslashes (defense vs path traversal
 *      attempts hitting the auth lookup).
 */
function canonicalizePath(p: string): string {
  if (!p || typeof p !== "string") return "/";
  if (p.indexOf("\\") >= 0 || p.indexOf("..") >= 0) return "/__invalid__";
  let s = p.toLowerCase();
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

router.use((req: Request, res: Response, next: NextFunction) => {
  const canonical = canonicalizePath(req.path);
  const conf = protectedMap.get(canonical);
  if (!conf) return next();
  if (!conf.methods.has(req.method as Method)) return next();
  return requireTelegramAuth({ bindField: conf.bindField })(req, res, next);
});

router.use(healthRouter);
router.use(referralRouter);
router.use(leaderboardRouter);
router.use(grantsRouter);
router.use(adminRouter);
router.use(starsRouter);
router.use(marketplaceRouter);
router.use(wheelRouter);
router.use(dailyRouter);
router.use(mysteryBoxRouter);
router.use(withdrawalsRouter);
router.use(maintenanceRouter);
router.use(farmRouter);
router.use(farmSettleRouter);
router.use(userRouter);
router.use(planetsRouter);
router.use(stardustRouter);
router.use(merchantRouter);
router.use(sunRouter);
router.use(collectionPlanetsRouter);
router.use(regularPlanetsRouter);
router.use(equipmentRouter);
router.use(lotteryRouter);
router.use(tasksRouter);
router.use(homeRouter);
router.use(chatRouter);
router.use(roomInvitesRouter);
router.use(redeemCodesRouter);
router.use(economyRouter);
router.use(stakingRouter);
router.use(obtainedRouter);
router.use(labRankingRouter);
router.use(historyRouter);

export default router;
