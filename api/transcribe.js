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
      apiKey: process.env.OPENAI_API_KEY,
    });

    // -----------------------------------------------------
    // 1) Download binary audio CORRECTLY (Vercel fix)
    // -----------------------------------------------------
    const audioResponse = await fetch(audioUrl, {
      method: "GET",
      headers: {
        "Range": "bytes=0-", // <--- forces full WAV download
      }
    });

    if (!audioResponse.ok) {
      return res.status(500).json({
        error: "Failed to download audio: " + (await audioResponse.text())
      });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // -----------------------------------------------------
    // 2) Whisper transcription using Buffer (NOT File)
    // -----------------------------------------------------
    const transcription = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file: {
        buffer,
        name: "audio.wav",
        type: "audio/wav"
      },
      prompt: process.env.SA_TRANSCRIBE_PROMPT,
      temperature: 0
    });

    const rawText = transcription.text;

    // -----------------------------------------------------
    // 3) Clean + translate + diarize
    // -----------------------------------------------------
    const cleaned = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: process.env.FULL_UNIVERSAL_PROMPT },
        { role: "user", content: rawText }
      ],
      temperature: 0
    });

    const cleanText = cleaned.choices[0].message.content;

    // -----------------------------------------------------
    // 4) Return correct result
    // -----------------------------------------------------
    return res.status(200).json({
      success: true,
      raw_transcript: rawText,
      clean_transcript: cleanText
    });

  } catch (error) {
    console.error("TRANSCRIBE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
}
