import { describe, expect, it } from 'vitest';
import { buildEvidence } from '../shared/evidence';
import { analyzeGap } from '../shared/gap';
import { answered, metricOptions, newTechIn, phrase, quantifiedShare, setBulletText, strengthenQuestions } from '../shared/questions';
import { scoreResume } from '../shared/score';
import { javaSdetJd, pythonQa } from './fixtures/resumes';
import { SAMPLES } from './fixtures/samples';

const gap = analyzeGap(pythonQa, javaSdetJd, buildEvidence(pythonQa));
const kinds = (text: string) => metricOptions(text).map((o) => o.kind);

describe('which bullets get questions', () => {
  it('only bullets without numbers, most job-relevant first, with their role', () => {
    const qs = strengthenQuestions(pythonQa, javaSdetJd, gap);
    expect(qs.map((q) => q.bulletId).sort()).toEqual(['r1b3', 'r1b4', 'r2b1', 'r2b2', 'r2b3']);
    expect(qs[0]!.bulletId).toBe('r1b4'); // Kubernetes is a must-have for this job
    expect(qs.find((q) => q.bulletId === 'r2b2')!.role).toBe('QA Engineer · Bright Retail');
    expect(strengthenQuestions(pythonQa, javaSdetJd, gap, 2)).toHaveLength(2);
  });

  it('includes project bullets', () => {
    const david = SAMPLES.find((s) => s.file.startsWith('david'))!.resume;
    const g = analyzeGap(david, javaSdetJd, buildEvidence(david));
    const projectIds = new Set(david.experience.flatMap((r) => (r.projects ?? []).flatMap((p) => p.bullets.map((b) => b.id))));
    expect(strengthenQuestions(david, javaSdetJd, g, 20).some((q) => projectIds.has(q.bulletId))).toBe(true);
  });
});

describe('what to ask', () => {
  it('matches the question to what the bullet is about', () => {
    expect(kinds('Wrote Selenium tests in Python for the checkout flow.')).toEqual(['count', 'time', 'saved']);
    expect(metricOptions('Wrote Selenium tests in Python for the checkout flow.')[0]).toMatchObject({ prompt: 'How many tests or test cases did this involve?', defaults: { noun: 'test cases' } });
    expect(kinds('Reported and triaged defects in Jira.')).toEqual(['count', 'percent', 'saved']);
    expect(metricOptions('Reported and triaged defects in Jira.')[0]!.defaults.noun).toBe('defects');
    expect(kinds('Optimised the regression suite.')).toEqual(['percent', 'time', 'count']);
    expect(metricOptions('Optimised the regression suite.')[0]!.defaults).toEqual({ noun: 'regression time', direction: 'down' });
    expect(kinds('Mentored junior testers and onboarded new team members.')[0]).toBe('team');
    expect(kinds('Owned the release pipeline for the mobile apps.')).toEqual(['frequency', 'count', 'saved']);
    expect(kinds('Maintained the customer portal for enterprise clients.')).toEqual(['scale', 'count', 'saved']);
    expect(kinds('Documented onboarding guides.')).toEqual(['team', 'count', 'saved']);
    expect(kinds('Prepared weekly status reports.')).toEqual(['count', 'saved', 'frequency']);
  });

  it('never pre-fills a number', () => {
    for (const q of strengthenQuestions(pythonQa, javaSdetJd, gap)) for (const o of q.options) expect(JSON.stringify(o.defaults)).not.toMatch(/\d/);
  });
});

