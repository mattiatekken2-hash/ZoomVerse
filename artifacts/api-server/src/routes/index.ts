import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

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

export default router;
