import { useState, useEffect, useCallback, useRef } from "react";
import {
  useListWords,
  useListKanji,
  useUpdateWord,
  useUpdateKanji,
  useRecordWordWrong,
  useRecordKanjiWrong,
  useRecordWordEasy,
  useRecordKanjiEasy,
  useGetStudySession,
  useSaveStudySession,
  useClearStudySession,
  useSpeakJapanese,
  useRecordActivity,
  getListWordsQueryKey,
  getListKanjiQueryKey,
  getGetWeakItemsQueryKey,
} from "@workspace/api-client-react";

import { useQueryClient } from "@tanstack/react-query";
import { Flashcard } from "@/components/Flashcard";
import { EditDialog, EditTarget } from "@/components/EditDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Settings, Shuffle, ArrowLeft, AlertCircle, Volume2, VolumeX } from "lucide-react";
import { Link, useSearch } from "wouter";

const WEAK_THRESHOLD = 3;

type StudyType = "both" | "words" | "kanji";
type CardRange = "today" | "recent" | "all";
type AnimPhase = "idle" | "exit-left" | "exit-right" | "exit-up" | "enter-right" | "enter-left" | "enter-down" | "cover-left";

interface StudyCard {
  id: number;
  type: "word" | "kanji";
  japanese: string;
  furigana?: string | null;
  korean?: string;
  onyomi?: string;
  kunyomi?: string;
  wrongCount?: number;
  manualWeak?: boolean;
}

const STORAGE_KEY_TYPE = "study_type";
const STORAGE_KEY_RANGE = "study_range";
const SESSION_KEY = "study_session";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface StudySession {
  deckIds: { id: number; type: "word" | "kanji" }[];
  currentIdx: number;
  history: number[];
  remaining: number[];
  studyStep: number;
  studyType: StudyType;
  cardRange: CardRange;
  savedAt: number;
}

function saveLocalSession(session: StudySession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
}

function loadLocalSession(): StudySession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StudySession;
    if (Date.now() - s.savedAt > SESSION_MAX_AGE_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}

function clearLocalSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

function buildCardFromWord(w: any): StudyCard {
  return { id: w.id, type: "word", japanese: w.japanese, furigana: w.furigana, korean: w.korean, wrongCount: w.wrongCount, manualWeak: w.manualWeak };
}

function buildCardFromKanji(k: any): StudyCard {
  return { id: k.id, type: "kanji", japanese: k.character, onyomi: k.onyomi, kunyomi: k.kunyomi, korean: k.korean, wrongCount: k.wrongCount, manualWeak: k.manualWeak };
}

function difficultyWeight(wrongCount: number | undefined, manualWeak: boolean | undefined): number {
  return (wrongCount ?? 0) * 2 + (manualWeak ? 5 : 0) + 1;
}

