import { Router, type IRouter } from "express";
import { isNull, eq } from "drizzle-orm";
import { db, wordsTable, kanjiTable } from "@workspace/db";
import { classifyJlptLevel } from "../lib/jlpt";

const router: IRouter = Router();

const CONCURRENCY = 5;

async function processInBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

// 일회성: 기존 카드에 JLPT 급수가 없으면 AI로 채움. 완료 후 이 라우트는 제거 예정.
router.post("/admin/backfill-jlpt", async (_req, res): Promise<void> => {
  res.json({ started: true });

  const words = await db.select().from(wordsTable).where(isNull(wordsTable.jlptLevel));
  await processInBatches(words, async (w) => {
    const level = await classifyJlptLevel("word", w.japanese);
    await db.update(wordsTable).set({ jlptLevel: level ?? "N1" }).where(eq(wordsTable.id, w.id));
  });

  const kanjiList = await db.select().from(kanjiTable).where(isNull(kanjiTable.jlptLevel));
  await processInBatches(kanjiList, async (k) => {
    const level = await classifyJlptLevel("kanji", k.character);
    await db.update(kanjiTable).set({ jlptLevel: level ?? "N1" }).where(eq(kanjiTable.id, k.id));
  });

  console.log(`[backfill-jlpt] done: ${words.length} words, ${kanjiList.length} kanji`);
});

router.get("/admin/backfill-jlpt/status", async (_req, res): Promise<void> => {
  const wordsTotal = (await db.select().from(wordsTable)).length;
  const kanjiTotal = (await db.select().from(kanjiTable)).length;
  const wordsRemaining = (await db.select().from(wordsTable).where(isNull(wordsTable.jlptLevel))).length;
  const kanjiRemaining = (await db.select().from(kanjiTable).where(isNull(kanjiTable.jlptLevel))).length;
  res.json({ wordsTotal, wordsRemaining, kanjiTotal, kanjiRemaining });
});

export default router;
