import { describe, expect, it } from 'vitest';
import { buildEvidence, hasPhrase } from '../shared/evidence';
import { allowedTerms, analyzeGap, gapPayload, resolveJdTerms } from '../shared/gap';
import type { JDProfile } from '../shared/schema';
import { javaSdetJd, pythonQa } from './fixtures/resumes';

describe('gap analysis', () => {
  const evidence = buildEvidence(pythonQa);
  const gap = analyzeGap(pythonQa, javaSdetJd, evidence);
  const status = Object.fromEntries(gap.items.map((i) => [i.surface, i.status]));

  it('classifies matched / synonym / hidden / gap', () => {
    expect(status).toEqual({
      Java: 'gap',
      Kubernetes: 'synonym',
      Selenium: 'matched',
      'test automation': 'hidden',
      Terraform: 'hidden',
      Python: 'matched',
      'CI/CD': 'hidden',
    });
    expect(gap.synonym[0]!.resumeSurface).toBe('K8s');
    expect(gap.hidden.find((h) => h.surface === 'CI/CD')!.resumeSurface).toBe('Jenkins');
  });

  it('builds an allowlist that excludes gaps', () => {
    const allowed = allowedTerms(evidence, gap);
    expect(allowed).toContain('Kubernetes');
    expect(allowed).toContain('K8s');
    expect(allowed).not.toContain('Java');
    expect(gapPayload(gap)).toMatchObject({ gap: ['Java'], synonym: [{ jd: 'Kubernetes', resume: 'K8s' }] });
  });

  it('derives implied evidence (Pytest ⇒ Python) as hidden when not stated', () => {
    const r = structuredClone(pythonQa);
    r.skills = [{ group: 'Testing', items: ['Pytest'] }];
    r.summary = 'QA engineer.';
    r.experience.forEach((e) => e.bullets.forEach((b) => (b.text = b.text.replace(/Python/g, 'scripts'))));
    const g = analyzeGap(r, javaSdetJd);
    expect(g.items.find((i) => i.canonical === 'python')).toMatchObject({ status: 'hidden', resumeSurface: 'Pytest' });
  });

  it('de-duplicates terms across tiers, keeping the higher tier and weight', () => {
    const jd: JDProfile = { ...javaSdetJd, keywords: [{ canonical: 'k8s', surface: 'K8s', weight: 1 }, { canonical: '', surface: '', weight: 1 }], niceToHave: [{ canonical: 'Kubernetes', surface: 'Kubernetes', weight: 3 }] };
    const terms = resolveJdTerms(jd);
    expect(terms.filter((t) => t.canonical === 'kubernetes')).toEqual([{ canonical: 'kubernetes', surface: 'Kubernetes', weight: 3, importance: 'must', known: true }]);
  });

  it('matches free phrases by stemmed n-grams', () => {
    expect(hasPhrase(evidence, 'API test case')).toBe(true);
    expect(hasPhrase(evidence, 'chaos engineering')).toBe(false);
    expect(hasPhrase(evidence, '')).toBe(false);
    expect(hasPhrase(evidence, 'regression time parallel selenium docker containers')).toBe(true);
  });
});
