import { applyTailorResponse } from './apply';
import { computeChanges, type Change } from './changes';
import type { EvidenceIndex } from './evidence';
import { roleBullets } from './resume-text';
import type { GapAnalysis, JDProfile, ResumeJSON, TailorResponse } from './schema';
import { validateTailoredResume, type AutoFix, type Violation } from './validator';

export interface TailorOutcome {
  tailored: ResumeJSON;
  violations: Violation[];
  autoFixes: AutoFix[];
  metricQuestions: { bulletId: string; question: string }[];
  notes: string[];
  changes: Change[];
}

/** LLM response → merged → validated → reviewable changes. Pure and deterministic. */
export function runTailorPipeline(args: {
  original: ResumeJSON;
  evidence: EvidenceIndex;
  jd: JDProfile;
  gap: GapAnalysis;
  jdText?: string;
  response: TailorResponse;
}): TailorOutcome {
  const { original, evidence, jd, gap, jdText, response } = args;
  const applied = applyTailorResponse(original, response);
  const result = validateTailoredResume(original, applied.resume, evidence, { gap, jd, ...(jdText ? { jdText } : {}) });

  const violations: Violation[] = [
    ...applied.ignored.map((i): Violation => ({ kind: 'unknown-bullet', path: i.path, detail: i.detail, attempted: i.attempted, action: 'removed' })),
    ...result.violations,
  ];

  const bulletIds = new Set(original.experience.flatMap((r) => roleBullets(r).map((b) => b.id)));
  const seen = new Set<string>();
  const metricQuestions = response.metricQuestions
    .filter((q) => bulletIds.has(q.bulletId) && q.question.trim() && !seen.has(q.bulletId) && seen.add(q.bulletId))
    .slice(0, 8);

  const reasons = Object.fromEntries(response.bulletEdits.map((e) => [e.bulletId, e.reason]));
  return {
    tailored: result.resume,
    violations,
    autoFixes: result.autoFixes,
    metricQuestions,
    notes: response.notes,
    changes: computeChanges(original, result.resume, reasons),
  };
}
