import { extractTerms, impliedBy } from './ontology';
import { claimsText } from './resume-text';
import type { ResumeJSON } from './schema';
import { extractNumbers, ngrams, stemTokens, tokenize } from './text';

/**
 * Everything the original resume can vouch for. Built once from the user-confirmed resume;
 * the validator rejects any tailored content that is not backed by it.
 */
export interface EvidenceIndex {
  /** Stemmed lower-case tokens. */
  tokens: Set<string>;
  /** Stemmed 1–4-grams joined by spaces. */
  ngrams: Set<string>;
  /** Ontology canonicals stated in the resume. */
  statedTerms: Set<string>;
  /** statedTerms plus everything they imply (Pytest ⇒ Python). */
  techTerms: Set<string>;
  /** canonical → surfaces exactly as the candidate wrote them. */
  surfaces: Map<string, Set<string>>;
  /** Canonical numeric values from the resume and from user answers. */
  numbers: Set<string>;
  /** Unstemmed lower-case words (number words like "doubled", ownership verbs like "led"). */
  words: Set<string>;
  /** Raw facts the user typed in answer to metric questions. */
  userFacts: string[];
}

export function buildEvidence(resume: ResumeJSON, userFacts: readonly string[] = []): EvidenceIndex {
  const text = [claimsText(resume), ...userFacts].join('\n');
  const stemmed = stemTokens(text);
  const index: EvidenceIndex = {
    tokens: new Set(stemmed),
    ngrams: ngrams(stemmed, 4),
    statedTerms: new Set(),
    techTerms: new Set(),
    surfaces: new Map(),
    numbers: new Set(),
    words: new Set(tokenize(text)),
    userFacts: [...userFacts],
  };
  for (const m of extractTerms(text)) {
    index.statedTerms.add(m.canonical);
    index.techTerms.add(m.canonical);
    for (const imp of impliedBy(m.canonical)) index.techTerms.add(imp);
    const set = index.surfaces.get(m.canonical) ?? new Set<string>();
    set.add(m.surface);
    index.surfaces.set(m.canonical, set);
  }
  // Numbers anywhere in the resume count, including dates and locked fields (e.g. "8+ years").
  const numberSource = [text, JSON.stringify(resume.experience.map((r) => [r.startDate, r.endDate])), JSON.stringify(resume.education), JSON.stringify(resume.certifications), JSON.stringify(resume.awards)].join('\n');
  for (const n of extractNumbers(numberSource)) for (const v of n.values) index.numbers.add(v);
  return index;
}

/** Add user-supplied facts (answers to metric questions) to an existing index. */
export function withUserFacts(resume: ResumeJSON, evidence: EvidenceIndex, facts: readonly string[]): EvidenceIndex {
  return buildEvidence(resume, [...evidence.userFacts, ...facts]);
}

/** Does the evidence contain this (free-text) phrase, after stemming? */
export function hasPhrase(evidence: EvidenceIndex, phrase: string): boolean {
  const toks = stemTokens(phrase);
  if (!toks.length) return false;
  if (toks.length <= 4) return evidence.ngrams.has(toks.join(' '));
  return toks.every((t) => evidence.tokens.has(t));
}
