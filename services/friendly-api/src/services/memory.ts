import * as admin from 'firebase-admin';
import type { UserMemory } from '../types/index.js';
import type { ProviderRegistry } from '../providers/types.js';
import { buildSummarizationPrompt } from '../providers/llm/prompts.js';

const db = admin.firestore();

export async function getMemory(uid: string): Promise<UserMemory | null> {
  const doc = await db.collection('memory').doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as UserMemory;
}

export async function initializeMemory(uid: string): Promise<UserMemory> {
  const memory: UserMemory = {
    uid,
    summary: '',
    facts: [],
    insideJokes: [],
    moodTrend: 'neutral',
    lastTopics: [],
    updatedAt: Date.now(),
  };
  await db.collection('memory').doc(uid).set(memory);
  return memory;
}

/**
 * After a session ends, extract key information and update the rolling memory.
 * This is designed to be token-efficient: we don't store full transcripts.
 */
export async function updateMemoryAfterSession(
  uid: string,
  conversationTurns: Array<{ role: string; text: string }>,
  providers: ProviderRegistry
): Promise<void> {
  const existing = (await getMemory(uid)) ?? (await initializeMemory(uid));

  // Build conversation text for summarization
  const conversationText = conversationTurns
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n');

  if (conversationText.length < 20) return; // Too short to summarize

  try {
    const summaryPrompt = buildSummarizationPrompt(
      existing.summary,
      conversationText
    );

    const result = await providers.llm.chat(
      [{ role: 'user', content: summaryPrompt }],
      'small'
    );

    // Parse the summarization response
    let parsed: {
      summary: string;
      newFacts: string[];
      newInsideJokes: string[];
      moodTrend: string;
      topics: string[];
    };

    try {
      parsed = JSON.parse(result.text);
    } catch {
      // If parsing fails, just update the timestamp
      await db.collection('memory').doc(uid).update({ updatedAt: Date.now() });
      return;
    }

    // Merge new data, keeping limits
    const updatedFacts = [...existing.facts, ...(parsed.newFacts ?? [])].slice(-20);
    const updatedJokes = [
      ...existing.insideJokes,
      ...(parsed.newInsideJokes ?? []),
    ].slice(-10);
    const updatedTopics = (parsed.topics ?? []).slice(-5);

    await db.collection('memory').doc(uid).update({
      summary: parsed.summary || existing.summary,
      facts: updatedFacts,
      insideJokes: updatedJokes,
      moodTrend: parsed.moodTrend || existing.moodTrend,
      lastTopics: updatedTopics,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('Memory update failed:', err);
    // Non-fatal — don't break the user experience
  }
}
