// ─── Tier & Entitlements ──────────────────────────────────────
export type Tier = 'free' | 'starter' | 'core' | 'power';

export interface TierLimits {
  messagesPerDay: number;
  voiceSecondsPerDay: number;
  proactiveCallsPerWeek: number;
  imagesPerWeek: number;
  memoryDepth: 'shallow' | 'standard' | 'deep';
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    messagesPerDay: 20,
    voiceSecondsPerDay: 300,
    proactiveCallsPerWeek: 0,
    imagesPerWeek: 0,
    memoryDepth: 'shallow',
  },
  starter: {
    messagesPerDay: 60,
    voiceSecondsPerDay: 600,
    proactiveCallsPerWeek: 0,
    imagesPerWeek: 1,
    memoryDepth: 'standard',
  },
  core: {
    messagesPerDay: 999,
    voiceSecondsPerDay: 1800,
    proactiveCallsPerWeek: 2,
    imagesPerWeek: 3,
    memoryDepth: 'standard',
  },
  power: {
    messagesPerDay: 999,
    voiceSecondsPerDay: 3600,
    proactiveCallsPerWeek: 5,
    imagesPerWeek: 10,
    memoryDepth: 'deep',
  },
};

// ─── Persona & Preferences ──────────────────────────────────
export type Persona = 'cool' | 'supportive' | 'hype' | 'chill';
export type VoiceStyle = 'male' | 'female' | 'neutral';
export type Emotion = 'amused' | 'caring' | 'serious' | 'hyped' | 'curious' | 'calm';

export interface CallWindow {
  startHour: number; // 0-23 local
  endHour: number;
}

// ─── User Profile ───────────────────────────────────────────
export interface UserProfile {
  uid: string;
  email: string;
  userNickname: string;
  friendNickname: string;
  persona: Persona;
  voiceStyle: VoiceStyle;
  callWindow: CallWindow;
  tier: Tier;
  onboardingComplete: boolean;
  createdAt: number;
  timezone: string;
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  fcmToken: string | null;
}

// ─── Usage Tracking ─────────────────────────────────────────
export interface DailyUsage {
  messagesUsed: number;
  voiceSecondsUsed: number;
  imagesUsed: number;
  callsPlaced: number;
  callsReceived: number;
  date: string;
}

// ─── Chat ───────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'friend';
  text: string;
  audioUrl?: string;
  imageUrl?: string;
  emotion?: Emotion;
  createdAt: number;
}

// ─── Session ────────────────────────────────────────────────
export type SessionType = 'chat' | 'call';
export type SessionStatus = 'active' | 'ended';

export interface Session {
  id: string;
  uid: string;
  type: SessionType;
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  turnCount: number;
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

// ─── AI Response ────────────────────────────────────────────
export interface AIResponse {
  text: string;
  emotion: Emotion;
  intensity: number;
  shouldEndSession: boolean;
  followUpDelayMinutes: number | null;
  followUpText: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
}

// ─── Navigation ─────────────────────────────────────────────
export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
  Call: { incomingCallId?: string };
};

export type AuthStackParamList = {
  SignIn: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Chat: undefined;
  Settings: undefined;
};

// ─── Friend Status ──────────────────────────────────────────
export type FriendStatus = 'online' | 'away';
