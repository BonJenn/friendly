import * as admin from 'firebase-admin';

/**
 * Safety service: detect crisis signals and enforce content policy.
 *
 * This is a heuristic-based first pass. In production, layer in:
 * - A classifier model for more nuanced detection
 * - Human-in-the-loop review for flagged sessions
 * - Logging of flagged content for safety team review
 */

const CRISIS_PATTERNS = [
  /\b(kill\s*(my)?self|suicide|suicidal)\b/i,
  /\b(want\s*to\s*die|don'?t\s*want\s*to\s*live)\b/i,
  /\b(end\s*(it|my\s*life)|ending\s*(it|my\s*life))\b/i,
  /\b(self[- ]?harm|cutting\s*myself|hurt\s*myself)\b/i,
  /\b(no\s*(point|reason)\s*(in|to)\s*living)\b/i,
  /\b(better\s*off\s*(dead|without\s*me))\b/i,
];

const ROMANTIC_SEXUAL_PATTERNS = [
  /\b(i\s*love\s*you|be\s*my\s*(girl|boy)friend)\b/i,
  /\b(let'?s\s*(date|be\s*together|hook\s*up))\b/i,
  /\b(sexy|seduce|turn\s*me\s*on)\b/i,
  /\b(send\s*(me\s*)?nudes|sext)\b/i,
];

export interface SafetyCheckResult {
  isCrisis: boolean;
  isRomanticSexual: boolean;
  crisisResponse: string | null;
  boundaryResponse: string | null;
}

export function checkSafety(text: string): SafetyCheckResult {
  const isCrisis = CRISIS_PATTERNS.some((p) => p.test(text));
  const isRomanticSexual = ROMANTIC_SEXUAL_PATTERNS.some((p) => p.test(text));

  return {
    isCrisis,
    isRomanticSexual,
    crisisResponse: isCrisis
      ? `Hey, I hear you and I care about you a lot. What you're feeling is real and it matters. Please reach out to someone who can really help:\n\n988 Suicide & Crisis Lifeline: Call or text 988\nCrisis Text Line: Text HOME to 741741\n\nYou don't have to go through this alone. I'm here to talk, but these folks are trained to help in ways I can't. Will you reach out to them?`
      : null,
    boundaryResponse: isRomanticSexual
      ? "Haha okay, I appreciate the love but you know we're not like that! I'm your ride-or-die friend though, always. Anyway, what else is going on with you?"
      : null,
  };
}

/**
 * Log a safety flag for review. In production, this should:
 * - Write to a secure, access-controlled collection
 * - Trigger an alert to the safety team
 * - Not be readable by the user
 */
export async function logSafetyFlag(
  uid: string,
  sessionId: string,
  type: 'crisis' | 'romantic_sexual',
  userText: string
): Promise<void> {
  const db = admin.firestore();

  await db.collection('safety_flags').add({
    uid,
    sessionId,
    type,
    userTextSnippet: userText.slice(0, 200), // Don't store full text
    createdAt: Date.now(),
    reviewed: false,
  });
}
