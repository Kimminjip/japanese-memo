import { getAnthropic } from "./anthropic";

export interface GrammarDetail {
  pattern: string;
  meaning: string;
  formation: string;
  example: string;
  exampleKorean: string;
  exampleHighlight: string;
  jlptLevel: string;
}

function parseJson(raw: string): any {
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// exampleHighlight가 실제 example의 부분 문자열이 아니면 비움 (밑줄 오작동 방지)
function sanitize(d: any, fallbackLevel?: string): GrammarDetail | null {
  if (!d || typeof d.pattern !== "string" || !d.pattern.trim()) return null;
  const example = String(d.example ?? "").trim();
  let highlight = String(d.exampleHighlight ?? d.highlight ?? "").trim();
  if (highlight && example && !example.includes(highlight)) highlight = "";
  const level = String(d.jlptLevel ?? d.level ?? fallbackLevel ?? "").trim().toUpperCase();
  return {
    pattern: d.pattern.trim(),
    meaning: String(d.meaning ?? "").trim(),
    formation: String(d.formation ?? "").trim(),
    example,
    exampleKorean: String(d.exampleKorean ?? d.example_korean ?? "").trim(),
    exampleHighlight: highlight,
    jlptLevel: /^N[1-5]$/.test(level) ? level : (fallbackLevel ?? ""),
  };
}

// 문형 하나의 상세 정보 생성 (개별 추가 시 AI 자동입력)
export async function generateGrammarDetail(pattern: string): Promise<GrammarDetail | null> {
  const c = getAnthropic();
  if (!c || !pattern) return null;
  const prompt = `일본어 문법 문형 "${pattern}"에 대한 학습 카드 정보를 JSON으로 만들어줘.
형식: {"pattern":"${pattern}","meaning":"한국어 의미","formation":"접속(활용) 규칙","example":"일본어 예문","exampleKorean":"예문 한국어 해석","exampleHighlight":"예문에서 이 문형에 해당하는 부분 문자열","jlptLevel":"N5|N4|N3|N2|N1"}
- meaning: 한국어로 간결하게
- formation: 예) "동사 た형 + ばかり"
- example: 짧고 쉬운 예문 1개
- exampleHighlight: 반드시 example 안에 그대로 들어있는 부분 문자열 (그 문형 표현만)
JSON만 반환.`;
  try {
    const msg = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    return sanitize(parseJson(raw));
  } catch {
    return null;
  }
}

// 한 급수의 문형 목록을 상세 정보와 함께 일괄 생성 (세트 시딩). avoid: 이미 생성된 패턴들(중복 방지)
export async function generateGrammarBatch(level: string, avoid: string[]): Promise<GrammarDetail[]> {
  const c = getAnthropic();
  if (!c) return [];
  const avoidStr = avoid.length ? `\n이미 만든 문형이니 제외: ${avoid.join(", ")}` : "";
  const prompt = `JLPT ${level} 시험에 나오는 대표 일본어 문법 문형들을 학습 카드용으로 만들어줘.
가능한 한 많이(최대 40개), 중복 없이.${avoidStr}
각 항목 형식: {"pattern":"문형","meaning":"한국어 의미","formation":"접속 규칙","example":"일본어 예문","exampleKorean":"해석","exampleHighlight":"예문 속 문형 부분 문자열","jlptLevel":"${level}"}
- exampleHighlight는 반드시 example 안에 그대로 존재하는 부분 문자열
JSON 배열만 반환: [ ... ]`;
  try {
    const msg = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const arr = parseJson(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((d) => sanitize(d, level)).filter((x): x is GrammarDetail => x !== null && x.meaning.length > 0);
  } catch {
    return [];
  }
}
