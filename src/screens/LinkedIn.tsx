import { EyeOff, Pencil, ShieldX, Sparkles } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { DEFAULT_LINKEDIN_OPTIONS, composeLinkedIn, runLinkedInPipeline, type LinkedInOptions } from '@shared/linkedin';
import { LINKEDIN_LIMITS } from '@shared/schema';
import { EngineToggle, useAiStep } from '@/components/AiStep';
import { BlockedChanges } from '@/components/BlockedChanges';
import { CopyButton } from '@/components/CopyButton';
import { PageTitle } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { useDerived } from '@/lib/derived';
import { engine } from '@/lib/engine';
import { useStore } from '@/lib/store';

function Count({ n, max }: { n: number; max: number }) {
  return <span className={cn('text-xs tabular-nums', n > max ? 'font-semibold text-rose-700 dark:text-rose-400' : 'text-muted')}>{`${n.toLocaleString()} / ${max.toLocaleString()}`}</span>;
}

function Section({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function LinkedIn() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const navigate = useNavigate();
  const step = useAiStep();
  const headlineId = useId();
  const { evidence, gap, final } = useDerived(s);
  const draft = s.linkedin;
  const [localOptions, setLocalOptions] = useState<LinkedInOptions>(DEFAULT_LINKEDIN_OPTIONS);
  const [editing, setEditing] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  if (!evidence || !gap || !final || !s.jd || !s.baseline) return null;
  const jd = s.jd;
  const baseline = s.baseline;
  const options = draft?.options ?? localOptions;
  const learning = (s.learningSkills ?? []).filter((t) => gap.gap.some((g) => g.surface === t));

  const setOption = (patch: Partial<LinkedInOptions>) => {
    // These lines are written by code, so they apply to the current profile without calling the AI.
    if (draft) update({ linkedin: { ...draft, options: { ...draft.options, ...patch } } });
    else setLocalOptions((o) => ({ ...o, ...patch }));
  };

  const generate = () => {
    if (draft?.edited && !window.confirm('Generating again replaces your edits. Continue?')) return;
    void step.run('Writing your LinkedIn profile…', async (mode, opts) => {
      const response = await engine.linkedin(final, jd, gap, evidence, mode, opts);
      update({ linkedin: runLinkedInPipeline({ baseline, resume: final, userFacts: s.userFacts, jd, gap, jdText: s.jdText, options, response, engine: mode }) });
      setEditing(false);
    });
  };

  const profile = draft ? composeLinkedIn(final, draft, jd, gap, learning) : undefined;
  const blocked = draft?.violations.filter((v) => v.action !== 'warned').length ?? 0;
  const edit = (patch: { headline?: string; about?: string[] }) => draft && update({ linkedin: { ...draft, ...patch, edited: true } });

  const OPTIONS: { key: keyof LinkedInOptions; label: string; help: ReactNode; disabled?: boolean }[] = [
    { key: 'skillsLine', label: 'Add a “Core skills” line', help: 'Your evidenced skills in the job’s wording, so recruiters searching for this kind of role find you.' },
    {
      key: 'learning',
      label: 'Mention what I’m learning',
      disabled: learning.length === 0,
      help: learning.length ? (
        <>Uses the skills-gap coach’s line for {learning.join(', ')}.</>
      ) : (
        <>
          Turn on “I’ve started learning” in the{' '}
          <button type="button" className="underline" onClick={() => navigate('/gap-coach')}>
            skills-gap coach
          </button>{' '}
          first.
        </>
      ),
    },
    { key: 'openTo', label: `Say I’m open to ${jd.title || 'new'} opportunities`, help: 'Signals your target role without naming any company.' },
  ];

  return (
    <div className="space-y-4">
      <PageTitle
        title="LinkedIn profile"
        subtitle={
          <>
            A headline and About section aimed at {jd.title || 'this kind of'} roles, plus skills and experience text that match your tailored resume. Every AI sentence is checked against your resume.
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {OPTIONS.map((o) => (
              <label key={o.key} className={cn('flex min-h-11 items-start gap-3 rounded-lg border border-subtle p-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-600/5', o.disabled ? 'opacity-70' : 'cursor-pointer')}>
                <input type="checkbox" checked={options[o.key] && !o.disabled} disabled={o.disabled} onChange={(e) => setOption({ [o.key]: e.target.checked })} className="mt-0.5 size-4 accent-teal-600" />
                <span className="text-sm">
                  <span className="font-medium">{o.label}</span>
                  <span className="block text-xs text-muted">{o.help}</span>
                </span>
              </label>
            ))}
            <p className="flex items-start gap-2 text-xs text-muted">
              <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Your profile is public, so it never names {jd.company || 'the company you’re applying to'}.
            </p>
            {step.ui}
            <div className="space-y-2">
              <EngineToggle />
              <Button variant="accent" className="w-full" onClick={generate} disabled={step.busy}>
                <Sparkles aria-hidden="true" /> {draft ? 'Write again' : 'Write my LinkedIn profile'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {!profile || !draft ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted sm:py-12">
                Press <b>Write my LinkedIn profile</b>. It uses your tailored resume{s.outcome ? '' : ' (or your confirmed one, if you skipped tailoring)'}.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
                  <Pencil aria-hidden="true" /> {editing ? 'Done editing' : 'Edit text'}
                </Button>
                <Button variant="outline" onClick={() => setBlockedOpen(true)}>
                  <ShieldX aria-hidden="true" /> Blocked sentences ({blocked})
                </Button>
                {draft.edited && <span className="text-xs text-muted">Edited by you — your own words are kept as written.</span>}
              </div>
              {draft.notes.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-subtle p-3 text-xs text-muted">
                  {draft.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}

              <Section title="Headline" actions={<><Count n={profile.headline.length} max={LINKEDIN_LIMITS.headline} /><CopyButton text={profile.headline} label="headline" /></>}>
                {editing ? (
                  <Input id={headlineId} aria-label="Headline" maxLength={LINKEDIN_LIMITS.headline} value={draft.headline} onChange={(e) => edit({ headline: e.target.value })} />
                ) : (
                  <p className="text-base font-medium" data-testid="linkedin-headline">
                    {profile.headline}
                  </p>
                )}
              </Section>

              <Section
                title="About"
                description={profile.truncated ? 'Shortened to fit LinkedIn’s 2,600-character limit.' : undefined}
                actions={<><Count n={profile.about.length} max={LINKEDIN_LIMITS.about} /><CopyButton text={profile.about} label="About section" /></>}
              >
                <div className="space-y-3 text-sm leading-relaxed" data-testid="linkedin-about">
                  {editing
                    ? draft.about.map((p, i) => <Textarea key={i} aria-label={`About paragraph ${i + 1}`} rows={4} value={p} onChange={(e) => edit({ about: draft.about.map((x, j) => (j === i ? e.target.value : x)) })} />)
                    : profile.body.map((p, i) => <p key={i}>{p}</p>)}
                  {profile.extras.map((p) => (
                    <p key={p} className={editing ? 'text-muted' : ''}>
                      {p}
                    </p>
                  ))}
                  {editing && <p className="text-xs text-muted">The last lines come from your options above and aren’t edited here.</p>}
                </div>
              </Section>

              <Section title="Skills" description="Pin the first three as your Top skills; add the rest to your Skills section." actions={<CopyButton text={profile.skills.join(', ')} label="skills" />}>
                <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
                  {profile.skills.map((sk, i) => (
                    <li key={sk}>
                      <Badge tone={i < 3 ? 'matched' : 'neutral'}>
                        {sk}
                        {i < 3 && <span className="sr-only"> (pin as a top skill)</span>}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Experience" description="Paste each into the matching position, so your profile says the same as your resume.">
                <ul className="space-y-4">
                  {profile.experience.map((e) => (
                    <li key={e.roleId} className="rounded-lg border border-subtle p-3">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {e.title} · {e.company}
                          </p>
                          <p className="text-xs text-muted">{e.dates}</p>
                        </div>
                        <CopyButton text={e.description} label={`${e.title} at ${e.company} description`} />
                      </div>
                      <p className="whitespace-pre-line text-sm">{e.description}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate(s.outcome ? '/review' : '/analysis')}>
          Back to review
        </Button>
        <Button variant="outline" onClick={() => navigate('/export')}>
          Export resume
        </Button>
      </div>

      <BlockedChanges
        open={blockedOpen}
        onOpenChange={setBlockedOpen}
        violations={draft?.violations ?? []}
        description="Sentences the AI wrote that couldn't be backed by your resume, or that named the company you're applying to, were removed."
      />
    </div>
  );
}
