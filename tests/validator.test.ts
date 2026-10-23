import { describe, expect, it } from 'vitest';
import { buildEvidence, withUserFacts } from '../shared/evidence';
import { analyzeGap } from '../shared/gap';
import { runTailorPipeline } from '../shared/pipeline';
import { claimsText, renderPlainText, roleBullets } from '../shared/resume-text';
import type { ResumeJSON, TailorResponse } from '../shared/schema';
import { deepEqual, validateTailoredResume } from '../shared/validator';
import { javaSdetJd, javaSdetJdText, pythonQa } from './fixtures/resumes';

const evidence = buildEvidence(pythonQa);
const gap = analyzeGap(pythonQa, javaSdetJd, evidence);
const ctx = { gap, jd: javaSdetJd, jdText: javaSdetJdText };

function propose(mut: (r: ResumeJSON) => void): ResumeJSON {
  const r = structuredClone(pythonQa);
  mut(r);
  return r;
}
const bullet = (r: ResumeJSON, id: string) => r.experience.flatMap(roleBullets).find((b) => b.id === id)!;
const validate = (p: ResumeJSON, c = ctx) => validateTailoredResume(pythonQa, p, evidence, c);
const kinds = (res: { violations: { kind: string }[] }) => res.violations.map((v) => v.kind);

function response(partial: Partial<TailorResponse>): TailorResponse {
  return { summary: pythonQa.summary, skills: pythonQa.skills, bulletEdits: [], bulletOrder: [], metricQuestions: [], notes: [], ...partial };
}

/* ================================================================== */
/* Golden tests (§12 M4)                                               */
/* ================================================================== */

describe('golden: Python-only candidate + Java JD', () => {
  const out = runTailorPipeline({
    original: pythonQa,
    evidence,
    jd: javaSdetJd,
    gap,
    jdText: javaSdetJdText,
    response: response({
      summary:
        'QA Automation Engineer with 6+ years of experience in Java and Python test automation. Built Pytest frameworks for API testing in fintech.',
      skills: [
        { group: 'Languages', items: ['Java', 'Python', 'SQL'] },
        { group: 'Testing', items: ['Selenium', 'Pytest', 'Postman', 'JUnit'] },
      ],
      bulletEdits: [
        { bulletId: 'r2b2', newText: 'Wrote Selenium tests in Java and Python for the checkout flow.', reason: 'JD wants Java', jdTermsUsed: ['Java'] },
        { bulletId: 'r1b1', newText: 'Built a Pytest test automation framework for 1,200 API test cases across 14 microservices.', reason: 'JD wording', jdTermsUsed: ['test automation'] },
      ],
    }),
  });
  const text = renderPlainText(out.tailored);

  it('never outputs Java anywhere', () => {
    expect(/\bJava\b/.test(text)).toBe(false);
    expect(/\bJUnit\b/.test(text)).toBe(false);
  });

  it('lists Java in the gap report and logs blocked changes', () => {
    expect(gap.gap.map((g) => g.surface)).toEqual(['Java']);
    expect(out.violations.filter((v) => v.kind === 'gap-term').map((v) => v.term)).toEqual(expect.arrayContaining(['Java']));
    expect(out.violations.some((v) => v.term === 'JUnit' && v.kind === 'unsupported-term')).toBe(true);
  });

  it('keeps the honest parts of the rewrite', () => {
    expect(bullet(out.tailored, 'r1b1').text).toContain('test automation framework');
    expect(bullet(out.tailored, 'r2b2').text).toBe(bullet(pythonQa, 'r2b2').text);
    expect(out.tailored.summary).toBe('Built Pytest frameworks for API testing in fintech.');
  });
});

