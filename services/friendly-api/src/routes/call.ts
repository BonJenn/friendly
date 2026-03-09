import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as admin from 'firebase-admin';
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
import { buildStreamingSystemPrompt, buildVisionHint } from '../providers/llm/prompts.js';
import { uploadBuffer } from './helpers.js';
import type { ProviderRegistry, LLMMessage, AudioStreamChunk } from '../providers/types.js';
import type { WebSocket } from 'ws';
import type { AIResponse, UserProfile } from '../types/index.js';
import type { Emotion } from '../types/index.js';

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

  // Process a voice turn — single gpt-4o-audio-preview call (audio in → audio out)
  app.post(
    '/api/call/turn',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;

      // Parse multipart form data
      const data = await request.file();
      if (!data) {
        console.error('call/turn: no file in request');
        return reply.code(400).send({ error: 'Audio file required' });
      }

      console.log('call/turn: fields=', Object.keys(data.fields), 'mimetype=', data.mimetype);
      const sessionId = (data.fields as any).sessionId?.value;
      if (!sessionId) {
        console.error('call/turn: sessionId missing. fields:', JSON.stringify(data.fields));
        return reply.code(400).send({ error: 'sessionId required' });
      }

      const visionFrame: string | undefined = (data.fields as any).visionFrame?.value;

      // Validate session + get user profile in parallel
      const [session, userDoc] = await Promise.all([
        validateSession(sessionId, uid),
        admin.firestore().collection('users').doc(uid).get(),
      ]);
      if (!userDoc.exists) {
        return reply.code(404).send({ error: 'User not found' });
      }
      const user = userDoc.data() as UserProfile;

      // Check voice cap
      const voiceCap = await checkVoiceCap(uid, user.tier);
      if (!voiceCap.allowed) {
        return {
          audioChunks: [],
          text: "Hey I gotta bounce, my phone's about to die. I'll call you back later!",
          emotion: 'caring',
          intensity: 0.5,
          shouldEndSession: true,
          followUpDelayMinutes: 60,
          followUpText: "Phone charged! What's good?",
        };
      }

      const t0 = Date.now();

      // Read audio buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      // Run ffmpeg conversion + Firestore fetches in parallel
      const nativeFormat = mimeToAudioFormat(data.mimetype);

      const audioPromise = (async (): Promise<{ base64: string; format: string }> => {
        if (['mp3', 'wav', 'flac', 'opus', 'pcm16'].includes(nativeFormat)) {
          return { base64: audioBuffer.toString('base64'), format: nativeFormat };
        }
        const inPath = join(tmpdir(), `call-in-${Date.now()}.${nativeFormat}`);
        const outPath = join(tmpdir(), `call-out-${Date.now()}.mp3`);
        writeFileSync(inPath, audioBuffer);
        try {
          execSync(`ffmpeg -i ${inPath} -f mp3 -ar 16000 -ac 1 -b:a 48k -q:a 9 ${outPath} -y`, { stdio: 'pipe' });
          return { base64: readFileSync(outPath).toString('base64'), format: 'mp3' };
        } finally {
          try { unlinkSync(inPath); } catch {}
          try { unlinkSync(outPath); } catch {}
        }
      })();

      const visionPromise = (async () => {
        if (!visionFrame) return '';
        const visionCap = await checkVisionCap(uid, user.tier);
        if (!visionCap.allowed) return '';
        const visionResult = await providers.vision.analyzeFrame(visionFrame, '');
        incrementVisionFrames(uid).catch((err) => console.error('Vision frames increment failed:', err));
        return '\n\n' + buildVisionHint(visionResult.description);
      })();

      const [audio, memory, contextTurns, visionHint] = await Promise.all([
        audioPromise,
        getMemory(uid),
        getContextTurns(sessionId),
        visionPromise,
      ]);

      const t1 = Date.now();
      console.log(`call/turn: prep took ${t1 - t0}ms`);

      // Build system prompt
      let systemPrompt = buildStreamingSystemPrompt(
        user.persona,
        user.friendNickname,
        user.userNickname,
        memory
      );

      if (voiceCap.nearCap) {
        systemPrompt += '\n\nIMPORTANT: Voice time is running low. Wrap up naturally soon — say something like "alright I gotta go, talk soon!"';
      }
      if (visionHint) {
        systemPrompt += visionHint;
      }
      systemPrompt += `\n\nSAFETY: If the user expresses self-harm, suicidal thoughts, or is in crisis, respond with genuine care, mention the 988 Suicide & Crisis Lifeline, and encourage reaching out to real people. Do not try to counsel them yourself.`;

      const contextMessages: LLMMessage[] = contextTurns.map((t) => ({
        role: t.role as 'user' | 'assistant',
        content: t.text,
      }));

      // ─── Single API call: audio in → audio + text out ─────────
      const result = await providers.llm.chatAudio(
        systemPrompt,
        contextMessages,
        audio.base64,
        audio.format,
        getVoiceId(user.voiceStyle)
      );

      const t2 = Date.now();
      console.log(`call/turn: chatAudio took ${t2 - t1}ms, total ${t2 - t0}ms, audioLen=${result.audioBase64?.length ?? 0}, transcript=${result.transcript?.substring(0, 80)}`);

      // If audio model didn't return audio, fall back to TTS
      if (!result.audioBase64) {
        console.log('call/turn: no audio returned, falling back to TTS');
        const ttsResult = await providers.tts.synthesize(
          result.transcript,
          getVoiceId(user.voiceStyle)
        );
        result.audioBase64 = ttsResult.audioBuffer.toString('base64');
        console.log(`call/turn: TTS fallback took ${Date.now() - t2}ms, audioLen=${result.audioBase64.length}`);
      }

      // Heuristic metadata from the transcript (no extra API call)
      const emotion = detectEmotion(result.transcript);
      const shouldEndSession = detectSessionEnd(result.transcript);

      // Fire-and-forget: save turns, track usage, update streak
      Promise.all([
        addTurn(sessionId, { uid, role: 'user', text: '(audio turn)', createdAt: Date.now() }),
        addTurn(sessionId, { uid, role: 'friend', text: result.transcript, emotion, createdAt: Date.now() }),
        updateStreak(uid),
      ]).catch((err) => console.error('Post-response writes failed:', err));

      // If session is ending, update memory in background
      if (shouldEndSession) {
        (async () => {
          const allTurns = await getSessionTurns(sessionId);
          await endSession(sessionId);
          await updateMemoryAfterSession(
            uid,
            allTurns.map((t) => ({ role: t.role, text: t.text })),
            providers
          );
        })().catch((err) => console.error('Session end/memory update failed:', err));
      }

      return {
        audioChunks: result.audioBase64
          ? [{ base64: result.audioBase64, text: result.transcript }]
          : [],
        text: result.transcript,
        emotion,
        intensity: 0.6,
        shouldEndSession,
        followUpDelayMinutes: shouldEndSession ? 30 + Math.floor(Math.random() * 60) : null,
        followUpText: shouldEndSession ? "Hey! How's it going?" : null,
      };
    }
  );

  // Generate an initial greeting when the call connects
  app.post<{
    Body: { sessionId: string };
  }>(
    '/api/call/greet',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;
      const { sessionId } = request.body;

      if (!sessionId) {
        return reply.code(400).send({ error: 'sessionId required' });
      }

      const session = await validateSession(sessionId, uid);

      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return reply.code(404).send({ error: 'User not found' });
      }
      const user = userDoc.data() as UserProfile;

      // Pick a persona-appropriate greeting
      const greetings: Record<string, string[]> = {
        cool: ["Yo, what's good?", "Hey! What's up?", "Sup, what's happening?"],
        supportive: ["Hey! So glad you called!", "Hi there! How are you doing?", "Hey! I was hoping you'd call!"],
        hype: ["YOOO what's up!", "Hey hey hey! What's good?!", "Ayyyy let's go! What's happening?"],
        chill: ["Hey, what's going on?", "Hey there. How's it going?", "Yo, what's up?"],
      };

      const personaGreetings = greetings[user.persona] ?? greetings.chill;
      const greeting = personaGreetings[Math.floor(Math.random() * personaGreetings.length)];

      // Generate TTS for the greeting
      const ttsResult = await providers.tts.synthesize(
        greeting,
        getVoiceId(user.voiceStyle)
      );

      const greetExt = ttsResult.mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
      const audioUrl = await uploadBuffer(
        ttsResult.audioBuffer,
        `audio/${uid}/${Date.now()}-greet.${greetExt}`,
        ttsResult.mimeType
      );

      // Fire-and-forget: save greeting turn + track voice seconds
      Promise.all([
        incrementVoiceSeconds(uid, ttsResult.durationSeconds),
        addTurn(sessionId, {
          uid,
          role: 'friend',
          text: greeting,
          emotion: 'calm',
          audioUrl,
          createdAt: Date.now(),
        }),
      ]).catch((err) => console.error('Greet post-response writes failed:', err));

      const response: AIResponse = {
        text: greeting,
        emotion: 'calm',
        intensity: 0.5,
        shouldEndSession: false,
        followUpDelayMinutes: null,
        followUpText: null,
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

  // ─── WebSocket route for streaming audio ───────────────────
  app.get('/api/call/ws', { websocket: true }, async (socket: WebSocket, request) => {
    const query = request.query as Record<string, string>;
    const token = query.token;
    const sessionId = query.sessionId;

    if (!token || !sessionId) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing token or sessionId' }));
      socket.close();
      return;
    }

    // Auth: verify Firebase token (same logic as authMiddleware)
    let uid: string;
    try {
      if (token.startsWith('dev:') && process.env.NODE_ENV !== 'production') {
        uid = token.slice(4);
      } else {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
      }
    } catch (err) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      socket.close();
      return;
    }

    // Validate session + get user profile
    let user: UserProfile;
    try {
      await validateSession(sessionId, uid);
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      if (!userDoc.exists) {
        socket.send(JSON.stringify({ type: 'error', message: 'User not found' }));
        socket.close();
        return;
      }
      user = userDoc.data() as UserProfile;
    } catch (err) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid session' }));
      socket.close();
      return;
    }

    socket.send(JSON.stringify({ type: 'connected' }));

    socket.on('message', async (raw: Buffer | string) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      } catch {
        return;
      }

      if (msg.type !== 'audio_turn') return;

      try {
        await handleStreamingTurn(socket, providers, uid, sessionId, user, msg.audio, msg.visionFrame);
      } catch (err) {
        console.error('WS streaming turn failed:', err);
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'error', message: 'Turn processing failed' }));
        }
      }
    });

    socket.on('close', () => {
      console.log(`WS closed for user=${uid} session=${sessionId}`);
    });
  });
}

