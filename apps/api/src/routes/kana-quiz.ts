import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();
let ready: Promise<void> | null = null;

function ensureTable() {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS kana_quiz_stats (
        kana TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        wrong_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => undefined);
  }
  return ready;
}

router.get("/kana-quiz/stats", async (_req, res): Promise<void> => {
  await ensureTable();
  const result = await pool.query("SELECT kana, attempts, wrong_count AS wrong FROM kana_quiz_stats");
  res.json(result.rows);
});

router.post("/kana-quiz/result", async (req, res): Promise<void> => {
  await ensureTable();
  const kana = String(req.body?.kana ?? "").trim();
  const wrong = req.body?.wrong === true ? 1 : 0;
  if (!kana || kana.length > 4) {
    res.status(400).json({ message: "올바른 글자가 필요합니다." });
    return;
  }
  const result = await pool.query(
    `INSERT INTO kana_quiz_stats (kana, attempts, wrong_count)
     VALUES ($1, 1, $2)
     ON CONFLICT (kana) DO UPDATE SET
       attempts = kana_quiz_stats.attempts + 1,
       wrong_count = kana_quiz_stats.wrong_count + $2,
       updated_at = NOW()
     RETURNING kana, attempts, wrong_count AS wrong`,
    [kana, wrong],
  );
  res.json(result.rows[0]);
});

export default router;