describe('golden: fake metric', () => {
  it('reverts "improved by 40%"-style invented numbers and logs it', () => {
    const p = propose((r) => {
      bullet(r, 'r2b3').text = 'Reported and triaged defects in Jira, improving release quality by 35%.';
    });
    const res = validate(p);
    expect(bullet(res.resume, 'r2b3').text).toBe('Reported and triaged defects in Jira.');
    expect(res.violations).toEqual([expect.objectContaining({ kind: 'new-number', path: 'bullet:r2b3', term: '35%'.replace('%', ''), action: 'reverted' })]);
  });

  it('allows a number that already exists in the resume', () => {
    const p = propose((r) => {
      bullet(r, 'r1b2').text = 'Cut regression time by 40% by running Selenium suites in parallel on Docker.';
    });
    const res = validate(p);
    expect(res.violations).toEqual([]);
    expect(bullet(res.resume, 'r1b2').text).toContain('Cut regression');
  });

  it('blocks invented number words and unseen magnitudes', () => {
    const p = propose((r) => {
      bullet(r, 'r2b3').text = 'Reported and triaged hundreds of defects in Jira.';
      bullet(r, 'r2b1').text = 'Tested 10K REST API calls with Postman.';
    });
    const res = validate(p);
    expect(kinds(res)).toEqual(['new-number', 'new-number']);
  });

  it('accepts a user-supplied number once it is in the evidence', () => {
    const ev = withUserFacts(pythonQa, evidence, ['The suite has 350 tests']);
    const p = propose((r) => {
      bullet(r, 'r2b2').text = 'Wrote 350 Selenium tests in Python for the checkout flow.';
    });
    expect(validateTailoredResume(pythonQa, p, ev, ctx).violations).toEqual([]);
  });
});

describe('golden: locked fields', () => {
  it('restores a changed job title and dates', () => {
    const p = propose((r) => {
      r.experience[1]!.title = 'Senior QA Engineer';
      r.experience[1]!.startDate = 'Jan 2017';
    });
    const res = validate(p);
    expect(res.resume.experience[1]!.title).toBe('QA Engineer');
    expect(res.resume.experience[1]!.startDate).toBe('Jun 2018');
    expect(kinds(res)).toEqual(['locked-field', 'locked-field']);
  });

  it('restores contact, years, education, certifications, awards and extras', () => {
    const p = propose((r) => {
      r.contact.name = 'Priya S.';
      r.yearsOfExperience = '8+ years';
      r.education[0]!.gpa = '9.5';
      r.certifications.push({ name: 'AWS Certified Developer' });
      r.awards = [];
      r.extras = [{ heading: 'Projects', items: ['x'] }];
    });
    const res = validate(p);
    expect(deepEqual(res.resume.contact, pythonQa.contact)).toBe(true);
    expect(res.resume.yearsOfExperience).toBe('6+ years');
    expect(res.resume.education).toEqual(pythonQa.education);
    expect(res.resume.certifications).toEqual(pythonQa.certifications);
    expect(res.resume.awards).toEqual(pythonQa.awards);
    expect(res.resume.extras).toBeUndefined();
    expect(res.violations.map((v) => v.path)).toEqual(['contact', 'yearsOfExperience', 'education', 'certifications', 'awards', 'extras']);
  });

  it('restores extras that were present in the original', () => {
    const orig: ResumeJSON = { ...structuredClone(pythonQa), extras: [{ heading: 'Projects', items: ['Open-source Pytest plugin'] }] };
    const p = structuredClone(orig);
    p.extras = [{ heading: 'Projects', items: ['Open-source Java plugin'] }];
    const res = validateTailoredResume(orig, p, buildEvidence(orig));
    expect(res.resume.extras).toEqual(orig.extras);

    const deleted = structuredClone(orig);
    delete deleted.extras;
    const res2 = validateTailoredResume(orig, deleted, buildEvidence(orig));
    expect(res2.resume.extras).toEqual(orig.extras);
    expect(res2.violations[0]!.attempted).toBe('');
  });

  it('restores role order, removed roles and drops invented roles', () => {
    const p = propose((r) => {
      r.experience.reverse();
      r.experience.push({ ...structuredClone(r.experience[0]!), id: 'r9', company: 'Made Up Inc' });
    });
    const res = validate(p);
    expect(res.resume.experience.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(kinds(res)).toEqual(['role-structure', 'role-structure']);

    const missing = validate(propose((r) => r.experience.pop()));
    expect(missing.resume.experience).toEqual(pythonQa.experience);
    expect(missing.violations[0]!.detail).toMatch(/missing/);
  });
});

describe('golden: synonyms and hidden evidence', () => {
  const out = runTailorPipeline({ original: pythonQa, evidence, jd: javaSdetJd, gap, response: response({}) });

  it('"K8s" in resume + "Kubernetes" in JD → Skills use Kubernetes and it counts as matched', () => {
    const items = out.tailored.skills.flatMap((g) => g.items);
    expect(items).toContain('Kubernetes (K8s)');
    expect(out.autoFixes.some((f) => f.kind === 'jd-wording')).toBe(true);
    const after = analyzeGap(out.tailored, javaSdetJd, buildEvidence(out.tailored));
    expect(after.items.find((i) => i.canonical === 'kubernetes')!.status).toBe('matched');
  });

  it('promotes a skill found only in bullets (Terraform) into Skills', () => {
    const items = out.tailored.skills.flatMap((g) => g.items);
    expect(items).toContain('Terraform');
    expect(out.autoFixes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'promote-hidden', detail: expect.stringContaining('Terraform') })]));
    expect(out.tailored.skills.find((g) => g.items.includes('Terraform'))!.group).toBe('DevOps');
  });

  it('never promotes the gap term', () => {
    expect(out.tailored.skills.flatMap((g) => g.items).some((i) => /^java$/i.test(i))).toBe(false);
  });
});

