import { useCallback, useMemo, useState } from "react";
import { Check, ChevronRight, Headphones, RefreshCcw, Sparkles, Volume2, X } from "lucide-react";
import { useSpeakJapanese, stopSpeaking } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type Kana = { h: string; k: string; ko: string; romaji: string };
type QuizMode = "mixed" | "similar";
type ReadingStyle = "ko" | "romaji";
type QuestionType = "h-reading" | "k-reading" | "sound-h" | "sound-k" | "pair-hk" | "pair-kh";
type Question = { id: number; type: QuestionType; item: Kana; prompt: string; instruction: string; answer: string; options: string[]; confusing: boolean };

const RAW = [
  ["あ","ア","아","a"],["い","イ","이","i"],["う","ウ","우","u"],["え","エ","에","e"],["お","オ","오","o"],
  ["か","カ","카","ka"],["き","キ","키","ki"],["く","ク","쿠","ku"],["け","ケ","케","ke"],["こ","コ","코","ko"],
  ["さ","サ","사","sa"],["し","シ","시","shi"],["す","ス","스","su"],["せ","セ","세","se"],["そ","ソ","소","so"],
  ["た","タ","타","ta"],["ち","チ","치","chi"],["つ","ツ","쓰","tsu"],["て","テ","테","te"],["と","ト","토","to"],
  ["な","ナ","나","na"],["に","ニ","니","ni"],["ぬ","ヌ","누","nu"],["ね","ネ","네","ne"],["の","ノ","노","no"],
  ["は","ハ","하","ha"],["ひ","ヒ","히","hi"],["ふ","フ","후","fu"],["へ","ヘ","헤","he"],["ほ","ホ","호","ho"],
  ["ま","マ","마","ma"],["み","ミ","미","mi"],["む","ム","무","mu"],["め","メ","메","me"],["も","モ","모","mo"],
  ["や","ヤ","야","ya"],["ゆ","ユ","유","yu"],["よ","ヨ","요","yo"],
  ["ら","ラ","라","ra"],["り","リ","리","ri"],["る","ル","루","ru"],["れ","レ","레","re"],["ろ","ロ","로","ro"],
  ["わ","ワ","와","wa"],["を","ヲ","오","wo"],["ん","ン","응","n"],
] as const;
const KANA: Kana[] = RAW.map(([h,k,ko,romaji]) => ({ h,k,ko,romaji }));

export const HIRAGANA_CONFUSIONS = [
  ["あ","お"],["い","り"],["き","さ"],["さ","ち"],["こ","に"],["そ","て"],
  ["ぬ","め","ね"],["ね","れ","わ"],["は","ほ","ま"],["る","ろ"],
];
export const KATAKANA_CONFUSIONS = [
  ["シ","ツ"],["ソ","ン"],["ク","ケ"],["ウ","ワ","フ"],["ス","ヌ"],
  ["コ","ユ","ロ"],["チ","テ"],["ナ","メ"],["マ","ム"],["セ","ヒ"],
];
const byH = new Map(KANA.map(v => [v.h,v]));
const byK = new Map(KANA.map(v => [v.k,v]));
const confusing = KANA.filter(v => HIRAGANA_CONFUSIONS.some(g => g.includes(v.h)) || KATAKANA_CONFUSIONS.some(g => g.includes(v.k)));
const shuffle = <T,>(a:T[]) => [...a].sort(() => Math.random()-.5);
const pick = <T,>(a:T[]) => a[Math.floor(Math.random()*a.length)];

function related(item:Kana,type:QuestionType) {
  const useH = type === "h-reading" || type === "sound-h" || type === "pair-hk";
  const glyph = useH ? item.h : item.k;
  const groups = useH ? HIRAGANA_CONFUSIONS : KATAKANA_CONFUSIONS;
  const map = useH ? byH : byK;
  return [...new Map(groups.filter(g=>g.includes(glyph)).flatMap(g=>g.filter(x=>x!==glyph)).map(x=>map.get(x)).filter((v):v is Kana=>!!v).map(v=>[v.h,v])).values()];
}

