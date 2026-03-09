import { API_BASE_URL } from '@/config/constants';
import { getIdToken } from './auth';
import type { AIResponse, ChatMessage } from '@/types';

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string>),
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }

  // Parse JSON manually so we can diagnose parse failures
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(`JSON parse failed for ${path}. Body:`, text.slice(0, 500));
    throw new Error(`Response parse error for ${path}`);
  }
}

// ─── Chat ───────────────────────────────────────────────────
export async function sendMessage(
  sessionId: string,
  text: string
): Promise<AIResponse> {
  return apiFetch<AIResponse>('/api/chat/send', {
    method: 'POST',
    body: JSON.stringify({ sessionId, text }),
  });
}

export async function startChatSession(): Promise<{ sessionId: string }> {
  return apiFetch('/api/chat/session', { method: 'POST' });
}

// ─── Call ───────────────────────────────────────────────────
export async function startCallSession(): Promise<{ sessionId: string }> {
  return apiFetch('/api/call/session', { method: 'POST' });
}

export async function sendVoiceTurn(
  sessionId: string,
  audioUri: string,
  visionFrame?: string
): Promise<AIResponse> {
  const token = await getIdToken();
  const formData = new FormData();
  formData.append('sessionId', sessionId);
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/wav',
    name: 'voice.wav',
  } as unknown as Blob);

  if (visionFrame) {
    formData.append('visionFrame', visionFrame);
  }

  const res = await fetch(`${API_BASE_URL}/api/call/turn`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

export interface StreamingTurnResponse {
  audioChunks: Array<{ base64: string; text: string }>;
  text: string;
  emotion: string;
  intensity: number;
  shouldEndSession: boolean;
  followUpDelayMinutes: number | null;
  followUpText: string | null;
}

export async function sendVoiceTurnStreaming(
  sessionId: string,
  audioUri: string,
  visionFrame?: string
): Promise<StreamingTurnResponse> {
  const token = await getIdToken();
  const formData = new FormData();
  formData.append('sessionId', sessionId);
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/wav',
    name: 'voice.wav',
  } as unknown as Blob);

  if (visionFrame) {
    formData.append('visionFrame', visionFrame);
  }

  const res = await fetch(`${API_BASE_URL}/api/call/turn`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

export async function greetCall(sessionId: string): Promise<AIResponse> {
  return apiFetch<AIResponse>('/api/call/greet', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export async function endCallSession(sessionId: string): Promise<void> {
  await apiFetch('/api/call/end', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

// ─── WebSocket Call ─────────────────────────────────────────

export interface CallWebSocketCallbacks {
  onAudioChunk: (index: number, base64: string) => void;
  onTurnComplete: (data: {
    text: string;
    emotion: string;
    shouldEndSession: boolean;
  }) => void;
  onError: (message: string) => void;
  onConnected?: () => void;
}

export class CallWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: CallWebSocketCallbacks | null = null;

  async connect(
    sessionId: string,
    callbacks: CallWebSocketCallbacks
  ): Promise<void> {
    this.callbacks = callbacks;
    const token = await getIdToken();

    // Convert https:// to wss://
    const wsBase = API_BASE_URL.replace(/^https?:\/\//, 'wss://');
    const url = `${wsBase}/api/call/ws?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        // Wait for 'connected' message before resolving
      };

      ws.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
        } catch {
          return;
        }

        switch (msg.type) {
          case 'connected':
            this.callbacks?.onConnected?.();
            resolve();
            break;
          case 'audio_chunk':
            this.callbacks?.onAudioChunk(msg.index, msg.base64);
            break;
          case 'turn_complete':
            this.callbacks?.onTurnComplete({
              text: msg.text,
              emotion: msg.emotion,
              shouldEndSession: msg.shouldEndSession,
            });
            break;
          case 'error':
            this.callbacks?.onError(msg.message);
            break;
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        this.callbacks?.onError('WebSocket connection error');
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  sendAudioTurn(audioBase64: string, visionFrame?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.callbacks?.onError('WebSocket not connected');
      return;
    }
    const msg: any = { type: 'audio_turn', audio: audioBase64 };
    if (visionFrame) msg.visionFrame = visionFrame;
    this.ws.send(JSON.stringify(msg));
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks = null;
  }
}

// ─── Usage ──────────────────────────────────────────────────
export async function getUsage(): Promise<{
  messagesUsed: number;
  voiceSecondsUsed: number;
  imagesUsed: number;
  callsPlaced: number;
  callsReceived: number;
}> {
  return apiFetch('/api/usage');
}

// ─── Memory ─────────────────────────────────────────────────
export async function getMemory(): Promise<{
  summary: string;
  facts: string[];
  insideJokes: string[];
}> {
  return apiFetch('/api/memory');
}

// ─── Profile ────────────────────────────────────────────────
export async function updateProfile(
  data: Record<string, unknown>
): Promise<void> {
  await apiFetch('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function completeOnboarding(data: {
  userNickname: string;
  persona: string;
  voiceStyle: string;
  callWindow: { startHour: number; endHour: number };
}): Promise<{ friendNickname: string }> {
  return apiFetch('/api/profile/onboarding', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
