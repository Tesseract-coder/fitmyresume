import { learningLines } from './coach';
import { buildEvidence } from './evidence';
import { heuristicLinkedIn } from './offline/linkedin';
import { capitalize, evidencedDomain, topStrengths } from './offline/prose';
import { displayName, extractTerms } from './ontology';
import { dateRange } from './resume-text';
import { LINKEDIN_LIMITS, type GapAnalysis, type JDProfile, type LinkedInResponse, type ResumeJSON } from './schema';
import { collapseSpace, escapeRegExp, splitSentences } from './text';
import { validateProse, type Violation } from './validator';

/**
 * LinkedIn sync helper (§11.4): a headline and About section aligned to the target role, plus the
 * skills and experience text to keep the profile consistent with the tailored resume. The model's
 * prose goes through the same validator; the skills, learning and "open to" lines are code-written.
 */

export interface LinkedInOptions {
  /** Append "Core skills: …" (evidenced skills, in the job's wording) for recruiter search. */
  skillsLine: boolean;
  /** Append the skills-gap coach's "ramping up on …" lines for skills marked as learning. */
  learning: boolean;
  /** Append "I'm open to <role> opportunities." */
  openTo: boolean;
}

export const DEFAULT_LINKEDIN_OPTIONS: LinkedInOptions = { skillsLine: true, learning: false, openTo: false };

export interface LinkedInDraft {
  options: LinkedInOptions;
  headline: string;
  about: string[];
  violations: Violation[];
  notes: string[];
  engine: 'ai' | 'offline';
  edited: boolean;
  generatedAt: number;
}

/** A public profile must not reveal where the candidate is applying. */
function dropCompanyMentions(texts: readonly string[], company: string | undefined, path: (i: number) => string): { texts: string[]; violations: Violation[] } {
  const name = collapseSpace(company ?? '');
  if (name.length < 2) return { texts: [...texts], violations: [] };
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'iu');
  const violations: Violation[] = [];
  const out = texts.map((t, i) =>
    splitSentences(collapseSpace(t))
      .filter((s) => {
        if (!re.test(s)) return true;
        violations.push({ kind: 'target-company', path: path(i), detail: `Your public profile shouldn't name ${name}, the company you're applying to.`, attempted: s, action: 'removed', term: name });
        return false;
      })
      .join(' '),
  );
  return { texts: out.filter(Boolean), violations };
}

export function runLinkedInPipeline(args: {
  baseline: ResumeJSON;
  resume: ResumeJSON;
  userFacts: readonly string[];
  jd: JDProfile;
  gap: GapAnalysis;
  jdText?: string;
  options: LinkedInOptions;
  response: LinkedInResponse;
  engine: LinkedInDraft['engine'];
}): LinkedInDraft {
  const { baseline, resume, userFacts, jd, gap, jdText, options, response, engine } = args;
  const evidence = buildEvidence(baseline, userFacts);
  const ctx = { gap, jd, ...(jdText ? { jdText } : {}) };
  const notes = [...response.notes];
  const fallback = () => heuristicLinkedIn(resume, jd, gap);

  // Headline: the whole line must pass (a half-removed headline reads badly), else use the offline one.
  const h1 = dropCompanyMentions([response.headline], jd.company, () => 'headline');
  const hv = validateProse(baseline, h1.texts, evidence, ctx);
  const headlineViolations = [...h1.violations, ...hv.violations.map((v) => ({ ...v, path: 'headline' }))];
  let headline = collapseSpace(response.headline);
  // Judge by violations, not text equality: validation normalises dashes and quotes ("–" → "-").
  const blocked = headlineViolations.some((v) => v.action !== 'warned');
  if (!headline || blocked || headline.length > LINKEDIN_LIMITS.headline) {
    const alt = validateProse(baseline, [fallback().headline], evidence, ctx).paragraphs[0] ?? '';
    if (headline && alt !== headline) notes.push("The AI's headline couldn't be fully verified against your resume, so this is the offline headline instead.");
    headline = alt;
  }

  const a1 = dropCompanyMentions(response.about, jd.company, (i) => `paragraph ${i + 1}`);
  const av = validateProse(baseline, a1.texts, evidence, ctx);
  let about = av.paragraphs;
  const aboutViolations = [...a1.violations, ...av.violations];
  if (!about.length) {
    about = validateProse(baseline, fallback().about, evidence, ctx).paragraphs;
    notes.push("None of the AI's About text could be verified against your resume, so this is the offline draft instead.");
  }

  return { options, headline, about, violations: [...headlineViolations, ...aboutViolations], notes, engine, edited: false, generatedAt: Date.now() };
}