function weightedShuffle<T>(items: T[], weight: (item: T) => number): T[] {
  return [...items]
    .map(item => ({ item, key: Math.random() ** (1 / weight(item)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ item }) => item);
}

function loadDeck(
  words: any[] | undefined,
  kanji: any[] | undefined,
  studyType: StudyType,
  cardRange: CardRange
): StudyCard[] {
  let items: (StudyCard & { _createdAt?: string; _studiedAt?: string | null })[] = [];

  if (studyType === "words" || studyType === "both") {
    items.push(...(words ?? []).map(w => ({ ...buildCardFromWord(w), _createdAt: w.createdAt, _studiedAt: w.studiedAt })));
  }
  if (studyType === "kanji" || studyType === "both") {
    items.push(...(kanji ?? []).map(k => ({ ...buildCardFromKanji(k), _createdAt: k.createdAt, _studiedAt: k.studiedAt })));
  }

  if (cardRange === "today") {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    items = items.filter(i =>
      new Date(i._createdAt ?? "").getTime() >= twoDaysAgo ||
      (i._studiedAt && new Date(i._studiedAt).getTime() >= twoDaysAgo)
    );
  } else if (cardRange === "recent") {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    items = items.filter(i =>
      new Date(i._createdAt ?? "").getTime() >= oneWeekAgo ||
      (i._studiedAt && new Date(i._studiedAt).getTime() >= oneWeekAgo)
    );
  }

  return weightedShuffle(items, item => difficultyWeight(item.wrongCount, item.manualWeak));
}

function loadDeckWeak(
  words: any[] | undefined,
  kanji: any[] | undefined,
): StudyCard[] {
  const items: StudyCard[] = [];
  (words ?? []).forEach(w => {
    if (w.manualWeak || w.wrongCount >= WEAK_THRESHOLD) items.push(buildCardFromWord(w));
  });
  (kanji ?? []).forEach(k => {
    if (k.manualWeak || k.wrongCount >= WEAK_THRESHOLD) items.push(buildCardFromKanji(k));
  });
  return weightedShuffle(items, item => difficultyWeight(item.wrongCount, item.manualWeak));
}

function tryRestoreSession(
  session: StudySession,
  words: any[] | undefined,
  kanji: any[] | undefined,
  studyType: StudyType,
  cardRange: CardRange,
): { deck: StudyCard[]; currentIdx: number; history: number[]; remaining: number[]; studyStep: number } | null {
  if (session.studyType !== studyType || session.cardRange !== cardRange) return null;

  const wordMap = new Map((words ?? []).map(w => [w.id, w]));
  const kanjiMap = new Map((kanji ?? []).map(k => [k.id, k]));

  const newDeck: StudyCard[] = [];
  const oldToNew = new Map<number, number>();

  session.deckIds.forEach(({ id, type }, oldIdx) => {
    const item = type === "word" ? wordMap.get(id) : kanjiMap.get(id);
    if (!item) return;
    oldToNew.set(oldIdx, newDeck.length);
    newDeck.push(type === "word" ? buildCardFromWord(item) : buildCardFromKanji(item));
  });

  if (newDeck.length === 0) return null;

  const newCurrentIdx = oldToNew.get(session.currentIdx) ?? 0;
  const newHistory = session.history.map(i => oldToNew.get(i)).filter((i): i is number => i !== undefined);
  const newRemaining = session.remaining.map(i => oldToNew.get(i)).filter((i): i is number => i !== undefined);

  return { deck: newDeck, currentIdx: newCurrentIdx, history: newHistory, remaining: newRemaining, studyStep: session.studyStep };
}

export default function Study() {
  const search = useSearch();
  const weakMode = new URLSearchParams(search).get("weak") === "true";

  const [studyType, setStudyType] = useState<StudyType>(
    () => (localStorage.getItem(STORAGE_KEY_TYPE) as StudyType | null) ?? "both"
  );
  const [cardRange, setCardRange] = useState<CardRange>(
    () => (localStorage.getItem(STORAGE_KEY_RANGE) as CardRange | null) ?? "all"
  );

  const [deck, setDeck] = useState<StudyCard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [remaining, setRemaining] = useState<number[]>([]);
  const [studyStep, setStudyStep] = useState(1);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const { data: words } = useListWords();
  const { data: kanji } = useListKanji();
  const { data: serverSessionData, isLoading: serverSessionLoading } = useGetStudySession({
    query: { enabled: !weakMode, retry: 2, staleTime: 0 },
  });
  const { mutate: saveSessionMutateFn } = useSaveStudySession();
  const { mutate: clearSessionMutateFn } = useClearStudySession();
  const saveSessionMutateRef = useRef(saveSessionMutateFn);
  const clearSessionMutateRef = useRef(clearSessionMutateFn);
  saveSessionMutateRef.current = saveSessionMutateFn;
  clearSessionMutateRef.current = clearSessionMutateFn;
  const updateWord = useUpdateWord();
  const updateKanji = useUpdateKanji();
  const recordWordWrongMutate = useRecordWordWrong();
  const recordKanjiWrongMutate = useRecordKanjiWrong();
  const recordWordEasyMutate = useRecordWordEasy();
  const recordKanjiEasyMutate = useRecordKanjiEasy();
  const speakJapanese = useSpeakJapanese();
  const recordActivity = useRecordActivity();
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem("study-tts") !== "off");
  const queryClient = useQueryClient();

  const wordsRef = useRef(words);
  const kanjiRef = useRef(kanji);
  const studyTypeRef = useRef(studyType);
  const cardRangeRef = useRef(cardRange);
  wordsRef.current = words;
  kanjiRef.current = kanji;
  studyTypeRef.current = studyType;
  cardRangeRef.current = cardRange;

  const [deckKey, setDeckKey] = useState(0);
  const hasInitialized = useRef(false);
  const sessionRestoreAttempted = useRef(false);

  // 서버 저장 디바운스 타이머
  const serverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildRemaining = (deckLen: number) => {
    const indices = Array.from({ length: deckLen }, (_, i) => i).slice(1);
    return indices.sort(() => 0.5 - Math.random());
  };

  // 세션 저장 — localStorage + 서버 (debounced 800ms)
  const persistSession = useCallback((
    d: StudyCard[], idx: number, hist: number[], rem: number[], step: number, st: StudyType, cr: CardRange
  ) => {
    if (weakMode || d.length === 0) return;
    const session: StudySession = {
      deckIds: d.map(c => ({ id: c.id, type: c.type })),
      currentIdx: idx,
      history: hist,
      remaining: rem,
      studyStep: step,
      studyType: st,
      cardRange: cr,
      savedAt: Date.now(),
    };
    saveLocalSession(session);

    if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
    serverSaveTimer.current = setTimeout(() => {
      saveSessionMutateRef.current({ data: session });
    }, 800);
  }, [weakMode]); // ref 사용으로 mutation 의존성 제거

  // 세션 삭제 — localStorage + 서버
  const clearSessionAll = useCallback(() => {
    clearLocalSession();
    if (!weakMode) clearSessionMutateRef.current();
  }, [weakMode]); // ref 사용으로 mutation 의존성 제거

  const handleToggleWeak = useCallback(() => {
    setDeck(prev => {
      const card = prev[currentIdx];
      if (!card) return prev;
      const isCurrentlyWeak = card.manualWeak || (card.wrongCount || 0) >= WEAK_THRESHOLD;
      const newManualWeak = !isCurrentlyWeak;
      // 해제 시: wrongCount도 WEAK_THRESHOLD만큼 차감해 threshold 미만으로 내림
      const newWrongCount = !isCurrentlyWeak
        ? undefined // 등록 시 wrongCount는 그대로
        : Math.min(card.wrongCount || 0, WEAK_THRESHOLD - 1); // 해제 시 threshold 미만(2)으로 고정

      const updatePayload = {
        manualWeak: newManualWeak,
        ...(newWrongCount !== undefined ? { wrongCount: newWrongCount } : {}),
      };

      if (card.type === "word") {
        updateWord.mutate({ id: card.id, data: updatePayload }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListWordsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetWeakItemsQueryKey() });
          },
        });
      } else {
        updateKanji.mutate({ id: card.id, data: updatePayload }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListKanjiQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetWeakItemsQueryKey() });
          },
        });
      }
      return prev.map((c, i) =>
        i === currentIdx ? { ...c, manualWeak: newManualWeak, ...(newWrongCount !== undefined ? { wrongCount: newWrongCount } : {}) } : c
      );
    });
  }, [currentIdx, updateWord, updateKanji, queryClient]);

  const handleEdit = useCallback(() => {
    const card = deck[currentIdx];
    if (!card) return;
    if (card.type === "word") {
      setEditTarget({ cardType: "word", id: card.id, japanese: card.japanese, furigana: card.furigana ?? null, korean: card.korean ?? "" });
    } else {
      setEditTarget({ cardType: "kanji", id: card.id, character: card.japanese, onyomi: card.onyomi ?? "", kunyomi: card.kunyomi ?? "", korean: card.korean ?? "" });
    }
  }, [deck, currentIdx]);

  // 데이터 첫 도착 시 초기화 — words, kanji, 서버 세션 모두 도착한 후에만 실행
  useEffect(() => {
    if (hasInitialized.current) return;
    if (words === undefined || kanji === undefined) return; // 둘 다 로드 완료까지 대기
    if (!weakMode && serverSessionLoading) return; // 서버 응답 대기

    hasInitialized.current = true;

    if (!weakMode && !sessionRestoreAttempted.current) {
      sessionRestoreAttempted.current = true;

      const localSession = loadLocalSession();
      const serverSession = serverSessionData?.session ?? null;

      // savedAt 기준으로 더 최신 세션 선택
      let sessionToUse: StudySession | null = null;
      if (localSession && serverSession) {
        sessionToUse = localSession.savedAt >= serverSession.savedAt ? localSession : serverSession;
      } else {
        sessionToUse = localSession ?? serverSession;
      }

      if (sessionToUse) {
        // 세션의 설정값을 로컬 설정에 반영 (크로스-디바이스 동기화)
        if (sessionToUse.studyType !== studyTypeRef.current) {
          setStudyType(sessionToUse.studyType);
          localStorage.setItem(STORAGE_KEY_TYPE, sessionToUse.studyType);
          studyTypeRef.current = sessionToUse.studyType;
        }
        if (sessionToUse.cardRange !== cardRangeRef.current) {
          setCardRange(sessionToUse.cardRange);
          localStorage.setItem(STORAGE_KEY_RANGE, sessionToUse.cardRange);
          cardRangeRef.current = sessionToUse.cardRange;
        }

        const restored = tryRestoreSession(
          sessionToUse, words, kanji,
          sessionToUse.studyType, sessionToUse.cardRange
        );
        if (restored) {
          setDeck(restored.deck);
          setCurrentIdx(restored.currentIdx);
          setHistory(restored.history);
          setRemaining(restored.remaining);
          setStudyStep(restored.studyStep);
          setIsFlipped(false);
          // 선택된 세션을 양쪽에 동기화
          saveLocalSession(sessionToUse);
          return;
        }
      }
    }

    setDeckKey(k => k + 1);
  }, [words, kanji, weakMode, serverSessionLoading, serverSessionData]);

  // deckKey 변경 시 덱 새로 빌드
  useEffect(() => {
    if (deckKey === 0) return;
    const newDeck = weakMode
      ? loadDeckWeak(wordsRef.current, kanjiRef.current)
      : loadDeck(wordsRef.current, kanjiRef.current, studyTypeRef.current, cardRangeRef.current);
    setDeck(newDeck);
    setCurrentIdx(0);
    setHistory([]);
    setRemaining(buildRemaining(newDeck.length));
    setStudyStep(1);
    setIsFlipped(false);
    if (!weakMode) {
      persistSession(newDeck, 0, [], buildRemaining(newDeck.length), 1, studyTypeRef.current, cardRangeRef.current);
    }
  }, [deckKey, weakMode, persistSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypeChange = (v: StudyType) => {
    setStudyType(v);
    localStorage.setItem(STORAGE_KEY_TYPE, v);
    clearSessionAll();
    setDeckKey(k => k + 1);
  };

  const handleRangeChange = (v: CardRange) => {
    setCardRange(v);
    localStorage.setItem(STORAGE_KEY_RANGE, v);
    clearSessionAll();
    setDeckKey(k => k + 1);
  };

  const handleReshuffle = () => {
    clearSessionAll();
    setDeckKey(k => k + 1);
    setSheetOpen(false);
  };

  const goNext = useCallback(() => {
    setRemaining(rem => {
      if (rem.length === 0) return rem;
      const next = rem[0];
      const newRem = rem.slice(1);
      setIsFlipped(false);
      setStudyStep(s => {
        const newStep = s + 1;
        setHistory(h => {
          const newHist = [...h, currentIdx];
          setCurrentIdx(next);
          setDeck(d => {
            persistSession(d, next, newHist, newRem, newStep, studyTypeRef.current, cardRangeRef.current);
            return d;
          });
          return newHist;
        });
        return newStep;
      });
      return newRem;
    });
  }, [currentIdx, persistSession]);

  const goPrev = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      const newHist = h.slice(0, -1);
      setRemaining(rem => {
        const newRem = [currentIdx, ...rem];
        setIsFlipped(false);
        setStudyStep(s => {
          const newStep = Math.max(1, s - 1);
          setCurrentIdx(last);
          setDeck(d => {
            persistSession(d, last, newHist, newRem, newStep, studyTypeRef.current, cardRangeRef.current);
            return d;
          });
          return newStep;
        });
        return newRem;
      });
      return newHist;
    });
  }, [currentIdx, persistSession]);

  const flipCard = useCallback(() => setIsFlipped(f => !f), []);

  // 카드 앞면 표시 시 TTS 자동재생
  useEffect(() => {
    if (!ttsEnabled || deck.length === 0) return;
    const card = deck[currentIdx];
    if (!card) return;
    let text = "";
    if (card.type === "word") {
      text = card.japanese;
    } else {
      const kun = (card.kunyomi ?? "").split("\n")[0].trim();
      const on = (card.onyomi ?? "").split("\n")[0].trim();
      text = [kun, on].filter(Boolean).join("、");
    }
    if (text) speakJapanese(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, deck.length, ttsEnabled]);

  const recordScore = useCallback((direction: "easy" | "hard") => {
    const card = deck[currentIdx];
    if (!card) return;
    recordActivity.mutate({ count: 1 });
    if (direction === "easy") {
      if (card.type === "word") recordWordEasyMutate.mutate({ id: card.id });
      else recordKanjiEasyMutate.mutate({ id: card.id });
    } else {
      if (card.type === "word") recordWordWrongMutate.mutate({ id: card.id });
      else recordKanjiWrongMutate.mutate({ id: card.id });
    }
  }, [deck, currentIdx, recordActivity, recordWordEasyMutate, recordKanjiEasyMutate, recordWordWrongMutate, recordKanjiWrongMutate]);

  // 슬라이드 애니메이션
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
  const [underlayCard, setUnderlayCard] = useState<typeof deck[number] | null>(null);
  const animLock = useRef(false);
  const ANIM_MS = 220;

  const goNextWithAnim = useCallback(() => {
    if (animLock.current) return;
    animLock.current = true;
    setAnimPhase("exit-left");
    setTimeout(() => {
      goNext();
      setAnimPhase("enter-right");
      setTimeout(() => { setAnimPhase("idle"); animLock.current = false; }, ANIM_MS);
    }, ANIM_MS);
  }, [goNext]);

  const goPrevWithAnim = useCallback(() => {
    if (animLock.current) return;
    animLock.current = true;
    // 현재 카드를 언더레이로 고정, 이전 카드가 위에서 덮어옴
    setUnderlayCard(deck[currentIdx] ?? null);
    goPrev();
    setAnimPhase("cover-left");
    setTimeout(() => {
      setAnimPhase("idle");
      setUnderlayCard(null);
      animLock.current = false;
    }, 300);
  }, [goPrev, deck, currentIdx]);

  const goNextEasyWithAnim = useCallback(() => {
    recordScore("easy");
    goNextWithAnim(); // 좌로 퇴장
  }, [recordScore, goNextWithAnim]);

  const HARD_ANIM_MS = 380;
  const goNextHardWithAnim = useCallback(() => {
    if (animLock.current) return;
    recordScore("hard");
    animLock.current = true;
    setAnimPhase("exit-up");              // 위로 포물선 퇴장
    setTimeout(() => {
      goNext();
      setAnimPhase("enter-down");         // 아래에서 등장
      setTimeout(() => { setAnimPhase("idle"); animLock.current = false; }, ANIM_MS);
    }, HARD_ANIM_MS);
  }, [recordScore, goNext]);

  // 터치 / 롱프레스
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isTouchSwipe = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isTouchSwipe.current = false;
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      handleToggleWeak();
    }, 600);
  }, [handleToggleWeak]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressTimer.current) return;
    const dx = Math.abs(e.touches[0].clientX - (touchStartX.current ?? 0));
    const dy = Math.abs(e.touches[0].clientY - (touchStartY.current ?? 0));
    if (dx > 10 || dy > 10) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (longPressTriggered.current) { longPressTriggered.current = false; touchStartX.current = null; touchStartY.current = null; return; }
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX > 50 || absY > 50) {
      isTouchSwipe.current = true;
      if (absX >= absY) {
        if (deltaX < 0) goNextEasyWithAnim();  // 좌 = 쉬움 + 다음
        else goPrevWithAnim();                 // 우 = 이전
      } else {
        if (deltaY < 0) goNextHardWithAnim();  // 위 = 어려움 + 다음
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [goNextEasyWithAnim, goNextHardWithAnim, goPrevWithAnim]);

  const handleContainerClick = useCallback(() => {
    if (isTouchSwipe.current) { isTouchSwipe.current = false; return; }
    flipCard();
  }, [flipCard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") { e.preventDefault(); goNextHardWithAnim(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); flipCard(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goNextEasyWithAnim(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goPrevWithAnim(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipCard, goNextEasyWithAnim, goPrevWithAnim]);

  const wheelCooldown = useRef(false);
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelCooldown.current) return;
      wheelCooldown.current = true;
      setTimeout(() => { wheelCooldown.current = false; }, 600);
      if (e.deltaY < 0) goNextHardWithAnim();  // 스크롤 위 = 어려움 + 다음
      else goNextEasyWithAnim();               // 스크롤 아래 = 쉬움 + 다음
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [goNextHardWithAnim, goNextEasyWithAnim]);

  // 수직 스와이프 시 페이지 스크롤 방지 (document에 passive:false로 등록)
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
      const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
      if (dy > dx) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", onTouchMove);
  }, []);

  if (deck.length === 0) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        {weakMode ? (
          <>
            <p className="text-muted-foreground text-lg">취약 항목이 없습니다.</p>
            <Link href="/weak">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> 취약 항목으로 돌아가기
              </Button>
            </Link>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-lg">해당 범위에 카드가 없습니다.</p>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2"><Settings className="h-4 w-4" /> 설정 변경</Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SettingsPanel
                  studyType={studyType}
                  cardRange={cardRange}
                  onTypeChange={handleTypeChange}
                  onRangeChange={handleRangeChange}
                  onReshuffle={handleReshuffle}
                />
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    );
  }

  const card = deck[currentIdx];
  const hasPrev = history.length > 0;
  const isLastCard = remaining.length === 0;

  return (
    <div
      className="flex flex-col gap-6 select-none cursor-pointer"
      onClick={handleContainerClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="flex justify-between items-center">
        {weakMode ? (
          <Link href="/weak" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> 취약 항목
            </Button>
          </Link>
        ) : (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground"
                onClick={e => e.stopPropagation()}>
                <Settings className="h-4 w-4" /> 설정
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SettingsPanel
                studyType={studyType}
                cardRange={cardRange}
                onTypeChange={handleTypeChange}
                onRangeChange={handleRangeChange}
                onReshuffle={handleReshuffle}
              />
            </SheetContent>
          </Sheet>
        )}
        <div className="flex items-center gap-2">
          {weakMode && (
            <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> 취약 집중 모드
            </span>
          )}
          {isLastCard && (
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">마지막 카드</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={ttsEnabled ? "text-primary" : "text-muted-foreground/40"}
            onClick={e => {
              e.stopPropagation();
              setTtsEnabled(v => {
                const next = !v;
                localStorage.setItem("study-tts", next ? "on" : "off");
                return next;
              });
            }}
            title={ttsEnabled ? "TTS 끄기" : "TTS 켜기"}
          >
            {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <span className="text-sm text-muted-foreground font-medium">{studyStep} / {deck.length}장</span>
        </div>
      </div>

      {/* Card */}
      <div ref={cardContainerRef} className="mx-auto w-full lg:w-[60%]">
        <div className="relative">
          {/* 언더레이: 이전으로 돌아갈 때 현재 카드가 아래에 그대로 머무름 */}
          {underlayCard && (
            <div className="absolute inset-0 brightness-75 scale-[0.97] transition-none">
              <Flashcard
                key={`underlay-${underlayCard.id}-${underlayCard.type}`}
                type={underlayCard.type}
                japanese={underlayCard.japanese}
                furigana={underlayCard.furigana}
                korean={underlayCard.korean}
                onyomi={underlayCard.onyomi}
                kunyomi={underlayCard.kunyomi}
                wrongCount={underlayCard.wrongCount}
                manualWeak={underlayCard.manualWeak}
                isFlipped={false}
                onToggleWeak={() => {}}
                onEdit={() => {}}
              />
            </div>
          )}
          {/* 메인 카드 */}
          <div className={animPhase !== "idle" ? `card-${animPhase}` : ""}>
            <Flashcard
              key={`${card.id}-${card.type}-${currentIdx}`}
              type={card.type}
              japanese={card.japanese}
              furigana={card.furigana}
              korean={card.korean}
              onyomi={card.onyomi}
              kunyomi={card.kunyomi}
              wrongCount={card.wrongCount}
              manualWeak={card.manualWeak}
              isFlipped={isFlipped}
              onToggleWeak={handleToggleWeak}
              onEdit={handleEdit}
            />
          </div>
        </div>
      </div>

      {/* Hints */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground/60">
        <span className="hidden sm:inline">클릭 뒤집기</span>
        <span className="sm:hidden">탭 뒤집기</span>
        <span>← 쉬움</span>
        <span>→ 이전</span>
        <span>↑ 어려움</span>
        <span className="hidden sm:inline">★ 취약</span>
        <span className="sm:hidden">길게 취약</span>
      </div>

      {editTarget && (
        <EditDialog target={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}

function SettingsPanel({
  studyType, cardRange, onTypeChange, onRangeChange, onReshuffle,
}: {
  studyType: StudyType;
  cardRange: CardRange;
  onTypeChange: (v: StudyType) => void;
  onRangeChange: (v: CardRange) => void;
  onReshuffle: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="mb-6">
        <SheetTitle>학습 설정</SheetTitle>
      </SheetHeader>
      <div className="space-y-8 flex-1">
        <div className="space-y-3">
          <Label className="text-base font-semibold">카드 유형</Label>
          <RadioGroup value={studyType} onValueChange={v => onTypeChange(v as StudyType)} className="flex flex-col space-y-2">
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="both" id="s-both" />
              <Label htmlFor="s-both" className="font-normal">혼합</Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="words" id="s-words" />
              <Label htmlFor="s-words" className="font-normal">단어만</Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="kanji" id="s-kanji" />
              <Label htmlFor="s-kanji" className="font-normal">한자만</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label className="text-base font-semibold">카드 범위</Label>
          <RadioGroup value={cardRange} onValueChange={v => onRangeChange(v as CardRange)} className="flex flex-col space-y-2">
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="today" id="s-today" />
              <Label htmlFor="s-today" className="font-normal">최근 이틀</Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="recent" id="s-recent" />
              <Label htmlFor="s-recent" className="font-normal">최근 1주일</Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="all" id="s-all" />
              <Label htmlFor="s-all" className="font-normal">전체</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      <div className="pt-6 border-t">
        <Button variant="outline" className="w-full gap-2" onClick={onReshuffle}>
          <Shuffle className="h-4 w-4" /> 다시 섞기
        </Button>
      </div>
    </div>
  );
}
