import OpenAI from "openai";
import fetch from "node-fetch";
import FormData from "form-data";

export const config = {
  runtime: "nodejs18.x",
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

    // ------------------------------------------------
    // DOWNLOAD AUDIO STREAM
    // ------------------------------------------------
    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      return res.status(400).json({ error: "Failed to fetch audio" });
    }

    // Convert stream → FormData (OpenAI requires filename)
    const formData = new FormData();
    formData.append("file", audioResponse.body, {
      filename: "call.wav",
      contentType: "audio/wav"
    });
    formData.append("model", "gpt-4o-transcribe");
    formData.append("prompt", process.env.SA_TRANSCRIBE_PROMPT);
    formData.append("temperature", "0");

    // ------------------------------------------------
    // STAGE 1: RAW TRANSCRIPTION
    // ------------------------------------------------
    const rawResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    const rawJson = await rawResp.json();

    if (!rawJson.text) {
      return res.status(500).json({ error: "Whisper failed", details: rawJson });
    }

    const rawText = rawJson.text;

    // ------------------------------------------------
    // STAGE 2: CLEAN / TRANSLATE / DIARIZE
    // ------------------------------------------------
    const cleaned = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: process.env.FULL_UNIVERSAL_PROMPT },
        { role: "user", content: rawText }
      ],
      temperature: 0
    });

    return res.status(200).json({
      success: true,
      raw_transcript: rawText,
      clean_transcript: cleaned.choices[0].message.content
    });

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