/* ================================================================== */
/* Exhaustive branch tests                                             */
/* ================================================================== */

describe('bullets', () => {
  it('reverts edits to bullets the user locked', () => {
    const orig = structuredClone(pythonQa);
    bullet(orig, 'r2b3').locked = true;
    const p = structuredClone(orig);
    bullet(p, 'r2b3').text = 'Triaged defects in Jira.';
    const res = validateTailoredResume(orig, p, buildEvidence(orig));
    expect(bullet(res.resume, 'r2b3').text).toBe('Reported and triaged defects in Jira.');
    expect(kinds(res)).toEqual(['locked-bullet']);
  });

  it('removes invented and duplicated bullets', () => {
    const p = propose((r) => {
      r.experience[1]!.bullets.push({ id: 'new1', text: 'Led a QA team.' });
      r.experience[1]!.bullets.push(structuredClone(r.experience[1]!.bullets[0]!));
    });
    const res = validate(p);
    expect(res.resume.experience[1]!.bullets.map((b) => b.id)).toEqual(['r2b1', 'r2b2', 'r2b3']);
    expect(kinds(res)).toEqual(['unknown-bullet', 'unknown-bullet']);
  });

  it('keeps at least two bullets per role', () => {
    const p = propose((r) => {
      r.experience[1]!.bullets = [r.experience[1]!.bullets[2]!];
    });
    const res = validate(p);
    expect(res.resume.experience[1]!.bullets.map((b) => b.id)).toEqual(['r2b3', 'r2b1']);
    expect(res.autoFixes.map((f) => f.kind)).toContain('restore-min-bullets');
  });

  it('blocks ownership inflation ("contributed to" → "led")', () => {
    const p = propose((r) => {
      bullet(r, 'r1b4').text = 'Led the migration of test environments to Kubernetes.';
    });
    const res = validate(p);
    expect(kinds(res)).toEqual(['ownership-inflation']);
    expect(bullet(res.resume, 'r1b4').text).toContain('Contributed');
  });

  it('allows JD wording for a synonym inside a bullet', () => {
    const p = propose((r) => {
      bullet(r, 'r1b4').text = 'Contributed to migrating test environments to Kubernetes (K8s).';
    });
    expect(validate(p).violations).toEqual([]);
  });

  it('blocks unknown tech-shaped tokens and verbatim JD copying', () => {
    const p = propose((r) => {
      bullet(r, 'r2b1').text = 'Tested REST APIs with Postman and SnowSQL.';
      bullet(r, 'r2b2').text = 'Wrote Selenium tests in Python to design and maintain automation frameworks that keep our payment platform reliable.';
    });
    const res = validate(p);
    expect(res.violations.map((v) => [v.kind, v.term])).toEqual([
      ['unsupported-term', 'SnowSQL'],
      ['jd-copy', expect.any(String)],
    ]);
  });

  it('accepts common business acronyms, dotted names and evidenced tokens', () => {
    const p = propose((r) => {
      bullet(r, 'r2b3').text = 'Reported and triaged UAT defects in Jira with QA and PMs.';
    });
    const res = validate(p);
    expect(res.violations.map((v) => v.term)).toEqual(['PMs']);
  });

  it('handles projects: restores names, validates project bullets, and restores missing projects', () => {
    const orig = structuredClone(pythonQa);
    orig.experience[0]!.projects = [
      { name: 'Payments', client: 'Bank A', bullets: [{ id: 'p1', text: 'Automated payment API checks with Pytest.' }, { id: 'p2', text: 'Wrote SQL checks.' }] },
      { name: 'Ledger', bullets: [{ id: 'p3', text: 'Tested ledger APIs.' }] },
    ];
    const ev = buildEvidence(orig);
    const p = structuredClone(orig);
    p.experience[0]!.projects = [{ name: 'Payments v2', client: 'Bank A', bullets: [{ id: 'p1', text: 'Automated payment API checks with Pytest and Java.' }, { id: 'p2', text: 'Wrote SQL validation checks.' }] }];
    const res = validateTailoredResume(orig, p, ev);
    const projects = res.resume.experience[0]!.projects!;
    expect(projects.map((x) => x.name)).toEqual(['Payments', 'Ledger']);
    expect(projects[0]!.bullets.map((b) => b.text)).toEqual(['Automated payment API checks with Pytest.', 'Wrote SQL validation checks.']);
    expect(kinds(res)).toEqual(['role-structure', 'locked-field', 'unsupported-term']);
  });

  it('removes projects the model invented for a role that had none', () => {
    const p = propose((r) => {
      r.experience[1]!.projects = [{ name: 'X', bullets: [] }];
    });
    const res = validate(p);
    expect(res.resume.experience[1]!.projects).toBeUndefined();
    expect(kinds(res)).toEqual(['role-structure']);
  });
});

