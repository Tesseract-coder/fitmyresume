import type { CoverLetterResponse, CoverTone, GapAnalysis, JDProfile, ResumeJSON } from '../schema';
import { collapseSpace } from '../text';
import { achievementSentences, article, evidencedDomain, list, rankedBullets, topStrengths, yearsPhrase } from './prose';

/**
 * Deterministic cover letter: assembled only from resume facts (real title, years, bullets with
 * their own numbers, evidenced JD terms) and the candidate's own motivation text. Same validator.
 */
export function heuristicCoverLetter(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis, opts: { tone?: CoverTone; motivation?: string } = {}): CoverLetterResponse {
  const concise = opts.tone === 'concise';
  const title = resume.experience[0]?.title || resume.headline || '';
  const role = jd.title ? `the ${jd.title} role` : 'this role';
  const domain = evidencedDomain(resume, jd);
  const opening = [`I am applying for ${role}${jd.company ? ` at ${jd.company}` : ''}.`];
  if (title) opening.push(`I am ${article(title)} ${title}${yearsPhrase(resume)}${domain ? ` in ${domain}` : ''}.`);

  const achievements = achievementSentences(rankedBullets(resume, jd, gap).slice(0, concise ? 1 : 2));

  const strengths = topStrengths(gap, 3);
  const fit: string[] = [];
  if (strengths.length && !concise) fit.push(`My hands-on experience with ${list(strengths)} matches what this role calls for.`);
  const motivation = collapseSpace(opts.motivation ?? '');
  if (motivation) fit.push(/[.!?]$/.test(motivation) ? motivation : `${motivation}.`);

  const closing = `I would welcome the chance to discuss how my experience can support ${jd.company ? `the team at ${jd.company}` : 'your team'}. Thank you for your time and consideration.`;

  return {
    paragraphs: [opening.join(' '), achievements, fit.join(' '), closing].filter(Boolean),
    notes: ['Written offline with deterministic rules (no AI), using only facts from your resume.'],
  };
}
