import type { TTSProvider, TTSResult, VoiceId } from '../types.js';

/**
 * Mock TTS provider for development.
 * Returns a silent audio buffer of appropriate duration.
 *
 * To swap in a real provider (e.g., ElevenLabs, Google TTS, OpenAI TTS):
 * 1. Create a new file implementing TTSProvider
 * 2. Map VoiceId to provider-specific voice identifiers
 * 3. Update the provider registry
 */
export class MockTTSProvider implements TTSProvider {
  async synthesize(text: string, voiceId: VoiceId): Promise<TTSResult> {
    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Rough estimate: ~150ms per word for speech
    const wordCount = text.split(/\s+/).length;
    const durationSeconds = (wordCount * 150) / 1000;

    // Create a minimal WAV header + silence (PCM 16-bit, 16kHz, mono)
    const sampleRate = 16000;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataSize = numSamples * 2; // 16-bit
    const buffer = Buffer.alloc(44 + dataSize);

    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // chunk size
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    // PCM data is all zeros (silence)

    return {
      audioBuffer: buffer,
      durationSeconds,
      mimeType: 'audio/wav',
    };
  }
}
