import type { EvidenceIndex } from './evidence';
import { categoryOf, hasEvidenceFor, jdExtras } from './gap';
import { displayName, extractTerms, lookupCanonical, type ExtraTerm } from './ontology';
import type { Bullet, Experience, GapAnalysis, GapItem, JDProfile, ResumeJSON, SkillGroup } from './schema';
import { claimsText } from './resume-text';
import { collapseSpace, extractNumberWords, extractNumbers, splitSentences, stem, tokenize } from './text';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ViolationKind =
  | 'locked-field'
  | 'role-structure'
  | 'unknown-bullet'
  | 'locked-bullet'
  | 'unsupported-term'
  | 'gap-term'
  | 'new-number'
  | 'years-claim'
  | 'seniority'
  | 'ownership-inflation'
  | 'jd-copy'
  | 'stuffing';

export interface Violation {
  kind: ViolationKind;
  /** Where it happened: "contact", "experience[r1].title", "bullet:r1b2", "summary", "skills[Languages]"… */
  path: string;
  /** Human-readable explanation for the "Blocked changes" drawer. */
  detail: string;
  /** What the model tried to write. */
  attempted: string;
  /** reverted/restored/removed = blocked; warned = kept but flagged. */
  action: 'restored' | 'reverted' | 'removed' | 'warned';
  /** The offending term or number, when there is one. */
  term?: string;
}

export type AutoFixKind = 'promote-hidden' | 'jd-wording' | 'restore-min-bullets' | 'restore-skill';

export interface AutoFix {
  kind: AutoFixKind;
  path: string;
  detail: string;
}

export interface ValidationContext {
  gap?: GapAnalysis;
  jd?: JDProfile;
  /** Raw JD text: used to block verbatim copying. */
  jdText?: string;
}

export interface ValidationResult {
  resume: ResumeJSON;
  violations: Violation[];
  autoFixes: AutoFix[];
}

interface Problem {
  kind: ViolationKind;
  detail: string;
  term?: string;
}

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** Verbs that claim ownership/leadership. A rewrite may not introduce one the original lacked. */
const OWNERSHIP: Record<string, string> = {
  led: 'lead', lead: 'lead', leading: 'lead', leads: 'lead',
  managed: 'manage', manage: 'manage', managing: 'manage', manages: 'manage',
  owned: 'own', own: 'own', owning: 'own', owns: 'own', ownership: 'own',
  spearheaded: 'spearhead', spearheading: 'spearhead',
  headed: 'head', heading: 'head',
  directed: 'direct', directing: 'direct',
  architected: 'architect', architecting: 'architect',
  oversaw: 'oversee', overseeing: 'oversee', oversee: 'oversee',
  supervised: 'supervise', supervising: 'supervise',
  mentored: 'mentor', mentoring: 'mentor',
  championed: 'champion',
  pioneered: 'pioneer',
  founded: 'found',
};

const SENIORITY = new Set(['senior', 'sr', 'lead', 'principal', 'staff', 'head', 'manager', 'director', 'architect', 'vp', 'chief', 'expert']);

/** Acronyms that are ordinary business vocabulary, not technology claims. */
const COMMON_ACRONYMS = new Set(
  [
    'qa', 'qe', 'qc', 'ui', 'ux', 'api', 'apis', 'kpi', 'kpis', 'sla', 'slas', 'roi', 'b2b', 'b2c', 'saas', 'paas', 'poc', 'mvp',
    'us', 'usa', 'uk', 'eu', 'ceo', 'cto', 'cio', 'hr', 'it', 'pr', 'prs', 'e2e', 'uat', 'sit', 'okr', 'okrs', 'r&d', 'sme',
    'smes', 'faq', 'pdf', 'csv', 'url', 'urls', 'id', 'ids', 'os', 'ok', 'ai/ml', 'p1', 'p0', 'rca', 'rcas', 'sop', 'sops', 'ga',
    'mttr', 'mtbf', 'nps', 'q1', 'q2', 'q3', 'q4', 'fy', 'yoy', 'mom', 'etc', 'ie', 'eg',
  ].map(stem),
);

