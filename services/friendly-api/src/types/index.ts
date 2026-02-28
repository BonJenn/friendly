// ─── AI Response (shared contract) ──────────────────────────
export type Emotion = 'amused' | 'caring' | 'serious' | 'hyped' | 'curious' | 'calm';

export interface AIResponse {
  text: string;
  emotion: Emotion;
  intensity: number; // 0..1
  shouldEndSession: boolean;
  followUpDelayMinutes: number | null;
  followUpText: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
}

// ─── Tier ───────────────────────────────────────────────────
export type Tier = 'free' | 'starter' | 'core' | 'power';

export interface TierLimits {
  messagesPerDay: number;
  voiceSecondsPerDay: number;
  proactiveCallsPerWeek: number;
  imagesPerWeek: number;
  visionFramesPerDay: number;
  memoryDepth: 'shallow' | 'standard' | 'deep';
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    messagesPerDay: 20,
    voiceSecondsPerDay: 300,
    proactiveCallsPerWeek: 0,
    imagesPerWeek: 0,
    visionFramesPerDay: 0,
    memoryDepth: 'shallow',
  },
  starter: {
    messagesPerDay: 60,
    voiceSecondsPerDay: 600,
    proactiveCallsPerWeek: 0,
    imagesPerWeek: 1,
    visionFramesPerDay: 20,
    memoryDepth: 'standard',
  },
  core: {
    messagesPerDay: 999,
    voiceSecondsPerDay: 1800,
    proactiveCallsPerWeek: 2,
    imagesPerWeek: 3,
    visionFramesPerDay: 60,
    memoryDepth: 'standard',
  },
  power: {
    messagesPerDay: 999,
    voiceSecondsPerDay: 3600,
    proactiveCallsPerWeek: 5,
    imagesPerWeek: 10,
    visionFramesPerDay: 200,
    memoryDepth: 'deep',
  },
};

// ─── Persona ────────────────────────────────────────────────
export type Persona = 'cool' | 'supportive' | 'hype' | 'chill';
export type VoiceStyle = 'male' | 'female' | 'neutral';

// ─── User Profile ───────────────────────────────────────────
export interface UserProfile {
  uid: string;
  email: string;
  userNickname: string;
  friendNickname: string;
  persona: Persona;
  voiceStyle: VoiceStyle;
  callWindow: { startHour: number; endHour: number };
  tier: Tier;
  onboardingComplete: boolean;
  createdAt: number;
  timezone: string;
  streakDays: number;
  lastActiveDate: string;
  fcmToken: string | null;
}

// ─── Usage ──────────────────────────────────────────────────
export interface DailyUsage {
  messagesUsed: number;
  voiceSecondsUsed: number;
  imagesUsed: number;
  visionFramesUsed: number;
  callsPlaced: number;
  callsReceived: number;
  date: string;
}

// ─── Memory ─────────────────────────────────────────────────
export interface UserMemory {
  uid: string;
  summary: string;
  facts: string[];
  insideJokes: string[];
  moodTrend: string;
  lastTopics: string[];
  updatedAt: number;
}

// ─── Session ────────────────────────────────────────────────
export type SessionType = 'chat' | 'call';

export interface Session {
  id: string;
  uid: string;
  type: SessionType;
  status: 'active' | 'ended';
  startedAt: number;
  endedAt?: number;
  turnCount: number;
}

// ─── Turn ───────────────────────────────────────────────────
export interface Turn {
  uid: string;
  sessionId: string;
  role: 'user' | 'friend';
  text: string;
  audioUrl?: string;
  imageUrl?: string;
  emotion?: Emotion;
  createdAt: number;
}

// ─── Proactive Job ──────────────────────────────────────────
export type ProactiveType = 'text' | 'call';

export interface ProactiveJob {
  id: string;
  uid: string;
  type: ProactiveType;
  status: 'pending' | 'sent' | 'failed';
  scheduledFor: number;
  text?: string;
  createdAt: number;
}

// ─── Auth ───────────────────────────────────────────────────
export interface AuthenticatedUser {
  uid: string;
  email: string;
}
