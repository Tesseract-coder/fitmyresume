import { Check, Copy, FileDown, FileText, FileType, Mail, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { renderPlainText } from '@shared/resume-text';
import { PageTitle } from '@/components/Layout';
import { ResumePreview } from '@/components/ResumePreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useDerived } from '@/lib/derived';
import { downloadBlob } from '@/lib/export/download';
import { THEMES, TEMPLATES, exportFileName, type TemplateId, type ThemeId } from '@/lib/export/theme';
import { saveVersion } from '@/lib/history';
import { useStore } from '@/lib/store';

type Format = 'pdf' | 'docx' | 'txt';

export default function Export() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const navigate = useNavigate();
  const { final } = useDerived(s);
  const [busy, setBusy] = useState<Format>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!final) return null;

  const prefs = s.exportPrefs;
  const setPrefs = (patch: Partial<typeof prefs>) => update({ exportPrefs: { ...prefs, ...patch } });
  const fileName = (ext: Format) => exportFileName(final.contact.name, s.jd?.company, ext);

  const save = async () => {
    try {
      await saveVersion(useStore.getState().session);
      setSaved(true);
    } catch {
      /* history is a convenience; never block a download on it */
    }
  };

  const download = async (format: Format) => {
    setBusy(format);
    setError(undefined);
    try {
      const blob =
        format === 'pdf'
          ? await (await import('@/lib/export/pdf')).exportPdf(final, prefs)
          : format === 'docx'
            ? await (await import('@/lib/export/docx')).exportDocx(final, prefs)
            : new Blob([renderPlainText(final)], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, fileName(format));
      void save();
    } catch (err) {
      setError(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed. Please try again.');
    } finally {
      setBusy(undefined);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(renderPlainText(final));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copying is blocked in this browser. Use the TXT download instead.');
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Export your resume"
        subtitle={s.outcome ? 'Includes only the changes you accepted.' : 'No tailoring applied yet — this is your confirmed resume.'}
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Template</CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset className="grid gap-2">
                <legend className="sr-only">Template</legend>
                {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
                  <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-subtle px-3 py-2 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-600/5">
                    <input type="radio" name="template" checked={prefs.template === id} onChange={() => setPrefs({ template: id })} className="size-4 accent-teal-600" />
                    <span className="text-sm">
                      <span className="font-medium">{TEMPLATES[id].label}</span>
                      <span className="block text-xs text-muted">{TEMPLATES[id].description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Colour</CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Colour theme</legend>
                {(Object.keys(THEMES) as ThemeId[]).map((id) => (
                  <label key={id} title={THEMES[id].label} className="relative cursor-pointer">
                    <input type="radio" name="theme" checked={prefs.theme === id} onChange={() => setPrefs({ theme: id })} className="peer sr-only" aria-label={THEMES[id].label} />
                    <span
                      className={cn('flex size-11 items-center justify-center rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-[var(--surface)] peer-checked:ring-teal-600 peer-focus-visible:ring-[var(--ring)]')}
                      style={{ background: `linear-gradient(135deg, ${THEMES[id].heading} 50%, ${THEMES[id].accent} 50%)` }}
                    >
                      {prefs.theme === id && <Check className="size-4 text-white" aria-hidden="true" />}
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="mt-2 text-xs text-muted">{THEMES[prefs.theme].label}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Download</CardTitle>
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
              <Button variant="link" className="justify-start" onClick={() => void save()}>
                {saved ? 'Saved to history on this device' : 'Save to history'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 overflow-x-auto rounded-xl bg-slate-200/60 p-2 sm:p-4 dark:bg-slate-800/60">
          <ResumePreview resume={final} prefs={prefs} />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate(s.outcome ? '/review' : '/confirm')}>
          Back
        </Button>
        {s.jd && (
          <>
            <Button variant="outline" onClick={() => navigate('/cover-letter')}>
              <Mail aria-hidden="true" /> Cover letter
            </Button>
            <Button variant="outline" onClick={() => navigate('/linkedin')}>
              <UserRound aria-hidden="true" /> LinkedIn profile
            </Button>
          </>
        )}
        <Button variant="outline" onClick={() => navigate('/history')}>
          View history
        </Button>
      </div>
    </div>
  );
}