/* ------------------------------------------------------------------ */
/* Validator                                                           */
/* ------------------------------------------------------------------ */

/**
 * The deterministic half of "the LLM proposes; code disposes" (§2.4). Pure: never mutates inputs.
 * Locked fields are restored, unsupported claims are reverted, and every action is logged.
 */
export function validateTailoredResume(
  original: ResumeJSON,
  proposed: ResumeJSON,
  evidence: EvidenceIndex,
  ctx: ValidationContext = {},
): ValidationResult {
  const v = new Validator(original, evidence, ctx);
  const resume = structuredClone(proposed);

  v.checkLockedTopLevel(resume);
  resume.experience = v.checkRoles(resume.experience);
  resume.summary = v.checkSummary(resume.summary);
  v.checkHeadline(resume);
  resume.skills = v.checkSkills(resume.skills);
  if (ctx.gap) resume.skills = v.ensureJdCoverage(resume, ctx.gap);
  v.checkStuffing(resume);

  return { resume, violations: v.violations, autoFixes: v.autoFixes };
}

class Validator {
  violations: Violation[] = [];
  autoFixes: AutoFix[] = [];
  private extras: ExtraTerm[];
  private gapByCanonical = new Map<string, GapItem>();
  private jdShingles = new Set<string>();
  private titleWords: Set<string>;

  constructor(
    private original: ResumeJSON,
    private evidence: EvidenceIndex,
    ctx: ValidationContext,
  ) {
    this.extras = ctx.jd ? jdExtras(ctx.jd) : [];
    for (const i of ctx.gap?.items ?? []) this.gapByCanonical.set(i.canonical, i);
    if (ctx.jdText) {
      // Phrases the candidate already wrote are theirs, even if the JD happens to share them.
      const own = shingles(claimsText(original));
      this.jdShingles = new Set([...shingles(ctx.jdText)].filter((s) => !own.has(s)));
    }
    this.titleWords = new Set(tokenize([...original.experience.map((r) => r.title), original.headline ?? ''].join(' ')));
  }

  private log(kind: ViolationKind, path: string, detail: string, attempted: string, action: Violation['action'], term?: string) {
    this.violations.push({ kind, path, detail, attempted, action, ...(term ? { term } : {}) });
  }

  /* ---------------- locked fields ---------------- */

  checkLockedTopLevel(resume: ResumeJSON) {
    const o = this.original;
    const fields = ['contact', 'yearsOfExperience', 'education', 'certifications', 'awards', 'extras'] as const;
    for (const f of fields) {
      if (!deepEqual(resume[f], o[f])) {
        this.log('locked-field', f, `${label(f)} is locked and must match your original resume, so it was restored.`, preview(resume[f]), 'restored');
        if (o[f] === undefined) delete resume[f];
        else (resume as Record<string, unknown>)[f] = structuredClone(o[f]);
      }
    }
  }

  checkRoles(proposed: Experience[]): Experience[] {
    const byId = new Map(proposed.map((r) => [r.id, r]));
    const known = new Set(this.original.experience.map((r) => r.id));
    for (const r of proposed) {
      if (!known.has(r.id)) {
        this.log('role-structure', `experience[${r.id}]`, `A role that is not in your resume ("${r.title} | ${r.company}") was removed.`, `${r.title} | ${r.company}`, 'removed');
      }
    }
    const proposedOrder = proposed.map((r) => r.id).filter((id) => known.has(id));
    const originalOrder = this.original.experience.map((r) => r.id).filter((id) => byId.has(id));
    if (proposedOrder.join() !== originalOrder.join()) {
      this.log('role-structure', 'experience', 'Roles must stay in their original order, so the order was restored.', proposedOrder.join(', '), 'restored');
    }

    return this.original.experience.map((orig) => {
      const prop = byId.get(orig.id);
      if (!prop) {
        this.log('role-structure', `experience[${orig.id}]`, `The role "${orig.title} | ${orig.company}" was missing and has been restored.`, '(missing)', 'restored');
        return structuredClone(orig);
      }
      return this.checkRole(orig, prop);
    });
  }

