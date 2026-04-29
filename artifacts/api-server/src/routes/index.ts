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
import withdrawalsRouter from "./withdrawals";
import maintenanceRouter from "./maintenance";
import farmRouter from "./farm";
import userRouter from "./user";
import planetsRouter from "./planets";
import stardustRouter from "./stardust";
import hallOfFameRouter from "./hallOfFame";
import merchantRouter from "./merchant";
import sunRouter from "./sun";
import collectionPlanetsRouter from "./collection-planets";
import regularPlanetsRouter from "./regular-planets";

const router: IRouter = Router();

router.use(healthRouter);
// hallOfFameRouter must be mounted BEFORE referralRouter: it owns
// /referral/daily-leaderboard, which would otherwise be swallowed by
// referralRouter's /referral/:telegramId catch-all.
router.use(hallOfFameRouter);
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
router.use(userRouter);
router.use(planetsRouter);
router.use(stardustRouter);
router.use(hallOfFameRouter);
router.use(merchantRouter);
router.use(sunRouter);
router.use(collectionPlanetsRouter);
router.use(regularPlanetsRouter);

export default router;
