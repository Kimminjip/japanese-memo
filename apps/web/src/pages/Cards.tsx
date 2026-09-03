import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  useListWords, useListKanji, useListGrammar,
  useDeleteWord, useDeleteKanji, useDeleteGrammar,
  useUpdateWord, useUpdateKanji, useUpdateGrammar,
  useMarkWordStudied, useMarkKanjiStudied, useMarkGrammarStudied,
  useSpeakJapanese,
  stopSpeaking,
  getListWordsQueryKey, getListKanjiQueryKey, getListGrammarQueryKey, getGetStatsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flashcard } from "@/components/Flashcard";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trash2, Pencil, Plus, X, BookOpen, Keyboard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EditDialog, EditTarget } from "@/components/EditDialog";
import { VirtualKeyboard } from "@/components/VirtualKeyboard";

const WEAK_THRESHOLD = 3;

type FilterType = "all" | "words" | "kanji" | "grammar";
type JlptFilter = "N5" | "N4" | "N3" | "N2" | "N1" | "none";
const JLPT_FILTERS: JlptFilter[] = ["N5", "N4", "N3", "N2", "N1", "none"];

type CardTtsStep = { text: string; lang: "ja" | "ko" };
function cleanTtsText(text: string): string {
  return text
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCardFrontTtsSteps(item: any): CardTtsStep[] {
  const tilde = /[〜～~]/g;
  if (item.cardType === "word") {
    return [
      { text: (item.furigana ?? "").trim() || item.japanese, lang: "ja" },
      { text: (item.korean ?? "").split("\n")[0]?.trim() ?? "", lang: "ko" },
    ];
  }
  if (item.cardType === "grammar") {
    return [
      { text: (item.pattern ?? "").replace(tilde, "").trim(), lang: "ja" },
      { text: (item.meaning ?? "").replace(tilde, "무엇").trim(), lang: "ko" },
    ];
  }
  const kun = (item.kunyomi ?? "").split("\n")[0].trim();
  const on = (item.onyomi ?? "").split("\n")[0].trim();
  return [{ text: [kun, on].filter(Boolean).join("、"), lang: "ja" }];
}

function CardListItem({
  item,
  onEdit,
  onDelete,
}: {
  item: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const updateWord = useUpdateWord();
  const updateKanji = useUpdateKanji();
  const updateGrammar = useUpdateGrammar();
  const markWordStudied = useMarkWordStudied();
  const markKanjiStudied = useMarkKanjiStudied();
  const markGrammarStudied = useMarkGrammarStudied();
  const speakJapanese = useSpeakJapanese();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const autoFlipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechRun = useRef(0);

  const speakFront = useCallback(async () => {
    const run = ++speechRun.current;
    stopSpeaking();
    await Promise.resolve();
    if (run !== speechRun.current) return;
    for (const step of getCardFrontTtsSteps(item)) {
      if (run !== speechRun.current) return;
      const text = cleanTtsText(step.text);
      if (!text) continue;
      await speakJapanese(text, step.lang);
      if (run !== speechRun.current) return;
    }
  }, [item, speakJapanese]);

  const handleFlip = useCallback(() => {
    const next = !isFlipped;
    setIsFlipped(next);
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    if (next) {
      autoFlipTimer.current = setTimeout(() => {
        setIsFlipped(false);
        speechRun.current++;
        stopSpeaking();
      }, 5000);
      void speakFront();
    } else {
      speechRun.current++;
      stopSpeaking();
    }
  }, [isFlipped, speakFront]);

  const handleToggleWeak = useCallback(() => {
    const isWeak = item.manualWeak || item.wrongCount >= WEAK_THRESHOLD;
    const newManualWeak = !isWeak;
    const done = (key: readonly unknown[]) => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
      toast({ title: newManualWeak ? "★ 취약 항목으로 등록했습니다." : "취약 항목에서 해제했습니다." });
    };
    if (item.cardType === "word") {
      updateWord.mutate({ id: item.id, data: { manualWeak: newManualWeak } }, { onSuccess: () => done(getListWordsQueryKey()) });
    } else if (item.cardType === "kanji") {
      updateKanji.mutate({ id: item.id, data: { manualWeak: newManualWeak } }, { onSuccess: () => done(getListKanjiQueryKey()) });
    } else {
      updateGrammar.mutate({ id: item.id, data: { manualWeak: newManualWeak } }, { onSuccess: () => done(getListGrammarQueryKey()) });
    }
  }, [item, updateWord, updateKanji, updateGrammar, queryClient, toast]);

  const studiedToday =
    !!item.studiedAt && new Date(item.studiedAt).toDateString() === new Date().toDateString();

  // 이미 오늘 학습으로 기록돼 있으면 다시 눌러서 취소
  const handleMarkStudied = useCallback(() => {
    const studied = !studiedToday;
    const done = (key: readonly unknown[]) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: studied ? "✓ 오늘 학습으로 기록했습니다." : "오늘 학습 기록을 취소했습니다." });
    };
    if (item.cardType === "word") {
      markWordStudied.mutate({ id: item.id, studied }, { onSuccess: () => done(getListWordsQueryKey()) });
    } else if (item.cardType === "kanji") {
      markKanjiStudied.mutate({ id: item.id, studied }, { onSuccess: () => done(getListKanjiQueryKey()) });
    } else {
      markGrammarStudied.mutate({ id: item.id, studied }, { onSuccess: () => done(getListGrammarQueryKey()) });
    }
  }, [item, studiedToday, markWordStudied, markKanjiStudied, markGrammarStudied, queryClient, toast]);

  const startPress = () => {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      handleToggleWeak();
    }, 600);
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    cancelPress();
    if (didLongPress.current) {
      e.preventDefault();
      didLongPress.current = false;
    }
  };

  const handleTouchMove = () => { cancelPress(); };

  return (
    <div
      className="relative group"
      onTouchStart={startPress}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {item.cardType === "word" ? (
        <Flashcard
          type="word"
          japanese={item.japanese}
          furigana={item.furigana}
          korean={item.korean}
          wrongCount={item.wrongCount}
          manualWeak={item.manualWeak}
          jlptLevel={item.jlptLevel}
          isFlipped={isFlipped}
          onFlip={handleFlip}
          onToggleWeak={handleToggleWeak}
          onSpeak={() => void speakFront()}
        />
      ) : item.cardType === "kanji" ? (
        <Flashcard
          type="kanji"
          japanese={item.character}
          onyomi={item.onyomi}
          kunyomi={item.kunyomi}
          korean={item.korean}
          wrongCount={item.wrongCount}
          manualWeak={item.manualWeak}
          jlptLevel={item.jlptLevel}
          isFlipped={isFlipped}
          onFlip={handleFlip}
          onToggleWeak={handleToggleWeak}
          onSpeak={() => void speakFront()}
        />
      ) : (
        <Flashcard
          type="grammar"
          japanese={item.pattern}
          korean={item.meaning}
          formation={item.formation}
          example={item.example}
          exampleKorean={item.exampleKorean}
          exampleHighlight={item.exampleHighlight}
          wrongCount={item.wrongCount}
          manualWeak={item.manualWeak}
          jlptLevel={item.jlptLevel}
          isFlipped={isFlipped}
          onFlip={handleFlip}
          onToggleWeak={handleToggleWeak}
          onSpeak={() => void speakFront()}
        />
      )}
      <div className="absolute top-2 right-12 flex gap-1 opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity z-30">
        <Button
          variant="secondary"
          size="icon"
          className="shadow-sm"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          // 부모의 롱프레스(취약 등록)가 이 버튼 위에서는 시작되지 않도록 차단
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      {/* 오늘 학습 버튼 */}
      <button
        type="button"
        className={cn(
          "absolute bottom-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all duration-200",
          studiedToday
            ? "bg-primary/10 text-primary opacity-100"
            // 모바일(hover 없음)에서는 항상 보이게, 데스크톱에서는 hover 시 나타나게
            : "bg-muted/80 text-muted-foreground opacity-70 sm:opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          (e.currentTarget as HTMLButtonElement).blur();
          handleMarkStudied();
        }}
        // 부모의 롱프레스(취약 등록) 타이머가 이 버튼 위에서는 아예 시작되지 않도록 차단
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); handleMarkStudied(); }}
        title={studiedToday ? "오늘 학습 기록 취소" : "오늘 학습으로 기록"}
      >
        <BookOpen className="h-3 w-3" />
        {studiedToday ? "오늘 학습" : "학습 기록"}
      </button>
    </div>
  );
}

