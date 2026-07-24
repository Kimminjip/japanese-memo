import { useQuery, useMutation, type UseQueryOptions } from "@tanstack/react-query";
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const getListWordsQueryKey = (params?: { dateFilter?: string }) =>
  params ? (["words", params] as const) : (["words"] as const);

export const getListKanjiQueryKey = (params?: { dateFilter?: string }) =>
  params ? (["kanji", params] as const) : (["kanji"] as const);

export const getGetStatsSummaryQueryKey = () => ["stats", "summary"] as const;

export const getGetWeakItemsQueryKey = () => ["stats", "weak"] as const;

export const getGetStudySessionQueryKey = () => ["study-session"] as const;

export const getGetActivityQueryKey = () => ["stats", "activity"] as const;

export const getListGrammarQueryKey = (params?: { dateFilter?: string }) =>
  params ? (["grammar", params] as const) : (["grammar"] as const);

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Word {
  id: number;
  japanese: string;
  furigana?: string | null;
  korean: string;
  wrongCount: number;
  manualWeak: boolean;
  createdAt: string;
  studiedAt: string | null;
  jlptLevel: string | null;
  distractors?: string[] | null;
}

export interface Kanji {
  id: number;
  character: string;
  onyomi: string;
  kunyomi: string;
  korean: string;
  wrongCount: number;
  manualWeak: boolean;
  createdAt: string;
  studiedAt: string | null;
  jlptLevel: string | null;
  distractors?: string[] | null;
}

export interface Grammar {
  id: number;
  pattern: string;
  meaning: string;
  formation: string;
  example: string;
  exampleKorean: string;
  exampleHighlight: string | null;
  wrongCount: number;
  manualWeak: boolean;
  createdAt: string;
  studiedAt: string | null;
  jlptLevel: string | null;
}

export interface GrammarDetail {
  pattern: string;
  meaning: string;
  formation: string;
  example: string;
  exampleKorean: string;
  exampleHighlight: string;
  jlptLevel: string;
}

export interface StatsSummary {
  totalWords: number;
  totalKanji: number;
  todayWords: number;
  todayKanji: number;
  weakWords: number;
  weakKanji: number;
}

export interface WeakItems {
  words: Word[];
  kanji: Kanji[];
}

export interface StudySessionItem {
  deckIds: { id: number; type: "word" | "kanji" }[];
  currentIdx: number;
  history: number[];
  remaining: number[];
  studyStep: number;
  studyType: "both" | "words" | "kanji";
  cardRange: "today" | "recent" | "all";
  orderMode?: "random" | "sequence";
  savedAt: number;
}

export interface StudySessionResponse {
  session: StudySessionItem | null;
}

// ─── Words ─────────────────────────────────────────────────────────────────────

export function useListWords(
  params?: { dateFilter?: "today" | "recent" | "all" },
  options?: Partial<UseQueryOptions<Word[]>>
) {
  return useQuery<Word[]>({
    queryKey: getListWordsQueryKey(params),
    queryFn: async () => {
      const { data } = await api.get("/words", { params });
      return data;
    },
    ...options,
  });
}

export function useCreateWord() {
  return useMutation<Word, Error, { data: { japanese: string; furigana?: string | null; korean: string } }>({
    mutationFn: async ({ data }) => {
      const res = await api.post("/words", data);
      return res.data;
    },
  });
}

export function useUpdateWord() {
  return useMutation<Word, Error, { id: number; data: Partial<{ japanese: string; furigana: string | null; korean: string; wrongCount: number; manualWeak: boolean }> }>({
    mutationFn: async ({ id, data }) => {
      const res = await api.put(`/words/${id}`, data);
      return res.data;
    },
  });
}

export function useDeleteWord() {
  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await api.delete(`/words/${id}`);
    },
  });
}

export function useRecordWordWrong() {
  return useMutation<Word, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await api.post(`/words/${id}/wrong`);
      return res.data;
    },
  });
}

export function useRecordWordEasy() {
  return useMutation<Word, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await api.post(`/words/${id}/easy`);
      return res.data;
    },
  });
}

export function useMarkWordStudied() {
  return useMutation<Word, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await api.post(`/words/${id}/studied`);
      return res.data;
    },
  });
}

// ─── Kanji ─────────────────────────────────────────────────────────────────────

export function useListKanji(
  params?: { dateFilter?: "today" | "recent" | "all" },
  options?: Partial<UseQueryOptions<Kanji[]>>
) {
  return useQuery<Kanji[]>({
    queryKey: getListKanjiQueryKey(params),
    queryFn: async () => {
      const { data } = await api.get("/kanji", { params });
      return data;
    },
    ...options,
  });
}

export function useCreateKanji() {
  return useMutation<Kanji, Error, { data: { character: string; onyomi: string; kunyomi: string; korean?: string } }>({
    mutationFn: async ({ data }) => {
      const res = await api.post("/kanji", data);
      return res.data;
    },
  });
}

export function useUpdateKanji() {
  return useMutation<Kanji, Error, { id: number; data: Partial<{ character: string; onyomi: string; kunyomi: string; korean: string; wrongCount: number; manualWeak: boolean }> }>({
    mutationFn: async ({ id, data }) => {
      const res = await api.put(`/kanji/${id}`, data);
      return res.data;
    },
  });
}

export function useDeleteKanji() {
  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await api.delete(`/kanji/${id}`);
    },
  });
}

