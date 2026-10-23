import type { AutoFix, Violation } from '@shared/validator';
import { Badge } from './ui/badge';
import { Dialog, DialogContent } from './ui/dialog';

const VIOLATION_LABELS: Record<Violation['kind'], string> = {
  'locked-field': 'Locked field changed',
  'role-structure': 'Role structure changed',
  'unknown-bullet': 'Invented bullet',
  'locked-bullet': 'Locked bullet changed',
  'unsupported-term': 'Skill not in your resume',
  'gap-term': 'Missing skill added',
  'new-number': 'Invented number',
  'years-claim': 'Years of experience changed',
  seniority: 'Seniority inflated',
  'ownership-inflation': 'Ownership inflated',
  'jd-copy': 'Copied from the job post',
  stuffing: 'Keyword stuffing',
};

/** Side drawer listing what the validator blocked or flagged (§2.4: shown for transparency). */
export function BlockedChanges({
  open,
  onOpenChange,
  violations,
  autoFixes = [],
  description = 'The AI suggested these, but they broke the truthfulness rules, so we undid them automatically.',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  violations: readonly Violation[];
  autoFixes?: readonly AutoFix[];
  description?: string;
}) {
  const blocked = violations.filter((v) => v.action !== 'warned');
  const warned = violations.filter((v) => v.action === 'warned');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" title="Blocked changes" description={description}>
        {violations.length === 0 ? (
          <p className="text-sm text-muted">Nothing was blocked. Every suggestion passed the truthfulness checks.</p>
        ) : (
          <div className="space-y-4">
            {(
              [
                ['Blocked', blocked],
                ['Kept, but worth a look', warned],
              ] as const
            ).map(([label, list]) =>
              list.length ? (
                <section key={label}>
                  <h3 className="mb-2 text-sm font-semibold">{label}</h3>
                  <ul className="space-y-2">
                    {list.map((v, i) => (
                      <li key={i} className="rounded-lg border border-subtle p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={v.action === 'warned' ? 'warn' : 'gap'}>{VIOLATION_LABELS[v.kind]}</Badge>
                          {v.term && <code className="text-xs">{v.term}</code>}
                        </div>
                        <p className="mt-1.5">{v.detail}</p>
                        {v.attempted && <p className="mt-1 text-xs text-muted line-through">{v.attempted}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
          </div>
        )}
        {autoFixes.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Automatic fixes</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {autoFixes.map((f, i) => (
                <li key={i}>{f.detail}</li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
