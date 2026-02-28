import * as admin from 'firebase-admin';
import type { Tier, DailyUsage } from '../types/index.js';
import { TIER_LIMITS } from '../types/index.js';

function db() { return admin.firestore(); }

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyUsage(uid: string): Promise<DailyUsage> {
  const today = todayKey();
  const ref = db().collection('usage').doc(uid).collection('days').doc(today);
  const doc = await ref.get();

  if (!doc.exists) {
    const empty: DailyUsage = {
      messagesUsed: 0,
      voiceSecondsUsed: 0,
      imagesUsed: 0,
      visionFramesUsed: 0,
      callsPlaced: 0,
      callsReceived: 0,
      date: today,
    };
    await ref.set(empty);
    return empty;
  }

  return doc.data() as DailyUsage;
}

export async function incrementUsage(
  uid: string,
  field: keyof Pick<DailyUsage, 'messagesUsed' | 'imagesUsed' | 'callsPlaced' | 'callsReceived'>,
  amount: number = 1
): Promise<void> {
  const today = todayKey();
  const ref = db().collection('usage').doc(uid).collection('days').doc(today);

  await ref.set(
    { [field]: admin.firestore.FieldValue.increment(amount), date: today },
    { merge: true }
  );
}

export async function incrementVoiceSeconds(
  uid: string,
  seconds: number
): Promise<void> {
  const today = todayKey();
  const ref = db().collection('usage').doc(uid).collection('days').doc(today);

  await ref.set(
    {
      voiceSecondsUsed: admin.firestore.FieldValue.increment(seconds),
      date: today,
    },
    { merge: true }
  );
}

export interface CapCheckResult {
  allowed: boolean;
  nearCap: boolean;
  reason?: string;
}

export async function checkMessageCap(
  uid: string,
  tier: Tier
): Promise<CapCheckResult> {
  const usage = await getDailyUsage(uid);
  const limits = TIER_LIMITS[tier];

  if (usage.messagesUsed >= limits.messagesPerDay) {
    return { allowed: false, nearCap: true, reason: 'message_cap_reached' };
  }

  const remaining = limits.messagesPerDay - usage.messagesUsed;
  return {
    allowed: true,
    nearCap: remaining <= 3,
  };
}

export async function checkVoiceCap(
  uid: string,
  tier: Tier
): Promise<CapCheckResult> {
  const usage = await getDailyUsage(uid);
  const limits = TIER_LIMITS[tier];

  if (usage.voiceSecondsUsed >= limits.voiceSecondsPerDay) {
    return { allowed: false, nearCap: true, reason: 'voice_cap_reached' };
  }

  const remaining = limits.voiceSecondsPerDay - usage.voiceSecondsUsed;
  return {
    allowed: true,
    nearCap: remaining <= 60, // within 1 minute of cap
  };
}

export async function checkImageCap(
  uid: string,
  tier: Tier
): Promise<CapCheckResult> {
  // Images are weekly, so we need to sum the last 7 days
  const limits = TIER_LIMITS[tier];
  if (limits.imagesPerWeek === 0) {
    return { allowed: false, nearCap: false, reason: 'images_not_available' };
  }

  const now = new Date();
  let totalImages = 0;

  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const doc = await db()
      .collection('usage')
      .doc(uid)
      .collection('days')
      .doc(key)
      .get();
    if (doc.exists) {
      totalImages += (doc.data() as DailyUsage).imagesUsed ?? 0;
    }
  }

  if (totalImages >= limits.imagesPerWeek) {
    return { allowed: false, nearCap: true, reason: 'image_cap_reached' };
  }

  return { allowed: true, nearCap: false };
}

export async function incrementVisionFrames(
  uid: string,
  amount: number = 1
): Promise<void> {
  const today = todayKey();
  const ref = db().collection('usage').doc(uid).collection('days').doc(today);

  await ref.set(
    {
      visionFramesUsed: admin.firestore.FieldValue.increment(amount),
      date: today,
    },
    { merge: true }
  );
}

export async function checkVisionCap(
  uid: string,
  tier: Tier
): Promise<CapCheckResult> {
  const limits = TIER_LIMITS[tier];
  if (limits.visionFramesPerDay === 0) {
    return { allowed: false, nearCap: false, reason: 'vision_not_available' };
  }

  const usage = await getDailyUsage(uid);
  const used = usage.visionFramesUsed ?? 0;

  if (used >= limits.visionFramesPerDay) {
    return { allowed: false, nearCap: true, reason: 'vision_cap_reached' };
  }

  const remaining = limits.visionFramesPerDay - used;
  return {
    allowed: true,
    nearCap: remaining <= 5,
  };
}

export async function updateStreak(uid: string): Promise<void> {
  const today = todayKey();
  const userRef = db().collection('users').doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) return;

  const data = userDoc.data()!;
  const lastActive = data.lastActiveDate as string | undefined;
  const currentStreak = (data.streakDays as number) ?? 0;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  let newStreak: number;
  if (lastActive === yesterdayKey) {
    newStreak = currentStreak + 1;
  } else if (lastActive === today) {
    newStreak = currentStreak; // Already counted today
  } else {
    newStreak = 1; // Reset
  }

  await userRef.update({
    streakDays: newStreak,
    lastActiveDate: today,
  });
}
