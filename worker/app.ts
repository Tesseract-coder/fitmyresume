import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { ANALYZE_SYSTEM, COVER_SYSTEM, EXTRACT_SYSTEM, INTERVIEW_SYSTEM, LINKEDIN_SYSTEM, TAILOR_SYSTEM, retryNote, wrapData } from '../shared/prompts';
import {
  AnalyzeRequestSchema,
  CoverLetterRequestSchema,
  ExtractRequestSchema,
  InterviewRequestSchema,
  LIMITS,
  LinkedInRequestSchema,
  TailorRequestSchema,
  type ApiErrorCode,
  type CoverLetterRequest,
  type TailorRequest,
} from '../shared/schema';
import type { Env } from './env';
import { mockResponse, type MockInput } from './mock';
import { BYOK_DEFAULT_MODELS, ProviderError, callLlm, type LlmCall } from './providers';
import { API_SECURITY_HEADERS, ipHash, originAllowed, takeDailyQuota, verifyTurnstile } from './security';

export const VERSION = '0.1.0';
const MAX_BODY_BYTES = 120_000;

type AppEnv = { Bindings: Env; Variables: { quotaRemaining?: number } };

export const app = new Hono<AppEnv>();

function fail(c: Context, status: number, code: ApiErrorCode, message: string) {
  return c.json({ error: { code, message } }, status as 400);
}

app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin') ?? null;
  if (!originAllowed(c.env, origin, c.req.url)) return fail(c, 403, 'FORBIDDEN_ORIGIN', 'Origin not allowed.');
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin ?? '*',
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': 'content-type, cf-turnstile-response',
        'access-control-max-age': '600',
        vary: 'origin',
      },
    });
  }
  await next();
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) c.res.headers.set(k, v);
  if (origin) {
    c.res.headers.set('access-control-allow-origin', origin);
    c.res.headers.set('vary', 'origin');
  }
});

app.onError((err, c) => {
  if (err instanceof ProviderError) return fail(c, err.status, err.code, err.message);
  // Log the error class only — never request bodies (resumes are personal data).
  console.error('unhandled', err instanceof Error ? err.name : 'unknown');
  return fail(c, 500, 'INTERNAL', 'Something went wrong. Please try again.');
});

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    version: VERSION,
    ai: !!c.env.AI || c.env.MOCK_AI === '1',
    mock: c.env.MOCK_AI === '1',
    turnstile: !!c.env.TURNSTILE_SECRET,
    byok: Object.keys(BYOK_DEFAULT_MODELS),
    byokDefaults: BYOK_DEFAULT_MODELS,
    limits: { ...LIMITS, dailyAiCalls: Number(c.env.DAILY_LIMIT ?? 15) },
  }),
);

