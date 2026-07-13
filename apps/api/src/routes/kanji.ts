import { Router, type IRouter } from "express";
import { eq, gte, desc, sql, or } from "drizzle-orm";
import { db, kanjiTable } from "@workspace/db";
import { classifyJlptLevel } from "../lib/jlpt";
import {
  ListKanjiQueryParams,
  ListKanjiResponse,
  CreateKanjiBody,
  GetKanjiParams,
  GetKanjiResponse,
  UpdateKanjiParams,
  UpdateKanjiBody,
  UpdateKanjiResponse,
  DeleteKanjiParams,
  RecordKanjiWrongParams,
  RecordKanjiWrongResponse,
  MarkKanjiStudiedParams,
  MarkKanjiStudiedResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/kanji", async (req, res): Promise<void> => {
  const query = ListKanjiQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let qb = db.select().from(kanjiTable).$dynamic();

  if (query.data.dateFilter === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    qb = qb.where(or(gte(kanjiTable.createdAt, today), gte(kanjiTable.studiedAt, today)));
  } else if (query.data.dateFilter === "recent") {
    const recent = new Date();
    recent.setDate(recent.getDate() - 7);
    qb = qb.where(or(gte(kanjiTable.createdAt, recent), gte(kanjiTable.studiedAt, recent)));
  }

  const kanjiList = await qb.orderBy(desc(kanjiTable.createdAt));
  res.json(ListKanjiResponse.parse(kanjiList));
});

router.post("/kanji", async (req, res): Promise<void> => {
  const parsed = CreateKanjiBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const jlptLevel = await classifyJlptLevel("kanji", parsed.data.character);
    const [kanji] = await db.insert(kanjiTable).values({
      character: parsed.data.character,
      onyomi: parsed.data.onyomi,
      kunyomi: parsed.data.kunyomi,
      korean: parsed.data.korean ?? "",
      jlptLevel,
    }).returning();
    res.status(201).json(GetKanjiResponse.parse(kanji));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "이미 등록된 한자입니다." });
      return;
    }
    throw err;
  }
});

router.get("/kanji/:id", async (req, res): Promise<void> => {
  const params = GetKanjiParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [kanji] = await db.select().from(kanjiTable).where(eq(kanjiTable.id, params.data.id));
  if (!kanji) {
    res.status(404).json({ error: "Kanji not found" });
    return;
  }

  res.json(GetKanjiResponse.parse(kanji));
});

router.put("/kanji/:id", async (req, res): Promise<void> => {
  const params = UpdateKanjiParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateKanjiBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.character !== undefined) updateData.character = parsed.data.character;
  if (parsed.data.onyomi !== undefined) updateData.onyomi = parsed.data.onyomi;
  if (parsed.data.kunyomi !== undefined) updateData.kunyomi = parsed.data.kunyomi;
  if (parsed.data.korean !== undefined) updateData.korean = parsed.data.korean;
  if (parsed.data.wrongCount !== undefined) updateData.wrongCount = parsed.data.wrongCount;
  if (parsed.data.manualWeak !== undefined) updateData.manualWeak = parsed.data.manualWeak;

  const [kanji] = await db.update(kanjiTable).set(updateData).where(eq(kanjiTable.id, params.data.id)).returning();
  if (!kanji) {
    res.status(404).json({ error: "Kanji not found" });
    return;
  }

  res.json(UpdateKanjiResponse.parse(kanji));
});

router.delete("/kanji/:id", async (req, res): Promise<void> => {
  const params = DeleteKanjiParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [kanji] = await db.delete(kanjiTable).where(eq(kanjiTable.id, params.data.id)).returning();
  if (!kanji) {
    res.status(404).json({ error: "Kanji not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/kanji/:id/wrong", async (req, res): Promise<void> => {
  const params = RecordKanjiWrongParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [kanji] = await db
    .update(kanjiTable)
    .set({ wrongCount: sql`${kanjiTable.wrongCount} + 1` })
    .where(eq(kanjiTable.id, params.data.id))
    .returning();

  if (!kanji) {
    res.status(404).json({ error: "Kanji not found" });
    return;
  }

  res.json(RecordKanjiWrongResponse.parse(kanji));
});

router.post("/kanji/:id/easy", async (req, res): Promise<void> => {
  const params = RecordKanjiWrongParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [kanji] = await db
    .update(kanjiTable)
    .set({ wrongCount: sql`GREATEST(${kanjiTable.wrongCount} - 1, 0)` })
    .where(eq(kanjiTable.id, params.data.id))
    .returning();

  if (!kanji) {
    res.status(404).json({ error: "Kanji not found" });
    return;
  }

  res.json(RecordKanjiWrongResponse.parse(kanji));
});

router.post("/kanji/:id/studied", async (req, res): Promise<void> => {
  const params = MarkKanjiStudiedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [kanji] = await db
    .update(kanjiTable)
    .set({ studiedAt: new Date() })
    .where(eq(kanjiTable.id, params.data.id))
    .returning();

  if (!kanji) {
    res.status(404).json({ error: "Kanji not found" });
    return;
  }

  res.json(MarkKanjiStudiedResponse.parse(kanji));
});

export default router;
