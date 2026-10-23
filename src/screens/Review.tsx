import { ArrowRight, CheckCheck, HelpCircle, Mail, ShieldX, Undo2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Change } from '@shared/changes';
import { roleBullets } from '@shared/resume-text';
import type { ResumeJSON, SkillGroup } from '@shared/schema';
import { BlockedChanges } from '@/components/BlockedChanges';
import { DiffText } from '@/components/DiffText';
import { PageTitle } from '@/components/Layout';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { ScoreRing } from '@/components/ScoreRing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Textarea } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useDerived } from '@/lib/derived';
import { useStore } from '@/lib/store';

const skillsLine = (groups: SkillGroup[]) => groups.map((g) => `${g.group}: ${g.items.join(', ')}`).join(' · ');

function bulletIndex(resume: ResumeJSON) {
  const out = new Map<string, { text: string; role: string }>();
  for (const r of resume.experience) for (const b of roleBullets(r)) out.set(b.id, { text: b.text, role: `${r.title} · ${r.company}` });
  return out;
}

function ChangeCard({ change, on, onToggle, where, bulletText }: { change: Change; on: boolean; onToggle: (v: boolean) => void; where?: string | undefined; bulletText: (id: string) => string }) {
  const id = useId();
  const title = { headline: 'Headline', summary: 'Professional summary', skills: 'Technical skills', bullet: 'Bullet', order: 'Bullet order' }[change.kind];
  return (
    <li className="surface rounded-xl p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p id={id} className="text-sm font-semibold">
            {title}
            {!change.safe && (
              <Badge tone="warn" className="ml-2">
                Removes content
              </Badge>
            )}
          </p>
          {where && <p className="text-xs text-muted">{where}</p>}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
          {on ? 'Accepted' : 'Rejected'}
          <Switch checked={on} onCheckedChange={onToggle} aria-labelledby={id} />
        </label>
      </div>
      {change.kind === 'skills' ? (
        <DiffText before={skillsLine(change.before)} after={skillsLine(change.after)} />
      ) : change.kind === 'order' ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {change.after.map((b) => (
            <li key={b}>{bulletText(b)}</li>
          ))}
          {change.removed.map((b) => (
            <li key={b} className="text-muted line-through">
              <span className="sr-only">Removed: </span>
              {bulletText(b)}
            </li>
          ))}
        </ol>
      ) : (
        <DiffText before={change.before} after={change.after} />
      )}
      {change.kind === 'bullet' && change.reason && <p className="mt-2 text-xs text-muted">Why: {change.reason}</p>}
    </li>
  );
}

function MetricQuestion({ question, current, answered, onSave }: { question: string; current: string; answered: boolean; onSave: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current);
  const id = useId();
  if (!open) {
    return (
      <li>
        <button
          type="button"
          onClick={() => {
            setText(current);
            setOpen(true);
          }}
          className="flex min-h-11 w-full items-start gap-2 rounded-xl border border-subtle p-3 text-left text-sm hover:bg-subtle"
        >
          <HelpCircle className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden="true" />
          <span className="flex-1">{question}</span>
          {answered && <Badge tone="matched">Answered</Badge>}
        </button>
      </li>
    );
  }
  return (
    <li className="space-y-2 rounded-xl border border-teal-600 p-3">
      <p className="text-sm font-medium">{question}</p>
      <Label htmlFor={id}>Edit the bullet with your real number. Only numbers you type here are added.</Label>
      <Textarea id={id} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          disabled={!text.trim() || text.trim() === current}
          onClick={() => {
            onSave(text.trim());
            setOpen(false);
          }}
        >
          Save
        </Button>
      </div>
    </li>
  );
}

