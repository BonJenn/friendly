import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { TTSProvider, TTSResult, VoiceId } from '../types.js';

export class ElevenLabsTTSProvider implements TTSProvider {
  private client: ElevenLabsClient;

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey });
  }

  async synthesize(text: string, voiceId: VoiceId): Promise<TTSResult> {
    const stream = await this.client.textToSpeech.convert(voiceId, {
      text,
      modelId: 'eleven_turbo_v2_5',
      outputFormat: 'mp3_44100_128',
    });

    // Collect async iterable into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);

    // Estimate duration from file size at 128kbps
    const durationSeconds = (audioBuffer.length * 8) / (128 * 1000);

    return {
      audioBuffer,
      durationSeconds,
      mimeType: 'audio/mpeg',
    };
  }
}
