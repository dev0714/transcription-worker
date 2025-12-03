import OpenAI from "openai";
import fetch from "node-fetch";
import FormData from "form-data";

export const config = {
  runtime: "nodejs",   // ✅ FIXED — the only valid Node runtime
  maxDuration: 60
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

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // -------------------------------
    // 1. DOWNLOAD AUDIO STREAM
    // -------------------------------
    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      return res.status(400).json({ error: "Failed to fetch audio" });
    }

    // Wrap stream in FormData (OpenAI Whisper requires filename)
    const formData = new FormData();
    formData.append("file", audioResponse.body, {
      filename: "audio.wav",
      contentType: "audio/wav"
    });
    formData.append("model", "gpt-4o-transcribe");
    formData.append("prompt", process.env.SA_TRANSCRIBE_PROMPT);
    formData.append("temperature", "0");

    // -------------------------------
    // 2. RAW TRANSCRIPTION
    // -------------------------------
    const rawResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    const rawJson = await rawResp.json();

    if (!rawJson.text) {
      return res.status(500).json({
        error: "Whisper failed",
        details: rawJson
      });
    }

    const rawText = rawJson.text;

    // -------------------------------
    // 3. CLEAN / TRANSLATE / DIARIZE
    // -------------------------------
    const cleanResp = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: process.env.FULL_UNIVERSAL_PROMPT },
        { role: "user", content: rawText }
      ],
      temperature: 0
    });

    const cleanText = cleanResp.choices[0].message.content;

    return res.status(200).json({
      success: true,
      raw_transcript: rawText,
      clean_transcript: cleanText
    });

  } catch (error) {
    console.error("❌ Vercel Function Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
