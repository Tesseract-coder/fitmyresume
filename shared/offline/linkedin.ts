import type { GapAnalysis, JDProfile, LinkedInResponse, ResumeJSON } from '../schema';
import { achievementSentences, article, capitalize, evidencedDomain, list, rankedBullets, topStrengths, yearsPhrase } from './prose';

/** Deterministic LinkedIn headline + About, from resume facts only. Same validator as the AI's. */
export function heuristicLinkedIn(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis): LinkedInResponse {
  const title = resume.experience[0]?.title || resume.headline || '';
  const domain = evidencedDomain(resume, jd);
  const strengths = topStrengths(gap, 4);

  const headline = fitHeadline([title, strengths.map(capitalize).join(' · '), domain && capitalize(domain)].filter(Boolean), 200);

  const intro = [title ? `I'm ${article(title)} ${title}${yearsPhrase(resume)}${domain ? ` in ${domain}` : ''}.` : '', strengths.length ? `I work with ${list(strengths.slice(0, 3))}.` : ''];
  const achievements = achievementSentences(rankedBullets(resume, jd, gap).slice(0, 2));

  return {
    headline,
    about: [intro.filter(Boolean).join(' '), achievements].filter(Boolean),
    notes: ['Written offline with deterministic rules (no AI), using only facts from your resume.'],
  };
}

/** Join headline parts with " | ", dropping trailing skills until it fits. */
export function fitHeadline(parts: string[], max: number): string {
  const p = [...parts];
  let out = p.join(' | ');
  while (out.length > max && p.length > 1) {
    const skills = p[1]!.split(' · ');
    if (skills.length > 1) p[1] = skills.slice(0, -1).join(' · ');
    else p.splice(p.length - 1, 1);
    out = p.join(' | ');
  }
  return out.slice(0, max).trim();
}
