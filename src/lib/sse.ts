import type { ProviderId } from '@shared/schema';

/**
 * Incremental decoder for the providers' streaming formats. The Worker passes provider streams
 * through untouched (to stay within the 10 ms CPU budget), so normalisation happens here.
 */
export class SseTextDecoder {
  private buffer = '';
  private decoder = new TextDecoder();
  text = '';

  constructor(private provider: ProviderId = 'workers-ai') {}

  /** Feed raw bytes; returns the text delta extracted from complete events. */
  push(chunk: Uint8Array | string): string {
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });
    let delta = '';
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      delta += this.line(line);
    }
    this.text += delta;
    return delta;
  }

  /** Flush any final unterminated line. */
  end(): string {
    const delta = this.buffer ? this.line(this.buffer) : '';
    this.buffer = '';
    this.text += delta;
    return delta;
  }

  private line(line: string): string {
    if (!line.startsWith('data:')) return '';
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return '';
    let obj: unknown;
    try {
      obj = JSON.parse(data);
    } catch {
      return '';
    }
    return deltaText(this.provider, obj);
  }
}

export function deltaText(provider: ProviderId, obj: unknown): string {
  const o = obj as Record<string, unknown>;
  switch (provider) {
    case 'anthropic': {
      // Only text deltas: thinking deltas and fallback markers are not part of the answer.
      const d = o.delta as { type?: string; text?: string } | undefined;
      return o.type === 'content_block_delta' && d?.type === 'text_delta' ? (d.text ?? '') : '';
    }
    case 'gemini': {
      const parts = (o.candidates as { content?: { parts?: { text?: string; thought?: boolean }[] } }[] | undefined)?.[0]?.content?.parts ?? [];
      return parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
    }
    case 'openai':
      return openAiDelta(o);
    default:
      // Workers AI: legacy {"response": "..."} or OpenAI-compatible chunks.
      return typeof o.response === 'string' ? o.response : openAiDelta(o);
  }
}

function openAiDelta(o: Record<string, unknown>): string {
  const c = (o.choices as { delta?: { content?: string | null } }[] | undefined)?.[0]?.delta?.content;
  return typeof c === 'string' ? c : '';
}

/** Pull the JSON object out of a model reply (tolerates ```json fences and chatter around it). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SyntaxError('No JSON object in the response.');
  return JSON.parse(body.slice(start, end + 1));
}
