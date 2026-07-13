import { Router, type IRouter } from "express";
import { gte, count, sql } from "drizzle-orm";
import { db, wordsTable, kanjiTable, studyActivityTable } from "@workspace/db";
import { GetStatsSummaryResponse, GetWeakItemsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const WEAK_THRESHOLD = 3;

// KST(UTC+9) 기준 "YYYY-MM-DD"
function kstDateStr(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

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

// 학습 이벤트 기록 — 오늘(KST) 카운트 증가
router.post("/stats/activity", async (req, res): Promise<void> => {
  const inc = Math.max(1, Math.min(100, Number(req.body?.count) || 1));
  const today = kstDateStr();
  await db
    .insert(studyActivityTable)
    .values({ date: today, count: inc })
    .onConflictDoUpdate({
      target: studyActivityTable.date,
      set: { count: sql`${studyActivityTable.count} + ${inc}` },
    });
  res.json({ ok: true });
});

// 학습 활동 통계 — 잔디밭 + 스트릭 + 기간별 합계
router.get("/stats/activity", async (req, res): Promise<void> => {
  const rows = await db.select().from(studyActivityTable);
  const map = new Map(rows.map(r => [r.date, r.count]));

  const today = kstDateStr();
  const todayCount = map.get(today) ?? 0;

  // 최근 7일 합계
  let weekCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = kstDateStr(new Date(Date.now() - i * 86400000));
    weekCount += map.get(d) ?? 0;
  }

  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  // 현재 스트릭 — 오늘(또는 어제)부터 연속으로 count>0인 날
  let currentStreak = 0;
  {
    let cursor = new Date();
    // 오늘 학습 안 했으면 어제부터 카운트 (오늘은 아직 진행 중일 수 있음)
    if (todayCount === 0) cursor = new Date(Date.now() - 86400000);
    while ((map.get(kstDateStr(cursor)) ?? 0) > 0) {
      currentStreak++;
      cursor = new Date(cursor.getTime() - 86400000);
    }
  }

  // 최고 스트릭
  const dates = rows.filter(r => r.count > 0).map(r => r.date).sort();
  let bestStreak = 0, run = 0;
  let prev: string | null = null;
  for (const ds of dates) {
    if (prev) {
      const gap = (Date.parse(ds) - Date.parse(prev)) / 86400000;
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    bestStreak = Math.max(bestStreak, run);
    prev = ds;
  }

  // 잔디밭용: 최근 대략 17주(119일) 날짜별 count
  const heatmap: { date: string; count: number }[] = [];
  for (let i = 118; i >= 0; i--) {
    const d = kstDateStr(new Date(Date.now() - i * 86400000));
    heatmap.push({ date: d, count: map.get(d) ?? 0 });
  }

  res.json({ todayCount, weekCount, totalCount, currentStreak, bestStreak, heatmap });
});

router.get("/stats/weak", async (req, res): Promise<void> => {
  const words = await db.select().from(wordsTable).where(sql`${wordsTable.wrongCount} >= ${WEAK_THRESHOLD} OR ${wordsTable.manualWeak} = true`);
  const kanjiList = await db.select().from(kanjiTable).where(sql`${kanjiTable.wrongCount} >= ${WEAK_THRESHOLD} OR ${kanjiTable.manualWeak} = true`);

  res.json(GetWeakItemsResponse.parse({ words, kanji: kanjiList }));
});

export default router;
