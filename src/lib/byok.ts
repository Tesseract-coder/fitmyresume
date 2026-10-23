import type { Byok } from '@shared/schema';

/**
 * Bring-your-own-key settings. Kept in this browser only (localStorage) and sent per request;
 * the Worker forwards it to the provider and never stores it.
 */
const KEY = 'fmr.byok';

export type ByokSettings = NonNullable<Byok> & { remember: boolean };

let memory: ByokSettings | undefined;

export function loadByok(): ByokSettings | undefined {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as ByokSettings;
  } catch {
    /* storage unavailable */
  }
  return memory;
}

export function saveByok(s: ByokSettings | undefined) {
  memory = s;
  try {
    if (s?.remember) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

export function byokPayload(): Byok {
  const s = loadByok();
  if (!s?.apiKey) return undefined;
  return { provider: s.provider, apiKey: s.apiKey, ...(s.model ? { model: s.model } : {}) };
}