describe('wording the answer', () => {
  const b = 'Wrote Selenium tests in Python for the checkout flow.';
  it('works the user’s number into the bullet', () => {
    expect(phrase(b, 'count', { n: '120', noun: 'test cases' })).toBe('Wrote Selenium tests in Python for the checkout flow, covering 120 test cases.');
    expect(phrase('Reported and triaged defects in Jira.', 'count', { n: '85', noun: 'defects' })).toBe('Reported and triaged defects in Jira, catching 85 defects.');
    expect(phrase('Contributed to the migration of test environments to K8s.', 'count', { n: '14', noun: 'microservices' })).toBe('Contributed to the migration of test environments to K8s, across 14 microservices.');
    expect(phrase('Optimised the regression suite.', 'percent', { n: '40%', noun: 'regression time', direction: 'down' })).toBe('Optimised the regression suite, reducing regression time by 40%.');
    expect(phrase('Raised unit test coverage.', 'percent', { n: '25', noun: 'test coverage', direction: 'up' })).toBe('Raised unit test coverage, improving test coverage by 25%.');
    expect(phrase('Optimised the regression suite.', 'time', { from: '4 hours', to: '45 minutes', noun: 'regression time' })).toBe('Optimised the regression suite, cutting regression time from 4 hours to 45 minutes.');
    expect(phrase('Automated smoke checks.', 'saved', { n: '6', unit: 'hours', period: 'release' })).toBe('Automated smoke checks, saving 6 hours of manual effort per release.');
    expect(phrase(b, 'team', { n: '8' })).toBe('Wrote Selenium tests in Python for the checkout flow, as part of a team of 8.');
    expect(phrase('Owned the release pipeline.', 'frequency', { n: '4', noun: 'releases', period: 'month' })).toBe('Owned the release pipeline, supporting 4 releases per month.');
    expect(phrase('Maintained the customer portal.', 'scale', { n: '2 million', noun: 'users' })).toBe('Maintained the customer portal, serving 2 million users.');
  });

  it('requires a real number before anything can be saved', () => {
    expect(answered('count', { n: '', noun: 'test cases' })).toBe(false);
    expect(answered('count', { n: 'many', noun: 'test cases' })).toBe(false);
    expect(answered('count', { n: '120', noun: '' })).toBe(false);
    expect(answered('count', { n: '1,200', noun: 'test cases' })).toBe(true);
    expect(answered('time', { from: '4 hours', to: '', noun: 'run time' })).toBe(false);
    expect(answered('time', { from: '4 hours', to: '45 minutes', noun: 'run time' })).toBe(true);
    expect(answered('team', { n: '8' })).toBe(true);
  });
});

describe('saving answers', () => {
  it('updates only that bullet; the number becomes evidence and lifts the score', () => {
    const text = phrase('Wrote Selenium tests in Python for the checkout flow.', 'count', { n: '120', noun: 'test cases' });
    const updated = setBulletText(pythonQa, 'r2b2', text);
    expect(updated.experience[1]!.bullets[1]!.text).toBe(text);
    expect({ ...updated, experience: pythonQa.experience }).toEqual(pythonQa);
    expect(pythonQa.experience[1]!.bullets[1]!.text).not.toBe(text); // pure
    expect(buildEvidence(updated).numbers.has('120')).toBe(true);
    expect(quantifiedShare(pythonQa)).toEqual({ n: 2, total: 7 });
    expect(quantifiedShare(updated)).toEqual({ n: 3, total: 7 });
    const points = (r: typeof pythonQa) => scoreResume(r, javaSdetJd, gap).items.find((i) => i.key === 'quantified')!.points;
    expect(points(updated)).toBeGreaterThan(points(pythonQa));
  });

  it('flags (but allows) technologies the user’s wording introduces', () => {
    expect(newTechIn(pythonQa, 'r2b2', 'Wrote Selenium tests in Python, covering 120 test cases.')).toEqual([]);
    expect(newTechIn(pythonQa, 'r2b2', 'Wrote Selenium tests in Java, covering 120 test cases.')).toEqual(['Java']);
  });
});

describe('what counts as a number', () => {
  it('ignores digits inside technology names', async () => {
    const { hasNumber } = await import('../shared/text');
    for (const s of ['Migrated test environments to K8s.', 'Stored artifacts in S3 and ran EC2 runners.', 'Upgraded Log4j and HTML5 pages to ES6.']) expect(hasNumber(s), s).toBe(false);
    for (const s of ['Ran 1,200 tests.', 'Cut build time by 40%.', 'Handled 10K requests.', 'Made releases 2x faster.', 'Doubled throughput.']) expect(hasNumber(s), s).toBe(true);
  });
});
