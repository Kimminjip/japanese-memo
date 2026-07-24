import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

// ANTHROPIC_API_KEY가 없으면 null 반환 (호출부에서 기능을 건너뜀)
export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}
