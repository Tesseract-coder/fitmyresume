/** Text normalisation helpers shared by the evidence index, validator, gap analysis and scorer. */

export function normalizeSpace(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whitespace-only cleanup that keeps the characters verbatim (dashes, quotes). Used for stored text. */
export function collapseSpace(s: string): string {
  return s.replace(/[\s\u00a0]+/g, ' ').trim();
}

/** Light, deterministic stemmer: only folds plurals so "microservices" ≈ "microservice". */
export function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us')) {
    return token.slice(0, -1);
  }
  return token;
}

/** Lower-cased word tokens, keeping tech punctuation (c++, c#, node.js, ci/cd). */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}+#./&'-]*/gu;
  for (const m of normalizeSpace(s).toLowerCase().matchAll(re)) {
    // Trim trailing punctuation that belongs to the sentence, not the token.
    const t = m[0].replace(/[.'/&-]+$/u, '');
    if (t) out.push(t);
  }
  return out;
}

export function stemTokens(s: string): string[] {
  return tokenize(s).map(stem);
}

export function ngrams(tokens: string[], maxN = 4): Set<string> {
  const set = new Set<string>();
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) set.add(tokens.slice(i, i + n).join(' '));
  }
  return set;
}

/** Normalised phrase key used to compare free-text terms ("Test Strategies" → "test strategy"). */
export function phraseKey(s: string): string {
  return stemTokens(s.replace(/[-_]/g, ' ')).join(' ');
}

export function splitSentences(s: string): string[] {
  const text = normalizeSpace(s);
  if (!text) return [];
  // Split on . ! ? followed by space + capital/digit; avoid splitting "e.g." / "Node.js".
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/u);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function wordCount(s: string): number {
  const t = normalizeSpace(s);
  return t ? t.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

const NUMBER_RE = /(?<![\p{L}])(\d+(?:[.,]\d+)*)(?:\s?([kKmMbB])(?![\p{L}]))?/gu;

/**
 * Every numeric value in the text, normalised. "1,200" → "1200"; "10K" → "10" and "10000".
 * Returns the raw forms (for display) and their canonical values.
 */
export function extractNumbers(s: string): { raw: string; values: string[] }[] {
  const out: { raw: string; values: string[] }[] = [];
  for (const m of normalizeSpace(s).matchAll(NUMBER_RE)) {
    const digits = m[1]!;
    const suffix = m[2]?.toLowerCase();
    const values = new Set<string>();
    const plain = canonicalNumber(digits);
    values.add(plain);
    if (suffix) {
      const mult = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : 1e9;
      const n = Number(plain) * mult;
      if (Number.isFinite(n)) values.add(String(Math.round(n * 100) / 100));
    }
    out.push({ raw: m[0], values: [...values] });
  }
  return out;
}

function canonicalNumber(digits: string): string {
  // "1,200" / "1,200,000" are thousands separators; "1.5" is a decimal; "3,5" (EU decimal) stays as written.
  if (/^\d{1,3}(,\d{3})+$/.test(digits)) return digits.replace(/,/g, '');
  if (/^\d+\.\d+$/.test(digits)) return String(Number(digits));
  return digits.replace(/^0+(?=\d)/, '');
}

/** Words that assert a quantity. "one" is excluded: it is too common in non-numeric phrasing. */
export const NUMBER_WORDS = new Set([
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'hundreds',
  'thousand', 'thousands', 'million', 'millions', 'billion', 'billions', 'dozen', 'dozens',
  'double', 'doubled', 'doubling', 'triple', 'tripled', 'tripling', 'quadrupled', 'halved',
  'twice', 'thrice', 'tenfold', 'several-fold', 'percent',
]);

export function extractNumberWords(s: string): string[] {
  return tokenize(s).filter((t) => NUMBER_WORDS.has(t));
}

/**
 * Does the text state a quantity? Digits glued to letters are names, not numbers
 * ("K8s", "EC2", "S3", "Log4j", "HTML5"); "10K", "40%", "1,200" and "2x" still count.
 */
export function hasNumber(s: string): boolean {
  return /(?<![\p{L}])\d/u.test(s) || extractNumberWords(s).length > 0;
}
