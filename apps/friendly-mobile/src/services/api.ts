import { API_BASE_URL } from '@/config/constants';
import { getIdToken } from './auth';
import type { AIResponse, ChatMessage } from '@/types';

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
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
    type: 'audio/m4a',
    name: 'voice.m4a',
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

export async function endCallSession(sessionId: string): Promise<void> {
  await apiFetch('/api/call/end', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
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
