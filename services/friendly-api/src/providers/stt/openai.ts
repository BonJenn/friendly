import OpenAI, { toFile } from 'openai';
import type { STTProvider, STTResult } from '../types.js';

const MIME_TO_EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4',
  'audio/flac': 'flac',
  'audio/x-m4a': 'm4a',
};

export class WhisperSTTProvider implements STTProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<STTResult> {
    const ext = MIME_TO_EXT[mimeType] ?? 'wav';
    const file = await toFile(audioBuffer, `audio.${ext}`);

    const response = await this.client.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
    });

    return {
      text: response.text,
      durationSeconds: response.duration ?? audioBuffer.length / 32000,
      language: response.language ?? undefined,
    };
  }
}
