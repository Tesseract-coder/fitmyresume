import { jdExtras } from '../gap';
import { extractTerms } from '../ontology';
import { allBullets } from '../resume-text';
import type { GapAnalysis, JDProfile, ResumeJSON } from '../schema';
import { ACTION_VERBS } from '../score';
import { collapseSpace, hasNumber, stem, tokenize } from '../text';

/** Fact-only prose helpers shared by the offline cover letter and LinkedIn writers. */

/** "Built a framework" → "I built a framework." Non-verb openings are quoted as a highlight. */
export function firstPerson(bullet: string): string {
  const text = collapseSpace(bullet).replace(/[.;:,]+$/, '');
  const [first = '', ...rest] = text.split(' ');
  if (ACTION_VERBS.has(first.toLowerCase())) return `I ${first.toLowerCase()} ${rest.join(' ')}.`;
  return `I worked on the following: ${text}.`;
}

/** " with 6+ years of experience" from the locked yearsOfExperience field. */
export function yearsPhrase(resume: ResumeJSON): string {
  const y = resume.yearsOfExperience.trim().replace(/\s*(of\s+)?experience$/i, '');
  if (!y) return '';
  return ` with ${y}${/years?|yrs?/i.test(y) ? '' : ' years'} of experience`;
}

/** The JD's domain, only when the resume itself shows it. */
export function evidencedDomain(resume: ResumeJSON, jd: JDProfile): string {
  if (!jd.domain) return '';
  const words = new Set(tokenize([resume.summary, ...allBullets(resume).map((b) => b.text), ...resume.experience.map((r) => r.company)].join(' ')).map(stem));
  return tokenize(jd.domain).every((w) => words.has(stem(w))) ? jd.domain : '';
}

/** Evidenced JD terms, must-haves first, in the job's wording. */
export function topStrengths(gap: GapAnalysis, n: number): string[] {
  return gap.items
    .filter((i) => i.status !== 'gap')
    .sort((a, b) => (b.importance === 'must' ? 1 : 0) - (a.importance === 'must' ? 1 : 0) || b.weight - a.weight)
    .slice(0, n)
    .map((i) => i.surface);
}

/** Resume bullets ranked by JD relevance (ties: bullets with numbers, then original order). */
export function rankedBullets(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis) {
  const extras = jdExtras(jd);
  const weights = new Map(gap.items.filter((i) => i.status !== 'gap').map((i) => [i.canonical, i.weight * (i.importance === 'must' ? 2 : 1)]));
  const relevance = (text: string) => [...new Set(extractTerms(text, extras).map((m) => m.canonical))].reduce((s, c) => s + (weights.get(c) ?? 0), 0);
  const companyOf = new Map(resume.experience.flatMap((r) => [...r.bullets, ...(r.projects ?? []).flatMap((p) => p.bullets)].map((b) => [b.id, r.company] as const)));
  return allBullets(resume)
    .map((b, i) => ({ bullet: b, company: companyOf.get(b.id) ?? '', score: relevance(b.text) + (hasNumber(b.text) ? 0.5 : 0), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
}

/** "At Acme, I built X. I also reduced Y." from the top bullets. */
export function achievementSentences(top: readonly { bullet: { text: string }; company: string }[]): string {
  const out: string[] = [];
  let lastCompany = '';
  for (const { bullet, company } of top) {
    const claim = firstPerson(bullet.text);
    out.push(out.length && company === lastCompany ? `I also ${claim.replace(/^I /, '')}` : company ? `At ${company}, ${claim}` : capitalize(claim));
    lastCompany = company;
  }
  return out.join(' ');
}

export const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const list = (items: readonly string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? ''));
