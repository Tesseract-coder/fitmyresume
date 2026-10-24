import { AlertTriangle, ArrowRight, GraduationCap, Plus, Sparkles, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { runTailorPipeline } from '@shared/pipeline';
import type { GapItem } from '@shared/schema';
import { impliedBy } from '@shared/ontology';
import { addSkills, removeSkills } from '@shared/skills';
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
  const [picked, setPicked] = useState<string[]>([]);
  const { evidence, gap, before } = useDerived(s);
  const jd = s.jd!;
  const baseline = s.baseline!;
  if (!gap || !before || !evidence) return null;

  const mustGaps = gap.gap.filter((i) => i.importance === 'must');
  const added = s.addedSkills ?? [];
  const resetTailoring = { outcome: undefined, accepted: [], userEdits: {}, coverLetter: undefined, linkedin: undefined };

  /** The user confirms they really have these skills: add them to Skills, exactly as the job words them. */
  const addPicked = () => {
    const result = addSkills(baseline, gap.gap.filter((i) => picked.includes(i.canonical)));
    update({ baseline: result.resume, extracted: result.resume, addedSkills: [...added, ...result.added], ...resetTailoring });
    setPicked([]);
  };
  // e.g. RestAssured is a Java library: ticking it also counts as Java experience. Say so before adding.
  const implied = gap.gap
    .filter((g) => !picked.includes(g.canonical) && picked.some((p) => impliedBy(p).includes(g.canonical)))
    .map((g) => ({ gap: g.surface, by: gap.gap.filter((p) => picked.includes(p.canonical) && impliedBy(p.canonical).includes(g.canonical)).map((p) => p.surface) }));
  const undoAdded = () => {
    const restored = removeSkills(baseline, added);
    update({ baseline: restored, extracted: restored, addedSkills: [], ...resetTailoring });
  };

  /** Let the user drop a term the JD analysis got wrong (it then no longer counts for or against them). */
  const removeTerm = (item: GapItem) => {
    const keep = (t: { canonical: string }) => t.canonical !== item.canonical;
    update({
      jd: { ...jd, mustHave: jd.mustHave.filter(keep), niceToHave: jd.niceToHave.filter(keep), keywords: jd.keywords.filter(keep) },
      ...resetTailoring,
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

      {(gap.gap.length > 0 || added.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Already have some of these?</CardTitle>
            <CardDescription>
              Tick only skills you've genuinely used at work or in projects. They're added to your Technical Skills exactly as the job words them, and count as your skills for
              tailoring, the cover letter and LinkedIn. Everything else in your resume stays the same.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {gap.gap.length > 0 && (
              <fieldset>
                <legend className="sr-only">Skills to add to your resume</legend>
                <div className="flex flex-wrap gap-2">
                  {[...gap.gap]
                    .sort((a, b) => (a.importance === 'must' ? 0 : 1) - (b.importance === 'must' ? 0 : 1))
                    .map((i) => {
                      const on = picked.includes(i.canonical);
                      return (
                        <label key={i.canonical} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-subtle px-3 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-600/5">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setPicked(on ? picked.filter((c) => c !== i.canonical) : [...picked, i.canonical])}
                            className="size-4 accent-teal-600"
                          />
                          {i.surface}
                          {i.importance === 'must' && <span className="text-xs text-muted">must-have</span>}
                        </label>
                      );
                    })}
                </div>
              </fieldset>
            )}
            {implied.length > 0 && (
              <p role="note" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {implied.map(({ gap: g, by }) => `${by.join(' and ')} ${by.length > 1 ? 'are' : 'is'} built on ${g}`).join('; ')}, so adding{' '}
                  {implied.length > 1 ? 'them' : 'it'} will also count as {implied.map((i) => i.gap).join(' and ')} experience. Only add {implied.flatMap((i) => i.by).length > 1 ? 'them' : 'it'} if that's true.
                </span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {gap.gap.length > 0 && (
                <Button onClick={addPicked} disabled={picked.length === 0}>
                  <Plus aria-hidden="true" /> {picked.length ? `Add ${picked.length} to my resume` : 'Add to my resume'}
                </Button>
              )}
              {added.length > 0 && (
                <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    Added by you: <b>{added.join(', ')}</b>
                  </span>
                  <Button variant="ghost" className="min-h-9 px-2" onClick={undoAdded}>
                    <Undo2 aria-hidden="true" /> Undo
                  </Button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
            <p>We never add them for you. If you've actually used one, tick it under “Already have some of these?” above; otherwise the gap is about skills, not wording.</p>
            <Button variant="outline" className="border-rose-300 bg-white/60 dark:border-rose-800 dark:bg-transparent" onClick={() => navigate('/gap-coach')}>
              <GraduationCap aria-hidden="true" /> How to close these gaps
            </Button>
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