describe('summary and headline', () => {
  it('drops only the unverifiable sentences', () => {
    const p = propose((r) => {
      r.summary = 'QA Automation Engineer with 6+ years of experience in Python test automation. Expert in Java. Reduced regression time by 40%.';
    });
    const res = validate(p);
    expect(res.resume.summary).toBe('QA Automation Engineer with 6+ years of experience in Python test automation. Reduced regression time by 40%.');
  });

  it('blocks inflated years and seniority', () => {
    const p = propose((r) => {
      r.summary = 'Principal QA Architect with 10+ years of experience. Builds Pytest automation.';
    });
    const res = validate(p);
    expect(kinds(res)).toEqual(expect.arrayContaining(['years-claim', 'seniority']));
    expect(res.resume.summary).toBe('Builds Pytest automation.');
  });

  it('falls back to the original summary when nothing survives', () => {
    const res = validate(propose((r) => (r.summary = 'Java expert.')));
    expect(res.resume.summary).toBe(pythonQa.summary);
    expect(res.violations.at(-1)!.detail).toMatch(/original summary was kept/);
  });

  it('keeps an unchanged summary untouched', () => {
    const res = validate(propose((r) => (r.summary = `  ${r.summary}  `)));
    expect(res.resume.summary).toBe(pythonQa.summary);
  });

  it('accepts a truthful headline and rejects an inflated one', () => {
    const ok = validate(propose((r) => (r.headline = 'Senior QA Automation Engineer | Python, Selenium, Kubernetes')));
    expect(ok.resume.headline).toBe('Senior QA Automation Engineer | Python, Selenium, Kubernetes');
    // Selenium now appears 4 times: kept, but flagged as possible stuffing.
    expect(ok.violations.map((v) => [v.kind, v.action])).toEqual([['stuffing', 'warned']]);

    const bad = validate(propose((r) => (r.headline = 'Lead SDET Manager')));
    expect(bad.resume.headline).toBeUndefined();
    expect(kinds(bad)).toEqual(expect.arrayContaining(['seniority', 'unsupported-term']));
  });

  it('restores the original headline when a rewrite is rejected or emptied', () => {
    const orig = { ...structuredClone(pythonQa), headline: 'QA Automation Engineer' };
    const ev = buildEvidence(orig);
    const bad = validateTailoredResume(orig, { ...structuredClone(orig), headline: 'Director of QA' }, ev);
    expect(bad.resume.headline).toBe('QA Automation Engineer');
    const emptied = validateTailoredResume(orig, { ...structuredClone(orig), headline: '' }, ev);
    expect(emptied.resume.headline).toBe('QA Automation Engineer');
    const same = validateTailoredResume(orig, { ...structuredClone(orig), headline: ' QA Automation Engineer ' }, ev);
    expect(same.resume.headline).toBe('QA Automation Engineer');
    const none = validateTailoredResume(pythonQa, { ...structuredClone(pythonQa), headline: ' ' }, evidence);
    expect(none.resume.headline).toBeUndefined();
    const noneSame = validateTailoredResume(pythonQa, structuredClone(pythonQa), evidence);
    expect('headline' in noneSame.resume).toBe(false);
  });

  it('allows a years phrase that matches the locked value even without a yearsOfExperience field', () => {
    const orig = { ...structuredClone(pythonQa), yearsOfExperience: '' };
    const res = validateTailoredResume(orig, { ...structuredClone(orig), summary: 'Engineer with 6+ years of Pytest work.' }, buildEvidence(orig));
    expect(res.violations).toEqual([]);
    const bad = validateTailoredResume(orig, { ...structuredClone(orig), summary: 'Engineer with 9 years of Pytest work.' }, buildEvidence(orig));
    expect(bad.violations.find((v) => v.kind === 'years-claim')!.detail).toMatch(/not stated/);
  });
});

