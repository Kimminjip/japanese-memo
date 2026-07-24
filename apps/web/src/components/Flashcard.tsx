import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Star, Pencil, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

const WEAK_THRESHOLD = 3;

interface FlashcardProps {
  type: "word" | "kanji" | "grammar";
  japanese: string;
  furigana?: string | null;
  korean?: string;
  onyomi?: string;
  kunyomi?: string;
  // grammar 전용
  formation?: string;
  example?: string;
  exampleKorean?: string;
  exampleHighlight?: string | null;
  wrongCount?: number;
  manualWeak?: boolean;
  jlptLevel?: string | null;
  isFlipped?: boolean;
  onFlip?: () => void;
  onToggleWeak?: () => void;
  onEdit?: () => void;
  onSpeak?: () => void;
}

// 예문에서 highlight 영역 전체에 밑줄, 그 안에서 문형(pattern) 부분만 굵게
function renderHighlighted(example: string, highlight?: string | null, pattern?: string) {
  if (!highlight || !example.includes(highlight)) return example;
  const idx = example.indexOf(highlight);
  const before = example.slice(0, idx);
  const after = example.slice(idx + highlight.length);
  const underlineCls = "underline decoration-primary decoration-2 underline-offset-4";

  // 문형에서 물결(〜/～/~) 등 장식 제거 → 핵심 표현
  const core = (pattern ?? "").replace(/[〜～~\s]/g, "").trim();
  let inner: ReactNode;
  if (core && highlight.includes(core)) {
    const ci = highlight.indexOf(core);
    inner = (
      <span className={underlineCls}>
        {highlight.slice(0, ci)}
        <span className="font-bold">{core}</span>
        {highlight.slice(ci + core.length)}
      </span>
    );
  } else {
    inner = <span className={cn(underlineCls, "font-bold")}>{highlight}</span>;
  }
  return <>{before}{inner}{after}</>;
}

function splitLines(value: string | undefined): string[] {
  if (!value) return [];
  return value.split("\n").map(s => s.trim()).filter(Boolean);
}

function getWordBackFontClass(text: string): string {
  const len = text.length;
  if (len <= 4)  return "text-2xl sm:text-3xl lg:text-4xl";
  if (len <= 8)  return "text-xl sm:text-2xl lg:text-3xl";
  if (len <= 14) return "text-lg sm:text-xl lg:text-2xl";
  if (len <= 20) return "text-base sm:text-lg lg:text-xl";
  return "text-sm sm:text-base lg:text-lg";
}

