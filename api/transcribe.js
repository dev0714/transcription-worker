import OpenAI from "openai";

export const config = {
  runtime: "nodejs",
  maxDuration: 50,  // optional but useful
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

    console.log("📥 Downloading audio:", audioUrl);

    // ---- DOWNLOAD FROM SUPABASE STORAGE ----
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return res.status(400).json({
        error: "Failed to download audio",
        status: audioResponse.status,
      });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create File object for OpenAI
    const audioFile = new File([buffer], "audio.wav", {
      type: "audio/wav",
    });

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("🎤 Sending to OpenAI diarization model...");

    // ---- FIXED: diarization requires chunking_strategy ----
    const result = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe-diarize",
      file: audioFile,
      chunking_strategy: "auto", // REQUIRED
      temperature: 0
    });

    console.log("✅ Received transcript");

    return res.status(200).json({
      success: true,
      transcript: result.text,
      speakers: result.speakers ?? null,
      raw: result
    });

  } catch (error) {
    console.error("❌ Vercel Transcription Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
