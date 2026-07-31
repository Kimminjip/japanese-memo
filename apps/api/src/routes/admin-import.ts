import { Router, type IRouter } from "express";
import { db, wordsTable } from "@workspace/db";
import { parseCsv, translateBatch, type ImportItem } from "../lib/word-import";

const router: IRouter = Router();

const BASE = "https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src";
// 파일 급수 → 저장 급수. N3는 AI 재판정(aiLevel=true)
const FILES: { file: string; level: string; aiLevel: boolean }[] = [
  { file: "n5.csv", level: "N5", aiLevel: false },
  { file: "n4.csv", level: "N4", aiLevel: false },
  { file: "n3.csv", level: "N3", aiLevel: true },
];

const CHUNK = 25;
const CONCURRENCY = 3;

let state = { running: false, done: false, total: 0, inserted: 0, skipped: 0, stage: "" };

async function fetchCsvItems(file: string): Promise<ImportItem[]> {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) return [];
  const text = await res.text();
  const rows = parseCsv(text);
  const items: ImportItem[] = [];
  for (let i = 1; i < rows.length; i++) { // skip header
    const [expression, reading, meaning] = rows[i];
    if (!expression || !expression.trim()) continue;
    items.push({ japanese: expression.trim(), reading: (reading ?? "").trim(), english: (meaning ?? "").trim() });
  }
  return items;
}

// 일회성: elzup JLPT 단어(N5/N4/N3) 가져오기 — 한국어 뜻 번역 + N3 급수 재판정 후 words에 추가
router.post("/admin/import-jlpt-words", async (_req, res): Promise<void> => {
  if (state.running) { res.json({ alreadyRunning: true }); return; }
  state = { running: true, done: false, total: 0, inserted: 0, skipped: 0, stage: "load" };
  res.json({ started: true });

  try {
    // 기존 단어(japanese) 집합
    const existing = new Set((await db.select({ j: wordsTable.japanese }).from(wordsTable)).map(r => r.j));
    const seen = new Set<string>();

    // 후보 수집 (파일 순서대로 = 쉬운 급수 우선, 중복 제거)
    const candidates: { item: ImportItem; level: string; aiLevel: boolean }[] = [];
    for (const f of FILES) {
      const items = await fetchCsvItems(f.file);
      for (const it of items) {
        if (existing.has(it.japanese) || seen.has(it.japanese)) { continue; }
        seen.add(it.japanese);
        candidates.push({ item: it, level: f.level, aiLevel: f.aiLevel });
      }
    }
    state.total = candidates.length;
    state.stage = "translate";

    // 청크 단위 배치 번역 + 삽입 (동시성 제한)
    const chunks: typeof candidates[] = [];
    for (let i = 0; i < candidates.length; i += CHUNK) chunks.push(candidates.slice(i, i + CHUNK));

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      await Promise.all(chunks.slice(i, i + CONCURRENCY).map(async (chunk) => {
        const translated = await translateBatch(chunk.map(c => c.item));
        for (const c of chunk) {
          const t = translated.get(c.item.japanese);
          if (!t) { state.skipped++; continue; }
          const level = c.aiLevel ? t.level : c.level;
          try {
            await db.insert(wordsTable).values({
              japanese: c.item.japanese,
              furigana: c.item.reading || null,
              korean: t.korean,
              jlptLevel: level,
            }).onConflictDoNothing();
            state.inserted++;
          } catch { state.skipped++; }
        }
      }));
    }

    state.stage = "done";
    console.log(`[import-jlpt-words] inserted ${state.inserted}, skipped ${state.skipped}, total ${state.total}`);
  } finally {
    state.running = false;
    state.done = true;
  }
});

router.get("/admin/import-jlpt-words/status", async (_req, res): Promise<void> => {
  const totalWords = (await db.select({ j: wordsTable.japanese }).from(wordsTable)).length;
  res.json({ ...state, totalWordsInDb: totalWords });
});

export default router;
