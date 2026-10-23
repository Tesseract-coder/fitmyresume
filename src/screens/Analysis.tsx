import { AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router';
import { runTailorPipeline } from '@shared/pipeline';
import type { GapItem } from '@shared/schema';
import { EngineToggle, useAiStep } from '@/components/AiStep';
import { KeywordChips } from '@/components/KeywordChips';
import { PageTitle } from '@/components/Layout';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { ScoreRing } from '@/components/ScoreRing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDerived } from '@/lib/derived';
import { engine } from '@/lib/engine';
import { useStore } from '@/lib/store';

export default function Analysis() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const setOutcome = useStore((st) => st.setOutcome);
  const acceptSafe = useStore((st) => st.acceptSafe);
  const navigate = useNavigate();
  const step = useAiStep();
  const { evidence, gap, before } = useDerived(s);
  const jd = s.jd!;
  const baseline = s.baseline!;
  if (!gap || !before || !evidence) return null;

  const mustGaps = gap.gap.filter((i) => i.importance === 'must');

  /** Let the user drop a term the JD analysis got wrong (it then no longer counts for or against them). */
  const removeTerm = (item: GapItem) => {
    const keep = (t: { canonical: string }) => t.canonical !== item.canonical;
    update({
      jd: { ...jd, mustHave: jd.mustHave.filter(keep), niceToHave: jd.niceToHave.filter(keep), keywords: jd.keywords.filter(keep) },
      outcome: undefined,
      accepted: [],
      userEdits: {},
    });
  };

  const tailor = () =>
    void step.run('Tailoring your resume…', async (mode, opts) => {
      const response = await engine.tailor(baseline, jd, gap, evidence, mode, opts);
      const outcome = runTailorPipeline({ original: baseline, evidence, jd, gap, jdText: s.jdText, response });
      setOutcome(outcome, mode);
      acceptSafe();
      navigate('/review');
    });

  return (
    <div className="space-y-4">
      <PageTitle
        title="How your resume matches"
        subtitle={
          <>
            {jd.title || 'This role'}
            {jd.company && <> at {jd.company}</>}
            {jd.seniority && <> · {jd.seniority}</>}
            {jd.domain && <> · {jd.domain}</>}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-5 sm:pt-5">
            <ScoreRing score={before.total} cap={before.cap.max} label="ATS score now" size={140} />
            {before.cap.max < 100 && (
              <p className="text-center text-xs text-muted">
                Best honest score: <b className="text-[var(--text)]">{before.cap.max}</b>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job keywords</CardTitle>
            <CardDescription>Remove a chip if the job analysis picked up something that isn't really a requirement.</CardDescription>
          </CardHeader>
          <CardContent>
            <KeywordChips gap={gap} onRemove={removeTerm} />
          </CardContent>
        </Card>
      </div>

      {mustGaps.length > 0 && (
        <div role="note" className="flex gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="space-y-2">
            <p className="font-semibold">
              Score is capped at {before.cap.max} because these must-haves are true gaps:
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {mustGaps.map((i) => (
                <li key={i.canonical}>
                  <Badge tone="gap">{i.surface}</Badge>
                </li>
              ))}
            </ul>
            <p>They will never be added to your resume. The remaining gap is about skills, not wording — see the Skills Gap report after tailoring.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Score breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <ScoreBreakdown before={before} />
        </CardContent>
      </Card>

      {step.ui}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate('/confirm')}>
          Back
        </Button>
        {s.outcome && (
          <Button variant="outline" onClick={() => navigate('/review')}>
            Back to review <ArrowRight aria-hidden="true" />
          </Button>
        )}
        <EngineToggle />
        <Button size="lg" variant="accent" onClick={tailor} disabled={step.busy}>
          <Sparkles aria-hidden="true" /> {s.outcome ? 'Tailor again' : 'Tailor my resume'}
        </Button>
      </div>
    </div>
  );
}
