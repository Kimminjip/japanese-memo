import { useState, useRef, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { VirtualKeyboard } from "@/components/VirtualKeyboard";
import { useCreateWord, useCreateKanji, useListWords, useListKanji, getListWordsQueryKey, getListKanjiQueryKey, getGetStatsSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Keyboard, Plus, X, AlertTriangle, ChevronRight, Sparkles } from "lucide-react";
import { EditDialog, EditTarget } from "@/components/EditDialog";
import { ExcelImportKanji } from "@/components/ExcelImportKanji";
import { useLocation } from "wouter";

const LAST_TAB_KEY = "add-last-card-type";

const wordSchema = z.object({
  japanese: z.string().min(1, "일본어를 입력해주세요."),
  furigana: z.string().optional().nullable(),
});

const kanjiSchema = z.object({
  character: z.string().min(1, "한자를 입력해주세요."),
});

type ActiveField =
  | { kind: "form-word"; name: "japanese" | "furigana" }
  | { kind: "form-kanji"; name: "character" }
  | { kind: "korean"; index: number }
  | { kind: "onyomi"; index: number }
  | { kind: "kunyomi"; index: number };

export default function Add() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem(LAST_TAB_KEY) || "word";
  });

  useEffect(() => {
    const saved = localStorage.getItem(LAST_TAB_KEY);
    if (saved === "word" || saved === "kanji") {
      setActiveTab(saved);
    }
  }, [location]);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField | null>(null);

  const [koreanMeanings, setKoreanMeanings] = useState<string[]>([""]);
  const [onyomiReadings, setOnyomiReadings] = useState<string[]>([""]);
  const [kunyomiReadings, setKunyomiReadings] = useState<string[]>([""]);
  const [kanjiKorean, setKanjiKorean] = useState("");

  const koreanRefs = useRef<(HTMLInputElement | null)[]>([]);
  const onyomiRefs = useRef<(HTMLInputElement | null)[]>([]);
  const kunyomiRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [aiLoadingWord, setAiLoadingWord] = useState(false);
  const [aiLoadingKanji, setAiLoadingKanji] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createWord = useCreateWord();
  const createKanji = useCreateKanji();

  const handleAiWord = async () => {
    const japanese = wordForm.getValues("japanese").trim();
    if (!japanese) { toast({ title: "일본어 단어를 먼저 입력해주세요.", variant: "destructive" }); return; }
    setAiLoadingWord(true);
    try {
      const res = await fetch("/api/ai/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "word", text: japanese }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.furigana) wordForm.setValue("furigana", data.furigana);
      if (data.korean?.length) setKoreanMeanings(data.korean);
      toast({ title: "AI가 자동입력했습니다. 내용을 확인해 주세요." });
    } catch {
      toast({ title: "AI 자동입력에 실패했습니다.", variant: "destructive" });
    } finally {
      setAiLoadingWord(false);
    }
  };

  const handleAiKanji = async () => {
    const character = kanjiForm.getValues("character").trim();
    if (!character) { toast({ title: "한자를 먼저 입력해주세요.", variant: "destructive" }); return; }
    setAiLoadingKanji(true);
    try {
      const res = await fetch("/api/ai/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "kanji", text: character }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.onyomi?.length) setOnyomiReadings(data.onyomi);
      if (data.kunyomi?.length) setKunyomiReadings(data.kunyomi);
      if (data.korean) setKanjiKorean(data.korean);
      toast({ title: "AI가 자동입력했습니다. 내용을 확인해 주세요." });
    } catch {
      toast({ title: "AI 자동입력에 실패했습니다.", variant: "destructive" });
    } finally {
      setAiLoadingKanji(false);
    }
  };

  const { data: existingWords } = useListWords();
  const { data: existingKanji } = useListKanji();
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const wordForm = useForm<z.infer<typeof wordSchema>>({
    resolver: zodResolver(wordSchema),
    defaultValues: { japanese: "", furigana: "" },
  });

  const kanjiForm = useForm<z.infer<typeof kanjiSchema>>({
    resolver: zodResolver(kanjiSchema),
    defaultValues: { character: "" },
  });

  const watchedJapanese = wordForm.watch("japanese");
  const watchedCharacter = kanjiForm.watch("character");

  const duplicateWord = watchedJapanese.trim()
    ? existingWords?.find(w => w.japanese === watchedJapanese.trim())
    : null;

  const duplicateKanji = watchedCharacter.trim()
    ? existingKanji?.find(k => k.character === watchedCharacter.trim())
    : null;

  function extractKanjiStem(text: string): string {
    return text.replace(/[^\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, '');
  }

  const inputKanjiStem = extractKanjiStem(watchedJapanese.trim());
  const similarWords = !duplicateWord && inputKanjiStem.length >= 1
    ? (existingWords?.filter(w => {
        if (w.japanese === watchedJapanese.trim()) return false;
        const stem = extractKanjiStem(w.japanese);
        return stem.length >= 1 && stem === inputKanjiStem;
      }) ?? [])
    : [];

  const onSubmitWord = (values: z.infer<typeof wordSchema>) => {
    const nonEmpty = koreanMeanings.map(m => m.trim()).filter(Boolean);
    if (nonEmpty.length === 0) {
      toast({ title: "한국어 뜻을 하나 이상 입력해주세요.", variant: "destructive" });
      return;
    }
    createWord.mutate({ data: { ...values, furigana: values.furigana || null, korean: nonEmpty.join("\n") } }, {
      onSuccess: () => {
        toast({ title: "단어가 추가되었습니다." });
        wordForm.reset();
        setKoreanMeanings([""]);
        setShowKeyboard(false);
        localStorage.setItem(LAST_TAB_KEY, "word");
        queryClient.invalidateQueries({ queryKey: getListWordsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "";
        if (msg.includes("이미 등록된")) {
          toast({ title: "이미 등록된 단어입니다.", variant: "destructive" });
        } else {
          toast({ title: "추가에 실패했습니다.", variant: "destructive" });
        }
      },
    });
  };

  const onSubmitKanji = (values: z.infer<typeof kanjiSchema>) => {
    const nonEmptyOn = onyomiReadings.map(r => r.trim()).filter(Boolean);
    const nonEmptyKun = kunyomiReadings.map(r => r.trim()).filter(Boolean);
    createKanji.mutate({ data: { character: values.character, onyomi: nonEmptyOn.join("\n"), kunyomi: nonEmptyKun.join("\n"), korean: kanjiKorean.trim() } }, {
      onSuccess: () => {
        toast({ title: "한자가 추가되었습니다." });
        kanjiForm.reset();
        setOnyomiReadings([""]);
        setKunyomiReadings([""]);
        setKanjiKorean("");
        setShowKeyboard(false);
        localStorage.setItem(LAST_TAB_KEY, "kanji");
        queryClient.invalidateQueries({ queryKey: getListKanjiQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "";
        if (msg.includes("이미 등록된")) {
          toast({ title: "이미 등록된 한자입니다.", variant: "destructive" });
        } else {
          toast({ title: "추가에 실패했습니다.", variant: "destructive" });
        }
      },
    });
  };

  const getCurrentValue = useCallback((): string => {
    if (!activeField) return "";
    if (activeField.kind === "form-word") return wordForm.getValues(activeField.name) || "";
    if (activeField.kind === "form-kanji") return kanjiForm.getValues(activeField.name) || "";
    if (activeField.kind === "korean") return koreanMeanings[activeField.index] || "";
    if (activeField.kind === "onyomi") return onyomiReadings[activeField.index] || "";
    if (activeField.kind === "kunyomi") return kunyomiReadings[activeField.index] || "";
    return "";
  }, [activeField, wordForm, kanjiForm, koreanMeanings, onyomiReadings, kunyomiReadings]);

  const setCurrentValue = useCallback((val: string) => {
    if (!activeField) return;
    if (activeField.kind === "form-word") { wordForm.setValue(activeField.name, val); return; }
    if (activeField.kind === "form-kanji") { kanjiForm.setValue(activeField.name, val); return; }
    if (activeField.kind === "korean") {
      setKoreanMeanings(prev => { const next = [...prev]; next[activeField.index] = val; return next; });
      return;
    }
    if (activeField.kind === "onyomi") {
      setOnyomiReadings(prev => { const next = [...prev]; next[activeField.index] = val; return next; });
      return;
    }
    if (activeField.kind === "kunyomi") {
      setKunyomiReadings(prev => { const next = [...prev]; next[activeField.index] = val; return next; });
      return;
    }
  }, [activeField, wordForm, kanjiForm]);

  const handleKeyboardInput = (char: string) => {
    setCurrentValue(getCurrentValue() + char);
  };

  const handleBackspace = () => {
    const cur = getCurrentValue();
    setCurrentValue(cur.slice(0, -1));
  };

  const isJapaneseField = (field: ActiveField | null): boolean => {
    if (!field) return false;
    if (field.kind === "form-word") return field.name === "japanese" || field.name === "furigana";
    if (field.kind === "form-kanji") return false;
    if (field.kind === "onyomi" || field.kind === "kunyomi") return true;
    return false;
  };

  const handleFocus = (field: ActiveField) => {
    setActiveField(field);
    if (isJapaneseField(field)) {
      setShowKeyboard(true);
    } else {
      setShowKeyboard(false);
    }
  };

  const openKeyboard = (field: ActiveField) => {
    setActiveField(field);
    setShowKeyboard(true);
  };

  const addKorean = () => {
    setKoreanMeanings(prev => {
      const next = [...prev, ""];
      setTimeout(() => koreanRefs.current[next.length - 1]?.focus(), 0);
      return next;
    });
  };

  const addOnyomi = () => {
    setOnyomiReadings(prev => {
      const next = [...prev, ""];
      setTimeout(() => {
        const newIdx = next.length - 1;
        onyomiRefs.current[newIdx]?.focus();
        handleFocus({ kind: "onyomi", index: newIdx });
        setShowKeyboard(true);
      }, 0);
      return next;
    });
  };

  const addKunyomi = () => {
    setKunyomiReadings(prev => {
      const next = [...prev, ""];
      setTimeout(() => {
        const newIdx = next.length - 1;
        kunyomiRefs.current[newIdx]?.focus();
        handleFocus({ kind: "kunyomi", index: newIdx });
        setShowKeyboard(true);
      }, 0);
      return next;
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">카드 추가</h1>
        <p className="text-muted-foreground mt-1">새로운 단어와 한자를 학습 목록에 추가합니다.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setShowKeyboard(false); }} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="word" className="text-lg py-3">단어</TabsTrigger>
          <TabsTrigger value="kanji" className="text-lg py-3">한자</TabsTrigger>
        </TabsList>

        <Card className="border-primary/20 shadow-md">
          <CardContent className="pt-6">
            {/* WORD TAB */}
            <TabsContent value="word" className="mt-0">
              <Form {...wordForm}>
                <form onSubmit={wordForm.handleSubmit(onSubmitWord)} className="space-y-6">
                  <FormField
                    control={wordForm.control}
                    name="japanese"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">일본어 단어</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              id="word-japanese"
                              className="text-5xl h-20 font-serif"
                              placeholder=""
                              {...field}
                              onFocus={() => handleFocus({ kind: "form-word", name: "japanese" })}
                            />
                          </FormControl>
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="absolute right-2 top-3 text-muted-foreground"
                            onClick={() => openKeyboard({ kind: "form-word", name: "japanese" })}
                            data-testid="button-keyboard-japanese"
                          >
                            <Keyboard className="h-5 w-5" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={wordForm.control}
                    name="furigana"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base flex justify-between">
                          <span>후리가나</span>
                          <span className="text-muted-foreground text-sm font-normal">(선택사항)</span>
                        </FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              className="text-3xl h-16 font-serif"
                              placeholder=""
                              {...field}
                              value={field.value || ""}
                              onFocus={() => handleFocus({ kind: "form-word", name: "furigana" })}
                            />
                          </FormControl>
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="absolute right-2 top-2 text-muted-foreground"
                            onClick={() => openKeyboard({ kind: "form-word", name: "furigana" })}
                            data-testid="button-keyboard-furigana"
                          >
                            <Keyboard className="h-5 w-5" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30"
                    onClick={handleAiWord}
                    disabled={aiLoadingWord}
                  >
                    <Sparkles className="h-4 w-4" />
                    {aiLoadingWord ? "AI 입력 중..." : "AI 자동입력 (후리가나 · 한국어 뜻)"}
                  </Button>

                  {duplicateWord && (
                    <button
                      type="button"
                      onClick={() => setEditTarget({ cardType: "word", id: duplicateWord.id, japanese: duplicateWord.japanese, furigana: duplicateWord.furigana ?? null, korean: duplicateWord.korean })}
                      className="w-full text-left flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-700 dark:hover:bg-amber-900/40 px-4 py-3 text-sm transition-colors cursor-pointer"
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-800 dark:text-amber-300">이미 등록된 단어입니다 — 클릭하면 수정할 수 있어요</p>
                        <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                          <span className="font-serif font-semibold">{duplicateWord.japanese}</span>
                          {duplicateWord.furigana && <span className="text-xs ml-1">({duplicateWord.furigana})</span>}
                          {" — "}{duplicateWord.korean.split("\n")[0]}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-amber-500 shrink-0" />
                    </button>
                  )}

                  {similarWords.length > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-sm">
                      <p className="font-medium text-blue-800 dark:text-blue-300 mb-1.5">같은 한자 어근의 단어가 이미 있어요</p>
                      <div className="space-y-1">
                        {similarWords.map(w => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => setEditTarget({ cardType: "word", id: w.id, japanese: w.japanese, furigana: w.furigana ?? null, korean: w.korean })}
                            className="w-full text-left flex items-center gap-2 rounded px-2 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
                          >
                            <span className="font-serif font-semibold text-blue-900 dark:text-blue-200">{w.japanese}</span>
                            {w.furigana && <span className="text-xs text-blue-600 dark:text-blue-400">({w.furigana})</span>}
                            <span className="text-blue-700 dark:text-blue-400 ml-auto text-xs truncate">{w.korean.split("\n")[0]}</span>
                            <ChevronRight className="h-3 w-3 text-blue-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Multiple Korean meanings */}
                  <div className="space-y-2">
                    <label className="text-base font-medium">한국어 뜻</label>
                    <div className="space-y-2">
                      {koreanMeanings.map((meaning, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            ref={el => { koreanRefs.current[i] = el; }}
                            className="text-3xl h-16 flex-1"
                            placeholder=""
                            value={meaning}
                            onChange={e => setKoreanMeanings(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                            onFocus={() => handleFocus({ kind: "korean", index: i })}
                            data-testid={`input-korean-${i}`}
                          />
                          {koreanMeanings.length > 1 && (
                            <Button
                              type="button" variant="ghost" size="icon"
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => setKoreanMeanings(prev => prev.filter((_, idx) => idx !== i))}
                              data-testid={`button-remove-korean-${i}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 text-muted-foreground border-dashed w-full"
                      onClick={addKorean}
                      data-testid="button-add-korean"
                    >
                      <Plus className="h-4 w-4 mr-1" /> 뜻 추가하기
                    </Button>
                  </div>

                  <Button type="submit" size="lg" className="w-full text-lg h-14" disabled={createWord.isPending || !!duplicateWord} data-testid="button-submit-word">
                    {createWord.isPending ? "추가 중..." : duplicateWord ? "이미 등록된 단어" : "단어 추가하기"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            {/* KANJI TAB */}
            <TabsContent value="kanji" className="mt-0">
              <Form {...kanjiForm}>
                <form onSubmit={kanjiForm.handleSubmit(onSubmitKanji)} className="space-y-6">
                  <FormField
                    control={kanjiForm.control}
                    name="character"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">한자</FormLabel>
                        <FormControl>
                          <Input
                            id="kanji-character"
                            className="text-4xl h-20 text-center font-serif"
                            placeholder=""
                            {...field}
                            onFocus={() => handleFocus({ kind: "form-kanji", name: "character" })}
                            data-testid="input-kanji-character"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30"
                    onClick={handleAiKanji}
                    disabled={aiLoadingKanji}
                  >
                    <Sparkles className="h-4 w-4" />
                    {aiLoadingKanji ? "AI 입력 중..." : "AI 자동입력 (음독 · 훈독 · 뜻음)"}
                  </Button>

                  {duplicateKanji && (
                    <button
                      type="button"
                      onClick={() => setEditTarget({ cardType: "kanji", id: duplicateKanji.id, character: duplicateKanji.character, onyomi: duplicateKanji.onyomi, kunyomi: duplicateKanji.kunyomi, korean: duplicateKanji.korean })}
                      className="w-full text-left flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-700 dark:hover:bg-amber-900/40 px-4 py-3 text-sm transition-colors cursor-pointer"
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-800 dark:text-amber-300">이미 등록된 한자입니다 — 클릭하면 수정할 수 있어요</p>
                        <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                          <span className="font-serif font-semibold">{duplicateKanji.character}</span>
                          {duplicateKanji.onyomi && <span className="ml-1">음독: {duplicateKanji.onyomi}</span>}
                          {duplicateKanji.korean && <span>{" — "}{duplicateKanji.korean}</span>}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-amber-500 shrink-0" />
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-6">
                    {/* Onyomi */}
                    <div className="space-y-2">
                      <label className="text-base font-medium">음독</label>
                      <div className="space-y-2">
                        {onyomiReadings.map((reading, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <div className="relative flex-1">
                              <Input
                                ref={el => { onyomiRefs.current[i] = el; }}
                                className="text-2xl h-14 font-serif pr-9"
                                placeholder=""
                                value={reading}
                                onChange={e => setOnyomiReadings(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                                onFocus={() => handleFocus({ kind: "onyomi", index: i })}
                                data-testid={`input-onyomi-${i}`}
                              />
                              <Button
                                type="button" variant="ghost" size="icon"
                                className="absolute right-1 top-0.5 text-muted-foreground h-9 w-9"
                                onClick={() => openKeyboard({ kind: "onyomi", index: i })}
                                data-testid={`button-keyboard-onyomi-${i}`}
                              >
                                <Keyboard className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {onyomiReadings.length > 1 && (
                              <Button
                                type="button" variant="ghost" size="icon"
                                className="text-muted-foreground hover:text-destructive shrink-0 h-9 w-9"
                                onClick={() => setOnyomiReadings(prev => prev.filter((_, idx) => idx !== i))}
                                data-testid={`button-remove-onyomi-${i}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button" variant="outline" size="sm"
                        className="mt-2 text-muted-foreground border-dashed w-full text-xs"
                        onClick={addOnyomi}
                        data-testid="button-add-onyomi"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> 음독 추가
                      </Button>
                    </div>

                    {/* Kunyomi */}
                    <div className="space-y-2">
                      <label className="text-base font-medium">훈독</label>
                      <div className="space-y-2">
                        {kunyomiReadings.map((reading, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <div className="relative flex-1">
                              <Input
                                ref={el => { kunyomiRefs.current[i] = el; }}
                                className="text-2xl h-14 font-serif pr-9"
                                placeholder=""
                                value={reading}
                                onChange={e => setKunyomiReadings(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                                onFocus={() => handleFocus({ kind: "kunyomi", index: i })}
                                data-testid={`input-kunyomi-${i}`}
                              />
                              <Button
                                type="button" variant="ghost" size="icon"
                                className="absolute right-1 top-0.5 text-muted-foreground h-9 w-9"
                                onClick={() => openKeyboard({ kind: "kunyomi", index: i })}
                                data-testid={`button-keyboard-kunyomi-${i}`}
                              >
                                <Keyboard className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {kunyomiReadings.length > 1 && (
                              <Button
                                type="button" variant="ghost" size="icon"
                                className="text-muted-foreground hover:text-destructive shrink-0 h-9 w-9"
                                onClick={() => setKunyomiReadings(prev => prev.filter((_, idx) => idx !== i))}
                                data-testid={`button-remove-kunyomi-${i}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button" variant="outline" size="sm"
                        className="mt-2 text-muted-foreground border-dashed w-full text-xs"
                        onClick={addKunyomi}
                        data-testid="button-add-kunyomi"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> 훈독 추가
                      </Button>
                    </div>
                  </div>

                  {/* Korean meaning field */}
                  <div className="space-y-2">
                    <label className="text-base font-medium flex justify-between">
                      <span>한국어 뜻음</span>
                      <span className="text-muted-foreground text-sm font-normal">(선택사항)</span>
                    </label>
                    <Input
                      className="text-3xl h-16"
                      placeholder=""
                      value={kanjiKorean}
                      onChange={e => setKanjiKorean(e.target.value)}
                      onFocus={() => setActiveField(null)}
                    />
                  </div>

                  <Button type="submit" size="lg" className="w-full text-lg h-14" disabled={createKanji.isPending || !!duplicateKanji} data-testid="button-submit-kanji">
                    {createKanji.isPending ? "추가 중..." : duplicateKanji ? "이미 등록된 한자" : "한자 추가하기"}
                  </Button>
                </form>
              </Form>

              <ExcelImportKanji />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      {showKeyboard && (
        <VirtualKeyboard
          onInput={handleKeyboardInput}
          onBackspace={handleBackspace}
          onClose={() => setShowKeyboard(false)}
        />
      )}

      {editTarget && <EditDialog target={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}
