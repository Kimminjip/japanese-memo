// SM-2 간소화 스케줄러 — 순수 함수. 카드 내용을 모른다.
// 채점: "again"(모름) | "hard"(애매) | "good"(알아)

export type Rating = "again" | "hard" | "good";

export interface SrsCore {
  interval: number; // 일
  ease: number;     // 1.3 ~ 3.0
  reps: number;
  lapses: number;
}

export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const DEFAULT_EASE = 2.5;

const clampEase = (e: number) => Math.min(EASE_MAX, Math.max(EASE_MIN, e));

// 신규 카드 초기 상태 (reps 0 = 신규)
export function newCore(): SrsCore {
  return { interval: 0, ease: DEFAULT_EASE, reps: 0, lapses: 0 };
}

// 채점 결과로 다음 상태 계산. 날짜는 다루지 않고 interval만 낸다(호출부에서 next_review 계산).
export function schedule(state: SrsCore, rating: Rating): SrsCore {
  const s = { ...state };

  if (rating === "again") {
    // 모름: interval 0, reps 0 → 다음 날 재등장, lapses +1, ease -0.20
    return {
      interval: 0,
      ease: clampEase(s.ease - 0.2),
      reps: 0,
      lapses: s.lapses + 1,
    };
  }

  if (rating === "hard") {
    // 애매: ease -0.15, interval *1.2 (ease 미적용), reps +1
    const interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.interval * 1.2);
    return {
      interval: Math.max(1, interval),
      ease: clampEase(s.ease - 0.15),
      reps: s.reps + 1,
      lapses: s.lapses,
    };
  }

  // good(알아): reps==0→1, reps==1→3, 그 외→round(interval*ease). ease +0.15
  const ease = clampEase(s.ease + 0.15);
  let interval: number;
  if (s.reps === 0) interval = 1;
  else if (s.reps === 1) interval = 3;
  else interval = Math.round(s.interval * s.ease); // 조정 전 ease로 성장
  return {
    interval: Math.max(1, interval),
    ease,
    reps: s.reps + 1,
    lapses: s.lapses,
  };
}

// interval(일)로 다음 복습일(YYYY-MM-DD, 로컬/KST 기준) 계산
export function nextReviewDate(intervalDays: number, from: Date = new Date()): string {
  const kst = new Date(from.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + intervalDays);
  return kst.toISOString().slice(0, 10);
}
