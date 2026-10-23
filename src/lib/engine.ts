import { allowedTerms, gapPayload } from '@shared/gap';
import type { EvidenceIndex } from '@shared/evidence';
import { heuristicAnalyzeJd } from '@shared/offline/analyze';
import { heuristicCoverLetter } from '@shared/offline/cover';
import { heuristicExtract } from '@shared/offline/extract';
import { heuristicLinkedIn } from '@shared/offline/linkedin';
import { heuristicTailor } from '@shared/offline/tailor';
import type { CoverLetterResponse, CoverTone, ExtractedResume, GapAnalysis, JDProfile, LinkedInResponse, ResumeJSON, TailorResponse } from '@shared/schema';
import { api, type CallOptions } from './api';

export type Engine = 'ai' | 'offline';

/** E2E only: `?mock=<scenario>` on the dev server selects a mock-AI scenario for the whole tab. */
export const mockScenario: string | undefined = (() => {
  if (!import.meta.env.DEV) return undefined;
  try {
    const q = new URLSearchParams(location.search).get('mock');
    if (q) sessionStorage.setItem('fmr.mock', q);
    return sessionStorage.getItem('fmr.mock') ?? undefined;
  } catch {
    return undefined;
  }
})();

/** Each step runs through the AI (Worker) or the deterministic offline rules; both feed the same validator. */
export const engine = {
  extract: (resumeText: string, mode: Engine, opts: CallOptions): Promise<ExtractedResume> =>
    mode === 'offline' ? Promise.resolve(heuristicExtract(resumeText)) : api.extract({ resumeText }, opts),

  analyzeJd: (jdText: string, mode: Engine, opts: CallOptions): Promise<JDProfile> =>
    mode === 'offline' ? Promise.resolve(heuristicAnalyzeJd(jdText)) : api.analyzeJd({ jdText }, opts),

  tailor: (resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis, evidence: EvidenceIndex, mode: Engine, opts: CallOptions): Promise<TailorResponse> =>
    mode === 'offline' ? Promise.resolve(heuristicTailor(resume, jd, gap)) : api.tailor({ resume, jd, ...grounding(gap, evidence) }, opts),

  coverLetter: (
    resume: ResumeJSON,
    jd: JDProfile,
    gap: GapAnalysis,
    evidence: EvidenceIndex,
    letter: { tone: CoverTone; motivation: string },
    mode: Engine,
    opts: CallOptions,
  ): Promise<CoverLetterResponse> => {
    const motivation = letter.motivation.trim();
    if (mode === 'offline') return Promise.resolve(heuristicCoverLetter(resume, jd, gap, { tone: letter.tone, motivation }));
    return api.coverLetter({ resume, jd, ...grounding(gap, evidence), tone: letter.tone, ...(motivation ? { motivation } : {}) }, opts);
  },

  linkedin: (resume: ResumeJSON, jd: JDProfile, gap: GapAnalysis, evidence: EvidenceIndex, mode: Engine, opts: CallOptions): Promise<LinkedInResponse> =>
    mode === 'offline' ? Promise.resolve(heuristicLinkedIn(resume, jd, gap)) : api.linkedin({ resume, jd, ...grounding(gap, evidence) }, opts),
};

/** What the model is told it may and may not write, within the API's size caps. */
function grounding(gap: GapAnalysis, evidence: EvidenceIndex) {
  const g = gapPayload(gap);
  return {
    gap: { matched: g.matched.slice(0, 100), synonym: g.synonym.slice(0, 100), hidden: g.hidden.slice(0, 100), gap: g.gap.slice(0, 100) },
    allowedTerms: allowedTerms(evidence, gap).filter((t) => t.length <= 80).slice(0, 400),
  };
}
