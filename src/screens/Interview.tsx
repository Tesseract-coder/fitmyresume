import { Eye, FileText, MessageSquareQuote, ShieldX, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { interviewText, runInterviewPipeline, type InterviewItem, type InterviewPoint } from '@shared/interview';
import { allBullets } from '@shared/resume-text';
import type { InterviewCategory } from '@shared/schema';
import { EngineToggle, useAiStep } from '@/components/AiStep';
import { BlockedChanges } from '@/components/BlockedChanges';
import { CopyButton } from '@/components/CopyButton';
import { PageTitle } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label, Textarea } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useDerived } from '@/lib/derived';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/theme';
import { engine } from '@/lib/engine';
import { useStore } from '@/lib/store';

const CATEGORY: Record<InterviewCategory, { label: string; tone: 'neutral' | 'matched' | 'synonym' | 'hidden' | 'gap' | 'warn' }> = {
  intro: { label: 'Opener', tone: 'neutral' },
  behavioral: { label: 'Behavioural', tone: 'synonym' },
  technical: { label: 'Technical', tone: 'hidden' },
  gap: { label: 'Gap', tone: 'gap' },
  motivation: { label: 'Motivation', tone: 'warn' },
  closing: { label: 'Your questions', tone: 'matched' },
};

const KIND: Record<InterviewPoint['kind'], { tag: string; help: string; className: string }> = {
  fact: { tag: 'From your resume', help: 'checked against your resume', className: '' },
  prompt: { tag: 'Your turn', help: 'answer from memory — we never invent your story', className: 'italic text-muted' },
  coach: { tag: 'Honest answer', help: 'from the skills-gap coach', className: 'border-l-2 border-teal-600 pl-2' },
  yours: { tag: 'Your words', help: 'what you wrote', className: '' },
};

function Point({ point, label }: { point: InterviewPoint; label?: string }) {
  const k = KIND[point.kind];
  return (
    <div className="text-sm">
      <span className="mr-2 inline-flex items-center gap-1 text-xs font-semibold">
        {label && <span>{label}</span>}
        <span className="rounded bg-subtle px-1.5 py-0.5 font-medium text-muted">{k.tag}</span>
      </span>
      <span className={k.className}>{point.text}</span>
    </div>
  );
}