  private checkRole(orig: Experience, prop: Experience): Experience {
    const role = structuredClone(prop);
    for (const f of ['company', 'title', 'location', 'startDate', 'endDate'] as const) {
      if (role[f] !== orig[f]) {
        this.log('locked-field', `experience[${orig.id}].${f}`, `${label(f)} is locked ("${orig[f]}"), so the change was reverted.`, role[f], 'restored');
        role[f] = orig[f];
      }
    }
    role.bullets = this.checkBullets(orig.bullets, role.bullets, `experience[${orig.id}]`);

    if (orig.projects || role.projects) {
      const origProjects = orig.projects ?? [];
      const propProjects = role.projects ?? [];
      if (propProjects.length !== origProjects.length) {
        this.log('role-structure', `experience[${orig.id}].projects`, 'Projects must match your resume, so the project list was restored.', `${propProjects.length} projects`, 'restored');
      }
      role.projects = origProjects.map((op, i) => {
        const pp = propProjects[i];
        if (!pp) return structuredClone(op);
        if (pp.name !== op.name || pp.client !== op.client) {
          this.log('locked-field', `experience[${orig.id}].projects[${i}]`, 'Project names and clients are locked, so they were restored.', [pp.name, pp.client].filter(Boolean).join(' | '), 'restored');
        }
        return { ...structuredClone(op), bullets: this.checkBullets(op.bullets, pp.bullets, `experience[${orig.id}].projects[${i}]`) };
      });
      if (!orig.projects) delete role.projects;
    }
    return role;
  }

  private checkBullets(origBullets: Bullet[], propBullets: Bullet[], path: string): Bullet[] {
    const origById = new Map(origBullets.map((b) => [b.id, b]));
    const seen = new Set<string>();
    const out: Bullet[] = [];
    for (const pb of propBullets) {
      const ob = origById.get(pb.id);
      if (!ob || seen.has(pb.id)) {
        this.log('unknown-bullet', `bullet:${pb.id}`, 'New bullets cannot be added: every bullet must come from your resume.', pb.text, 'removed');
        continue;
      }
      seen.add(pb.id);
      out.push(this.checkBullet(ob, pb));
    }

    const min = Math.min(2, origBullets.length);
    if (out.length < min) {
      for (const ob of origBullets) {
        if (out.length >= min) break;
        if (seen.has(ob.id)) continue;
        out.push(structuredClone(ob));
        seen.add(ob.id);
        this.autoFixes.push({ kind: 'restore-min-bullets', path: `${path}`, detail: `Kept at least ${min} bullets for this role by restoring: "${ob.text}"` });
      }
    }
    return out;
  }

  private checkBullet(orig: Bullet, prop: Bullet): Bullet {
    const text = collapseSpace(prop.text);
    const base = { ...orig };
    if (text === orig.text) return base;
    const path = `bullet:${orig.id}`;
    if (orig.locked) {
      this.log('locked-bullet', path, 'You locked this bullet, so the rewrite was reverted.', text, 'reverted');
      return base;
    }
    const problems = this.claimProblems(text, { originalText: orig.text });
    if (problems.length) {
      for (const p of problems) this.log(p.kind, path, p.detail, text, 'reverted', p.term);
      return base;
    }
    return { ...base, text };
  }

  /* ---------------- summary & headline ---------------- */

