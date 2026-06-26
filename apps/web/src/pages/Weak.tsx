import { useGetWeakItems, getGetStatsSummaryQueryKey, getGetWeakItemsQueryKey, getListWordsQueryKey, getListKanjiQueryKey, useUpdateWord, useUpdateKanji } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Gamepad2, TrendingDown, RotateCcw, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Weak() {
  const { data, isLoading } = useGetWeakItems();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateWord = useUpdateWord();
  const updateKanji = useUpdateKanji();

  const handleResetWord = (id: number) => {
    updateWord.mutate({ id, data: { wrongCount: 0, manualWeak: false } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWeakItemsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListWordsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
        toast({ title: "취약 항목에서 해제했습니다." });
      },
    });
  };

  const handleResetKanji = (id: number) => {
    updateKanji.mutate({ id, data: { wrongCount: 0, manualWeak: false } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWeakItemsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListKanjiQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
        toast({ title: "취약 항목에서 해제했습니다." });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const hasWeakWords = data?.words && data.words.length > 0;
  const hasWeakKanji = data?.kanji && data.kanji.length > 0;
  const totalWeak = (data?.words?.length || 0) + (data?.kanji?.length || 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-destructive flex items-center gap-2">
            <AlertCircle className="h-8 w-8" />
            취약 항목
          </h1>
          <p className="text-muted-foreground mt-1">3번 이상 틀렸거나 수동으로 등록한 단어·한자입니다.</p>
        </div>

        {totalWeak > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Link href="/study?weak=true">
              <Button variant="outline" size="lg" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10">
                <BookOpen className="h-5 w-5" />
                취약 항목 공부하기
              </Button>
            </Link>
            <Link href="/quiz">
              <Button variant="destructive" size="lg" className="gap-2">
                <Gamepad2 className="h-5 w-5" />
                취약 항목 퀴즈 시작
              </Button>
            </Link>
          </div>
        )}
      </div>

      {totalWeak === 0 ? (
        <div className="text-center py-32 bg-primary/5 rounded-2xl border-2 border-dashed border-primary/20">
          <div className="text-primary mb-4 flex justify-center">
            <TrendingDown className="h-16 w-16 opacity-50" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">취약 항목이 없습니다!</h2>
          <p className="text-muted-foreground">현재 특별히 복습이 필요한 항목이 없습니다. 훌륭합니다.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h2 className="text-xl font-bold border-b pb-2 border-border flex justify-between">
              <span>단어</span>
              <span className="text-muted-foreground text-sm font-normal">{data?.words?.length || 0}개</span>
            </h2>

            {hasWeakWords ? (
              <div className="space-y-3">
                {data.words.map(word => (
                  <div key={word.id} className="group relative">
                    <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
                      <CardContent className="p-4 flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-serif text-2xl font-bold text-foreground">{word.japanese}</span>
                            {word.wrongCount > 0 && (
                              <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full font-bold">
                                {word.wrongCount}회 오답
                              </span>
                            )}
                            {word.manualWeak && (
                              <span className="bg-amber-400/20 text-amber-600 text-xs px-2 py-0.5 rounded-full font-bold">
                                ★ 수동 등록
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col">
                            {word.furigana && <span className="text-xs text-muted-foreground">{word.furigana}</span>}
                            <span className="font-medium">{word.korean}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                          title="취약 항목 해제"
                          onClick={() => handleResetWord(word.id)}
                          disabled={updateWord.isPending}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          해제
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground py-8 text-center bg-muted/20 rounded-lg">취약 단어가 없습니다.</p>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold border-b pb-2 border-border flex justify-between">
              <span>한자</span>
              <span className="text-muted-foreground text-sm font-normal">{data?.kanji?.length || 0}개</span>
            </h2>

            {hasWeakKanji ? (
              <div className="space-y-3">
                {data.kanji.map(kanji => (
                  <div key={kanji.id} className="group relative">
                    <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
                      <CardContent className="p-4 flex justify-between items-center">
                        <div className="flex gap-4">
                          <div className="font-serif text-4xl font-bold text-foreground w-12 text-center">
                            {kanji.character}
                          </div>
                          <div className="flex flex-col justify-center">
                            <div className="mb-2 flex gap-1 flex-wrap">
                              {kanji.wrongCount > 0 && (
                                <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full font-bold">
                                  {kanji.wrongCount}회 오답
                                </span>
                              )}
                              {kanji.manualWeak && (
                                <span className="bg-amber-400/20 text-amber-600 text-xs px-2 py-0.5 rounded-full font-bold">
                                  ★ 수동 등록
                                </span>
                              )}
                            </div>
                            <div className="text-sm space-y-1">
                              <div><span className="text-muted-foreground text-xs">음:</span> <span className="font-medium">{kanji.onyomi || "-"}</span></div>
                              <div><span className="text-muted-foreground text-xs">훈:</span> <span className="font-medium">{kanji.kunyomi || "-"}</span></div>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                          title="취약 항목 해제"
                          onClick={() => handleResetKanji(kanji.id)}
                          disabled={updateKanji.isPending}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          해제
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground py-8 text-center bg-muted/20 rounded-lg">취약 한자가 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
