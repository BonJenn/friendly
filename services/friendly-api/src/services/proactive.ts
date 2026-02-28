import * as admin from 'firebase-admin';
import { v4 as uuid } from 'uuid';
import type { ProactiveJob, UserProfile, Tier } from '../types/index.js';
import { TIER_LIMITS } from '../types/index.js';
import type { ProviderRegistry } from '../providers/types.js';
import { buildSystemPrompt } from '../providers/llm/prompts.js';
import { getMemory } from './memory.js';

const db = admin.firestore();

/**
 * Main proactive outreach job. Called by Cloud Scheduler every 15 minutes.
 *
 * Flow:
 * 1. Find eligible users (in call window, not recently contacted, tier allows it)
 * 2. For each eligible user, decide: text or call
 * 3. Generate a contextual message
 * 4. Send push notification via FCM
 */
export async function runProactiveJob(
  providers: ProviderRegistry
): Promise<{ processed: number; sent: number }> {
  const now = Date.now();
  let processed = 0;
  let sent = 0;

  // Get all users who have proactive calls enabled (non-free tier)
  const usersSnap = await db
    .collection('users')
    .where('onboardingComplete', '==', true)
    .where('tier', 'in', ['core', 'power'])
    .get();

  for (const userDoc of usersSnap.docs) {
    processed++;
    const user = userDoc.data() as UserProfile;

    // Check if user is within their call window
    if (!isInCallWindow(user)) continue;

    // Check cooldown: don't contact more than once per 4 hours
    const recentJobs = await db
      .collection('proactiveQueue')
      .where('uid', '==', user.uid)
      .where('status', '==', 'sent')
      .where('scheduledFor', '>', now - 4 * 60 * 60 * 1000)
      .limit(1)
      .get();

    if (!recentJobs.empty) continue;

    // Check weekly proactive call limits
    const weeklyCallCount = await getWeeklyProactiveCount(user.uid);
    const limits = TIER_LIMITS[user.tier];
    if (weeklyCallCount >= limits.proactiveCallsPerWeek) continue;

    // Random chance: don't contact every eligible user every time
    // This adds natural variation
    if (Math.random() > 0.3) continue;

    // Decide type: 70% text, 30% call
    const type = Math.random() > 0.3 ? 'text' as const : 'call' as const;

    try {
      // Generate contextual message
      const memory = await getMemory(user.uid);
      const message = await generateProactiveMessage(
        user,
        memory,
        type,
        providers
      );

      // Create job record
      const jobId = uuid();
      const job: ProactiveJob = {
        id: jobId,
        uid: user.uid,
        type,
        status: 'pending',
        scheduledFor: now,
        text: message,
        createdAt: now,
      };
      await db.collection('proactiveQueue').doc(jobId).set(job);

      // Send FCM notification
      if (user.fcmToken) {
        await sendProactiveNotification(user, type, message, jobId);
        await db
          .collection('proactiveQueue')
          .doc(jobId)
          .update({ status: 'sent' });
        sent++;
      }
    } catch (err) {
      console.error(`Proactive job failed for ${user.uid}:`, err);
    }
  }

  return { processed, sent };
}

function isInCallWindow(user: UserProfile): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: user.timezone || 'America/New_York',
    });
    const currentHour = parseInt(formatter.format(now), 10);
    const { startHour, endHour } = user.callWindow;

    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    }
    return currentHour >= startHour || currentHour < endHour;
  } catch {
    // Invalid timezone, default to allowing
    return true;
  }
}

async function getWeeklyProactiveCount(uid: string): Promise<number> {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const snap = await db
    .collection('proactiveQueue')
    .where('uid', '==', uid)
    .where('type', '==', 'call')
    .where('status', '==', 'sent')
    .where('scheduledFor', '>', weekAgo)
    .get();
  return snap.size;
}

async function generateProactiveMessage(
  user: UserProfile,
  memory: any,
  type: 'text' | 'call',
  providers: ProviderRegistry
): Promise<string> {
  const prompt =
    type === 'text'
      ? `Generate a short, casual text message from ${user.friendNickname} to ${user.userNickname}. It should feel like a random check-in from a best friend. Reference something from their memory if possible. Keep it to 1-2 sentences max. Return just the message text, no JSON.`
      : `${user.friendNickname} is about to call ${user.userNickname}. Generate a short notification text like "hey, you free to chat?" Keep it casual and brief. Return just the text.`;

  const contextMessages = [
    {
      role: 'system' as const,
      content: buildSystemPrompt(
        user.persona,
        user.friendNickname,
        user.userNickname,
        memory
      ),
    },
    { role: 'user' as const, content: prompt },
  ];

  const result = await providers.llm.chat(contextMessages, 'small');
  return result.text;
}

async function sendProactiveNotification(
  user: UserProfile,
  type: 'text' | 'call',
  message: string,
  jobId: string
): Promise<void> {
  if (!user.fcmToken) return;

  const messaging = admin.messaging();

  if (type === 'text') {
    await messaging.send({
      token: user.fcmToken,
      notification: {
        title: user.friendNickname,
        body: message,
      },
      data: {
        type: 'proactive_text',
        jobId,
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });
  } else {
    await messaging.send({
      token: user.fcmToken,
      notification: {
        title: `${user.friendNickname} is calling...`,
        body: message,
      },
      data: {
        type: 'incoming_call',
        jobId,
        callSessionId: jobId,
      },
      apns: {
        payload: {
          aps: {
            sound: 'call-ringtone.wav',
            badge: 1,
            category: 'INCOMING_CALL',
          },
        },
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'incoming_calls',
          sound: 'call_ringtone',
          priority: 'max' as const,
        },
      },
    });

    // Schedule a follow-up text if user doesn't answer (after 2 minutes)
    setTimeout(async () => {
      try {
        const jobDoc = await db.collection('proactiveQueue').doc(jobId).get();
        const job = jobDoc.data() as ProactiveJob | undefined;
        // If the call was sent but no session was created, send follow-up
        if (job?.status === 'sent' && user.fcmToken) {
          await messaging.send({
            token: user.fcmToken,
            notification: {
              title: user.friendNickname,
              body: `Tried to call you! Hit me up when you're free 😄`,
            },
            data: {
              type: 'proactive_text',
              jobId: `${jobId}-followup`,
            },
          });
        }
      } catch {
        // Best effort
      }
    }, 2 * 60 * 1000);
  }
}
