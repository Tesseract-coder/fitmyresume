import { AlertTriangle, ArrowLeft, Check, PartyPopper, SkipForward, Undo2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { answered, newTechIn, phrase, quantifiedShare, setBulletText, strengthenQuestions, type BulletQuestion, type MetricAnswer, type MetricOption } from '@shared/questions';
import { allBullets } from '@shared/resume-text';
import { DiffText } from '@/components/DiffText';
import { PageTitle } from '@/components/Layout';
import { ScoreRing } from '@/components/ScoreRing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { useDerived } from '@/lib/derived';
import { useStore } from '@/lib/store';

const PERIODS = ['week', 'month', 'quarter', 'year', 'release', 'sprint'] as const;

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="min-h-11 w-full rounded-lg border border-subtle bg-[var(--surface)] px-3 text-sm">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Text({ label, value, onChange, placeholder, numeric }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} inputMode={numeric ? 'decimal' : undefined} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** The answer fields for one kind of metric. Numbers are always typed by the user. */
function Fields({ option, a, set }: { option: MetricOption; a: MetricAnswer; set: (patch: MetricAnswer) => void }) {
  const period = <Select label="Per" value={a.period ?? 'month'} options={PERIODS.map((p) => ({ value: p, label: p }))} onChange={(period) => set({ period })} />;
  switch (option.kind) {
    case 'count':
    case 'scale':
      return (
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <Text label="How many?" numeric value={a.n ?? ''} placeholder="e.g. 120" onChange={(n) => set({ n })} />
          <Text label="Of what?" value={a.noun ?? ''} placeholder="e.g. test cases" onChange={(noun) => set({ noun })} />
        </div>
      );
    case 'percent':
      return (
        <div className="grid gap-2 sm:grid-cols-[8rem_10rem_1fr]">
          <Text label="By how much (%)?" numeric value={a.n ?? ''} placeholder="e.g. 40" onChange={(n) => set({ n })} />
          <Select
            label="Direction"
            value={a.direction ?? 'down'}
            options={[
              { value: 'down', label: 'reduced' },
              { value: 'up', label: 'improved' },
            ]}
            onChange={(direction) => set({ direction })}
          />
          <Text label="What changed?" value={a.noun ?? ''} placeholder="e.g. regression time" onChange={(noun) => set({ noun })} />
        </div>
      );
    case 'time':
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <Text label="What was measured?" value={a.noun ?? ''} placeholder="e.g. execution time" onChange={(noun) => set({ noun })} />
          <Text label="Before" value={a.from ?? ''} placeholder="e.g. 4 hours" onChange={(from) => set({ from })} />
          <Text label="After" value={a.to ?? ''} placeholder="e.g. 45 minutes" onChange={(to) => set({ to })} />
        </div>
      );
    case 'saved':
      return (
        <div className="grid grid-cols-3 gap-2">
          <Text label="How much?" numeric value={a.n ?? ''} placeholder="e.g. 6" onChange={(n) => set({ n })} />
          <Select
            label="Unit"
            value={a.unit ?? 'hours'}
            options={[
              { value: 'hours', label: 'hours' },
              { value: 'days', label: 'days' },
            ]}
            onChange={(unit) => set({ unit })}
          />
          {period}
        </div>
      );
    case 'team':
      return (
        <div className="max-w-[10rem]">
          <Text label="Team size" numeric value={a.n ?? ''} placeholder="e.g. 8" onChange={(n) => set({ n })} />
        </div>
      );
    case 'frequency':
      return (
        <div className="grid grid-cols-[6rem_1fr_8rem] gap-2">
          <Text label="How many?" numeric value={a.n ?? ''} placeholder="e.g. 4" onChange={(n) => set({ n })} />
          <Text label="Of what?" value={a.noun ?? ''} placeholder="releases" onChange={(noun) => set({ noun })} />
          {period}
        </div>
      );
  }
}

