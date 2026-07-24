import { getAnthropic } from "./anthropic";

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

// 단어/한자 하나의 JLPT 급수를 판별. 실패하거나 API 키가 없으면 null (카드 생성은 막지 않음)
export async function classifyJlptLevel(type: "word" | "kanji", text: string): Promise<string | null> {
  const c = getAnthropic();
  if (!c || !text) return null;

  const prompt = type === "word"
    ? `일본어 단어 "${text}"의 JLPT 급수를 판단해줘. N5(가장 쉬움)~N1(가장 어려움) 중 하나, 확실하지 않으면 "N1"로.
JSON만 반환: {"level": "N3"}`
    : `일본어 한자 "${text}"의 JLPT 급수를 판단해줘. N5(가장 쉬움)~N1(가장 어려움) 중 하나, 확실하지 않으면 "N1"로.
JSON만 반환: {"level": "N3"}`;

  try {
    const message = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 32,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const match = raw.match(/N[1-5]/);
    return match && LEVELS.includes(match[0]) ? match[0] : null;
  } catch {
    return null;
  }
}
