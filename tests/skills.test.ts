import { describe, expect, it } from 'vitest';
import { buildEvidence } from '../shared/evidence';
import { analyzeGap } from '../shared/gap';
import { ADDED_GROUP, addSkills, removeSkills } from '../shared/skills';
import { scoreResume } from '../shared/score';
import { javaSdetJd, pythonQa } from './fixtures/resumes';

const term = (surface: string, canonical = surface.toLowerCase()) => ({ surface, canonical });

describe('adding user-confirmed skills', () => {
  it('puts each skill next to skills of the same kind, in the job’s wording', () => {
    const { resume, added } = addSkills(pythonQa, [term('Java'), term('Cucumber'), term('RestAssured', 'rest assured'), term('JIRA', 'jira'), term('agile')]);
    expect(added).toEqual(['Java', 'Cucumber', 'RestAssured', 'JIRA', 'agile']);
    const group = (name: string) => resume.skills.find((g) => g.group === name)!.items;
    expect(group('Languages')).toEqual(['Python', 'SQL', 'Java']);
    expect(group('Testing')).toEqual(['Pytest', 'Selenium', 'Postman', 'Cucumber', 'RestAssured']);
    expect(group(ADDED_GROUP)).toEqual(['JIRA', 'agile']);
    // Nothing else changes.
    expect({ ...resume, skills: pythonQa.skills }).toEqual(pythonQa);
  });

  it('skips skills already listed, under any alias', () => {
    const { resume, added } = addSkills(pythonQa, [term('Kubernetes'), term('selenium'), term('Docker')]);
    expect(added).toEqual([]);
    expect(resume.skills).toEqual(pythonQa.skills);
  });

  it('turns a must-have gap into a match and lifts the score cap', () => {
    const before = analyzeGap(pythonQa, javaSdetJd, buildEvidence(pythonQa));
    expect(before.gap.map((i) => i.surface)).toEqual(['Java']);
    const { resume } = addSkills(pythonQa, [term('Java')]);
    const after = analyzeGap(resume, javaSdetJd, buildEvidence(resume));
    expect(after.gap).toEqual([]);
    expect(after.matched.map((i) => i.surface)).toContain('Java');
    expect(scoreResume(resume, javaSdetJd, after).cap.max).toBeGreaterThan(scoreResume(pythonQa, javaSdetJd, before).cap.max);
  });

  it('undo removes exactly what was added (and the group it created)', () => {
    const { resume, added } = addSkills(pythonQa, [term('Java'), term('JIRA', 'jira'), term('Selenium')]);
    expect(added).toEqual(['Java', 'JIRA']);
    expect(removeSkills(resume, added)).toEqual(pythonQa);
  });
});
