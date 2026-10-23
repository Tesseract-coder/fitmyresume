import type { ScoreResult } from '@shared/score';

export function ScoreBreakdown({ before, after }: { before: ScoreResult; after?: ScoreResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">ATS score breakdown</caption>
        <thead className="text-xs text-muted">
          <tr className="border-b border-subtle">
            <th scope="col" className="py-2 pr-2 font-medium">Criterion</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">{after ? 'Before' : 'Points'}</th>
            {after && <th scope="col" className="px-2 py-2 text-right font-medium">After</th>}
          </tr>
        </thead>
        <tbody>
          {before.items.map((item) => {
            const a = after?.items.find((x) => x.key === item.key);
            const shown = a ?? item;
            return (
              <tr key={item.key} className="border-b border-subtle align-top last:border-0">
                <th scope="row" className="py-2 pr-2 font-normal">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-muted">{shown.detail}</div>
                  {shown.points < shown.max && <div className="mt-0.5 text-xs text-teal-700 dark:text-teal-300">↗ {shown.howToImprove}</div>}
                </th>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {item.points}/{item.max}
                </td>
                {a && (
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${a.points > item.points ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                    {a.points}/{a.max}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
