import { getAnthropic } from "./anthropic";

// 최소 CSV 파서 (따옴표 안의 쉼표/개행 처리)
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export interface ImportItem { japanese: string; reading: string; english: string }
export interface Translated { japanese: string; korean: string; level: string }

function parseJsonArray(raw: string): any[] | null {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : null; } catch { return null; }
}

// 한 묶음(최대 ~25개) 번역 + 급수 판정. japanese로 매칭해 정렬 오류 방지.
export async function translateBatch(items: ImportItem[]): Promise<Map<string, { korean: string; level: string }>> {
  const out = new Map<string, { korean: string; level: string }>();
  const c = getAnthropic();
  if (!c || items.length === 0) return out;

  const list = items.map((it, i) => `${i + 1}. ${it.japanese} / ${it.reading} / ${it.english}`).join("\n");
  const prompt = `아래 일본어 단어들의 "한국어 뜻"과 "JLPT 급수"를 판정해줘.
각 줄 형식: 일본어 / 읽기 / 영어뜻
- korean: 자연스러운 한국어 뜻. 뜻이 여러 개면 쉼표로 (간결하게, 1~3개).
- level: 이 단어의 JLPT 급수 (N5=가장 쉬움 ~ N1).
반드시 각 항목마다 일본어 원문을 그대로 넣어서 JSON 배열로만 반환:
[{"japanese":"会う","korean":"만나다","level":"N5"}, ...]

${list}`;

  try {
    const msg = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const arr = parseJsonArray(raw);
    if (!arr) return out;
    for (const d of arr) {
      const jp = String(d?.japanese ?? "").trim();
      const ko = String(d?.korean ?? "").trim();
      const lv = String(d?.level ?? "").trim().toUpperCase();
      if (jp && ko) out.set(jp, { korean: ko, level: /^N[1-5]$/.test(lv) ? lv : "N3" });
    }
  } catch { /* ignore */ }
  return out;
}
