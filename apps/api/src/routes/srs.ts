import { Router, type IRouter } from "express";
import { and, eq, lte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, srsStateTable, wordsTable, kanjiTable, studySessionsTable } from "@workspace/db";
import { schedule, newCore, nextReviewDate, type Rating, type SrsCore } from "../lib/srs";

const router: IRouter = Router();

// KST 기준 오늘 (YYYY-MM-DD)
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
// 임의 타임스탬프의 KST 날짜
function kstDateOf(ts: Date | string): string {
  return new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// TTS용 괄호 제거 (공부하기와 동일)
function stripParens(s: string): string {
  return s.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}
const firstLine = (s: string | null | undefined) => (s ?? "").split("\n")[0].trim();

// 카드 → SRS 학습용 front/back + TTS 변환 (앞면 읽기와 동일한 읽기 순서)
function wordCard(w: any) {
  const reading = (w.furigana ?? "").trim() || w.japanese;
  const koreanFirst = firstLine(w.korean);
  return {
    cardType: "word" as const,
    cardId: w.id,
    type: "word" as const,
    front: w.japanese,
    furigana: w.furigana ?? null,
    back: w.korean,
    jlptLevel: w.jlptLevel ?? null,
    // 단어: 일본어(후리가나 우선) → 한국어 첫 뜻
    tts: [
      { text: stripParens(reading), lang: "ja" as const },
      { text: stripParens(koreanFirst), lang: "ko" as const },
    ].filter(t => t.text),
  };
}
function kanjiCard(k: any) {
  const back = [k.onyomi, k.kunyomi, k.korean].map((s: string) => (s ?? "").trim()).filter(Boolean).join(" / ");
  const kun = firstLine(k.kunyomi);
  const on = firstLine(k.onyomi);
  const reading = [kun, on].filter(Boolean).join("、");
  return {
    cardType: "kanji" as const,
    cardId: k.id,
    type: "kanji" as const,
    front: k.character,
    furigana: null as string | null,
    back,
    jlptLevel: k.jlptLevel ?? null,
    // 한자: 훈독、음독 (일본어)
    tts: [{ text: stripParens(reading), lang: "ja" as const }].filter(t => t.text),
  };
}

const QueueQuery = z.object({
  types: z.string().optional(),        // "word,kanji"
  levels: z.string().optional(),       // "N5,N4,N3,N2,N1"
  newLimit: z.coerce.number().int().min(0).max(200).optional(),
});

// GET /srs/queue — 오늘의 큐 (복습 먼저 셔플, 그다음 신규 셔플)
router.get("/srs/queue", async (req, res): Promise<void> => {
  const q = QueueQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const types = (q.data.types ?? "word,kanji").split(",").map(s => s.trim()).filter(Boolean);
  const includeWord = types.includes("word");
  const includeKanji = types.includes("kanji");
  const VALID_LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  const levels = (q.data.levels ?? "").split(",").map(s => s.trim().toUpperCase()).filter(l => VALID_LEVELS.includes(l));
  const newLimit = q.data.newLimit ?? 10;
  const today = todayKst();

  // 모든 SRS 상태 로드 → 카드별 맵
  const states = await db.select().from(srsStateTable);
  const stateMap = new Map<string, typeof states[number]>();
  for (const s of states) stateMap.set(`${s.cardType}:${s.cardId}`, s);

  // 대상 카드 로드
  let words = includeWord ? await db.select().from(wordsTable) : [];
  let kanji = includeKanji ? await db.select().from(kanjiTable) : [];
  if (levels.length > 0) {
    words = words.filter(w => w.jlptLevel != null && levels.includes(w.jlptLevel));
    kanji = kanji.filter(k => k.jlptLevel != null && levels.includes(k.jlptLevel));
  }

  const cards = [
    ...words.map(wordCard),
    ...kanji.map(kanjiCard),
  ];

  // 오늘(KST) 이미 시작한 신규 수 = srs_state 행이 오늘 생성된 것 (기기 무관, DB 기준)
  const startedToday = states.filter(s => kstDateOf(s.createdAt) === today).length;
  const allowance = Math.max(0, newLimit - startedToday); // 오늘 더 낼 수 있는 "새" 카드 수

  const reviewCards: any[] = [];
  const inProgressNew: any[] = [];  // 이미 srs 행이 있는 신규(reps 0) — 계속 진행
  const freshNew: any[] = [];       // 아직 손대지 않은 신규 — 오늘 남은 allowance 만큼만
  for (const c of cards) {
    const st = stateMap.get(`${c.cardType}:${c.cardId}`);
    if (!st) {
      freshNew.push({ ...c, state: newCore(), isNew: true });
    } else if (st.reps === 0) {
      inProgressNew.push({ ...c, state: core(st), isNew: true });
    } else if (st.nextReview <= today) {
      reviewCards.push({ ...c, state: core(st), isNew: false });
    }
  }

  const newSelected = [...shuffle(inProgressNew), ...shuffle(freshNew).slice(0, allowance)];
  const queue = [...shuffle(reviewCards), ...newSelected];
  res.json({
    today,
    reviewCount: reviewCards.length,
    newCount: newSelected.length,
    newAvailable: freshNew.length + inProgressNew.length,
    startedToday,
    newLimit,
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

// ── 세션 이어보기 (기기 간 동기화) — study_sessions 테이블 key "srs" 재사용 ──
const SRS_SESSION_KEY = "srs";

router.get("/srs/session", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(studySessionsTable).where(eq(studySessionsTable.key, SRS_SESSION_KEY));
  res.json({ session: row?.data ?? null });
});

router.put("/srs/session", async (req, res): Promise<void> => {
  const data = req.body?.data;
  if (data == null || typeof data !== "object") { res.status(400).json({ error: "data required" }); return; }
  await db.insert(studySessionsTable)
    .values({ key: SRS_SESSION_KEY, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: studySessionsTable.key, set: { data, updatedAt: new Date() } });
  res.json({ ok: true });
});

router.delete("/srs/session", async (_req, res): Promise<void> => {
  await db.delete(studySessionsTable).where(eq(studySessionsTable.key, SRS_SESSION_KEY));
  res.sendStatus(204);
});

export default router;