export default function Review() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const toggle = useStore((st) => st.toggle);
  const acceptSafe = useStore((st) => st.acceptSafe);
  const setUserEdit = useStore((st) => st.setUserEdit);
  const navigate = useNavigate();
  const [blockedOpen, setBlockedOpen] = useState(false);
  const { gap, before, after, final, accepted } = useDerived(s);
  const outcome = s.outcome!;
  if (!gap || !before || !after || !final) return null;

  const original = bulletIndex(s.baseline!);
  const current = bulletIndex(final);
  const blocked = outcome.violations.filter((v) => v.action !== 'warned');
  const safeCount = outcome.changes.filter((c) => c.safe).length;

  return (
    <div className="space-y-4">
      <PageTitle title="Review the changes" subtitle="Accept or reject each change. Your score updates live." />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-center gap-4 pt-5 sm:gap-8 sm:pt-5">
          <ScoreRing score={before.total} label="Before" size={110} />
          <ArrowRight className="size-6 text-muted" aria-hidden="true" />
          <ScoreRing score={after.total} cap={after.cap.max} label="After" size={140} />
          {after.cap.max < 100 && (
            <p className="w-full text-center text-xs text-muted sm:w-auto sm:max-w-48 sm:text-left">
              Capped at {after.cap.max}: {after.cap.gaps.join(', ')} {after.cap.gaps.length === 1 ? 'is a true gap' : 'are true gaps'}.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="accent" onClick={acceptSafe} disabled={safeCount === 0}>
          <CheckCheck aria-hidden="true" /> Accept all safe changes ({safeCount})
        </Button>
        <Button variant="outline" onClick={() => update({ accepted: [] })} disabled={accepted.size === 0}>
          <Undo2 aria-hidden="true" /> Reject all
        </Button>
        <Button variant="outline" onClick={() => setBlockedOpen(true)}>
          <ShieldX aria-hidden="true" /> Blocked changes ({blocked.length})
        </Button>
      </div>

      {outcome.notes.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-subtle p-3 text-xs text-muted">
          {outcome.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {outcome.metricQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Make it stronger with real numbers</CardTitle>
            <CardDescription>We never invent metrics. If you know the real figure, add it here.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {outcome.metricQuestions.map((q) => (
                <MetricQuestion
                  key={q.bulletId}
                  question={q.question}
                  current={current.get(q.bulletId)?.text ?? ''}
                  answered={q.bulletId in s.userEdits}
                  onSave={(text) => setUserEdit(q.bulletId, text, [text])}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="changes-title" className="space-y-2">
        <h2 id="changes-title" className="text-base font-semibold">
          Suggested changes ({outcome.changes.length})
        </h2>
        {outcome.changes.length === 0 ? (
          <p className="text-sm text-muted">No changes were suggested. Your resume already uses the job's wording where it truthfully can.</p>
        ) : (
          <ul className="space-y-2">
            {outcome.changes.map((c) => (
              <ChangeCard
                key={c.id}
                change={c}
                on={accepted.has(c.id)}
                onToggle={(v) => toggle(c.id, v)}
                where={c.kind === 'bullet' ? original.get(c.bulletId)?.role : c.kind === 'order' ? s.baseline!.experience.find((r) => r.id === c.roleId)?.company : undefined}
                bulletText={(id) => original.get(id)?.text ?? id}
              />
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Skills gap report</CardTitle>
          <CardDescription>The job asks for these, and your resume doesn't show them, so they were not added.</CardDescription>
        </CardHeader>
        <CardContent>
          {gap.gap.length === 0 ? (
            <p className="text-sm text-muted">No gaps — your resume covers every skill the job lists.</p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {gap.gap.map((i) => (
                  <li key={i.canonical}>
                    <Badge tone="gap">
                      {i.surface}
                      {i.importance === 'must' && <span className="font-bold"> · must-have</span>}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                If you do have one of these, add it to your skills or a bullet on the{' '}
                <button type="button" className="underline" onClick={() => navigate('/confirm')}>
                  Confirm details
                </button>{' '}
                screen — only if it's true. Otherwise, mention that you're learning it in your cover letter, not your resume.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Score breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <ScoreBreakdown before={before} after={after} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate('/analysis')}>
          Back
        </Button>
        <Button variant="outline" onClick={() => navigate('/cover-letter')}>
          <Mail aria-hidden="true" /> Write a cover letter
        </Button>
        <Button size="lg" onClick={() => navigate('/export')}>
          Continue to export <ArrowRight aria-hidden="true" />
        </Button>
      </div>

      <BlockedChanges open={blockedOpen} onOpenChange={setBlockedOpen} violations={outcome.violations} autoFixes={outcome.autoFixes} />
    </div>
  );
}
