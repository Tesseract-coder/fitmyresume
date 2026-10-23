import { AlertTriangle, CloudOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallOptions } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import type { Engine } from '@/lib/engine';
import { mockScenario } from '@/lib/mock-scenario';
import { setPrefs, usePrefs } from '@/lib/prefs';
import { Progress } from './Progress';
import { QuotaDialog } from './QuotaDialog';
import { SettingsDialog } from './SettingsDialog';
import { Button } from './ui/button';

type Task = (mode: Engine, opts: CallOptions) => Promise<void>;

interface StepState {
  busy: boolean;
  stage: string;
  chars: number;
  error?: string;
  quota?: string;
}

/**
 * Runs one pipeline step with the user's engine (AI or offline), streaming progress, and the
 * quota / error states: on a quota error the user can switch to offline mode or add their own key.
 */
export function useAiStep() {
  const prefs = usePrefs();
  const [state, setState] = useState<StepState>({ busy: false, stage: '', chars: 0 });
  const [settings, setSettings] = useState(false);
  const last = useRef<{ stage: string; task: Task }>(undefined);
  const abort = useRef<AbortController>(undefined);

  useEffect(() => () => abort.current?.abort(), []);

  const exec = useCallback(async (stage: string, task: Task, mode: Engine) => {
    last.current = { stage, task };
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ busy: true, stage, chars: 0 });
    try {
      await task(mode, {
        signal: ctrl.signal,
        onProgress: (chars) => setState((s) => ({ ...s, chars })),
        ...(mockScenario ? { mockScenario } : {}),
      });
      setState({ busy: false, stage: '', chars: 0 });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (err instanceof ApiError && err.isQuota) setState({ busy: false, stage: '', chars: 0, quota: err.message });
      else setState({ busy: false, stage: '', chars: 0, error: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    }
  }, []);

  const run = useCallback((stage: string, task: Task) => exec(stage, task, prefs.engine), [exec, prefs.engine]);

  const goOffline = useCallback(() => {
    setPrefs({ engine: 'offline' });
    setState((s) => ({ ...s, quota: undefined, error: undefined }));
    if (last.current) void exec(last.current.stage, last.current.task, 'offline');
  }, [exec]);

  const ui = (
    <>
      {state.busy && <Progress stage={state.stage} chars={state.chars} />}
      {state.error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          <p className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{state.error}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => last.current && void exec(last.current.stage, last.current.task, prefs.engine)}>
              Try again
            </Button>
            {prefs.engine === 'ai' && (
              <Button variant="outline" onClick={goOffline}>
                <CloudOff aria-hidden="true" /> Use offline mode
              </Button>
            )}
          </div>
        </div>
      )}
      <QuotaDialog
        open={!!state.quota}
        message={state.quota ?? ''}
        onOpenChange={(o) => !o && setState((s) => ({ ...s, quota: undefined }))}
        onOffline={goOffline}
        onByok={() => {
          setState((s) => ({ ...s, quota: undefined }));
          setSettings(true);
        }}
      />
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </>
  );

  return { run, busy: state.busy, ui, engine: prefs.engine };
}

/** Small toggle shown next to primary actions: which engine the next step will use. */
export function EngineToggle() {
  const prefs = usePrefs();
  return (
    <div className="flex items-center gap-1 rounded-lg bg-subtle p-1 text-xs" role="radiogroup" aria-label="Engine">
      {(
        [
          ['ai', 'AI'],
          ['offline', 'Offline (no AI)'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={prefs.engine === id}
          onClick={() => setPrefs({ engine: id })}
          className={`min-h-9 rounded-md px-3 font-medium ${prefs.engine === id ? 'surface shadow-sm' : 'text-muted'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
