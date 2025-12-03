import OpenAI from "openai";

export const config = {
  runtime: "nodejs18.x",      // Ensure Node runtime, not Edge
  maxDuration: 60             // Allow up to 60 seconds
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST allowed" });
    }

    const { audioUrl } = req.body;
    if (!audioUrl) {
      return res.status(400).json({ error: "audioUrl is required" });
    }

    // -------------------------
    // INIT OPENAI
    // -------------------------
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // -------------------------
    // STREAM AUDIO FROM SUPABASE (NO buffer)
    // -------------------------
    const response = await fetch(audioUrl);

    if (!response.ok) {
      return res.status(400).json({ error: "Could not fetch audio file" });
    }

    const audioStream = response.body; // STREAM, NOT FILE

    // -------------------------
    // STAGE 1 — RAW ASR
    // -------------------------
    const rawTranscription = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file: audioStream, // STREAMED
      prompt: process.env.SA_TRANSCRIBE_PROMPT,
      temperature: 0
    });

    const rawText = rawTranscription.text || "";

    // -------------------------
    // STAGE 2 — CLEAN / TRANSLATE / DIARIZE
    // -------------------------
    const cleaned = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: process.env.FULL_UNIVERSAL_PROMPT },
        { role: "user", content: rawText }
      ],
      temperature: 0
    });

    const cleanText = cleaned.choices[0].message.content;

    // -------------------------
    // RETURN RESULT
    // -------------------------
    res.status(200).json({
      success: true,
      raw_transcript: rawText,
      clean_transcript: cleanText
    });

  } catch (error) {
    console.error("❌ Vercel function error:", error);
    res.status(500).json({ error: error.message });
  }
}
