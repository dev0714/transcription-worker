import OpenAI from "openai";

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

    // Download from Supabase signed URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return res.status(400).json({ error: "Failed to download audio" });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    const audioFile = new File([arrayBuffer], "audio.wav", {
      type: "audio/wav",
    });

    // --------- RAW TRANSCRIPTION ---------
    const transcribed = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file: audioFile,
      prompt: process.env.SA_TRANSCRIBE_PROMPT,
      temperature: 0,
    });

    const rawText = transcribed.text;

    // --------- CLEAN + TRANSLATE ---------
    const cleaned = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: process.env.FULL_UNIVERSAL_PROMPT },
        { role: "user", content: rawText }
      ],
      temperature: 0
    });

    const cleanText = cleaned.choices[0].message.content;

    // --------- RETURN TO SUPABASE ---------
    return res.status(200).json({
      success: true,
      raw_transcript: rawText,
      clean_transcript: cleanText,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
