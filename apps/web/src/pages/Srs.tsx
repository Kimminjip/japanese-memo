import { useState, useMemo, useCallback, useEffect } from "react";
import { useGetSrsQueue, useGradeSrs, type SrsQueueCard, type SrsRating } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
const NEW_LIMIT_KEY = "srs_new_limit";

export default function Srs() {
  const [includeWord, setIncludeWord] = useState(true);
  const [includeKanji, setIncludeKanji] = useState(true);
  const [levels, setLevels] = useState<Record<string, boolean>>({ N5: true, N4: true, N3: true, N2: true, N1: true });
  const [newLimit, setNewLimit] = useState(() => Number(localStorage.getItem(NEW_LIMIT_KEY)) || 10);
  const [started, setStarted] = useState(false);

  const params = useMemo(() => {
    const types = [includeWord && "word", includeKanji && "kanji"].filter(Boolean).join(",");
    const lv = LEVELS.filter(l => levels[l]).join(",");
    return { types, levels: lv, newLimit };
  }, [includeWord, includeKanji, levels, newLimit]);

  const { data, isLoading, isFetching, refetch } = useGetSrsQueue(params, { enabled: started });
  const grade = useGradeSrs();

  // 현재 세션 큐 (한 번 불러오면 로컬에서 소비)
  const [queue, setQueue] = useState<SrsQueueCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (started && data) {
      setQueue(data.queue);
      setIdx(0);
      setRevealed(false);
      setDone(0);
    }
  }, [started, data]);

  const card = queue[idx];
  const remainingReview = queue.slice(idx).filter(c => !c.isNew).length;
  const remainingNew = queue.slice(idx).filter(c => c.isNew).length;

  const handleGrade = useCallback((rating: SrsRating) => {
    if (!card) return;
    grade.mutate({ cardType: card.cardType, cardId: card.cardId, rating });
    setDone(d => d + 1);
    setRevealed(false);
    setIdx(i => i + 1);
  }, [card, grade]);

  // 키보드: space=공개, 1/2/3=모름/애매/알아
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (!card) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setRevealed(true); return; }
      if (revealed) {
        if (e.key === "1") handleGrade("again");
        else if (e.key === "2") handleGrade("hard");
        else if (e.key === "3") handleGrade("good");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, card, revealed, handleGrade]);

  const toggleLevel = (l: string) => setLevels(p => ({ ...p, [l]: !p[l] }));

  // ── 설정 화면 ──
  if (!started) {
    return (
      <div className="max-w-xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SRS 복습</h1>
          <p className="text-muted-foreground mt-1">간격 반복으로 오래 기억하기. 며칠 밀려도 부담 없이 이어서 하세요.</p>
        </div>

        <div className="space-y-3">
          <Label className="text-base font-semibold">카드 유형 <span className="text-xs font-normal text-muted-foreground">(중복 선택)</span></Label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={includeWord} onCheckedChange={() => setIncludeWord(v => !v)} /> <span>단어</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={includeKanji} onCheckedChange={() => setIncludeKanji(v => !v)} /> <span>한자</span>
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-base font-semibold">급수 <span className="text-xs font-normal text-muted-foreground">(중복 선택)</span></Label>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map(l => (
              <button
                key={l}
                onClick={() => toggleLevel(l)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  levels[l] ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
              >{l}</button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">하루 신규 카드 수</Label>
          <div className="flex items-center gap-3">
            <input
              type="number" min={0} max={200}
              value={newLimit}
              onChange={e => { const n = Math.max(0, Math.min(200, Number(e.target.value) || 0)); setNewLimit(n); localStorage.setItem(NEW_LIMIT_KEY, String(n)); }}
              className="w-24 h-11 rounded-md border bg-background px-3 text-lg"
            />
            <span className="text-sm text-muted-foreground">장 (복습은 상한 없음)</span>
          </div>
        </div>

        <Button size="lg" className="w-full text-lg h-14" onClick={() => setStarted(true)} disabled={!includeWord && !includeKanji}>
          복습 시작
        </Button>
      </div>
    );
  }

  // ── 로딩 ──
  if (isLoading || (isFetching && queue.length === 0)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // ── 완료 ──
  if (!card) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center animate-in fade-in duration-500">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-bold">오늘 복습 완료!</h2>
        <p className="text-muted-foreground">{done}장을 학습했습니다.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { refetch().then(r => { if (r.data) { setQueue(r.data.queue); setIdx(0); setRevealed(false); } }); }} className="gap-2">
            <RefreshCw className="h-4 w-4" /> 더 있는지 확인
          </Button>
          <Button variant="ghost" onClick={() => setStarted(false)}>설정으로</Button>
        </div>
      </div>
    );
  }

  // ── 학습 화면 ──
  const isKanji = card.type === "kanji";
  return (
    <div className="max-w-2xl mx-auto space-y-6 select-none">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          남은 복습 <b className="text-foreground">{remainingReview}</b>장 · 신규 <b className="text-foreground">{remainingNew}</b>장
        </span>
        <button onClick={() => setStarted(false)} className="text-muted-foreground hover:text-foreground">설정</button>
      </div>

      <div
        className="bg-card rounded-xl border shadow-sm min-h-[16rem] sm:min-h-[20rem] flex flex-col items-center justify-center p-8 text-center cursor-pointer relative"
        onClick={() => !revealed && setRevealed(true)}
      >
        {card.jlptLevel && <span className="absolute top-3 left-3 text-xs text-muted-foreground/60">{card.jlptLevel}</span>}
        {card.isNew && <span className="absolute top-3 right-3 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">신규</span>}

        {card.type === "word" && card.furigana && (
          <span className="font-serif text-muted-foreground text-base mb-1">{card.furigana}</span>
        )}
        <span className={cn("font-serif font-medium text-foreground break-keep", isKanji ? "text-7xl sm:text-9xl" : "text-4xl sm:text-6xl")}>
          {card.front}
        </span>

        {revealed && (
          <div className="mt-6 pt-6 border-t w-full">
            <span className="text-xl sm:text-2xl font-medium break-keep whitespace-pre-line">{card.back}</span>
          </div>
        )}
        {!revealed && <span className="absolute bottom-4 text-xs text-muted-foreground/50">탭 / Space 로 정답 보기</span>}
      </div>

      {revealed ? (
        <div className="grid grid-cols-3 gap-3">
          <Button variant="outline" className="h-16 flex-col gap-0.5 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => handleGrade("again")}>
            <span className="text-base font-semibold">모름</span>
            <span className="text-[10px] opacity-70">내일 다시</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col gap-0.5 border-amber-400/50 text-amber-600 hover:bg-amber-400/10" onClick={() => handleGrade("hard")}>
            <span className="text-base font-semibold">애매</span>
            <span className="text-[10px] opacity-70">조금 뒤</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col gap-0.5 border-primary/40 text-primary hover:bg-primary/10" onClick={() => handleGrade("good")}>
            <span className="text-base font-semibold">알아</span>
            <span className="text-[10px] opacity-70">간격 늘림</span>
          </Button>
        </div>
      ) : (
        <Button size="lg" className="w-full h-16 text-lg" onClick={() => setRevealed(true)}>정답 보기</Button>
      )}
    </div>
  );
}
