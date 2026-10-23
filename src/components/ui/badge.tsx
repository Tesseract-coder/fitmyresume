import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium [&_svg]:size-3.5', {
  variants: {
    tone: {
      neutral: 'bg-subtle text-[var(--text)]',
      matched: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
      synonym: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100',
      hidden: 'bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100',
      gap: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100',
      warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
