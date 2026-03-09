import type { FastifyInstance } from 'fastify';
import * as admin from 'firebase-admin';
import { authMiddleware } from '../middleware/auth.js';
import { createSession, validateSession, addTurn, getContextTurns, endSession, getSessionTurns } from '../services/session.js';
import { checkMessageCap, incrementUsage, updateStreak } from '../services/metering.js';
import { getMemory } from '../services/memory.js';
import { updateMemoryAfterSession } from '../services/memory.js';
import { checkSafety, logSafetyFlag } from '../services/safety.js';
import { buildSystemPrompt } from '../providers/llm/prompts.js';
import { uploadBuffer } from './helpers.js';
import type { ProviderRegistry, LLMMessage } from '../providers/types.js';
import type { AIResponse, UserProfile } from '../types/index.js';

export async function chatRoutes(
  app: FastifyInstance,
  providers: ProviderRegistry
): Promise<void> {
  // Create a new chat session
  app.post(
    '/api/chat/session',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;
      const session = await createSession(uid, 'chat');
      return { sessionId: session.id };
    }
  );

  // Send a message
  app.post<{
    Body: { sessionId: string; text: string };
  }>(
    '/api/chat/send',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;
      const { sessionId, text } = request.body;

      if (!sessionId || !text?.trim()) {
        return reply.code(400).send({ error: 'sessionId and text required' });
      }

      // Validate session
      const session = await validateSession(sessionId, uid);

      // Get user profile
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return reply.code(404).send({ error: 'User not found' });
      }
      const user = userDoc.data() as UserProfile;

      // Check message cap
      const capCheck = await checkMessageCap(uid, user.tier);
      if (!capCheck.allowed) {
        const capResponse: AIResponse = {
          text: `Hey, I gotta go for now! I'll catch you later though. ${user.userNickname}, you're the best.`,
          emotion: 'caring',
          intensity: 0.5,
          shouldEndSession: true,
          followUpDelayMinutes: 60,
          followUpText: "Hey I'm back! How's it going?",
          audioUrl: null,
          imageUrl: null,
        };
        return capResponse;
      }

      // Safety check
      const safetyResult = checkSafety(text);
      if (safetyResult.isCrisis) {
        await logSafetyFlag(uid, sessionId, 'crisis', text);
        // Save user turn
        await addTurn(sessionId, {
          uid,
          role: 'user',
          text,
          createdAt: Date.now(),
        });
        // Return crisis response
        const crisisResponse: AIResponse = {
          text: safetyResult.crisisResponse!,
          emotion: 'caring',
          intensity: 0.9,
          shouldEndSession: false,
          followUpDelayMinutes: 30,
          followUpText: "Hey, just checking in on you. How are you doing?",
          audioUrl: null,
          imageUrl: null,
        };
        await addTurn(sessionId, {
          uid,
          role: 'friend',
          text: crisisResponse.text,
          emotion: 'caring',
          createdAt: Date.now(),
        });
        await incrementUsage(uid, 'messagesUsed');
        return crisisResponse;
      }

      if (safetyResult.isRomanticSexual) {
        await logSafetyFlag(uid, sessionId, 'romantic_sexual', text);
        await addTurn(sessionId, {
          uid,
          role: 'user',
          text,
          createdAt: Date.now(),
        });
        const boundaryResponse: AIResponse = {
          text: safetyResult.boundaryResponse!,
          emotion: 'amused',
          intensity: 0.4,
          shouldEndSession: false,
          followUpDelayMinutes: null,
          followUpText: null,
          audioUrl: null,
          imageUrl: null,
        };
        await addTurn(sessionId, {
          uid,
          role: 'friend',
          text: boundaryResponse.text,
          emotion: 'amused',
          createdAt: Date.now(),
        });
        await incrementUsage(uid, 'messagesUsed');
        return boundaryResponse;
      }

      // Save user turn
      await addTurn(sessionId, {
        uid,
        role: 'user',
        text,
        createdAt: Date.now(),
      });

      // Build LLM context
      const memory = await getMemory(uid);
      const contextTurns = await getContextTurns(sessionId);

      const systemPrompt = buildSystemPrompt(
        user.persona,
        user.friendNickname,
        user.userNickname,
        memory
      );

      // Add near-cap hint to system prompt
      let capHint = '';
      if (capCheck.nearCap) {
        capHint =
          '\n\nIMPORTANT: You have very few messages left. Consider wrapping up naturally soon — say something like "gotta bounce, talk later!" Set shouldEndSession to true.';
      }

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt + capHint },
        ...contextTurns.map((t) => ({
          role: t.role as 'user' | 'assistant',
          content: t.text,
        })),
        { role: 'user', content: text },
      ];

      // Determine model tier
      const modelTier = text.length > 100 || session.turnCount > 5 ? 'large' : 'small';

      // Get LLM response
      const llmResult = await providers.llm.chat(messages, modelTier);

      // Handle image generation if requested
      let imageUrl: string | null = null;
      if (llmResult.shouldGenerateImage) {
        const { checkImageCap, incrementUsage: incUsage } = await import('../services/metering.js');
        const imageCap = await checkImageCap(uid, user.tier);
        if (imageCap.allowed) {
          const imageResult = await providers.image.generate(
            `A fun, cartoony scene related to: ${llmResult.text}`,
            'cartoon'
          );
          imageUrl = await uploadBuffer(
            imageResult.imageBuffer,
            `images/${uid}/${Date.now()}.png`,
            imageResult.mimeType
          );
          await incUsage(uid, 'imagesUsed');
        }
      }

      // Save friend turn
      await addTurn(sessionId, {
        uid,
        role: 'friend',
        text: llmResult.text,
        emotion: llmResult.emotion,
        createdAt: Date.now(),
      });

      // Increment usage
      await incrementUsage(uid, 'messagesUsed');
      await updateStreak(uid);

      // If session is ending, update memory
      if (llmResult.shouldEndSession) {
        const allTurns = await getSessionTurns(sessionId);
        await endSession(sessionId);
        // Fire and forget memory update
        updateMemoryAfterSession(
          uid,
          allTurns.map((t) => ({ role: t.role, text: t.text })),
          providers
        ).catch((err) => console.error('Memory update failed:', err));

        // Schedule follow-up if requested
        if (llmResult.followUpDelayMinutes && llmResult.followUpText) {
          scheduleFollowUp(
            uid,
            user,
            llmResult.followUpDelayMinutes,
            llmResult.followUpText
          );
        }
      }

      const response: AIResponse = {
        text: llmResult.text,
        emotion: llmResult.emotion,
        intensity: llmResult.intensity,
        shouldEndSession: llmResult.shouldEndSession,
        followUpDelayMinutes: llmResult.followUpDelayMinutes,
        followUpText: llmResult.followUpText,
        audioUrl: null,
        imageUrl,
      };

      return response;
    }
  );
}

function scheduleFollowUp(
  uid: string,
  user: UserProfile,
  delayMinutes: number,
  text: string
): void {
  // Simple in-process scheduling. For production, use Cloud Tasks or Firestore TTL.
  setTimeout(async () => {
    try {
      const admin = await import('firebase-admin');
      if (!user.fcmToken) return;

      await admin.messaging().send({
        token: user.fcmToken,
        notification: {
          title: user.friendNickname,
          body: text,
        },
        data: {
          type: 'followup_text',
        },
      });
    } catch (err) {
      console.error('Follow-up notification failed:', err);
    }
  }, delayMinutes * 60 * 1000);
}
