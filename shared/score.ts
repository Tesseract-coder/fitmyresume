import { jdExtras } from './gap';
import { displayName, extractTerms } from './ontology';
import { allBullets, claimsText, renderPlainText } from './resume-text';
import type { GapAnalysis, GapItem, JDProfile, ResumeJSON } from './schema';
import { hasNumber, phraseKey, splitSentences, stem, tokenize, wordCount } from './text';

export interface ScoreItem {
  key: string;
  label: string;
  max: number;
  points: number;
  detail: string;
  howToImprove: string;
}

export interface ScoreResult {
  total: number;
  items: ScoreItem[];
  /** Highest score reachable without adding skills the candidate lacks. */
  cap: { max: number; gaps: string[] };
}

export interface ScoreOptions {
  /** false when the source file used columns/tables (only meaningful for the uploaded original). */
  formattingSafe?: boolean;
}

/** Strong past-tense openers (lower case). */
export const ACTION_VERBS = new Set(
  `accelerated achieved adapted added addressed administered advanced advised aligned analysed analyzed applied architected
  assessed audited authored automated balanced benchmarked boosted built calibrated captured catalogued centralized championed
  clarified coached collaborated compiled completed composed conceived conducted configured consolidated constructed consulted
  containerized contributed converted coordinated created cultivated curated customized cut debugged decreased defined delivered
  deployed designed detected developed devised diagnosed directed discovered documented doubled drafted drove eliminated enabled
  engineered enhanced established evaluated executed expanded expedited extended facilitated fixed forecasted formalized formulated
  generated guided halved handled headed identified implemented improved increased influenced initiated inspected installed
  instituted instrumented integrated introduced investigated launched led leveraged lowered maintained managed mapped maximized
  measured mentored merged migrated minimized modeled modelled modernized monitored negotiated optimized orchestrated organized
  overhauled oversaw parallelized partnered performed piloted pioneered planned prepared presented prevented prioritized produced
  profiled programmed promoted prototyped provisioned published raised rebuilt reconciled redesigned reduced refactored refined
  reengineered released remediated reorganized replaced reported researched resolved restored restructured revamped reviewed
  revised rolled saved scaled scheduled scripted secured shipped shortened simplified spearheaded standardized streamlined
  strengthened structured supervised supported surpassed synthesized tested tracked trained transformed translated triaged
  tripled troubleshot tuned unified upgraded validated verified wrote`.split(/\s+/),
);

const TITLE_STOP = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'i', 'ii', 'iii', 'iv', 'the', 'a', 'an', 'of', 'and', 'for', 'in', 'at', 'with', '-', '&', 'remote', 'hybrid']);

