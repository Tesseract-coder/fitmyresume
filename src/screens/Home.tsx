import { FileText, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { LIMITS } from '@shared/limits';
import { EngineToggle, useAiStep } from '@/components/AiStep';
import { PageTitle } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { parseResumeFile } from '@/lib/parse';
import { useStore } from '@/lib/store';

const MIN_CHARS = 50;

function Counter({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={cn('text-xs tabular-nums', over ? 'font-semibold text-rose-700 dark:text-rose-400' : 'text-muted')}>
      {value.length.toLocaleString()} / {max.toLocaleString()}
    </span>
  );
}

export function Home() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const newSession = useStore((st) => st.newSession);
  const navigate = useNavigate();
  const step = useAiStep();
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = { resume: useId(), jd: useId() };

  const [resumeText, setResumeText] = useState(s.resumeText);
  const [fileName, setFileName] = useState(s.fileName);
  const [multiColumn, setMultiColumn] = useState(s.multiColumn);
  const [jdText, setJdText] = useState(s.jdText);
  const [parsing, setParsing] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(undefined);
    setParsing(true);
    try {
      const doc = await parseResumeFile(file);
      setResumeText(doc.text.trim());
      setFileName(file.name);
      setMultiColumn(doc.multiColumn);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const resumeOk = resumeText.trim().length >= MIN_CHARS && resumeText.length <= LIMITS.resumeChars;
  const jdOk = jdText.trim().length >= MIN_CHARS && jdText.length <= LIMITS.jdChars;

  const start = () => {
    const resumeChanged = resumeText !== s.resumeText || !(s.extracted || s.baseline);
    const jdChanged = jdText !== s.jdText;
    const resetTailoring = { outcome: undefined, accepted: [], userEdits: {}, coverLetter: undefined, linkedin: undefined };
    if (!resumeChanged) {
      update({ jdText, ...(jdChanged ? { jd: undefined, ...resetTailoring } : {}) });
      navigate('/confirm');
      return;
    }
    void step.run('Reading your resume… this usually takes 15–30 seconds.', async (mode, opts) => {
      // Loaded on demand: the AI client, schemas and skills ontology aren't needed to show this screen.
      const [{ engine }, { reviewExtraction }] = await Promise.all([import('@/lib/engine'), import('@shared/extraction')]);
      const extracted = await engine.extract(resumeText, mode, opts);
      const review = reviewExtraction(resumeText, extracted);
      const now = Date.now();
      // A different resume is a new version: never overwrite the history entry of the previous one.
      update({
        id: crypto.randomUUID(),
        createdAt: now,
        resumeText,
        fileName,
        multiColumn,
        jdText,
        extracted: review.resume,
        flags: review.flags,
        baseline: undefined,
        jd: undefined,
        userFacts: [],
        addedSkills: [],
        engine: mode,
        ...resetTailoring,
      });
      navigate('/confirm');
    });
  };

  const startOver = () => {
    newSession();
    setResumeText('');
    setFileName(undefined);
    setMultiColumn(false);
    setJdText('');
  };

  const hasWork = !!(s.resumeText || s.jdText);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Tailor your resume to a job — honestly"
        subtitle="Upload your resume and paste the job description. We match the job's wording to what you've actually done, and never add skills, numbers or titles you don't have."
        actions={
          hasWork && (
            <Button variant="ghost" onClick={startOver}>
              <RotateCcw aria-hidden="true" /> Start over
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Your resume</CardTitle>
            <CardDescription>PDF, DOCX or TXT — or paste the text.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-subtle p-5 text-center', dragging && 'border-teal-600 bg-teal-600/5')}
            >
              <Upload className="size-6 text-teal-600" aria-hidden="true" />
              <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={parsing}>
                {parsing ? 'Reading file…' : 'Choose a file'}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="sr-only"
                aria-label="Upload resume file"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <p className="text-xs text-muted">or drag and drop it here</p>
              {fileName && (
                <p className="flex items-center gap-1 text-xs font-medium">
                  <FileText className="size-3.5" aria-hidden="true" /> {fileName}
                  {multiColumn && <span className="text-amber-700 dark:text-amber-400"> · multi-column layout detected</span>}
                </p>
              )}
            </div>
            {fileError && (
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                {fileError}
              </p>
            )}
            <div>
              <div className="flex items-end justify-between">
                <Label htmlFor={ids.resume}>Resume text</Label>
                <Counter value={resumeText} max={LIMITS.resumeChars} />
              </div>
              <Textarea id={ids.resume} rows={10} value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Your resume text appears here after upload, or paste it." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. The job description</CardTitle>
            <CardDescription>Paste the full posting, including requirements.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <Label htmlFor={ids.jd}>Job description</Label>
              <Counter value={jdText} max={LIMITS.jdChars} />
            </div>
            <Textarea id={ids.jd} rows={17} value={jdText} onChange={(e) => setJdText(e.target.value)} placeholder="Paste the job description here." />
          </CardContent>
        </Card>
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-subtle p-3 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden="true" />
        <span>Processed in your browser; nothing is stored on our servers. In AI mode, the text is sent to the AI for this request only and is never logged.</span>
      </p>

      {step.ui}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <EngineToggle />
        <Button size="lg" onClick={start} disabled={!resumeOk || !jdOk || step.busy || parsing}>
          Continue
        </Button>
      </div>
      {(!resumeOk || !jdOk) && (resumeText || jdText) && (
        <p className="text-right text-xs text-muted">
          {!resumeOk && `Resume needs ${MIN_CHARS}–${LIMITS.resumeChars.toLocaleString()} characters. `}
          {!jdOk && `Job description needs ${MIN_CHARS}–${LIMITS.jdChars.toLocaleString()} characters.`}
        </p>
      )}
    </div>
  );
}
