import { getAnthropic } from "./anthropic";

export interface GrammarReview {
  highlight: string;   // 예문 속 문형 부분(내용어 제외)만, 예문의 부분 문자열
  canonical: string;   // 중복 판단용 표준 식별자 (활용/정중형 무시)
  rank: number;        // 같은 급수 내 기초 난이도 (1=가장 기초)
  level: string;       // N5~N1
}

function parseJson(raw: string): any {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function reviewGrammarCard(pattern: string, example: string, level: string | null): Promise<GrammarReview | null> {
  const c = getAnthropic();
  if (!c) return null;

  const prompt = `일본어 문법 카드를 재검토해줘.
문형: "${pattern}"
예문: "${example}"
현재 급수: ${level ?? "미상"}

다음을 JSON으로 반환:
{"highlight":"...","canonical":"...","rank":1,"level":"N5"}
- highlight: 예문에서 "이 문형에 해당하는 부분만" 정확히 추출. 앞에 붙는 명사·동사 어간 등 '내용어'는 절대 포함하지 말고, 문형 표현과 그 활용/조사만. 반드시 예문에 그대로 존재하는 연속된 부분 문자열이어야 함. 예: 예문 "本を読み始めた", 문형 "〜始める" → "始めた" (읽다의 "読み"는 제외). 예문에 해당 부분이 없으면 "".
- canonical: 이 문법의 표준 사전형 식별자(히라가나, 정중형·활용형 차이 무시). 같은 문법이면 반드시 같은 값. 예: 始める/始めます/始めた → "はじめる", 〜たばかり → "たばかり".
- rank: 같은 급수 안에서의 기초 난이도 정수. 1=가장 기초적/빈출, 클수록 어렵거나 덜 쓰임.
- level: 이 문형의 적절한 JLPT 급수 (N5=가장 쉬움 ~ N1). 정중형/기초형일수록 쉬운 급수로.
JSON만 반환.`;

  try {
    const msg = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const d = parseJson(raw);
    if (!d) return null;
    let highlight = String(d.highlight ?? "").trim();
    if (highlight && example && !example.includes(highlight)) highlight = "";
    const lv = String(d.level ?? "").trim().toUpperCase();
    return {
      highlight,
      canonical: String(d.canonical ?? "").trim(),
      rank: Number.isFinite(d.rank) ? Math.max(1, Math.round(d.rank)) : 50,
      level: /^N[1-5]$/.test(lv) ? lv : (level ?? "N3"),
    };
  } catch {
    return null;
  }
}