/** Shared gate for LLM routes: size → Turnstile → burst limit → daily quota (Workers AI only). */
async function guard<T extends z.ZodType>(c: Context<AppEnv>, schema: T): Promise<z.infer<T> | Response> {
  const len = Number(c.req.header('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) return fail(c, 413, 'TOO_LARGE', 'Request is too large.');
  const raw = await c.req.text();
  if (raw.length > MAX_BODY_BYTES) return fail(c, 413, 'TOO_LARGE', 'Request is too large.');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(c, 400, 'BAD_REQUEST', 'Invalid JSON.');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const tooBig = parsed.error.issues.some((i) => i.code === 'too_big');
    return fail(c, tooBig ? 413 : 400, tooBig ? 'TOO_LARGE' : 'BAD_REQUEST', tooBig ? `Text is too long (resume ≤ ${LIMITS.resumeChars} chars, job description ≤ ${LIMITS.jdChars}).` : 'Invalid request.');
  }

  if (c.env.TURNSTILE_SECRET && !(await verifyTurnstile(c.env.TURNSTILE_SECRET, c.req.header('cf-turnstile-response') ?? null))) {
    return fail(c, 403, 'TURNSTILE', 'Human verification failed. Please refresh and try again.');
  }
  const ip = c.req.header('cf-connecting-ip') ?? '0.0.0.0';
  const hash = await ipHash(c.env, ip);
  if (c.env.RATE_LIMITER && !(await c.env.RATE_LIMITER.limit({ key: hash })).success) {
    return fail(c, 429, 'RATE_LIMITED', 'Too many requests — please wait a minute.');
  }
  const data = parsed.data as { byok?: unknown };
  if (!data.byok && c.env.MOCK_AI !== '1') {
    const q = await takeDailyQuota(c.env, hash);
    if (!q.ok) return fail(c, 429, 'DAILY_QUOTA', 'Daily free limit reached — add your own API key or try tomorrow.');
    c.set('quotaRemaining', q.remaining);
  }
  return parsed.data;
}

async function run(c: Context<AppEnv>, call: LlmCall, mock: MockInput): Promise<Response> {
  const res = c.env.MOCK_AI === '1' && !call.byok ? mockResponse(mock, call.mode, c.req.header('x-fmr-mock') ?? null) : await callLlm(c.env, call);
  const remaining = c.get('quotaRemaining');
  if (remaining !== undefined) res.headers.set('x-fmr-quota-remaining', String(remaining));
  return res;
}

app.post('/api/extract', async (c) => {
  const body = await guard(c, ExtractRequestSchema);
  if (body instanceof Response) return body;
  return run(
    c,
    { task: 'extract', system: EXTRACT_SYSTEM, user: wrapData('RESUME_TEXT', body.resumeText) + retryNote(body.retryReason), mode: body.mode, byok: body.byok },
    { task: 'extract', resumeText: body.resumeText },
  );
});

app.post('/api/analyze-jd', async (c) => {
  const body = await guard(c, AnalyzeRequestSchema);
  if (body instanceof Response) return body;
  return run(
    c,
    { task: 'analyze', system: ANALYZE_SYSTEM, user: wrapData('JOB_DESCRIPTION', body.jdText) + retryNote(body.retryReason), mode: body.mode, byok: body.byok },
    { task: 'analyze', jdText: body.jdText },
  );
});

app.post('/api/tailor', async (c) => {
  const body = await guard(c, TailorRequestSchema);
  if (body instanceof Response) return body;
  return run(c, { task: 'tailor', system: TAILOR_SYSTEM, user: tailorPrompt(body) + retryNote(body.retryReason), mode: body.mode, byok: body.byok }, { task: 'tailor', resume: body.resume, jd: body.jd });
});

app.post('/api/cover-letter', async (c) => {
  const body = await guard(c, CoverLetterRequestSchema);
  if (body instanceof Response) return body;
  return run(
    c,
    { task: 'cover', system: COVER_SYSTEM, user: coverPrompt(body) + retryNote(body.retryReason), mode: body.mode, byok: body.byok },
    { task: 'cover', resume: body.resume, jd: body.jd, tone: body.tone, ...(body.motivation ? { motivation: body.motivation } : {}) },
  );
});

app.post('/api/linkedin', async (c) => {
  const body = await guard(c, LinkedInRequestSchema);
  if (body instanceof Response) return body;
  return run(
    c,
    { task: 'linkedin', system: LINKEDIN_SYSTEM, user: tailorPrompt(body) + retryNote(body.retryReason), mode: body.mode, byok: body.byok },
    { task: 'linkedin', resume: body.resume, jd: body.jd },
  );
});

app.post('/api/interview', async (c) => {
  const body = await guard(c, InterviewRequestSchema);
  if (body instanceof Response) return body;
  return run(
    c,
    { task: 'interview', system: INTERVIEW_SYSTEM, user: tailorPrompt(body) + retryNote(body.retryReason), mode: body.mode, byok: body.byok },
    { task: 'interview', resume: body.resume, jd: body.jd },
  );
});

app.all('/api/*', (c) => fail(c, 404, 'BAD_REQUEST', 'Not found.'));

/** The model never sees contact details or education: it doesn't need them, and they're locked anyway. */
export function tailorPrompt(body: z.infer<typeof TailorRequestSchema> | TailorRequest): string {
  return [
    `RESUME_JSON:\n${wrapData('RESUME_JSON', JSON.stringify(promptResume(body.resume)))}`,
    `JD_PROFILE:\n${wrapData('JD_PROFILE', JSON.stringify(promptJd(body.jd)))}`,
    `GAP_ANALYSIS (GAP terms must never appear):\n${JSON.stringify(body.gap)}`,
    `ALLOWED_TERMS:\n${JSON.stringify(body.allowedTerms)}`,
  ].join('\n\n');
}

/** Same data as tailoring, plus the tone and the candidate's own motivation (wrapped as data). */
export function coverPrompt(body: z.infer<typeof CoverLetterRequestSchema> | CoverLetterRequest): string {
  return [
    tailorPrompt(body),
    `JD_COMPANY: ${JSON.stringify(body.jd.company ?? '')}`,
    `TONE: ${body.tone ?? 'professional'}`,
    `MOTIVATION:\n${wrapData('MOTIVATION', body.motivation ?? '')}`,
  ].join('\n\n');
}

function promptResume(r: z.infer<typeof TailorRequestSchema>['resume']) {
  return {
    headline: r.headline,
    summary: r.summary,
    yearsOfExperience: r.yearsOfExperience,
    skills: r.skills,
    experience: r.experience.map((e) => ({
      id: e.id,
      title: e.title,
      company: e.company,
      dates: `${e.startDate} – ${e.endDate}`,
      bullets: e.bullets.map((b) => ({ id: b.id, text: b.text })),
      ...(e.projects?.length ? { projects: e.projects.map((p) => ({ name: p.name, bullets: p.bullets.map((b) => ({ id: b.id, text: b.text })) })) } : {}),
    })),
    certifications: r.certifications.map((x) => x.name),
  };
}

function promptJd(jd: z.infer<typeof TailorRequestSchema>['jd'] | TailorRequest['jd']) {
  return { title: jd.title, seniority: jd.seniority, domain: jd.domain, mustHave: jd.mustHave, niceToHave: jd.niceToHave, responsibilities: jd.responsibilities };
}
