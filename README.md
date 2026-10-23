# FitMyResume

Tailor a resume to a job description, **honestly**. FitMyResume rewrites your summary, bullets and skills in the job's vocabulary, scores the result like an ATS would, and exports clean DOCX / PDF / TXT. It never invents skills, numbers, titles or dates — and that's enforced in code, not just asked of the AI.

- Mobile-first, installable PWA (React + Vite + Tailwind)
- Thin Cloudflare Worker (Hono) proxying Workers AI, or your own Anthropic / OpenAI / Gemini key
- Parsing, validation, scoring and export all run **in the browser**; nothing is stored on the server
- **Cover letters** built from the same evidence and checked by the same validator
- **Skills-gap coach**: what transfers, an honest learning plan, and cover-letter / interview phrasing for each gap
- **LinkedIn sync helper**: headline, About, skills and experience text consistent with your tailored resume
- Runs on the Cloudflare **free tier**, with an offline (no-AI) mode when the daily allowance runs out

---

## How it works

```
Browser                                                   Worker (/api/*)          LLM
───────                                                   ───────────────          ───
1. Parse PDF/DOCX/TXT (pdf.js, mammoth)
2. Extract → ResumeJSON ─────────────────────────────────▶ /api/extract ─────────▶ Workers AI
   "Confirm your details" → user-confirmed LOCKED baseline                         or BYOK
3. Analyze JD → JDProfile ───────────────────────────────▶ /api/analyze-jd ──────▶
4. Evidence index + ontology → gap analysis (deterministic)
5. Tailor (with ALLOWED_TERMS + GAP list) ───────────────▶ /api/tailor (SSE) ────▶
6. validateTailoredResume(): revert anything not backed by evidence
7. Score before/after → Review (diff, accept/reject, metric questions)
8. Export DOCX / PDF / TXT
```

**The LLM proposes; deterministic code disposes.** After every AI response, `shared/validator.ts`:

| Check | On violation |
|---|---|
| Locked fields (contact, employers, titles, dates, years, education, certs, awards) are byte-identical | Restored |
| Every tech term is in the evidence index (after alias normalisation: `K8s → Kubernetes`, but never `Java ↔ JavaScript`) | Bullet/summary reverted, skill removed |
| Every number already exists in the resume (or was typed by the user) | Reverted |
| Role count, order and identity unchanged | Restored |
| No seniority/ownership inflation, JD copying or keyword stuffing | Reverted or flagged |

Blocked changes are shown to the user in a **Blocked changes** drawer. When a bullet would be stronger with a metric, the app *asks* — only numbers the user types enter the resume.

## Cover letters

From **Review** or **Export**, *Write a cover letter* drafts a letter for the same job. The rules mirror the resume:

- The AI writes only the body. Greeting, date, sign-off, name and contact come from your locked resume fields.
- Every sentence goes through `validateProse()` (the same checks as the summary): unevidenced skills, new numbers, changed years, inflated seniority or ownership, and text copied from the job post are **removed**, and listed under *Blocked sentences*. The job title and hiring company may be named because they describe the job, not you.
- **Why this company?** is in your own words and is the only source of motivation. It adds words and numbers to the evidence, never technologies.
- Gap skills are never claimed. You can tick a gap to add one code-written sentence, *"I am also actively building my skills in Java."*
- You can edit the text by hand; your edits are kept as written. Downloads use your resume's template and colours (PDF / DOCX / TXT), named `Firstname_Lastname_Cover_Letter_<Company>.pdf`.

A cover letter is one extra AI call (offline mode works too).

## Skills-gap coach

For every true gap (a skill the job wants that your resume doesn't show), the coach at **Analysis → How to close these gaps** or **Review → Open the skills-gap coach** gives you:

- **What transfers:** skills you really have, from curated skill families (e.g. Selenium → Playwright, Jenkins → GitHub Actions, AWS → Azure) or, for programming languages, general-purpose languages you know. SQL never counts as a stand-in for Java.
- **A learning plan:** official getting-started material (first-party links only), a bridge exercise built on your own work, an optional well-known certification, and a reminder to add the skill on the Confirm screen once it's real.
- **Cover-letter phrasing:** for example *"I bring hands-on experience with Python, and I am actively ramping up on Java."* Turn on **I've started learning** and this line goes into your cover letter (the cover letter's checkboxes stay in sync). It never goes into your resume.
- **An honest interview answer** that admits the gap first.

