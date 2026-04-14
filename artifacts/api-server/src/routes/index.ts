import { Router, type IRouter } from "express";
import healthRouter from "./health";
import referralRouter from "./referral";

const router: IRouter = Router();

router.use(healthRouter);
router.use(referralRouter);

export default router;
