import { buildEvidence, type EvidenceIndex } from './evidence';
import { heuristicCoverLetter } from './offline/cover';
import { contactLines } from './resume-text';
import type { CoverLetterResponse, CoverTone, GapAnalysis, JDProfile, ResumeJSON } from './schema';
import { collapseSpace } from './text';
import { validateProse, type Violation } from './validator';

export interface CoverLetterOptions {
  tone: CoverTone;
  hiringManager: string;
  /** The candidate's own words on why this role/company. Counts as evidence. */
  motivation: string;
  /** Gap skills the candidate chose to mention as "currently learning" (never as experience). */
  learning: string[];
}

export const DEFAULT_COVER_OPTIONS: CoverLetterOptions = { tone: 'professional', hiringManager: '', motivation: '', learning: [] };

export interface CoverLetterDraft {
  options: CoverLetterOptions;
  /** Validated body paragraphs (or the user's own edits of them). */
  paragraphs: string[];
  violations: Violation[];
  notes: string[];
  engine: 'ai' | 'offline';
  /** The user edited the text by hand; regenerate would discard that. */
  edited: boolean;
  generatedAt: number;
}

/**
 * Evidence for the letter: the confirmed resume, answers to metric questions, and the user's
 * motivation. Motivation adds words and numbers but never technologies: "I'm learning Java" must
 * not let the model claim Java experience (that's what the opt-in learning sentence is for).
 */
export function coverEvidence(baseline: ResumeJSON, userFacts: readonly string[], motivation: string): EvidenceIndex {
  const base = buildEvidence(baseline, userFacts);
  if (!motivation.trim()) return base;
  const withMotivation = buildEvidence(baseline, [...userFacts, motivation.trim()]);
  return { ...withMotivation, statedTerms: base.statedTerms, techTerms: base.techTerms, surfaces: base.surfaces };
}

/** Phrases about the *job* that the letter may name verbatim. */
export function allowPhrases(jd: JDProfile, options: CoverLetterOptions): string[] {
  return [jd.company ?? '', jd.title, options.hiringManager].filter((s) => s.trim());
}

/**
 * Model (or offline) output → validated body. Every sentence must be backed by the evidence; if
 * nothing survives, fall back to the deterministic letter so the user always gets a usable draft.
 */
export function runCoverPipeline(args: {
  baseline: ResumeJSON;
  resume: ResumeJSON;
  userFacts: readonly string[];
  jd: JDProfile;
  gap: GapAnalysis;
  jdText?: string;
  options: CoverLetterOptions;
  response: CoverLetterResponse;
  engine: CoverLetterDraft['engine'];
}): CoverLetterDraft {
  const { baseline, resume, userFacts, jd, gap, jdText, options, response, engine } = args;
  const evidence = coverEvidence(baseline, userFacts, options.motivation);
  const ctx = { gap, jd, ...(jdText ? { jdText } : {}) };
  const allow = allowPhrases(jd, options);
  let result = validateProse(baseline, response.paragraphs, evidence, ctx, allow);
  const notes = [...response.notes];
  if (!result.paragraphs.length) {
    const fallback = validateProse(baseline, heuristicCoverLetter(resume, jd, gap, options).paragraphs, evidence, ctx, allow);
    result = { paragraphs: fallback.paragraphs, violations: [...result.violations, ...fallback.violations] };
    notes.push("None of the AI's sentences could be verified against your resume, so this is the offline draft instead.");
  }
  const gapTerms = new Set(gap.gap.map((i) => i.surface));
  return {
    options: { ...options, learning: options.learning.filter((t) => gapTerms.has(t)) },
    paragraphs: result.paragraphs,
    violations: result.violations,
    notes,
    engine,
    edited: false,
    generatedAt: Date.now(),
  };
}

/** The only sentence that may name a gap skill: written by code, opt-in, and explicitly about learning. */
export function learningSentence(terms: readonly string[]): string {
  if (!terms.length) return '';
  const list = terms.length > 1 ? `${terms.slice(0, -1).join(', ')} and ${terms.at(-1)}` : terms[0];
  return `I am also actively building my skills in ${list}.`;
}

export interface ComposedLetter {
  name: string;
  contact: string[];
  date: string;
  greeting: string;
  paragraphs: string[];
  signoff: string;
}

/** Full letter for preview and export. Name and contact come from the locked resume fields. */
export function composeCoverLetter(resume: ResumeJSON, draft: CoverLetterDraft, date = new Date()): ComposedLetter {
  const paragraphs = draft.paragraphs.map(collapseSpace).filter(Boolean);
  const learning = learningSentence(draft.options.learning);
  if (learning) {
    // Before the closing paragraph, so the letter still ends on the thank-you.
    const at = Math.max(0, paragraphs.length - 2);
    paragraphs[at] = paragraphs[at] ? `${paragraphs[at]} ${learning}` : learning;
  }
  const manager = collapseSpace(draft.options.hiringManager);
  return {
    name: resume.contact.name,
    contact: contactLines(resume),
    date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    greeting: `Dear ${manager || 'Hiring Manager'},`,
    paragraphs,
    signoff: 'Sincerely,',
  };
}

export function coverLetterText(letter: ComposedLetter): string {
  return [letter.name, ...letter.contact, '', letter.date, '', letter.greeting, '', ...letter.paragraphs.flatMap((p) => [p, '']), letter.signoff, letter.name].join('\n') + '\n';
}
