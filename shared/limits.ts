/** Input caps (§10). Enforced by the Worker and mirrored in the UI. Kept free of zod so the first screen stays small. */
export const LIMITS = {
  resumeChars: 20_000,
  jdChars: 15_000,
} as const;
