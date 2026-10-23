import { useSyncExternalStore } from 'react';

/** Small per-device UI preferences (localStorage; safe when storage is unavailable). */
type Prefs = { theme: 'system' | 'light' | 'dark'; engine: 'ai' | 'offline' };
const KEY = 'fmr.prefs';
const listeners = new Set<() => void>();
let current: Prefs = read();

function read(): Prefs {
  try {
    return { theme: 'system', engine: 'ai', ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return { theme: 'system', engine: 'ai' };
  }
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function applyTheme() {
  const dark = current.theme === 'dark' || (current.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1220' : '#1f3a5f');
}
