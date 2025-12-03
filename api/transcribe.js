import OpenAI from "openai";

export const config = {
  runtime: "nodejs", // not edge, not nodejs18.x
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

    // ---------------------------
    // 1. Download audio file
    // ---------------------------
    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      return res.status(400).json({ error: "Failed to fetch audio file" });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    const audioFile = new File([arrayBuffer], "audio.wav", {
      type: "audio/wav"
    });

    // ---------------------------
    // 2. RAW Transcription
    // ---------------------------
    const raw = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file: audioFile,
      prompt: process.env.SA_TRANSCRIBE_PROMPT,
      //response_format: "verbose_json",
      chunking_strategy: "auto",          // <—— REQUIRED for long calls
      enable_diarization: true,           // optional but recommended
      temperature: 0
    });

    const rawText = raw.text;

    // ---------------------------
    // 3. Clean + Translate + Diarize
    // ---------------------------
    const cleaned = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: process.env.FULL_UNIVERSAL_PROMPT },
        { role: "user", content: rawText }
      ],
      temperature: 0
    });

    const cleanText = cleaned.choices[0].message.content;

    // ---------------------------
    // 4. Return both outputs
    // ---------------------------
    return res.status(200).json({
      success: true,
      raw_transcript: rawText,
      clean_transcript: cleanText
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}
