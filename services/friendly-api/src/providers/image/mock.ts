import type { ImageProvider, ImageResult } from '../types.js';

/**
 * Mock Image provider for development.
 * Returns a 1x1 purple pixel PNG.
 *
 * To swap in a real provider (e.g., DALL-E, Stable Diffusion):
 * 1. Create a new file implementing ImageProvider
 * 2. Map style to provider-specific parameters
 * 3. Update the provider registry
 */
export class MockImageProvider implements ImageProvider {
  async generate(prompt: string, style?: string): Promise<ImageResult> {
    // Simulate image generation time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Minimal 1x1 PNG (purple pixel) as placeholder
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    return {
      imageBuffer: pngBuffer,
      mimeType: 'image/png',
    };
  }
}