function makeQuestion(id:number,mode:QuizMode,style:ReadingStyle):Question {
  const type=pick<QuestionType>(["h-reading","k-reading","sound-h","sound-k","pair-hk","pair-kh"]);
  const item=pick(mode === "similar" || Math.random()<.65 ? confusing : KANA);
  const mates=related(item,type);
  const read=(v:Kana)=>style === "ko" ? v.ko : v.romaji;
  const value=(v:Kana)=>type === "h-reading" || type === "k-reading" ? read(v) : type === "sound-h" || type === "pair-kh" ? v.h : v.k;
  const answer=value(item), options=new Set([answer]);
  for(const v of shuffle(mates)){if(options.size>=3)break;options.add(value(v));}
  for(const v of shuffle(KANA)){if(options.size>=4)break;options.add(value(v));}
  const sound=type === "sound-h" || type === "sound-k";
  return { id,type,item,answer,options:shuffle([...options]),confusing:mates.length>0,
    prompt:sound?"？":type === "k-reading" || type === "pair-kh"?item.k:item.h,
    instruction:sound?`소리를 듣고 ${type === "sound-h"?"히라가나":"가타카나"}를 고르세요`:type === "pair-hk"?"같은 소리의 가타카나를 고르세요":type === "pair-kh"?"같은 소리의 히라가나를 고르세요":`${type === "h-reading"?"히라가나":"가타카나"}의 독음을 고르세요` };
}

