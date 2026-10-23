/** Minimal binding interfaces (structurally compatible with @cloudflare/workers-types). */
export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface RateLimiterLike {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  AI?: AiBinding;
  /** Daily per-IP-hash quota counter (optional). */
  QUOTA_KV?: KVLike;
  /** Workers Rate Limiting binding (optional, burst protection). */
  RATE_LIMITER?: RateLimiterLike;
  TURNSTILE_SECRET?: string;
  IP_HASH_SALT?: string;
  /** Comma-separated extra origins allowed for CORS (same-origin is always allowed). */
  ALLOWED_ORIGINS?: string;
  /** Workers AI calls per IP hash per day (default 15). */
  DAILY_LIMIT?: string;
  MODEL_EXTRACT?: string;
  MODEL_ANALYZE?: string;
  MODEL_TAILOR?: string;
  /** "1" = deterministic mock AI (dev / E2E only). Never set in production. */
  MOCK_AI?: string;
}

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
