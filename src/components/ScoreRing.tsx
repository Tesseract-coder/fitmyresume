import { cn } from '@/lib/cn';

export function ScoreRing({ score, label, cap, size = 112, className }: { score: number; label: string; cap?: number; size?: number; className?: string }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const tone = score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <figure className={cn('flex flex-col items-center gap-1', className)} aria-label={`${label}: ${score} out of 100`}>
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-slate-200 dark:stroke-slate-700" />
        {cap !== undefined && cap < 100 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="9"
            strokeDasharray={`${(circ * (100 - cap)) / 100} ${circ}`}
            strokeDashoffset={-(circ * cap) / 100}
            transform="rotate(-90 50 50)"
            className="stroke-rose-200 dark:stroke-rose-900/70"
          />
        )}
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ}`}
          transform="rotate(-90 50 50)"
          className={cn('stroke-current transition-[stroke-dasharray] duration-700', tone)}
        />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="fill-[var(--text)] text-[26px] font-bold">
          {score}
        </text>
      </svg>
      <figcaption className="text-xs font-medium text-muted">{label}</figcaption>
    </figure>
  );
}
