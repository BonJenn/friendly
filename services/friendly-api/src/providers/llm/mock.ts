import type { LLMProvider, LLMMessage, LLMResponseStructured, ModelTier } from '../types.js';
import type { Emotion } from '../../types/index.js';

/**
 * Mock LLM provider for development.
 * Returns contextually varied but canned responses.
 *
 * To swap in a real provider (e.g., OpenAI, Anthropic):
 * 1. Create a new file implementing LLMProvider
 * 2. Parse the structured JSON from the model's response
 * 3. Update the provider registry
 */
export class MockLLMProvider implements LLMProvider {
  private turnCount = 0;

  private readonly responses: Array<{
    text: string;
    emotion: Emotion;
    intensity: number;
  }> = [
    { text: "Haha, yeah I totally get that. What else is going on?", emotion: 'amused', intensity: 0.6 },
    { text: "Wait, for real? Tell me more about that.", emotion: 'curious', intensity: 0.7 },
    { text: "That's actually awesome, I'm happy for you!", emotion: 'hyped', intensity: 0.8 },
    { text: "Hmm, I hear you. That sounds like a lot.", emotion: 'caring', intensity: 0.6 },
    { text: "Lol okay okay, fair enough.", emotion: 'amused', intensity: 0.4 },
    { text: "You know what, that reminds me of something...", emotion: 'curious', intensity: 0.5 },
    { text: "Honestly? I think you should just go for it.", emotion: 'hyped', intensity: 0.7 },
    { text: "Yeah, take your time with that though. No rush.", emotion: 'calm', intensity: 0.3 },
  ];

  async chat(
    messages: LLMMessage[],
    modelTier: ModelTier
  ): Promise<LLMResponseStructured> {
    // Simulate latency based on model tier
    const delay = modelTier === 'large' ? 1500 : 800;
    await new Promise((resolve) => setTimeout(resolve, delay));

    this.turnCount++;
    const response = this.responses[this.turnCount % this.responses.length];

    // Occasionally end the session naturally (every ~8 turns)
    const shouldEnd = this.turnCount > 0 && this.turnCount % 8 === 0;

    if (shouldEnd) {
      return {
        text: "Hey I gotta run actually, but this was fun. I'll hit you up later!",
        emotion: 'caring',
        intensity: 0.5,
        shouldEndSession: true,
        followUpDelayMinutes: 30 + Math.floor(Math.random() * 60),
        followUpText: "Hey! How'd the rest of your day go?",
        shouldGenerateImage: false,
      };
    }

    return {
      text: response.text,
      emotion: response.emotion,
      intensity: response.intensity,
      shouldEndSession: false,
      followUpDelayMinutes: null,
      followUpText: null,
      shouldGenerateImage: false,
    };
  }
}
