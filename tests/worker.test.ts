import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEvidence } from '../shared/evidence';
import { allowedTerms, analyzeGap, gapPayload } from '../shared/gap';
import { app, tailorPrompt } from '../worker/app';
import type { Env, KVLike } from '../worker/env';
import { javaSdetJd, pythonQa } from './fixtures/resumes';

const RESUME_TEXT = 'Priya Sharma\npriya@example.com\nSUMMARY\nQA engineer with 6+ years of Python and Selenium test automation experience.';

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://fitmyresume.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', ...headers },
    body: JSON.stringify(body),
  });
}

function memoryKv(): KVLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return { store, get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
}

async function readSse(res: Response): Promise<string> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'))
    .map((l) => (JSON.parse(l.slice(6)) as { response: string }).response)
    .join('');
}

const evidence = buildEvidence(pythonQa);
const gap = analyzeGap(pythonQa, javaSdetJd, evidence);
const tailorBody = { resume: pythonQa, jd: javaSdetJd, gap: gapPayload(gap), allowedTerms: allowedTerms(evidence, gap) };

afterEach(() => vi.unstubAllGlobals());

describe('worker: health and guards', () => {
  it('reports health without AI calls', async () => {
    const res = await app.fetch(new Request('https://fitmyresume.test/api/health'), { MOCK_AI: '1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ai: true, mock: true, limits: { resumeChars: 20000, jdChars: 15000 } });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects foreign origins and answers CORS preflight for allowed ones', async () => {
    const bad = await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }, { origin: 'https://evil.example' }), { MOCK_AI: '1' });
    expect(bad.status).toBe(403);
    const pre = await app.fetch(new Request('https://fitmyresume.test/api/extract', { method: 'OPTIONS', headers: { origin: 'https://app.example' } }), { ALLOWED_ORIGINS: 'https://app.example' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });

  it('validates input size and shape', async () => {
    const tooLong = await app.fetch(post('/api/analyze-jd', { jdText: 'x'.repeat(15_001) }), { MOCK_AI: '1' });
    expect(tooLong.status).toBe(413);
    expect(((await tooLong.json()) as { error: { code: string } }).error.code).toBe('TOO_LARGE');
    const bad = await app.fetch(post('/api/extract', { nope: 1 }), { MOCK_AI: '1' });
    expect(bad.status).toBe(400);
    const notJson = await app.fetch(new Request('https://fitmyresume.test/api/extract', { method: 'POST', body: '{' }), { MOCK_AI: '1' });
    expect(notJson.status).toBe(400);
    const huge = await app.fetch(new Request('https://fitmyresume.test/api/extract', { method: 'POST', body: 'x'.repeat(130_000) }), { MOCK_AI: '1' });
    expect(huge.status).toBe(413);
  });

  it('requires a valid Turnstile token when a secret is configured', async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: false }));
    vi.stubGlobal('fetch', fetchMock);
    const env: Env = { MOCK_AI: '1', TURNSTILE_SECRET: 's' };
    expect((await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }), env)).status).toBe(403);
    expect((await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }, { 'cf-turnstile-response': 'tok' }), env)).status).toBe(403);
    fetchMock.mockImplementation(async () => Response.json({ success: true }));
    expect((await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }, { 'cf-turnstile-response': 'tok' }), env)).status).toBe(200);
  });

  it('applies the burst rate limit', async () => {
    const env: Env = { MOCK_AI: '1', RATE_LIMITER: { limit: async () => ({ success: false }) } };
    const res = await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }), env);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });

  it('enforces the daily quota per IP hash for Workers AI (not for BYOK), storing no raw IP', async () => {
    const kv = memoryKv();
    const ai = { run: vi.fn(async () => Response.json({}).body) };
    const env: Env = { AI: ai, QUOTA_KV: kv, DAILY_LIMIT: '2' };
    expect((await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }), env)).headers.get('x-fmr-quota-remaining')).toBe('1');
    expect((await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }), env)).status).toBe(200);
    const third = await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }), env);
    expect(third.status).toBe(429);
    expect(((await third.json()) as { error: { code: string } }).error.code).toBe('DAILY_QUOTA');
    expect([...kv.store.keys()].join()).not.toContain('203.0.113.9');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: {}\n\n', { status: 200 })));
    const byok = await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT, byok: { provider: 'openai', apiKey: 'sk-test-123456' } }), env);
    expect(byok.status).toBe(200);
  });

  it('404s unknown API routes', async () => {
    expect((await app.fetch(new Request('https://fitmyresume.test/api/nope'), {})).status).toBe(404);
  });
});

