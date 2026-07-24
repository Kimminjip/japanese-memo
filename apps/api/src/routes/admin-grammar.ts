import { Router, type IRouter } from "express";
import { db, grammarTable } from "@workspace/db";
import { generateGrammarBatch } from "../lib/grammar-ai";

const router: IRouter = Router();

const LEVELS = ["N5", "N4", "N3"];
const MAX_ROUNDS = 6; // 급수별 최대 반복 (중복 제외하며 수집)

let seeding = false;
let seedLog = { running: false, inserted: 0, level: "" };

// 일회성: N5/N4/N3 문법 문형을 AI로 대량 생성해 grammar 테이블에 채움. 완료 후 제거 예정.
router.post("/admin/seed-grammar", async (_req, res): Promise<void> => {
  if (seeding) { res.json({ alreadyRunning: true }); return; }
  seeding = true;
  seedLog = { running: true, inserted: 0, level: "" };
  res.json({ started: true });

  try {
    for (const level of LEVELS) {
      seedLog.level = level;
      const seen = new Set<string>();
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const batch = await generateGrammarBatch(level, [...seen]);
        const fresh = batch.filter(b => !seen.has(b.pattern));
        if (fresh.length === 0) break;
        for (const g of fresh) {
          seen.add(g.pattern);
          const [row] = await db.insert(grammarTable).values({
            pattern: g.pattern,
            meaning: g.meaning,
            formation: g.formation,
            example: g.example,
            exampleKorean: g.exampleKorean,
            exampleHighlight: g.exampleHighlight || null,
            jlptLevel: g.jlptLevel || level,
          }).onConflictDoNothing().returning();
          if (row) seedLog.inserted++;
        }
      }
    }
    console.log(`[seed-grammar] done: ${seedLog.inserted} patterns`);
  } finally {
    seeding = false;
    seedLog.running = false;
  }
});

router.get("/admin/seed-grammar/status", async (_req, res): Promise<void> => {
  const total = (await db.select().from(grammarTable)).length;
  res.json({ ...seedLog, total });
});

export default router;
