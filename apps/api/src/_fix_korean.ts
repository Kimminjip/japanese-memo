import { db, wordsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq } from "drizzle-orm";

function splitDedup(korean: string): string {
  const parts = korean.split(",").map(s => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }
  return result.join("\n");
}

const rows = await db.select().from(wordsTable);
const affected = rows.filter(w => w.korean.includes(",") && !w.korean.includes("\n"));
console.log("수정 대상:", affected.length);

const CONCURRENCY = 10;
let changed = 0;
for (let i = 0; i < affected.length; i += CONCURRENCY) {
  const batch = affected.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(async (w) => {
    const fixed = splitDedup(w.korean);
    if (fixed !== w.korean) {
      await db.update(wordsTable).set({ korean: fixed }).where(eq(wordsTable.id, w.id));
      changed++;
    }
  }));
  if (i % 200 === 0) console.log(`진행: ${i}/${affected.length}`);
}
console.log("수정 완료:", changed);
await pool.end();