export function useRecordKanjiWrong() {
  return useMutation<Kanji, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await api.post(`/kanji/${id}/wrong`);
      return res.data;
    },
  });
}

export function useRecordKanjiEasy() {
  return useMutation<Kanji, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await api.post(`/kanji/${id}/easy`);
      return res.data;
    },
  });
}

export function useMarkKanjiStudied() {
  return useMutation<Kanji, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await api.post(`/kanji/${id}/studied`);
      return res.data;
    },
  });
}

// ─── Grammar ───────────────────────────────────────────────────────────────────

export function useListGrammar(
  params?: { dateFilter?: "today" | "recent" | "all" },
  options?: Partial<UseQueryOptions<Grammar[]>>
) {
  return useQuery<Grammar[]>({
    queryKey: getListGrammarQueryKey(params),
    queryFn: async () => {
      const { data } = await api.get("/grammar", { params });
      return data;
    },
    ...options,
  });
}

export function useCreateGrammar() {
  return useMutation<Grammar, Error, { data: { pattern: string; meaning: string; formation?: string; example?: string; exampleKorean?: string; exampleHighlight?: string | null; jlptLevel?: string | null } }>({
    mutationFn: async ({ data }) => {
      const res = await api.post("/grammar", data);
      return res.data;
    },
  });
}

export function useUpdateGrammar() {
  return useMutation<Grammar, Error, { id: number; data: Partial<{ pattern: string; meaning: string; formation: string; example: string; exampleKorean: string; exampleHighlight: string | null; jlptLevel: string | null }> }>({
    mutationFn: async ({ id, data }) => {
      const res = await api.put(`/grammar/${id}`, data);
      return res.data;
    },
  });
}

export function useDeleteGrammar() {
  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => { await api.delete(`/grammar/${id}`); },
  });
}

export function useRecordGrammarWrong() {
  return useMutation<Grammar, Error, { id: number }>({
    mutationFn: async ({ id }) => (await api.post(`/grammar/${id}/wrong`)).data,
  });
}

export function useRecordGrammarEasy() {
  return useMutation<Grammar, Error, { id: number }>({
    mutationFn: async ({ id }) => (await api.post(`/grammar/${id}/easy`)).data,
  });
}

export function useMarkGrammarStudied() {
  return useMutation<Grammar, Error, { id: number }>({
    mutationFn: async ({ id }) => (await api.post(`/grammar/${id}/studied`)).data,
  });
}

export function useLookupGrammar() {
  return useMutation<GrammarDetail, Error, { pattern: string }>({
    mutationFn: async ({ pattern }) => (await api.post("/grammar/lookup", { pattern })).data,
  });
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

export function useGetStatsSummary(options?: Partial<UseQueryOptions<StatsSummary>>) {
  return useQuery<StatsSummary>({
    queryKey: getGetStatsSummaryQueryKey(),
    queryFn: async () => {
      const { data } = await api.get("/stats/summary");
      return data;
    },
    ...options,
  });
}

export function useGetWeakItems(options?: Partial<UseQueryOptions<WeakItems>>) {
  return useQuery<WeakItems>({
    queryKey: getGetWeakItemsQueryKey(),
    queryFn: async () => {
      const { data } = await api.get("/stats/weak");
      return data;
    },
    ...options,
  });
}

// ─── Activity (학습 통계) ────────────────────────────────────────────────────────

export interface ActivityStats {
  todayCount: number;
  weekCount: number;
  totalCount: number;
  currentStreak: number;
  bestStreak: number;
  heatmap: { date: string; count: number }[];
}

export function useGetActivity(options?: Partial<UseQueryOptions<ActivityStats>>) {
  return useQuery<ActivityStats>({
    queryKey: getGetActivityQueryKey(),
    queryFn: async () => {
      const { data } = await api.get("/stats/activity");
      return data;
    },
    ...options,
  });
}

export function useRecordActivity() {
  return useMutation<void, Error, { count?: number }>({
    mutationFn: async ({ count = 1 }) => {
      await api.post("/stats/activity", { count });
    },
  });
}

// ─── TTS ───────────────────────────────────────────────────────────────────────

export function useSpeakJapanese() {
  const ctxRef = { current: null as AudioContext | null };

  // lang: "ja" (기본) 또는 "ko". 재생이 끝나면 resolve되어 순차 재생에 사용 가능.
  return async (text: string, lang: "ja" | "ko" = "ja"): Promise<void> => {
    const res = await api.post<{ audioContent: string }>("/tts", { text, lang });
    if (ctxRef.current) ctxRef.current.close();
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const binary = atob(res.data.audioContent);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    return new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start(0);
    });
  };
}

// ─── Study Session ─────────────────────────────────────────────────────────────

export function useGetStudySession(options?: { query?: Partial<UseQueryOptions<StudySessionResponse>> }) {
  return useQuery<StudySessionResponse>({
    queryKey: getGetStudySessionQueryKey(),
    queryFn: async () => {
      const { data } = await api.get("/study-session");
      return data;
    },
    ...options?.query,
  });
}

export function useSaveStudySession() {
  return useMutation<StudySessionResponse, Error, { data: StudySessionItem }>({
    mutationFn: async ({ data }) => {
      const res = await api.put("/study-session", data);
      return res.data;
    },
  });
}

export function useClearStudySession() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await api.delete("/study-session");
    },
  });
}
