import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, studySessionsTable } from "@workspace/db";
import {
  GetStudySessionResponse,
  SaveStudySessionBody,
  SaveStudySessionResponse,
} from "@workspace/api-zod";

const SESSION_KEY = "main";

const router: IRouter = Router();

router.get("/study-session", async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.key, SESSION_KEY));

  const result = GetStudySessionResponse.parse({ session: row?.data ?? null });
  res.json(result);
});

router.put("/study-session", async (req, res): Promise<void> => {
  const parsed = SaveStudySessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .insert(studySessionsTable)
    .values({ key: SESSION_KEY, data: parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studySessionsTable.key,
      set: { data: parsed.data, updatedAt: new Date() },
    });

  const result = SaveStudySessionResponse.parse({ session: parsed.data });
  res.json(result);
});

router.delete("/study-session", async (req, res): Promise<void> => {
  await db
    .delete(studySessionsTable)
    .where(eq(studySessionsTable.key, SESSION_KEY));

  res.sendStatus(204);
});

export default router;
