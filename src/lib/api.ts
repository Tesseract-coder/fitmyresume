import { z } from 'zod';
import {
  CoverLetterResponseSchema,
  ExtractedResumeSchema,
  InterviewResponseSchema,
  LinkedInResponseSchema,
  JDProfileSchema,
  TailorResponseSchema,
  type AnalyzeRequest,
  type ApiErrorCode,
  type CoverLetterRequest,
  type InterviewRequest,
  type LinkedInRequest,
  type ExtractRequest,
  type ProviderId,
  type TailorRequest,
} from '@shared/schema';
import { byokPayload } from './byok';
import { SseTextDecoder, extractJson } from './sse';
import { ApiError } from './api-error';
import { getTurnstileToken } from './turnstile';

export { ApiError };


export interface CallOptions {
  onProgress?: (chars: number) => void;
  signal?: AbortSignal;
  /** E2E only: selects a mock-AI scenario on the dev server. */
  mockScenario?: string;
}

async function post(path: string, body: unknown, opts: CallOptions): Promise<Response> {
  const token = await getTurnstileToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'cf-turnstile-response': token } : {}),
        ...(opts.mockScenario ? { 'x-fmr-mock': opts.mockScenario } : {}),
      },
      body: JSON.stringify(body),
      signal: opts.signal ?? null,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('NETWORK', "Couldn't reach the server. Check your connection, or use offline mode.");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code: ApiErrorCode; message: string } } | null;
    throw new ApiError(data?.error?.code ?? 'INTERNAL', data?.error?.message ?? `Request failed (${res.status}).`, res.status);
  }
  return res;
}

async function readText(res: Response, opts: CallOptions): Promise<string> {
  if (!res.headers.get('content-type')?.includes('text/event-stream')) {
    return ((await res.json()) as { text: string }).text;
  }
  const decoder = new SseTextDecoder((res.headers.get('x-fmr-provider') as ProviderId | null) ?? 'workers-ai');
  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    decoder.push(value);
    opts.onProgress?.(decoder.text.length);
  }
  decoder.end();
  return decoder.text;
}

function summarize(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return err instanceof Error ? err.message : 'invalid output';
}

/**
 * Streamed call → JSON → zod. On a parse/schema failure, retry exactly once in the provider's
 * non-streaming JSON mode, telling the model what was wrong (§3: "one automatic retry").
 * `first: 'json'` skips streaming for long verbatim outputs (extraction): unconstrained streams of
 * that size came back as malformed JSON from Llama 3.3, so the stream attempt was wasted.
 */
async function task<T extends z.ZodType>(path: string, body: Record<string, unknown>, schema: T, opts: CallOptions, first: 'stream' | 'json' = 'stream'): Promise<z.infer<T>> {
  const byok = byokPayload();
  const payload = { ...body, ...(byok ? { byok } : {}) };
  let firstError: unknown;
  try {
    const text = await readText(await post(path, { ...payload, mode: first }, opts), opts);
    return schema.parse(extractJson(text));
  } catch (err) {
    if (err instanceof ApiError || (err as Error).name === 'AbortError') throw err;
    firstError = err;
  }
  try {
    const res = await post(path, { ...payload, mode: 'json', retryReason: summarize(firstError) }, opts);
    return schema.parse(extractJson(await readText(res, opts)));
  } catch (err) {
    if (err instanceof ApiError || (err as Error).name === 'AbortError') throw err;
    throw new ApiError('INVALID_OUTPUT', 'The AI returned data we could not use, even after a retry. Try again or use offline mode.');
  }
}

export const api = {
  extract: (body: Omit<ExtractRequest, 'mode' | 'byok'>, opts: CallOptions = {}) => task('/api/extract', body, ExtractedResumeSchema, opts, 'json'),
  analyzeJd: (body: Omit<AnalyzeRequest, 'mode' | 'byok'>, opts: CallOptions = {}) => task('/api/analyze-jd', body, JDProfileSchema, opts),
  tailor: (body: Omit<TailorRequest, 'mode' | 'byok'>, opts: CallOptions = {}) => task('/api/tailor', body as Record<string, unknown>, TailorResponseSchema, opts),
  coverLetter: (body: Omit<CoverLetterRequest, 'mode' | 'byok'>, opts: CallOptions = {}) =>
    task('/api/cover-letter', body as Record<string, unknown>, CoverLetterResponseSchema, opts),
  linkedin: (body: Omit<LinkedInRequest, 'mode' | 'byok'>, opts: CallOptions = {}) => task('/api/linkedin', body as Record<string, unknown>, LinkedInResponseSchema, opts),
  interview: (body: Omit<InterviewRequest, 'mode' | 'byok'>, opts: CallOptions = {}) => task('/api/interview', body as Record<string, unknown>, InterviewResponseSchema, opts),
  async health(): Promise<{ ai: boolean; mock: boolean; turnstile: boolean; byokDefaults: Record<string, string> } | undefined> {
    try {
      const res = await fetch('/api/health');
      return res.ok ? await res.json() : undefined;
    } catch {
      return undefined;
    }
  },
};
