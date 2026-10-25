import { Check, Copy, FileDown, FileText, FileType, Pencil, ShieldX, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { learningLines } from '@shared/coach';
import { DEFAULT_COVER_OPTIONS, composeCoverLetter, coverLetterText, runCoverPipeline, type CoverLetterOptions } from '@shared/cover';
import type { CoverTone } from '@shared/schema';
import { EngineToggle, useAiStep } from '@/components/AiStep';
import { BlockedChanges } from '@/components/BlockedChanges';
import { PageTitle } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/field';
import { useDerived } from '@/lib/derived';
import { downloadBlob } from '@/lib/export/download';
import { THEMES, exportFileName, safePrefs } from '@/lib/export/theme';
import { engine } from '@/lib/engine';
import { useStore } from '@/lib/store';

const TONES: { id: CoverTone; label: string; help: string }[] = [
  { id: 'professional', label: 'Professional', help: 'Formal, about 250–300 words' },
  { id: 'warm', label: 'Warm', help: 'Friendlier, same facts' },
  { id: 'concise', label: 'Concise', help: 'Three short paragraphs' },
];
const MOTIVATION_MAX = 600;

type Format = 'pdf' | 'docx' | 'txt';

export default function CoverLetter() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const navigate = useNavigate();
  const step = useAiStep();
  const ids = { manager: useId(), motivation: useId() };
  const { evidence, gap, final } = useDerived(s);
  const draft = s.coverLetter;
  const [options, setOptions] = useState<CoverLetterOptions>(() => draft?.options ?? { ...DEFAULT_COVER_OPTIONS, learning: s.learningSkills ?? [] });
  const [editing, setEditing] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [busy, setBusy] = useState<Format>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  if (!evidence || !gap || !final || !s.jd || !s.baseline) return null;
  const jd = s.jd;
  const baseline = s.baseline;

  const set = (patch: Partial<CoverLetterOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    // Learning terms and the greeting don't need the AI: apply them to the current letter immediately.
    if ('learning' in patch || 'hiringManager' in patch) {
      update({
        ...('learning' in patch ? { learningSkills: next.learning } : {}),
        ...(draft ? { coverLetter: { ...draft, options: { ...draft.options, learning: next.learning, hiringManager: next.hiringManager } } } : {}),
      });
    }
  };

  const generate = () => {
    if (draft?.edited && !window.confirm('Generating a new letter replaces your edits. Continue?')) return;
    void step.run('Writing your cover letter…', async (mode, opts) => {
      const response = await engine.coverLetter(final, jd, gap, evidence, options, mode, opts);
      const coverLetter = runCoverPipeline({ baseline, resume: final, userFacts: s.userFacts, jd, gap, jdText: s.jdText, options, response, engine: mode });
      update({ coverLetter });
      setEditing(false);
    });
  };

  const letter = draft ? composeCoverLetter(final, draft) : undefined;
  const prefs = safePrefs(s.exportPrefs);
  const theme = THEMES[prefs.theme];
  const fileName = (ext: Format) => exportFileName(final.contact.name, jd.company, ext, 'Cover_Letter');
  const blocked = draft?.violations.filter((v) => v.action !== 'warned').length ?? 0;

  const download = async (format: Format) => {
    if (!letter) return;
    setBusy(format);
    setError(undefined);
    try {
      const blob =
        format === 'pdf'
          ? await (await import('@/lib/export/pdf')).exportCoverPdf(letter, prefs)
          : format === 'docx'
            ? await (await import('@/lib/export/cover-doc')).exportCoverDocx(letter, prefs)
            : new Blob([coverLetterText(letter)], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, fileName(format));
    } catch (err) {
      setError(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed. Please try again.');
    } finally {
      setBusy(undefined);
    }
  };

  const copy = async () => {
    if (!letter) return;
    try {
      await navigator.clipboard.writeText(coverLetterText(letter));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copying is blocked in this browser. Use the TXT download instead.');
    }
  };

  const editParagraph = (i: number, text: string) => {
    if (!draft) return;
    update({ coverLetter: { ...draft, paragraphs: draft.paragraphs.map((p, j) => (j === i ? text : p)), edited: true } });
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Cover letter"
        subtitle={
          <>
            For {jd.title || 'this role'}
            {jd.company && <> at {jd.company}</>}. Written only from your resume — every sentence goes through the same truthfulness checks.
          </>
        }
      />

      {/* DOM order is the mobile order (options, letter, download); on desktop downloads sit under the options. */}
      <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="lg:col-start-1 lg:row-start-1">
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted">Tone</legend>
              <div className="grid gap-2">
                {TONES.map((t) => (
                  <label key={t.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-subtle px-3 py-2 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-600/5">
                    <input type="radio" name="tone" checked={options.tone === t.id} onChange={() => set({ tone: t.id })} className="size-4 accent-teal-600" />
                    <span className="text-sm">
                      <span className="font-medium">{t.label}</span>
                      <span className="block text-xs text-muted">{t.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor={ids.manager}>Hiring manager (optional)</Label>
              <Input id={ids.manager} value={options.hiringManager} placeholder="Hiring Manager" onChange={(e) => set({ hiringManager: e.target.value })} />
            </div>

            <div>
              <div className="flex items-end justify-between">
                <Label htmlFor={ids.motivation}>Why this company? (optional)</Label>
                <span className="text-xs tabular-nums text-muted">
                  {options.motivation.length}/{MOTIVATION_MAX}
                </span>
              </div>
              <Textarea
                id={ids.motivation}
                rows={3}
                maxLength={MOTIVATION_MAX}
                value={options.motivation}
                onChange={(e) => set({ motivation: e.target.value })}
                placeholder="In your own words. We never invent reasons for you."
              />
            </div>

            {gap.gap.length > 0 && (
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-muted">Mention that you're learning (tick only if true)</legend>
                <p className="mb-2 text-xs text-muted">These skills are gaps, so they're never claimed as experience. Ticking one adds a single sentence, e.g. “{learningLines([gap.gap[0]!.surface], evidence)[0]}”{' '}
                    <button type="button" className="underline" onClick={() => navigate('/gap-coach')}>
                      Skills-gap coach
                    </button>
                  </p>
                <div className="flex flex-wrap gap-2">
                  {gap.gap.map((g) => {
                    const on = options.learning.includes(g.surface);
                    return (
                      <label key={g.canonical} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-subtle px-3 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-600/5">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => set({ learning: on ? options.learning.filter((x) => x !== g.surface) : [...options.learning, g.surface] })}
                          className="size-4 accent-teal-600"
                        />
                        {g.surface}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {step.ui}

            <div className="space-y-2">
              <EngineToggle />
              <Button variant="accent" className="w-full" onClick={generate} disabled={step.busy}>
                <Sparkles aria-hidden="true" /> {draft ? 'Write again' : 'Write my cover letter'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {!letter ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted sm:py-12">
                Choose your options and press <b>Write my cover letter</b>. It will use your tailored resume{s.outcome ? '' : ' (or your confirmed one, if you skipped tailoring)'}.
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
                {draft?.edited && <span className="text-xs text-muted">Edited by you — your own words are kept as written.</span>}
              </div>
              {draft && draft.notes.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-subtle p-3 text-xs text-muted">
                  {draft.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <div className="overflow-x-auto rounded-xl bg-slate-200/60 p-2 sm:p-4 dark:bg-slate-800/60">
                <article aria-label="Cover letter preview" className="mx-auto w-full max-w-[816px] bg-white p-6 text-left shadow-lg ring-1 ring-black/5 sm:p-12" style={{ fontFamily: 'Carlito, Calibri, Arial, sans-serif', color: theme.text, fontSize: 14.5, lineHeight: 1.45 }}>
                  <header className="border-b pb-2" style={{ borderColor: theme.accent }}>
                    <div className="text-2xl font-bold" style={{ color: theme.heading }}>
                      {letter.name}
                    </div>
                    {letter.contact.map((l) => (
                      <div key={l} className="break-words text-[13px]">
                        {l}
                      </div>
                    ))}
                  </header>
                  <p className="mt-5">{letter.date}</p>
                  <p className="mt-4">{letter.greeting}</p>
                  {editing && draft
                    ? draft.paragraphs.map((p, i) => (
                        <Textarea key={i} aria-label={`Paragraph ${i + 1}`} rows={4} className="mt-3 text-[14.5px]" value={p} onChange={(e) => editParagraph(i, e.target.value)} />
                      ))
                    : letter.paragraphs.map((p, i) => (
                        <p key={i} className="mt-3">
                          {p}
                        </p>
                      ))}
                  {editing && options.learning.length > 0 && <p className="mt-2 text-xs text-slate-600">The “ramping up” sentence is added automatically and isn't editable here.</p>}
                  <p className="mt-5">{letter.signoff}</p>
                  <p className="mt-6 font-bold" style={{ color: theme.heading }}>
                    {letter.name}
                  </p>
                </article>
              </div>
            </>
          )}
        </div>

        {letter && (
          <Card className="lg:col-start-1 lg:row-start-2">
            <CardHeader>
              <CardTitle>Download</CardTitle>
              <CardDescription>Uses your resume's template and colours.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button onClick={() => void download('pdf')} disabled={!!busy}>
                <FileDown aria-hidden="true" /> {busy === 'pdf' ? 'Preparing PDF…' : 'PDF'}
              </Button>
              <Button variant="outline" onClick={() => void download('docx')} disabled={!!busy}>
                <FileType aria-hidden="true" /> {busy === 'docx' ? 'Preparing DOCX…' : 'Word (DOCX)'}
              </Button>
              <Button variant="outline" onClick={() => void download('txt')} disabled={!!busy}>
                <FileText aria-hidden="true" /> Plain text (TXT)
              </Button>
              <Button variant="ghost" onClick={() => void copy()}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy as text'}
              </Button>
              <p className="break-all text-xs text-muted">{fileName('pdf')}</p>
              {error && (
                <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                  {error}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate(s.outcome ? '/review' : '/analysis')}>
          Back to review
        </Button>
        <Button variant="outline" onClick={() => navigate('/linkedin')}>
          LinkedIn profile
        </Button>
        <Button variant="outline" onClick={() => navigate('/export')}>
          Export resume
        </Button>
      </div>

      <BlockedChanges
        open={blockedOpen}
        onOpenChange={setBlockedOpen}
        violations={draft?.violations ?? []}
        description="Sentences the AI wrote that couldn't be backed by your resume were removed before you saw the letter."
      />
    </div>
  );
}
