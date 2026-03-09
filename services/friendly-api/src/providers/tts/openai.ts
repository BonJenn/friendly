import OpenAI from 'openai';
import type { TTSProvider, TTSResult, VoiceId } from '../types.js';

export class OpenAITTSProvider implements TTSProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async synthesize(text: string, voiceId: VoiceId): Promise<TTSResult> {
    const response = await this.client.audio.speech.create({
      model: 'tts-1',
      voice: voiceId as 'alloy' | 'nova' | 'onyx' | 'echo' | 'fable' | 'shimmer',
      input: text,
      response_format: 'mp3',
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Estimate duration from file size at 128kbps (MP3 default)
    const durationSeconds = (audioBuffer.length * 8) / (128 * 1000);

    return {
      audioBuffer,
      durationSeconds,
      mimeType: 'audio/mpeg',
    };
  }
}
