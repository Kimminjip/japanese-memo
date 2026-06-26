import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const studySessionsTable = pgTable("study_sessions", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
