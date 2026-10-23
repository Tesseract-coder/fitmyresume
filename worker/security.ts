import type { Env } from './env';

/** Salted, daily-rotating IP hash: enough for quotas, useless for tracking across days. */
export async function ipHash(env: Env, ip: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${env.IP_HASH_SALT ?? 'fitmyresume'}|${day}|${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyTurnstile(secret: string, token: string | null): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!res.ok) return false;
  const out = (await res.json()) as { success?: boolean };
  return out.success === true;
}

export function originAllowed(env: Env, origin: string | null, requestUrl: string): boolean {
  if (!origin) return true; // same-origin navigations and non-browser clients (Turnstile still applies)
  const self = new URL(requestUrl).origin;
  if (origin === self) return true;
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

/** Returns false when the daily quota for this IP hash is exhausted; increments otherwise. */
export async function takeDailyQuota(env: Env, hash: string): Promise<{ ok: boolean; remaining: number }> {
  const limit = Number(env.DAILY_LIMIT ?? 15);
  if (!env.QUOTA_KV) return { ok: true, remaining: limit };
  const key = `q:${new Date().toISOString().slice(0, 10)}:${hash}`;
  const used = Number((await env.QUOTA_KV.get(key)) ?? 0);
  if (used >= limit) return { ok: false, remaining: 0 };
  await env.QUOTA_KV.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return { ok: true, remaining: limit - used - 1 };
}

export const API_SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};