  checkSummary(summary: string): string {
    const text = collapseSpace(summary);
    if (text === collapseSpace(this.original.summary)) return this.original.summary;
    const kept: string[] = [];
    for (const sentence of splitSentences(text)) {
      const problems = [
        ...this.claimProblems(sentence, { summaryLike: true }),
        ...this.yearsProblems(sentence),
        ...this.seniorityProblems(sentence, false),
      ];
      if (problems.length) {
        for (const p of problems) this.log(p.kind, 'summary', p.detail, sentence, 'removed', p.term);
      } else kept.push(sentence);
    }
    if (!kept.length) {
      this.log('unsupported-term', 'summary', 'No sentence of the rewritten summary could be verified, so your original summary was kept.', text, 'reverted');
      return this.original.summary;
    }
    return kept.join(' ');
  }

  checkHeadline(resume: ResumeJSON) {
    const h = collapseSpace(resume.headline ?? '');
    const orig = this.original.headline;
    const restore = () => {
      if (orig === undefined) delete resume.headline;
      else resume.headline = orig;
    };
    // An emptied headline keeps the original; an unchanged one is left byte-identical.
    if (!h || h === collapseSpace(orig ?? '')) return restore();
    const problems = [...this.claimProblems(h, { summaryLike: true }), ...this.yearsProblems(h), ...this.seniorityProblems(h, true)];
    if (problems.length) {
      for (const p of problems) this.log(p.kind, 'headline', p.detail, h, 'reverted', p.term);
      return restore();
    }
    resume.headline = h;
  }

  private yearsProblems(text: string): Problem[] {
    const allowed = new Set<string>();
    for (const src of [this.original.yearsOfExperience, ...yearPhrases(this.original.summary), ...yearPhrases(this.original.headline ?? '')]) {
      for (const n of extractNumbers(src)) n.values.forEach((x) => allowed.add(x));
    }
    const out: Problem[] = [];
    for (const phrase of yearPhrases(text)) {
      const nums = extractNumbers(phrase).flatMap((n) => n.values);
      if (!nums.some((n) => allowed.has(n))) {
        out.push({ kind: 'years-claim', detail: `"${phrase}" does not match your locked experience (${this.original.yearsOfExperience || 'not stated'}).`, term: phrase });
      }
    }
    return out;
  }

  private seniorityProblems(text: string, anyCase: boolean): Problem[] {
    const out: Problem[] = [];
    const words = anyCase ? tokenize(text) : (text.match(/\b(?:Sr\.?|[A-Z][a-z]+|VP)\b/g) ?? []).map((w) => w.toLowerCase().replace(/\.$/, ''));
    for (const w of new Set(words)) {
      if (SENIORITY.has(w) && !this.titleWords.has(w)) {
        out.push({ kind: 'seniority', detail: `"${w}" implies a seniority your job titles don't show.`, term: w });
      }
    }
    return out;
  }

  /* ---------------- claims (terms, numbers, ownership, copying) ---------------- */