describe('skills', () => {
  it('removes unsupported items and renames unsupported group names', () => {
    const p = propose((r) => {
      r.skills = [
        { group: 'Java Ecosystem', items: ['Python', 'Spring Boot'] },
        { group: 'Practices', items: ['Test Planning', 'Regression Testing', 'Checkout flow'] },
        { group: 'Technical Skills', items: ['SQL'] },
        { group: 'Empty', items: ['Rust'] },
      ];
    });
    const res = validateTailoredResume(pythonQa, p, evidence);
    expect(res.resume.skills).toEqual([
      { group: 'Technical Skills', items: ['Python', 'SQL'] },
      { group: 'Practices', items: ['Checkout flow'] },
    ]);
    expect(res.violations.map((v) => v.term)).toEqual(['Java', 'Spring Boot', 'Test Planning', 'Regression Testing', 'Rust']);
  });

  it('treats a skill item matching a known alias canonically', () => {
    const p = propose((r) => {
      r.skills = [{ group: 'Tools', items: ['K8s', 'GitHub'] }];
    });
    const res = validateTailoredResume(pythonQa, p, evidence);
    expect(res.resume.skills).toEqual([{ group: 'Tools', items: ['K8s'] }]);
  });

  it('accepts a free JD phrase that the resume evidences, and blocks a gap phrase', () => {
    const jd = { ...javaSdetJd, mustHave: [...javaSdetJd.mustHave, { canonical: 'checkout flow', surface: 'checkout flow', weight: 1 }, { canonical: 'chaos engineering', surface: 'chaos engineering', weight: 1 }] };
    const g = analyzeGap(pythonQa, jd, evidence);
    const p = propose((r) => {
      r.skills = [{ group: 'Domain', items: ['Checkout flow', 'Chaos engineering'] }, ...r.skills];
      bullet(r, 'r2b3').text = 'Reported and triaged defects in Jira using chaos engineering.';
    });
    const res = validateTailoredResume(pythonQa, p, evidence, { gap: g, jd });
    expect(res.resume.skills[0]!.items).toEqual(['Checkout flow']);
    expect(res.violations.map((v) => v.kind)).toEqual(['gap-term', 'gap-term']);
  });

  it('places promoted skills by category, else in "Additional Skills", and restores dropped matched skills', () => {
    const p = propose((r) => {
      r.skills = [{ group: 'Languages', items: ['SQL'] }];
    });
    const res = validate(p);
    const groups = Object.fromEntries(res.resume.skills.map((g) => [g.group, g.items]));
    expect(groups.Languages).toEqual(['SQL', 'Python']);
    expect(groups['Additional Skills']).toEqual(expect.arrayContaining(['Kubernetes', 'Selenium', 'Terraform', 'test automation', 'CI/CD']));
    expect(res.autoFixes.filter((f) => f.kind === 'restore-skill').length).toBeGreaterThan(0);
  });

  it('does not rewrite a synonym that already carries the JD wording', () => {
    const p = propose((r) => {
      r.skills[2]!.items = ['Jenkins', 'Docker', 'Kubernetes (K8s)'];
    });
    const res = validate(p);
    expect(res.resume.skills[2]!.items).toContain('Kubernetes (K8s)');
    expect(res.autoFixes.some((f) => f.kind === 'jd-wording')).toBe(false);
  });
});

