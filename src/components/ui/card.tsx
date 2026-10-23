import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('surface rounded-xl shadow-sm', className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2 sm:p-5 sm:pb-2', className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold tracking-tight', className)} {...props} />;
}
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-2 sm:p-5 sm:pt-2', className)} {...props} />;
}
