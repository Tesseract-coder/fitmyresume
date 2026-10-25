import { extractTerms } from '../ontology';
import { dateRange } from '../resume-text';
import type { GapAnalysis, InterviewResponse, JDProfile, ResumeJSON } from '../schema';
import { hasNumber } from '../text';
import { firstPerson, rankedBullets, yearsPhrase } from './prose';

type Question = InterviewResponse['questions'][number];

/** Behavioural themes: which question a bullet answers, and what to ask the candidate to recall. */
const THEMES: { re: RegExp; question: string; situation: string }[] = [
  { re: /\b(reduc|improv|optimi[sz]|faster|speed|accelerat|parallel|cut|shorten)/i, question: 'Tell me about a time you made a process faster or more efficient.', situation: 'What was slow or painful before, and why did it matter?' },
  { re: /\b(defects?|bugs?|issues?|incidents?|triag|outages?|root cause)/i, question: 'Tell me about a difficult bug or production issue you dealt with.', situation: 'What broke, and how did it affect users or the team?' },
  { re: /\b(migrat|upgrad|moved|modernis|moderniz|replat)/i, question: 'Tell me about a migration or big technical change you were part of.', situation: 'Why was the change needed, and what was at risk?' },
  { re: /\b(integrat|pipelines?|ci\/?cd|deploy|jenkins|github actions|release)/i, question: 'How have you improved the way your team tests or ships code?', situation: 'How were things built, tested or released before?' },
  { re: /\b(team|mentor|collaborat|stakeholders?|cross-functional|coordinat|trained)/i, question: 'Tell me about a time you worked closely with other teams or people.', situation: 'Who was involved, and what did each side need?' },
  { re: /\b(built|build|designed|developed|created|implemented|wrote|introduced|automated)/i, question: 'Tell me about something you built that you’re proud of.', situation: 'What problem needed solving, and who needed it?' },
];
const DEFAULT_THEME = { question: 'Tell me about a project you’re proud of.', situation: 'What was the project, and why did it matter?' };
export const TASK_PROMPT = 'What exactly were you responsible for? (Be precise about which parts were yours.)';

/** The outcome part of STAR, honestly: point at the bullet's real numbers, or ask for one. */
export function resultPrompt(bullet: string): string {
  return hasNumber(bullet)
    ? 'Close on the measurable outcome in this bullet, and what it meant for the team or users.'
    : 'What changed because of this? Add a real number if you have one (see “Add real numbers”).';
}

/**
 * Deterministic interview prep: the likely questions for this job, answered only with resume facts,
 * prompts for the candidate's own story, and (for gaps) the skills-gap coach's honest answer.
 */
export function heuristicInterview(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis): InterviewResponse {
  const questions: Question[] = [];
  const blank = { bulletIds: [] as string[], talkingPoints: [] as string[] };

  // 1. Intro: the real career path.
  const title = resume.experience[0]?.title ?? '';
  questions.push({
    ...blank,
    category: 'intro',
    question: 'Walk me through your background.',
    talkingPoints: [
      ...(title ? [`I'm a ${title}${yearsPhrase(resume)}.`] : []),
      ...resume.experience.slice(0, 3).map((r) => `${r.title} at ${r.company} (${dateRange(r.startDate, r.endDate)}).`),
    ],
  });

  // 2. Behavioural: one story per theme, from the most job-relevant bullets.
  const used = new Set<string>();
  const behavioral: Question[] = [];
  for (const { bullet } of rankedBullets(resume, jd, gap)) {
    if (behavioral.length >= 4) break;
    const theme = THEMES.find((t) => t.re.test(bullet.text) && !used.has(t.question)) ?? (used.has(DEFAULT_THEME.question) ? undefined : DEFAULT_THEME);
    if (!theme) continue;
    used.add(theme.question);
    // No `result`: the pipeline adds the honest result prompt for every engine.
    behavioral.push({ ...blank, category: 'behavioral', question: theme.question, bulletIds: [bullet.id], situationPrompt: theme.situation, taskPrompt: TASK_PROMPT, action: firstPerson(bullet.text) });
  }
  questions.push(...behavioral);

  // 3. Technical: must-have (then nice-to-have) skills the candidate has, answered from bullets that use them.
  const ranked = rankedBullets(resume, jd, gap);
  const technical = gap.items
    .filter((i) => i.status !== 'gap')
    .sort((a, b) => (a.importance === 'must' ? 0 : 1) - (b.importance === 'must' ? 0 : 1) || b.weight - a.weight)
    .slice(0, 3)
    .map((i): Question => {
      const uses = ranked.filter(({ bullet }) => extractTerms(bullet.text).some((m) => m.canonical === i.canonical)).slice(0, 2);
      return {
        ...blank,
        category: 'technical',
        question: `How have you used ${i.surface} in your work?`,
        bulletIds: uses.map(({ bullet }) => bullet.id),
        talkingPoints: uses.map(({ bullet }) => firstPerson(bullet.text)),
      };
    });
  questions.push(...technical);

  // 4. Gaps: expect them; the honest answer is added by the pipeline (skills-gap coach).
  for (const g of gap.gap.filter((i) => i.importance === 'must').slice(0, 2)) {
    questions.push({ ...blank, category: 'gap', question: `This role needs ${g.surface}. What’s your experience with it?` });
  }

  // 5. Motivation (answer material is the candidate's own; added by the pipeline) and 6. closing.
  questions.push({ ...blank, category: 'motivation', question: `Why do you want to join ${jd.company || 'us'}?` });
  questions.push({
    ...blank,
    category: 'closing',
    question: 'What questions do you have for us?',
    talkingPoints: [...jd.responsibilities.slice(0, 2).map((r) => `How does the team approach “${r.replace(/\.$/, '')}” today, and what would you want to change?`), 'What does success look like in the first 90 days?'],
  });

  // Keep 10: trim technical questions first, then behavioural.
  while (questions.length > 10) {
    const i = questions.map((q) => q.category).lastIndexOf(questions.filter((q) => q.category === 'technical').length > 2 ? 'technical' : 'behavioral');
    questions.splice(i, 1);
  }
  return { questions, notes: ['Prepared offline with deterministic rules (no AI), using only facts from your resume.'] };
}