describe('stuffing', () => {
  it('warns (without blocking) when a term is repeated more than 3 times', () => {
    const p = propose((r) => {
      r.experience[0]!.bullets = r.experience[0]!.bullets.map((b) => ({ ...b, text: b.text.replace(/\.$/, ' using Selenium.') }));
    });
    const res = validateTailoredResume(pythonQa, p, evidence);
    const warn = res.violations.find((v) => v.kind === 'stuffing');
    expect(warn).toMatchObject({ action: 'warned', term: 'Selenium' });
    expect(claimsText(res.resume)).toContain('using Selenium');
  });
});

describe('pipeline', () => {
  it('reports edits for unknown bullets/roles and filters metric questions', () => {
    const out = runTailorPipeline({
      original: pythonQa,
      evidence,
      jd: javaSdetJd,
      gap,
      response: response({
        bulletEdits: [{ bulletId: 'zzz', newText: 'x', reason: '', jdTermsUsed: [] }, { bulletId: 'r2b3', newText: '   ', reason: '', jdTermsUsed: [] }],
        bulletOrder: [{ roleId: 'nope', bulletIds: [] }, { roleId: 'r2', bulletIds: ['r2b2', 'ghost', 'r2b1', 'r2b3'] }, { roleId: 'r1', bulletIds: ['ghost'] }],
        metricQuestions: [
          { bulletId: 'r2b3', question: 'How many defects per release?' },
          { bulletId: 'r2b3', question: 'dup' },
          { bulletId: 'zzz', question: 'unknown' },
          { bulletId: 'r2b1', question: ' ' },
        ],
        headline: '  ',
        skills: [{ group: '', items: ['Python', 'python', ''] }, { group: 'Empty', items: [] }],
        summary: '',
      }),
    });
    expect(out.violations.filter((v) => v.kind === 'unknown-bullet').map((v) => v.path)).toEqual(['bullet:zzz', 'role:nope']);
    expect(out.metricQuestions).toEqual([{ bulletId: 'r2b3', question: 'How many defects per release?' }]);
    expect(out.tailored.experience[1]!.bullets.map((b) => b.id)).toEqual(['r2b2', 'r2b1', 'r2b3']);
    expect(out.tailored.experience[0]!.bullets.map((b) => b.id)).toEqual(['r1b1', 'r1b2', 'r1b3', 'r1b4']);
    expect(out.tailored.summary).toBe(pythonQa.summary);
    expect(out.tailored.skills[0]).toEqual({ group: 'Skills', items: ['Python'] });
    expect(out.changes.find((c) => c.kind === 'order')).toMatchObject({ roleId: 'r2', safe: true });
  });

  it('deepEqual covers primitives, arrays vs objects and undefined keys', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, c: 2 })).toBe(false);
  });
});

