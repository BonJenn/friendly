import type { STTProvider, STTResult } from '../types.js';

/**
 * Mock STT provider for development.
 * Returns a fixed transcription for any audio input.
 *
 * To swap in a real provider (e.g., Whisper, Deepgram, Google STT):
 * 1. Create a new file implementing STTProvider
 * 2. Update the provider registry in providers/index.ts
 */
export class MockSTTProvider implements STTProvider {
  private readonly mockResponses = [
    "Hey, what's up? How's your day going?",
    "I've been thinking about that thing we talked about yesterday.",
    "You know what would be really cool?",
    "I'm feeling pretty good today, thanks for asking.",
    "Tell me something interesting.",
    "What do you think about that?",
    "Ha, that's actually really funny.",
    "I appreciate you being there for me.",
  ];

  private responseIndex = 0;

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<STTResult> {
    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 500));

    const text = this.mockResponses[this.responseIndex % this.mockResponses.length];
    this.responseIndex++;

    // Estimate duration from buffer size (rough approximation)
    const estimatedDuration = Math.max(1, audioBuffer.length / 16000);

    return {
      text,
      durationSeconds: estimatedDuration,
      language: 'en',
    };
  }
}
