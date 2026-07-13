import { useState, useMemo, useEffect, useRef } from "react";
import { useListWords, useListKanji, useRecordWordWrong, useRecordKanjiWrong, useGetWeakItems, useRecordActivity } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Check, X, RotateCcw, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type QuizState = "setup" | "playing" | "results";
type QuizType = "words" | "kanji" | "both" | "weak";
type CardRange = "today" | "recent" | "all";

interface Question {
  id: number;
  itemType: "word" | "kanji";
  question: string;
  questionLabel?: string;
  correctAnswer: string;
  options: string[];
}

export default function Quiz() {
  const [state, setState] = useState<QuizState>("setup");
  const [quizType, setQuizType] = useState<QuizType>("both");
  const [cardRange, setCardRange] = useState<CardRange>("all");
  const [count, setCount] = useState("10");
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [wrongSelections, setWrongSelections] = useState<Set<string>>(new Set());
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongItems, setWrongItems] = useState<Question[]>([]);

  const currentIdxRef = useRef(currentIdx);
  currentIdxRef.current = currentIdx;
  const questionsLenRef = useRef(questions.length);
  questionsLenRef.current = questions.length;

  const { data: words } = useListWords();
  const { data: kanji } = useListKanji();
  const { data: weakItems } = useGetWeakItems();
  
  const recordWordWrong = useRecordWordWrong();
  const recordKanjiWrong = useRecordKanjiWrong();
  const recordActivity = useRecordActivity();

  // Auto-advance 1 second after correct answer
  useEffect(() => {
    if (!isCorrect) return;
    const timer = setTimeout(() => {
      const idx = currentIdxRef.current;
      if (idx < questionsLenRef.current - 1) {
        setCurrentIdx(i => i + 1);
        setWrongSelections(new Set());
        setIsCorrect(false);
      } else {
        setState("results");
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isCorrect]);

  const handleStart = () => {
    let sourceItems: any[] = [];
    
    if (quizType === "weak" && weakItems) {
      sourceItems = [
        ...weakItems.words.map(w => ({ ...w, type: "word" })),
        ...weakItems.kanji.map(k => ({ ...k, type: "kanji" }))
      ];
    } else {
      if ((quizType === "words" || quizType === "both") && words) {
        sourceItems.push(...words.map(w => ({ ...w, type: "word" })));
      }
      if ((quizType === "kanji" || quizType === "both") && kanji) {
        sourceItems.push(...kanji.map(k => ({ ...k, type: "kanji" })));
      }
    }

    if (quizType !== "weak") {
      if (cardRange === "today") {
        const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
        sourceItems = sourceItems.filter(item => new Date(item.createdAt ?? item.created_at ?? "").getTime() >= twoDaysAgo);
      } else if (cardRange === "recent") {
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        sourceItems = sourceItems.filter(item => new Date(item.createdAt ?? item.created_at ?? "").getTime() >= oneWeekAgo);
      }
    }

    if (sourceItems.length === 0) {
      alert("해당 범위에 학습할 카드가 없습니다.");
      return;
    }

    const shuffled = [...sourceItems].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, parseInt(count, 10));

    const generatedQs: Question[] = selected.map(item => {
      let correctAnswer = "";
      let questionText = "";
      let questionLabel = "";
      let allPossibleWrong: string[] = [];

      const splitLines = (s: string) => s.split("\n").map(l => l.trim()).filter(Boolean);
      const pickOne = (s: string) => { const lines = splitLines(s); return lines[Math.floor(Math.random() * lines.length)] || s; };
      if (item.type === "word") {
        correctAnswer = pickOne(item.korean);
        questionText = item.japanese;
        allPossibleWrong = words ? words.filter(w => w.id !== item.id).map(w => pickOne(w.korean)) : [];
      } else {
        const hasOnyomi = item.onyomi.trim().length > 0;
        const hasKunyomi = item.kunyomi.trim().length > 0;
        const askOnyomi = hasOnyomi && (!hasKunyomi || Math.random() < 0.5);
        questionLabel = askOnyomi ? "음독을 고르세요" : "훈독을 고르세요";
        correctAnswer = askOnyomi ? pickOne(item.onyomi) : pickOne(item.kunyomi);
        questionText = item.character;
        allPossibleWrong = kanji
          ? kanji.filter(k => k.id !== item.id && (askOnyomi ? k.onyomi.trim().length > 0 : k.kunyomi.trim().length > 0))
              .map(k => askOnyomi ? pickOne(k.onyomi) : pickOne(k.kunyomi))
          : [];
      }

      if (allPossibleWrong.length < 3) {
        allPossibleWrong.push("테스트 오답 1", "테스트 오답 2", "테스트 오답 3");
      }

      const wrongAnswers = [...allPossibleWrong].sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [correctAnswer, ...wrongAnswers].sort(() => 0.5 - Math.random());

      return {
        id: item.id,
        itemType: item.type as "word" | "kanji",
        question: questionText,
        questionLabel: questionLabel || undefined,
        correctAnswer,
        options
      };
    });

    setQuestions(generatedQs);
    setCurrentIdx(0);
    setScore(0);
    setWrongItems([]);
    setWrongSelections(new Set());
    setIsCorrect(false);
    setState("playing");
  };

  const handleRetryWrong = () => {
    setQuestions([...wrongItems]);
    setCurrentIdx(0);
    setScore(0);
    setWrongItems([]);
    setWrongSelections(new Set());
    setIsCorrect(false);
    setState("playing");
  };

  const handleAnswer = (option: string) => {
    if (isCorrect || wrongSelections.has(option)) return;

    const q = questions[currentIdx];
    const correct = option === q.correctAnswer;

    // 문제당 첫 시도에서 학습 1회로 기록
    if (wrongSelections.size === 0) {
      recordActivity.mutate({ count: 1 });
    }

    if (correct) {
      // Only count score if first attempt (no wrong selections yet)
      if (wrongSelections.size === 0) {
        setScore(s => s + 1);
      }
      setIsCorrect(true);
    } else {
      // Record wrong only on first wrong attempt
      if (wrongSelections.size === 0) {
        setWrongItems(prev => [...prev, q]);
        if (q.itemType === "word") {
          recordWordWrong.mutate({ id: q.id });
        } else {
          recordKanjiWrong.mutate({ id: q.id });
        }
      }
      setWrongSelections(prev => new Set([...prev, option]));
    }
  };

  if (state === "setup") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">퀴즈 시작하기</h1>
          <p className="text-muted-foreground mt-1">학습한 내용을 확인해보세요.</p>
        </div>

        <Card className="border-primary/20 shadow-md">
          <CardHeader>
            <CardTitle>퀴즈 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-3">
              <Label className="text-base font-semibold">학습 유형</Label>
              <RadioGroup value={quizType} onValueChange={(v) => setQuizType(v as QuizType)} className="flex flex-col space-y-2">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="both" id="q-both" />
                  <Label htmlFor="q-both" className="text-base font-normal">혼합</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="words" id="q-words" />
                  <Label htmlFor="q-words" className="text-base font-normal">단어만</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="kanji" id="q-kanji" />
                  <Label htmlFor="q-kanji" className="text-base font-normal">한자만</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="weak" id="q-weak" />
                  <Label htmlFor="q-weak" className="text-base font-normal text-destructive">취약 항목만 (3번 이상 틀린 항목)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">카드 범위</Label>
              <RadioGroup value={cardRange} onValueChange={(v) => setCardRange(v as CardRange)} className="flex flex-col space-y-2">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="today" id="r-today" />
                  <Label htmlFor="r-today" className="text-base font-normal">최근 이틀</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="recent" id="r-recent" />
                  <Label htmlFor="r-recent" className="text-base font-normal">최근 일주일 입력한 카드</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="all" id="r-all" />
                  <Label htmlFor="r-all" className="text-base font-normal">카드 전체</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">문제 수</Label>
              <RadioGroup value={count} onValueChange={setCount} className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="5" id="c-5" />
                  <Label htmlFor="c-5" className="font-normal">5문제</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="10" id="c-10" />
                  <Label htmlFor="c-10" className="font-normal">10문제</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="20" id="c-20" />
                  <Label htmlFor="c-20" className="font-normal">20문제</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="50" id="c-50" />
                  <Label htmlFor="c-50" className="font-normal">50문제</Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
          <CardFooter>
            <Button size="lg" className="w-full text-lg h-14" onClick={handleStart}>퀴즈 시작</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (state === "results") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
        <div className="text-center py-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">퀴즈 완료!</h1>
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-primary/10 text-primary text-5xl font-bold border-4 border-primary">
            {score}/{questions.length}
          </div>
        </div>

        {wrongItems.length > 0 ? (
          <Card className="border-destructive/30 border-2">
            <CardHeader className="bg-destructive/5 pb-4">
              <CardTitle className="text-destructive flex items-center gap-2">
                <X className="h-5 w-5" /> 틀린 문제
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {wrongItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                    <div>
                      <div className="font-serif text-2xl font-bold">{item.question}</div>
                      {item.questionLabel && <div className="text-sm text-muted-foreground">{item.questionLabel}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-foreground">{item.correctAnswer}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="bg-muted/30 pt-6">
              <Button onClick={handleRetryWrong} variant="outline" className="w-full gap-2">
                <RotateCcw className="h-4 w-4" /> 틀린 문제 다시 풀기
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <div className="text-center py-10 bg-primary/5 rounded-xl border border-primary/20 text-primary">
            <Check className="h-12 w-12 mx-auto mb-4" />
            <p className="text-2xl font-bold">만점입니다! 훌륭해요!</p>
          </div>
        )}

        <Button size="lg" className="w-full h-14" onClick={() => setState("setup")}>
          돌아가기
        </Button>
      </div>
    );
  }

  // Playing state
  const q = questions[currentIdx];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center text-sm font-medium text-muted-foreground">
        <span>문제 {currentIdx + 1} / {questions.length}</span>
        <span>점수: {score}</span>
      </div>
      
      <div className="w-full bg-muted rounded-full h-2">
        <div 
          className="bg-primary h-2 rounded-full transition-all duration-300" 
          style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      <Card className="min-h-[200px] flex flex-col justify-center text-center p-8 border-primary/20 shadow-md">
        <div className={cn("font-serif font-bold", q.itemType === "word" ? "text-6xl" : "text-8xl")}>
          {q.question}
        </div>
        {q.questionLabel && (
          <div className="mt-4 text-base font-medium text-muted-foreground">{q.questionLabel}</div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {q.options.map((opt, idx) => {
          const isWrong = wrongSelections.has(opt);
          const isThisCorrect = isCorrect && opt === q.correctAnswer;

          let btnVariant: "default" | "outline" | "destructive" | "secondary" = "outline";
          let extraClass = "";

          if (isThisCorrect) {
            btnVariant = "default";
            extraClass = "bg-green-600 hover:bg-green-700 text-white border-green-600";
          } else if (isWrong) {
            btnVariant = "destructive";
          }

          return (
            <Button
              key={idx}
              variant={btnVariant}
              className={cn(
                "h-20 text-base sm:text-lg break-keep whitespace-normal leading-snug px-3",
                extraClass
              )}
              onClick={() => handleAnswer(opt)}
              disabled={isWrong || isCorrect}
            >
              {opt}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
