import { Loader2 } from 'lucide-react';

export function Progress({ stage, chars }: { stage: string; chars?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-subtle bg-subtle p-4 text-sm">
      <Loader2 className="size-5 shrink-0 animate-spin text-teal-600" aria-hidden="true" />
      <div>
        <div className="font-medium">{stage}</div>
        {chars !== undefined && chars > 0 && <div className="text-xs text-muted">Receiving… {chars.toLocaleString()} characters</div>}
      </div>
    </div>
  );
}
