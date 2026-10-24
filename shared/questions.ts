import { buildEvidence } from './evidence';
import { extractTerms } from './ontology';
import { rankedBullets } from './offline/prose';
import { roleBullets } from './resume-text';
import type { GapAnalysis, JDProfile, ResumeJSON } from './schema';
import { collapseSpace, hasNumber } from './text';

/**
 * "Questions to strengthen your resume" (§11.2): a guided interview that collects real metrics for
 * bullets without numbers. Deterministic. Every number comes from the user; the app only supplies
 * the wording around it, which the user can edit before saving.
 */

export type MetricKind = 'count' | 'percent' | 'time' | 'saved' | 'team' | 'frequency' | 'scale';

export interface MetricAnswer {
  /** The number(s), exactly as the user typed them ("1,200", "40", "2 million"). */
  n?: string;
  from?: string;
  to?: string;
  /** What is counted or measured ("test cases", "regression time"). */
  noun?: string;
  direction?: 'down' | 'up';
  unit?: 'hours' | 'days';
  period?: 'week' | 'month' | 'quarter' | 'year' | 'release' | 'sprint';
}

export interface MetricOption {
  kind: MetricKind;
  /** The question, in the bullet's terms. */
  prompt: string;
  /** Pre-filled answer fields (never numbers). */
  defaults: MetricAnswer;
}

export interface BulletQuestion {
  bulletId: string;
  /** "Senior QA Automation Engineer · Acme Fintech" */
  role: string;
  text: string;
  options: MetricOption[];
}

const has = (re: RegExp, s: string) => re.test(s);
const word = (re: RegExp, s: string) => re.exec(s)?.[0]?.toLowerCase();
const plural = (w: string) => (w.endsWith('s') ? w : w.endsWith('y') ? `${w.slice(0, -1)}ies` : `${w}s`);

/** What could be measured about this bullet, most likely first (max 3). */
export function metricOptions(text: string): MetricOption[] {
  const t = text.toLowerCase();
  const out: MetricOption[] = [];
  const add = (o: MetricOption) => {
    if (!out.some((x) => x.kind === o.kind) && out.length < 3) out.push(o);
  };

  const testNoun = word(/\b(test cases|scenarios|scripts|checks|tests)\b/, t);
  const defectNoun = word(/\b(defects|bugs|issues|incidents|vulnerabilities)\b|\b(defect|bug|issue|incident|vulnerability)\b/, t);
  const serviceNoun = word(/\b(microservices|services|apis|endpoints|modules|components|applications|apps)\b/, t);
  const scaleNoun = word(/\b(users|customers|clients|transactions|requests|records|accounts|orders)\b/, t);
  const metric = /\bregression\b/.test(t) ? 'regression time' : /\bbuild/.test(t) ? 'build time' : /\bcoverage\b/.test(t) ? 'test coverage' : /\b(latency|response time|performance|load)\b/.test(t) ? 'response time' : /\b(release|deploy)/.test(t) ? 'release time' : '';

  if (testNoun) add({ kind: 'count', prompt: `How many ${testNoun === 'tests' ? 'tests or test cases' : testNoun} did this involve?`, defaults: { noun: testNoun === 'tests' ? 'test cases' : testNoun } });
  if (defectNoun) add({ kind: 'count', prompt: `Roughly how many ${plural(defectNoun)} did you find or fix?`, defaults: { noun: plural(defectNoun) } });
  if (has(/\b(reduc|improv|faster|speed|optimi[sz]|accelerat|cut|shorten|increas|boost|parallel)/, t) || metric === 'test coverage') {
    add({ kind: 'percent', prompt: 'By how much did it improve? (a percentage)', defaults: { noun: metric, direction: metric === 'test coverage' ? 'up' : 'down' } });
    add({ kind: 'time', prompt: 'What did it take before, and after?', defaults: { noun: metric || 'execution time' } });
  }
  if (has(/\bautomat/, t)) add({ kind: 'saved', prompt: 'How much manual effort did it save?', defaults: { unit: 'hours', period: 'week' } });
  if (testNoun || has(/\b(suite|regression)\b/, t)) add({ kind: 'time', prompt: 'How long did the suite take to run, before and after?', defaults: { noun: metric || 'execution time' } });
  if (defectNoun) add({ kind: 'percent', prompt: 'By what percentage did escaped defects drop?', defaults: { noun: 'escaped defects', direction: 'down' } });
  if (has(/\b(team|mentor|train|coach|onboard|collaborat|cross-functional|stakeholders?|squads?)/, t)) add({ kind: 'team', prompt: 'How many people were on the team?', defaults: {} });
  if (has(/\b(releases?|deploy|pipelines?|ci\/?cd|delivery|sprints?)\b/, t)) add({ kind: 'frequency', prompt: 'How often did you release?', defaults: { noun: 'releases', period: 'month' } });
  if (serviceNoun) add({ kind: 'count', prompt: `How many ${serviceNoun} were involved?`, defaults: { noun: serviceNoun } });
  if (scaleNoun) add({ kind: 'scale', prompt: `How many ${scaleNoun} did it serve or handle?`, defaults: { noun: scaleNoun } });
  // Nothing specific: offer the three most common, honest measures.
  add({ kind: 'count', prompt: 'Is there something you can count? (tests, services, reports, people…)', defaults: { noun: '' } });
  add({ kind: 'saved', prompt: 'Did it save time?', defaults: { unit: 'hours', period: 'week' } });
  add({ kind: 'frequency', prompt: 'How often did this happen?', defaults: { noun: 'releases', period: 'month' } });
  return out;
}