  private claimProblems(text: string, opts: { originalText?: string; summaryLike?: boolean }): Problem[] {
    const out: Problem[] = [];
    const matches = extractTerms(text, this.extras);
    const covered = new Uint8Array(text.length);
    for (const m of matches) {
      covered.fill(1, m.start, m.end);
      const gapItem = this.gapByCanonical.get(m.canonical);
      if (m.free) {
        if (gapItem?.status === 'gap') out.push(gapProblem(m.surface));
        continue;
      }
      if (!this.evidence.techTerms.has(m.canonical)) {
        out.push(gapItem ? gapProblem(m.surface) : { kind: 'unsupported-term', detail: `"${m.surface}" is not in your resume, so it can't be added.`, term: m.surface });
      }
    }

    // Tech-shaped tokens unknown to the ontology (CamelCase, ACRONYMS, *.js) must also be evidenced.
    for (const m of text.matchAll(/(?<![\p{L}\p{N}])(?:[A-Z][\p{L}\p{N}]*[A-Z][\p{L}\p{N}]*|[\p{L}]+\.(?:js|io|net|ts|py))(?![\p{L}\p{N}])/gu)) {
      if (covered[m.index]) continue;
      const tok = stem(m[0].toLowerCase());
      if (COMMON_ACRONYMS.has(tok) || this.evidence.tokens.has(tok) || /^\d/.test(tok)) continue;
      out.push({ kind: 'unsupported-term', detail: `"${m[0]}" looks like a technology or credential that isn't in your resume.`, term: m[0] });
    }

    for (const n of extractNumbers(text)) {
      if (!n.values.some((x) => this.evidence.numbers.has(x))) {
        out.push({ kind: 'new-number', detail: `The number "${n.raw}" isn't in your resume. Numbers are never invented; answer a metric question to add one.`, term: n.raw });
      }
    }
    for (const w of extractNumberWords(text)) {
      if (!this.evidence.words.has(w)) {
        out.push({ kind: 'new-number', detail: `"${w}" states a quantity that isn't in your resume.`, term: w });
      }
    }

    const ownershipBase = opts.originalText !== undefined ? new Set(tokenize(opts.originalText)) : this.evidence.words;
    const baseRoots = new Set([...ownershipBase].map((w) => OWNERSHIP[w]).filter(Boolean));
    for (const w of new Set(tokenize(text))) {
      const root = OWNERSHIP[w];
      if (root && !baseRoots.has(root)) {
        out.push({ kind: 'ownership-inflation', detail: `"${w}" claims more ownership than ${opts.summaryLike ? 'your resume shows' : 'the original bullet'}.`, term: w });
      }
    }

    if (this.jdShingles.size) {
      const copied = [...shingles(text)].find((s) => this.jdShingles.has(s));
      if (copied) out.push({ kind: 'jd-copy', detail: `Copies the job description word for word ("${copied}…").`, term: copied });
    }
    return out;
  }

  /* ---------------- skills ---------------- */

  checkSkills(groups: SkillGroup[]): SkillGroup[] {
    const out: SkillGroup[] = [];
    for (const g of groups) {
      const path = `skills[${g.group}]`;
      let group = collapseSpace(g.group) || 'Technical Skills';
      const groupProblems = this.claimProblems(group, { summaryLike: true }).filter((p) => p.kind === 'unsupported-term' || p.kind === 'gap-term');
      if (groupProblems.length) {
        for (const p of groupProblems) this.log(p.kind, path, `Skill group name: ${p.detail}`, group, 'reverted', p.term);
        group = 'Technical Skills';
      }
      const items: string[] = [];
      for (const raw of g.items) {
        const item = collapseSpace(raw);
        const problems = this.skillProblems(item);
        if (problems.length) {
          for (const p of problems) this.log(p.kind, path, p.detail, item, 'removed', p.term);
        } else items.push(item);
      }
      if (items.length) {
        const existing = out.find((x) => x.group === group);
        if (existing) existing.items.push(...items);
        else out.push({ group, items });
      }
    }
    return out;
  }

  private skillProblems(item: string): Problem[] {
    const problems = this.claimProblems(item, { summaryLike: true }).filter((p) => p.kind !== 'ownership-inflation');
    if (problems.length) return problems;
    const terms = extractTerms(item, this.extras);
    if (terms.length) return [];
    // A free-text skill ("Test Planning") must be something the resume actually says.
    const key = lookupCanonical(item);
    const ok = key ? this.evidence.techTerms.has(key) : hasEvidenceFor(this.evidence, { canonical: item, surface: item, known: false });
    return ok ? [] : [{ kind: 'unsupported-term', detail: `"${item}" isn't mentioned anywhere in your resume, so it can't be listed as a skill.`, term: item }];
  }

