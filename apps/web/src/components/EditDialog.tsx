import { useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  useUpdateWord, useUpdateKanji, useUpdateGrammar,
  getListWordsQueryKey, getListKanjiQueryKey, getListGrammarQueryKey, getGetStatsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus, Keyboard, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { VirtualKeyboard } from "@/components/VirtualKeyboard";

export type EditTarget =
  | { cardType: "word"; id: number; japanese: string; furigana: string | null; korean: string }
  | { cardType: "kanji"; id: number; character: string; onyomi: string; kunyomi: string; korean: string }
  | { cardType: "grammar"; id: number; pattern: string; meaning: string; formation: string; example: string; exampleKorean: string; exampleHighlight: string | null };

type ActiveField =
  | { kind: "japanese" }
  | { kind: "furigana" }
  | { kind: "character" }
  | { kind: "korean"; index: number }
  | { kind: "onyomi"; index: number }
  | { kind: "kunyomi"; index: number };

export function EditDialog({
  target, onClose, onDelete,
}: { target: EditTarget; onClose: () => void; onDelete?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateWord = useUpdateWord();
  const updateKanji = useUpdateKanji();
  const updateGrammar = useUpdateGrammar();

  const [gPattern, setGPattern] = useState(target.cardType === "grammar" ? target.pattern : "");
  const [gMeaning, setGMeaning] = useState(target.cardType === "grammar" ? target.meaning : "");
  const [gFormation, setGFormation] = useState(target.cardType === "grammar" ? target.formation : "");
  const [gExample, setGExample] = useState(target.cardType === "grammar" ? target.example : "");
  const [gExampleKorean, setGExampleKorean] = useState(target.cardType === "grammar" ? target.exampleKorean : "");
  const [gHighlight, setGHighlight] = useState(target.cardType === "grammar" ? (target.exampleHighlight ?? "") : "");

  const [japanese, setJapanese] = useState(target.cardType === "word" ? target.japanese : "");
  const [furigana, setFurigana] = useState(target.cardType === "word" ? (target.furigana ?? "") : "");
  const [character, setCharacter] = useState(target.cardType === "kanji" ? target.character : "");
  const [koreanMeanings, setKoreanMeanings] = useState<string[]>(
    target.cardType === "word"
      ? (target.korean.split("\n").filter(Boolean).length > 0 ? target.korean.split("\n").filter(Boolean) : [""])
      : [""]
  );
  const [onyomiReadings, setOnyomiReadings] = useState<string[]>(
    target.cardType === "kanji"
      ? (target.onyomi.split("\n").filter(Boolean).length > 0 ? target.onyomi.split("\n").filter(Boolean) : [""])
      : [""]
  );
  const [kunyomiReadings, setKunyomiReadings] = useState<string[]>(
    target.cardType === "kanji"
      ? (target.kunyomi.split("\n").filter(Boolean).length > 0 ? target.kunyomi.split("\n").filter(Boolean) : [""])
      : [""]
  );
  const [kanjiKorean, setKanjiKorean] = useState(
    target.cardType === "kanji" ? target.korean : ""
  );

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField | null>(null);

  const koreanRefs = useRef<(HTMLInputElement | null)[]>([]);
  const onyomiRefs = useRef<(HTMLInputElement | null)[]>([]);
  const kunyomiRefs = useRef<(HTMLInputElement | null)[]>([]);

  const getCurrentValue = useCallback((): string => {
    if (!activeField) return "";
    if (activeField.kind === "japanese") return japanese;
    if (activeField.kind === "furigana") return furigana;
    if (activeField.kind === "character") return character;
    if (activeField.kind === "korean") return koreanMeanings[activeField.index] ?? "";
    if (activeField.kind === "onyomi") return onyomiReadings[activeField.index] ?? "";
    if (activeField.kind === "kunyomi") return kunyomiReadings[activeField.index] ?? "";
    return "";
  }, [activeField, japanese, furigana, character, koreanMeanings, onyomiReadings, kunyomiReadings]);

  const setCurrentValue = useCallback((val: string) => {
    if (!activeField) return;
    if (activeField.kind === "japanese") { setJapanese(val); return; }
    if (activeField.kind === "furigana") { setFurigana(val); return; }
    if (activeField.kind === "character") { setCharacter(val); return; }
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
  }, [activeField]);

  const isJapaneseField = (field: ActiveField | null) => {
    if (!field) return false;
    return field.kind === "japanese" || field.kind === "furigana" || field.kind === "onyomi" || field.kind === "kunyomi";
  };

  const handleFocus = (field: ActiveField) => {
    setActiveField(field);
    setShowKeyboard(isJapaneseField(field));
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
      const newIdx = next.length - 1;
      setTimeout(() => {
        onyomiRefs.current[newIdx]?.focus();
        setActiveField({ kind: "onyomi", index: newIdx });
        setShowKeyboard(true);
      }, 0);
      return next;
    });
  };

  const addKunyomi = () => {
    setKunyomiReadings(prev => {
      const next = [...prev, ""];
      const newIdx = next.length - 1;
      setTimeout(() => {
        kunyomiRefs.current[newIdx]?.focus();
        setActiveField({ kind: "kunyomi", index: newIdx });
        setShowKeyboard(true);
      }, 0);
      return next;
    });
  };

  const handleSave = () => {
    if (target.cardType === "grammar") {
      if (!gPattern.trim() || !gMeaning.trim()) { toast({ title: "문형과 의미는 필수입니다.", variant: "destructive" }); return; }
      updateGrammar.mutate({ id: target.id, data: {
        pattern: gPattern.trim(), meaning: gMeaning.trim(), formation: gFormation.trim(),
        example: gExample.trim(), exampleKorean: gExampleKorean.trim(), exampleHighlight: gHighlight.trim() || null,
      } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGrammarQueryKey() });
          toast({ title: "수정되었습니다." });
          onClose();
        },
      });
      return;
    }
    if (target.cardType === "word") {
      const nonEmpty = koreanMeanings.map(m => m.trim()).filter(Boolean);
      if (!japanese.trim()) { toast({ title: "일본어를 입력해주세요.", variant: "destructive" }); return; }
      if (nonEmpty.length === 0) { toast({ title: "한국어 뜻을 입력해주세요.", variant: "destructive" }); return; }
      updateWord.mutate({ id: target.id, data: { japanese: japanese.trim(), furigana: furigana.trim() || null, korean: nonEmpty.join("\n") } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWordsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
          toast({ title: "수정되었습니다." });
          onClose();
        },
      });
    } else {
      const nonEmptyOn = onyomiReadings.map(r => r.trim()).filter(Boolean);
      const nonEmptyKun = kunyomiReadings.map(r => r.trim()).filter(Boolean);
      if (!character.trim()) { toast({ title: "한자를 입력해주세요.", variant: "destructive" }); return; }
      updateKanji.mutate({ id: target.id, data: { character: character.trim(), onyomi: nonEmptyOn.join("\n"), kunyomi: nonEmptyKun.join("\n"), korean: kanjiKorean.trim() } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKanjiQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
          toast({ title: "수정되었습니다." });
          onClose();
        },
      });
    }
  };

  const isPending = updateWord.isPending || updateKanji.isPending || updateGrammar.isPending;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/80 z-[100]" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] bg-background rounded-lg border shadow-lg w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {target.cardType === "word" ? "단어 수정" : target.cardType === "kanji" ? "한자 수정" : "문법 수정"}
          </h2>
          <button className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 py-2">
          {target.cardType === "grammar" ? (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">문형</label>
                <Input className="text-2xl h-14 font-serif" value={gPattern} onChange={e => setGPattern(e.target.value)} lang="ja" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">의미</label>
                <Input className="text-xl h-12" value={gMeaning} onChange={e => setGMeaning(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium flex justify-between"><span>접속</span><span className="text-muted-foreground text-xs font-normal">(선택)</span></label>
                <Input className="text-lg h-11 font-serif" value={gFormation} onChange={e => setGFormation(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium flex justify-between"><span>예문</span><span className="text-muted-foreground text-xs font-normal">(선택)</span></label>
                <Input className="text-lg h-11 font-serif" value={gExample} onChange={e => setGExample(e.target.value)} lang="ja" />
                <Input className="text-base h-10" placeholder="예문 해석" value={gExampleKorean} onChange={e => setGExampleKorean(e.target.value)} />
                <Input className="text-base h-10 font-serif" placeholder="밑줄 칠 부분 (예: たばかり)" value={gHighlight} onChange={e => setGHighlight(e.target.value)} lang="ja" />
              </div>
            </>
          ) : target.cardType === "word" ? (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">일본어 단어</label>
                <div className="relative">
                  <Input
                    className="text-3xl h-16 font-serif pr-10"
                    value={japanese}
                    onChange={e => setJapanese(e.target.value)}
                    onFocus={() => handleFocus({ kind: "japanese" })}
                  />
                  <Button type="button" variant="ghost" size="icon"
                    className="absolute right-1 top-2 text-muted-foreground h-9 w-9"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => openKeyboard({ kind: "japanese" })}>
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium flex justify-between">
                  <span>후리가나</span>
                  <span className="text-muted-foreground text-xs font-normal">(선택사항)</span>
                </label>
                <div className="relative">
                  <Input
                    className="text-2xl h-14 font-serif pr-10"
                    value={furigana}
                    onChange={e => setFurigana(e.target.value)}
                    onFocus={() => handleFocus({ kind: "furigana" })}
                  />
                  <Button type="button" variant="ghost" size="icon"
                    className="absolute right-1 top-1 text-muted-foreground h-9 w-9"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => openKeyboard({ kind: "furigana" })}>
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">한국어 뜻</label>
                {koreanMeanings.map((meaning, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      ref={el => { koreanRefs.current[i] = el; }}
                      className="text-2xl h-14 flex-1"
                      value={meaning}
                      onChange={e => setKoreanMeanings(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                      onFocus={() => handleFocus({ kind: "korean", index: i })}
                    />
                    {koreanMeanings.length > 1 && (
                      <Button type="button" variant="ghost" size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setKoreanMeanings(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm"
                  className="text-muted-foreground border-dashed w-full"
                  onMouseDown={e => e.preventDefault()}
                  onClick={addKorean}>
                  <Plus className="h-4 w-4 mr-1" /> 뜻 추가하기
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">한자</label>
                <Input
                  className="text-4xl h-20 text-center font-serif"
                  value={character}
                  onChange={e => setCharacter(e.target.value)}
                  onFocus={() => handleFocus({ kind: "character" })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">음독</label>
                  {onyomiReadings.map((reading, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="relative flex-1">
                        <Input
                          ref={el => { onyomiRefs.current[i] = el; }}
                          className="text-xl h-12 font-serif pr-9"
                          value={reading}
                          onChange={e => setOnyomiReadings(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                          onFocus={() => handleFocus({ kind: "onyomi", index: i })}
                        />
                        <Button type="button" variant="ghost" size="icon"
                          className="absolute right-0.5 top-1 text-muted-foreground h-8 w-8"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => openKeyboard({ kind: "onyomi", index: i })}>
                          <Keyboard className="h-3 w-3" />
                        </Button>
                      </div>
                      {onyomiReadings.length > 1 && (
                        <Button type="button" variant="ghost" size="icon"
                          className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setOnyomiReadings(prev => prev.filter((_, idx) => idx !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm"
                    className="text-muted-foreground border-dashed w-full text-xs"
                    onMouseDown={e => e.preventDefault()}
                    onClick={addOnyomi}>
                    <Plus className="h-3 w-3 mr-1" /> 음독 추가
                  </Button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">훈독</label>
                  {kunyomiReadings.map((reading, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="relative flex-1">
                        <Input
                          ref={el => { kunyomiRefs.current[i] = el; }}
                          className="text-xl h-12 font-serif pr-9"
                          value={reading}
                          onChange={e => setKunyomiReadings(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                          onFocus={() => handleFocus({ kind: "kunyomi", index: i })}
                        />
                        <Button type="button" variant="ghost" size="icon"
                          className="absolute right-0.5 top-1 text-muted-foreground h-8 w-8"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => openKeyboard({ kind: "kunyomi", index: i })}>
                          <Keyboard className="h-3 w-3" />
                        </Button>
                      </div>
                      {kunyomiReadings.length > 1 && (
                        <Button type="button" variant="ghost" size="icon"
                          className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setKunyomiReadings(prev => prev.filter((_, idx) => idx !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm"
                    className="text-muted-foreground border-dashed w-full text-xs"
                    onMouseDown={e => e.preventDefault()}
                    onClick={addKunyomi}>
                    <Plus className="h-3 w-3 mr-1" /> 훈독 추가
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium flex justify-between">
                  <span>한국어 뜻음</span>
                  <span className="text-muted-foreground text-xs font-normal">(선택사항)</span>
                </label>
                <Input
                  className="text-2xl h-14"
                  value={kanjiKorean}
                  onChange={e => setKanjiKorean(e.target.value)}
                  onFocus={() => { setActiveField(null); setShowKeyboard(false); }}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2 mt-4">
          <Button variant="outline" onMouseDown={e => e.preventDefault()} onClick={onClose}>취소</Button>
          <Button onMouseDown={e => e.preventDefault()} onClick={handleSave} disabled={isPending}>
            {isPending ? "저장 중..." : "저장하기"}
          </Button>
        </div>

        {onDelete && (
          <div className="mt-2 pt-3 border-t">
            <Button
              variant="ghost"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onMouseDown={e => e.preventDefault()}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              삭제하기
            </Button>
          </div>
        )}
      </div>

      {showKeyboard && (
        <VirtualKeyboard
          onInput={char => setCurrentValue(getCurrentValue() + char)}
          onBackspace={() => setCurrentValue(getCurrentValue().slice(0, -1))}
          onClose={() => setShowKeyboard(false)}
        />
      )}
    </>,
    document.body
  );
}
