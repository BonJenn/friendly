import type { Emotion, Persona } from '../types/index.js';

// ─── STT Provider ───────────────────────────────────────────
export interface STTResult {
  text: string;
  durationSeconds: number;
  language?: string;
}

export interface STTProvider {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<STTResult>;
}

// ─── LLM Provider ───────────────────────────────────────────
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponseStructured {
  text: string;
  emotion: Emotion;
  intensity: number;
  shouldEndSession: boolean;
  followUpDelayMinutes: number | null;
  followUpText: string | null;
  shouldGenerateImage: boolean;
}

export type ModelTier = 'small' | 'large';

export interface LLMProvider {
  chat(
    messages: LLMMessage[],
    modelTier: ModelTier
  ): Promise<LLMResponseStructured>;
}

// ─── TTS Provider ───────────────────────────────────────────
export interface TTSResult {
  audioBuffer: Buffer;
  durationSeconds: number;
  mimeType: string;
}

export type VoiceId = string;

export interface TTSProvider {
  synthesize(text: string, voiceId: VoiceId): Promise<TTSResult>;
}

// ─── Image Provider ─────────────────────────────────────────
export interface ImageResult {
  imageBuffer: Buffer;
  mimeType: string;
}

export interface ImageProvider {
  generate(prompt: string, style?: string): Promise<ImageResult>;
}

// ─── Provider Registry ──────────────────────────────────────
export interface ProviderRegistry {
  stt: STTProvider;
  llm: LLMProvider;
  tts: TTSProvider;
  image: ImageProvider;
}
