import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './ui/button';

/** Small "Copy" button with a brief "Copied" confirmation. `label` names what is copied, for screen readers. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is visible and selectable */
    }
  };
  return (
    <Button variant="ghost" className={cn('min-h-9 px-2 text-xs', className)} onClick={() => void copy()} aria-label={`Copy ${label}`}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}
