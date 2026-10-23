import data from './ontology.json';
import { escapeRegExp, normalizeSpace, phraseKey } from './text';

export interface OntologyTerm {
  canonical: string;
  display: string;
  category: string;
  aliases: string[];
  caseSensitive?: boolean;
  caseSensitiveAliases?: string[];
  strict?: boolean;
  implies?: string[];
}

interface OntologyFile {
  version: number;
  terms: OntologyTerm[];
  distinct: [string, string][];
}

const file = data as OntologyFile;

export const TERMS: readonly OntologyTerm[] = file.terms;
export const DISTINCT_PAIRS: readonly [string, string][] = file.distinct;

const byCanonical = new Map<string, OntologyTerm>();
/** lower-cased surface (canonical, display, alias) → canonical */
const aliasMap = new Map<string, string>();

for (const t of TERMS) {
  byCanonical.set(t.canonical, t);
  for (const s of [t.canonical, t.display, ...t.aliases, ...(t.caseSensitiveAliases ?? [])]) {
    const key = normalizeSpace(s).toLowerCase();
    const existing = aliasMap.get(key);
    if (existing && existing !== t.canonical) {
      throw new Error(`Ontology alias collision: "${key}" → ${existing} and ${t.canonical}`);
    }
    aliasMap.set(key, t.canonical);
  }
}

/** Guard: aliases must never bridge two technologies declared distinct. */
for (const [a, b] of DISTINCT_PAIRS) {
  if (!byCanonical.has(a) || !byCanonical.has(b)) throw new Error(`Ontology distinct pair references unknown term: ${a}/${b}`);
  if (aliasMap.get(a) === b || aliasMap.get(b) === a) throw new Error(`Ontology aliases ${a} ↔ ${b}, which are declared distinct`);
}

export function getTerm(canonical: string): OntologyTerm | undefined {
  return byCanonical.get(canonical);
}

/** Resolve any surface form to its ontology canonical, or undefined when the term is not in the ontology. */
export function lookupCanonical(surface: string): string | undefined {
  const key = normalizeSpace(surface).toLowerCase();
  const direct = aliasMap.get(key);
  if (direct) return direct;
  // "Kubernetes (K8s)" style → try the part outside the parentheses, then inside.
  const paren = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(key);
  if (paren) return aliasMap.get(paren[1]!.trim()) ?? aliasMap.get(paren[2]!.trim());
  return undefined;
}

/** Canonical key for any term: ontology canonical if known, else a normalised phrase key. */
export function canonicalize(surface: string): string {
  return lookupCanonical(surface) ?? phraseKey(surface);
}

export function displayName(canonical: string): string {
  return byCanonical.get(canonical)?.display ?? canonical;
}

/** True when two surfaces name the same technology after alias normalisation. */
export function sameTechnology(a: string, b: string): boolean {
  return canonicalize(a) === canonicalize(b);
}