describe('worker: mock AI (dev / E2E)', () => {
  it('streams a structured extraction in Workers AI SSE format', async () => {
    const res = await app.fetch(post('/api/extract', { resumeText: RESUME_TEXT }), { MOCK_AI: '1' });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const json = JSON.parse(await readSse(res));
    expect(json.contact.name).toBe('Priya Sharma');
  });

  it('serves analyze, tailor, JSON mode and adversarial scenarios', async () => {
    const jd = JSON.parse(await readSse(await app.fetch(post('/api/analyze-jd', { jdText: 'Senior SDET\nRequirements: Java, Kubernetes and Selenium test automation for payments.' }), { MOCK_AI: '1' })));
    expect(jd.mustHave.map((t: { canonical: string }) => t.canonical)).toEqual(expect.arrayContaining(['java', 'kubernetes', 'selenium']));

    const tailored = JSON.parse(await readSse(await app.fetch(post('/api/tailor', tailorBody), { MOCK_AI: '1' })));
    expect(tailored.bulletOrder).toHaveLength(2);

    const injected = JSON.parse(await readSse(await app.fetch(post('/api/tailor', tailorBody, { 'x-fmr-mock': 'inject' }), { MOCK_AI: '1' })));
    expect(injected.summary).toContain('Expert in Java');

    const broken = await readSse(await app.fetch(post('/api/tailor', tailorBody, { 'x-fmr-mock': 'broken-json' }), { MOCK_AI: '1' }));
    expect(() => JSON.parse(broken)).toThrow();
    const retry = await app.fetch(post('/api/tailor', { ...tailorBody, mode: 'json', retryReason: 'bad' }, { 'x-fmr-mock': 'broken-json' }), { MOCK_AI: '1' });
    expect(JSON.parse(((await retry.json()) as { text: string }).text).summary).toBeTruthy();

    const quota = await app.fetch(post('/api/tailor', tailorBody, { 'x-fmr-mock': 'quota' }), { MOCK_AI: '1' });
    expect(quota.status).toBe(429);
    expect(((await quota.json()) as { error: { code: string } }).error.code).toBe('AI_QUOTA');
  });
});

describe('worker: providers', () => {
  it('streams Workers AI and maps the neuron quota error', async () => {
    const run = vi.fn(async (_m: string, inputs: Record<string, unknown>) => {
      if (inputs.response_format) return { response: { summary: 'x' } };
      return new Response('data: {"response":"{}"}\n\n').body;
    });
    const env: Env = { AI: { run }, MODEL_TAILOR: '@cf/test/model' };
    const res = await app.fetch(post('/api/tailor', tailorBody), env);
    expect(res.headers.get('x-fmr-provider')).toBe('workers-ai');
    expect(run.mock.calls[0]![0]).toBe('@cf/test/model');
    expect(run.mock.calls[0]![1]).toMatchObject({ stream: true, max_tokens: 2500 });

    const json = await app.fetch(post('/api/tailor', { ...tailorBody, mode: 'json' }), env);
    expect(await json.json()).toEqual({ text: '{"summary":"x"}' });

    run.mockImplementation(async () => {
      throw new Error('AiError: 4006: you have used up your daily free allocation of 10,000 neurons');
    });
    const q = await app.fetch(post('/api/tailor', tailorBody), env);
    expect(q.status).toBe(429);
    expect(((await q.json()) as { error: { code: string } }).error.code).toBe('AI_QUOTA');

    run.mockImplementation(async () => {
      throw new Error("JSON Mode couldn't be met");
    });
    expect((await app.fetch(post('/api/tailor', { ...tailorBody, mode: 'json' }), env)).status).toBe(502);
    run.mockImplementation(async () => {
      throw new Error('boom');
    });
    expect((await app.fetch(post('/api/tailor', tailorBody), env)).status).toBe(502);
    expect((await app.fetch(post('/api/tailor', tailorBody), {})).status).toBe(503);
  });

  it.each([
    ['anthropic', 'https://api.anthropic.com/v1/messages', { content: [{ type: 'text', text: '{"a":1}' }] }],
    ['openai', 'https://api.openai.com/v1/chat/completions', { choices: [{ message: { content: '{"a":1}' } }] }],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }],
  ] as const)('BYOK %s: sends the key per request, never stores it, and normalises JSON-mode output', async (provider, url, reply) => {
    const fetchMock = vi.fn(async (_req: Request) => Response.json(reply));
    vi.stubGlobal('fetch', fetchMock);
    const res = await app.fetch(post('/api/analyze-jd', { jdText: 'Senior SDET with Java and Kubernetes experience required for payments.', mode: 'json', byok: { provider, apiKey: 'key-1234567890' } }), {});
    expect(await res.json()).toEqual({ text: '{"a":1}' });
    const req = fetchMock.mock.calls[0]![0];
    expect(req.url).toBe(url);
    const sentKey = req.headers.get('x-api-key') ?? req.headers.get('authorization') ?? req.headers.get('x-goog-api-key');
    expect(sentKey).toContain('key-1234567890');
    if (provider === 'anthropic') {
      expect(req.headers.get('anthropic-version')).toBe('2026-10-21');
      expect(await req.json()).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', stream: false });
    }
  });

  it('maps BYOK provider failures to safe messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('secret details', { status: 401 })));
    const body = { jdText: 'Senior SDET with Java and Kubernetes experience required for payments.', byok: { provider: 'gemini', apiKey: 'key-1234567890', model: 'gemini-x' } };
    const res = await app.fetch(post('/api/analyze-jd', body), {});
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain('secret details');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    expect((await app.fetch(post('/api/analyze-jd', body), {})).status).toBe(429);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect((await app.fetch(post('/api/analyze-jd', body), {})).status).toBe(502);
  });
});

describe('worker: prompt construction', () => {
  it('omits contact details and education from the tailoring prompt, and wraps data in delimiters', () => {
    const prompt = tailorPrompt({ ...tailorBody, mode: 'stream' });
    expect(prompt).not.toContain(pythonQa.contact.email);
    expect(prompt).not.toContain(pythonQa.contact.phone);
    expect(prompt).not.toContain('University of Pune');
    expect(prompt).toContain('<<<BEGIN_RESUME_JSON>>>');
    expect(prompt).toContain('"r1b1"');
  });
});
