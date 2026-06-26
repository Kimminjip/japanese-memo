import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const kanjiTable = pgTable("kanji", {
  id: serial("id").primaryKey(),
  character: text("character").notNull(),
  onyomi: text("onyomi").notNull(),
  kunyomi: text("kunyomi").notNull(),
  korean: text("korean").notNull().default(""),
  wrongCount: integer("wrong_count").notNull().default(1),
  manualWeak: boolean("manual_weak").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("kanji_character_unique").on(table.character)]);

export const insertKanjiSchema = createInsertSchema(kanjiTable).omit({ id: true, wrongCount: true, createdAt: true });
export type InsertKanji = z.infer<typeof insertKanjiSchema>;
export type Kanji = typeof kanjiTable.$inferSelect;
