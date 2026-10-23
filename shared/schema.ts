import { z } from 'zod';

/** Input caps (§10). Enforced by the Worker and mirrored in the UI. */
export const LIMITS = {
  resumeChars: 20_000,
  jdChars: 15_000,
} as const;

const str = z.string();
const optStr = z.string().optional();

// LLMs often emit null for "unknown"; accept it at the boundary and normalise to ''/undefined.
const looseStr = z
  .string()
  .nullish()
  .transform((v) => v ?? '');
const looseOptStr = z
  .string()
  .nullish()
  .transform((v) => (v == null || v === '' ? undefined : v));

export const LinkSchema = z.object({ label: str, url: str });
export type Link = z.infer<typeof LinkSchema>;

export const ContactSchema = z.object({
  name: str,
  email: str,
  phone: str,
  location: str,
  links: z.array(LinkSchema),
});
export type Contact = z.infer<typeof ContactSchema>;

export const BulletSchema = z.object({
  id: str,
  text: str,
  locked: z.boolean().optional(),
});
export type Bullet = z.infer<typeof BulletSchema>;

export const ProjectSchema = z.object({
  name: optStr,
  client: optStr,
  bullets: z.array(BulletSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ExperienceSchema = z.object({
  id: str,
  company: str,
  title: str,
  location: str,
  startDate: str,
  endDate: str,
  projects: z.array(ProjectSchema).optional(),
  bullets: z.array(BulletSchema),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const EducationSchema = z.object({
  degree: str,
  institution: str,
  location: optStr,
  startDate: optStr,
  endDate: optStr,
  gpa: optStr,
});
export type Education = z.infer<typeof EducationSchema>;

export const CertificationSchema = z.object({
  name: str,
  issuer: optStr,
  date: optStr,
});
export type Certification = z.infer<typeof CertificationSchema>;

export const AwardSchema = z.object({
  name: str,
  year: optStr,
  detail: optStr,
});
export type Award = z.infer<typeof AwardSchema>;

export const SkillGroupSchema = z.object({ group: str, items: z.array(str) });
export type SkillGroup = z.infer<typeof SkillGroupSchema>;

export const ExtraSchema = z.object({ heading: str, items: z.array(str) });
export type Extra = z.infer<typeof ExtraSchema>;

export const ResumeSchema = z.object({
  contact: ContactSchema,
  headline: optStr,
  summary: str,
  yearsOfExperience: str,
  skills: z.array(SkillGroupSchema),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  certifications: z.array(CertificationSchema),
  awards: z.array(AwardSchema),
  extras: z.array(ExtraSchema).optional(),
});
export type ResumeJSON = z.infer<typeof ResumeSchema>;

/* ------------------------------------------------------------------ */
/* /api/extract output: same shape without ids, plus _uncertain flags  */
/* ------------------------------------------------------------------ */

const uncertain = z.boolean().optional().catch(undefined);

export const ExtractedResumeSchema = z.object({
  contact: z.object({
    name: looseStr,
    email: looseStr,
    phone: looseStr,
    location: looseStr,
    links: z.array(z.object({ label: looseStr, url: looseStr })).default([]),
    _uncertain: uncertain,
  }),
  headline: looseOptStr,
  summary: looseStr,
  yearsOfExperience: looseStr,
  skills: z.array(z.object({ group: looseStr, items: z.array(str).default([]) })).default([]),
  experience: z
    .array(
      z.object({
        company: looseStr,
        title: looseStr,
        location: looseStr,
        startDate: looseStr,
        endDate: looseStr,
        projects: z
          .array(z.object({ name: looseOptStr, client: looseOptStr, bullets: z.array(str).default([]) }))
          .optional(),
        bullets: z.array(str).default([]),
        _uncertain: uncertain,
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        degree: looseStr,
        institution: looseStr,
        location: looseOptStr,
        startDate: looseOptStr,
        endDate: looseOptStr,
        gpa: looseOptStr,
        _uncertain: uncertain,
      }),
    )
    .default([]),
  certifications: z
    .array(z.object({ name: looseStr, issuer: looseOptStr, date: looseOptStr, _uncertain: uncertain }))
    .default([]),
  awards: z
    .array(z.object({ name: looseStr, year: looseOptStr, detail: looseOptStr, _uncertain: uncertain }))
    .default([]),
  extras: z.array(z.object({ heading: looseStr, items: z.array(str).default([]) })).optional(),
});
export type ExtractedResume = z.infer<typeof ExtractedResumeSchema>;
export type ExtractedResumeInput = z.input<typeof ExtractedResumeSchema>;

/* ------------------------------------------------------------------ */
/* JD profile                                                          */
/* ------------------------------------------------------------------ */

const weight = z.coerce
  .number()
  .catch(2)
  .transform((n) => Math.min(3, Math.max(1, Math.round(n))));

export const TermSchema = z.object({
  canonical: str,
  surface: str,
  weight,
});
export type Term = z.infer<typeof TermSchema>;

export const JDProfileSchema = z.object({
  title: looseStr,
  seniority: looseStr,
  domain: looseStr,
  company: looseOptStr,
  mustHave: z.array(TermSchema).default([]),
  niceToHave: z.array(TermSchema).default([]),
  responsibilities: z.array(str).default([]),
  softSkills: z.array(str).default([]),
  keywords: z.array(TermSchema).default([]),
});
export type JDProfile = z.infer<typeof JDProfileSchema>;

/* ------------------------------------------------------------------ */
/* Tailor response                                                     */
/* ------------------------------------------------------------------ */

export const TailorResponseSchema = z.object({
  summary: str,
  skills: z.array(SkillGroupSchema),
  bulletEdits: z
    .array(
      z.object({
        bulletId: str,
        newText: str,
        reason: looseStr,
        jdTermsUsed: z.array(str).default([]),
      }),
    )
    .default([]),
  bulletOrder: z.array(z.object({ roleId: str, bulletIds: z.array(str) })).default([]),
  headline: looseOptStr.optional(),
  metricQuestions: z.array(z.object({ bulletId: str, question: str })).default([]),
  notes: z.array(str).default([]),
});
export type TailorResponse = z.infer<typeof TailorResponseSchema>;

/* ------------------------------------------------------------------ */
/* Gap analysis                                                        */
/* ------------------------------------------------------------------ */

export type GapStatus = 'matched' | 'synonym' | 'hidden' | 'gap';

export interface GapItem {
  canonical: string;
  /** JD wording. */
  surface: string;
  weight: number;
  importance: 'must' | 'nice' | 'keyword';
  status: GapStatus;
  /** How the resume phrases it (for synonym / hidden). */
  resumeSurface?: string;
}

export interface GapAnalysis {
  items: GapItem[];
  matched: GapItem[];
  synonym: GapItem[];
  hidden: GapItem[];
  gap: GapItem[];
}

/* ------------------------------------------------------------------ */
/* API request bodies                                                  */
/* ------------------------------------------------------------------ */

export const ProviderSchema = z.enum(['workers-ai', 'openai', 'anthropic', 'gemini']);
export type ProviderId = z.infer<typeof ProviderSchema>;

export const ByokSchema = z
  .object({
    provider: ProviderSchema.exclude(['workers-ai']),
    apiKey: z.string().min(8).max(300),
    model: z.string().max(100).optional(),
  })
  .optional();
export type Byok = z.infer<typeof ByokSchema>;

const common = {
  byok: ByokSchema,
  /** 'json' = non-streaming JSON mode, used for the one automatic retry. */
  mode: z.enum(['stream', 'json']).default('stream'),
  retryReason: z.string().max(500).optional(),
};

export const ExtractRequestSchema = z.object({
  resumeText: z.string().min(50).max(LIMITS.resumeChars),
  ...common,
});
export type ExtractRequest = z.input<typeof ExtractRequestSchema>;

export const AnalyzeRequestSchema = z.object({
  jdText: z.string().min(50).max(LIMITS.jdChars),
  ...common,
});
export type AnalyzeRequest = z.input<typeof AnalyzeRequestSchema>;

export const TailorRequestSchema = z.object({
  resume: ResumeSchema,
  jd: JDProfileSchema,
  gap: z.object({
    matched: z.array(z.string()).max(100),
    synonym: z.array(z.object({ jd: z.string(), resume: z.string() })).max(100),
    hidden: z.array(z.string()).max(100),
    gap: z.array(z.string()).max(100),
  }),
  allowedTerms: z.array(z.string().max(80)).max(400),
  ...common,
});
export type TailorRequest = z.input<typeof TailorRequestSchema>;

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'TOO_LARGE'
  | 'TURNSTILE'
  | 'RATE_LIMITED'
  | 'DAILY_QUOTA'
  | 'AI_QUOTA'
  | 'PROVIDER'
  | 'FORBIDDEN_ORIGIN'
  | 'INTERNAL';
