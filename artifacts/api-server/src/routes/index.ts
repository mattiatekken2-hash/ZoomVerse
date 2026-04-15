import { Router, type IRouter } from "express";
import healthRouter from "./health";
import referralRouter from "./referral";
import leaderboardRouter from "./leaderboard";
import grantsRouter from "./grants";
import adminRouter from "./admin";
import starsRouter from "./stars";

const router: IRouter = Router();

router.use(healthRouter);
router.use(referralRouter);
router.use(leaderboardRouter);
router.use(grantsRouter);
router.use(adminRouter);
router.use(starsRouter);

export default router;
