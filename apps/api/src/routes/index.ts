import { Router, type IRouter } from "express";
import healthRouter from "./health";
import wordsRouter from "./words";
import kanjiRouter from "./kanji";
import statsRouter from "./stats";
import studySessionRouter from "./study-session";

const router: IRouter = Router();

router.use(healthRouter);
router.use(wordsRouter);
router.use(kanjiRouter);
router.use(statsRouter);
router.use(studySessionRouter);

export default router;
