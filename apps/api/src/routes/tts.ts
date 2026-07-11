import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/tts", async (req, res): Promise<void> => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "TTS not configured" });
    return;
  }

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ja-JP", name: "ja-JP-Neural2-B" },
        audioConfig: { audioEncoding: "MP3" },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    res.status(502).json({ error: err });
    return;
  }

  const data = await response.json() as { audioContent: string };
  res.json({ audioContent: data.audioContent });
});

export default router;
