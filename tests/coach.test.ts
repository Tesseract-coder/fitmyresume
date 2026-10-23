import { describe, expect, it } from 'vitest';
import { CERTIFICATIONS, FAMILIES, RESOURCES, coachGaps, coverLetterLine, learningLines } from '../shared/coach';
import { buildEvidence } from '../shared/evidence';
import { analyzeGap } from '../shared/gap';
import { extractTerms, getTerm } from '../shared/ontology';
import type { JDProfile } from '../shared/schema';
import { validateProse } from '../shared/validator';
import { pythonQa } from './fixtures/resumes';

const jd: JDProfile = {
  title: 'Senior SDET',
  seniority: 'senior',
  domain: 'fintech',
  company: 'Globex',
  mustHave: [
    { canonical: 'java', surface: 'Java', weight: 3 },
    { canonical: 'playwright', surface: 'Playwright', weight: 2 },
    { canonical: 'azure', surface: 'Azure', weight: 2 },
    { canonical: 'selenium', surface: 'Selenium', weight: 2 },
  ],
  niceToHave: [
    { canonical: 'rust', surface: 'Rust', weight: 1 },
    { canonical: 'chaos engineering', surface: 'chaos engineering', weight: 2 },
  ],
  responsibilities: [],
  softSkills: [],
  keywords: [{ canonical: 'graphql', surface: 'GraphQL', weight: 1 }],
};
const evidence = buildEvidence(pythonQa);
const gap = analyzeGap(pythonQa, jd, evidence);
const items = coachGaps(gap, evidence);
const by = (surface: string) => items.find((i) => i.surface === surface)!;

describe('skills-gap coach', () => {
  it('covers exactly the true gaps, must-haves first then by weight', () => {
    expect(items.map((i) => i.surface)).toEqual(['Java', 'Azure', 'Playwright', 'chaos engineering', 'Rust', 'GraphQL']);
    expect(items.map((i) => i.importance)).toEqual(['must', 'must', 'must', 'nice', 'nice', 'keyword']);
  });

  it('finds close transfers within a skill family (Selenium → Playwright)', () => {
    const pw = by('Playwright');
    expect(pw).toMatchObject({ closeness: 'close', transfers: ['Selenium'], sharedSkill: 'browser test automation' });
    expect(pw.steps[1]).toBe('Port a handful of your existing Selenium tests to Playwright and compare locators, waits and reporting.');
    expect(pw.resource?.url).toBe('https://playwright.dev/docs/intro');
  });

  it('finds broad transfers between general-purpose languages, never from SQL', () => {
    const java = by('Java');
    expect(java).toMatchObject({ closeness: 'broad', transfers: ['Python'] });
    expect(java.coverLetterLine).toBe('I bring hands-on experience with Python, and I am actively ramping up on Java.');
    expect(java.certification).toMatch(/Oracle/);
    expect(by('Rust').transfers).toEqual(['Python']);
  });

  it('says so plainly when nothing transfers', () => {
    for (const s of ['Azure', 'GraphQL', 'chaos engineering']) {
      expect(by(s)).toMatchObject({ closeness: 'none', transfers: [] });
      expect(by(s).coverLetterLine).toBe(`I am actively building my skills in ${s}.`);
    }
    expect(by('chaos engineering').resource).toBeUndefined();
    expect(by('chaos engineering').steps[0]).toBe('Start with the official chaos engineering documentation and its getting-started guide.');
    expect(by('Azure').certification).toMatch(/AZ-900/);
  });

  it('cover letter lines only name evidenced skills plus the gap, framed as learning', () => {
    for (const item of items) {
      const named = new Set(extractTerms(item.coverLetterLine).map((m) => m.canonical));
      named.delete(item.canonical);
      for (const c of named) expect(evidence.techTerms.has(c), `${item.surface}: ${c}`).toBe(true);
      expect(item.coverLetterLine).toMatch(/ramping up on|building my skills in/);
      // With the gap itself allowed, the validator finds nothing else to object to.
      expect(validateProse(pythonQa, [item.coverLetterLine], evidence, { gap, jd }, [item.surface]).violations).toEqual([]);
    }
  });

  it('interview answers admit the gap first and change once the user is learning', () => {
    for (const item of items) expect(item.interviewAnswer.startsWith(`"I haven't used ${item.surface} in a professional role yet.`)).toBe(true);
    expect(by('Playwright').interviewAnswer).toContain('My closest experience is Selenium, which is the same kind of work (browser test automation)');
    expect(by('Playwright').interviewAnswer).toContain('My plan would be to start with Playwright — Getting started');
    expect(by('Java').interviewAnswer).toContain('My closest experience is Python, which shares the fundamentals (general-purpose programming)');
    const learning = coachGaps(gap, evidence, ['Playwright']).find((i) => i.surface === 'Playwright')!;
    expect(learning.interviewAnswer).toContain("I've already started learning it with Playwright — Getting started.");
  });

  it('every step ends by pointing back to real evidence, not the resume', () => {
    for (const item of items) expect(item.steps.at(-1)).toMatch(/add it to your resume on the Confirm screen/);
  });

  it('learningLines resolves the JD wording through the ontology', () => {
    expect(learningLines(['Playwright', 'Java'], evidence)).toEqual([
      'I bring hands-on experience with Selenium, and I am actively ramping up on Playwright.',
      'I bring hands-on experience with Python, and I am actively ramping up on Java.',
    ]);
    expect(coverLetterLine('Go', ['Python', 'Rust', 'C'])).toBe('I bring hands-on experience with Python, Rust and C, and I am actively ramping up on Go.');
  });
});

describe('curated coach data', () => {
  it('only references real ontology terms', () => {
    for (const f of FAMILIES) for (const m of f.members) expect(getTerm(m), `${f.label}: ${m}`).toBeDefined();
    for (const k of [...Object.keys(RESOURCES), ...Object.keys(CERTIFICATIONS)]) expect(getTerm(k), k).toBeDefined();
  });

  it('links only to https first-party documentation', () => {
    for (const r of Object.values(RESOURCES)) expect(r.url).toMatch(/^https:\/\/[a-z0-9.-]+\//);
  });

  it('never treats a skill as transferring to itself', () => {
    for (const item of items) expect(item.transfers.map((t) => t.toLowerCase())).not.toContain(item.surface.toLowerCase());
  });
});
