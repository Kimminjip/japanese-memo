import { useGetStatsSummary, useListWords, useListKanji } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { PlusCircle, Gamepad2, ArrowRight, TrendingUp, AlertCircle, BookOpen, GraduationCap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStatsSummary();
  const { data: recentWords, isLoading: wordsLoading } = useListWords({ dateFilter: "today" });
  const { data: recentKanji, isLoading: kanjiLoading } = useListKanji({ dateFilter: "today" });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">안녕하세요!</h1>
          <p className="text-muted-foreground mt-1">오늘도 일본어 공부를 시작해볼까요?</p>
        </div>
        <div className="hidden sm:flex flex-col gap-2">
          <Link href="/study">
            <Button size="lg" className="gap-2 shadow-sm w-full">
              <GraduationCap className="h-5 w-5" />
              공부하기
            </Button>
          </Link>
          <Link href="/quiz">
            <Button size="lg" variant="secondary" className="gap-2 shadow-sm w-full">
              <Gamepad2 className="h-5 w-5" />
              퀴즈
            </Button>
          </Link>
        </div>
      </div>
      <div className="sm:hidden flex flex-col gap-2">
        <Link href="/study" className="block">
          <Button size="lg" className="w-full gap-2 shadow-sm">
            <GraduationCap className="h-5 w-5" />
            공부하기
          </Button>
        </Link>
        <Link href="/quiz" className="block">
          <Button size="lg" variant="secondary" className="w-full gap-2 shadow-sm">
            <Gamepad2 className="h-5 w-5" />
            퀴즈
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 단어 수</CardTitle>
            <BookOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-primary">{stats?.totalWords || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              오늘 <span className="text-primary font-medium">+{stats?.todayWords || 0}</span>개 추가
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 한자 수</CardTitle>
            <BookOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-primary">{stats?.totalKanji || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              오늘 <span className="text-primary font-medium">+{stats?.todayKanji || 0}</span>개 추가
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">취약 단어</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-destructive">{stats?.weakWords || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">복습이 필요해요</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">취약 한자</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-destructive">{stats?.weakKanji || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">복습이 필요해요</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <Link href="/add">
          <Button size="lg" className="w-full h-16 text-lg gap-3">
            <PlusCircle className="h-6 w-6" />
            새로운 카드 추가하기
          </Button>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">오늘 추가한 단어</h2>
            <Link href="/cards">
              <Button variant="ghost" size="sm" className="gap-1">
                모두 보기 <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          
          <Card>
            <CardContent className="p-0">
              {wordsLoading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : recentWords && recentWords.length > 0 ? (
                <div className="divide-y">
                  {recentWords.slice(0, 5).map(word => (
                    <div key={word.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex flex-col">
                        <span className="font-serif text-lg">{word.japanese}</span>
                        {word.furigana && <span className="text-xs text-muted-foreground">{word.furigana}</span>}
                      </div>
                      <span className="text-sm font-medium">{word.korean}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                  <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
                  <p>오늘 추가한 단어가 없습니다</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">오늘 추가한 한자</h2>
            <Link href="/cards">
              <Button variant="ghost" size="sm" className="gap-1">
                모두 보기 <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          
          <Card>
            <CardContent className="p-0">
              {kanjiLoading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : recentKanji && recentKanji.length > 0 ? (
                <div className="divide-y">
                  {recentKanji.slice(0, 5).map(kanji => (
                    <div key={kanji.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <span className="font-serif text-2xl">{kanji.character}</span>
                      <div className="flex flex-col items-end text-sm">
                        <span className="text-muted-foreground">음: {kanji.onyomi || "-"}</span>
                        <span className="font-medium">훈: {kanji.kunyomi || "-"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                  <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
                  <p>오늘 추가한 한자가 없습니다</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