The coach is fully deterministic (no AI call). Its data lives in `shared/coach.ts` (`FAMILIES`, `RESOURCES`, `CERTIFICATIONS`), and a test checks that every entry refers to a real ontology term.

## LinkedIn sync helper

**Export → LinkedIn profile** writes profile text aimed at the target *kind* of role, kept consistent with your tailored resume:

- **Headline** (≤ 220 characters): your real most recent title, your strongest evidenced skills in the job's wording, and your domain if your resume shows it. An inflated or unverifiable headline is replaced by the offline one.
- **About** (≤ 2,600 characters): first-person prose checked sentence by sentence like the cover letter. Because a profile is public, any sentence naming the company you're applying to is removed ("Names the target company").
- **Optional lines, written by code:** a *Core skills* line for recruiter search, the coach's *ramping up on …* line for skills you've marked as learning, and *I'm open to <role> opportunities*. They apply instantly, without another AI call.
- **Skills:** up to 15 evidenced skills (standard names; aliases like K8s merged), the first three to pin as Top skills.
- **Experience:** each role's tailored bullets, ready to paste into the matching LinkedIn position (≤ 2,000 characters each).

Everything is copy-and-paste. Nothing is posted to LinkedIn for you. It's one extra AI call, and offline mode works too.

## Project layout

```
src/                 React app
  screens/           Home, Confirm, Analysis, Review, Export, CoverLetter, GapCoach, LinkedIn, History
  components/        UI pieces (score ring, diff, keyword chips, dialogs) + ui/ primitives
  lib/               API client (SSE + zod + one retry), store (zustand + IndexedDB), parse/, export/
shared/              Pure TS used by both browser and Worker
  schema.ts          zod schemas: ResumeJSON, JDProfile, TailorResponse, API bodies
  ontology.json/.ts  Skill aliases → canonical names, plus "never alias" pairs
  evidence.ts gap.ts validator.ts score.ts changes.ts pipeline.ts cover.ts coach.ts linkedin.ts
  offline/           Deterministic extract / analyze / tailor / cover letter / LinkedIn (offline mode, dev mock)
  prompts.ts         System prompts + JSON schemas for the LLM
worker/              Hono app: /api/health, /api/extract, /api/analyze-jd, /api/tailor, /api/cover-letter, /api/linkedin
tests/               Vitest unit tests + fixtures (5 sample resumes as real PDF/DOCX)
e2e/                 Playwright: desktop, Pixel 7, iPhone 14, + axe accessibility
scripts/             make-icons.py, make-fixtures.ts, gen-ontology.py
```

## Getting started

Requires **Node ≥ 20.19**.

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run dev` needs **no Cloudflare account**: the Vite dev server runs the real Hono API in-process with a deterministic mock AI (`MOCK_AI=1`). Add `?mock=quota`, `?mock=inject` or `?mock=broken-json` to the URL to try the quota, misbehaving-AI and retry paths.

To run against **real Workers AI** locally:

```bash
npx wrangler login
npm run dev:worker   # builds, then `wrangler dev` (AI calls run remotely and use your allowance)
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server + in-process API with mock AI |
| `npm run dev:worker` | Build, then run the real Worker locally with `wrangler dev` |
| `npm run typecheck` | `tsc -b` across app, worker, tests |
| `npm test` / `npm run coverage` | Vitest (validator must stay at 100% coverage) |
| `npm run e2e` | Playwright on desktop, Pixel 7, iPhone 14 (starts the dev server itself) |
| `npm run build` | Production build into `dist/` (PWA service worker included) |
| `npm run deploy` | Build + `wrangler deploy` |
| `npm run icons` | Regenerate `public/icons` (needs Python + Pillow) |
| `npm run fixtures` | Regenerate the PDF/DOCX test fixtures |
| `npm run check` | Everything: typecheck, coverage, build, e2e |

