import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, side }: { title: string; description?: string; children: ReactNode; className?: string; side?: 'right' }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/50" />
      <D.Content
        className={cn(
          'surface fixed z-50 flex max-h-[100dvh] flex-col overflow-hidden shadow-xl focus:outline-none',
          side === 'right'
            ? 'inset-y-0 right-0 w-full max-w-md rounded-none'
            : 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-subtle p-4">
          <div>
            <D.Title className="text-base font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-m-2 inline-flex size-11 items-center justify-center rounded-lg hover:bg-subtle" aria-label="Close">
            <X className="size-5" />
          </D.Close>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
