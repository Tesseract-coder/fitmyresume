import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const base = 'w-full rounded-lg border border-subtle bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, 'min-h-11', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-24 py-2 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 flex items-center gap-1 text-xs font-medium text-muted', className)} {...props} />;
}