export function Flashcard({
  type,
  japanese,
  furigana,
  korean,
  onyomi,
  kunyomi,
  formation,
  example,
  exampleKorean,
  exampleHighlight,
  wrongCount,
  manualWeak,
  jlptLevel,
  isFlipped: isFlippedProp,
  onFlip,
  onToggleWeak,
  onEdit,
  onSpeak,
}: FlashcardProps) {
  const [isFlippedInternal, setIsFlippedInternal] = useState(false);
  const isControlled = isFlippedProp !== undefined;
  const isFlipped = isControlled ? isFlippedProp : isFlippedInternal;

  // 플립 애니메이션 중간(250ms)에 높이 제한을 전환해 앞·뒷면 크기를 다르게 유지
  const [showingBack, setShowingBack] = useState(false);
  useEffect(() => {
    if (!isFlipped) {
      setShowingBack(false);
      return;
    }
    const t = setTimeout(() => setShowingBack(true), 250);
    return () => clearTimeout(t);
  }, [isFlipped]);

  const doFlip = useCallback(() => {
    if (isControlled) {
      (onFlip ?? (() => {}))();
    } else {
      setIsFlippedInternal(f => !f);
    }
  }, [isControlled, onFlip]);

  const koreanLines = splitLines(korean);
  const onyomiLines = splitLines(onyomi);
  const kunyomiLines = splitLines(kunyomi);
  const hasKanjiKorean = type === "kanji" && korean && korean.trim().length > 0;
  const isWeak = manualWeak || (wrongCount !== undefined && wrongCount >= WEAK_THRESHOLD);

  return (
    <div
      className="w-full cursor-pointer perspective-1000 relative group/card"
      onClick={doFlip}
      data-testid="flashcard"
    >
      {/* Edit button — top-right next to star, hidden until hover */}
      {onEdit && (
        <button
          className="absolute top-2 right-10 z-20 p-1.5 rounded-full opacity-0 hover:opacity-100 transition-all duration-200 text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(); }}
          title="수정"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}

      {/* Star toggle button — hovers in top-right, doesn't flip card */}
      {onToggleWeak && (
        <button
          className={cn(
            "absolute top-2 right-2 z-20 p-1.5 rounded-full transition-all duration-200",
            isWeak
              ? "opacity-100"
              : "opacity-0 hover:opacity-100"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWeak();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onToggleWeak(); }}
          title={isWeak ? "취약 항목 해제" : "취약 항목으로 등록"}
        >
          <Star
            className={cn(
              "h-5 w-5 transition-colors",
              isWeak
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/50 hover:text-amber-400 hover:fill-amber-200"
            )}
          />
        </button>
      )}

      {/* 높이 클리핑 래퍼: 앞면일 때 고정 높이로 클리핑, 뒷면일 때 해제 */}
      <div className={cn("w-full overflow-hidden", showingBack ? "" : "h-52 sm:h-60 lg:h-72")}>
      {/* Flip container — grid trick: 두 면이 같은 셀 차지, 높이=max(앞,뒤) */}
      <div
        style={{ display: "grid" }}
        className={cn(
          "w-full transform-style-3d transition-transform duration-500 ease-out",
          isFlipped ? "rotate-y-180" : ""
        )}
      >
        {/* Front — 항상 고정 높이 (뒷면 길이와 무관) */}
        <div style={{ gridArea: "1/1" }} className="bg-card rounded-xl border shadow-sm backface-hidden flex flex-col items-center justify-center p-6 text-center h-52 sm:h-60 lg:h-72 relative">
          {jlptLevel && (
            <span className="absolute top-3 left-3 text-xs font-medium text-muted-foreground/60">
              {jlptLevel}
            </span>
          )}
          {onSpeak && (
            <button
              className="absolute bottom-2 left-2 z-20 p-1.5 rounded-full opacity-0 group-hover/card:opacity-100 transition-all duration-200 text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
              onClick={(e) => { e.stopPropagation(); onSpeak(); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onSpeak(); }}
              title="발음 듣기"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          )}
          {/* Show wrongCount badge only when not using star toggle and count > 0 */}
          {!onToggleWeak && wrongCount !== undefined && wrongCount > 0 && (
            isWeak ? (
              <Star className="absolute top-3 right-3 h-4 w-4 fill-amber-400 text-amber-400" />
            ) : (
              <div className="absolute top-3 right-3 flex items-center justify-center w-6 h-6 rounded-full bg-destructive/10 text-destructive text-xs font-bold">
                {wrongCount}
              </div>
            )
          )}
          <div className="flex flex-col items-center gap-1">
            {type === "word" && (
              <span className="font-serif text-muted-foreground text-sm lg:text-base font-medium h-5 lg:h-6">
                {furigana || " "}
              </span>
            )}
            <span
              className={cn(
                "font-serif font-medium text-foreground break-keep px-2",
                type === "word"
                  ? "text-4xl sm:text-5xl lg:text-7xl"
                  : type === "grammar"
                  ? "text-3xl sm:text-4xl lg:text-5xl"
                  : "text-6xl sm:text-7xl lg:text-9xl"
              )}
            >
              {japanese}
            </span>
          </div>
        </div>

        {/* Back — 내용에 따라 자유롭게 확장 */}
        <div style={{ gridArea: "1/1" }} className="bg-card rounded-xl border border-primary/20 shadow-md backface-hidden rotate-y-180 flex flex-col items-center justify-center p-6 text-center min-h-52 sm:min-h-60 lg:min-h-72">
          {type === "grammar" ? (
            <div className="flex flex-col gap-3 w-full px-2 text-left">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">의미</span>
                <span className="text-xl sm:text-2xl font-medium text-foreground break-keep">{korean || "-"}</span>
              </div>
              {formation && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">접속</span>
                  <span className="font-serif text-base sm:text-lg text-foreground break-keep">{formation}</span>
                </div>
              )}
              {example && (
                <div className="flex flex-col gap-0.5 pt-1 border-t border-border/50 w-full">
                  <span className="font-serif text-lg sm:text-xl text-foreground leading-relaxed break-words whitespace-normal">
                    {renderHighlighted(example, exampleHighlight, japanese)}
                  </span>
                  {exampleKorean && (
                    <span className="text-sm text-muted-foreground break-words whitespace-normal">{exampleKorean}</span>
                  )}
                </div>
              )}
            </div>
          ) : type === "word" ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              {koreanLines.length > 1 ? (() => {
                const longest = koreanLines.reduce((a, b) => a.length >= b.length ? a : b, "");
                const fontClass = getWordBackFontClass(longest);
                return koreanLines.map((line, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground font-semibold w-4 shrink-0">{i + 1}.</span>
                    <span className={cn(fontClass, "font-medium text-foreground break-keep")}>{line}</span>
                  </div>
                ));
              })() : (
                <span className={cn(getWordBackFontClass(koreanLines[0] || ""), "font-medium text-foreground break-keep")}>
                  {koreanLines[0] || "-"}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-full px-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">음독</span>
                {onyomiLines.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {onyomiLines.map((line, i) => (
                      <span key={i} className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium">{line}</span>
                    ))}
                  </div>
                ) : (
                  <span className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium">-</span>
                )}
              </div>
              <div className="w-full h-px bg-border/50" />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">훈독</span>
                {kunyomiLines.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {kunyomiLines.map((line, i) => (
                      <span key={i} className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium">{line}</span>
                    ))}
                  </div>
                ) : (
                  <span className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium">-</span>
                )}
              </div>
              {hasKanjiKorean && (
                <>
                  <div className="w-full h-px bg-border/50" />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">한국어 뜻음</span>
                    <span className="text-xl sm:text-2xl lg:text-3xl font-medium text-foreground break-keep">{korean}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      </div>{/* 클리핑 래퍼 닫힘 */}
    </div>
  );
}