export function scoreResume(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis, opts: ScoreOptions = {}): ScoreResult {
  const text = claimsText(resume);
  const extras = jdExtras(jd);
  const terms = extractTerms(text, extras);
  const present = (i: GapItem) => {
    const wanted = new Set([phraseKey(i.surface), phraseKey(displayName(i.canonical)), phraseKey(i.canonical)]);
    return terms.some((m) => m.canonical === i.canonical && wanted.has(phraseKey(m.surface)));
  };

  const items: ScoreItem[] = [];
  const must = gap.items.filter((i) => i.importance === 'must');
  const nice = gap.items.filter((i) => i.importance !== 'must');

  const coverage = (list: GapItem[], max: number, key: string, label: string): ScoreItem => {
    const total = list.reduce((s, i) => s + i.weight, 0);
    if (!total) return { key, label, max, points: max, detail: 'The job description lists no terms in this tier.', howToImprove: 'Nothing to do.' };
    const hit = list.filter(present);
    const got = hit.reduce((s, i) => s + i.weight, 0);
    const missingWording = list.filter((i) => !present(i) && i.status !== 'gap').map((i) => i.surface);
    const gaps = list.filter((i) => i.status === 'gap').map((i) => i.surface);
    return {
      key,
      label,
      max,
      points: Math.round((max * got) / total),
      detail: `${hit.length} of ${list.length} terms present with the job's wording.`,
      howToImprove: missingWording.length
        ? `Use the job's wording for: ${missingWording.slice(0, 6).join(', ')}.`
        : gaps.length
          ? `Remaining terms are genuine gaps (${gaps.slice(0, 4).join(', ')}) — they can't be added honestly.`
          : 'Fully covered.',
    };
  };
  items.push(coverage(must, 30, 'must', 'Must-have keyword coverage'));
  items.push(coverage(nice, 10, 'nice', 'Nice-to-have coverage'));
  items.push(titleAlignment(resume, jd));
  items.push(quantified(resume));
  items.push(actionVerbs(resume));
  items.push(summaryQuality(resume, jd, gap));
  items.push(sections(resume));
  items.push(contact(resume));
  items.push(length(resume));
  const safe = opts.formattingSafe ?? true;
  items.push({
    key: 'format',
    label: 'Formatting safety',
    max: 5,
    points: safe ? 5 : 2,
    detail: safe ? 'Single column, no tables, text boxes or images.' : 'The uploaded file uses columns or tables, which many ATS parsers scramble.',
    howToImprove: safe ? 'Nothing to do — exports are always single-column.' : 'Export from FitMyResume to get a single-column layout.',
  });

  const total = items.reduce((s, i) => s + i.points, 0);
  const lost = (list: GapItem[], max: number) => {
    const w = list.reduce((s, i) => s + i.weight, 0);
    return w ? (max * list.filter((i) => i.status === 'gap').reduce((s, i) => s + i.weight, 0)) / w : 0;
  };
  const capMax = Math.round(100 - lost(must, 30) - lost(nice, 10));
  return { total, items, cap: { max: capMax, gaps: must.filter((i) => i.status === 'gap').map((i) => i.surface) } };
}

function titleAlignment(resume: ResumeJSON, jd: JDProfile): ScoreItem {
  const want = [...new Set(tokenize(jd.title).filter((t) => !TITLE_STOP.has(t)).map(stem))];
  const base = { key: 'title', label: 'Title / headline alignment', max: 8 };
  if (!want.length) return { ...base, points: 8, detail: 'The job has no clear title.', howToImprove: 'Nothing to do.' };
  const have = new Set(
    tokenize([resume.headline ?? '', splitSentences(resume.summary)[0] ?? '', resume.experience[0]?.title ?? ''].join(' ')).map(stem),
  );
  const hit = want.filter((t) => have.has(t));
  return {
    ...base,
    points: Math.round((8 * hit.length) / want.length),
    detail: `${hit.length} of ${want.length} words of "${jd.title}" appear in your headline, summary opening or latest title.`,
    howToImprove: hit.length === want.length ? 'Aligned.' : 'Add a headline that names the target role — only if it matches your real level and domain.',
  };
}

function quantified(resume: ResumeJSON): ScoreItem {
  const bullets = allBullets(resume);
  const n = bullets.filter((b) => hasNumber(b.text)).length;
  const share = bullets.length ? n / bullets.length : 0;
  return {
    key: 'quantified',
    label: 'Quantified bullets',
    max: 14,
    points: Math.round(14 * Math.min(1, share / 0.5)),
    detail: `${n} of ${bullets.length} bullets include a number (target: at least half).`,
    howToImprove: share >= 0.5 ? 'On target.' : 'Answer the metric questions to add real numbers (counts, %, time saved).',
  };
}

export function startsWithActionVerb(text: string): boolean {
  const first = tokenize(text)[0] ?? '';
  return ACTION_VERBS.has(first);
}

function actionVerbs(resume: ResumeJSON): ScoreItem {
  const bullets = allBullets(resume);
  const n = bullets.filter((b) => startsWithActionVerb(b.text)).length;
  const share = bullets.length ? n / bullets.length : 0;
  return {
    key: 'verbs',
    label: 'Action-verb openings',
    max: 8,
    points: Math.round(8 * Math.min(1, share / 0.8)),
    detail: `${n} of ${bullets.length} bullets open with a strong past-tense verb.`,
    howToImprove: share >= 0.8 ? 'On target.' : 'Start bullets with verbs like Built, Automated, Reduced, Designed.',
  };
}

