import type { Byok, ProviderId } from '../shared/schema';
import { JSON_SCHEMAS, MAX_TOKENS, type TaskName } from '../shared/prompts';
import { DEFAULT_MODEL, type Env } from './env';

/**
 * Provider adapters. Streaming responses are passed through byte-for-byte (the browser decodes
 * each provider's SSE format), which keeps Worker CPU near zero on the 10 ms free tier.
 */

export const BYOK_DEFAULT_MODELS: Record<Exclude<ProviderId, 'workers-ai'>, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5.5',
  gemini: 'gemini-3.5-flash',
};

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'AI_QUOTA' | 'PROVIDER' = 'PROVIDER',
  ) {
    super(message);
  }
}

export interface LlmCall {
  task: TaskName;
  system: string;
  user: string;
  mode: 'stream' | 'json';
  byok?: Byok;
}

const SSE_HEADERS = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' };

export async function callLlm(env: Env, call: LlmCall): Promise<Response> {
  const provider: ProviderId = call.byok?.provider ?? 'workers-ai';
  const res = provider === 'workers-ai' ? await workersAi(env, call) : await byok(call);
  res.headers.set('x-fmr-provider', provider);
  return res;
}

function modelFor(env: Env, task: TaskName): string {
  return (task === 'extract' ? env.MODEL_EXTRACT : task === 'analyze' ? env.MODEL_ANALYZE : env.MODEL_TAILOR) || DEFAULT_MODEL;
}

async function workersAi(env: Env, call: LlmCall): Promise<Response> {
  if (!env.AI) throw new ProviderError('Workers AI binding is not configured.', 503);
  const messages = [
    { role: 'system', content: call.system },
    { role: 'user', content: call.user },
  ];
  try {
    if (call.mode === 'stream') {
      const stream = await env.AI.run(modelFor(env, call.task), { messages, max_tokens: MAX_TOKENS[call.task], stream: true, temperature: 0.2 });
      return new Response(stream as ReadableStream, { headers: SSE_HEADERS });
    }
    // JSON mode (no streaming support): used for the single automatic retry.
    const out = (await env.AI.run(modelFor(env, call.task), {
      messages,
      max_tokens: MAX_TOKENS[call.task],
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: JSON_SCHEMAS[call.task] },
    })) as { response?: unknown };
    const text = typeof out.response === 'string' ? out.response : JSON.stringify(out.response ?? {});
    return Response.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/4006|daily free allocation|neurons/i.test(msg)) {
      throw new ProviderError('The free daily AI allowance is used up.', 429, 'AI_QUOTA');
    }
    if (/JSON Mode couldn't be met/i.test(msg)) throw new ProviderError('The model could not produce valid JSON.', 502);
    throw new ProviderError('The AI service failed. Please try again.', 502);
  }
}

async function byok(call: LlmCall): Promise<Response> {
  const b = call.byok!;
  const model = b.model || BYOK_DEFAULT_MODELS[b.provider];
  const stream = call.mode === 'stream';
  let req: Request;
  switch (b.provider) {
    case 'anthropic':
      req = new Request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': b.apiKey,
          'anthropic-version': '2026-10-21',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16000,
          system: call.system,
          messages: [{ role: 'user', content: call.user }],
          fallbacks: 'default',
          stream,
        }),
      });
      break;
    case 'openai':
      req = new Request('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${b.apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: call.system },
            { role: 'user', content: call.user },
          ],
          max_completion_tokens: 16000,
          stream,
          ...(stream ? {} : { response_format: { type: 'json_object' } }),
        }),
      });
      break;
    case 'gemini': {
      const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
      req = new Request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': b.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: call.system }] },
          contents: [{ role: 'user', parts: [{ text: call.user }] }],
          generationConfig: { maxOutputTokens: 16000, responseMimeType: 'application/json' },
        }),
      });
      break;
    }
  }
  const res = await fetch(req);
  if (!res.ok) {
    // Never echo provider bodies (they can contain request fragments); map to a safe message.
    const status = res.status === 401 || res.status === 403 ? 401 : res.status === 429 ? 429 : 502;
    throw new ProviderError(
      status === 401 ? `Your ${b.provider} API key was rejected.` : status === 429 ? `Your ${b.provider} account is rate-limited or out of credit.` : `${b.provider} returned an error (${res.status}).`,
      status,
    );
  }
  if (stream) return new Response(res.body, { headers: SSE_HEADERS });
  return Response.json({ text: textOf(b.provider, await res.json()) });
}

function textOf(provider: Exclude<ProviderId, 'workers-ai'>, body: unknown): string {
  const b = body as Record<string, unknown>;
  if (provider === 'anthropic') {
    const content = (b.content as { type: string; text?: string }[] | undefined) ?? [];
    return content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  }
  if (provider === 'openai') {
    return ((b.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content ?? '') as string;
  }
  const parts = (b.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}
