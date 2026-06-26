import { Router, type IRouter } from "express";
import { gte, count, sql } from "drizzle-orm";
import { db, wordsTable, kanjiTable } from "@workspace/db";
import { GetStatsSummaryResponse, GetWeakItemsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const WEAK_THRESHOLD = 3;

router.get("/stats/summary", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalWordsResult] = await db.select({ count: count() }).from(wordsTable);
  const [totalKanjiResult] = await db.select({ count: count() }).from(kanjiTable);
  const [todayWordsResult] = await db.select({ count: count() }).from(wordsTable).where(gte(wordsTable.createdAt, today));
  const [todayKanjiResult] = await db.select({ count: count() }).from(kanjiTable).where(gte(kanjiTable.createdAt, today));
  const [weakWordsResult] = await db.select({ count: count() }).from(wordsTable).where(sql`${wordsTable.wrongCount} >= ${WEAK_THRESHOLD} OR ${wordsTable.manualWeak} = true`);
  const [weakKanjiResult] = await db.select({ count: count() }).from(kanjiTable).where(sql`${kanjiTable.wrongCount} >= ${WEAK_THRESHOLD} OR ${kanjiTable.manualWeak} = true`);

  const summary = {
    totalWords: totalWordsResult?.count ?? 0,
    totalKanji: totalKanjiResult?.count ?? 0,
    todayWords: todayWordsResult?.count ?? 0,
    todayKanji: todayKanjiResult?.count ?? 0,
    weakWords: weakWordsResult?.count ?? 0,
    weakKanji: weakKanjiResult?.count ?? 0,
  };

  res.json(GetStatsSummaryResponse.parse(summary));
});

router.get("/stats/weak", async (req, res): Promise<void> => {
  const words = await db.select().from(wordsTable).where(sql`${wordsTable.wrongCount} >= ${WEAK_THRESHOLD} OR ${wordsTable.manualWeak} = true`);
  const kanjiList = await db.select().from(kanjiTable).where(sql`${kanjiTable.wrongCount} >= ${WEAK_THRESHOLD} OR ${kanjiTable.manualWeak} = true`);

  res.json(GetWeakItemsResponse.parse({ words, kanji: kanjiList }));
});

export default router;