describe('remaining branches', () => {
  const withProjects = () => {
    const orig = structuredClone(pythonQa);
    orig.experience[0]!.projects = [{ name: 'Payments', client: 'Bank A', bullets: [{ id: 'p1', text: 'Automated payment API checks with Pytest.' }] }];
    return orig;
  };

  it('restores projects the model dropped, and a changed client alone', () => {
    const orig = withProjects();
    const dropped = structuredClone(orig);
    delete dropped.experience[0]!.projects;
    expect(validateTailoredResume(orig, dropped, buildEvidence(orig)).resume.experience[0]!.projects).toEqual(orig.experience[0]!.projects);

    const client = structuredClone(orig);
    client.experience[0]!.projects![0]!.client = 'Bank B';
    const res = validateTailoredResume(orig, client, buildEvidence(orig));
    expect(res.resume.experience[0]!.projects![0]!.client).toBe('Bank A');
    expect(kinds(res)).toEqual(['locked-field']);
  });

  it('min-bullet restore skips bullets that were kept', () => {
    const res = validate(propose((r) => (r.experience[1]!.bullets = [r.experience[1]!.bullets[0]!])));
    expect(res.resume.experience[1]!.bullets.map((b) => b.id)).toEqual(['r2b1', 'r2b2']);
  });

  it('seniority check copes with an all-lower-case sentence', () => {
    const res = validate(propose((r) => (r.summary = 'builds pytest automation for api testing.')));
    expect(res.violations).toEqual([]);
  });

  it('defaults empty group names and ignores non-term problems in group names', () => {
    const res = validateTailoredResume(pythonQa, propose((r) => (r.skills = [{ group: '', items: ['Python'] }, { group: 'Top 5 Tools', items: ['SQL'] }])), evidence);
    expect(res.resume.skills).toEqual([
      { group: 'Technical Skills', items: ['Python'] },
      { group: 'Top 5 Tools', items: ['SQL'] },
    ]);
  });

  it('resolves case-insensitive aliases of case-sensitive terms in skill items', () => {
    const res = validateTailoredResume(pythonQa, propose((r) => (r.skills = [{ group: 'Tools', items: ['react', 'Pytest'] }])), evidence);
    expect(res.resume.skills).toEqual([{ group: 'Tools', items: ['Pytest'] }]);
    expect(res.violations[0]!.term).toBe('react');
  });

  it('labels promoted skills sensibly when the JD wording is not an alias, and when no resume wording is known', () => {
    const customGap = {
      ...gap,
      items: [
        { canonical: 'python', surface: 'Python 3', weight: 1, importance: 'nice' as const, status: 'matched' as const },
        { canonical: 'docker', surface: 'Docker', weight: 1, importance: 'nice' as const, status: 'hidden' as const },
      ],
    };
    const res = validateTailoredResume(pythonQa, propose((r) => (r.skills = [{ group: 'Testing', items: ['Pytest'] }])), evidence, { gap: customGap });
    expect(res.resume.skills.flatMap((g) => g.items)).toEqual(['Pytest', 'Python', 'Docker']);
    expect(res.autoFixes.find((f) => f.kind === 'promote-hidden')!.detail).toMatch(/shows it/);
  });
});
