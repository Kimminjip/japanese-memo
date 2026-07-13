import { useMemo } from "react";
import { useGetActivity, useListWords, useListKanji } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Trophy, CalendarDays, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count < 5) return 1;
  if (count < 10) return 2;
  if (count < 20) return 3;
  return 4;
}

const LEVEL_CLASS = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/50",
  "bg-primary/75",
  "bg-primary",
];

export default function Stats() {
  const { data: activity, isLoading } = useGetActivity();
  const { data: words } = useListWords();
  const { data: kanji } = useListKanji();

  // 잔디밭을 주(열) 단위로 묶기 — 첫 열의 앞부분을 빈 칸으로 패딩
  const weeks = useMemo(() => {
    if (!activity) return [];
    const days = activity.heatmap;
    if (days.length === 0) return [];
    const firstDow = new Date(days[0].date + "T00:00:00").getDay();
    const cells: ({ date: string; count: number } | null)[] = [
      ...Array(firstDow).fill(null),
      ...days,
    ];
    const cols: ({ date: string; count: number } | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    return cols;
  }, [activity]);

  // 카드 증가 추이 (단어+한자 누적, createdAt 기준, 최근 90일)
  const growth = useMemo(() => {
    const all = [
      ...(words ?? []).map(w => w.createdAt),
      ...(kanji ?? []).map(k => k.createdAt),
    ].filter(Boolean).sort();
    if (all.length === 0) return { points: [], total: 0 };
    const total = all.length;
    // 90일 구간을 12개 지점으로 샘플
    const now = Date.now();
    const start = now - 89 * 86400000;
    const points: { t: number; cum: number }[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = start + ((now - start) * i) / 12;
      const cum = all.filter(d => new Date(d).getTime() <= t).length;
      points.push({ t, cum });
    }
    return { points, total };
  }, [words, kanji]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const a = activity!;

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">학습 통계</h1>
        <p className="text-muted-foreground mt-1">공부한 기록을 한눈에 확인하세요.</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">연속 학습</CardTitle>
            <Flame className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{a.currentStreak}<span className="text-base font-medium text-muted-foreground ml-1">일</span></div>
            <p className="text-xs text-muted-foreground mt-1">최고 {a.bestStreak}일</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘 학습</CardTitle>
            <CalendarDays className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{a.todayCount}<span className="text-base font-medium text-muted-foreground ml-1">회</span></div>
            <p className="text-xs text-muted-foreground mt-1">이번 주 {a.weekCount}회</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">누적 학습</CardTitle>
            <Trophy className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{a.totalCount}<span className="text-base font-medium text-muted-foreground ml-1">회</span></div>
            <p className="text-xs text-muted-foreground mt-1">전체 누적</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 카드</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{growth.total}<span className="text-base font-medium text-muted-foreground ml-1">개</span></div>
            <p className="text-xs text-muted-foreground mt-1">단어+한자</p>
          </CardContent>
        </Card>
      </div>

      {/* 잔디밭 */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">학습 잔디밭</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {/* 요일 라벨 */}
              <div className="flex flex-col gap-1 pr-1 text-[10px] text-muted-foreground justify-between py-0.5">
                {WEEKDAYS.map((d, i) => (
                  <span key={d} className="h-3 leading-3">{i % 2 === 1 ? d : ""}</span>
                ))}
              </div>
              {/* 주별 열 */}
              <div className="flex gap-1">
                {weeks.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-1">
                    {Array.from({ length: 7 }).map((_, ri) => {
                      const cell = col[ri];
                      if (!cell) return <div key={ri} className="w-3 h-3" />;
                      return (
                        <div
                          key={ri}
                          className={cn("w-3 h-3 rounded-sm", LEVEL_CLASS[heatLevel(cell.count)])}
                          title={`${cell.date} · ${cell.count}회`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground justify-end">
            <span>적음</span>
            {LEVEL_CLASS.map((c, i) => <div key={i} className={cn("w-3 h-3 rounded-sm", c)} />)}
            <span>많음</span>
          </div>
        </CardContent>
      </Card>

      {/* 카드 증가 추이 */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">카드 증가 추이 <span className="text-sm font-normal text-muted-foreground">(최근 90일)</span></CardTitle>
        </CardHeader>
        <CardContent>
          {growth.points.length > 1 ? (
            <GrowthChart points={growth.points} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">데이터가 부족합니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GrowthChart({ points }: { points: { t: number; cum: number }[] }) {
  const W = 600, H = 160, pad = 8;
  const maxCum = Math.max(...points.map(p => p.cum), 1);
  const minCum = Math.min(...points.map(p => p.cum));
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - minCum) / Math.max(maxCum - minCum, 1)) * (H - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
          <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#growthFill)" />
      <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.cum)} r="2.5" fill="hsl(var(--primary))" />
      ))}
    </svg>
  );
}
