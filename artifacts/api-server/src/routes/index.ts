import { Router, type IRouter } from "express";
import healthRouter from "./health";
import referralRouter from "./referral";
import leaderboardRouter from "./leaderboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(referralRouter);
router.use(leaderboardRouter);

export default router;
