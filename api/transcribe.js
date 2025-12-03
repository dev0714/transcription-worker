import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST allowed" });
    }

    const { audioUrl } = req.body;
    if (!audioUrl) return res.status(400).json({ error: "audioUrl is required" });

    // ---------- DOWNLOAD ORIGINAL AUDIO ----------
    const audioResponse = await fetch(audioUrl, { redirect: "follow" });
    const originalBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // ---------- INIT FFMPEG ----------
    const ffmpeg = createFFmpeg({ log: false });
    await ffmpeg.load();

    // ---------- WRITE INPUT ----------
    ffmpeg.FS("writeFile", "input.wav", await fetchFile(originalBuffer));

    // ---------- CONVERT TO CLEAN PCM WAV ----------
    await ffmpeg.run(
      "-i", "input.wav",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      "output.wav"
    );

    const converted = ffmpeg.FS("readFile", "output.wav");

    const audioFile = new File([converted.buffer], "audio.wav", {
      type: "audio/wav",
    });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ---------- TRANSCRIBE ----------
    const transcribed = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file: audioFile,
      prompt: process.env.SA_TRANSCRIBE_PROMPT,
      temperature: 0,
    });

    const rawText = transcribed.text;

    const cleaned = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: process.env.FULL_UNIVERSAL_PROMPT },
        { role: "user", content: rawText }
      ],
      temperature: 0
    });

    const cleanText = cleaned.choices[0].message.content;

    return res.status(200).json({
      success: true,
      audioUrl,
      raw_transcript: rawText,
      clean_transcript: cleanText
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
