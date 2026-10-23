import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { javaSdetJdText } from '../tests/fixtures/resumes';

export const fixture = (name: string) => fileURLToPath(new URL(`../tests/fixtures/files/${name}`, import.meta.url));

/** Mock-AI scenarios understood by worker/mock.ts. */
export type Scenario = 'quota' | 'inject' | 'broken-json';

/** Home → upload a resume, paste the JD, continue. Ends on the Confirm screen unless the quota dialog interrupts. */
export async function start(page: Page, opts: { scenario?: Scenario; file?: string; jd?: string } = {}) {
  const file = opts.file ?? 'priya-1col.pdf';
  await page.goto(opts.scenario ? `/?mock=${opts.scenario}` : '/');
  await page.setInputFiles('input[type=file]', fixture(file));
  await expect(page.getByText(file)).toBeVisible();
  await page.getByLabel('Job description').fill(opts.jd ?? javaSdetJdText);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

export async function confirmDetails(page: Page) {
  await expect(page.getByRole('heading', { name: 'Confirm your details' })).toBeVisible();
  await page.getByRole('button', { name: /analyze the job/ }).click();
  await expect(page.getByRole('heading', { name: 'How your resume matches' })).toBeVisible();
}

export async function tailor(page: Page) {
  await page.getByRole('button', { name: /Tailor my resume|Tailor again/ }).click();
  await expect(page.getByRole('heading', { name: 'Review the changes' })).toBeVisible({ timeout: 30_000 });
}

/** Full happy path up to the Review screen. */
export async function toReview(page: Page, opts: Parameters<typeof start>[1] = {}) {
  await start(page, opts);
  await confirmDetails(page);
  await tailor(page);
}

/** Read a score ring ("Before", "After", "ATS score now"). */
export async function score(page: Page, label: string): Promise<number> {
  const aria = await page.locator(`figure[aria-label^="${label}:"]`).getAttribute('aria-label');
  const m = aria?.match(/: (\d+) out of 100/);
  if (!m) throw new Error(`No score ring labelled ${label}`);
  return Number(m[1]);
}

/** Click an export button and return the downloaded file's name and bytes. */
export async function download(page: Page, button: string | RegExp) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button, exact: typeof button === 'string' }).click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), data: await readFile(path) };
}
