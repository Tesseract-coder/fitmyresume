import { AlertTriangle, Lock, Plus, Trash2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { Bullet, ResumeJSON } from '@shared/schema';
import { deepEqual } from '@shared/validator';
import { EngineToggle, useAiStep } from '@/components/AiStep';
import { PageTitle } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/field';
import { engine } from '@/lib/engine';
import { useStore } from '@/lib/store';

function Flag({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return (
    <p className="mt-1 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

function Field({ label, value, onChange, locked, flag, multiline }: { label: string; value: string; onChange: (v: string) => void; locked?: boolean; flag?: string | undefined; multiline?: boolean }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>
        {locked && <Lock className="size-3" aria-label="Locked: kept exactly as confirmed" />}
        {label}
      </Label>
      {multiline ? (
        <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!flag || undefined} />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!flag || undefined} />
      )}
      <Flag text={flag} />
    </div>
  );
}

function Section({ title, description, locked, children }: { title: string; description?: string; locked?: boolean; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {locked && <Lock className="size-4 text-muted" aria-hidden="true" />}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function BulletList({ bullets, onChange, flags, label }: { bullets: Bullet[]; onChange: (b: Bullet[]) => void; flags: Record<string, string>; label: string }) {
  return (
    <ul className="space-y-2">
      {bullets.map((b, i) => (
        <li key={b.id}>
          <div className="flex items-start gap-2">
            <Textarea
              rows={2}
              aria-label={`${label}, bullet ${i + 1}`}
              value={b.text}
              onChange={(e) => onChange(bullets.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)))}
              aria-invalid={!!flags[`bullet:${b.id}`] || undefined}
            />
            <Button variant="ghost" size="icon" aria-label={`Delete ${label}, bullet ${i + 1}`} onClick={() => onChange(bullets.filter((x) => x.id !== b.id))}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          <Flag text={flags[`bullet:${b.id}`]} />
        </li>
      ))}
    </ul>
  );
}

/** Next unused bullet id in a role ("r1b7"), across its own and its projects' bullets. */
function nextBulletId(role: ResumeJSON['experience'][number]): string {
  const used = new Set([...role.bullets, ...(role.projects ?? []).flatMap((p) => p.bullets)].map((b) => b.id));
  let n = used.size + 1;
  while (used.has(`${role.id}b${n}`)) n++;
  return `${role.id}b${n}`;
}

export default function Confirm() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const navigate = useNavigate();
  const step = useAiStep();
  const [draft, setDraft] = useState<ResumeJSON>(() => structuredClone((s.baseline ?? s.extracted)!));
  const flags = s.baseline ? {} : s.flags;
  const edit = (fn: (d: ResumeJSON) => void) =>
    setDraft((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
  const flagsUnder = (prefix: string) =>
    Object.entries(flags)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v)
      .join(' ') || undefined;

  const clean = (r: ResumeJSON): ResumeJSON => ({
    ...r,
    skills: r.skills.map((g) => ({ ...g, items: g.items.map((i) => i.trim()).filter(Boolean) })).filter((g) => g.items.length),
    experience: r.experience.map((role) => ({
      ...role,
      bullets: role.bullets.filter((b) => b.text.trim()),
      ...(role.projects ? { projects: role.projects.map((p) => ({ ...p, bullets: p.bullets.filter((b) => b.text.trim()) })) } : {}),
    })),
  });

  const canContinue = draft.contact.name.trim() && draft.experience.length > 0;

  const confirm = () => {
    const baseline = clean(draft);
    const changed = !deepEqual(baseline, s.baseline);
    update({ baseline, extracted: baseline, ...(changed ? { outcome: undefined, accepted: [], userEdits: {}, userFacts: [], coverLetter: undefined, linkedin: undefined } : {}) });
    if (s.jd) {
      navigate('/analysis');
      return;
    }
    void step.run('Analyzing the job description…', async (mode, opts) => {
      const jd = await engine.analyzeJd(s.jdText, mode, opts);
      update({ jd, engine: mode });
      navigate('/analysis');
    });
  };

  const c = draft.contact;
  return (
    <div className="space-y-4">
      <PageTitle
        title="Confirm your details"
        subtitle={
          <>
            Fix anything we read wrong. Fields marked <Lock className="inline size-3" aria-label="locked" /> are locked: tailoring will keep them exactly as you confirm them here, and
            only what's on this page counts as evidence of your skills.
          </>
        }
      />
      {Object.keys(flags).length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {Object.keys(flags).length} item(s) need a second look — they're highlighted below.
        </p>
      )}

      <Section title="Contact" locked>
        <Flag text={flags['contact']} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" locked value={c.name} flag={flags['contact.name']} onChange={(v) => edit((d) => void (d.contact.name = v))} />
          <Field label="Email" locked value={c.email} flag={flags['contact.email']} onChange={(v) => edit((d) => void (d.contact.email = v))} />
          <Field label="Phone" locked value={c.phone} onChange={(v) => edit((d) => void (d.contact.phone = v))} />
          <Field label="Location" locked value={c.location} onChange={(v) => edit((d) => void (d.contact.location = v))} />
        </div>
        {c.links.map((l, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="w-32 shrink-0">
              <Field label="Link label" locked value={l.label} onChange={(v) => edit((d) => void (d.contact.links[i]!.label = v))} />
            </div>
            <div className="flex-1">
              <Field label="URL" locked value={l.url} onChange={(v) => edit((d) => void (d.contact.links[i]!.url = v))} />
            </div>
            <Button variant="ghost" size="icon" aria-label={`Remove link ${l.label || i + 1}`} onClick={() => edit((d) => void d.contact.links.splice(i, 1))}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => edit((d) => void d.contact.links.push({ label: 'LinkedIn', url: '' }))}>
          <Plus aria-hidden="true" /> Add link
        </Button>
      </Section>

      <Section title="Summary" description="Tailoring may rewrite these using only facts from your resume.">
        <Field label="Headline (optional)" value={draft.headline ?? ''} flag={flags['headline']} onChange={(v) => edit((d) => (v ? (d.headline = v) : delete d.headline))} />
        <Field label="Total experience" locked value={draft.yearsOfExperience} onChange={(v) => edit((d) => void (d.yearsOfExperience = v))} />
        <Field label="Professional summary" multiline value={draft.summary} flag={flags['summary']} onChange={(v) => edit((d) => void (d.summary = v))} />
      </Section>

      <Section title="Skills" description="Comma-separated. Only skills listed here or shown in your experience can appear in the tailored resume.">
        {draft.skills.map((g, gi) => (
          <div key={gi} className="flex items-start gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-[10rem_1fr]">
              <Field label="Group" value={g.group} onChange={(v) => edit((d) => void (d.skills[gi]!.group = v))} />
              <Field
                label="Skills"
                multiline
                value={g.items.join(', ')}
                flag={flagsUnder(`skills.${gi}.`)}
                onChange={(v) => edit((d) => void (d.skills[gi]!.items = v.split(',').map((x) => x.trimStart())))}
              />
            </div>
            <Button variant="ghost" size="icon" className="mt-5" aria-label={`Remove skill group ${g.group}`} onClick={() => edit((d) => void d.skills.splice(gi, 1))}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => edit((d) => void d.skills.push({ group: 'Skills', items: [] }))}>
          <Plus aria-hidden="true" /> Add skill group
        </Button>
      </Section>

      <Section title="Experience" description="Company, title, location and dates are locked. Bullets can be reworded during tailoring.">
        <Flag text={flags['experience']} />
        {draft.experience.map((r, ri) => (
          <details key={r.id} open={ri < 2 || !!flagsUnder(`experience.${r.id}`)} className="rounded-lg border border-subtle p-3">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium">
              {r.title || 'Untitled role'} · {r.company || 'Unknown company'}
            </summary>
            <div className="mt-2 space-y-3">
              <Flag text={flags[`experience.${r.id}`]} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" locked value={r.title} flag={flags[`experience.${r.id}.title`]} onChange={(v) => edit((d) => void (d.experience[ri]!.title = v))} />
                <Field label="Company" locked value={r.company} flag={flags[`experience.${r.id}.company`]} onChange={(v) => edit((d) => void (d.experience[ri]!.company = v))} />
                <Field label="Location" locked value={r.location} onChange={(v) => edit((d) => void (d.experience[ri]!.location = v))} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Start" locked value={r.startDate} flag={flags[`experience.${r.id}.startDate`]} onChange={(v) => edit((d) => void (d.experience[ri]!.startDate = v))} />
                  <Field label="End" locked value={r.endDate} onChange={(v) => edit((d) => void (d.experience[ri]!.endDate = v))} />
                </div>
              </div>
              <BulletList label={`${r.title} at ${r.company}`} bullets={r.bullets} flags={flags} onChange={(b) => edit((d) => void (d.experience[ri]!.bullets = b))} />
              <Button variant="outline" onClick={() => edit((d) => void d.experience[ri]!.bullets.push({ id: nextBulletId(d.experience[ri]!), text: '' }))}>
                <Plus aria-hidden="true" /> Add bullet
              </Button>
              {r.projects?.map((p, pi) => (
                <div key={pi} className="space-y-2 border-l-2 border-subtle pl-3">
                  <p className="text-sm font-medium">{[p.name && `Project: ${p.name}`, p.client && `Client: ${p.client}`].filter(Boolean).join(' · ') || 'Project'}</p>
                  <BulletList
                    label={`${p.name ?? 'project'} at ${r.company}`}
                    bullets={p.bullets}
                    flags={flags}
                    onChange={(b) => edit((d) => void (d.experience[ri]!.projects![pi]!.bullets = b))}
                  />
                </div>
              ))}
            </div>
          </details>
        ))}
      </Section>

      {draft.education.length > 0 && (
        <Section title="Education" locked>
          {draft.education.map((e, i) => (
            <div key={i} className="grid gap-3 border-b border-subtle pb-3 last:border-0 sm:grid-cols-2">
              {flags[`education.${i}`] && (
                <div className="sm:col-span-2">
                  <Flag text={flags[`education.${i}`]} />
                </div>
              )}
              <Field label="Degree" locked value={e.degree} flag={flags[`education.${i}.degree`]} onChange={(v) => edit((d) => void (d.education[i]!.degree = v))} />
              <Field label="Institution" locked value={e.institution} onChange={(v) => edit((d) => void (d.education[i]!.institution = v))} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start" locked value={e.startDate ?? ''} onChange={(v) => edit((d) => (v ? (d.education[i]!.startDate = v) : delete d.education[i]!.startDate))} />
                <Field label="End" locked value={e.endDate ?? ''} onChange={(v) => edit((d) => (v ? (d.education[i]!.endDate = v) : delete d.education[i]!.endDate))} />
              </div>
              <Field label="GPA (optional)" locked value={e.gpa ?? ''} onChange={(v) => edit((d) => (v ? (d.education[i]!.gpa = v) : delete d.education[i]!.gpa))} />
            </div>
          ))}
        </Section>
      )}

      {draft.certifications.length > 0 && (
        <Section title="Certifications" locked>
          {draft.certifications.map((x, i) => (
            <div key={i}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Name" locked value={x.name} onChange={(v) => edit((d) => void (d.certifications[i]!.name = v))} />
                <Field label="Issuer" locked value={x.issuer ?? ''} onChange={(v) => edit((d) => (v ? (d.certifications[i]!.issuer = v) : delete d.certifications[i]!.issuer))} />
                <Field label="Date" locked value={x.date ?? ''} onChange={(v) => edit((d) => (v ? (d.certifications[i]!.date = v) : delete d.certifications[i]!.date))} />
              </div>
              <Flag text={flags[`certifications.${i}`]} />
            </div>
          ))}
        </Section>
      )}

      {draft.awards.length > 0 && (
        <Section title="Awards" locked>
          {draft.awards.map((a, i) => (
            <div key={i}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Award" locked value={a.name} onChange={(v) => edit((d) => void (d.awards[i]!.name = v))} />
                <Field label="Year" locked value={a.year ?? ''} onChange={(v) => edit((d) => (v ? (d.awards[i]!.year = v) : delete d.awards[i]!.year))} />
                <Field label="Detail" locked value={a.detail ?? ''} onChange={(v) => edit((d) => (v ? (d.awards[i]!.detail = v) : delete d.awards[i]!.detail))} />
              </div>
              <Flag text={flags[`awards.${i}`]} />
            </div>
          ))}
        </Section>
      )}

      {draft.extras?.map((x, i) => (
        <Section key={i} title={x.heading || 'Other'} description="One item per line.">
          <Field label="Items" multiline value={x.items.join('\n')} onChange={(v) => edit((d) => void (d.extras![i]!.items = v.split('\n').filter((l) => l.trim())))} />
        </Section>
      ))}

      {step.ui}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate('/')}>
          Back
        </Button>
        {!s.jd && <EngineToggle />}
        <Button size="lg" onClick={confirm} disabled={!canContinue || step.busy}>
          Looks right — analyze the job
        </Button>
      </div>
    </div>
  );
}
