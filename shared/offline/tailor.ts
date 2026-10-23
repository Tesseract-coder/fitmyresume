import { jdExtras } from '../gap';
import { extractTerms, type ExtraTerm } from '../ontology';
import { roleBullets } from '../resume-text';
import type { GapAnalysis, JDProfile, ResumeJSON, TailorResponse } from '../schema';
import { hasNumber, splitSentences, stem, tokenize, wordCount } from '../text';

/**
 * Deterministic tailoring: reorders by JD relevance, adopts JD wording for synonyms and writes a
 * fact-only summary. Less fluent than an LLM but always truthful, and it feeds the same validator.
 */
export function heuristicTailor(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis): TailorResponse {
  const extras = jdExtras(jd);
  const weights = new Map(gap.items.filter((i) => i.status !== 'gap').map((i) => [i.canonical, i.weight * (i.importance === 'must' ? 2 : 1)]));
  const relevance = (text: string) => [...new Set(extractTerms(text, extras).map((m) => m.canonical))].reduce((s, c) => s + (weights.get(c) ?? 0), 0);

  const bulletEdits: TailorResponse['bulletEdits'] = [];
  for (const role of resume.experience) {
    for (const b of roleBullets(role)) {
      const { text, used } = adoptJdWording(b.text, gap, extras);
      if (text !== b.text) bulletEdits.push({ bulletId: b.id, newText: text, reason: `Uses the job's wording: ${used.join(', ')}`, jdTermsUsed: used });
    }
  }

  const bulletOrder = resume.experience.map((role) => ({
    roleId: role.id,
    bulletIds: role.bullets
      .map((b, i) => ({ id: b.id, score: relevance(b.text), i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.id),
  }));

  const skills = resume.skills
    .map((g, gi) => {
      const items = g.items.map((item, i) => ({ item, score: relevance(item), i })).sort((a, b) => b.score - a.score || a.i - b.i);
      return { group: g.group, items: items.map((x) => x.item), score: items.reduce((s, x) => s + x.score, 0), gi };
    })
    .sort((a, b) => b.score - a.score || a.gi - b.gi)
    .map(({ group, items }) => ({ group, items }));

  const metricQuestions = resume.experience
    .flatMap((r) => roleBullets(r))
    .filter((b) => !hasNumber(b.text))
    .map((b) => ({ b, score: relevance(b.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ b }) => ({ bulletId: b.id, question: metricQuestionFor(b.text) }));

  return {
    summary: buildSummary(resume, jd, gap),
    skills,
    bulletEdits,
    bulletOrder,
    headline: headlineFor(resume, jd),
    metricQuestions,
    notes: ['Tailored offline with deterministic rules (no AI). Wording changes are conservative.'],
  };
}

/** Replace resume-only aliases with the JD's wording ("K8s" → "Kubernetes"). */
function adoptJdWording(text: string, gap: GapAnalysis, extras: ExtraTerm[]): { text: string; used: string[] } {
  let out = text;
  const used: string[] = [];
  for (const m of extractTerms(text, extras).reverse()) {
    const item = gap.items.find((i) => i.canonical === m.canonical && i.status !== 'gap');
    if (!item || m.free) continue;
    if (m.surface.toLowerCase() === item.surface.toLowerCase()) continue;
    if (!/^[A-Za-z0-9]{1,4}$/.test(m.surface)) continue; // only short aliases (K8s, JS); keep longer phrasing as written
    out = out.slice(0, m.start) + item.surface + out.slice(m.end);
    used.push(item.surface);
  }
  return { text: out, used };
}

function buildSummary(resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis): string {
  const title = resume.experience[0]?.title || resume.headline || '';
  const years = resume.yearsOfExperience ? ` with ${resume.yearsOfExperience.replace(/\s*(of\s+)?experience$/i, '')}${/years?|yrs?/i.test(resume.yearsOfExperience) ? '' : ' years'} of experience` : '';
  const domainOk = jd.domain && tokenize(resume.summary + ' ' + resume.experience.flatMap((r) => r.bullets.map((b) => b.text)).join(' ')).map(stem).includes(stem(jd.domain.toLowerCase()));
  const first = title ? `${title}${years}${domainOk ? ` in ${jd.domain}` : ''}.` : '';
  const top = gap.items
    .filter((i) => i.status !== 'gap')
    .sort((a, b) => (b.importance === 'must' ? 1 : 0) - (a.importance === 'must' ? 1 : 0) || b.weight - a.weight)
    .slice(0, 3)
    .map((i) => i.surface);
  const second = top.length ? `Skilled in ${top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top.at(-1)}` : top[0]}.` : '';
  const sentences = splitSentences(resume.summary);
  const proof = sentences.find((s) => /\d/.test(s) && !/\byears?\b/i.test(s)) ?? sentences.find((s) => !/\byears?\b/i.test(s)) ?? '';
  const parts = [first, second, proof].filter(Boolean);
  let summary = parts.join(' ');
  while (wordCount(summary) > 60 && parts.length > 1) {
    parts.pop();
    summary = parts.join(' ');
  }
  return summary || resume.summary;
}

/** Use the JD title as headline only when it truthfully describes the candidate. */
function headlineFor(resume: ResumeJSON, jd: JDProfile): string | undefined {
  const titles = new Set(tokenize(resume.experience.map((r) => r.title).join(' ')).map(stem));
  const want = tokenize(jd.title).map(stem);
  if (want.length && want.every((w) => titles.has(w))) return jd.title;
  return resume.headline ?? resume.experience[0]?.title;
}

function metricQuestionFor(text: string): string {
  const t = text.toLowerCase();
  if (/\b(test|tests|test cases|suite|scripts?)\b/.test(t)) return `How many tests or scripts were involved in: "${clip(text)}"? Any time saved?`;
  if (/\b(reduc|improv|faster|speed|optimi)/.test(t)) return `By how much (%, minutes, hours) did this improve: "${clip(text)}"?`;
  if (/\b(defect|bug|issue|incident)/.test(t)) return `Roughly how many defects/issues, or what % fewer escaped to production: "${clip(text)}"?`;
  if (/\b(team|mentor|train)/.test(t)) return `How many people were involved: "${clip(text)}"?`;
  return `Can you add a real number to: "${clip(text)}"? (count, %, time saved or frequency)`;
}

function clip(s: string): string {
  return s.length > 70 ? `${s.slice(0, 67)}…` : s;
}
