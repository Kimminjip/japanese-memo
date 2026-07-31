import { pgTable, serial, text, integer, real, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// SRS 스케줄 상태 — 카드 내용과 분리. (cardType, cardId)로 기존 words/kanji 카드를 참조.
// 행이 없는 카드 = 신규(reps 0, interval 0). 카드별 독립 스케줄.
export const srsStateTable = pgTable("srs_state", {
  id: serial("id").primaryKey(),
  cardType: text("card_type").notNull(),   // "word" | "kanji"
  cardId: integer("card_id").notNull(),
  nextReview: date("next_review").notNull(),
  interval: integer("interval").notNull().default(0),
  ease: real("ease").notNull().default(2.5),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("srs_state_card_unique").on(t.cardType, t.cardId)]);

export type SrsState = typeof srsStateTable.$inferSelect;
