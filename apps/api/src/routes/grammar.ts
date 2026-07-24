import { Router, type IRouter } from "express";
import { eq, gte, desc, sql, or } from "drizzle-orm";
import { z } from "zod";
import { db, grammarTable } from "@workspace/db";
import { generateGrammarDetail } from "../lib/grammar-ai";

const router: IRouter = Router();

const ListQuery = z.object({ dateFilter: z.enum(["today", "recent", "all"]).optional() });
const CreateBody = z.object({
  pattern: z.string().min(1),
  meaning: z.string().min(1),
  formation: z.string().optional(),
  example: z.string().optional(),
  exampleKorean: z.string().optional(),
  exampleHighlight: z.string().optional().nullable(),
  jlptLevel: z.string().optional().nullable(),
});
const UpdateBody = z.object({
  pattern: z.string().optional(),
  meaning: z.string().optional(),
  formation: z.string().optional(),
  example: z.string().optional(),
  exampleKorean: z.string().optional(),
  exampleHighlight: z.string().optional().nullable(),
  jlptLevel: z.string().optional().nullable(),
});
const IdParam = z.object({ id: z.coerce.number() });

router.get("/grammar", async (req, res): Promise<void> => {
  const query = ListQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  let qb = db.select().from(grammarTable).$dynamic();
  if (query.data.dateFilter === "today") {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    qb = qb.where(or(gte(grammarTable.createdAt, today), gte(grammarTable.studiedAt, today)));
  } else if (query.data.dateFilter === "recent") {
    const recent = new Date(); recent.setDate(recent.getDate() - 7);
    qb = qb.where(or(gte(grammarTable.createdAt, recent), gte(grammarTable.studiedAt, recent)));
  }
  const list = await qb.orderBy(desc(grammarTable.createdAt));
  res.json(list);
});

// AI 자동입력 — 문형만 받아 나머지 채워 반환 (저장은 안 함)
router.post("/grammar/lookup", async (req, res): Promise<void> => {
  const pattern = typeof req.body?.pattern === "string" ? req.body.pattern.trim() : "";
  if (!pattern) { res.status(400).json({ error: "pattern is required" }); return; }
  const detail = await generateGrammarDetail(pattern);
  if (!detail) { res.status(502).json({ error: "AI 생성 실패 또는 미설정" }); return; }
  res.json(detail);
});

router.post("/grammar", async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [row] = await db.insert(grammarTable).values({
      pattern: parsed.data.pattern,
      meaning: parsed.data.meaning,
      formation: parsed.data.formation ?? "",
      example: parsed.data.example ?? "",
      exampleKorean: parsed.data.exampleKorean ?? "",
      exampleHighlight: parsed.data.exampleHighlight ?? null,
      jlptLevel: parsed.data.jlptLevel ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") { res.status(409).json({ error: "이미 등록된 문형입니다." }); return; }
    throw err;
  }
});

router.put("/grammar/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d: Record<string, unknown> = {};
  if (parsed.data.pattern !== undefined) d.pattern = parsed.data.pattern;
  if (parsed.data.meaning !== undefined) d.meaning = parsed.data.meaning;
  if (parsed.data.formation !== undefined) d.formation = parsed.data.formation;
  if (parsed.data.example !== undefined) d.example = parsed.data.example;
  if (parsed.data.exampleKorean !== undefined) d.exampleKorean = parsed.data.exampleKorean;
  if ("exampleHighlight" in parsed.data) d.exampleHighlight = parsed.data.exampleHighlight ?? null;
  if ("jlptLevel" in parsed.data) d.jlptLevel = parsed.data.jlptLevel ?? null;

  const [row] = await db.update(grammarTable).set(d).where(eq(grammarTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Grammar not found" }); return; }
  res.json(row);
});

router.delete("/grammar/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.delete(grammarTable).where(eq(grammarTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Grammar not found" }); return; }
  res.sendStatus(204);
});

router.post("/grammar/:id/wrong", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.update(grammarTable).set({ wrongCount: sql`${grammarTable.wrongCount} + 1` }).where(eq(grammarTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Grammar not found" }); return; }
  res.json(row);
});

router.post("/grammar/:id/easy", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.update(grammarTable).set({ wrongCount: sql`GREATEST(${grammarTable.wrongCount} - 1, 0)` }).where(eq(grammarTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Grammar not found" }); return; }
  res.json(row);
});

router.post("/grammar/:id/studied", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.update(grammarTable).set({ studiedAt: new Date() }).where(eq(grammarTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Grammar not found" }); return; }
  res.json(row);
});

export default router;
