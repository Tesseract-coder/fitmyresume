import { useMemo } from 'react';
import { composeResume } from '@shared/changes';
import { buildEvidence } from '@shared/evidence';
import { analyzeGap } from '@shared/gap';
import { scoreResume } from '@shared/score';
import type { Session } from './store';

/** Everything computed deterministically in the browser from the session. */
export function useDerived(s: Session) {
  const evidence = useMemo(() => (s.baseline ? buildEvidence(s.baseline, s.userFacts) : undefined), [s.baseline, s.userFacts]);
  const gap = useMemo(() => (s.baseline && s.jd && evidence ? analyzeGap(s.baseline, s.jd, evidence) : undefined), [s.baseline, s.jd, evidence]);
  const before = useMemo(
    () => (s.baseline && s.jd && gap ? scoreResume(s.baseline, s.jd, gap, { formattingSafe: !s.multiColumn }) : undefined),
    [s.baseline, s.jd, gap, s.multiColumn],
  );
  const accepted = useMemo(() => new Set(s.accepted), [s.accepted]);
  const final = useMemo(
    () => (s.baseline ? composeResume(s.baseline, s.outcome?.changes ?? [], accepted, s.userEdits) : undefined),
    [s.baseline, s.outcome, accepted, s.userEdits],
  );
  const after = useMemo(() => (final && s.jd && gap ? scoreResume(final, s.jd, gap) : undefined), [final, s.jd, gap]);
  return { evidence, gap, before, final, after, accepted };
}
