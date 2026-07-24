import { Router, type IRouter } from "express";
import { isNull, eq } from "drizzle-orm";
import { db, wordsTable, kanjiTable } from "@workspace/db";
import { generateWordDistractors, generateKanjiDistractors } from "../lib/distractors";

const router: IRouter = Router();

const CONCURRENCY = 5;

async function processInBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

// 일회성: 기존 카드에 퀴즈 오답 보기가 없으면 AI로 채움. 완료 후 이 라우트는 제거 예정.
router.post("/admin/backfill-distractors", async (_req, res): Promise<void> => {
  res.json({ started: true });

  const words = await db.select().from(wordsTable).where(isNull(wordsTable.distractors));
  await processInBatches(words, async (w) => {
    const d = await generateWordDistractors(w.japanese, w.korean);
    if (d.length) await db.update(wordsTable).set({ distractors: d }).where(eq(wordsTable.id, w.id));
  });

  const kanjiList = await db.select().from(kanjiTable).where(isNull(kanjiTable.distractors));
  await processInBatches(kanjiList, async (k) => {
    const d = await generateKanjiDistractors(k.character, k.onyomi, k.kunyomi);
    if (d.length) await db.update(kanjiTable).set({ distractors: d }).where(eq(kanjiTable.id, k.id));
  });

  console.log(`[backfill-distractors] done: ${words.length} words, ${kanjiList.length} kanji`);
});

router.get("/admin/backfill-distractors/status", async (_req, res): Promise<void> => {
  const wordsTotal = (await db.select().from(wordsTable)).length;
  const kanjiTotal = (await db.select().from(kanjiTable)).length;
  const wordsRemaining = (await db.select().from(wordsTable).where(isNull(wordsTable.distractors))).length;
  const kanjiRemaining = (await db.select().from(kanjiTable).where(isNull(kanjiTable.distractors))).length;
  res.json({ wordsTotal, wordsRemaining, kanjiTotal, kanjiRemaining });
});

export default router;
