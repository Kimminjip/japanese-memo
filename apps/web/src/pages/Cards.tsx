import { useState, useMemo, useCallback, useRef } from "react";
import {
  useListWords, useListKanji, useListGrammar,
  useDeleteWord, useDeleteKanji, useDeleteGrammar,
  useUpdateWord, useUpdateKanji, useUpdateGrammar,
  useMarkWordStudied, useMarkKanjiStudied, useMarkGrammarStudied,
  useSpeakJapanese,
  getListWordsQueryKey, getListKanjiQueryKey, getListGrammarQueryKey, getGetStatsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flashcard } from "@/components/Flashcard";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trash2, Pencil, Plus, X, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EditDialog, EditTarget } from "@/components/EditDialog";

const WEAK_THRESHOLD = 3;

type FilterType = "all" | "words" | "kanji" | "grammar";
type JlptFilter = "N5" | "N4" | "N3" | "N2" | "N1" | "none";
const JLPT_FILTERS: JlptFilter[] = ["N5", "N4", "N3", "N2", "N1", "none"];

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

  const handleFlip = useCallback(() => {
    setIsFlipped(prev => {
      const next = !prev;
      if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
      if (next) {
        autoFlipTimer.current = setTimeout(() => setIsFlipped(false), 5000);
      }
      return next;
    });
  }, []);

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
          onSpeak={() => speakJapanese((item.furigana ?? "").trim() || item.japanese)}
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
          onSpeak={() => speakJapanese(item.character)}
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
          onSpeak={item.example ? () => speakJapanese(item.example) : undefined}
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
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const { data: words, isLoading: wordsLoading } = useListWords();
  const { data: kanji, isLoading: kanjiLoading } = useListKanji();
  const { data: grammar, isLoading: grammarLoading } = useListGrammar();

  const deleteWord = useDeleteWord();
  const deleteKanji = useDeleteKanji();
  const deleteGrammar = useDeleteGrammar();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const allCards = useMemo(() => {
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
    list.sort((a, b) => {
      const r = levelRank(a.jlptLevel) - levelRank(b.jlptLevel);
      if (r !== 0) return r;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    let result = list;
    if (jlptFilters.length > 0) {
      result = result.filter(item =>
        item.jlptLevel
          ? jlptFilters.includes(item.jlptLevel as JlptFilter)
          : jlptFilters.includes("none")
      );
    }
    if (search) {
      const q = search.toLowerCase();
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
  }, [words, kanji, grammar, filter, jlptFilters, search]);

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
          className="pl-10"
          lang="ja"
          inputMode="text"
        />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {allCards.map(item => (
            <CardListItem
              key={`${item.cardType}-${item.id}`}
              item={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item.id, item.cardType)}
            />
          ))}
        </div>
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
    </div>
  );
}
