import { CloudOff, KeyRound } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';

/** Friendly state when the free daily AI allowance is gone (§3.1). */
export function QuotaDialog({ open, message, onOffline, onByok, onOpenChange }: { open: boolean; message: string; onOffline: () => void; onByok: () => void; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Daily free limit reached" description={message}>
        <div className="space-y-3 text-sm">
          <p className="text-muted">You can keep going right now:</p>
          <Button className="w-full" onClick={onByok}>
            <KeyRound aria-hidden="true" /> Add your own API key
          </Button>
          <Button variant="outline" className="w-full" onClick={onOffline}>
            <CloudOff aria-hidden="true" /> Continue in offline mode (no AI)
          </Button>
          <p className="text-xs text-muted">Offline mode uses deterministic rules in your browser. It reorders and re-words conservatively, and the same truthfulness checks apply. Or come back tomorrow — the free allowance resets daily.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
