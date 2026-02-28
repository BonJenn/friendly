import { Platform } from 'react-native';

// Replace with your actual Cloud Run URL after deployment
export const API_BASE_URL = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:8080'
    : 'http://localhost:8080'
  : 'https://friendly-api-HASH-uc.a.run.app'; // Replace HASH with actual

export const REVENUCAT_API_KEY = Platform.select({
  ios: 'appl_YOUR_REVENUECAT_IOS_KEY',
  android: 'goog_YOUR_REVENUECAT_ANDROID_KEY',
}) as string;

export const REVENUECAT_ENTITLEMENTS = {
  starter: 'starter',
  core: 'core',
  power: 'power',
} as const;

export const CALL_MAX_DURATION_SECONDS = 300; // 5 min hard cap on client side
export const RECORDING_MAX_DURATION_MS = 30_000; // 30s per voice turn
export const MESSAGE_INPUT_MAX_LENGTH = 500;

export const PERSONA_LABELS = {
  cool: 'Cool',
  supportive: 'Supportive',
  hype: 'Hype',
  chill: 'Chill',
} as const;

export const PERSONA_DESCRIPTIONS = {
  cool: 'Witty, slightly sarcastic, keeps it real',
  supportive: 'Warm, encouraging, always has your back',
  hype: 'High energy, pumps you up, celebrates wins',
  chill: 'Laid back, calming, good vibes only',
} as const;

export const VOICE_LABELS = {
  male: 'Male',
  female: 'Female',
  neutral: 'Neutral',
} as const;
