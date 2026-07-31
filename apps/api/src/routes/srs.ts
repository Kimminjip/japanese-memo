import { Router, type IRouter } from "express";
import { and, eq, lte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, srsStateTable, wordsTable, kanjiTable } from "@workspace/db";
import { schedule, newCore, nextReviewDate, type Rating, type SrsCore } from "../lib/srs";

const router: IRouter = Router();

// KST 기준 오늘 (YYYY-MM-DD)
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 카드 → SRS 학습용 front/back 변환 (엔진은 몰라도 되지만 응답엔 필요)
function wordCard(w: any) {
  return {
    cardType: "word" as const,
    cardId: w.id,
    type: "word" as const,
    front: w.japanese,
    furigana: w.furigana ?? null,
    back: w.korean,
    grade: null as number | null,
  };
}
function kanjiCard(k: any) {
  const back = [k.onyomi, k.kunyomi, k.korean].map((s: string) => (s ?? "").trim()).filter(Boolean).join(" / ");
  return {
    cardType: "kanji" as const,
    cardId: k.id,
    type: "kanji" as const,
    front: k.character,
    furigana: null as string | null,
    back,
    grade: k.grade ?? null,
  };
}

const QueueQuery = z.object({
  types: z.string().optional(),        // "word,kanji"
  grades: z.string().optional(),       // "1,2,3" (kanji only)
  newLimit: z.coerce.number().int().min(0).max(200).optional(),
});

// GET /srs/queue — 오늘의 큐 (복습 먼저 셔플, 그다음 신규 셔플)
router.get("/srs/queue", async (req, res): Promise<void> => {
  const q = QueueQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const types = (q.data.types ?? "word,kanji").split(",").map(s => s.trim()).filter(Boolean);
  const includeWord = types.includes("word");
  const includeKanji = types.includes("kanji");
  const grades = (q.data.grades ?? "").split(",").map(s => Number(s.trim())).filter(n => n >= 1 && n <= 6);
  const newLimit = q.data.newLimit ?? 10;
  const today = todayKst();

  // 모든 SRS 상태 로드 → 카드별 맵
  const states = await db.select().from(srsStateTable);
  const stateMap = new Map<string, typeof states[number]>();
  for (const s of states) stateMap.set(`${s.cardType}:${s.cardId}`, s);

  // 대상 카드 로드
  const words = includeWord ? await db.select().from(wordsTable) : [];
  let kanji = includeKanji ? await db.select().from(kanjiTable) : [];
  if (includeKanji && grades.length > 0) kanji = kanji.filter(k => k.grade != null && grades.includes(k.grade));

  const cards = [
    ...words.map(wordCard),
    ...kanji.map(kanjiCard),
  ];

  const reviewCards: any[] = [];
  const newCards: any[] = [];
  for (const c of cards) {
    const st = stateMap.get(`${c.cardType}:${c.cardId}`);
    if (!st || st.reps === 0) {
      // 신규
      newCards.push({ ...c, state: st ? core(st) : newCore(), isNew: true });
    } else if (st.nextReview <= today) {
      // 복습 (기한 도래)
      reviewCards.push({ ...c, state: core(st), isNew: false });
    }
  }

  const queue = [...shuffle(reviewCards), ...shuffle(newCards).slice(0, newLimit)];
  res.json({
    today,
    reviewCount: reviewCards.length,
    newCount: Math.min(newCards.length, newLimit),
    newAvailable: newCards.length,
    queue,
  });
});

function core(st: { interval: number; ease: number; reps: number; lapses: number }): SrsCore {
  return { interval: st.interval, ease: st.ease, reps: st.reps, lapses: st.lapses };
}

const GradeBody = z.object({
  cardType: z.enum(["word", "kanji"]),
  cardId: z.number().int(),
  rating: z.enum(["again", "hard", "good"]),
});

// POST /srs/grade — 한 장 채점 → 상태 갱신 (한 장마다 즉시 저장)
router.post("/srs/grade", async (req, res): Promise<void> => {
  const parsed = GradeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { cardType, cardId, rating } = parsed.data;

  const [existing] = await db.select().from(srsStateTable)
    .where(and(eq(srsStateTable.cardType, cardType), eq(srsStateTable.cardId, cardId)));
  const prev: SrsCore = existing ? core(existing) : newCore();
  const next = schedule(prev, rating as Rating);
  const nextReview = nextReviewDate(next.interval);

  if (existing) {
    await db.update(srsStateTable).set({
      interval: next.interval, ease: next.ease, reps: next.reps, lapses: next.lapses,
      nextReview, updatedAt: new Date(),
    }).where(eq(srsStateTable.id, existing.id));
  } else {
    await db.insert(srsStateTable).values({
      cardType, cardId, interval: next.interval, ease: next.ease, reps: next.reps, lapses: next.lapses,
      nextReview,
    }).onConflictDoUpdate({
      target: [srsStateTable.cardType, srsStateTable.cardId],
      set: { interval: next.interval, ease: next.ease, reps: next.reps, lapses: next.lapses, nextReview, updatedAt: new Date() },
    });
  }

  res.json({ cardType, cardId, ...next, nextReview });
});

// GET /srs/stats — 간단 통계 (복습 예정/신규/전체 등)
router.get("/srs/stats", async (_req, res): Promise<void> => {
  const today = todayKst();
  const [due] = await db.select({ c: sql<number>`count(*)` }).from(srsStateTable)
    .where(and(sql`${srsStateTable.reps} > 0`, lte(srsStateTable.nextReview, today)));
  const [learning] = await db.select({ c: sql<number>`count(*)` }).from(srsStateTable)
    .where(sql`${srsStateTable.reps} > 0`);
  res.json({ today, due: Number(due?.c ?? 0), learning: Number(learning?.c ?? 0) });
});

export default router;
