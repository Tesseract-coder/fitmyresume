import { ArrowUpRight, Check, Copy, GraduationCap, Mail, PartyPopper } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { coachGaps, type CoachItem } from '@shared/coach';
import { PageTitle } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useDerived } from '@/lib/derived';
import { useStore } from '@/lib/store';

const IMPORTANCE = {
  must: { label: 'Must-have', tone: 'gap' },
  nice: { label: 'Nice-to-have', tone: 'warn' },
  keyword: { label: 'Mentioned in the job', tone: 'neutral' },
} as const;

function CopyQuote({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text.replace(/^"|"$/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is visible and selectable */
    }
  };
  return (
    <figure className="rounded-lg bg-subtle p-3">
      <figcaption className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-muted">
        {title}
        <Button variant="ghost" className="-my-2 min-h-9 px-2 text-xs" onClick={() => void copy()} aria-label={`Copy: ${title}`}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}
        </Button>
      </figcaption>
      <blockquote className="text-sm">{text}</blockquote>
    </figure>
  );
}

function GapCard({ item, learning, onLearning, defaultOpen }: { item: CoachItem; learning: boolean; onLearning: (on: boolean) => void; defaultOpen: boolean }) {
  const headingId = useId();
  const switchId = useId();
  const meta = IMPORTANCE[item.importance];
  return (
    <li>
      <Card>
        <details open={defaultOpen} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 sm:px-5 [&::-webkit-details-marker]:hidden">
            <h2 id={headingId} className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {item.surface}
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {learning && <Badge tone="matched">Learning</Badge>}
            </h2>
            <span className="text-xs text-muted group-open:hidden">Show plan</span>
          </summary>
          <CardContent className="space-y-4">
            <section aria-label="What transfers">
              <h3 className="mb-1.5 text-sm font-semibold">What you already have</h3>
              {item.transfers.length ? (
                <p className="text-sm">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {item.transfers.map((t) => (
                      <Badge key={t} tone="matched">
                        {t}
                      </Badge>
                    ))}
                  </span>
                  <span className="mt-1.5 block text-muted">
                    {item.closeness === 'close' ? `Closely related: the same kind of work (${item.sharedSkill}).` : `Broadly related: ${item.sharedSkill} fundamentals carry over.`}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted">Nothing in your resume transfers directly — that's fine. Start with the steps below.</p>
              )}
            </section>

            <section aria-label="How to close the gap">
              <h3 className="mb-1.5 text-sm font-semibold">How to close it, honestly</h3>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {item.resource && (
                <a href={item.resource.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-teal-700 underline-offset-4 hover:underline dark:text-teal-300">
                  {item.resource.label} <ArrowUpRight className="size-4" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </section>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle p-3">
              <label htmlFor={switchId} className="text-sm">
                <span className="font-medium">I've started learning {item.surface}</span>
                <span className="block text-xs text-muted">Adds the line below to your cover letter. Your resume never changes.</span>
              </label>
              <Switch id={switchId} checked={learning} onCheckedChange={onLearning} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <CopyQuote title="For your cover letter (never your resume)" text={item.coverLetterLine} />
              <CopyQuote title="If it comes up in an interview" text={item.interviewAnswer} />
            </div>
          </CardContent>
        </details>
      </Card>
    </li>
  );
}

export default function GapCoach() {
  const s = useStore((st) => st.session);
  const update = useStore((st) => st.update);
  const navigate = useNavigate();
  const { evidence, gap, before } = useDerived(s);
  if (!evidence || !gap || !before || !s.jd) return null;

  const learning = s.learningSkills ?? [];
  const items = coachGaps(gap, evidence, learning);
  const gapTerms = new Set(gap.gap.map((g) => g.surface));
  const must = items.filter((i) => i.importance === 'must').length;

  const setLearning = (surface: string, on: boolean) => {
    const next = on ? [...new Set([...learning, surface])] : learning.filter((x) => x !== surface);
    const draft = s.coverLetter;
    update({
      learningSkills: next,
      ...(draft ? { coverLetter: { ...draft, options: { ...draft.options, learning: next.filter((t) => gapTerms.has(t)) } } } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Skills-gap coach"
        subtitle={
          <>
            For {s.jd.title || 'this role'}
            {s.jd.company && <> at {s.jd.company}</>}. These skills aren't in your resume, so they'll never be added to it. Here's how to close them honestly.
          </>
        }
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center sm:py-12">
            <PartyPopper className="size-8 text-teal-600" aria-hidden="true" />
            <p className="font-semibold">No skill gaps for this job.</p>
            <p className="text-sm text-muted">Your resume shows every skill the job description lists.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p role="note" className="flex items-start gap-2 rounded-xl bg-subtle p-3 text-sm">
            <GraduationCap className="mt-0.5 size-5 shrink-0 text-teal-600" aria-hidden="true" />
            <span>
              {items.length} gap{items.length === 1 ? '' : 's'}
              {must > 0 && (
                <>
                  , {must} of them must-have{must === 1 ? '' : 's'}. Your ATS score is capped at <b>{before.cap.max}</b> until they're real experience — better wording can't change that
                </>
              )}
              . Transferable experience and an honest learning plan are what you can show today.
            </span>
          </p>
          <ul className="space-y-3">
            {items.map((item, i) => (
              <GapCard
                key={item.canonical}
                item={item}
                defaultOpen={item.importance === 'must' || i === 0}
                learning={learning.includes(item.surface)}
                onLearning={(on) => setLearning(item.surface, on)}
              />
            ))}
          </ul>
          <p className="text-xs text-muted">
            Already have real experience with one of these? Add it to your skills or a bullet on the{' '}
            <button type="button" className="underline" onClick={() => navigate('/confirm')}>
              Confirm details
            </button>{' '}
            screen, then re-run the analysis.
          </p>
        </>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate(s.outcome ? '/review' : '/analysis')}>
          Back
        </Button>
        <Button variant="outline" onClick={() => navigate('/cover-letter')}>
          <Mail aria-hidden="true" /> Cover letter
        </Button>
      </div>
    </div>
  );
}