export default function Cards() {
  const [filter, setFilter] = useState<FilterType>("all");
  // 빈 배열 = 전체(급수 제한 없음). 여러 급수 중복 선택 가능
  const [jlptFilters, setJlptFilters] = useState<JlptFilter[]>([]);
  const [search, setSearch] = useState("");
  // 입력할 때마다 4천여 장을 재필터링/재렌더하면 버벅이므로 검색어는 디바운스 후 적용
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  // 한 번에 렌더하는 카드 수 (스크롤하면 더 불러옴)
  const [visibleCount, setVisibleCount] = useState(60);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: words, isLoading: wordsLoading } = useListWords();
  const { data: kanji, isLoading: kanjiLoading } = useListKanji();
  const { data: grammar, isLoading: grammarLoading } = useListGrammar();

  const deleteWord = useDeleteWord();
  const deleteKanji = useDeleteKanji();
  const deleteGrammar = useDeleteGrammar();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // 정렬은 검색어와 무관하므로 따로 메모이즈 (검색할 때마다 4천여 장 재정렬 방지)
  const sortedCards = useMemo(() => {
    const list: any[] = [];
    if (words && (filter === "all" || filter === "words")) {
      list.push(...words.map(w => ({ ...w, cardType: "word" as const })));
    }
    if (kanji && (filter === "all" || filter === "kanji")) {
      list.push(...kanji.map(k => ({ ...k, cardType: "kanji" as const })));
    }
    if (grammar && (filter === "all" || filter === "grammar")) {
      list.push(...grammar.map(g => ({ ...g, cardType: "grammar" as const })));
    }
    // 낮은 급수(N5) 먼저 → 같은 급수 안에서는 먼저 등록된 카드 먼저
    const levelRank = (lv: string | null | undefined) => {
      const m: Record<string, number> = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };
      return (lv && m[lv]) ?? 9; // 미분류는 맨 뒤
    };
    // 오늘 학습을 누른 시각이 있으면 그 시각을, 없으면 실제 등록 시각을 사용한다.
    // 따라서 최근에 학습했거나 새로 등록한 카드가 항상 위에 표시된다.
    for (const item of list) {
      item._ts = new Date(item.studiedAt ?? item.createdAt).getTime();
    }
    list.sort((a, b) => {
      const timeDifference = b._ts - a._ts;
      if (timeDifference !== 0) return timeDifference;
      return levelRank(a.jlptLevel) - levelRank(b.jlptLevel);
    });
    return list;
  }, [words, kanji, grammar, filter]);

  const allCards = useMemo(() => {
    let result = sortedCards;
    if (jlptFilters.length > 0) {
      result = result.filter(item =>
        item.jlptLevel
          ? jlptFilters.includes(item.jlptLevel as JlptFilter)
          : jlptFilters.includes("none")
      );
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(item => {
        if (item.cardType === "word") {
          return item.japanese.includes(q) || item.korean.toLowerCase().includes(q) || (item.furigana && item.furigana.includes(q));
        } else if (item.cardType === "kanji") {
          return item.character.includes(q) || item.onyomi.includes(q) || item.kunyomi.includes(q) || item.korean.toLowerCase().includes(q);
        } else {
          return item.pattern.includes(q) || item.meaning.toLowerCase().includes(q) || (item.example && item.example.includes(q));
        }
      });
    }
    return result;
  }, [sortedCards, jlptFilters, debouncedSearch]);

  // 필터/검색이 바뀌면 처음부터 다시 보여주기
  useEffect(() => { setVisibleCount(60); }, [debouncedSearch, jlptFilters, filter]);

  const visibleCards = useMemo(() => allCards.slice(0, visibleCount), [allCards, visibleCount]);

  const handleDelete = (id: number, type: "word" | "kanji" | "grammar") => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const done = (key: readonly unknown[]) => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
      toast({ title: "삭제되었습니다." });
    };
    if (type === "word") {
      deleteWord.mutate({ id }, { onSuccess: () => done(getListWordsQueryKey()) });
    } else if (type === "kanji") {
      deleteKanji.mutate({ id }, { onSuccess: () => done(getListKanjiQueryKey()) });
    } else {
      deleteGrammar.mutate({ id }, { onSuccess: () => done(getListGrammarQueryKey()) });
    }
  };

  const handleEdit = (item: typeof allCards[number]) => {
    if (item.cardType === "word") {
      setEditTarget({ cardType: "word", id: item.id, japanese: item.japanese, furigana: item.furigana ?? null, korean: item.korean });
    } else if (item.cardType === "kanji") {
      setEditTarget({ cardType: "kanji", id: item.id, character: item.character, onyomi: item.onyomi, kunyomi: item.kunyomi, korean: item.korean });
    } else {
      setEditTarget({ cardType: "grammar", id: item.id, pattern: item.pattern, meaning: item.meaning, formation: item.formation, example: item.example, exampleKorean: item.exampleKorean, exampleHighlight: item.exampleHighlight });
    }
  };

  const isLoading = wordsLoading || kanjiLoading || grammarLoading;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">모든 카드</h1>
          <p className="text-muted-foreground mt-1">추가한 모든 단어·한자·문법을 확인합니다.</p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)} className="w-full sm:w-[360px]">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="words">단어</TabsTrigger>
            <TabsTrigger value="kanji">한자</TabsTrigger>
            <TabsTrigger value="grammar">문법</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="검색어를 입력하세요..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 pr-10"
          lang="ja"
          inputMode="text"
        />
        {/* 필요할 때만 일본어 가상 키보드 활성화 (기본은 기기 키보드로 입력) */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8",
            showKeyboard ? "text-primary" : "text-muted-foreground"
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowKeyboard(v => !v)}
          title={showKeyboard ? "일본어 키보드 닫기" : "일본어 키보드 열기"}
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setJlptFilters([])}
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
            jlptFilters.length === 0
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          )}
        >
          전체
        </button>
        {JLPT_FILTERS.map(lv => {
          const active = jlptFilters.includes(lv);
          return (
            <button
              key={lv}
              onClick={() =>
                setJlptFilters(prev =>
                  prev.includes(lv) ? prev.filter(v => v !== lv) : [...prev, lv]
                )
              }
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {lv === "none" ? "미분류" : lv}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="w-full aspect-[4/3] sm:aspect-[3/2] rounded-xl" />
          ))}
        </div>
      ) : allCards.length === 0 ? (
        <div className="text-center py-20 bg-muted/20 rounded-xl border border-dashed">
          <p className="text-lg text-muted-foreground">카드가 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {allCards.length}장
            {visibleCards.length < allCards.length && ` 중 ${visibleCards.length}장 표시`}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleCards.map(item => (
              <CardListItem
                key={`${item.cardType}-${item.id}`}
                item={item}
                onEdit={() => handleEdit(item)}
                onDelete={() => handleDelete(item.id, item.cardType)}
              />
            ))}
          </div>
          {visibleCards.length < allCards.length && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setVisibleCount(c => c + 60)}
            >
              더 보기 ({allCards.length - visibleCards.length}장 남음)
            </Button>
          )}
        </>
      )}

      {editTarget && (
        <EditDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onDelete={() => {
            handleDelete(editTarget.id, editTarget.cardType);
            setEditTarget(null);
          }}
        />
      )}

      {showKeyboard && (
        <VirtualKeyboard
          onInput={(char) => setSearch(prev => prev + char)}
          onBackspace={() => setSearch(prev => prev.slice(0, -1))}
          onClose={() => setShowKeyboard(false)}
        />
      )}
    </div>
  );
}
