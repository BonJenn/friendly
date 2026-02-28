import OpenAI from 'openai';
import type { VisionProvider, VisionAnalysisResult } from '../types.js';

export class GPT4VisionProvider implements VisionProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async analyzeFrame(
    imageBase64: string,
    context: string
  ): Promise<VisionAnalysisResult> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are analyzing a video frame from a friend's camera during a conversation. The user just said: "${context}"

Describe what you see briefly and naturally. Respond with JSON:
{
  "description": "short natural description of the scene",
  "objects": ["object1", "object2"],
  "mood": "the general mood/vibe of the scene"
}`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 256,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { description: 'Unable to analyze image', objects: [] };
    }

    return {
      description:
        typeof parsed.description === 'string'
          ? parsed.description
          : 'Unable to analyze image',
      objects: Array.isArray(parsed.objects)
        ? parsed.objects.filter((o): o is string => typeof o === 'string')
        : [],
      mood: typeof parsed.mood === 'string' ? parsed.mood : undefined,
    };
  }
}