/** Transitive closure of `implies` (Pytest → Python; AKS → Azure, Kubernetes). Excludes the term itself. */
export function impliedBy(canonical: string): string[] {
  const out = new Set<string>();
  const stack = [...(byCanonical.get(canonical)?.implies ?? [])];
  while (stack.length) {
    const c = stack.pop()!;
    if (out.has(c) || c === canonical) continue;
    out.add(c);
    stack.push(...(byCanonical.get(c)?.implies ?? []));
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Matcher                                                             */
/* ------------------------------------------------------------------ */

export interface TermMatch {
  canonical: string;
  /** Text exactly as it appears in the source. */
  surface: string;
  start: number;
  end: number;
  /** true when the term is not in the ontology (a free JD phrase). */
  free?: boolean;
}

export interface ExtraTerm {
  canonical: string;
  surface: string;
}

interface Pattern {
  canonical: string;
  re: RegExp;
  len: number;
  free: boolean;
}

const WORD = '\\p{L}\\p{N}_';
const BEFORE = `(?<![${WORD}+#.])`;
const AFTER = `(?![${WORD}+#])(?!\\.[${WORD}])`;
const STRICT_BEFORE = `(?<![-'&/.])`;
const STRICT_AFTER = `(?![-'&])`;

/** Turn a surface into a regex body tolerant of spacing/hyphen variants and a plural "s". */
function surfaceBody(surface: string, allowPlural: boolean): string {
  const parts = normalizeSpace(surface).split(/[\s-]+/).map(escapeRegExp);
  const last = surface.at(-1) ?? '';
  if (!allowPlural || !/[a-z]/i.test(last) || /s$/i.test(surface)) return parts.join('[\\s-]+');
  const tail = parts.pop()!;
  // "strategy" → strategy|strategies; "framework" → framework(s)
  const plural = /[^aeiou]y$/i.test(tail) ? `${tail.slice(0, -1)}(?:y|ies)` : `${tail}(?:e?s)?`;
  return [...parts, plural].join('[\\s-]+');
}

function buildPattern(canonical: string, surface: string, opts: { cs: boolean; strict: boolean; free: boolean }): Pattern {
  const body = surfaceBody(surface, opts.free || surface.length > 3);
  const before = BEFORE + (opts.strict ? STRICT_BEFORE : '');
  const after = AFTER + (opts.strict ? STRICT_AFTER : '');
  return {
    canonical,
    re: new RegExp(`${before}${body}${after}`, opts.cs ? 'gu' : 'giu'),
    len: surface.length,
    free: opts.free,
  };
}

/** "React", "Go", "SAFe": the display form when it spells the canonical, else the capitalised canonical. */
function casedCanonical(t: OntologyTerm): string {
  return t.display.toLowerCase() === t.canonical ? t.display : t.canonical[0]!.toUpperCase() + t.canonical.slice(1);
}

const ontologyPatterns: Pattern[] = (() => {
  const list: Pattern[] = [];
  for (const t of TERMS) {
    const csAliases = new Set((t.caseSensitiveAliases ?? []).map((s) => s.toLowerCase()));
    const insensitive = new Set<string>();
    for (const s of [t.canonical, t.display, ...t.aliases]) {
      const k = normalizeSpace(s);
      if (!csAliases.has(k.toLowerCase())) insensitive.add(k);
    }
    for (const s of insensitive) {
      // Case-sensitive terms keep their exact display casing ("React", "Go") to avoid English-word hits.
      const cs = !!t.caseSensitive && s.toLowerCase() === t.canonical;
      const surface = cs ? casedCanonical(t) : s;
      list.push(buildPattern(t.canonical, surface, { cs, strict: !!t.strict, free: false }));
    }
    for (const s of t.caseSensitiveAliases ?? []) {
      list.push(buildPattern(t.canonical, s, { cs: true, strict: true, free: false }));
    }
  }
  return list.sort((a, b) => b.len - a.len);
})();

/**
 * Extract every known term from text: ontology terms plus optional free phrases (JD terms
 * missing from the ontology). Longest match wins and matches never overlap, so
 * "React Native" never also yields "React" and "JavaScript" never yields "Java".
 */
export function extractTerms(text: string, extras: readonly ExtraTerm[] = []): TermMatch[] {
  const src = text;
  const patterns = extras.length
    ? [
        ...ontologyPatterns,
        ...extras
          .filter((e) => e.surface.trim().length > 1)
          .map((e) => buildPattern(e.canonical, e.surface, { cs: false, strict: false, free: true })),
      ].sort((a, b) => b.len - a.len)
    : ontologyPatterns;

  const taken = new Uint8Array(src.length);
  const matches: TermMatch[] = [];
  for (const p of patterns) {
    p.re.lastIndex = 0;
    for (const m of src.matchAll(p.re)) {
      const start = m.index;
      const end = start + m[0].length;
      let free = true;
      for (let i = start; i < end; i++) if (taken[i]) { free = false; break; }
      if (!free) continue;
      taken.fill(1, start, end);
      matches.push({ canonical: p.canonical, surface: m[0], start, end, ...(p.free ? { free: true } : {}) });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

export function extractCanonicals(text: string, extras: readonly ExtraTerm[] = []): Set<string> {
  return new Set(extractTerms(text, extras).map((m) => m.canonical));
}

/** JD terms not present in the ontology, as matcher extras. */
export function freeExtras(terms: readonly { canonical: string; surface: string }[]): ExtraTerm[] {
  const out: ExtraTerm[] = [];
  const seen = new Set<string>();
  for (const t of terms) {
    if (lookupCanonical(t.canonical) || lookupCanonical(t.surface)) continue;
    const canonical = phraseKey(t.canonical || t.surface);
    if (!canonical) continue;
    for (const s of new Set([t.surface, t.canonical])) {
      const k = `${canonical}|${s.toLowerCase()}`;
      if (!s || seen.has(k)) continue;
      seen.add(k);
      out.push({ canonical, surface: s });
    }
  }
  return out;
}
