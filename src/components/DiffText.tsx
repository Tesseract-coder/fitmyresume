import { diffWords } from 'diff';

/** Word-level diff: removed words struck through, added words highlighted. */
export function DiffText({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  return (
    <p className="text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-950 no-underline dark:bg-emerald-900/60 dark:text-emerald-50">
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="rounded bg-rose-100 px-0.5 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}
