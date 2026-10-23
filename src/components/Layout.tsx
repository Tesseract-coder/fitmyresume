import { History, Settings } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/cn';
import { SettingsDialog } from './SettingsDialog';

const STEPS = [
  { path: '/', label: 'Upload' },
  { path: '/confirm', label: 'Confirm' },
  { path: '/analysis', label: 'Analysis' },
  { path: '/review', label: 'Review' },
  { path: '/export', label: 'Export' },
];

export function Layout({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(false);
  const { pathname } = useLocation();
  const current = STEPS.findIndex((s) => s.path === pathname);
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:text-black">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-subtle bg-[var(--surface)]/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
          <Link to="/" className="flex min-h-11 items-center gap-2 font-bold tracking-tight">
            <img src="/icons/favicon.svg" alt="" className="size-7" width={28} height={28} />
            <span>
              FitMy<span className="text-teal-600 dark:text-teal-400">Resume</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="App">
            <NavLink to="/history" className={({ isActive }) => cn('inline-flex size-11 items-center justify-center rounded-lg hover:bg-subtle', isActive && 'bg-subtle')} aria-label="History">
              <History className="size-5" />
            </NavLink>
            <button type="button" onClick={() => setSettings(true)} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-subtle" aria-label="Settings">
              <Settings className="size-5" />
            </button>
          </nav>
        </div>
        {current >= 0 && (
          <ol className="mx-auto flex max-w-5xl gap-1 px-4 pb-2" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s.path} className="flex-1" aria-current={i === current ? 'step' : undefined}>
                <div className={cn('h-1 rounded-full', i <= current ? 'bg-teal-600' : 'bg-slate-200 dark:bg-slate-700')} />
                <span className={cn('mt-1 hidden text-[11px] sm:block', i === current ? 'font-semibold' : 'text-muted')}>{s.label}</span>
              </li>
            ))}
          </ol>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <footer className="border-t border-subtle px-4 py-4 text-center text-xs text-muted">
        FitMyResume never invents skills, numbers or titles. Files are processed in your browser; nothing is stored on our servers.
      </footer>
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
