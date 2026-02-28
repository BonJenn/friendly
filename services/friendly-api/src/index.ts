import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import * as admin from 'firebase-admin';
import { config } from './config.js';
import { registerRateLimit } from './middleware/rateLimit.js';
import { chatRoutes } from './routes/chat.js';
import { callRoutes } from './routes/call.js';
import { proactiveRoutes } from './routes/proactive.js';
import { usageRoutes } from './routes/usage.js';
import { memoryRoutes } from './routes/memory.js';
import { profileRoutes } from './routes/profile.js';
import { imageRoutes } from './routes/images.js';
import type { ProviderRegistry } from './providers/types.js';
import { MockSTTProvider, WhisperSTTProvider } from './providers/stt/index.js';
import { MockLLMProvider, OpenAILLMProvider } from './providers/llm/index.js';
import { MockTTSProvider, ElevenLabsTTSProvider } from './providers/tts/index.js';
import { MockImageProvider, DallEImageProvider } from './providers/image/index.js';
import { MockVisionProvider, GPT4VisionProvider } from './providers/vision/index.js';

// ─── Firebase Admin Init ────────────────────────────────────
admin.initializeApp({
  projectId: config.projectId,
  storageBucket: config.storageBucket,
});

// ─── Provider Registry ──────────────────────────────────────
function createProviders(): ProviderRegistry {
  if (config.useMockProviders) {
    console.log('Using MOCK AI providers (set USE_MOCK_PROVIDERS=false for real providers)');
    return {
      stt: new MockSTTProvider(),
      llm: new MockLLMProvider(),
      tts: new MockTTSProvider(),
      image: new MockImageProvider(),
      vision: new MockVisionProvider(),
    };
  }

  console.log('Using REAL AI providers');
  return {
    stt: new WhisperSTTProvider(config.openaiApiKey),
    llm: new OpenAILLMProvider(config.openaiApiKey),
    tts: new ElevenLabsTTSProvider(config.elevenLabsApiKey),
    image: new DallEImageProvider(config.openaiApiKey),
    vision: new GPT4VisionProvider(config.openaiApiKey),
  };
}

// ─── Fastify App ────────────────────────────────────────────
async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
    },
    bodyLimit: config.maxAudioFileSizeMb * 1024 * 1024,
  });

  // Plugins
  await app.register(cors, {
    origin: true, // Allow all origins for mobile app
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxAudioFileSizeMb * 1024 * 1024,
    },
  });
  await registerRateLimit(app);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mockProviders: config.useMockProviders,
  }));

  // Initialize providers
  const providers = createProviders();

  // Register routes
  await chatRoutes(app, providers);
  await callRoutes(app, providers);
  await proactiveRoutes(app, providers);
  await usageRoutes(app);
  await memoryRoutes(app);
  await profileRoutes(app);
  await imageRoutes(app, providers);

  // Start
  try {
    const address = await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
