import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, grammarTable } from "@workspace/db";
import { reviewGrammarCard } from "../lib/grammar-review";

const router: IRouter = Router();

const CONCURRENCY = 5;
const LEVEL_RANK: Record<string, number> = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };

async function processInBatches<T>(items: T[], fn: (item: T, i: number) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map((it, j) => fn(it, i + j)));
  }
}

let state = { running: false, reviewed: 0, total: 0, deleted: 0, done: false };

// 일회성: 문법 전체 재검토 — highlight를 문형 부분만으로 교정, 급수 재판정,
// 중복(canonical) 문형을 가장 쉬운 급수로 통일(하나만 남기고 삭제), 급수 내 기초 난이도 순으로 createdAt 재배치.
router.post("/admin/review-grammar", async (_req, res): Promise<void> => {
  if (state.running) { res.json({ alreadyRunning: true }); return; }
  state = { running: true, reviewed: 0, total: 0, deleted: 0, done: false };
  res.json({ started: true });

  try {
    const rows = await db.select().from(grammarTable);
    state.total = rows.length;

    // 1) 각 카드 재검토 → highlight/level 갱신, canonical/rank 수집
    const meta = new Map<number, { canonical: string; rank: number; level: string }>();
    await processInBatches(rows, async (row) => {
      const r = await reviewGrammarCard(row.pattern, row.example, row.jlptLevel);
      state.reviewed++;
      if (!r) { meta.set(row.id, { canonical: "", rank: 50, level: row.jlptLevel ?? "N3" }); return; }
      await db.update(grammarTable)
        .set({ exampleHighlight: r.highlight || null, jlptLevel: r.level })
        .where(eq(grammarTable.id, row.id));
      meta.set(row.id, { canonical: r.canonical, rank: r.rank, level: r.level });
    });

    // 2) 중복 제거 — canonical 같으면 가장 쉬운 급수 카드 하나만 남기고 삭제
    const groups = new Map<string, number[]>();
    for (const row of rows) {
      const m = meta.get(row.id)!;
      const key = m.canonical || `__id_${row.id}`; // canonical 없으면 자기 자신만
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row.id);
    }
    const survivors: number[] = [];
    for (const [, ids] of groups) {
      ids.sort((a, b) => {
        const ma = meta.get(a)!, mb = meta.get(b)!;
        const r = (LEVEL_RANK[ma.level] ?? 9) - (LEVEL_RANK[mb.level] ?? 9);
        if (r !== 0) return r;
        if (ma.rank !== mb.rank) return ma.rank - mb.rank;
        return a - b;
      });
      const keep = ids[0];
      survivors.push(keep);
      // 생존 카드를 그룹 내 가장 쉬운 급수로 통일
      const easiestLevel = meta.get(keep)!.level;
      await db.update(grammarTable).set({ jlptLevel: easiestLevel }).where(eq(grammarTable.id, keep));
      for (const del of ids.slice(1)) {
        await db.delete(grammarTable).where(eq(grammarTable.id, del));
        state.deleted++;
      }
    }

    // 3) 재정렬 — (급수, rank) 순으로 생존 카드 정렬 후 기존 createdAt 집합을 오름차순 재할당
    const remaining = await db.select().from(grammarTable);
    const stamps = remaining.map(r => r.createdAt).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const sorted = [...remaining].sort((a, b) => {
      const ma = meta.get(a.id), mb = meta.get(b.id);
      const la = LEVEL_RANK[a.jlptLevel ?? ""] ?? 9;
      const lb = LEVEL_RANK[b.jlptLevel ?? ""] ?? 9;
      if (la !== lb) return la - lb;
      const ra = ma?.rank ?? 50, rb = mb?.rank ?? 50;
      if (ra !== rb) return ra - rb;
      return a.id - b.id;
    });
    for (let i = 0; i < sorted.length; i++) {
      await db.update(grammarTable).set({ createdAt: stamps[i] }).where(eq(grammarTable.id, sorted[i].id));
    }

    console.log(`[review-grammar] done: reviewed ${state.reviewed}, deleted ${state.deleted}, remaining ${remaining.length}`);
  } finally {
    state.running = false;
    state.done = true;
  }
});

router.get("/admin/review-grammar/status", async (_req, res): Promise<void> => {
  const total = (await db.select().from(grammarTable)).length;
  res.json({ ...state, currentTotal: total });
});

export default router;
