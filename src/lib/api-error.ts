import type { ApiErrorCode } from '@shared/schema';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'NETWORK' | 'INVALID_OUTPUT',
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
  /** Errors where offline mode or a BYOK key is the right next step. */
  get isQuota() {
    return this.code === 'AI_QUOTA' || this.code === 'DAILY_QUOTA';
  }
}