/** Bullets without numbers, most relevant to the job first. */
export function strengthenQuestions(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis, max = 8): BulletQuestion[] {
  const roleOf = new Map(resume.experience.flatMap((r) => roleBullets(r).map((b) => [b.id, `${r.title} · ${r.company}`] as const)));
  return rankedBullets(resume, jd, gap)
    .filter(({ bullet }) => !hasNumber(bullet.text))
    .slice(0, max)
    .map(({ bullet }) => ({ bulletId: bullet.id, role: roleOf.get(bullet.id) ?? '', text: bullet.text, options: metricOptions(bullet.text) }));
}

const COUNT_VERB: [RegExp, string][] = [
  [/^(defects|bugs|issues|incidents|vulnerabilities)/, 'catching'],
  [/^(microservices|services|apis|endpoints|modules|components|applications|apps|teams|squads|markets|regions)/, 'across'],
];

/** True when the user actually supplied a number for this option. */
export function answered(kind: MetricKind, a: MetricAnswer): boolean {
  const num = (s?: string) => !!s && /\d/.test(s);
  if (kind === 'time') return num(a.from) && num(a.to) && !!a.noun?.trim();
  if (kind === 'percent') return num(a.n) && !!a.noun?.trim();
  if (kind === 'count' || kind === 'scale') return num(a.n) && !!a.noun?.trim();
  return num(a.n);
}

/** The bullet with the user's number worked in. Only called once `answered()` is true. */
export function phrase(bullet: string, kind: MetricKind, a: MetricAnswer): string {
  const b = collapseSpace(bullet).replace(/[.;:,\s]+$/, '');
  const n = collapseSpace(a.n ?? '').replace(/\s*%$/, '');
  const noun = collapseSpace(a.noun ?? '');
  switch (kind) {
    case 'count': {
      const verb = COUNT_VERB.find(([re]) => re.test(noun.toLowerCase()))?.[1] ?? 'covering';
      return `${b}, ${verb} ${n} ${noun}.`;
    }
    case 'scale':
      return `${b}, serving ${n} ${noun}.`;
    case 'percent':
      return `${b}, ${a.direction === 'up' ? 'improving' : 'reducing'} ${noun} by ${n}%.`;
    case 'time':
      return `${b}, cutting ${noun} from ${collapseSpace(a.from ?? '')} to ${collapseSpace(a.to ?? '')}.`;
    case 'saved':
      return `${b}, saving ${n} ${a.unit ?? 'hours'} of manual effort per ${a.period ?? 'week'}.`;
    case 'team':
      return `${b}, as part of a team of ${n}.`;
    case 'frequency':
      return `${b}, supporting ${n} ${noun || 'releases'} per ${a.period ?? 'month'}.`;
  }
}

/** Replace one bullet's text (top-level or project bullet). Pure. */
export function setBulletText(resume: ResumeJSON, bulletId: string, text: string): ResumeJSON {
  const out = structuredClone(resume);
  for (const r of out.experience) for (const b of roleBullets(r)) if (b.id === bulletId) b.text = collapseSpace(text);
  return out;
}

/**
 * Technologies the user's edited wording mentions that the rest of the resume doesn't.
 * Not blocked (it's the user's own statement) but worth a second look.
 */
export function newTechIn(resume: ResumeJSON, bulletId: string, text: string): string[] {
  const others = buildEvidence(setBulletText(resume, bulletId, ''));
  return [...new Set(extractTerms(text).filter((m) => !others.techTerms.has(m.canonical)).map((m) => m.surface))];
}

/** Share of bullets with a number, for the progress display. */
export function quantifiedShare(resume: ResumeJSON): { n: number; total: number } {
  const bullets = resume.experience.flatMap(roleBullets);
  return { n: bullets.filter((b) => hasNumber(b.text)).length, total: bullets.length };
}
