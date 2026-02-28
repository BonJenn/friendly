import type { FastifyInstance } from 'fastify';
import * as admin from 'firebase-admin';
import { authMiddleware } from '../middleware/auth.js';
import { initializeMemory } from '../services/memory.js';
import type { Persona, VoiceStyle, UserProfile } from '../types/index.js';

const db = admin.firestore();

// Friend nickname pool by persona
const FRIEND_NICKNAMES: Record<Persona, string[]> = {
  cool: ['Ace', 'Rio', 'Blaze', 'Nova', 'Jett'],
  supportive: ['Sam', 'Sunny', 'Haven', 'Scout', 'Sage'],
  hype: ['Sparks', 'Flash', 'Bolt', 'Vibe', 'Blitz'],
  chill: ['Zen', 'Drift', 'Meadow', 'Breeze', 'Cove'],
};

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // Complete onboarding
  app.post<{
    Body: {
      userNickname: string;
      persona: Persona;
      voiceStyle: VoiceStyle;
      callWindow: { startHour: number; endHour: number };
    };
  }>(
    '/api/profile/onboarding',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid, email } = request.authUser;
      const { userNickname, persona, voiceStyle, callWindow } = request.body;

      if (!userNickname?.trim() || !persona || !voiceStyle || !callWindow) {
        return reply.code(400).send({ error: 'All fields required' });
      }

      // Pick a friend nickname
      const pool = FRIEND_NICKNAMES[persona] ?? FRIEND_NICKNAMES.cool;
      const friendNickname = pool[Math.floor(Math.random() * pool.length)];

      // Detect timezone from request (fallback to UTC)
      const timezone =
        (request.headers['x-timezone'] as string) || 'America/New_York';

      const profile: Omit<UserProfile, 'uid'> = {
        email,
        userNickname: userNickname.trim(),
        friendNickname,
        persona,
        voiceStyle,
        callWindow,
        tier: 'free',
        onboardingComplete: true,
        createdAt: Date.now(),
        timezone,
        streakDays: 1,
        lastActiveDate: new Date().toISOString().slice(0, 10),
        fcmToken: null,
      };

      await db.collection('users').doc(uid).set(profile);

      // Initialize empty memory
      await initializeMemory(uid);

      return { friendNickname };
    }
  );

  // Update profile fields
  app.patch<{
    Body: Record<string, unknown>;
  }>(
    '/api/profile',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;
      const updates = request.body;

      // Whitelist allowed fields
      const allowed = new Set([
        'userNickname',
        'persona',
        'voiceStyle',
        'callWindow',
        'fcmToken',
        'timezone',
      ]);

      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (allowed.has(key)) {
          sanitized[key] = value;
        }
      }

      if (Object.keys(sanitized).length === 0) {
        return reply.code(400).send({ error: 'No valid fields to update' });
      }

      await db.collection('users').doc(uid).update(sanitized);
      return { ok: true };
    }
  );

  // Get profile
  app.get(
    '/api/profile',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;
      const doc = await db.collection('users').doc(uid).get();

      if (!doc.exists) {
        return reply.code(404).send({ error: 'Profile not found' });
      }

      return { uid, ...doc.data() };
    }
  );
}
