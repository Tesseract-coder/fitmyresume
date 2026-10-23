import { buildEvidence, hasPhrase, type EvidenceIndex } from './evidence';
import { displayName, extractTerms, freeExtras, getTerm, impliedBy, lookupCanonical, type ExtraTerm } from './ontology';
import { bodyClaims, skillsText } from './resume-text';
import type { GapAnalysis, GapItem, JDProfile, ResumeJSON, Term } from './schema';
import { phraseKey } from './text';

export interface ResolvedTerm extends Term {
  importance: GapItem['importance'];
  /** true when the canonical is an ontology term. */
  known: boolean;
}

/** Normalise and de-duplicate JD terms; must-have beats nice-to-have beats keyword. */
export function resolveJdTerms(jd: JDProfile): ResolvedTerm[] {
  const out = new Map<string, ResolvedTerm>();
  const add = (terms: Term[], importance: ResolvedTerm['importance']) => {
    for (const t of terms) {
      const surface = (t.surface || t.canonical).trim();
      if (!surface) continue;
      const known = lookupCanonical(t.canonical) ?? lookupCanonical(surface);
      const canonical = known ?? phraseKey(t.canonical || surface);
      if (!canonical) continue;
      const prev = out.get(canonical);
      if (prev) {
        prev.weight = Math.max(prev.weight, t.weight);
        continue;
      }
      out.set(canonical, { canonical, surface, weight: t.weight, importance, known: !!known });
    }
  };
  add(jd.mustHave, 'must');
  add(jd.niceToHave, 'nice');
  add(jd.keywords, 'keyword');
  return [...out.values()];
}

export function jdExtras(jd: JDProfile): ExtraTerm[] {
  return freeExtras(resolveJdTerms(jd));
}

/** Where (and how) a term shows up in a body of text. */
function findTerm(text: string, term: ResolvedTerm, extras: ExtraTerm[]): string | undefined {
  return extractTerms(text, extras).find((m) => m.canonical === term.canonical)?.surface;
}

function sameWording(found: string, term: ResolvedTerm): boolean {
  const f = phraseKey(found);
  return f === phraseKey(term.surface) || (!term.known && f === term.canonical);
}

export function hasEvidenceFor(evidence: EvidenceIndex, term: { canonical: string; known: boolean; surface: string }): boolean {
  return term.known ? evidence.techTerms.has(term.canonical) : hasPhrase(evidence, term.canonical) || hasPhrase(evidence, term.surface);
}

/**
 * Deterministic gap analysis (§5.4):
 *  matched – in the resume with the JD's wording
 *  synonym – in the resume under different wording (alias)
 *  hidden  – evidenced in bullets/summary (or implied, e.g. Pytest ⇒ Python) but absent from Skills
 *  gap     – no evidence at all; never written into the resume
 */
export function analyzeGap(resume: ResumeJSON, jd: JDProfile, evidence: EvidenceIndex = buildEvidence(resume)): GapAnalysis {
  const terms = resolveJdTerms(jd);
  const extras = freeExtras(terms);
  const skills = skillsText(resume);
  const body = [resume.headline ?? '', resume.summary, ...bodyClaims(resume)].join('\n');

  const items: GapItem[] = terms.map((t) => {
    const base = { canonical: t.canonical, surface: t.surface, weight: t.weight, importance: t.importance };
    const inSkills = findTerm(skills, t, extras);
    if (inSkills) {
      return sameWording(inSkills, t) || resumeHasWording(skills + '\n' + body, t)
        ? { ...base, status: 'matched' }
        : { ...base, status: 'synonym', resumeSurface: inSkills };
    }
    const inBody = findTerm(body, t, extras);
    if (inBody) return { ...base, status: 'hidden', resumeSurface: inBody };
    if (hasEvidenceFor(evidence, t)) {
      const via = t.known ? impliers(evidence, t.canonical) : undefined;
      return { ...base, status: 'hidden', ...(via ? { resumeSurface: via } : {}) };
    }
    return { ...base, status: 'gap' };
  });

  return {
    items,
    matched: items.filter((i) => i.status === 'matched'),
    synonym: items.filter((i) => i.status === 'synonym'),
    hidden: items.filter((i) => i.status === 'hidden'),
    gap: items.filter((i) => i.status === 'gap'),
  };
}

function resumeHasWording(text: string, t: ResolvedTerm): boolean {
  return extractTerms(text, freeExtras([t])).some((m) => m.canonical === t.canonical && sameWording(m.surface, t));
}

/** Which stated term implies `canonical` ("via Pytest"). */
function impliers(evidence: EvidenceIndex, canonical: string): string | undefined {
  for (const s of evidence.statedTerms) {
    if (impliedBy(s).includes(canonical)) return displayName(s);
  }
  return undefined;
}

/** Terms the tailoring model may write: everything evidenced, in the candidate's and the JD's wording. */
export function allowedTerms(evidence: EvidenceIndex, gap: GapAnalysis): string[] {
  const out = new Set<string>();
  for (const c of evidence.techTerms) {
    out.add(displayName(c));
    for (const s of evidence.surfaces.get(c) ?? []) out.add(s);
  }
  for (const i of gap.items) if (i.status !== 'gap') out.add(i.surface);
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** Compact gap payload for /api/tailor. */
export function gapPayload(gap: GapAnalysis) {
  return {
    matched: gap.matched.map((i) => i.surface),
    synonym: gap.synonym.map((i) => ({ jd: i.surface, resume: i.resumeSurface ?? i.surface })),
    hidden: gap.hidden.map((i) => i.surface),
    gap: gap.gap.map((i) => i.surface),
  };
}

/** Ontology category for grouping promoted skills. */
export function categoryOf(canonical: string): string | undefined {
  return getTerm(canonical)?.category;
}
