import { displayName, extractTerms } from '../ontology';
import { JDProfileSchema, type JDProfile, type Term } from '../schema';
import { normalizeSpace, splitSentences } from '../text';

/**
 * Deterministic JD analyser: ontology term spotting + requirement-language tiers.
 *
 * Works on *segments* rather than raw lines, so a JD pasted as one paragraph reads like a
 * structured one: inline section headers ("… Nice to have: Rust") and inline bullets start new
 * segments, and long lines are split into sentences. Each term's tier comes from the most
 * specific cue available: its own clause, then its sentence, then the surrounding section.
 */

type Tier = 'must' | 'nice' | 'resp' | 'other';

const MUST_RE = /\b(requirements?|required|must|minimum|qualifications|you have|you'?ll need|what you need|what you(?:'|’)?ll bring|what you bring|who you are|about you|your profile|essential|mandatory|we expect|basic qualifications|key skills)\b/i;
const NICE_RE = /\b(preferred|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|a plus|is a plus|bonus|desirable|desired|advantageous|ideally|helpful|beneficial|optional|not (?:strictly )?(?:required|necessary|mandatory))\b/i;
const RESP_RE = /\b(responsibilities|what you'?ll do|you will|duties|day[\s-]to[\s-]day|in this role|the role)\b/i;
/** Requirement language without an explicit "required": applies to terms *after* the cue. */
const IMPLIED_MUST_RE = /\b(?:\d+\+?\s*(?:years?|yrs?)|experience (?:with|in|using|building)|proficien\w*|strong (?:knowledge|background|experience|skills?)|expertise (?:in|with)|hands-on|solid (?:understanding|experience|knowledge)|deep (?:knowledge|understanding)|working knowledge|track record)\b/gi;
const IMPLIED_NICE_RE = /\b(?:familiarity|familiar with|exposure to|awareness of|interest in|basic (?:knowledge|understanding))\b/gi;
const ROLE_WORDS = /\b(engineer|developer|manager|analyst|lead|tester|qa|sdet|consultant|architect|designer|intern|specialist|scientist|administrator|director|sre|devops)\b/i;
const BULLET_RE = /^\s*[•▪●◦‣∙·*–—-]\s*/;

/** Section headers that may appear inline ("… Requirements: Java, …"); each starts a new line. */
const HEADER =
  "(?:required skills|required qualifications|minimum qualifications|basic qualifications|preferred qualifications|requirements?|qualifications|must[- ]haves?|nice[- ]to[- ]haves?|good[- ]to[- ]haves?|bonus(?: points)?|preferred|pluses|key responsibilities|responsibilities|what you(?:'|’)?ll do|what you(?:'|’)?ll need|what we(?:'|’)?re looking for|what you(?:'|’)?ll bring|who you are|about you|your profile|desired skills|tech stack|skills)";
const INLINE_HEADER_RE = new RegExp(`(\\S)\\s+(${HEADER}\\s*:)`, 'gi');

/** Nouns that end a job title. */
const ROLE_NOUN_RE = /\b(engineer|developer|manager|analyst|lead|tester|sdet|sre|consultant|architect|designer|intern|specialist|scientist|administrator|director|programmer|technician)\b(\s+in\s+test\b|\s+(?:I{1,3}|IV|[1-4])\b)?/gi;
/** Lower-case words that may precede the noun inside a title. */
const TITLE_MODIFIERS = new Set(['senior', 'sr', 'sr.', 'junior', 'jr', 'jr.', 'lead', 'principal', 'staff', 'associate', 'software', 'data', 'backend', 'back-end', 'frontend', 'front-end', 'full-stack', 'fullstack', 'qa', 'test', 'automation', 'platform', 'cloud', 'devops', 'mobile', 'web', 'security', 'site', 'reliability', 'machine', 'learning', 'ml', 'ai', 'quality', 'systems', 'solutions', 'product', 'project', 'release', 'performance']);
const NOT_COMPANY = new Set(['we', 'our', 'the', 'this', 'you', 'your', 'us', 'remote', 'hybrid', 'a', 'an', 'about', 'join', 'team', 'scale']);

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

const RANK: Record<Tier, number> = { must: 3, nice: 2, resp: 1, other: 0 };

/** Physical lines after moving inline headers and bullets onto their own lines. */
function physicalLines(jdText: string): string[] {
  return jdText
    .replace(/\r\n?/g, '\n')
    .replace(INLINE_HEADER_RE, '$1\n$2')
    .split('\n')
    .map(normalizeSpace)
    .filter(Boolean);
}

/** A line's sentences (bullets stay whole). */
function sentencesOf(line: string): string[] {
  return BULLET_RE.test(line) ? [line] : splitSentences(line).flatMap((s) => s.split(/;\s+/));
}

const explicitTier = (text: string): Tier | undefined => (NICE_RE.test(text) ? 'nice' : MUST_RE.test(text) ? 'must' : undefined);

export function heuristicAnalyzeJd(jdText: string): JDProfile {
  const lines = physicalLines(jdText);
  const { title, titleLine } = titleOf(lines, jdText);
  const company = companyOf(lines, jdText, title, titleLine);

  const tiers = new Map<string, { surface: string; tier: Tier; count: number }>();
  const responsibilities: string[] = [];
  let section: Tier = 'other';

  for (const line of lines) {
    const headerOnly = line.replace(/[:\s]+$/, '').length <= 50 && !BULLET_RE.test(line);
    let lineContext: Tier | undefined;
    const sentences = sentencesOf(line);
    sentences.forEach((sentence, si) => {
      const sentenceCue = explicitTier(sentence);
      const isResp = !sentenceCue && RESP_RE.test(sentence);
      if (si === 0 && /^[^:]{2,40}:/.test(sentence) && sentenceCue) lineContext = sentenceCue; // "Nice to have: …" governs the rest of its line
      if (isResp) lineContext = 'resp';
      const context: Tier = lineContext ?? section;

      if ((isResp || (context === 'resp' && !sentenceCue)) && !headerOnly && responsibilities.length < 8) {
        const r = sentence.replace(BULLET_RE, '').replace(/\.$/, '');
        if (r.length >= 15) responsibilities.push(r);
      }

      const cues = [...[...sentence.matchAll(IMPLIED_MUST_RE)].map((m) => ({ at: m.index, tier: 'must' as const })), ...[...sentence.matchAll(IMPLIED_NICE_RE)].map((m) => ({ at: m.index, tier: 'nice' as const }))].sort((a, b) => a.at - b.at);
      for (const m of extractTerms(sentence)) {
        const clause = clauseAround(sentence, m.start, m.end);
        const implied = cues.filter((c) => c.at < m.start).at(-1)?.tier;
        const tier: Tier =
          explicitTier(clause) ??
          sentenceCue ??
          (context === 'must' || context === 'nice' ? context : undefined) ??
          implied ??
          (isResp || context === 'resp' ? 'resp' : 'other');
        const prev = tiers.get(m.canonical);
        if (!prev) tiers.set(m.canonical, { surface: m.surface, tier, count: 1 });
        else {
          prev.count++;
          if (RANK[tier] > RANK[prev.tier]) prev.tier = tier;
        }
      }
    });

    // A short header-like line ("Preferred Qualifications", "Requirements: Java") sets the section for following lines.
    const lineCue = explicitTier(line);
    if (headerOnly && lineCue) section = lineCue;
    else if (headerOnly && RESP_RE.test(line)) section = 'resp';
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

/** The comma/semicolon/bullet-delimited clause around a match, also split at "but / while / whereas". */
function clauseAround(sentence: string, start: number, end: number): string {
  const delim = /[,;•]|\b(?:but|while|whereas)\b/gi;
  let from = 0;
  let to = sentence.length;
  for (const d of sentence.matchAll(delim)) {
    if (d.index + d[0].length <= start) from = d.index + d[0].length;
    else if (d.index >= end) {
      to = d.index;
      break;
    }
  }
  return sentence.slice(from, to);
}

/* ------------------------------------------------------------------ */
/* Title and company                                                   */
/* ------------------------------------------------------------------ */

/** "Senior Backend Engineer" out of "Globex is hiring a Senior Backend Engineer to …". */
function rolePhrase(text: string): string | undefined {
  for (const m of text.matchAll(ROLE_NOUN_RE)) {
    const before = text.slice(0, m.index).split(/\s+/).filter(Boolean);
    const words: string[] = [];
    for (let i = before.length - 1; i >= 0 && words.length < 5; i--) {
      const w = before[i]!;
      const titleCase = /^[A-Z0-9][\w+#./&-]*$/.test(w) && !/[.:,]$/.test(w);
      if (!(titleCase || TITLE_MODIFIERS.has(w.toLowerCase()))) break;
      if (NOT_COMPANY.has(w.toLowerCase()) && !TITLE_MODIFIERS.has(w.toLowerCase())) break;
      words.unshift(w);
    }
    // A bare lower-case noun ("an engineer who…") isn't a title.
    const noun = m[0].trim();
    // "Lead Data Engineer": the title continues into a later role noun, so read on to that one.
    const after = text.slice(m.index + m[0].length).split(/\s+/).filter(Boolean).slice(0, 4);
    const continues = after.findIndex((w) => !(/^[A-Z0-9][\w+#./&-]*$/.test(w) || TITLE_MODIFIERS.has(w.toLowerCase())));
    if (after.slice(0, continues === -1 ? after.length : continues).some((w) => new RegExp(ROLE_NOUN_RE.source, 'i').test(w))) continue;
    if (!words.length && noun === noun.toLowerCase()) continue;
    const phrase = [...words, noun].join(' ').trim();
    if (phrase.length <= 60) return phrase;
  }
  return undefined;
}

function titleOf(lines: string[], jdText: string): { title: string; titleLine?: string } {
  const labelled = lines.find((l) => /^(job title|title|role|position)\s*:/i.test(l));
  if (labelled) {
    const value = labelled.replace(/^[^:]+:\s*/, '').split(/\s+[—–|@-]\s+|\s+at\s+|\s*\(/)[0]!.trim();
    return { title: value.replace(/[.,]$/, ''), titleLine: labelled };
  }
  const short = lines.find((l) => l.length <= 90 && ROLE_WORDS.test(l) && !BULLET_RE.test(l));
  if (short) {
    const phrase = rolePhrase(short.replace(/^(hiring|now hiring|we'?re hiring)\s*:\s*/i, ''));
    if (phrase) return { title: phrase, titleLine: short };
  }
  const head = jdText.slice(0, 400);
  const hiring = /\b(?:hiring|looking for|seeking|searching for|join us as|role of|position of|opening for)\s+(?:an?\s+|the\s+|our\s+(?:next\s+)?)?([^.!?\n]{0,80})/i.exec(head);
  const phrase = (hiring && rolePhrase(hiring[1]!)) ?? rolePhrase(splitSentences(normalizeSpace(head))[0] ?? '');
  return { title: phrase ?? '' };
}

const CAPS = "[A-Z][\\w&'-]*(?:\\.[\\w&'-]+)*(?:\\s+[A-Z][\\w&'-]*(?:\\.[\\w&'-]+)*){0,3}";

function cleanCompany(raw: string | undefined): string | undefined {
  const name = raw?.replace(/\s*\(.*$/, '').replace(/[.,;:!]+$/, '').trim();
  if (!name || NOT_COMPANY.has(name.split(/\s+/)[0]!.toLowerCase())) return undefined;
  if (extractTerms(name).some((m) => m.start === 0 && m.end === name.length)) return undefined; // "at Kubernetes scale"
  return name;
}

function companyOf(lines: string[], jdText: string, title: string, titleLine?: string): string | undefined {
  const labelled = lines.find((l) => /^company\s*:/i.test(l));
  if (labelled) return cleanCompany(labelled.replace(/^company\s*:\s*/i, ''));
  if (titleLine && title) {
    const after = titleLine.slice(titleLine.indexOf(title) + title.length);
    const m = new RegExp(`^\\s*(?:[—–|@,-]|at)\\s+(${CAPS})`).exec(after);
    const name = cleanCompany(m?.[1]);
    if (name) return name;
  }
  const head = jdText.slice(0, 500);
  for (const re of [new RegExp(`(?:^|[.!?]\\s+)(${CAPS})\\s+is\\s+(?:hiring|looking|seeking|searching)`), new RegExp(`\\b(?:at|join|joining)\\s+(${CAPS})`), new RegExp(`\\bAbout\\s+(${CAPS})\\s*[:\\n]`)]) {
    const name = cleanCompany(re.exec(head)?.[1]);
    if (name && name !== title) return name;
  }
  return undefined;
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
