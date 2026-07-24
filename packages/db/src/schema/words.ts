import { pgTable, serial, text, integer, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const wordsTable = pgTable("words", {
  id: serial("id").primaryKey(),
  japanese: text("japanese").notNull(),
  furigana: text("furigana"),
  korean: text("korean").notNull(),
  wrongCount: integer("wrong_count").notNull().default(1),
  manualWeak: boolean("manual_weak").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  studiedAt: timestamp("studied_at"),
  jlptLevel: text("jlpt_level"),
  distractors: jsonb("distractors").$type<string[]>(),
}, (table) => [uniqueIndex("words_japanese_unique").on(table.japanese)]);

export const insertWordSchema = createInsertSchema(wordsTable).omit({ id: true, wrongCount: true, createdAt: true, studiedAt: true, jlptLevel: true, distractors: true });
export type InsertWord = z.infer<typeof insertWordSchema>;
export type Word = typeof wordsTable.$inferSelect;
