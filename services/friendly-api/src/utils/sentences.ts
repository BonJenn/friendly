const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'ave', 'blvd',
  'vs', 'etc', 'inc', 'ltd', 'dept', 'est', 'approx',
  'u.s', 'u.k', 'e.g', 'i.e',
]);

// Matches sentence-ending punctuation followed by whitespace or end of string
const SENTENCE_END_RE = /([.!?]+)(\s+|$)/g;

export function extractSentences(buffer: string): {
  sentences: string[];
  remainder: string;
} {
  const sentences: string[] = [];
  let lastIndex = 0;

  SENTENCE_END_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_END_RE.exec(buffer)) !== null) {
    const punctEnd = match.index + match[1].length;
    const candidate = buffer.slice(lastIndex, punctEnd).trim();

    if (!candidate) continue;

    // Check if this is an abbreviation (word before the period)
    if (match[1] === '.') {
      const wordBefore = candidate.replace(/\.$/, '').split(/\s+/).pop()?.toLowerCase() ?? '';
      if (ABBREVIATIONS.has(wordBefore) || ABBREVIATIONS.has(wordBefore.replace(/\./g, ''))) {
        continue;
      }
      // Skip decimal numbers like "3.5"
      if (/\d\.$/.test(candidate) && match.index + match[0].length < buffer.length) {
        const charAfter = buffer[punctEnd + (match[2]?.length ?? 0)];
        if (charAfter && /\d/.test(charAfter)) {
          continue;
        }
      }
    }

    sentences.push(candidate);
    lastIndex = match.index + match[0].length;
  }

  const remainder = buffer.slice(lastIndex).trim();
  return { sentences, remainder };
}
