import { Router, type IRouter } from "express";
import healthRouter from "./health";
import referralRouter from "./referral";
import leaderboardRouter from "./leaderboard";
import grantsRouter from "./grants";

const router: IRouter = Router();

router.use(healthRouter);
router.use(referralRouter);
router.use(leaderboardRouter);
router.use(grantsRouter);

export default router;