function QuestionCard({ item, n, practice, notes, onNotes, bulletText }: { item: InterviewItem; n: number; practice: boolean; notes: string; onNotes: (v: string) => void; bulletText: (id: string) => string | undefined }) {
  const [revealed, setRevealed] = useState(false);
  const notesId = useId();
  const show = !practice || revealed;
  const meta = CATEGORY[item.category];
  return (
    <li>
      <Card>
        <CardContent className="space-y-3 pt-4 sm:pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-muted">{n}.</span>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <h2 className="text-base font-semibold">{item.question}</h2>
          <p className="text-xs text-muted">{item.why}</p>

          {!show ? (
            <Button variant="outline" onClick={() => setRevealed(true)}>
              <Eye aria-hidden="true" /> Show my outline
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg bg-subtle p-3">
              {item.star && (
                <>
                  <Point label="Situation" point={item.star.situation} />
                  <Point label="Task" point={item.star.task} />
                  <Point label="Action" point={item.star.action} />
                  <Point label="Result" point={item.star.result} />
                </>
              )}
              {item.points.map((p, i) => (
                <Point key={i} point={p} />
              ))}
              {item.bulletIds.length > 0 && (
                <p className="pt-1 text-xs text-muted">Based on: {item.bulletIds.map((id) => `“${bulletText(id)}”`).join(' ')}</p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor={notesId}>My notes</Label>
            <Textarea id={notesId} rows={2} value={notes} placeholder="Jot down your story so you remember it on the day." onChange={(e) => onNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export default function Interview() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const navigate = useNavigate();
  const step = useAiStep();
  const { evidence, gap, final } = useDerived(s);
  const [practice, setPractice] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const practiceId = useId();
  if (!evidence || !gap || !final || !s.jd || !s.baseline) return null;
  const jd = s.jd;
  const baseline = s.baseline;
  const draft = s.interview;
  const bullets = new Map(allBullets(final).map((b) => [b.id, b.text]));

  const generate = () => {
    const hasNotes = Object.values(draft?.userNotes ?? {}).some((n) => n.trim());
    if (hasNotes && !window.confirm('Preparing new questions clears your notes. Continue?')) return;
    void step.run('Preparing likely interview questions…', async (mode, opts) => {
      const response = await engine.interview(final, jd, gap, evidence, mode, opts);
      update({
        interview: runInterviewPipeline({
          baseline,
          resume: final,
          userFacts: s.userFacts,
          jd,
          gap,
          jdText: s.jdText,
          response,
          engine: mode,
          learningSkills: s.learningSkills ?? [],
          motivation: s.coverLetter?.options.motivation ?? '',
        }),
      });
    });
  };

  const text = draft ? interviewText(draft, jd) : '';
  const blocked = draft?.violations.filter((v) => v.action !== 'warned').length ?? 0;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Interview prep"
        subtitle={
          <>
            The questions you’re most likely to get for {jd.title || 'this role'}
            {jd.company && <> at {jd.company}</>}, with outlines built only from your resume. Your stories stay yours: we ask, you fill in.
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4 sm:pt-5">
          <EngineToggle />
          <Button variant="accent" onClick={generate} disabled={step.busy}>
            <Sparkles aria-hidden="true" /> {draft ? 'Prepare again' : 'Prepare my interview'}
          </Button>
          {draft && (
            <>
              <label htmlFor={practiceId} className="flex min-h-11 items-center gap-2 text-sm">
                <Switch id={practiceId} checked={practice} onCheckedChange={setPractice} />
                Practice mode
              </label>
              <Button variant="outline" onClick={() => setBlockedOpen(true)}>
                <ShieldX aria-hidden="true" /> Blocked ({blocked})
              </Button>
              <Button variant="outline" onClick={() => downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), exportFileName(final.contact.name, jd.company, 'txt', 'Interview_Prep'))}>
                <FileText aria-hidden="true" /> Download TXT
              </Button>
              <CopyButton text={text} label="all questions and outlines" className="min-h-11 px-3 text-sm" />
            </>
          )}
          <div className="w-full empty:hidden">{step.ui}</div>
        </CardContent>
      </Card>

      {!draft ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted sm:py-12">
            <MessageSquareQuote className="size-8 text-teal-600" aria-hidden="true" />
            Press <b>Prepare my interview</b> for about 10 likely questions: an opener, stories from your best bullets, the job’s must-have skills, your gaps, and questions to ask them.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
            {Object.values(KIND).map((k) => (
              <span key={k.tag}>
                <span className="rounded bg-subtle px-1.5 py-0.5 font-medium">{k.tag}</span> {k.help}
              </span>
            ))}
          </p>
          {draft.notes.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-subtle p-3 text-xs text-muted">
              {draft.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <ol className="space-y-3">
            {draft.items.map((item, i) => (
              <QuestionCard
                key={item.id}
                item={item}
                n={i + 1}
                practice={practice}
                notes={draft.userNotes[item.id] ?? ''}
                onNotes={(v) => update({ interview: { ...draft, userNotes: { ...draft.userNotes, [item.id]: v } } })}
                bulletText={(id) => bullets.get(id)}
              />
            ))}
          </ol>
        </>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate('/gap-coach')}>
          Skills-gap coach
        </Button>
        <Button variant="outline" onClick={() => navigate('/export')}>
          Export resume
        </Button>
      </div>

      <BlockedChanges
        open={blockedOpen}
        onOpenChange={setBlockedOpen}
        violations={draft?.violations ?? []}
        description="Answer material the AI wrote that your resume doesn't support was replaced with resume facts or a prompt for you."
      />
    </div>
  );
}