/** Evidenced skills for LinkedIn's Skills section: the job's wording first, then the rest of the resume's (standard names). */
export function profileSkills(resume: ResumeJSON, gap: GapAnalysis, max = 15): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (label: string, canonical: string) => {
    if (seen.has(canonical) || out.length >= max) return;
    seen.add(canonical);
    out.push(label);
  };
  for (const s of topStrengths(gap, max)) add(capitalize(s), gap.items.find((i) => i.surface === s)!.canonical);
  for (const item of resume.skills.flatMap((g) => g.items)) {
    const terms = extractTerms(item);
    if (terms.length) for (const t of terms) add(displayName(t.canonical), t.canonical);
    else add(item, item.toLowerCase());
  }
  return out;
}

export interface ExperienceEntry {
  roleId: string;
  title: string;
  company: string;
  dates: string;
  /** Ready to paste into the LinkedIn position description (≤ 2,000 characters). */
  description: string;
}

/** The tailored resume's roles as LinkedIn position descriptions, so profile and resume agree. */
export function experienceEntries(resume: ResumeJSON): ExperienceEntry[] {
  return resume.experience.map((r) => {
    const lines = [...r.bullets.map((b) => `• ${b.text}`), ...(r.projects ?? []).flatMap((p) => [...(p.name ? [`${p.name}${p.client ? ` (client: ${p.client})` : ''}`] : []), ...p.bullets.map((b) => `• ${b.text}`)])];
    let description = '';
    for (const line of lines) {
      const next = description ? `${description}\n${line}` : line;
      if (next.length > 2000) break;
      description = next;
    }
    return { roleId: r.id, title: r.title, company: r.company, dates: dateRange(r.startDate, r.endDate), description };
  });
}

export interface ComposedProfile {
  headline: string;
  /** Validated (or user-edited) prose, possibly shortened to fit. */
  body: string[];
  /** Code-written lines from the options (learning, open-to, core skills). */
  extras: string[];
  about: string;
  /** Top three to pin as "Top skills". */
  pinned: string[];
  skills: string[];
  experience: ExperienceEntry[];
  /** About was shortened to fit LinkedIn's limit. */
  truncated: boolean;
}

/** Full profile text. Code-written lines are added after validation and are true by construction. */
export function composeLinkedIn(resume: ResumeJSON, draft: LinkedInDraft, jd: JDProfile, gap: GapAnalysis, learningSkills: readonly string[] = []): ComposedProfile {
  const evidence = buildEvidence(resume);
  const skills = profileSkills(resume, gap);
  const gapTerms = new Set(gap.gap.map((g) => g.surface));
  const extra: string[] = [];
  const learning = learningSkills.filter((t) => gapTerms.has(t));
  if (draft.options.learning && learning.length) extra.push(learningLines(learning, evidence).join(' '));
  if (draft.options.openTo) {
    const domain = evidencedDomain(resume, jd);
    extra.push(`I'm open to ${jd.title ? `${jd.title} ` : 'new '}opportunities${domain ? ` in ${domain}` : ''}.`);
  }
  if (draft.options.skillsLine && skills.length) extra.push(`Core skills: ${skills.slice(0, 12).join(' · ')}`);

  const body = draft.about.map(collapseSpace).filter(Boolean);
  const fits = (paras: string[]) => [...paras, ...extra].join('\n\n').length <= LINKEDIN_LIMITS.about;
  let truncated = false;
  while (body.length > 1 && !fits(body)) {
    body.pop();
    truncated = true;
  }
  let about = [...body, ...extra].join('\n\n');
  if (about.length > LINKEDIN_LIMITS.about) {
    about = about.slice(0, LINKEDIN_LIMITS.about);
    truncated = true;
  }
  return { headline: collapseSpace(draft.headline).slice(0, LINKEDIN_LIMITS.headline), body, extras: extra, about, pinned: skills.slice(0, 3), skills, experience: experienceEntries(resume), truncated };
}
