import { Router, type IRouter } from "express";
import healthRouter from "./health";
import wordsRouter from "./words";
import kanjiRouter from "./kanji";
import statsRouter from "./stats";
import studySessionRouter from "./study-session";
import ttsRouter from "./tts";
import aiRouter from "./ai";
import grammarRouter from "./grammar";
import adminRouter from "./admin";
import adminGrammarRouter from "./admin-grammar";

const router: IRouter = Router();

router.use(healthRouter);
router.use(wordsRouter);
router.use(kanjiRouter);
router.use(grammarRouter);
router.use(statsRouter);
router.use(studySessionRouter);
router.use(ttsRouter);
router.use(aiRouter);
router.use(adminRouter);
router.use(adminGrammarRouter);

export default router;
