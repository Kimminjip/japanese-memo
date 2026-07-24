import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const grammarTable = pgTable("grammar", {
  id: serial("id").primaryKey(),
  pattern: text("pattern").notNull(),            // 문형 (앞면), 예: 〜たばかり
  meaning: text("meaning").notNull(),            // 한국어 의미
  formation: text("formation").notNull().default(""), // 접속 규칙
  example: text("example").notNull().default(""),        // 일본어 예문
  exampleKorean: text("example_korean").notNull().default(""), // 예문 해석
  exampleHighlight: text("example_highlight"),   // 예문에서 밑줄 칠 부분 (문형 표현)
  wrongCount: integer("wrong_count").notNull().default(1),
  manualWeak: boolean("manual_weak").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  studiedAt: timestamp("studied_at"),
  jlptLevel: text("jlpt_level"),
}, (table) => [uniqueIndex("grammar_pattern_unique").on(table.pattern)]);

export const insertGrammarSchema = createInsertSchema(grammarTable).omit({ id: true, wrongCount: true, createdAt: true, studiedAt: true });
export type InsertGrammar = z.infer<typeof insertGrammarSchema>;
export type Grammar = typeof grammarTable.$inferSelect;
