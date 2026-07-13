import { pgTable, text, integer } from "drizzle-orm/pg-core";

// 날짜별 학습량 (date는 KST 기준 "YYYY-MM-DD" 문자열)
export const studyActivityTable = pgTable("study_activity", {
  date: text("date").primaryKey(),
  count: integer("count").notNull().default(0),
});

export type StudyActivity = typeof studyActivityTable.$inferSelect;