First E2E run: `npx playwright install chromium webkit`. WebKit (the iPhone 14 project) also needs system libraries on Linux: `sudo npx playwright install-deps webkit`.

## Configuration

### Worker variables (`wrangler.jsonc` → `vars`)

| Variable | Default | Purpose |
|---|---|---|
| `DAILY_LIMIT` | `15` | Free (Workers AI) calls per IP hash per day. Only enforced when `QUOTA_KV` is bound. |
| `ALLOWED_ORIGINS` | `""` | Extra comma-separated CORS origins. Same-origin is always allowed. |
| `MODEL_EXTRACT` / `MODEL_ANALYZE` / `MODEL_TAILOR` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Workers AI model per task. |
| `MOCK_AI` | unset | `1` = deterministic mock. **Dev/E2E only — never set in production.** |

> **Verify the model name** before deploying — the Workers AI catalog changes:
> `npx wrangler ai models | grep -i llama-3.3`

### Worker secrets (`npx wrangler secret put <NAME>`)

| Secret | Purpose |
|---|---|
| `TURNSTILE_SECRET` | Turnstile secret key. When set, every `/api/*` call needs a valid token. |
| `IP_HASH_SALT` | Random string for the salted, daily-rotating IP hash used by quotas. |

### Bindings

| Binding | Required | Notes |
|---|---|---|
| `AI` | Yes (for AI mode) | Workers AI. Already in `wrangler.jsonc`. |
| `RATE_LIMITER` | No | Burst limit: 10 LLM calls / minute per IP hash. Already in `wrangler.jsonc`. |
| `QUOTA_KV` | No | Daily per-IP quota counter. `npx wrangler kv namespace create QUOTA_KV`, then uncomment `kv_namespaces` in `wrangler.jsonc` and paste the id. |

### Frontend (build-time)

| Variable | Purpose |
|---|---|
| `VITE_TURNSTILE_SITE_KEY` | Turnstile site key. Unset = no Turnstile (fine for local dev). |

## Deploying

### First deploy from your machine

```bash
npx wrangler login

# Optional but recommended: daily quota counter
npx wrangler kv namespace create QUOTA_KV      # paste the id into wrangler.jsonc (kv_namespaces)

# Secrets
npx wrangler secret put IP_HASH_SALT           # any long random string, e.g. `openssl rand -hex 32`
npx wrangler secret put TURNSTILE_SECRET       # optional, see below

# Build with the Turnstile site key (if using Turnstile) and deploy
VITE_TURNSTILE_SITE_KEY=<site-key> npm run deploy
```

The app is served at `https://fitmyresume.<your-subdomain>.workers.dev`. To use a custom domain, add it under **Workers & Pages → fitmyresume → Settings → Domains & Routes**, and add it to `ALLOWED_ORIGINS` only if the API is called from a *different* origin.

### Turnstile (abuse protection)

1. Cloudflare dashboard → **Turnstile** → add a widget for your domain (mode: *Invisible* / *Managed*).
2. `npx wrangler secret put TURNSTILE_SECRET` with the **secret key**.
3. Build with `VITE_TURNSTILE_SITE_KEY=<site key>` (locally, or as a GitHub Actions variable).

### Continuous deployment (GitHub Actions)

`.github/workflows/ci.yml` runs typecheck, unit tests + coverage, build and the Playwright suite on every push and PR. On pushes to `main` it then deploys with `wrangler deploy`. In the repo's **Settings → Secrets and variables → Actions**, add:

| Name | Kind | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Secret | API token from the "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Your account id (dashboard sidebar) |
| `VITE_TURNSTILE_SITE_KEY` | Variable | Optional |

Without the two secrets, the deploy job is skipped with a notice and CI stays green.

## Free-tier limits

Check the current numbers in the Cloudflare docs; at the time of writing:

