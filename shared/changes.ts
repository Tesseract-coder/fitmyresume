import { roleBullets } from './resume-text';
import type { ResumeJSON, SkillGroup } from './schema';
import { deepEqual } from './validator';

export type Change =
  | { id: 'headline'; kind: 'headline'; before: string; after: string; safe: boolean }
  | { id: 'summary'; kind: 'summary'; before: string; after: string; safe: boolean }
  | { id: 'skills'; kind: 'skills'; before: SkillGroup[]; after: SkillGroup[]; safe: boolean }
  | { id: `bullet:${string}`; kind: 'bullet'; roleId: string; bulletId: string; before: string; after: string; reason?: string; safe: boolean }
  | { id: `order:${string}`; kind: 'order'; roleId: string; before: string[]; after: string[]; removed: string[]; safe: boolean };

/** Diff a validated tailored resume against the original into independently togglable changes. */
export function computeChanges(original: ResumeJSON, tailored: ResumeJSON, reasons: Record<string, string> = {}): Change[] {
  const out: Change[] = [];
  if ((tailored.headline ?? '') !== (original.headline ?? '')) {
    out.push({ id: 'headline', kind: 'headline', before: original.headline ?? '', after: tailored.headline ?? '', safe: true });
  }
  if (tailored.summary !== original.summary) {
    out.push({ id: 'summary', kind: 'summary', before: original.summary, after: tailored.summary, safe: true });
  }
  if (!deepEqual(tailored.skills, original.skills)) {
    out.push({ id: 'skills', kind: 'skills', before: original.skills, after: tailored.skills, safe: true });
  }
  for (const orig of original.experience) {
    const t = tailored.experience.find((r) => r.id === orig.id);
    if (!t) continue;
    const tBullets = new Map(roleBullets(t).map((b) => [b.id, b]));
    for (const b of roleBullets(orig)) {
      const nb = tBullets.get(b.id);
      if (nb && nb.text !== b.text) {
        const reason = reasons[b.id];
        out.push({ id: `bullet:${b.id}`, kind: 'bullet', roleId: orig.id, bulletId: b.id, before: b.text, after: nb.text, ...(reason ? { reason } : {}), safe: true });
      }
    }
    const before = orig.bullets.map((b) => b.id);
    const after = t.bullets.map((b) => b.id);
    if (before.join() !== after.join()) {
      const removed = before.filter((id) => !after.includes(id));
      // Dropping content is a judgement call, so it is never part of "Accept all safe changes".
      out.push({ id: `order:${orig.id}`, kind: 'order', roleId: orig.id, before, after, removed, safe: removed.length === 0 });
    }
  }
  return out;
}

/**
 * Build the resume the user will export: the original plus only the accepted changes, plus the
 * user's own bullet edits (answers to metric questions), which are always applied.
 */
export function composeResume(
  original: ResumeJSON,
  changes: readonly Change[],
  accepted: ReadonlySet<string>,
  userEdits: Readonly<Record<string, string>> = {},
): ResumeJSON {
  const resume = structuredClone(original);
  const bulletText = new Map<string, string>();
  for (const c of changes) {
    if (!accepted.has(c.id)) continue;
    switch (c.kind) {
      case 'headline':
        if (c.after) resume.headline = c.after;
        else delete resume.headline;
        break;
      case 'summary':
        resume.summary = c.after;
        break;
      case 'skills':
        resume.skills = structuredClone(c.after);
        break;
      case 'bullet':
        bulletText.set(c.bulletId, c.after);
        break;
      case 'order': {
        const role = resume.experience.find((r) => r.id === c.roleId);
        if (!role) break;
        const pool = new Map(role.bullets.map((b) => [b.id, b]));
        role.bullets = c.after.map((id) => pool.get(id)).filter((b) => !!b);
        break;
      }
    }
  }
  for (const [id, text] of Object.entries(userEdits)) bulletText.set(id, text);
  for (const role of resume.experience) {
    for (const b of roleBullets(role)) {
      const t = bulletText.get(b.id);
      if (t !== undefined) b.text = t;
    }
  }
  return resume;
}
