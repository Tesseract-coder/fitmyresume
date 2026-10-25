import { coachItem } from './coach';
import { buildEvidence } from './evidence';
import { heuristicInterview, resultPrompt, TASK_PROMPT } from './offline/interview';
import { firstPerson } from './offline/prose';
import { extractTerms } from './ontology';
import { allBullets } from './resume-text';
import type { GapAnalysis, GapItem, InterviewCategory, InterviewResponse, JDProfile, ResumeJSON } from './schema';
import { collapseSpace } from './text';
import { validateProse, type Violation } from './validator';

/**
 * Interview prep (§11.5). Every answer point is labelled by where it came from:
 *  - fact:   restated from the resume (validated like any other AI text)
 *  - prompt: a question for the candidate; the app never writes their story
 *  - coach:  the skills-gap coach's honest, code-written answer for a gap
 *  - yours:  the candidate's own words (their cover-letter motivation)
 */
export interface InterviewPoint {
  kind: 'fact' | 'prompt' | 'coach' | 'yours';
  text: string;
}

export interface InterviewItem {
  id: string;
  category: InterviewCategory;
  question: string;
  /** Why an interviewer would ask it (written by code from the job, never by the model). */
  why: string;
  bulletIds: string[];
  star?: { situation: InterviewPoint; task: InterviewPoint; action: InterviewPoint; result: InterviewPoint };
  points: InterviewPoint[];
}

export interface InterviewDraft {
  items: InterviewItem[];
  violations: Violation[];
  notes: string[];
  engine: 'ai' | 'offline';
  generatedAt: number;
  /** The candidate's own practice notes, per question id. */
  userNotes: Record<string, string>;
}

const ORDER: InterviewCategory[] = ['intro', 'behavioral', 'technical', 'gap', 'motivation', 'closing'];
const MAX_QUESTIONS = 10;

/** The job term a question is about (for "why" and gap answers). */
function termIn(question: string, items: readonly GapItem[]): GapItem | undefined {
  const canon = new Set(extractTerms(question).map((m) => m.canonical));
  return items.find((i) => canon.has(i.canonical) || question.toLowerCase().includes(i.surface.toLowerCase()));
}

function whyFor(category: InterviewCategory, question: string, gap: GapAnalysis): string {
  switch (category) {
    case 'intro':
      return 'Almost every interview opens with this. Keep it to about two minutes, most recent role first.';
    case 'behavioral':
      return 'A behavioural question: they want one specific story, told as Situation → Task → Action → Result.';
    case 'technical': {
      const t = termIn(question, gap.items.filter((i) => i.status !== 'gap'));
      return t ? `${t.surface} is ${t.importance === 'must' ? 'a must-have' : 'listed'} for this job, so expect follow-ups on how you used it.` : 'Checks how deep your experience goes in a skill the job asks for.';
    }
    case 'gap': {
      const t = termIn(question, gap.gap);
      return `${t?.surface ?? 'This skill'} is required and isn’t on your resume yet — an honest, prepared answer beats a vague one.`;
    }
    case 'motivation':
      return 'Shows you’ve researched the company and the role.';
    case 'closing':
      return 'Always have two or three questions ready; it signals real interest.';
  }
}

