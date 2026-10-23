import { createStore, del, entries, set } from 'idb-keyval';
import type { Session } from './store';

/** Saved versions, on this device only (IndexedDB). */
const store = typeof indexedDB === 'undefined' ? undefined : createStore('fmr-history', 'versions');

export interface HistoryEntry {
  session: Session;
  label: string;
  savedAt: number;
}

export function labelFor(s: Session): string {
  const company = s.jd?.company?.trim();
  const role = s.jd?.title?.trim();
  return [role, company].filter(Boolean).join(' @ ') || 'Untitled version';
}

export async function saveVersion(session: Session): Promise<void> {
  if (!store) return;
  await set(session.id, { session, label: labelFor(session), savedAt: Date.now() } satisfies HistoryEntry, store);
}

export async function listVersions(): Promise<HistoryEntry[]> {
  if (!store) return [];
  const all = await entries<string, HistoryEntry>(store);
  return all.map(([, v]) => v).sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteVersion(id: string): Promise<void> {
  if (store) await del(id, store);
}

export async function duplicateVersion(entry: HistoryEntry): Promise<HistoryEntry> {
  const session: Session = { ...structuredClone(entry.session), id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() };
  const copy = { session, label: `${entry.label} (copy)`, savedAt: Date.now() };
  if (store) await set(session.id, copy, store);
  return copy;
}
