import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMMessage,
  LLMResponseStructured,
  LLMClassification,
  AudioChatResult,
  AudioStreamChunk,
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

  async *chatStreamText(
    messages: LLMMessage[]
  ): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.9,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async classifyResponse(text: string): Promise<LLMClassification> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classify the following friend response. Return JSON:
{"emotion":"amused|caring|serious|hyped|curious|calm","intensity":0.0-1.0,"shouldEndSession":false,"followUpDelayMinutes":null,"followUpText":null}
- Set shouldEndSession true if the friend is saying goodbye/ending the conversation.
- If ending, set followUpDelayMinutes (15-120) and followUpText.
- JSON only, no other text.`,
        },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        emotion: 'calm',
        intensity: 0.5,
        shouldEndSession: false,
        followUpDelayMinutes: null,
        followUpText: null,
      };
    }

    const emotion = VALID_EMOTIONS.has(parsed.emotion as string)
      ? (parsed.emotion as Emotion)
      : 'calm';

    const intensity =
      typeof parsed.intensity === 'number'
        ? Math.min(1, Math.max(0, parsed.intensity))
        : 0.5;

    return {
      emotion,
      intensity,
      shouldEndSession: parsed.shouldEndSession === true,
      followUpDelayMinutes:
        typeof parsed.followUpDelayMinutes === 'number'
          ? parsed.followUpDelayMinutes
          : null,
      followUpText:
        typeof parsed.followUpText === 'string' ? parsed.followUpText : null,
    };
  }

  async chatAudio(
    systemPrompt: string,
    contextMessages: LLMMessage[],
    userAudioBase64: string,
    audioFormat: string,
    voice: string
  ): Promise<AudioChatResult> {
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: userAudioBase64,
              format: audioFormat,
            },
          },
        ],
      },
    ];

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-audio-preview',
      modalities: ['text', 'audio'],
      audio: { voice: voice as any, format: 'mp3' },
      messages,
      temperature: 0.9,
    });

    const choice = response.choices[0]?.message;
    const audioData = (choice as any).audio?.data ?? '';
    const transcript = (choice as any).audio?.transcript ?? choice?.content ?? '';

    return {
      audioBase64: audioData,
      transcript,
    };
  }

  async *chatAudioStream(
    systemPrompt: string,
    contextMessages: LLMMessage[],
    userAudioBase64: string,
    audioFormat: string,
    voice: string
  ): AsyncGenerator<AudioStreamChunk, string, unknown> {
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: userAudioBase64,
              format: audioFormat,
            },
          },
        ],
      },
    ];

    const stream = await this.client.chat.completions.create({
      model: 'gpt-4o-audio-preview',
      modalities: ['text', 'audio'],
      audio: { voice: voice as any, format: 'pcm16' },
      messages,
      temperature: 0.9,
      stream: true,
    });

    // First chunk is small (~1.5s) for fast time-to-first-audio.
    // Subsequent chunks are larger (~3s) so they arrive while the
    // previous chunk is still playing, enabling gapless pre-loading.
    const FIRST_CHUNK_BYTES = 72000;  // ~1.5s at 24kHz/16-bit/mono
    const NEXT_CHUNK_BYTES = 144000;  // ~3s
    let pcmBuffer = Buffer.alloc(0);
    let transcript = '';
    let chunkIndex = 0;

    for await (const event of stream) {
      const delta = event.choices[0]?.delta as any;
      if (!delta) continue;

      // Accumulate audio data
      if (delta.audio?.data) {
        const pcmChunk = Buffer.from(delta.audio.data, 'base64');
        pcmBuffer = Buffer.concat([pcmBuffer, pcmChunk]);

        const threshold = chunkIndex === 0 ? FIRST_CHUNK_BYTES : NEXT_CHUNK_BYTES;
        while (pcmBuffer.length >= threshold) {
          const slice = pcmBuffer.subarray(0, threshold);
          pcmBuffer = pcmBuffer.subarray(threshold);
          const wav = prependWavHeader(slice, 24000, 1, 16);
          yield { audioBase64: wav.toString('base64'), index: chunkIndex++ };
        }
      }

      // Accumulate transcript
      if (delta.audio?.transcript) {
        transcript += delta.audio.transcript;
      }
    }

    // Flush remaining PCM buffer
    if (pcmBuffer.length > 0) {
      const wav = prependWavHeader(pcmBuffer, 24000, 1, 16);
      yield { audioBase64: wav.toString('base64'), index: chunkIndex++ };
    }

    return transcript;
  }
}

function prependWavHeader(
  pcmData: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // subchunk1 size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
