import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

router.post("/ai/lookup", async (req, res): Promise<void> => {
  const { type, text, korean } = req.body;
  if (!["word", "kanji"].includes(type) || (!text && !korean)) {
    res.status(400).json({ error: "type(word|kanji) and text or korean are required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "AI not configured" });
    return;
  }

  const client = new Anthropic({ apiKey });

  let prompt = "";

  if (type === "word") {
    if (text) {
      prompt = `일본어 단어 "${text}"의 정보를 JSON으로 반환해줘.
형식: {"furigana": "히라가나 읽기", "korean": ["뜻1", "뜻2"]}
- furigana: 히라가나로만 (한자 없이)
- korean: 한국어 뜻 배열 (핵심 뜻 1~3개, 간결하게)
JSON만 반환, 설명 없이.`;
    } else {
      prompt = `한국어 뜻 "${korean}"에 해당하는 대표 일본어 단어를 JSON으로 반환해줘.
형식: {"japanese": "일본어 단어", "furigana": "히라가나 읽기", "korean": ["뜻1"]}
- japanese: 한자 포함 일본어 단어
- furigana: 히라가나로만
- korean: 한국어 뜻 배열 (간결하게)
JSON만 반환, 설명 없이.`;
    }
  } else {
    if (text) {
      prompt = `일본어 한자 "${text}"의 정보를 JSON으로 반환해줘.
형식: {"onyomi": ["おんよみ1", "おんよみ2"], "kunyomi": ["訓読み1", "訓読み2"], "korean": "한국어 뜻음"}
- onyomi: 음독. 반드시 히라가나로만 표기 (가타카나 금지)
- kunyomi: 훈독(히라가나, 오쿠리가나 포함), 배열
- korean: 한국 한자 교육 방식의 뜻음. 반드시 "~할/~하는/~인 + 한자 한국어 음독" 형태로. 예시: 水→"물 수", 山→"뫼 산", 檢→"검사할 검", 學→"배울 학", 火→"불 화"
JSON만 반환, 설명 없이.`;
    } else {
      prompt = `한국어 뜻음 "${korean}"에 해당하는 대표 일본어 한자를 JSON으로 반환해줘.
형식: {"character": "한자", "onyomi": ["おんよみ1"], "kunyomi": ["訓読み1"], "korean": "한국어 뜻음"}
- character: 한자 1글자
- onyomi: 음독. 반드시 히라가나로만 표기 (가타카나 금지)
- kunyomi: 훈독(히라가나), 배열
- korean: 한국어 뜻음 한 줄
JSON만 반환, 설명 없이.`;
    }
  }

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    res.status(502).json({ error: "AI 응답 파싱 실패" });
    return;
  }

  res.json(JSON.parse(jsonMatch[0]));
});

export default router;