export function runInterviewPipeline(args: {
  baseline: ResumeJSON;
  resume: ResumeJSON;
  userFacts: readonly string[];
  jd: JDProfile;
  gap: GapAnalysis;
  jdText?: string;
  response: InterviewResponse;
  engine: InterviewDraft['engine'];
  /** Skills marked "I've started learning" in the coach (changes the gap answer). */
  learningSkills?: readonly string[];
  /** The candidate's own words from the cover letter, if any. */
  motivation?: string;
}): InterviewDraft {
  const { baseline, resume, userFacts, jd, gap, jdText, response, engine, learningSkills = [], motivation = '' } = args;
  const evidence = buildEvidence(baseline, userFacts);
  const ctx = { gap, jd, ...(jdText ? { jdText } : {}) };
  const allow = [jd.company ?? '', jd.title].filter(Boolean);
  const violations: Violation[] = [];
  const bulletText = new Map(allBullets(resume).map((b) => [b.id, b.text]));

  /** Validated text, or undefined if any of it couldn't be backed by the resume. */
  const check = (text: string | undefined, path: string): string | undefined => {
    const t = collapseSpace(text ?? '');
    if (!t) return undefined;
    const v = validateProse(baseline, [t], evidence, ctx, allow);
    violations.push(...v.violations.map((x) => ({ ...x, path })));
    // All or nothing: a half-removed answer point reads badly. Warnings (stuffing) don't block.
    return v.violations.some((x) => x.action !== 'warned') ? undefined : t;
  };

  const build = (q: InterviewResponse['questions'][number], n: number): InterviewItem | undefined => {
    const question = collapseSpace(q.question);
    if (question.length < 10 || question.length > 300) return undefined;
    const path = `question ${n}`;
    const bulletIds = q.bulletIds.filter((id) => bulletText.has(id));
    const item: InterviewItem = { id: '', category: q.category, question, why: whyFor(q.category, question, gap), bulletIds, points: [] };

    if ((q.category === 'behavioral' || q.category === 'technical') && bulletIds.length && (q.action || q.situationPrompt)) {
      const bullet = bulletText.get(bulletIds[0]!)!;
      const result = check(q.result, path);
      item.star = {
        situation: { kind: 'prompt', text: check(q.situationPrompt, path) ?? 'What was the situation, and why did it matter?' },
        task: { kind: 'prompt', text: check(q.taskPrompt, path) ?? TASK_PROMPT },
        action: { kind: 'fact', text: check(q.action, path) ?? firstPerson(bullet) },
        result: result && !result.endsWith('?') ? { kind: 'fact', text: result } : { kind: 'prompt', text: result ?? resultPrompt(bullet) },
      };
      return item;
    }

    switch (q.category) {
      case 'gap': {
        const g = termIn(question, gap.gap);
        if (!g) return undefined; // a "gap" question about something the candidate has: not a gap
        item.points = [{ kind: 'coach', text: coachItem(g, evidence, learningSkills.includes(g.surface)).interviewAnswer }];
        break;
      }
      case 'motivation':
        // Reasons to want a job can't come from a resume: only the candidate's own words, or a prompt.
        item.points = motivation.trim()
          ? [{ kind: 'yours', text: collapseSpace(motivation) }]
          : [{ kind: 'prompt', text: `Connect something specific about ${jd.company || 'the company'} to your own work. Use your own words — it’s the one answer only you can write.` }];
        break;
      case 'closing':
        // Questions for the interviewer: about the job, not claims about the candidate.
        item.points = q.talkingPoints.map(collapseSpace).filter((p) => p.length > 5 && p.length <= 250).slice(0, 3).map((text) => ({ kind: 'prompt' as const, text }));
        break;
      default: {
        item.points = q.talkingPoints.map((p, i) => check(p, `${path} point ${i + 1}`)).filter((p): p is string => !!p).slice(0, 4).map((text) => ({ kind: 'fact' as const, text }));
        if (!item.points.length) {
          const t = termIn(question, gap.items);
          item.points = [{ kind: 'prompt', text: t ? `Prepare one concrete example of using ${t.surface}: what you did, with which tools, and what changed.` : 'Prepare one concrete example from your experience.' }];
        }
      }
    }
    return item;
  };

  let items = response.questions.slice(0, 15).map((q, i) => build(q, i + 1)).filter((x): x is InterviewItem => !!x);
  const notes = [...response.notes];

  // Guarantees, whatever the model did: must-have gaps are rehearsed, and the set is complete.
  const offline = heuristicInterview(resume, jd, gap).questions.map((q, i) => build(q, 100 + i)).filter((x): x is InterviewItem => !!x);
  const has = (pred: (i: InterviewItem) => boolean) => items.some(pred);
  for (const o of offline) {
    const missingGap = o.category === 'gap' && !has((i) => i.category === 'gap' && termIn(i.question, gap.gap) === termIn(o.question, gap.gap));
    const missingCategory = !has((i) => i.category === o.category);
    if (missingGap || missingCategory) items.push(o);
  }
  if (items.length < 8) {
    for (const o of offline) if (items.length < MAX_QUESTIONS && !has((i) => i.question.toLowerCase() === o.question.toLowerCase())) items.push(o);
    if (engine === 'ai') notes.push('Some of the AI’s questions couldn’t be used, so offline questions fill the gaps.');
  }

  const seen = new Set<string>();
  items = items
    .filter((i) => !seen.has(i.question.toLowerCase()) && !!seen.add(i.question.toLowerCase()))
    .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  // Over the limit: drop behavioural/technical extras, never the intro, gaps, motivation or closing.
  while (items.length > MAX_QUESTIONS) {
    const tech = items.filter((i) => i.category === 'technical').length;
    const drop = items.map((i) => i.category).lastIndexOf(tech > 2 ? 'technical' : 'behavioral');
    if (drop < 0) break;
    items.splice(drop, 1);
  }
  return { items: items.map((i, n) => ({ ...i, id: `q${n + 1}` })), violations, notes, engine, generatedAt: Date.now(), userNotes: {} };
}

/** Plain-text export for printing or pasting into notes. */
export function interviewText(draft: InterviewDraft, jd: JDProfile): string {
  const out = [`Interview prep — ${[jd.title, jd.company].filter(Boolean).join(' at ') || 'target role'}`, ''];
  const label = { fact: '', prompt: 'Your turn: ', coach: '', yours: '' } as const;
  draft.items.forEach((q, i) => {
    out.push(`${i + 1}. ${q.question}`, `   Why they ask: ${q.why}`);
    if (q.star) {
      for (const [k, p] of Object.entries(q.star)) out.push(`   ${k[0]!.toUpperCase()}${k.slice(1)}: ${label[p.kind]}${p.text}`);
    }
    for (const p of q.points) out.push(`   - ${label[p.kind]}${p.text}`);
    const note = draft.userNotes[q.id]?.trim();
    if (note) out.push(`   My notes: ${note}`);
    out.push('');
  });
  return out.join('\n');
}
