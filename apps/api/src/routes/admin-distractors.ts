import { Router, type IRouter } from "express";
import { isNull, eq } from "drizzle-orm";
import { db, wordsTable, kanjiTable } from "@workspace/db";
import { generateWordDistractors, generateKanjiDistractors } from "../lib/distractors";

const router: IRouter = Router();

const CONCURRENCY = 5;
let state = { running: false, done: false, total: 0, filled: 0, skipped: 0 };

async function processInBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

// 일회성: 오답 보기가 없는 카드(대량 임포트로 들어온 단어 등)를 AI로 채움
router.post("/admin/backfill-distractors", async (_req, res): Promise<void> => {
  if (state.running) { res.json({ alreadyRunning: true }); return; }
  state = { running: true, done: false, total: 0, filled: 0, skipped: 0 };
  res.json({ started: true });

  try {
    const words = await db.select().from(wordsTable).where(isNull(wordsTable.distractors));
    const kanjiList = await db.select().from(kanjiTable).where(isNull(kanjiTable.distractors));
    state.total = words.length + kanjiList.length;

    await processInBatches(words, async (w) => {
      const d = await generateWordDistractors(w.japanese, w.korean);
      if (d.length) {
        await db.update(wordsTable).set({ distractors: d }).where(eq(wordsTable.id, w.id));
        state.filled++;
      } else state.skipped++;
    });

    await processInBatches(kanjiList, async (k) => {
      const d = await generateKanjiDistractors(k.character, k.onyomi, k.kunyomi);
      if (d.length) {
        await db.update(kanjiTable).set({ distractors: d }).where(eq(kanjiTable.id, k.id));
        state.filled++;
      } else state.skipped++;
    });

    console.log(`[backfill-distractors] filled ${state.filled}, skipped ${state.skipped}`);
  } finally {
    state.running = false;
    state.done = true;
  }
});

router.get("/admin/backfill-distractors/status", async (_req, res): Promise<void> => {
  const wordsRemaining = (await db.select().from(wordsTable).where(isNull(wordsTable.distractors))).length;
  const kanjiRemaining = (await db.select().from(kanjiTable).where(isNull(kanjiTable.distractors))).length;
  res.json({ ...state, wordsRemaining, kanjiRemaining });
});

export default router;
