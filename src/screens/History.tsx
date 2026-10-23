import { Copy, FolderOpen, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageTitle } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { deleteVersion, duplicateVersion, listVersions, saveVersion, type HistoryEntry } from '@/lib/history';
import { useStore, type Session } from '@/lib/store';

/** The furthest step a saved session can resume at. */
function resumePath(s: Session): string {
  if (s.baseline && s.jd && s.outcome) return '/review';
  if (s.baseline && s.jd) return '/analysis';
  if (s.extracted || s.baseline) return '/confirm';
  return '/';
}

export default function HistoryScreen() {
  const current = useStore((st) => st.session);
  const load = useStore((st) => st.load);
  const newSession = useStore((st) => st.newSession);
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[]>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setEntries(await listVersions());
    } catch {
      setError('Saved versions are unavailable in this browser (private mode or storage blocked).');
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = (e: HistoryEntry) => {
    load(structuredClone(e.session));
    navigate(resumePath(e.session));
  };

  const remove = async (e: HistoryEntry) => {
    if (!window.confirm(`Delete "${e.label}"? This can't be undone.`)) return;
    await deleteVersion(e.session.id);
    await refresh();
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="History"
        subtitle="Versions saved on this device only. Nothing is uploaded."
        actions={
          <div className="flex flex-wrap gap-2">
            {current.baseline && (
              <Button
                variant="outline"
                onClick={async () => {
                  await saveVersion(useStore.getState().session);
                  await refresh();
                }}
              >
                <Save aria-hidden="true" /> Save current
              </Button>
            )}
            <Button
              onClick={() => {
                newSession();
                navigate('/');
              }}
            >
              <Plus aria-hidden="true" /> New resume
            </Button>
          </div>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      {entries === undefined ? null : entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted sm:py-10">No saved versions yet. Versions are saved when you export or press “Save current”.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.session.id} className="surface flex flex-wrap items-center gap-3 rounded-xl p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {e.label}
                  {e.session.id === current.id && <span className="ml-2 text-xs font-normal text-teal-700 dark:text-teal-300">(open now)</span>}
                </p>
                <p className="text-xs text-muted">
                  {e.session.baseline?.contact.name || e.session.fileName || 'Resume'} · saved {new Date(e.savedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" onClick={() => open(e)}>
                  <FolderOpen aria-hidden="true" /> Open
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Duplicate ${e.label}`}
                  onClick={async () => {
                    await duplicateVersion(e);
                    await refresh();
                  }}
                >
                  <Copy aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${e.label}`} onClick={() => void remove(e)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
