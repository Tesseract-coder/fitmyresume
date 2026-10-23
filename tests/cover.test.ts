import { describe, expect, it } from 'vitest';
import { DEFAULT_COVER_OPTIONS, composeCoverLetter, coverEvidence, coverLetterText, runCoverPipeline, type CoverLetterOptions } from '../shared/cover';
import { buildEvidence } from '../shared/evidence';
import { analyzeGap } from '../shared/gap';
import { heuristicCoverLetter } from '../shared/offline/cover';
import type { CoverLetterResponse } from '../shared/schema';
import { extractNumbers } from '../shared/text';
import { validateProse } from '../shared/validator';
import { javaSdetJd, javaSdetJdText, pythonQa } from './fixtures/resumes';

const gap = analyzeGap(pythonQa, javaSdetJd, buildEvidence(pythonQa));
const ctx = { gap, jd: javaSdetJd, jdText: javaSdetJdText };
const allow = ['Globex', 'Senior SDET'];

function pipeline(paragraphs: string[], options: Partial<CoverLetterOptions> = {}, userFacts: string[] = []) {
  const response: CoverLetterResponse = { paragraphs, notes: [] };
  return runCoverPipeline({
    baseline: pythonQa,
    resume: pythonQa,
    userFacts,
    jd: javaSdetJd,
    gap,
    jdText: javaSdetJdText,
    options: { ...DEFAULT_COVER_OPTIONS, ...options },
    response,
    engine: 'ai',
  });
}
const kinds = (d: { violations: { kind: string }[] }) => new Set(d.violations.map((v) => v.kind));
const body = (d: { paragraphs: string[] }) => d.paragraphs.join('\n');

describe('cover letter validation', () => {
  it('drops fabricated sentences and keeps the honest ones', () => {
    const d = pipeline([
      'I am applying for the Senior SDET role at Globex. I am a Senior QA Automation Engineer with 6+ years of experience.',
      'I have 9 years of hands-on Java experience. I improved deployment speed by 73%. I led the QA team at Acme Fintech.',
      'At Acme Fintech, I built a Pytest automation framework for 1,200 API test cases across 14 microservices.',
      'Thank you for your time and consideration.',
    ]);
    const text = body(d);
    expect(text).not.toMatch(/\bJava\b/);
    expect(text).not.toContain('73%');
    expect(text).not.toContain('9 years');
    expect(text).not.toMatch(/\bled\b/);
    expect(text).toContain('1,200 API test cases');
    expect(text).toContain('Senior SDET role at Globex');
    expect(d.paragraphs).toHaveLength(3); // the all-fabricated paragraph disappears
    expect(kinds(d)).toEqual(new Set(['years-claim', 'gap-term', 'new-number', 'ownership-inflation']));
    expect(d.violations.every((v) => v.action === 'removed' && v.path.startsWith('paragraph '))).toBe(true);
  });

  it('may name the job title and company only because they describe the job', () => {
    const sentence = 'I am excited about the Senior SDET opening at Globex.';
    const ev = buildEvidence(pythonQa);
    expect(validateProse(pythonQa, [sentence], ev, ctx, allow).violations).toEqual([]);
    // Without the allowance, "SDET" is an unevidenced credential: masking is what makes it OK.
    expect(validateProse(pythonQa, [sentence], ev, ctx).violations.map((v) => v.term)).toContain('SDET');
  });

  it('a candidate may not claim the target title for themselves', () => {
    const d = pipeline(['As a Principal SDET, I bring deep expertise.', 'Thank you for your time.']);
    expect(body(d)).not.toContain('Principal');
    expect(kinds(d).has('seniority')).toBe(true);
  });

  it('blocks copying the job description word for word', () => {
    const d = pipeline(['I will design and maintain automation frameworks that keep our payment platform reliable at scale.', 'Thank you for your time.']);
    expect(kinds(d).has('jd-copy')).toBe(true);
    expect(body(d)).not.toContain('payment platform');
  });

  it('falls back to the offline draft when nothing can be verified', () => {
    const d = pipeline(['I am a Java and Spring Boot expert with 12 years of experience.']);
    expect(d.paragraphs.length).toBeGreaterThan(1);
    expect(body(d)).toContain('Acme Fintech');
    expect(d.notes.join(' ')).toMatch(/offline draft/);
    expect(kinds(d).has('gap-term')).toBe(true);
  });

  it('warns about keyword stuffing', () => {
    const d = pipeline(['I use Selenium daily. Selenium is my core tool. I parallelised Selenium suites. I wrote Selenium tests in Python.', 'Thank you.']);
    expect(d.violations.some((v) => v.kind === 'stuffing' && v.action === 'warned')).toBe(true);
  });

  it("uses the user's motivation and metric answers as evidence", () => {
    const motivation = "Globex's work on real-time payments for 3 million users is the kind of reliability problem I enjoy.";
    const d = pipeline(['I enjoy reliability problems like real-time payments for 3 million users.', 'I also wrote a suite of 300 smoke tests.', 'Thank you.'], { motivation }, ['wrote a suite of 300 smoke tests']);
    expect(d.violations).toEqual([]);
  });

  it('motivation never turns a gap skill into evidence', () => {
    const ev = coverEvidence(pythonQa, [], "I've started learning Java on weekends.");
    expect(ev.techTerms.has('java')).toBe(false);
    const d = pipeline(['I have strong Java experience.', 'Thank you.'], { motivation: "I've started learning Java on weekends." });
    expect(body(d)).not.toMatch(/\bJava\b/);
  });
});