export default function KanaQuiz(){
  const [screen,setScreen]=useState<"setup"|"playing"|"results">("setup");
  const [mode,setMode]=useState<QuizMode>("mixed");
  const [style,setStyle]=useState<ReadingStyle>("ko");
  const [count,setCount]=useState("20");
  const [questions,setQuestions]=useState<Question[]>([]);
  const [index,setIndex]=useState(0);
  const [selected,setSelected]=useState<string|null>(null);
  const [score,setScore]=useState(0);
  const [wrong,setWrong]=useState<Question[]>([]);
  const speakJapanese=useSpeakJapanese();
  const q=questions[index];
  const isSound=q?.type === "sound-h" || q?.type === "sound-k";
  const label=(v:Kana)=>`${v.ko} · ${v.romaji}`;
  const speak=useCallback((v:Kana)=>{stopSpeaking();void speakJapanese(v.h,"ja");},[speakJapanese]);
  const start=()=>{stopSpeaking();const list=Array.from({length:Number(count)},(_,i)=>makeQuestion(i,mode,style));setQuestions(list);setIndex(0);setSelected(null);setScore(0);setWrong([]);setScreen("playing");if(list[0]&&(list[0].type==="sound-h"||list[0].type==="sound-k"))speak(list[0].item);};
  const choose=(option:string)=>{if(selected)return;setSelected(option);if(option===q.answer)setScore(v=>v+1);else setWrong(v=>[...v,q]);if(!isSound)speak(q.item);};
  const next=()=>{stopSpeaking();if(index>=questions.length-1){setScreen("results");return;}const nq=questions[index+1];setIndex(v=>v+1);setSelected(null);if(nq.type==="sound-h"||nq.type==="sound-k")speak(nq.item);};
  const progress=useMemo(()=>questions.length?(index+1)/questions.length*100:0,[index,questions.length]);

  if(screen==="setup")return <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
    <div><h1 className="text-3xl font-bold tracking-tight">히라가나·가타카나 퀴즈</h1><p className="text-muted-foreground mt-1">비슷하게 생긴 글자를 집중적으로 구별해보세요.</p></div>
    <Card className="border-primary/20 shadow-md"><CardHeader><CardTitle>퀴즈 설정</CardTitle></CardHeader><CardContent className="space-y-7">
      <div className="space-y-3"><Label className="text-base font-semibold">학습 방식</Label><RadioGroup value={mode} onValueChange={v=>setMode(v as QuizMode)} className="grid sm:grid-cols-2 gap-3">
        <Label htmlFor="mixed" className={cn("rounded-xl border p-4 cursor-pointer",mode==="mixed"&&"border-primary bg-primary/5")}><span className="flex items-center gap-2"><RadioGroupItem id="mixed" value="mixed"/><b>종합 연습</b></span><small className="block mt-2 ml-6 text-muted-foreground">독음·듣기·짝 맞추기를 혼합</small></Label>
        <Label htmlFor="similar" className={cn("rounded-xl border p-4 cursor-pointer",mode==="similar"&&"border-primary bg-primary/5")}><span className="flex items-center gap-2"><RadioGroupItem id="similar" value="similar"/><b>비슷한 글자 집중</b></span><small className="block mt-2 ml-6 text-muted-foreground">ぬ·め·ね, シ·ツ, ソ·ン 집중</small></Label>
      </RadioGroup></div>
      <div className="space-y-3"><Label className="text-base font-semibold">독음 표기</Label><div className="grid grid-cols-2 rounded-lg bg-muted p-1"><button onClick={()=>setStyle("ko")} className={cn("rounded-md py-2 text-sm font-medium",style==="ko"&&"bg-background shadow-sm text-primary")}>한글 (기본)</button><button onClick={()=>setStyle("romaji")} className={cn("rounded-md py-2 text-sm font-medium",style==="romaji"&&"bg-background shadow-sm text-primary")}>로마자</button></div><p className="text-xs text-muted-foreground">정답 후에는 한글과 로마자를 함께 표시합니다.</p></div>
      <div className="space-y-3"><Label className="text-base font-semibold">문제 수</Label><RadioGroup value={count} onValueChange={setCount} className="flex flex-wrap gap-4">{["10","20","30","50"].map(v=><Label key={v} htmlFor={`c${v}`} className="flex items-center gap-2 cursor-pointer"><RadioGroupItem id={`c${v}`} value={v}/>{v}문제</Label>)}</RadioGroup></div>
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900"><b className="flex items-center gap-2"><Sparkles className="h-4 w-4"/>혼동 방지 출제</b><p className="mt-1 text-xs">비슷한 글자는 더 자주 나오며, 보기에도 반드시 헷갈리는 글자가 포함됩니다.</p></div>
    </CardContent><CardFooter><Button onClick={start} size="lg" className="w-full h-14 text-lg">퀴즈 시작</Button></CardFooter></Card>
  </div>;

  if(screen==="results")return <div className="max-w-2xl mx-auto space-y-6 text-center animate-in fade-in"><div className="py-6"><h1 className="text-3xl font-bold">퀴즈 완료!</h1><div className="mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-full border-4 border-primary bg-primary/10 text-4xl font-bold text-primary">{score}/{questions.length}</div></div>{wrong.length>0&&<Card className="text-left"><CardHeader><CardTitle className="text-lg">헷갈린 글자 다시 보기</CardTitle></CardHeader><CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">{wrong.map((x,i)=><div key={`${x.id}-${i}`} className="rounded-lg border bg-muted/30 p-3 text-center"><div className="font-serif text-3xl font-bold">{x.item.h} · {x.item.k}</div><div className="mt-1 text-sm">{label(x.item)}</div></div>)}</CardContent></Card>}<div className="grid grid-cols-2 gap-3"><Button variant="outline" onClick={()=>setScreen("setup")}>설정으로</Button><Button onClick={start} className="gap-2"><RefreshCcw className="h-4 w-4"/>다시 풀기</Button></div></div>;

  return <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in"><div className="flex justify-between text-sm text-muted-foreground"><span>{index+1} / {questions.length}</span><span>정답 {score}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{width:`${progress}%`}}/></div><Card className="border-primary/20 shadow-lg"><CardContent className="p-5 sm:p-8"><div className="text-center"><div className="flex h-8 justify-center gap-2 text-sm font-medium text-muted-foreground">{isSound&&<Headphones className="h-4 w-4"/>}{q.instruction}</div><button className="mx-auto mt-5 flex min-h-40 w-full items-center justify-center rounded-2xl bg-muted/30 font-serif text-7xl sm:text-8xl font-bold" onClick={()=>speak(q.item)}>{q.prompt}</button>{isSound&&<Button variant="ghost" className="mt-2 gap-2" onClick={()=>speak(q.item)}><Volume2 className="h-5 w-5"/>다시 듣기</Button>}</div><div className="mt-7 grid grid-cols-2 gap-3">{q.options.map(o=>{const answered=selected!==null,correct=o===q.answer,chosen=o===selected;return <Button key={o} variant="outline" disabled={answered} onClick={()=>choose(o)} className={cn("h-16 font-serif text-2xl sm:text-3xl",answered&&correct&&"border-green-500 bg-green-50 text-green-700",answered&&chosen&&!correct&&"border-destructive bg-destructive/10 text-destructive")}>{o}{answered&&correct&&<Check className="ml-2 h-5 w-5"/>}{answered&&chosen&&!correct&&<X className="ml-2 h-5 w-5"/>}</Button>})}</div>{selected&&<div className={cn("mt-5 rounded-xl p-4 text-center",selected===q.answer?"bg-green-50 text-green-800":"bg-red-50 text-red-800")}><b>{selected===q.answer?"정답입니다":`정답: ${q.answer}`}</b><div className="mt-1 font-serif text-lg">{q.item.h} · {q.item.k} · {label(q.item)}</div>{q.confusing&&<div className="mt-1 text-xs opacity-75">비슷한 글자 집중 항목</div>}</div>}</CardContent>{selected&&<CardFooter className="p-5 pt-0 sm:px-8 sm:pb-8"><Button onClick={next} size="lg" className="w-full h-12 gap-2">{index===questions.length-1?"결과 보기":"다음 문제"}<ChevronRight className="h-5 w-5"/></Button></CardFooter>}</Card></div>;
}
