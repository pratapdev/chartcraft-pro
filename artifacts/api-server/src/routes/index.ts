import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(syncRouter);
router.use(aiRouter);

export default router;
