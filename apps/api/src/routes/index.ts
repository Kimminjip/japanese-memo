import { Router, type IRouter } from "express";
import healthRouter from "./health";
import wordsRouter from "./words";
import kanjiRouter from "./kanji";
import statsRouter from "./stats";
import studySessionRouter from "./study-session";
import ttsRouter from "./tts";
import aiRouter from "./ai";
import grammarRouter from "./grammar";
import srsRouter from "./srs";
import adminDistractorsRouter from "./admin-distractors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(wordsRouter);
router.use(kanjiRouter);
router.use(grammarRouter);
router.use(statsRouter);
router.use(studySessionRouter);
router.use(ttsRouter);
router.use(aiRouter);
router.use(srsRouter);
router.use(adminDistractorsRouter);

export default router;
