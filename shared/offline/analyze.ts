import { displayName, extractTerms } from '../ontology';
import { JDProfileSchema, type JDProfile, type Term } from '../schema';
import { normalizeSpace } from '../text';

/** Deterministic JD analyser: ontology term spotting + requirement-language tiers. */

type Tier = 'must' | 'nice' | 'resp' | 'other';

const MUST_RE = /\b(requirements?|required|must|minimum|qualifications|you have|you'?ll need|what you need|essential|mandatory|we expect|basic qualifications|key skills)\b/i;
const NICE_RE = /\b(preferred|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|a plus|is a plus|bonus|desirable|desired|advantageous|ideally)\b/i;
const RESP_RE = /\b(responsibilities|what you'?ll do|you will|duties|day[\s-]to[\s-]day|in this role|the role)\b/i;
const ROLE_WORDS = /\b(engineer|developer|manager|analyst|lead|tester|qa|sdet|consultant|architect|designer|intern|specialist|scientist|administrator|director|sre|devops)\b/i;
const BULLET_RE = /^\s*[•▪●◦‣∙·*–—-]\s*/;

const SOFT = ['communication', 'collaboration', 'leadership', 'problem-solving', 'problem solving', 'mentoring', 'ownership', 'stakeholder management', 'teamwork', 'attention to detail', 'analytical', 'adaptability', 'time management', 'critical thinking'];

const DOMAINS: [string, RegExp][] = [
  ['fintech', /\b(fintech|payments?|banking|bank|financial services|trading|lending|insurance|insurtech)\b/i],
  ['healthcare', /\b(healthcare|health tech|healthtech|clinical|hospital|medical|pharma|life sciences)\b/i],
  ['e-commerce', /\b(e-?commerce|retail|marketplace|checkout|shopping)\b/i],
  ['edtech', /\b(edtech|education|learning platform|e-?learning)\b/i],
  ['saas', /\b(saas|b2b software|enterprise software)\b/i],
  ['gaming', /\b(gaming|games?|game studio)\b/i],
  ['telecom', /\b(telecom|telecommunications|5g|network operator)\b/i],
  ['automotive', /\b(automotive|vehicle|autonomous driving)\b/i],
  ['logistics', /\b(logistics|supply chain|shipping|delivery)\b/i],
  ['media', /\b(media|streaming|publishing|adtech|advertising)\b/i],
  ['cybersecurity', /\b(cyber ?security|infosec|security operations)\b/i],
];

export function heuristicAnalyzeJd(jdText: string): JDProfile {
  const lines = jdText.split(/\r?\n/).map(normalizeSpace).filter(Boolean);
  const titleLine = lines.find((l) => l.length <= 90 && ROLE_WORDS.test(l)) ?? lines[0] ?? '';
  const [titlePart, ...rest] = titleLine.split(/\s+[—–|@-]\s+|\s+at\s+/);
  const title = (titlePart ?? '').replace(/^(job title|role|position)\s*:\s*/i, '').trim();
  const companyLine = lines.find((l) => /^company\s*:/i.test(l))?.replace(/^company\s*:\s*/i, '');
  const company = companyLine ?? rest[0]?.replace(/\(.*\)/, '').trim();

  const tiers = new Map<string, { surface: string; tier: Tier; count: number }>();
  const responsibilities: string[] = [];
  let section: Tier = 'other';
  for (const line of lines) {
    const short = line.replace(/[:\s]+$/, '').length <= 50 && !BULLET_RE.test(line);
    let tier: Tier = section;
    if (NICE_RE.test(line)) {
      tier = 'nice';
      if (short) section = 'nice';
    } else if (MUST_RE.test(line)) {
      tier = 'must';
      if (short) section = 'must';
    } else if (RESP_RE.test(line) && short) {
      section = 'resp';
      tier = 'resp';
    }
    if (tier === 'resp' && !short && responsibilities.length < 8) responsibilities.push(line.replace(BULLET_RE, '').replace(/\.$/, ''));
    for (const m of extractTerms(line)) {
      const prev = tiers.get(m.canonical);
      const rank = (t: Tier) => ({ must: 3, nice: 2, resp: 1, other: 0 })[t];
      if (!prev) tiers.set(m.canonical, { surface: m.surface, tier, count: 1 });
      else {
        prev.count++;
        if (rank(tier) > rank(prev.tier)) prev.tier = tier;
      }
    }
  }

  const titleTerms = new Set(extractTerms(title).map((m) => m.canonical));
  const mustHave: Term[] = [];
  const niceToHave: Term[] = [];
  const keywords: Term[] = [];
  for (const [canonical, t] of tiers) {
    const surface = /^[a-z]/.test(t.surface) && t.surface.length <= 3 ? displayName(canonical) : t.surface;
    const weight = Math.min(3, (t.count >= 2 || titleTerms.has(canonical) ? 2 : 1) + (t.tier === 'must' ? 1 : 0));
    const term = { canonical, surface, weight };
    if (t.tier === 'must') mustHave.push(term);
    else if (t.tier === 'nice') niceToHave.push(term);
    else keywords.push(term);
  }

  const text = jdText.toLowerCase();
  return JDProfileSchema.parse({
    title,
    seniority: seniorityOf(title, jdText),
    domain: DOMAINS.find(([, re]) => re.test(jdText))?.[0] ?? '',
    ...(company ? { company } : {}),
    mustHave,
    niceToHave,
    responsibilities,
    softSkills: SOFT.filter((s) => text.includes(s)).slice(0, 6),
    keywords,
  });
}

function seniorityOf(title: string, text: string): string {
  const t = title.toLowerCase();
  if (/\bintern\b/.test(t)) return 'intern';
  if (/\b(junior|jr\.?|graduate|entry)\b/.test(t)) return 'junior';
  if (/\bprincipal\b/.test(t)) return 'principal';
  if (/\b(lead|staff)\b/.test(t)) return 'lead';
  if (/\b(manager|head|director)\b/.test(t)) return 'manager';
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior';
  const years = Number(/(\d+)\s*\+?\s*years/i.exec(text)?.[1] ?? NaN);
  if (years >= 5) return 'senior';
  if (years >= 2) return 'mid';
  return 'unspecified';
}
