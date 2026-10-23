import { KeyRound, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import type { ProviderId } from '@shared/schema';
import { loadByok, saveByok } from '@/lib/byok';
import { setPrefs, usePrefs } from '@/lib/prefs';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Input, Label } from './ui/field';
import { Switch } from './ui/switch';

type Byo = Exclude<ProviderId, 'workers-ai'>;
const PROVIDERS: { id: Byo | 'none'; label: string; placeholder: string; defaultModel?: string }[] = [
  { id: 'none', label: 'Free (Cloudflare Workers AI)', placeholder: '' },
  { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-…', defaultModel: 'claude-opus-5-5' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-…', defaultModel: 'gpt-5.5' },
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza…', defaultModel: 'gemini-3.5-flash' },
];

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const initial = loadByok();
  const prefs = usePrefs();
  const [provider, setProvider] = useState<Byo | 'none'>(initial?.provider ?? 'none');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [remember, setRemember] = useState(initial?.remember ?? false);
  const meta = PROVIDERS.find((p) => p.id === provider)!;

  const save = () => {
    saveByok(provider === 'none' || !apiKey.trim() ? undefined : { provider, apiKey: apiKey.trim(), ...(model.trim() ? { model: model.trim() } : {}), remember });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Settings" description="AI engine, your own API key, and appearance.">
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">AI engine</legend>
            <div className="grid gap-2">
              {PROVIDERS.map((p) => (
                <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-subtle px-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-600/5">
                  <input type="radio" name="provider" value={p.id} checked={provider === p.id} onChange={() => setProvider(p.id)} className="size-4 accent-teal-600" />
                  <span className="text-sm">{p.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {provider !== 'none' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="byok-key">
                  <KeyRound className="size-3.5" aria-hidden="true" /> API key
                </Label>
                <Input id="byok-key" type="password" autoComplete="off" spellCheck={false} placeholder={meta.placeholder} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="byok-model">Model (optional)</Label>
                <Input id="byok-model" placeholder={meta.defaultModel} value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="byok-remember" className="text-sm">
                  Remember key on this device
                </label>
                <Switch id="byok-remember" checked={remember} onCheckedChange={setRemember} />
              </div>
              <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  Your key is sent with each request through our server to {meta.label} and is never stored on the server. If you choose “remember”, it is kept in this browser's
                  local storage, where other scripts or people using this device could read it. Use a key with a spending limit.
                </span>
              </p>
            </div>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Appearance</legend>
            <div className="flex gap-2">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <Button key={t} variant={prefs.theme === t ? 'default' : 'outline'} onClick={() => setPrefs({ theme: t })} aria-pressed={prefs.theme === t} className="flex-1 capitalize">
                  {t}
                </Button>
              ))}
            </div>
          </fieldset>

          <Button className="w-full" onClick={save}>
            Save settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
