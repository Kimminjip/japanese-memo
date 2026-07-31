// 스케줄러 검증 (UI 없이 CLI): npx tsx src/lib/srs.test.ts
import assert from "node:assert";
import { schedule, newCore, nextReviewDate, EASE_MIN, EASE_MAX } from "./srs";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("  ✓", name);
}

// 신규 → 알아(good)
check("good: new → interval 1, reps 1, ease 2.65", () => {
  const s = schedule(newCore(), "good");
  assert.equal(s.interval, 1);
  assert.equal(s.reps, 1);
  assert.ok(Math.abs(s.ease - 2.65) < 1e-9);
  assert.equal(s.lapses, 0);
});

check("good x2: reps 1 → interval 3, reps 2, ease 2.80", () => {
  const s = schedule(schedule(newCore(), "good"), "good");
  assert.equal(s.interval, 3);
  assert.equal(s.reps, 2);
  assert.ok(Math.abs(s.ease - 2.8) < 1e-9);
});

check("good x3: reps 2 → interval round(3*2.80)=8", () => {
  const s = schedule(schedule(schedule(newCore(), "good"), "good"), "good");
  assert.equal(s.interval, 8);
  assert.equal(s.reps, 3);
});

// 애매(hard)
check("hard: new → interval 1, ease 2.35, reps 1", () => {
  const s = schedule(newCore(), "hard");
  assert.equal(s.interval, 1);
  assert.ok(Math.abs(s.ease - 2.35) < 1e-9);
  assert.equal(s.reps, 1);
  assert.equal(s.lapses, 0);
});

check("hard at reps>=2 → interval round(interval*1.2), ease 미적용", () => {
  // 두 번 good으로 reps 2, interval 3 만든 뒤 hard
  const base = schedule(schedule(newCore(), "good"), "good"); // interval 3, reps 2, ease 2.8
  const s = schedule(base, "hard");
  assert.equal(s.interval, Math.round(3 * 1.2)); // 4
  assert.equal(s.reps, 3);
  assert.ok(Math.abs(s.ease - (2.8 - 0.15)) < 1e-9);
});

// 모름(again)
check("again: interval 0, reps 0, lapses +1, ease -0.20", () => {
  const base = schedule(schedule(newCore(), "good"), "good"); // reps 2, ease 2.8
  const s = schedule(base, "again");
  assert.equal(s.interval, 0);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 1);
  assert.ok(Math.abs(s.ease - (2.8 - 0.2)) < 1e-9);
});

// ease clamp
check("ease 하한 1.3 clamp", () => {
  let s = newCore();
  for (let i = 0; i < 20; i++) s = schedule(s, "again");
  assert.ok(s.ease >= EASE_MIN - 1e-9);
  assert.ok(Math.abs(s.ease - EASE_MIN) < 1e-9);
});

check("ease 상한 3.0 clamp", () => {
  let s = newCore();
  for (let i = 0; i < 20; i++) s = schedule(s, "good");
  assert.ok(s.ease <= EASE_MAX + 1e-9);
  assert.ok(Math.abs(s.ease - EASE_MAX) < 1e-9);
});

// next_review 날짜 (KST)
check("nextReviewDate: interval 1 = 내일", () => {
  const from = new Date("2026-08-01T05:00:00Z"); // KST 14:00
  assert.equal(nextReviewDate(1, from), "2026-08-02");
  assert.equal(nextReviewDate(0, from), "2026-08-01");
});

console.log(`\n총 ${passed}개 통과`);
