export const config = {
  port: parseInt(process.env.PORT ?? '8080', 10),
  projectId: process.env.GCP_PROJECT_ID ?? 'friendly-ai-mobile',
  storageBucket: process.env.STORAGE_BUCKET ?? 'friendly-ai-mobile-storage',

  // AI provider keys (set via env / Secret Manager)
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',

  // Feature flags
  useMockProviders: process.env.USE_MOCK_PROVIDERS === 'true' || !process.env.OPENAI_API_KEY,

  // Proactive outreach
  proactiveSecret: process.env.PROACTIVE_JOB_SECRET ?? 'dev-secret',

  // Rate limiting
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '60', 10),
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',

  // Audio
  maxAudioFileSizeMb: 10,
  audioSignedUrlExpiryMinutes: 60,

  // Session
  maxTurnsPerSession: 50,
  sessionTimeoutMinutes: 30,
} as const;
