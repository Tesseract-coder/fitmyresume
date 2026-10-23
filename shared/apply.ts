import { roleBullets } from './resume-text';
import type { ResumeJSON, TailorResponse } from './schema';
import { collapseSpace } from './text';

export interface ApplyResult {
  resume: ResumeJSON;
  /** Parts of the response that referenced unknown ids and were ignored. */
  ignored: { path: string; detail: string; attempted: string }[];
}

/**
 * Merge an LLM TailorResponse into a copy of the original resume. Only editable parts
 * (headline, summary, skills, bullet text, bullet order) can change: the response has no
 * way to address locked fields, which is the first layer of the truthfulness contract.
 */
export function applyTailorResponse(original: ResumeJSON, res: TailorResponse): ApplyResult {
  const resume = structuredClone(original);
  const ignored: ApplyResult['ignored'] = [];

  const summary = collapseSpace(res.summary);
  if (summary) resume.summary = summary;
  if (res.headline !== undefined) {
    const h = collapseSpace(res.headline);
    if (h) resume.headline = h;
  }

  if (res.skills.length) {
    const seen = new Set<string>();
    resume.skills = res.skills
      .map((g) => ({
        group: collapseSpace(g.group) || 'Skills',
        items: g.items
          .map(collapseSpace)
          .filter((i) => {
            const k = i.toLowerCase();
            if (!i || seen.has(k)) return false;
            seen.add(k);
            return true;
          }),
      }))
      .filter((g) => g.items.length);
  }

  const byId = new Map(resume.experience.flatMap((r) => roleBullets(r).map((b) => [b.id, b] as const)));
  for (const e of res.bulletEdits) {
    const b = byId.get(e.bulletId);
    if (!b) {
      ignored.push({ path: `bullet:${e.bulletId}`, detail: 'Edit for a bullet that does not exist (new bullets are not allowed)', attempted: e.newText });
      continue;
    }
    const text = collapseSpace(e.newText);
    if (text) b.text = text;
  }

  for (const o of res.bulletOrder) {
    const role = resume.experience.find((r) => r.id === o.roleId);
    if (!role) {
      ignored.push({ path: `role:${o.roleId}`, detail: 'Bullet order for an unknown role', attempted: o.bulletIds.join(', ') });
      continue;
    }
    const pool = new Map(role.bullets.map((b) => [b.id, b]));
    const ordered = [];
    for (const id of o.bulletIds) {
      const b = pool.get(id);
      if (b) {
        ordered.push(b);
        pool.delete(id);
      }
    }
    if (ordered.length) role.bullets = ordered;
  }

  return { resume, ignored };
}