function getVoiceId(voiceStyle: string): string {
  // OpenAI TTS voice names
  const voiceMap: Record<string, string> = {
    male: 'onyx',
    female: 'nova',
    neutral: 'alloy',
  };
  return voiceMap[voiceStyle] ?? voiceMap.neutral;
}

function mimeToAudioFormat(mime: string): string {
  const map: Record<string, string> = {
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/vnd.wave': 'wav',
    'audio/wave': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
  };
  return map[mime] ?? 'mp3';
}

function detectEmotion(text: string): Emotion {
  const lower = text.toLowerCase();
  if (/haha|lol|lmao|😂|funny|hilarious/.test(lower)) return 'amused';
  if (/let'?s go|amazing|awesome|incredible|fire|hype|excited/.test(lower)) return 'hyped';
  if (/sorry|tough|hard|rough|i'?m here|care|❤/.test(lower)) return 'caring';
  if (/really\??|wait|what\??|how|why|curious|tell me/.test(lower)) return 'curious';
  if (/important|serious|listen|real talk|honestly/.test(lower)) return 'serious';
  return 'calm';
}

function detectSessionEnd(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(gotta go|gotta run|bye|talk later|talk soon|ttyl|catch you later|peace out|see ya|later!)\b/.test(lower);
}

async function handleStreamingTurn(
  socket: WebSocket,
  providers: ProviderRegistry,
  uid: string,
  sessionId: string,
  user: UserProfile,
  audioBase64: string,
  visionFrame?: string
): Promise<void> {
  const t0 = Date.now();

  // Check voice cap
  const voiceCap = await checkVoiceCap(uid, user.tier);
  if (!voiceCap.allowed) {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'turn_complete',
        text: "Hey I gotta bounce, my phone's about to die. I'll call you back later!",
        emotion: 'caring',
        shouldEndSession: true,
      }));
    }
    return;
  }

  // Vision processing
  const visionPromise = (async () => {
    if (!visionFrame) return '';
    const visionCap = await checkVisionCap(uid, user.tier);
    if (!visionCap.allowed) return '';
    const visionResult = await providers.vision.analyzeFrame(visionFrame, '');
    incrementVisionFrames(uid).catch((err) => console.error('Vision frames increment failed:', err));
    return '\n\n' + buildVisionHint(visionResult.description);
  })();

  // Determine audio format — base64 input is assumed WAV from client
  const audioFormat = 'wav';

  const [memory, contextTurns, visionHint] = await Promise.all([
    getMemory(uid),
    getContextTurns(sessionId),
    visionPromise,
  ]);

  const t1 = Date.now();
  console.log(`ws/turn: prep took ${t1 - t0}ms`);

  // Build system prompt
  let systemPrompt = buildStreamingSystemPrompt(
    user.persona,
    user.friendNickname,
    user.userNickname,
    memory
  );

  if (voiceCap.nearCap) {
    systemPrompt += '\n\nIMPORTANT: Voice time is running low. Wrap up naturally soon — say something like "alright I gotta go, talk soon!"';
  }
  if (visionHint) {
    systemPrompt += visionHint;
  }
  systemPrompt += `\n\nSAFETY: If the user expresses self-harm, suicidal thoughts, or is in crisis, respond with genuine care, mention the 988 Suicide & Crisis Lifeline, and encourage reaching out to real people. Do not try to counsel them yourself.`;

  const contextMessages: LLMMessage[] = contextTurns.map((t) => ({
    role: t.role as 'user' | 'assistant',
    content: t.text,
  }));

  // Stream audio chunks via the async generator
  const generator = providers.llm.chatAudioStream(
    systemPrompt,
    contextMessages,
    audioBase64,
    audioFormat,
    getVoiceId(user.voiceStyle)
  );

  let chunkCount = 0;
  let transcript = '';

  while (true) {
    const { value, done } = await generator.next();
    if (done) {
      // Generator return value is the transcript
      transcript = value as string;
      break;
    }
    const chunk = value as AudioStreamChunk;
    chunkCount++;
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'audio_chunk',
        index: chunk.index,
        base64: chunk.audioBase64,
      }));
    }
  }

  const t2 = Date.now();
  console.log(`ws/turn: stream took ${t2 - t1}ms, chunks=${chunkCount}, transcript=${transcript?.substring(0, 80)}`);

  // If no audio chunks were produced, fall back to TTS
  if (chunkCount === 0 && transcript) {
    console.log('ws/turn: no audio chunks, falling back to TTS');
    const ttsResult = await providers.tts.synthesize(
      transcript,
      getVoiceId(user.voiceStyle)
    );
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'audio_chunk',
        index: 0,
        base64: ttsResult.audioBuffer.toString('base64'),
      }));
    }
  }

  // Heuristic metadata
  const emotion = detectEmotion(transcript);
  const shouldEndSession = detectSessionEnd(transcript);

  if (socket.readyState === 1) {
    socket.send(JSON.stringify({
      type: 'turn_complete',
      text: transcript,
      emotion,
      shouldEndSession,
    }));
  }

  // Fire-and-forget: save turns, update streak
  Promise.all([
    addTurn(sessionId, { uid, role: 'user', text: '(audio turn)', createdAt: Date.now() }),
    addTurn(sessionId, { uid, role: 'friend', text: transcript, emotion, createdAt: Date.now() }),
    updateStreak(uid),
  ]).catch((err) => console.error('Post-response writes failed:', err));

  // If session is ending, update memory in background
  if (shouldEndSession) {
    (async () => {
      const allTurns = await getSessionTurns(sessionId);
      await endSession(sessionId);
      await updateMemoryAfterSession(
        uid,
        allTurns.map((t) => ({ role: t.role, text: t.text })),
        providers
      );
    })().catch((err) => console.error('Session end/memory update failed:', err));
  }
}
