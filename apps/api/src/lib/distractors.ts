import { getAnthropic } from "./anthropic";

function splitLines(s: string): string[] {
  return s.split("\n").map(l => l.trim()).filter(Boolean);
}

function parseArray(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]);
    if (Array.isArray(obj.distractors)) {
      return obj.distractors.map((x: unknown) => String(x).trim()).filter(Boolean);
    }
  } catch { /* ignore */ }
  return [];
}

// 퀴즈용 "그럴듯한 오답 보기" 3개 생성. 실패 시 빈 배열 (퀴즈는 무작위 오답으로 폴백).
export async function generateWordDistractors(japanese: string, korean: string): Promise<string[]> {
  const c = getAnthropic();
  if (!c || !japanese) return [];

  const correct = splitLines(korean).join(", ");
  const prompt = `일본어 단어 "${japanese}" (정답 뜻: ${correct})의 한국어 뜻 객관식 문제를 만들려고 해.
학습자가 헷갈릴 만한 "그럴듯하지만 틀린 한국어 뜻" 오답 보기 3개를 만들어줘.
- 정답 뜻과 의미가 비슷하거나 같은 분야의 단어로, 하지만 명확히 틀린 것
- 정답 뜻(${correct})과 겹치지 않게
- 각 보기는 짧은 단어/구 (정답과 형식이 비슷하게)
JSON만 반환: {"distractors": ["오답1", "오답2", "오답3"]}`;

  try {
    const message = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 128,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const correctSet = new Set(splitLines(korean));
    return parseArray(raw).filter(d => !correctSet.has(d)).slice(0, 3);
  } catch {
    return [];
  }
}

export async function generateKanjiDistractors(character: string, onyomi: string, kunyomi: string): Promise<string[]> {
  const c = getAnthropic();
  if (!c || !character) return [];

  const readings = [...splitLines(onyomi), ...splitLines(kunyomi)].join(", ");
  const prompt = `일본어 한자 "${character}"의 읽기(요미가나) 객관식 문제를 만들려고 해. (실제 읽기: ${readings})
학습자가 헷갈릴 만한 "실제로는 이 한자의 읽기가 아니지만 그럴듯한 읽기" 오답 보기 3개를 히라가나로 만들어줘.
- 실제 읽기(${readings})와 겹치지 않게
- 진짜 일본어 읽기처럼 자연스러운 형태로
JSON만 반환: {"distractors": ["よみ1", "よみ2", "よみ3"]}`;

  try {
    const message = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 128,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const realSet = new Set([...splitLines(onyomi), ...splitLines(kunyomi)]);
    return parseArray(raw).filter(d => !realSet.has(d)).slice(0, 3);
  } catch {
    return [];
  }
}
