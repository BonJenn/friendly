import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import {
  createSession,
  validateSession,
  addTurn,
  getContextTurns,
  endSession,
  getSessionTurns,
} from '../services/session.js';
import {
  checkVoiceCap,
  checkVisionCap,
  incrementVoiceSeconds,
  incrementVisionFrames,
  incrementUsage,
  updateStreak,
} from '../services/metering.js';
import { getMemory, updateMemoryAfterSession } from '../services/memory.js';
import { checkSafety, logSafetyFlag } from '../services/safety.js';
import { buildSystemPrompt, buildVisionHint } from '../providers/llm/prompts.js';
import { uploadBuffer } from './helpers.js';
import type { ProviderRegistry, LLMMessage } from '../providers/types.js';
import type { AIResponse, UserProfile } from '../types/index.js';

export async function callRoutes(
  app: FastifyInstance,
  providers: ProviderRegistry
): Promise<void> {
  // Create a new call session
  app.post(
    '/api/call/session',
    { preHandler: authMiddleware },
    async (request) => {
      const { uid } = request.authUser;
      await incrementUsage(uid, 'callsPlaced');
      const session = await createSession(uid, 'call');
      return { sessionId: session.id };
    }
  );

  // Process a voice turn
  app.post(
    '/api/call/turn',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;

      // Parse multipart form data
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'Audio file required' });
      }

      const sessionId = (data.fields as any).sessionId?.value;
      if (!sessionId) {
        return reply.code(400).send({ error: 'sessionId required' });
      }

      // Optional vision frame (base64 string)
      const visionFrame: string | undefined = (data.fields as any).visionFrame?.value;

      // Validate session
      const session = await validateSession(sessionId, uid);

      // Get user profile
      const admin = await import('firebase-admin');
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return reply.code(404).send({ error: 'User not found' });
      }
      const user = userDoc.data() as UserProfile;

      // Check voice cap
      const voiceCap = await checkVoiceCap(uid, user.tier);
      if (!voiceCap.allowed) {
        const capResponse: AIResponse = {
          text: "Hey I gotta bounce, my phone's about to die. I'll call you back later!",
          emotion: 'caring',
          intensity: 0.5,
          shouldEndSession: true,
          followUpDelayMinutes: 60,
          followUpText: "Phone charged! What's good?",
          audioUrl: null,
          imageUrl: null,
        };
        return capResponse;
      }

      // Read audio buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      // Step 1: STT
      const sttResult = await providers.stt.transcribe(
        audioBuffer,
        data.mimetype
      );

      // Track voice usage
      await incrementVoiceSeconds(uid, sttResult.durationSeconds);

      // Safety check on transcribed text
      const safetyResult = checkSafety(sttResult.text);
      if (safetyResult.isCrisis) {
        await logSafetyFlag(uid, sessionId, 'crisis', sttResult.text);
        // Save user turn
        await addTurn(sessionId, {
          uid,
          role: 'user',
          text: sttResult.text,
          createdAt: Date.now(),
        });

        const crisisText = safetyResult.crisisResponse!;
        const ttsResult = await providers.tts.synthesize(
          crisisText,
          getVoiceId(user.voiceStyle)
        );
        const audioUrl = await uploadBuffer(
          ttsResult.audioBuffer,
          `audio/${uid}/${Date.now()}-response.wav`,
          ttsResult.mimeType
        );

        await addTurn(sessionId, {
          uid,
          role: 'friend',
          text: crisisText,
          emotion: 'caring',
          audioUrl,
          createdAt: Date.now(),
        });

        const response: AIResponse = {
          text: crisisText,
          emotion: 'caring',
          intensity: 0.9,
          shouldEndSession: false,
          followUpDelayMinutes: 30,
          followUpText: "Just checking in. How are you doing?",
          audioUrl,
          imageUrl: null,
        };
        return response;
      }

      // Save user turn
      await addTurn(sessionId, {
        uid,
        role: 'user',
        text: sttResult.text,
        createdAt: Date.now(),
      });

      // Step 2: Vision (if frame provided)
      let visionHint = '';
      if (visionFrame) {
        const visionCap = await checkVisionCap(uid, user.tier);
        if (visionCap.allowed) {
          const visionResult = await providers.vision.analyzeFrame(
            visionFrame,
            sttResult.text
          );
          visionHint = '\n\n' + buildVisionHint(visionResult.description);
          await incrementVisionFrames(uid);

          if (visionCap.nearCap) {
            visionHint +=
              '\n\nNote: Vision frames are running low for today. You can still see but this is among the last frames — no need to mention this to the user.';
          }
        }
      }

      // Step 3: LLM
      const memory = await getMemory(uid);
      const contextTurns = await getContextTurns(sessionId);

      let capHint = '';
      if (voiceCap.nearCap) {
        capHint =
          '\n\nIMPORTANT: Voice time is running low. Wrap up naturally soon — say something like "alright I gotta go, talk soon!" Set shouldEndSession to true.';
      }

      const systemPrompt = buildSystemPrompt(
        user.persona,
        user.friendNickname,
        user.userNickname,
        memory
      );

      // Prepend vision context to the user's message so the AI can reference what it sees
      const userContent = visionHint
        ? visionHint + '\n\n' + sttResult.text
        : sttResult.text;

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt + capHint },
        ...contextTurns.map((t) => ({
          role: t.role as 'user' | 'assistant',
          content: t.text,
        })),
        { role: 'user', content: userContent },
      ];

      const modelTier =
        sttResult.text.length > 80 || session.turnCount > 3
          ? 'large'
          : 'small';
      const llmResult = await providers.llm.chat(messages, modelTier);

      // Step 4: TTS
      const ttsResult = await providers.tts.synthesize(
        llmResult.text,
        getVoiceId(user.voiceStyle)
      );

      // Upload audio
      const audioUrl = await uploadBuffer(
        ttsResult.audioBuffer,
        `audio/${uid}/${Date.now()}-response.wav`,
        ttsResult.mimeType
      );

      // Track TTS voice seconds
      await incrementVoiceSeconds(uid, ttsResult.durationSeconds);

      // Save friend turn
      await addTurn(sessionId, {
        uid,
        role: 'friend',
        text: llmResult.text,
        emotion: llmResult.emotion,
        audioUrl,
        createdAt: Date.now(),
      });

      await updateStreak(uid);

      // If session is ending, update memory
      if (llmResult.shouldEndSession) {
        const allTurns = await getSessionTurns(sessionId);
        await endSession(sessionId);
        updateMemoryAfterSession(
          uid,
          allTurns.map((t) => ({ role: t.role, text: t.text })),
          providers
        ).catch((err) => console.error('Memory update failed:', err));
      }

      const response: AIResponse = {
        text: llmResult.text,
        emotion: llmResult.emotion,
        intensity: llmResult.intensity,
        shouldEndSession: llmResult.shouldEndSession,
        followUpDelayMinutes: llmResult.followUpDelayMinutes,
        followUpText: llmResult.followUpText,
        audioUrl,
        imageUrl: null,
      };

      return response;
    }
  );

  // End a call session explicitly
  app.post<{
    Body: { sessionId: string };
  }>(
    '/api/call/end',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;
      const { sessionId } = request.body;

      if (!sessionId) {
        return reply.code(400).send({ error: 'sessionId required' });
      }

      const session = await validateSession(sessionId, uid);
      const allTurns = await getSessionTurns(sessionId);
      await endSession(sessionId);

      // Update memory in background
      updateMemoryAfterSession(
        uid,
        allTurns.map((t) => ({ role: t.role, text: t.text })),
        providers
      ).catch((err) => console.error('Memory update failed:', err));

      return { ok: true };
    }
  );
}

function getVoiceId(voiceStyle: string): string {
  // Map voice styles to provider-specific voice IDs
  // These would be replaced with real voice IDs from your TTS provider
  const voiceMap: Record<string, string> = {
    male: 'voice-male-default',
    female: 'voice-female-default',
    neutral: 'voice-neutral-default',
  };
  return voiceMap[voiceStyle] ?? 'voice-neutral-default';
}
