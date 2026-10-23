import { jdExtras } from '../gap';
import { extractTerms } from '../ontology';
import { allBullets } from '../resume-text';
import type { CoverLetterResponse, CoverTone, GapAnalysis, JDProfile, ResumeJSON } from '../schema';
import { ACTION_VERBS } from '../score';
import { collapseSpace, hasNumber, stem, tokenize } from '../text';

/**
 * Deterministic cover letter: assembled only from resume facts (real title, years, bullets with
 * their own numbers, evidenced JD terms) and the candidate's own motivation text. Same validator.
 */
export function heuristicCoverLetter(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis, opts: { tone?: CoverTone; motivation?: string } = {}): CoverLetterResponse {
  const concise = opts.tone === 'concise';
  const extras = jdExtras(jd);
  const weights = new Map(gap.items.filter((i) => i.status !== 'gap').map((i) => [i.canonical, i.weight * (i.importance === 'must' ? 2 : 1)]));
  const relevance = (text: string) => [...new Set(extractTerms(text, extras).map((m) => m.canonical))].reduce((s, c) => s + (weights.get(c) ?? 0), 0);

  const title = resume.experience[0]?.title || resume.headline || '';
  const role = jd.title ? `the ${jd.title} role` : 'this role';
  const opening = [`I am applying for ${role}${jd.company ? ` at ${jd.company}` : ''}.`];
  if (title) opening.push(`I am ${article(title)} ${title}${yearsPhrase(resume)}${domainPhrase(resume, jd)}.`);

  const companyOf = new Map(resume.experience.flatMap((r) => [...r.bullets, ...(r.projects ?? []).flatMap((p) => p.bullets)].map((b) => [b.id, r.company] as const)));
  const top = allBullets(resume)
    .map((b, i) => ({ b, score: relevance(b.text) + (hasNumber(b.text) ? 0.5 : 0), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, concise ? 1 : 2);
  const achievements: string[] = [];
  let lastCompany = '';
  for (const { b } of top) {
    const company = companyOf.get(b.id) ?? '';
    const claim = firstPerson(b.text);
    achievements.push(achievements.length && company === lastCompany ? `I also ${claim.replace(/^I /, '')}` : company ? `At ${company}, ${claim}` : capitalize(claim));
    lastCompany = company;
  }

  const strengths = gap.items
    .filter((i) => i.status !== 'gap')
    .sort((a, b) => (b.importance === 'must' ? 1 : 0) - (a.importance === 'must' ? 1 : 0) || b.weight - a.weight)
    .slice(0, 3)
    .map((i) => i.surface);
  const fit: string[] = [];
  if (strengths.length && !concise) fit.push(`My hands-on experience with ${list(strengths)} matches what this role calls for.`);
  const motivation = collapseSpace(opts.motivation ?? '');
  if (motivation) fit.push(/[.!?]$/.test(motivation) ? motivation : `${motivation}.`);

  const closing = `I would welcome the chance to discuss how my experience can support ${jd.company ? `the team at ${jd.company}` : 'your team'}. Thank you for your time and consideration.`;

  return {
    paragraphs: [opening.join(' '), achievements.join(' '), fit.join(' '), closing].filter(Boolean),
    notes: ['Written offline with deterministic rules (no AI), using only facts from your resume.'],
  };
}

/** "Built a framework" → "I built a framework." Non-verb openings are quoted as a highlight. */
function firstPerson(bullet: string): string {
  const text = collapseSpace(bullet).replace(/[.;:,]+$/, '');
  const [first = '', ...rest] = text.split(' ');
  if (ACTION_VERBS.has(first.toLowerCase())) return `I ${first.toLowerCase()} ${rest.join(' ')}.`;
  return `I worked on the following: ${text}.`;
}

function yearsPhrase(resume: ResumeJSON): string {
  const y = resume.yearsOfExperience.trim().replace(/\s*(of\s+)?experience$/i, '');
  if (!y) return '';
  return ` with ${y}${/years?|yrs?/i.test(y) ? '' : ' years'} of experience`;
}

/** Name the JD's domain only when the resume itself shows it. */
function domainPhrase(resume: ResumeJSON, jd: JDProfile): string {
  if (!jd.domain) return '';
  const words = new Set(tokenize([resume.summary, ...allBullets(resume).map((b) => b.text), ...resume.experience.map((r) => r.company)].join(' ')).map(stem));
  return tokenize(jd.domain).every((w) => words.has(stem(w))) ? ` in ${jd.domain}` : '';
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? ''));
