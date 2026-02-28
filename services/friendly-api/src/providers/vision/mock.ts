import type { VisionProvider, VisionAnalysisResult } from '../types.js';

const CANNED_ANALYSES: VisionAnalysisResult[] = [
  {
    description: 'A person sitting indoors, looks like a cozy room with warm lighting',
    objects: ['person', 'room', 'lamp'],
    mood: 'relaxed',
  },
  {
    description: 'Someone outside on a sunny day, trees and blue sky in the background',
    objects: ['person', 'trees', 'sky'],
    mood: 'cheerful',
  },
  {
    description: 'A pet — looks like a dog or cat — being held up to the camera',
    objects: ['pet', 'hands'],
    mood: 'playful',
  },
  {
    description: 'A meal or snack on a table, looks tasty',
    objects: ['food', 'plate', 'table'],
    mood: 'neutral',
  },
  {
    description: 'A workspace with a laptop and some clutter on the desk',
    objects: ['laptop', 'desk', 'mug'],
    mood: 'focused',
  },
  {
    description: 'The user making a funny face at the camera, smiling wide',
    objects: ['person', 'smile'],
    mood: 'amused',
  },
];

/**
 * Mock Vision provider for development.
 * Returns rotating canned scene descriptions.
 *
 * To swap in a real provider (e.g., GPT-4 Vision, Claude Vision):
 * 1. Create a new file implementing VisionProvider
 * 2. Send the base64 frame to the vision model API
 * 3. Update the provider registry
 */
export class MockVisionProvider implements VisionProvider {
  private index = 0;

  async analyzeFrame(imageBase64: string, context: string): Promise<VisionAnalysisResult> {
    // Simulate vision API latency
    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = CANNED_ANALYSES[this.index % CANNED_ANALYSES.length];
    this.index++;
    return result;
  }
}
