import { describe, expect, it } from 'vitest';
import { buildEvidence } from '../shared/evidence';
import { analyzeGap } from '../shared/gap';
import { interviewText, runInterviewPipeline } from '../shared/interview';
import { heuristicInterview } from '../shared/offline/interview';
import type { InterviewResponse } from '../shared/schema';
import { javaSdetJd, javaSdetJdText, pythonQa } from './fixtures/resumes';

const gap = analyzeGap(pythonQa, javaSdetJd, buildEvidence(pythonQa));
const run = (response: InterviewResponse, extra: { learningSkills?: string[]; motivation?: string } = {}) =>
  runInterviewPipeline({ baseline: pythonQa, resume: pythonQa, userFacts: [], jd: javaSdetJd, gap, jdText: javaSdetJdText, response, engine: 'ai', ...extra });
const q = (partial: Partial<InterviewResponse['questions'][number]> & { question: string }): InterviewResponse['questions'][number] => ({ category: 'behavioral', bulletIds: [], talkingPoints: [], ...partial });

describe('offline interview prep', () => {
  const draft = run(heuristicInterview(pythonQa, javaSdetJd, gap));

  it('is a complete, ordered set of at most 10 questions with nothing blocked', () => {
    expect(draft.violations).toEqual([]);
    expect(draft.items.length).toBe(10);
    expect(draft.items.map((i) => i.category)).toEqual(['intro', 'behavioral', 'behavioral', 'behavioral', 'behavioral', 'technical', 'technical', 'gap', 'motivation', 'closing']);
    expect(draft.items.map((i) => i.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10']);
    expect(new Set(draft.items.map((i) => i.question)).size).toBe(10);
  });

  it('STAR: situation and task are always prompts; action is a resume fact; result is honest', () => {
    for (const item of draft.items.filter((i) => i.category === 'behavioral')) {
      expect(item.star!.situation.kind).toBe('prompt');
      expect(item.star!.task.kind).toBe('prompt');
      expect(item.star!.action.kind).toBe('fact');
      expect(item.star!.result.kind).toBe('prompt');
      expect(item.bulletIds).toHaveLength(1);
    }
    const quantified = draft.items.find((i) => i.star?.action.text.includes('1,200'));
    expect(quantified?.star!.result.text).toMatch(/measurable outcome in this bullet/);
  });

  it('intro uses the real career path; technical answers come from bullets that use the skill', () => {
    expect(draft.items[0]!.points.map((p) => p.text)).toEqual([
      "I'm a Senior QA Automation Engineer with 6+ years of experience.",
      'Senior QA Automation Engineer at Acme Fintech (Jan 2021 – Present).',
      'QA Engineer at Bright Retail (Jun 2018 – Dec 2020).',
    ]);
    const k8s = draft.items.find((i) => i.question === 'How have you used Kubernetes in your work?')!;
    expect(k8s.why).toBe('Kubernetes is a must-have for this job, so expect follow-ups on how you used it.');
    expect(k8s.points).toEqual([{ kind: 'fact', text: 'I contributed to the migration of test environments to K8s.' }]);
  });

  it('a must-have gap gets the coach’s honest answer, never a claim', () => {
    const java = draft.items.find((i) => i.category === 'gap')!;
    expect(java.question).toBe('This role needs Java. What’s your experience with it?');
    expect(java.points).toHaveLength(1);
    expect(java.points[0]).toMatchObject({ kind: 'coach' });
    expect(java.points[0]!.text).toMatch(/^"I haven't used Java in a professional role yet\. My closest experience is Python/);
    const learning = run(heuristicInterview(pythonQa, javaSdetJd, gap), { learningSkills: ['Java'] });
    expect(learning.items.find((i) => i.category === 'gap')!.points[0]!.text).toContain("I've already started learning it");
  });

  it('motivation is only ever the candidate’s own words, or a prompt', () => {
    expect(draft.items.find((i) => i.category === 'motivation')!.points[0]!.kind).toBe('prompt');
    const mine = run(heuristicInterview(pythonQa, javaSdetJd, gap), { motivation: 'I use Globex every week.' });
    expect(mine.items.find((i) => i.category === 'motivation')!.points).toEqual([{ kind: 'yours', text: 'I use Globex every week.' }]);
  });

  it('closing questions come from the job’s responsibilities', () => {
    expect(draft.items.at(-1)!.points.map((p) => p.text)).toEqual([
      'How does the team approach “Design and maintain automation frameworks” today, and what would you want to change?',
      'What does success look like in the first 90 days?',
    ]);
  });
});

describe('AI interview prep is validated like everything else', () => {
  const ai: InterviewResponse = {
    questions: [
      q({ category: 'intro', question: 'Tell me about yourself.', talkingPoints: ['I have 10 years of Java experience.', 'I build Pytest automation frameworks.'] }),
      q({
        question: 'Tell me about a time you sped up a test suite.',
        bulletIds: ['r1b2', 'nope'],
        situationPrompt: 'The suite had 3,000 flaky tests and took all night.',
        taskPrompt: 'What were you asked to fix?',
        action: 'I led a team of 12 engineers to rewrite the suite in Java.',
        result: 'Release time dropped by 50%.',
      }),
      q({ question: 'Tell me about your API testing work.', bulletIds: ['r1b1'], situationPrompt: 'Why did the API need tests?', action: 'I built a Pytest automation framework for 1,200 API test cases across 14 microservices.', result: 'It covered 1,200 API test cases across 14 microservices.' }),
      q({ category: 'gap', question: 'Have you used Selenium?', talkingPoints: ['Yes, for years.'] }),
      q({ category: 'motivation', question: 'Why Globex?', talkingPoints: ['Globex is the market leader and I love its culture.'] }),
      q({ category: 'technical', question: `Explain ${'very '.repeat(80)}long things.` }),
    ],
    notes: [],
  };
  const draft = run(ai);
  const item = (text: string) => draft.items.find((i) => i.question === text);

  it('replaces invented STAR details with resume facts or prompts', () => {
    const star = item('Tell me about a time you sped up a test suite.')!;
    expect(star.bulletIds).toEqual(['r1b2']);
    expect(star.star!.situation).toEqual({ kind: 'prompt', text: 'What was the situation, and why did it matter?' });
    expect(star.star!.task).toEqual({ kind: 'prompt', text: 'What were you asked to fix?' });
    expect(star.star!.action).toEqual({ kind: 'fact', text: 'I reduced regression time by 40% by parallelising Selenium suites on Docker containers.' });
    expect(star.star!.result.kind).toBe('prompt');
    expect(new Set(draft.violations.map((v) => v.kind))).toEqual(new Set(['new-number', 'ownership-inflation', 'gap-term', 'years-claim']));
  });

  it('keeps AI facts that check out', () => {
    expect(item('Tell me about your API testing work.')!.star!.result).toEqual({ kind: 'fact', text: 'It covered 1,200 API test cases across 14 microservices.' });
    expect(item('Tell me about yourself.')!.points).toEqual([{ kind: 'fact', text: 'I build Pytest automation frameworks.' }]);
  });

  it('ignores AI answers for gaps and motivation, and drops "gap" questions about skills the candidate has', () => {
    expect(item('Have you used Selenium?')).toBeUndefined();
    expect(item('Why Globex?')!.points[0]!.kind).toBe('prompt');
    // The model skipped the real must-have gap, so it is added.
    expect(draft.items.find((i) => i.category === 'gap')!.question).toBe('This role needs Java. What’s your experience with it?');
    expect(draft.items.some((i) => i.question.startsWith('Explain very'))).toBe(false);
    expect(draft.items.length).toBeLessThanOrEqual(10);
    expect(draft.items.length).toBeGreaterThanOrEqual(8);
  });

  it('exports plain text with prompts marked and the user’s notes', () => {
    const text = interviewText({ ...draft, userNotes: { q2: 'Mention the nightly build.' } }, javaSdetJd);
    expect(text.startsWith('Interview prep — Senior SDET at Globex\n')).toBe(true);
    expect(text).toContain('   Situation: Your turn: What was the situation, and why did it matter?');
    expect(text).toContain('   My notes: Mention the nightly build.');
  });
});
