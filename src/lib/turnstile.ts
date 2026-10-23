/** Invisible Cloudflare Turnstile: one fresh, single-use token per API call (§10). */

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
let widgetId: string | undefined;
let loading: Promise<TurnstileApi> | undefined;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | undefined;

export const turnstileEnabled = !!SITE_KEY;

function load(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile failed to load')));
    s.onerror = () => reject(new Error('Turnstile failed to load. Check your connection.'));
    document.head.appendChild(s);
  });
  return loading;
}

export async function getTurnstileToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  const ts = await load();
  if (!widgetId) {
    const el = document.createElement('div');
    el.id = 'turnstile-widget';
    el.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:60';
    document.body.appendChild(el);
    widgetId = ts.render(el, {
      sitekey: SITE_KEY,
      execution: 'execute',
      appearance: 'interaction-only',
      callback: (token: string) => pending?.resolve(token),
      'error-callback': () => pending?.reject(new Error('Human verification failed. Please try again.')),
    });
  } else ts.reset(widgetId);
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    ts.execute(widgetId!);
  });
}
