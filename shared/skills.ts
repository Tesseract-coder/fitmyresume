import { categoryOf } from './gap';
import { extractTerms } from './ontology';
import type { ResumeJSON } from './schema';

/** Group for user-confirmed skills that don't fit an existing group. */
export const ADDED_GROUP = 'Additional Skills';

/**
 * Add skills the user confirms they have (e.g. job keywords that were gaps only because the
 * resume never mentioned them) to the Skills section, in the job's wording, next to skills of the
 * same kind. Pure. Returns the labels actually added (already-listed skills are skipped), so an
 * undo can never remove something the resume had before.
 */
export function addSkills(resume: ResumeJSON, skills: readonly { surface: string; canonical: string }[]): { resume: ResumeJSON; added: string[] } {
  const out = structuredClone(resume);
  const present = new Set(out.skills.flatMap((g) => g.items).flatMap((i) => [i.toLowerCase(), ...extractTerms(i).map((m) => m.canonical)]));
  const added: string[] = [];
  for (const s of skills) {
    const label = s.surface.trim();
    if (!label || present.has(label.toLowerCase()) || present.has(s.canonical)) continue;
    const category = categoryOf(s.canonical);
    let group = category ? out.skills.find((g) => g.items.some((i) => extractTerms(i).some((m) => categoryOf(m.canonical) === category))) : undefined;
    if (!group) {
      group = out.skills.find((g) => g.group === ADDED_GROUP);
      if (!group) {
        group = { group: ADDED_GROUP, items: [] };
        out.skills.push(group);
      }
    }
    group.items.push(label);
    present.add(label.toLowerCase());
    present.add(s.canonical);
    added.push(label);
  }
  return { resume: out, added };
}

/** Undo `addSkills`: remove exactly these labels, and any group left empty. Pure. */
export function removeSkills(resume: ResumeJSON, labels: readonly string[]): ResumeJSON {
  const drop = new Set(labels);
  const out = structuredClone(resume);
  out.skills = out.skills.map((g) => ({ ...g, items: g.items.filter((i) => !drop.has(i)) })).filter((g) => g.items.length);
  return out;
}