function QuestionCard({ q, current, onSave, onSkip }: { q: BulletQuestion; current: string; onSave: (text: string) => void; onSkip: () => void }) {
  const s = useStore((st) => st.session);
  const [optionIndex, setOptionIndex] = useState(0);
  const [answers, setAnswers] = useState<MetricAnswer[]>(() => q.options.map((o) => ({ ...o.defaults })));
  const [custom, setCustom] = useState<string>();
  const option = q.options[optionIndex]!;
  const a = answers[optionIndex]!;
  const ready = answered(option.kind, a);
  const suggested = ready ? phrase(current, option.kind, a) : '';
  const text = custom ?? suggested;
  const canSave = /\d/.test(text) && text.trim() !== current.trim();
  const newTech = canSave && s.baseline ? newTechIn(s.baseline, q.bulletId, text) : [];
  const previewId = useId();

  return (
    <Card>
      <CardHeader>
        <CardDescription>{q.role}</CardDescription>
        <CardTitle className="text-base font-medium leading-relaxed">“{current}”</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">What can you measure?</legend>
          <div className="grid gap-2">
            {q.options.map((o, i) => (
              <label key={o.kind + i} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-subtle px-3 py-2 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-600/5">
                <input
                  type="radio"
                  name={`metric-${q.bulletId}`}
                  checked={optionIndex === i}
                  onChange={() => {
                    setOptionIndex(i);
                    setCustom(undefined);
                  }}
                  className="size-4 accent-teal-600"
                />
                {o.prompt}
              </label>
            ))}
          </div>
        </fieldset>

        <Fields
          option={option}
          a={a}
          set={(patch) => {
            setAnswers((all) => all.map((x, i) => (i === optionIndex ? { ...x, ...patch } : x)));
            setCustom(undefined);
          }}
        />

        <div>
          <Label htmlFor={previewId}>New bullet (edit the wording if you like)</Label>
          <Textarea id={previewId} rows={3} value={text} placeholder="Type a number above to see your updated bullet." onChange={(e) => setCustom(e.target.value)} />
          {text && !canSave && <p className="mt-1 text-xs text-muted">Include the number you measured to save.</p>}
          {newTech.length > 0 && (
            <p className="mt-1 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Mentions {newTech.join(', ')}, which isn't elsewhere in your resume. Keep it only if it's true.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onSkip}>
            <SkipForward aria-hidden="true" /> Skip — I don't know
          </Button>
          <Button onClick={() => onSave(text)} disabled={!canSave}>
            <Check aria-hidden="true" /> Save & next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Strengthen() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const navigate = useNavigate();
  const { gap, before } = useDerived(s);
  // Fixed when the screen opens: answering a question changes the bullet, which mustn't reshuffle the list.
  const [questions] = useState<BulletQuestion[]>(() => (s.baseline && s.jd && gap ? strengthenQuestions(s.baseline, s.jd, gap) : []));
  const [index, setIndex] = useState(0);
  if (!s.baseline || !gap || !before) return null;
  const baseline = s.baseline;
  const originals = s.strengthened ?? {};
  const textOf = (id: string) => allBullets(baseline).find((b) => b.id === id)?.text ?? '';
  const share = quantifiedShare(baseline);
  const target = Math.ceil(share.total / 2);
  const done = index >= questions.length;

  const save = (bulletId: string, text: string) => {
    const next = setBulletText(baseline, bulletId, text);
    // The tailored version was built from the old bullets, so it must be redone; the letter and profile stay true.
    update({ baseline: next, extracted: next, strengthened: { ...originals, [bulletId]: originals[bulletId] ?? textOf(bulletId) }, outcome: undefined, accepted: [], userEdits: {} });
    setIndex((i) => i + 1);
  };
  const undo = (ids: string[]) => {
    let next = baseline;
    for (const id of ids) if (originals[id] !== undefined) next = setBulletText(next, id, originals[id]);
    const rest = Object.fromEntries(Object.entries(originals).filter(([id]) => !ids.includes(id)));
    update({ baseline: next, extracted: next, strengthened: rest, outcome: undefined, accepted: [], userEdits: {} });
  };
  const changed = Object.keys(originals).filter((id) => originals[id] !== textOf(id));

  return (
    <div className="space-y-4">
      <PageTitle title="Add real numbers" subtitle="Recruiters and ATS look for numbers. Answer what you know and skip the rest — we never guess a number." />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-5 pt-5 sm:pt-5">
          <ScoreRing score={before.total} cap={before.cap.max} label="ATS score now" size={96} />
          <div className="min-w-48 flex-1 space-y-1.5">
            <p className="text-sm">
              <b>{share.n}</b> of {share.total} bullets have a number <span className="text-muted">(aim for at least {target})</span>
            </p>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label="Bullets with a number" aria-valuemin={0} aria-valuemax={share.total} aria-valuenow={share.n}>
              <div className={cn('h-2 rounded-full transition-[width]', share.n >= target ? 'bg-emerald-600' : 'bg-teal-600')} style={{ width: `${share.total ? (100 * share.n) / share.total : 0}%` }} />
            </div>
            {!done && questions.length > 0 && (
              <p className="text-xs text-muted">
                Question {index + 1} of {questions.length}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center sm:py-10">
            <PartyPopper className="size-8 text-teal-600" aria-hidden="true" />
            <p className="font-semibold">Every bullet already has a number.</p>
          </CardContent>
        </Card>
      ) : (
        !done && (
          <QuestionCard key={questions[index]!.bulletId} q={questions[index]!} current={textOf(questions[index]!.bulletId)} onSave={(t) => save(questions[index]!.bulletId, t)} onSkip={() => setIndex((i) => i + 1)} />
        )
      )}

      {/* Always reachable, so a change can be undone without stepping through every question again. */}
      {(changed.length > 0 || (done && questions.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {!done ? 'Your changes so far' : changed.length ? `You added numbers to ${changed.length} bullet${changed.length === 1 ? '' : 's'}` : 'No changes'}
            </CardTitle>
            {changed.length > 0 && <CardDescription>They're part of your resume now and count as evidence for tailoring, the cover letter and LinkedIn.</CardDescription>}
          </CardHeader>
          {changed.length > 0 && (
            <CardContent className="space-y-3">
              {changed.map((id) => (
                <div key={id} className="flex items-start justify-between gap-2 rounded-lg border border-subtle p-3">
                  <DiffText before={originals[id]!} after={textOf(id)} />
                  <Button variant="ghost" className="min-h-9 shrink-0 px-2" onClick={() => undo([id])} aria-label={`Undo: ${textOf(id)}`}>
                    <Undo2 aria-hidden="true" /> Undo
                  </Button>
                </div>
              ))}
              {changed.length > 1 && (
                <Button variant="outline" onClick={() => undo(changed)}>
                  <Undo2 aria-hidden="true" /> Undo all
                </Button>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {changed.length > 0 && !s.outcome && (
        <p role="note" className="rounded-xl bg-subtle p-3 text-sm text-muted">
          Your resume changed, so tailor it (again) on the Analysis screen to use the new numbers.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        {index > 0 && !done && (
          <Button variant="ghost" onClick={() => setIndex((i) => i - 1)}>
            <ArrowLeft aria-hidden="true" /> Previous
          </Button>
        )}
        <Button variant={done ? 'default' : 'outline'} onClick={() => navigate('/analysis')}>
          {done ? 'Continue to tailoring' : 'Finish later'}
        </Button>
      </div>
    </div>
  );
}
