import { Router, type IRouter } from "express";
import { eq, gte, desc, sql } from "drizzle-orm";
import { db, wordsTable } from "@workspace/db";
import {
  ListWordsQueryParams,
  ListWordsResponse,
  CreateWordBody,
  GetWordParams,
  GetWordResponse,
  UpdateWordParams,
  UpdateWordBody,
  UpdateWordResponse,
  DeleteWordParams,
  RecordWordWrongParams,
  RecordWordWrongResponse,
  MarkWordStudiedParams,
  MarkWordStudiedResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/words", async (req, res): Promise<void> => {
  const query = ListWordsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let qb = db.select().from(wordsTable).$dynamic();

  if (query.data.dateFilter === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    qb = qb.where(gte(wordsTable.createdAt, today));
  } else if (query.data.dateFilter === "recent") {
    const recent = new Date();
    recent.setDate(recent.getDate() - 7);
    qb = qb.where(gte(wordsTable.createdAt, recent));
  }

  const words = await qb.orderBy(desc(wordsTable.createdAt));
  res.json(ListWordsResponse.parse(words));
});

router.post("/words", async (req, res): Promise<void> => {
  const parsed = CreateWordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [word] = await db.insert(wordsTable).values({
      japanese: parsed.data.japanese,
      furigana: parsed.data.furigana ?? null,
      korean: parsed.data.korean,
    }).returning();
    res.status(201).json(GetWordResponse.parse(word));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "이미 등록된 단어입니다." });
      return;
    }
    throw err;
  }
});

router.get("/words/:id", async (req, res): Promise<void> => {
  const params = GetWordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [word] = await db.select().from(wordsTable).where(eq(wordsTable.id, params.data.id));
  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  res.json(GetWordResponse.parse(word));
});

router.put("/words/:id", async (req, res): Promise<void> => {
  const params = UpdateWordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateWordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.japanese !== undefined) updateData.japanese = parsed.data.japanese;
  if (parsed.data.korean !== undefined) updateData.korean = parsed.data.korean;
  if ("furigana" in parsed.data) updateData.furigana = parsed.data.furigana ?? null;
  if (parsed.data.wrongCount !== undefined) updateData.wrongCount = parsed.data.wrongCount;
  if (parsed.data.manualWeak !== undefined) updateData.manualWeak = parsed.data.manualWeak;

  const [word] = await db.update(wordsTable).set(updateData).where(eq(wordsTable.id, params.data.id)).returning();
  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  res.json(UpdateWordResponse.parse(word));
});

router.delete("/words/:id", async (req, res): Promise<void> => {
  const params = DeleteWordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [word] = await db.delete(wordsTable).where(eq(wordsTable.id, params.data.id)).returning();
  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/words/:id/wrong", async (req, res): Promise<void> => {
  const params = RecordWordWrongParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [word] = await db
    .update(wordsTable)
    .set({ wrongCount: sql`${wordsTable.wrongCount} + 1` })
    .where(eq(wordsTable.id, params.data.id))
    .returning();

  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  res.json(RecordWordWrongResponse.parse(word));
});

router.post("/words/:id/easy", async (req, res): Promise<void> => {
  const params = RecordWordWrongParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [word] = await db
    .update(wordsTable)
    .set({ wrongCount: sql`GREATEST(${wordsTable.wrongCount} - 1, 0)` })
    .where(eq(wordsTable.id, params.data.id))
    .returning();

  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  res.json(RecordWordWrongResponse.parse(word));
});

router.post("/words/:id/studied", async (req, res): Promise<void> => {
  const params = MarkWordStudiedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [word] = await db
    .update(wordsTable)
    .set({ studiedAt: new Date() })
    .where(eq(wordsTable.id, params.data.id))
    .returning();

  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  res.json(MarkWordStudiedResponse.parse(word));
});

export default router;