| Limit | Value | How the app handles it |
|---|---|---|
| Workers requests | ~100,000 / day | Static assets don't run the Worker (`run_worker_first: ["/api/*"]`); only AI calls do. |
| Worker CPU time | 10 ms / request | The Worker only validates and proxies; waiting on the AI doesn't count. Parsing, validation, scoring and export happen in the browser. Streams are passed through without re-encoding. |
| Workers AI | 10,000 neurons / day (account-wide) | A 70B-model tailoring costs a noticeable share, so expect a limited number of AI runs per day. When exhausted, users see **"Daily free limit reached"** with two ways forward: **offline mode** (deterministic rules, same validator) or **their own API key**. |
| Per-user fairness | `DAILY_LIMIT` per IP hash, 10 / min burst | Needs `QUOTA_KV` for the daily cap. BYOK calls don't count. |

A full tailoring is 3 AI calls (extract, analyze, tailor). Re-tailoring the same resume against the same job reuses the first two.

## Bring your own key (BYOK)

Users can open **Settings** and pick Anthropic, OpenAI or Gemini, with an optional model override. The key:

- is kept in memory, or in this browser's `localStorage` only if the user ticks *Remember* (with a visible warning);
- is sent with each request and forwarded by the Worker to the provider; it's **never stored or logged** server-side;
- bypasses the free daily quota (the burst limit and Turnstile still apply).

Default models are in `worker/providers.ts` (`BYOK_DEFAULT_MODELS`).

### Adding another provider

1. **`shared/schema.ts`** — add the id to `ProviderSchema` (e.g. `'mistral'`).
2. **`worker/providers.ts`**
   - add a default model to `BYOK_DEFAULT_MODELS`;
   - add a `case` in `byok()` that builds the provider request (system + user prompt, `max_tokens`, `stream`, and JSON mode for `mode: 'json'`);
   - add a branch in `textOf()` to pull the text out of a non-streaming response.
3. **`src/lib/sse.ts`** — add a `case` in `deltaText()` that returns the text delta from one streamed SSE event (OpenAI-compatible APIs can reuse `openAiDelta`).
4. **`src/components/SettingsDialog.tsx`** — add an entry to `PROVIDERS` (label, key placeholder, default model).
5. **Tests** — add a case to `tests/worker.test.ts` with a stubbed `fetch` for the new provider's request and stream format.

The validator doesn't care which model answered: every provider's output goes through the same truthfulness checks.

## Privacy & security

- Resumes and job descriptions are never stored server-side. The Worker never logs request bodies (errors log only the error class).
- IPs are reduced to a salted SHA-256 hash that rotates daily, used only for quotas.
- Saved versions live in **IndexedDB on the user's device** (History screen).
- `/api/*` responses carry `no-store`, `nosniff`, `no-referrer` and a locked-down CSP; CORS is same-origin plus `ALLOWED_ORIGINS`.
- Input caps: resume ≤ 20,000 chars, JD ≤ 15,000 chars, request body ≤ 120 KB.
- Prompt-injection defence: the resume and JD are wrapped in delimiters and labelled as data. The validator is the real safety net — nothing the model writes can add unevidenced skills or numbers.

## Testing

- **Unit (Vitest):** ontology (including "never alias" pairs like Java/JavaScript), gap analysis, validator golden tests (Python-only candidate + Java JD → no Java; fake "improved by 40%" → reverted; changed title/dates → restored; K8s ↔ Kubernetes; hidden skill promoted), score determinism, PDF/DOCX parsing fixtures, export text-layer order, Worker routes.
- **E2E (Playwright):** the full happy path, cover letters (fabrication blocking, opt-in learning note, edits), metric questions, accept/reject, reload persistence, misbehaving-AI blocking, JSON retry, quota → offline / BYOK, file errors, history, and axe WCAG 2.1 AA scans of every screen in light and dark mode — on desktop Chrome, Pixel 7 and iPhone 14.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Workers AI binding is not configured" | You're on `wrangler dev` without login, or the `ai` binding was removed. Run `npx wrangler login`. |
| "Human verification failed" | `TURNSTILE_SECRET` is set but the build has no/the wrong `VITE_TURNSTILE_SITE_KEY`. |
| "This PDF has no selectable text" | Scanned/image PDF. Export it as a text PDF or DOCX, or paste the text. |
| Daily limit reached immediately | `DAILY_LIMIT` too low, or the account-wide Workers AI allowance is used up. Use offline mode or BYOK. |
| iPhone 14 E2E project fails to launch locally | `sudo npx playwright install-deps webkit` |
