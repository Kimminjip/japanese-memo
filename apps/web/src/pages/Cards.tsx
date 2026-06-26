import { useState, useMemo, useCallback, useRef } from "react";
import {
  useListWords, useListKanji,
  useDeleteWord, useDeleteKanji,
  useUpdateWord, useUpdateKanji,
  getListWordsQueryKey, getListKanjiQueryKey, getGetStatsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flashcard } from "@/components/Flashcard";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trash2, Pencil, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { EditDialog, EditTarget } from "@/components/EditDialog";

const WEAK_THRESHOLD = 3;

type FilterType = "all" | "words" | "kanji";

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
    if (item.cardType === "word") {
      updateWord.mutate({ id: item.id, data: { manualWeak: newManualWeak } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWordsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
          toast({ title: newManualWeak ? "★ 취약 항목으로 등록했습니다." : "취약 항목에서 해제했습니다." });
        },
      });
    } else {
      updateKanji.mutate({ id: item.id, data: { manualWeak: newManualWeak } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKanjiQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
          toast({ title: newManualWeak ? "★ 취약 항목으로 등록했습니다." : "취약 항목에서 해제했습니다." });
        },
      });
    }
  }, [item, updateWord, updateKanji, queryClient, toast]);

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
          isFlipped={isFlipped}
          onFlip={handleFlip}
          onToggleWeak={handleToggleWeak}
        />
      ) : (
        <Flashcard
          type="kanji"
          japanese={item.character}
          onyomi={item.onyomi}
          kunyomi={item.kunyomi}
          korean={item.korean}
          wrongCount={item.wrongCount}
          manualWeak={item.manualWeak}
          isFlipped={isFlipped}
          onFlip={handleFlip}
          onToggleWeak={handleToggleWeak}
        />
      )}
      <div className="absolute top-2 right-12 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
        <Button
          variant="secondary"
          size="icon"
          className="shadow-sm"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Cards() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const { data: words, isLoading: wordsLoading } = useListWords();
  const { data: kanji, isLoading: kanjiLoading } = useListKanji();

  const deleteWord = useDeleteWord();
  const deleteKanji = useDeleteKanji();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const allCards = useMemo(() => {
    const list = [];
    if (words && (filter === "all" || filter === "words")) {
      list.push(...words.map(w => ({ ...w, cardType: "word" as const })));
    }
    if (kanji && (filter === "all" || filter === "kanji")) {
      list.push(...kanji.map(k => ({ ...k, cardType: "kanji" as const })));
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (search) {
      const q = search.toLowerCase();
      return list.filter(item => {
        if (item.cardType === "word") {
          return item.japanese.includes(q) || item.korean.includes(q) || (item.furigana && item.furigana.includes(q));
        } else {
          return item.character.includes(q) || item.onyomi.includes(q) || item.kunyomi.includes(q);
        }
      });
    }
    return list;
  }, [words, kanji, filter, search]);

  const handleDelete = (id: number, type: "word" | "kanji") => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    if (type === "word") {
      deleteWord.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWordsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
          toast({ title: "삭제되었습니다." });
        }
      });
    } else {
      deleteKanji.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKanjiQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
          toast({ title: "삭제되었습니다." });
        }
      });
    }
  };

  const handleEdit = (item: typeof allCards[number]) => {
    if (item.cardType === "word") {
      setEditTarget({ cardType: "word", id: item.id, japanese: item.japanese, furigana: item.furigana ?? null, korean: item.korean });
    } else {
      setEditTarget({ cardType: "kanji", id: item.id, character: item.character, onyomi: item.onyomi, kunyomi: item.kunyomi, korean: item.korean });
    }
  };

  const isLoading = wordsLoading || kanjiLoading;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">모든 카드</h1>
          <p className="text-muted-foreground mt-1">추가한 모든 단어와 한자를 확인합니다.</p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)} className="w-full sm:w-[300px]">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="words">단어</TabsTrigger>
            <TabsTrigger value="kanji">한자</TabsTrigger>
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
        />
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
