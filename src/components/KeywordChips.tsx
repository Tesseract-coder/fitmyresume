import { Check, EyeOff, Repeat, X } from 'lucide-react';
import type { GapAnalysis, GapItem } from '@shared/schema';
import { Badge } from './ui/badge';

const META = {
  matched: { label: 'Matched', tone: 'matched', icon: Check, help: 'In your resume with the same wording.' },
  synonym: { label: 'Synonym', tone: 'synonym', icon: Repeat, help: "In your resume with different wording — we'll use the job's wording." },
  hidden: { label: 'Hidden evidence', tone: 'hidden', icon: EyeOff, help: "In your experience but not in Skills — we'll promote it." },
  gap: { label: 'Gap', tone: 'gap', icon: X, help: "Not in your resume — never added. See the Skills Gap report." },
} as const;

export function KeywordChips({ gap, onRemove }: { gap: GapAnalysis; onRemove?: (item: GapItem) => void }) {
  return (
    <div className="space-y-4">
      {(['matched', 'synonym', 'hidden', 'gap'] as const).map((status) => {
        const items = gap[status];
        const m = META[status];
        const Icon = m.icon;
        return (
          <section key={status} aria-labelledby={`chips-${status}`}>
            <h3 id={`chips-${status}`} className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <Badge tone={m.tone}>
                <Icon aria-hidden="true" />
                {m.label}
              </Badge>
              <span className="text-xs font-normal text-muted">
                {items.length} · {m.help}
              </span>
            </h3>
            {items.length === 0 ? (
              <p className="text-xs text-muted">None</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {items.map((i) => (
                  <li key={i.canonical}>
                    <Badge tone={m.tone} className={i.importance === 'must' ? 'ring-1 ring-current/40' : ''}>
                      {i.surface}
                      {i.resumeSurface && i.resumeSurface !== i.surface && <span className="opacity-75">← {i.resumeSurface}</span>}
                      {i.importance === 'must' && <span className="sr-only">(must-have)</span>}
                      {i.importance === 'must' && <span aria-hidden="true" className="font-bold">*</span>}
                      {onRemove && (
                        <button type="button" onClick={() => onRemove(i)} className="-my-1 -mr-1 ml-0.5 inline-flex size-6 items-center justify-center rounded-full hover:bg-black/10" aria-label={`Remove ${i.surface} from the job terms`}>
                          <X aria-hidden="true" />
                        </button>
                      )}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <p className="text-xs text-muted">* must-have requirement</p>
    </div>
  );
}
