import { describe, expect, it } from 'vitest';
import { buildEvidence } from '../shared/evidence';
import { analyzeGap } from '../shared/gap';
import { DEFAULT_LINKEDIN_OPTIONS, composeLinkedIn, experienceEntries, profileSkills, runLinkedInPipeline, type LinkedInOptions } from '../shared/linkedin';
import { heuristicLinkedIn } from '../shared/offline/linkedin';
import type { LinkedInResponse } from '../shared/schema';
import { javaSdetJd, javaSdetJdText, pythonQa } from './fixtures/resumes';
import { SAMPLES } from './fixtures/samples';

const gap = analyzeGap(pythonQa, javaSdetJd, buildEvidence(pythonQa));

function pipeline(response: LinkedInResponse, options: Partial<LinkedInOptions> = {}) {
  return runLinkedInPipeline({ baseline: pythonQa, resume: pythonQa, userFacts: [], jd: javaSdetJd, gap, jdText: javaSdetJdText, options: { ...DEFAULT_LINKEDIN_OPTIONS, ...options }, response, engine: 'ai' });
}
const kinds = (d: { violations: { kind: string }[] }) => new Set(d.violations.map((v) => v.kind));

describe('offline LinkedIn profile', () => {
  const offline = heuristicLinkedIn(pythonQa, javaSdetJd, gap);

  it('passes the validator untouched', () => {
    const d = pipeline(offline);
    expect(d.violations).toEqual([]);
    expect(d.headline).toBe(offline.headline);
    expect(d.about).toEqual(offline.about);
  });

  it('headline: real title, evidenced skills in the job’s wording, evidenced domain', () => {
    expect(offline.headline).toBe('Senior QA Automation Engineer | Kubernetes · Test automation · Selenium · Terraform | Fintech');
    expect(offline.headline.length).toBeLessThanOrEqual(200);
  });

  it('About is first person, fact-only, and never names the target company or a gap', () => {
    const text = offline.about.join(' ');
    expect(text).toMatch(/^I'm a Senior QA Automation Engineer with 6\+ years of experience in fintech\./);
    expect(text).toContain('At Acme Fintech, I built a Pytest automation framework for 1,200 API test cases');
    expect(text).not.toMatch(/\bJava\b|Globex/);
  });
});

describe('LinkedIn validation', () => {
  it('replaces an inflated headline and removes fabricated or company-naming sentences', () => {
    const d = pipeline({
      headline: 'Principal Java Architect | Python · Selenium',
      about: [
        "I'm a Senior QA Automation Engineer with 6+ years of experience in fintech.",
        "I have 12 years of Java experience and I'm excited to bring it to Globex. I enjoy building reliable test suites.",
      ],
      notes: [],
    });
    expect(d.headline).toBe(heuristicLinkedIn(pythonQa, javaSdetJd, gap).headline);
    expect(d.notes.join(' ')).toMatch(/offline headline/);
    expect(d.about).toEqual(["I'm a Senior QA Automation Engineer with 6+ years of experience in fintech.", 'I enjoy building reliable test suites.']);
    expect(kinds(d)).toEqual(new Set(['seniority', 'gap-term', 'target-company']));
    expect(d.violations.find((v) => v.kind === 'target-company')).toMatchObject({ path: 'paragraph 2', action: 'removed', term: 'Globex' });
    expect(d.violations.filter((v) => v.path === 'headline').length).toBeGreaterThan(0);
  });

  it('a headline over 220 characters falls back to the offline one', () => {
    const d = pipeline({ headline: `Senior QA Automation Engineer | ${'Python · '.repeat(30)}`, about: ['I enjoy building reliable test suites.'], notes: [] });
    expect(d.headline.length).toBeLessThanOrEqual(220);
    expect(d.headline.startsWith('Senior QA Automation Engineer |')).toBe(true);
  });

  it('falls back to the offline About when nothing can be verified', () => {
    const d = pipeline({ headline: 'Senior QA Automation Engineer', about: ['I am a Java expert with 20 years of experience.'], notes: [] });
    expect(d.about.join(' ')).toContain('Acme Fintech');
    expect(d.notes.join(' ')).toMatch(/offline draft/);
  });
});

describe('composition', () => {
  const draft = pipeline(heuristicLinkedIn(pythonQa, javaSdetJd, gap));

  it('adds a Core skills line by default: evidenced only, standard names, no gaps', () => {
    const p = composeLinkedIn(pythonQa, draft, javaSdetJd, gap);
    const line = p.extras.at(-1)!;
    expect(line.startsWith('Core skills: Kubernetes · Test automation · Selenium')).toBe(true);
    expect(line).not.toMatch(/\bJava\b|K8s/);
    expect(p.pinned).toEqual(['Kubernetes', 'Test automation', 'Selenium']);
    expect(p.about.endsWith(line)).toBe(true);
  });

  it('learning and open-to lines are opt-in and code-written', () => {
    const none = composeLinkedIn(pythonQa, { ...draft, options: { skillsLine: false, learning: false, openTo: false } }, javaSdetJd, gap, ['Java']);
    expect(none.extras).toEqual([]);
    const all = composeLinkedIn(pythonQa, { ...draft, options: { skillsLine: false, learning: true, openTo: true } }, javaSdetJd, gap, ['Java', 'Selenium']);
    expect(all.extras).toEqual(['I bring hands-on experience with Python, and I am actively ramping up on Java.', "I'm open to Senior SDET opportunities in fintech."]);
  });

  it('shortens the About to LinkedIn’s 2,600-character limit, keeping the code-written lines', () => {
    const long = { ...draft, about: ['A'.repeat(1500) + '.', 'B'.repeat(1500) + '.'] };
    const p = composeLinkedIn(pythonQa, long, javaSdetJd, gap);
    expect(p.truncated).toBe(true);
    expect(p.about.length).toBeLessThanOrEqual(2600);
    expect(p.body).toHaveLength(1);
    expect(p.about).toContain('Core skills:');
  });

  it('experience text mirrors the tailored resume, including projects', () => {
    const [acme] = experienceEntries(pythonQa);
    expect(acme).toMatchObject({ title: 'Senior QA Automation Engineer', company: 'Acme Fintech', dates: 'Jan 2021 – Present' });
    expect(acme!.description.split('\n')[0]).toBe('• Built a Pytest automation framework for 1,200 API test cases across 14 microservices.');
    const david = SAMPLES.find((x) => x.file.startsWith('david'))!.resume;
    expect(experienceEntries(david).some((e) => e.description.includes('Bank Migration (client: Northbank)'))).toBe(true);
  });

  it('profile skills de-duplicate aliases and cap at 15', () => {
    const skills = profileSkills(pythonQa, gap);
    expect(skills.filter((x) => /kubernetes|k8s/i.test(x))).toEqual(['Kubernetes']);
    expect(skills).toEqual(expect.arrayContaining(['Postman', 'Docker', 'Jenkins', 'Python']));
    expect(profileSkills(pythonQa, gap, 4)).toHaveLength(4);
  });
});
