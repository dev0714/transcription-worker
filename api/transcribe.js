import OpenAI from "openai";

export const config = {
  runtime: "nodejs18.x",
  maxDuration: 800,
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

    // 1) Download audio file from Supabase
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return res.status(400).json({ error: "Failed to download audio" });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const audioFile = new File([buffer], "audio.wav", {
      type: "audio/wav",
    });

    // 2) Init OpenAI
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 3) DIRECT diarized transcription (1 step)
    const response = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe-diarize",
      file: audioFile,
      // You don't need stage 1 or stage 2 prompts here
      temperature: 0,
    });

    // 4) Return output
    return res.status(200).json({
      success: true,
      transcript: response.text,
      speakers: response.speakers ?? null,
    });

  } catch (error) {
    console.error("Vercel Transcription Error:", error);
    res.status(500).json({ error: error.message });
  }
}