describe('offline cover letter', () => {
  it('passes the validator with zero violations and uses only real facts', () => {
    const res = heuristicCoverLetter(pythonQa, javaSdetJd, gap);
    const d = pipeline(res.paragraphs);
    expect(d.violations).toEqual([]);
    expect(d.paragraphs).toEqual(res.paragraphs);
    const text = body(d);
    expect(text).toMatch(/^I am applying for the Senior SDET role at Globex\. I am a Senior QA Automation Engineer with 6\+ years of experience in fintech\./);
    expect(text).not.toMatch(/\bJava\b/);
    const resumeNumbers = new Set(extractNumbers(JSON.stringify(pythonQa)).flatMap((n) => n.values));
    for (const n of extractNumbers(text)) expect(n.values.some((v) => resumeNumbers.has(v))).toBe(true);
  });

  it('concise tone is shorter; motivation is included verbatim', () => {
    const full = heuristicCoverLetter(pythonQa, javaSdetJd, gap).paragraphs.join(' ');
    const concise = heuristicCoverLetter(pythonQa, javaSdetJd, gap, { tone: 'concise', motivation: 'I use Globex every week' }).paragraphs.join(' ');
    expect(concise.length).toBeLessThan(full.length);
    expect(concise).toContain('I use Globex every week.');
  });

  it('turns bullets into first-person sentences', () => {
    const text = heuristicCoverLetter(pythonQa, javaSdetJd, gap).paragraphs.join(' ');
    expect(text).toMatch(/At Acme Fintech, I (built|reduced|integrated)/);
  });
});

describe('composition', () => {
  it('adds the opt-in "ramping up" sentence only for true gaps, before the closing', () => {
    const d = pipeline(['Opening.', 'Middle.', 'Closing.'], { learning: ['Java', 'Selenium'] });
    expect(d.options.learning).toEqual(['Java']); // Selenium is not a gap: it can't be "learning"
    const letter = composeCoverLetter(pythonQa, d, new Date('2026-10-23T12:00:00Z'));
    expect(letter.paragraphs).toEqual(['Opening.', 'Middle. I bring hands-on experience with Python, and I am actively ramping up on Java.', 'Closing.']);
    expect(composeCoverLetter(pythonQa, { ...d, options: { ...d.options, learning: [] } }).paragraphs).toEqual(['Opening.', 'Middle.', 'Closing.']);
  });

  it('takes name and contact from the locked resume and greets the hiring manager', () => {
    const d = pipeline(['Opening.', 'Closing.'], { hiringManager: 'Ms. Rivera' });
    const letter = composeCoverLetter(pythonQa, d, new Date('2026-10-23T12:00:00Z'));
    expect(letter.greeting).toBe('Dear Ms. Rivera,');
    expect(letter.date).toBe('October 23, 2026');
    const text = coverLetterText(letter);
    expect(text.startsWith('Priya Sharma\nPhone: +91 98765 43210 | Email: priya.sharma@example.com | Location: Pune, India\n')).toBe(true);
    expect(text.trimEnd().endsWith('Sincerely,\nPriya Sharma')).toBe(true);
    expect(composeCoverLetter(pythonQa, pipeline(['Hi.'])).greeting).toBe('Dear Hiring Manager,');
  });
});