function summaryQuality(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis): ScoreItem {
  const s = resume.summary;
  const sentences = splitSentences(s).length;
  const words = wordCount(s);
  const checks = [
    { ok: sentences >= 2 && sentences <= 4, pts: 2, tip: '2–4 sentences' },
    { ok: words > 0 && words <= 60, pts: 1, tip: '60 words or fewer' },
    { ok: /\d+\s*\+?\s*(years?|yrs?)/i.test(s), pts: 1, tip: 'mention your years of experience' },
    { ok: !!jd.domain && tokenize(jd.domain).map(stem).some((t) => tokenize(s).map(stem).includes(t)), pts: 1, tip: 'name the domain' },
    {
      ok: gap.items.filter((i) => i.status !== 'gap' && extractTerms(s, jdExtras(jd)).some((m) => m.canonical === i.canonical)).length >= 2,
      pts: 1,
      tip: 'include 2–3 core skills from the job',
    },
  ];
  const points = checks.filter((c) => c.ok).reduce((a, c) => a + c.pts, 0);
  const missing = checks.filter((c) => !c.ok).map((c) => c.tip);
  return {
    key: 'summary',
    label: 'Summary quality',
    max: 6,
    points,
    detail: s ? `${sentences} sentences, ${words} words.` : 'No summary.',
    howToImprove: missing.length ? `Summary should: ${missing.join('; ')}.` : 'Strong summary.',
  };
}

function sections(resume: ResumeJSON): ScoreItem {
  const have = {
    'Professional Summary': !!resume.summary.trim(),
    'Technical Skills': resume.skills.some((g) => g.items.length),
    'Professional Experience': resume.experience.length > 0,
    Education: resume.education.length > 0,
  };
  const missing = Object.entries(have).filter(([, v]) => !v).map(([k]) => k);
  return {
    key: 'sections',
    label: 'Section completeness',
    max: 8,
    points: 2 * (4 - missing.length),
    detail: missing.length ? `Missing: ${missing.join(', ')}.` : 'All standard sections present with standard headings.',
    howToImprove: missing.length ? `Add ${missing.join(', ')} (with real content).` : 'Complete.',
  };
}

function contact(resume: ResumeJSON): ScoreItem {
  const c = resume.contact;
  const checks = [
    { ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()), pts: 2, name: 'email' },
    { ok: c.phone.replace(/\D/g, '').length >= 7, pts: 2, name: 'phone' },
    { ok: !!c.location.trim(), pts: 1, name: 'location' },
    { ok: c.links.some((l) => /linkedin\.com/i.test(l.url)), pts: 1, name: 'LinkedIn' },
  ];
  const missing = checks.filter((x) => !x.ok).map((x) => x.name);
  return {
    key: 'contact',
    label: 'Contact parsability',
    max: 6,
    points: checks.filter((x) => x.ok).reduce((a, x) => a + x.pts, 0),
    detail: missing.length ? `Missing or unreadable: ${missing.join(', ')}.` : 'Labelled email, phone, location and LinkedIn in the document body.',
    howToImprove: missing.length ? `Add your ${missing.join(', ')} on the Confirm screen.` : 'Complete.',
  };
}

function length(resume: ResumeJSON): ScoreItem {
  const words = wordCount(renderPlainText(resume));
  const points = words >= 450 && words <= 800 ? 5 : (words >= 350 && words < 450) || (words > 800 && words <= 1000) ? 3 : 1;
  return {
    key: 'length',
    label: 'Length',
    max: 5,
    points,
    detail: `${words} words (target 450–800, one to two pages).`,
    howToImprove: points === 5 ? 'On target.' : words < 450 ? 'Add detail to your strongest roles.' : 'Condense older or less relevant bullets.',
  };
}
