import * as admin from 'firebase-admin';
import { v4 as uuid } from 'uuid';
import type { Session, SessionType, Turn } from '../types/index.js';

function db() { return admin.firestore(); }

export async function createSession(
  uid: string,
  type: SessionType
): Promise<Session> {
  const id = uuid();
  const session: Session = {
    id,
    uid,
    type,
    status: 'active',
    startedAt: Date.now(),
    turnCount: 0,
  };

  await db().collection('sessions').doc(id).set(session);
  return session;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const doc = await db().collection('sessions').doc(sessionId).get();
  if (!doc.exists) return null;
  return doc.data() as Session;
}

export async function validateSession(
  sessionId: string,
  uid: string
): Promise<Session> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Session not found');
  if (session.uid !== uid) throw new Error('Session does not belong to user');
  if (session.status !== 'active') throw new Error('Session is not active');
  return session;
}

export async function addTurn(
  sessionId: string,
  turn: Omit<Turn, 'sessionId'>
): Promise<string> {
  const turnId = uuid();
  const turnDoc: Turn = { ...turn, sessionId };

  await db()
    .collection('sessions')
    .doc(sessionId)
    .collection('turns')
    .doc(turnId)
    .set(turnDoc);

  // Increment turn count
  await db()
    .collection('sessions')
    .doc(sessionId)
    .update({
      turnCount: admin.firestore.FieldValue.increment(1),
    });

  return turnId;
}

export async function endSession(sessionId: string): Promise<void> {
  await db().collection('sessions').doc(sessionId).update({
    status: 'ended',
    endedAt: Date.now(),
  });
}

export async function getSessionTurns(
  sessionId: string,
  limit: number = 20
): Promise<Turn[]> {
  const snap = await db()
    .collection('sessions')
    .doc(sessionId)
    .collection('turns')
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => d.data() as Turn);
}

/**
 * Get recent turns across sessions for building LLM context.
 * Returns turns from the current session + summary from memory.
 */
export async function getContextTurns(
  sessionId: string,
  maxTurns: number = 10
): Promise<Array<{ role: string; text: string }>> {
  const turns = await getSessionTurns(sessionId, maxTurns);
  return turns.map((t) => ({
    role: t.role === 'user' ? 'user' : 'assistant',
    text: t.text,
  }));
}