  /**
   * Deterministic guarantees after the model's edits:
   *  - synonyms in Skills use the JD's wording ("Kubernetes (K8s)")
   *  - every evidenced JD term (matched / synonym / hidden) appears in Skills.
   */
  ensureJdCoverage(resume: ResumeJSON, gap: GapAnalysis): SkillGroup[] {
    const skills = structuredClone(resume.skills);
    const allItems = () => skills.flatMap((g) => g.items);
    const canonicalsIn = (s: string) => new Set(extractTerms(s, this.extras).map((m) => m.canonical));

    for (const item of gap.synonym) {
      for (const g of skills) {
        g.items = g.items.map((s) => {
          if (!canonicalsIn(s).has(item.canonical)) return s;
          if (s.toLowerCase().includes(item.surface.toLowerCase())) return s;
          this.autoFixes.push({ kind: 'jd-wording', path: `skills[${g.group}]`, detail: `Used the job description's wording: "${s}" → "${item.surface} (${s})"` });
          return `${item.surface} (${s})`;
        });
      }
    }

    for (const item of gap.items) {
      if (item.status === 'gap') continue;
      const present = allItems().some((s) => canonicalsIn(s).has(item.canonical));
      if (present) continue;
      const known = !!lookupCanonical(item.canonical);
      const label = known && lookupCanonical(item.surface) !== item.canonical ? displayName(item.canonical) : item.surface;
      const target = this.groupFor(skills, item.canonical);
      target.items.push(label);
      const kind: AutoFixKind = item.status === 'hidden' ? 'promote-hidden' : 'restore-skill';
      this.autoFixes.push({
        kind,
        path: `skills[${target.group}]`,
        detail:
          kind === 'promote-hidden'
            ? `Promoted "${label}" to Skills — your experience ${item.resumeSurface ? `mentions ${item.resumeSurface}` : 'shows it'} but your Skills section didn't list it.`
            : `Kept "${label}" in Skills because the job asks for it and your resume has it.`,
      });
    }
    return skills.filter((g) => g.items.length);
  }

  private groupFor(skills: SkillGroup[], canonical: string): SkillGroup {
    const cat = categoryOf(canonical);
    if (cat) {
      const g = skills.find((grp) => grp.items.some((i) => [...extractTerms(i)].some((m) => categoryOf(m.canonical) === cat)));
      if (g) return g;
    }
    let extra = skills.find((g) => g.group === 'Additional Skills');
    if (!extra) {
      extra = { group: 'Additional Skills', items: [] };
      skills.push(extra);
    }
    return extra;
  }

  /* ---------------- stuffing ---------------- */

  checkStuffing(resume: ResumeJSON) {
    // Count lines (bullets, sentences, skill groups) mentioning a term, so "Kubernetes (K8s)" counts once.
    const count = (text: string) => {
      const m = new Map<string, number>();
      for (const line of text.split('\n')) {
        for (const c of new Set(extractTerms(line, this.extras).map((t) => t.canonical))) m.set(c, (m.get(c) ?? 0) + 1);
      }
      return m;
    };
    const before = count(claimsText(this.original));
    for (const [canonical, n] of count(claimsText(resume))) {
      const limit = Math.max(3, before.get(canonical) ?? 0);
      if (n > limit) {
        this.log('stuffing', 'document', `"${displayName(canonical)}" appears ${n} times; more than ${limit} reads as keyword stuffing.`, displayName(canonical), 'warned', displayName(canonical));
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function gapProblem(surface: string): Problem {
  return {
    kind: 'gap-term',
    detail: `"${surface}" is required by the job but isn't in your resume, so it was blocked. It's listed in your Skills Gap report instead.`,
    term: surface,
  };
}

function yearPhrases(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?\s*\+?\s*(?:years?|yrs?)\b/gi)].map((m) => m[0]);
}

function shingles(text: string, n = 8): Set<string> {
  const toks = tokenize(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= toks.length; i++) out.add(toks.slice(i, i + n).join(' '));
  return out;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bk = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const LABELS = {
  contact: 'Contact details',
  yearsOfExperience: 'Years of experience',
  education: 'Education',
  certifications: 'Certifications',
  awards: 'Awards',
  extras: 'Additional sections',
  company: 'Employer',
  title: 'Job title',
  location: 'Location',
  startDate: 'Start date',
  endDate: 'End date',
} as const;

function label(field: keyof typeof LABELS): string {
  return LABELS[field];
}

function preview(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > 160 ? `${s.slice(0, 157)}…` : (s ?? '');
}
