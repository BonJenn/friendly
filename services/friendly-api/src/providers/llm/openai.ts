import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMMessage,
  LLMResponseStructured,
  ModelTier,
} from '../types.js';
import type { Emotion } from '../../types/index.js';

const MODEL_MAP: Record<ModelTier, string> = {
  large: 'gpt-4o',
  small: 'gpt-4o-mini',
};

const VALID_EMOTIONS: Set<string> = new Set([
  'amused',
  'caring',
  'serious',
  'hyped',
  'curious',
  'calm',
]);

export class OpenAILLMProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(
    messages: LLMMessage[],
    modelTier: ModelTier
  ): Promise<LLMResponseStructured> {
    const response = await this.client.chat.completions.create({
      model: MODEL_MAP[modelTier],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      response_format: { type: 'json_object' },
      temperature: 0.9,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        text: raw,
        emotion: 'calm',
        intensity: 0.5,
        shouldEndSession: false,
        followUpDelayMinutes: null,
        followUpText: null,
        shouldGenerateImage: false,
      };
    }

    // Dual-mode: detect conversation responses vs utility responses
    const isConversation =
      typeof parsed.emotion === 'string' &&
      typeof parsed.shouldEndSession === 'boolean';

    if (!isConversation) {
      // Utility response (summarization, proactive, etc.)
      // Put the raw JSON back in .text so callers can JSON.parse(result.text)
      return {
        text: raw,
        emotion: 'calm',
        intensity: 0.5,
        shouldEndSession: false,
        followUpDelayMinutes: null,
        followUpText: null,
        shouldGenerateImage: false,
      };
    }

    // Conversation response — validate and extract fields
    const emotion = VALID_EMOTIONS.has(parsed.emotion as string)
      ? (parsed.emotion as Emotion)
      : 'calm';

    const intensity = typeof parsed.intensity === 'number'
      ? Math.min(1, Math.max(0, parsed.intensity))
      : 0.5;

    return {
      text: typeof parsed.text === 'string' ? parsed.text : raw,
      emotion,
      intensity,
      shouldEndSession: parsed.shouldEndSession === true,
      followUpDelayMinutes:
        typeof parsed.followUpDelayMinutes === 'number'
          ? parsed.followUpDelayMinutes
          : null,
      followUpText:
        typeof parsed.followUpText === 'string'
          ? parsed.followUpText
          : null,
      shouldGenerateImage: parsed.shouldGenerateImage === true,
    };
  }
}
