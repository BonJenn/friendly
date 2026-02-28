import OpenAI from 'openai';
import type { ImageProvider, ImageResult } from '../types.js';

export class DallEImageProvider implements ImageProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(prompt: string, style?: string): Promise<ImageResult> {
    const fullPrompt = style
      ? `Style: ${style}. ${prompt}`
      : prompt;

    const response = await this.client.images.generate({
      model: 'dall-e-3',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'b64_json',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('DALL-E returned no image data');
    }

    return {
      imageBuffer: Buffer.from(b64, 'base64'),
      mimeType: 'image/png',
    };
  }
}
