import { describe, expect, it } from 'vitest';
import { buildEvidence } from '../shared/evidence';
import { analyzeGap } from '../shared/gap';
import { runTailorPipeline } from '../shared/pipeline';
import { scoreResume, startsWithActionVerb } from '../shared/score';
import { javaSdetJd, pythonQa } from './fixtures/resumes';

const evidence = buildEvidence(pythonQa);
const gap = analyzeGap(pythonQa, javaSdetJd, evidence);

describe('ATS score engine', () => {
  it('is deterministic and the breakdown sums to the total', () => {
    const a = scoreResume(pythonQa, javaSdetJd, gap);
    const b = scoreResume(structuredClone(pythonQa), structuredClone(javaSdetJd), analyzeGap(pythonQa, javaSdetJd));
    expect(a).toEqual(b);
    expect(a.items.reduce((s, i) => s + i.points, 0)).toBe(a.total);
    expect(a.items.map((i) => i.max).reduce((x, y) => x + y, 0)).toBe(100);
    for (const i of a.items) expect(i.points).toBeLessThanOrEqual(i.max);
  });

  it('caps the score honestly when must-haves are true gaps', () => {
    const s = scoreResume(pythonQa, javaSdetJd, gap);
    // Java is weight 3 of 11 must-have weight → 30 × 3/11 ≈ 8.2 points unreachable.
    expect(s.cap).toEqual({ max: 92, gaps: ['Java'] });
  });

  it('rises after tailoring (synonym wording + promoted skills) but never above the cap', () => {
    const before = scoreResume(pythonQa, javaSdetJd, gap);
    const out = runTailorPipeline({
      original: pythonQa,
      evidence,
      jd: javaSdetJd,
      gap,
      response: {
        summary: 'QA Automation Engineer with 6+ years of experience in Python test automation for fintech. Skilled in Selenium, Kubernetes and CI/CD. Reduced regression time by 40%.',
        skills: pythonQa.skills,
        bulletEdits: [],
        bulletOrder: [],
        metricQuestions: [],
        notes: [],
      },
    });
    const after = scoreResume(out.tailored, javaSdetJd, gap);
    expect(after.total).toBeGreaterThan(before.total);
    expect(after.items.find((i) => i.key === 'must')!.points).toBeGreaterThan(before.items.find((i) => i.key === 'must')!.points);
    expect(after.total).toBeLessThanOrEqual(after.cap.max);
  });

  it('penalises multi-column source formatting and handles empty tiers', () => {
    const s = scoreResume(pythonQa, { ...javaSdetJd, mustHave: [], niceToHave: [], keywords: [], title: '' }, analyzeGap(pythonQa, { ...javaSdetJd, mustHave: [], niceToHave: [], keywords: [] }), { formattingSafe: false });
    expect(s.items.find((i) => i.key === 'format')!.points).toBe(2);
    expect(s.items.find((i) => i.key === 'must')!.points).toBe(30);
    expect(s.items.find((i) => i.key === 'title')!.points).toBe(8);
    expect(s.cap.max).toBe(100);
  });

  it('scores sections and contact details', () => {
    const r = structuredClone(pythonQa);
    r.education = [];
    r.contact.links = [];
    r.contact.email = 'nope';
    const s = scoreResume(r, javaSdetJd, gap);
    expect(s.items.find((i) => i.key === 'sections')!.points).toBe(6);
    expect(s.items.find((i) => i.key === 'contact')!.points).toBe(3);
  });

  it('recognises action-verb openings', () => {
    expect(startsWithActionVerb('Built a framework')).toBe(true);
    expect(startsWithActionVerb('Responsible for testing')).toBe(false);
  });
});
