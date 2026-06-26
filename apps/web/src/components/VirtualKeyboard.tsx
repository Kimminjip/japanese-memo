import { useState, Fragment, useRef, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { X, Delete } from "lucide-react";

interface VirtualKeyboardProps {
  onInput: (char: string) => void;
  onBackspace: () => void;
  onClose: () => void;
}

const HIRAGANA_BASIC = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["さ", "し", "す", "せ", "そ"],
  ["た", "ち", "つ", "て", "と"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ま", "み", "む", "め", "も"],
  ["や", "", "ゆ", "", "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", "", "を", "", "ん"],
  ["っ", "ー", "ゃ", "ゅ", "ょ"],
  ["ぁ", "ぃ", "ぅ", "ぇ", "ぉ"],
];

const HIRAGANA_DAKUTEN = [
  ["が", "ぎ", "ぐ", "げ", "ご"],
  ["ざ", "じ", "ず", "ぜ", "ぞ"],
  ["だ", "ぢ", "づ", "で", "ど"],
  ["ば", "び", "ぶ", "べ", "ぼ"],
  ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
];

const KATAKANA_BASIC = [
  ["ア", "イ", "ウ", "エ", "オ"],
  ["カ", "キ", "ク", "ケ", "コ"],
  ["サ", "シ", "ス", "セ", "ソ"],
  ["タ", "チ", "ツ", "テ", "ト"],
  ["ナ", "ニ", "ヌ", "ネ", "ノ"],
  ["ハ", "ヒ", "フ", "ヘ", "ホ"],
  ["マ", "ミ", "ム", "メ", "モ"],
  ["ヤ", "", "ユ", "", "ヨ"],
  ["ラ", "リ", "ル", "レ", "ロ"],
  ["ワ", "", "ヲ", "", "ン"],
  ["ッ", "ー", "ャ", "ュ", "ョ"],
  ["ァ", "ィ", "ゥ", "ェ", "ォ"],
];

const KATAKANA_DAKUTEN = [
  ["ガ", "ギ", "グ", "ゲ", "ゴ"],
  ["ザ", "ジ", "ズ", "ゼ", "ゾ"],
  ["ダ", "ヂ", "ヅ", "デ", "ド"],
  ["バ", "ビ", "ブ", "ベ", "ボ"],
  ["パ", "ピ", "プ", "ペ", "ポ"],
];

const SECTION_LABELS_H = ["が행", "ざ행", "だ행", "ば행", "ぱ행"];
const SECTION_LABELS_K = ["ガ행", "ザ행", "ダ행", "バ행", "パ행"];

export function VirtualKeyboard({ onInput, onBackspace, onClose }: VirtualKeyboardProps) {
  const [showDakuten, setShowDakuten] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const scroll = scrollRef.current;
    if (!root || !scroll) return;

    // Prevent Radix dialog from treating keyboard clicks as "outside" interaction
    const blockPointer = (e: PointerEvent) => e.stopImmediatePropagation();
    root.addEventListener("pointerdown", blockPointer, { capture: true });

    // Prevent Radix scroll-lock from blocking touch scroll inside keyboard
    const blockTouchMove = (e: TouchEvent) => e.stopImmediatePropagation();
    scroll.addEventListener("touchstart", blockTouchMove, { capture: true });
    scroll.addEventListener("touchmove", blockTouchMove, { capture: true, passive: false });

    return () => {
      root.removeEventListener("pointerdown", blockPointer, { capture: true });
      scroll.removeEventListener("touchstart", blockTouchMove, { capture: true });
      scroll.removeEventListener("touchmove", blockTouchMove, { capture: true });
    };
  }, []);

  const renderGrid = (grid: string[][], labels?: string[]) => (
    <div className="grid grid-cols-5 gap-1.5 p-2">
      {grid.map((row, i) => (
        <Fragment key={i}>
          {labels && (
            <div className="col-span-5 text-[10px] text-muted-foreground px-1 pt-1 -mb-0.5">
              {labels[i]}
            </div>
          )}
          {row.map((char, j) => (
            <Button
              key={`${i}-${j}`}
              variant={char ? "outline" : "ghost"}
              className="h-10 text-lg font-serif p-0"
              disabled={!char}
              onMouseDown={e => e.preventDefault()}
              onTouchEnd={e => { e.preventDefault(); if (char) onInput(char); }}
              onClick={() => { if (char) onInput(char); }}
            >
              {char}
            </Button>
          ))}
        </Fragment>
      ))}
    </div>
  );

  return (
    <div ref={rootRef} data-keyboard-portal="true" className="fixed bottom-0 left-0 right-0 md:left-auto md:right-8 md:bottom-8 md:w-[400px] bg-card border shadow-xl md:rounded-xl overflow-hidden z-[200] animate-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between p-2 border-b bg-muted/50">
        <div className="flex items-center gap-2 ml-2">
          <span className="text-sm font-medium text-muted-foreground">일본어 키보드</span>
          <button
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${showDakuten ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setShowDakuten(v => !v)}
          >
            탁음/반탁음
          </button>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
            onMouseDown={e => e.preventDefault()} onClick={onBackspace}>
            <Delete className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Tabs defaultValue="hiragana" className="w-full">
        <TabsList className="w-full rounded-none border-b h-12">
          <TabsTrigger value="hiragana" className="flex-1">ひらがな</TabsTrigger>
          <TabsTrigger value="katakana" className="flex-1">カタカナ</TabsTrigger>
        </TabsList>
        <div
          ref={scrollRef}
          className="overflow-y-auto max-h-56 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto"
          style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
        >
          <TabsContent value="hiragana" className="m-0 bg-background/50">
            {showDakuten
              ? renderGrid(HIRAGANA_DAKUTEN, SECTION_LABELS_H)
              : renderGrid(HIRAGANA_BASIC)}
          </TabsContent>
          <TabsContent value="katakana" className="m-0 bg-background/50">
            {showDakuten
              ? renderGrid(KATAKANA_DAKUTEN, SECTION_LABELS_K)
              : renderGrid(KATAKANA_BASIC)}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
